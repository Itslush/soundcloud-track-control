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
        page.locator('.settings-button').click()
        page.locator('.advanced-audio > summary').click()
        launcher = page.get_by_role('button', name='Two-deck mixer')
        launcher.click()
        dialog = page.get_by_role('dialog', name='Two-deck mixer')
        expect(dialog).to_be_visible()
        frame = page.frame_locator('iframe[title="Decks and crossfader"]')
        expect(frame.get_by_role('region', name='Deck A', exact=True)).to_be_visible()
        native = page.locator('.playControls__play')
        native.evaluate("""node => {
      node.classList.add("playing");
      node.addEventListener("click", () => node.classList.remove("playing"), {once: true});
    }""")
        page.evaluate(
            'window.postMessage("soundcloud-track-control:mixer-playing", location.origin)'
        )
        expect(native).to_have_class(re.compile(r'\bplaying\b'))
        deck = frame.get_by_role('region', name='Deck A', exact=True)
        deck.locator('input[type=file]').set_input_files(
            {'name': 'Host.wav', 'mimeType': 'audio/wav', 'buffer': tone(220)}
        )
        deck.get_by_role('button', name='Play deck A').click()
        expect(native).not_to_have_class(re.compile(r'\bplaying\b'))
        deck.get_by_label('SoundCloud track URL').press('Escape')
        expect(dialog).to_have_count(0)
        expect(launcher).to_be_focused()
        browser.close()
        print(
            'Mixer passed two simultaneous tones, equal-power center and endpoints, independent pause/seek, public URL and file load, responsive layout and plugin launch/close.'
        )
finally:
    server.shutdown()
    server.server_close()
