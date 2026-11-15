import io
import math
import re
import struct
import wave
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright
from userscript_fixture import ROOT, browser_options, serve_site, userscript_source


def tone(hz):
    data = io.BytesIO()
    with wave.open(data, 'wb') as out:
        out.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
        second = b''.join(
            struct.pack('<h', round(10000 * math.sin(2 * math.pi * hz * i / 16000)))
            for i in range(16000)
        )
        out.writeframes(second * 35)
    return data.getvalue()


def start_both_decks(page):
    a = page.get_by_role('region', name='Deck A', exact=True)
    b = page.get_by_role('region', name='Deck B', exact=True)
    a.locator('input[type=file]').set_input_files(
        {'name': 'Bass.wav', 'mimeType': 'audio/wav', 'buffer': tone(220)}
    )
    expect(a.get_by_role('heading', name='Bass.wav')).to_be_visible()
    b.get_by_label('SoundCloud track URL').fill('https://soundcloud.com/artist/bright')
    b.get_by_role('button', name='Load', exact=True).click()
    expect(b.get_by_role('heading', name='Bright')).to_be_visible()
    a.get_by_role('button', name='Play deck A').click()
    b.get_by_role('button', name='Play deck B').click()
    return a, b


server, base = serve_site()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            **browser_options(), headless=True, args=['--mute-audio']
        )
        page = browser.new_page(viewport={'width': 1150, 'height': 810})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))

        def routes(page):
            page.route(
                '**/api/resolve?*',
                lambda r: r.fulfill(
                    json={
                        'title': 'Bright',
                        'artist': 'Artist',
                        'duration': 35,
                        'permalink': 'https://soundcloud.com/artist/bright',
                        'stream': base + 'right.wav',
                        'format': 'audio',
                        'preview': False,
                    },
                    headers={'Access-Control-Allow-Origin': '*'},
                ),
            )
            pcm = tone(660)
            page.route(
                '**/right.wav',
                lambda r: r.fulfill(
                    body=pcm,
                    content_type='audio/wav',
                    headers={'Access-Control-Allow-Origin': '*'},
                ),
            )

        routes(page)
        page.add_init_script("""(() => {
      const connect = AudioNode.prototype.connect; let analyser;
      window.mixerBands = () => {
        if (!analyser) return [0,0];
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        return [220,660].map(hz => {
          let re=0, im=0;
          for(let i=0;i<data.length;i++){const a=2*Math.PI*hz*i/analyser.context.sampleRate;
            re+=data[i]*Math.cos(a);im+=data[i]*Math.sin(a);}
          return 2*Math.hypot(re,im)/data.length;
        });
      };
      AudioNode.prototype.connect = function(dest,...args){
        if(dest instanceof AudioDestinationNode){
          if(!analyser){analyser=this.context.createAnalyser();analyser.fftSize=4096;
            const mute=this.context.createGain();mute.gain.value=0;connect.call(analyser,mute);connect.call(mute,dest);}
          connect.call(this,analyser);
        }
        return connect.call(this,dest,...args);
      };
    })()""")
        page.goto(base + 'mixer/')
        a, b = start_both_decks(page)
        fader = page.get_by_role('slider', name='Crossfader')
        page.wait_for_function('mixerBands()[0]>.12 && mixerBands()[1]<.01')
        fader.press('End')
        page.wait_for_function('mixerBands()[1]>.12 && mixerBands()[0]<.01')
        fader.focus()
        for _ in range(5):
            fader.press('PageDown')
        if float(fader.input_value()) != 0.5:
            fader.press('Home')
            for _ in range(50):
                fader.press('ArrowRight')
        page.wait_for_function('mixerBands().every(v=>v>.085 && v<.13)')
        a.get_by_role('button', name='Pause deck A').click()
        page.wait_for_function('mixerBands()[0]<.01 && mixerBands()[1]>.08')
        b.get_by_role('slider', name='Deck B position').press('Home')
        b.get_by_role('slider', name='Deck B pitch').press('ArrowLeft')
        b.get_by_role('slider', name='Deck B pitch').press('ArrowLeft')
        expect(b.get_by_role('button', name='Pause deck B')).to_be_visible()
        for width in [360, 620, 768, 1200]:
            page.set_viewport_size({'width': width, 'height': 800})
            assert page.evaluate(
                'document.documentElement.scrollWidth<=innerWidth+1'
            ), width
        assert not errors, errors
        page.close()
        # Exercise the shipped plugin launcher in a SoundCloud-origin fixture.
        page = browser.new_page(viewport={'width': 1200, 'height': 850})
        page.add_init_script(userscript_source())
        page.route(
            'https://soundcloud.com/artist/track',
            lambda r: r.fulfill(
                path=ROOT / 'tests/fixtures/inline-fixture.html',
                content_type='text/html',
            ),
        )
        published_base = 'https://itslush.github.io/soundcloud-track-control/'

        def published(route):
            relative = urlsplit(route.request.url).path.removeprefix(
                '/soundcloud-track-control/'
            )
            path = ROOT / 'dist/site' / relative
            if path.is_dir():
                path = path / 'index.html'
            if path.is_file():
                route.fulfill(path=path)
            else:
                route.abort()

        page.route(published_base + '**', published)
        page.goto('https://soundcloud.com/artist/track')
        routes(page)
        launcher = page.get_by_role('button', name=re.compile('Two-deck mixer'))
        launcher.click()
        panel = page.get_by_role('region', name='Two-deck mixer')
        expect(panel).to_be_visible()
        frame = page.frame_locator('iframe[title="Two mixer decks"]')
        expect(frame.get_by_role('region', name='Deck A', exact=True)).to_be_visible()
        page.locator('main').evaluate("""main => { const row=document.createElement('div');
          row.className='sound'; row.innerHTML='<a class="soundTitle__title" href="/artist/bright">Bright</a>';
          const tile=document.createElement('div'); tile.className='playableTile'; tile.innerHTML='<a class="playableTile__mainHeading" href="/artist/other">Other</a>';
          main.append(row, tile); }""")
        page.locator('.playableTile__mainHeading').focus()
        page.locator('.soundTitle__title').hover()
        page.keyboard.press('Alt+Shift+Digit2')
        deck = frame.get_by_role('region', name='Deck B', exact=True)
        expect(deck.get_by_role('heading', name='Bright')).to_be_visible(timeout=20000)
        expect(deck.get_by_role('button', name='Play deck B')).to_be_enabled()
        expect(deck.get_by_label('SoundCloud track URL')).to_have_value('https://soundcloud.com/artist/bright')
        # SoundCloud may recycle the hovered row while a different track still has focus.
        page.locator('.soundTitle__title').evaluate('link => link.closest(".sound").remove()')
        page.keyboard.press('Alt+Shift+Digit1')
        expect(frame.get_by_role('region', name='Deck A', exact=True).get_by_label('SoundCloud track URL')).to_have_value('https://soundcloud.com/artist/other')
        page.locator('.playableTile__mainHeading').hover()
        page.locator('#other-input').focus()
        page.keyboard.press('Alt+Shift+Digit2')
        expect(deck.get_by_label('SoundCloud track URL')).to_have_value('https://soundcloud.com/artist/bright')
        page.locator('#other-input').evaluate('el => el.blur()')
        page.mouse.move(1, 1)
        page.locator('.playableTile__mainHeading').hover()
        page.keyboard.press('Alt+Shift+Digit1')
        expect(frame.get_by_role('region', name='Deck A', exact=True).get_by_label('SoundCloud track URL')).to_have_value('https://soundcloud.com/artist/other')
        assert frame.locator('audio').evaluate_all('nodes => nodes.every(audio => audio.paused)')
        deck.get_by_role('button', name='Play deck B').click()
        expect(deck.get_by_role('button', name='Pause deck B')).to_be_visible()
        page.get_by_role('button', name='Collapse').click()
        expect(panel).to_be_hidden()
        launcher.click()
        expect(deck.get_by_role('button', name='Pause deck B')).to_be_visible()
        page.route('https://soundcloud.com/n/artist/child', lambda r: r.fulfill(
            body='<section aria-label="Track header"><button>Child track</button></section>', content_type='text/html'))
        page.evaluate("""() => { const frame=document.createElement('iframe'); frame.src='/n/artist/child'; document.body.append(frame); }""")
        child = page.frame_locator('iframe[src="/n/artist/child"]')
        child.get_by_role('button', name='Child track').focus()
        page.keyboard.press('Alt+Shift+Digit1')
        expect(frame.get_by_role('region', name='Deck A', exact=True).get_by_label('SoundCloud track URL')).to_have_value('https://soundcloud.com/artist/child')
        page.locator('#soundcloud-tempo-control').evaluate('el => el.remove()')
        expect(page.locator('#soundcloud-tempo-control')).to_have_count(1, timeout=10000)
        expect(deck.get_by_role('button', name='Pause deck B')).to_be_visible()
        frame.get_by_role('button', name='Show deck B controls').click()
        expect(frame.get_by_role('slider', name='Deck B tempo')).to_be_visible()
        expect(deck.get_by_role('button', name='Pause deck B')).to_be_visible()
        assert panel.bounding_box()['height'] > 140
        frame.get_by_role('button', name='Hide deck B controls').click()
        expect(frame.get_by_role('slider', name='Deck B tempo')).to_be_hidden()
        expect(deck.get_by_role('button', name='Pause deck B')).to_be_visible()
        page.locator('body').evaluate("el => {el.classList.add('light')}")
        expect(frame.locator('html')).to_have_attribute('data-theme', 'light')
        page.wait_for_timeout(500)
        page.screenshot(path=str(ROOT / 'test-results/mixer-dock-light.png'))
        page.locator('body').evaluate("el => {el.classList.remove('light'); document.querySelector('.playControls').style.background='#000'}")
        expect(frame.locator('html')).to_have_attribute('data-theme', 'oled')
        page.screenshot(path=str(ROOT / 'test-results/mixer-dock-oled.png'))
        for width in [390, 768, 1200]:
            page.set_viewport_size({'width': width, 'height': 850})
            assert panel.evaluate('el => el.getBoundingClientRect().right <= innerWidth + 1')
            assert panel.bounding_box()['height'] <= (190 if width <= 620 else 140)
            assert frame.locator('html').evaluate('el => el.scrollWidth <= innerWidth + 1')
            assert frame.get_by_role('slider', name='Crossfader').evaluate('el => el.getBoundingClientRect().bottom <= innerHeight')
            page.screenshot(path=str(ROOT / f'test-results/mixer-dock-{width}.png'))
        browser.close()
        print(
            'Mixer passed two simultaneous tones, equal-power center and endpoints, independent pause/seek, public URL and file load, responsive layout and plugin launch/close.'
        )
finally:
    server.shutdown()
    server.server_close()
