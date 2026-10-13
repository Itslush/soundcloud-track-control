import json
import threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright, expect
from userscript_fixture import ROOT, userscript_source, browser_options, text_contrast

def verify_mobile_mirroring(browser, base):
    context = browser.new_context(viewport={'width':393,'height':844}, screen={'width':393,'height':844}, has_touch=True, reduced_motion='reduce', **({'is_mobile':True} if browser.browser_type.name == 'chromium' else {}))
    page = context.new_page()
    page.route('**/track-*.png', lambda route: route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="orange"/></svg>'))
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base + '/tests/fixtures/inline-fixture.html')
    result = page.evaluate('''async () => {
      const {createMobilePlayer} = await import('/src/controls/tempo-mobile-player.js');
      document.body.innerHTML = `<div class="playControls" style="visibility:collapse">
        <button class="playControls__play">Play</button><button class="playControls__next">Next</button><button class="playControls__prev">Previous</button>
        <a class="playbackSoundBadge__titleLink">Track title</a><a class="playbackSoundBadge__lightLink">Artist</a>
        <span class="soundcloud-tempo-pitch-notice">Pitch processing unavailable</span>
        <span class="soundcloud-tempo-crossfade-artwork" style="--tempo-artwork-start:25%;--tempo-artwork-end:75%;--tempo-artwork-progress:0.4"><span style="background-image:url(outgoing.png)"></span><span style="background-image:url(incoming.png)"></span></span>
      </div>`;
      const bar = document.querySelector('.playControls'), host = document.createElement('div');
      bar.append(host);
      const root = host.attachShadow({mode:'open'});
      root.innerHTML = `<input id="rate-number" min="0.25" max="4" value="1"><input id="quick-key-shift" min="-12" max="12" step="0.5" value="0"><input id="tempo-increment" value="0.025"><span class="quick-key"></span><span class="error" hidden></span><span class="status"></span><button class="memory"></button><button class="settings-button"></button>`;
      window.mobileCalls = [];
      for (const name of ['play','next','prev']) bar.querySelector('.playControls__'+name).onclick = () => mobileCalls.push(name);
      window.mobileController = createMobilePlayer({host,root,document,media:[],readTrack:()=>'/artist/track',changeRate:()=>{},cancelTransition:()=>mobileCalls.push('cancel')});
      mobileController.overlap({nextTrack:'/artist/next'});
      const copy = root.querySelector('.touch-cover'), incoming = copy.lastElementChild;
      return {hidden:getComputedStyle(bar).visibility, backgrounds:[...copy.children].map(child=>child.style.backgroundImage), variables:['--tempo-artwork-start','--tempo-artwork-end','--tempo-artwork-progress'].map(name=>copy.style.getPropertyValue(name)), opacity:getComputedStyle(incoming).opacity, mask:getComputedStyle(incoming).maskImage, notice:root.querySelector('.touch-pitch-notice').textContent, noticeHidden:root.querySelector('.touch-pitch-notice').hidden};
    }''')
    assert result == {'hidden':'hidden','backgrounds':['url("outgoing.png")','url("incoming.png")'],'variables':['25%','75%','0.4'],'opacity':'0.4','mask':'none','notice':'Pitch processing unavailable','noticeHidden':False}, result
    page.emulate_media(reduced_motion='no-preference')
    interpolation = page.evaluate('''async () => {
      const {installFooterStyle} = await import('/src/soundcloud/footer-style.js');
      installFooterStyle();
      const native = document.querySelector('.soundcloud-tempo-crossfade-artwork');
      const color=value=>'url("data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="'+value+'"/></svg>')+'")';
      native.firstElementChild.style.backgroundImage=color('red');
      native.lastElementChild.style.backgroundImage=color('blue');
      for(const [name,value] of [['start','100%'],['end','150%'],['progress','0']]) native.style.setProperty('--tempo-artwork-'+name,value);
      mobileController.overlap({nextTrack:'/artist/next',progress:0});
      const copy = document.querySelector('.playControls').lastElementChild.shadowRoot.querySelector('.touch-cover');
      for(const animation of copy.getAnimations()) animation.finish();
      getComputedStyle(copy).getPropertyValue('--tempo-artwork-start');
      for(const [name,value] of [['start','25%'],['end','75%'],['progress','0.5']]) native.style.setProperty('--tempo-artwork-'+name,value);
      mobileController.overlap({nextTrack:'/artist/next',progress:0.5});
      const animations=copy.getAnimations();
      for(const animation of animations){animation.pause();animation.currentTime=50;}
      const style=getComputedStyle(copy);
      const result={count:animations.length,start:parseFloat(style.getPropertyValue('--tempo-artwork-start')),end:parseFloat(style.getPropertyValue('--tempo-artwork-end'))};
      for(const animation of animations)animation.finish();
      return result;
    }''')
    assert interpolation['count'] == 3, interpolation
    assert abs(interpolation['start'] - 62.5) < .1 and abs(interpolation['end'] - 112.5) < .1, interpolation
    page.screenshot(path=str(ROOT/'test-results'/'artwork-smoothing-touch.png'))
    page.emulate_media(reduced_motion='reduce')
    assert page.locator('.touch-cover').evaluate("copy=>getComputedStyle(copy.lastElementChild).maskImage") == 'none'
    assert page.locator('.touch-cover').evaluate("copy=>getComputedStyle(copy.lastElementChild).opacity") == '0.5'
    assert page.locator('.touch-play').is_visible()
    assert page.evaluate("matchMedia('(pointer:coarse)').matches")
    page.locator('.touch-play').click()
    page.locator('.touch-next').click()
    page.locator('.touch-expand').click()
    page.locator('[data-action=previous]').click()
    assert page.evaluate('mobileCalls') == ['cancel','play','cancel','next','cancel','prev']
    for native, mirrored in [('.playControls__play','.touch-play'), ('.playControls__prev','[data-action=previous]')]:
        for attribute in ['disabled', 'aria-disabled']:
            page.evaluate('''({native,attribute}) => { document.querySelector(native).setAttribute(attribute,attribute==='disabled'?'':'true'); }''', {'native':native,'attribute':attribute})
            page.locator(mirrored).click()
            assert page.evaluate('mobileCalls') == ['cancel','play','cancel','next','cancel','prev']
            page.evaluate('mobileController.refresh()')
            expect(page.locator(mirrored)).to_be_disabled()
            page.evaluate('''({native,attribute}) => { document.querySelector(native).removeAttribute(attribute); mobileController.refresh(); }''', {'native':native,'attribute':attribute})
            expect(page.locator(mirrored)).to_be_enabled()
    page.evaluate("document.querySelector('.soundcloud-tempo-pitch-notice').hidden=true; mobileController.refresh()")
    expect(page.locator('.touch-pitch-notice')).to_be_hidden()
    page.evaluate('mobileController.overlap(null)')
    expect(page.locator('.touch-cover')).to_have_count(0)
    artwork = page.evaluate('''() => {
      const avatar = document.createElement('a');
      avatar.className = 'playbackSoundBadge__avatar';
      document.querySelector('.playControls').prepend(avatar);
      const read = markup => {
        avatar.innerHTML = markup;
        mobileController.refresh();
        return document.querySelector('.playControls').lastElementChild.shadowRoot.querySelector('.touch-art').style.backgroundImage;
      };
      return [
        read('<img src="/track-one.png">'),
        read('<span class="image"><span class="image__full" style="background-image:url(/track-two.png)"></span></span>'),
        read('<span class="sc-artwork" style="background-image:url(/track-three.png)"></span>'),
        read('<img>'),
      ];
    }''')
    assert artwork == [f'url("{base}/track-one.png")', f'url("{base}/track-two.png")', f'url("{base}/track-three.png")', 'none'], artwork
    page.locator('.playbackSoundBadge__avatar img').evaluate("image => image.srcset='/track-late.png 1x'")
    expect(page.locator('.touch-art')).to_have_css('background-image', f'url("{base}/track-late.png")')
    assert page.locator('.playbackSoundBadge__avatar img').evaluate('image=>image.complete && image.naturalWidth === 44')
    page.locator('.playbackSoundBadge__avatar').evaluate('''avatar => {
      avatar.innerHTML='<span class="image"><span class="image__full"></span></span>';
    }''')
    expect(page.locator('.touch-art')).to_have_css('background-image', 'none')
    page.locator('.image__full').evaluate("image => image.style.backgroundImage='url(/track-late-background.png)'")
    expect(page.locator('.touch-art')).to_have_css('background-image', f'url("{base}/track-late-background.png")')
    page.evaluate('''() => {
      const previous = document.querySelector('.playbackSoundBadge__avatar');
      const replacement = previous.cloneNode(false);
      replacement.innerHTML='<img src="/track-replacement.png">';
      previous.replaceWith(replacement);
      mobileController.refresh();
      previous.style.backgroundImage='url(/track-detached.png)';
    }''')
    expect(page.locator('.touch-art')).to_have_css('background-image', f'url("{base}/track-replacement.png")')
    assert page.locator('.waveform-panel,.tempo-waveform').count() == 0
    page.locator('.touch-art').screenshot(path=str(ROOT/'test-results'/f'thumbnail-{browser.browser_type.name}.png'))
    page.evaluate('mobileController.dispose()')
    assert page.locator('.playControls').evaluate('bar=>bar.style.visibility') == 'collapse'
    expect(page.locator('.touch-transport')).to_have_count(0)
    assert not errors, errors
    context.close()

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(**browser_options(), headless=True, args=['--mute-audio'])
        verify_mobile_mirroring(browser, f'http://127.0.0.1:{server.server_port}')
        evidence = []
        for width in [320, 393]:
            context = browser.new_context(viewport={'width':width,'height':844}, screen={'width':width,'height':844}, is_mobile=True, has_touch=True, device_scale_factor=3)
            page = context.new_page()
            page.route('**/track-fixture.svg', lambda route: route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" fill="orange"/></svg>'))
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.add_init_script(script=userscript_source())
            waveform_requests = []
            page.on('request', lambda request: waveform_requests.append(request.url) if 'wave.sndcdn.com' in request.url else None)
            page.goto(f'http://127.0.0.1:{server.server_port}/tests/fixtures/inline-fixture.html')
            host = page.locator('#soundcloud-tempo-control')
            expect(host).to_have_attribute('data-touch-player','')
            page.locator('.playbackSoundBadge__avatar').evaluate("avatar=>avatar.innerHTML='<img src=\"/track-fixture.svg\">'")
            expect(page.locator('.touch-art')).to_have_css('background-image', f'url("http://127.0.0.1:{server.server_port}/track-fixture.svg")')
            page.wait_for_timeout(120)
            geometry = page.evaluate('''() => {
              const host=document.querySelector('#soundcloud-tempo-control'), button=host.shadowRoot.querySelector('.touch-expand'), vv=visualViewport;
              return {layout:innerWidth,physical:vv.width*vv.scale,scale:vv.scale,button:button.getBoundingClientRect().height*vv.scale,host:host.getBoundingClientRect().width*vv.scale};
            }''')
            assert geometry['layout'] > width*1.5, geometry
            assert abs(geometry['host']-width) < 2 and geometry['button'] >= 43.9, geometry
            page.evaluate("""() => { window.mobileAudio=new Audio(); mobileAudio.muted=true; Object.defineProperty(mobileAudio,'duration',{value:201}); mobileAudio.play().catch(()=>{}); mobileAudio.pause(); mobileAudio.currentTime=40; mobileAudio.dispatchEvent(new Event('loadedmetadata')); }""")
            page.locator('.touch-expand').tap()
            exact = page.locator('#touch-rate')
            exact.fill('1.375'); exact.press('Tab')
            expect(page.locator('#rate-number')).to_have_value('1.375')
            page.get_by_role('button',name='Increase Exact playback speed on mobile',exact=True).tap()
            expect(page.locator('#rate-number')).to_have_value('1.4')
            page.get_by_role('button',name='Decrease Exact playback speed on mobile',exact=True).tap()
            expect(page.locator('#rate-number')).to_have_value('1.375')
            rate_slider = page.locator('#touch-rate-slider')
            rate_slider.focus(); rate_slider.press('End')
            expect(page.locator('#rate-number')).to_have_value('4')
            rate_slider.press('Home')
            expect(page.locator('#rate-number')).to_have_value('0.25')
            expect(exact).to_have_value('0.25')
            save = page.locator('.touch-adjustments [data-action=save]')
            save.tap()
            expect(save).to_have_text('Forget saved tempo')
            expect(page.locator('.memory')).to_have_attribute('aria-pressed','true')
            save.tap()
            expect(save).to_have_text('Save tempo')
            expect(page.locator('.memory')).to_have_attribute('aria-pressed','false')
            page.locator('.playbackSoundBadge__titleLink').evaluate("element=>element.href='https://soundcloud.com/test-artist/second-track'")
            expect(page.locator('#rate-number')).to_have_value('1')
            exact.fill('1.25'); exact.press('Tab')
            expect(page.locator('#rate-number')).to_have_value('1.25')
            exact.fill('1.5')
            page.locator('.playbackSoundBadge__titleLink').evaluate("element=>element.href='https://soundcloud.com/test-artist/first-track'")
            expect(page.locator('#rate-number')).to_have_value('1')
            exact.press('Tab')
            expect(page.locator('#rate-number')).to_have_value('1')
            pitch = page.locator('#touch-pitch')
            pitch.fill('-3.5'); pitch.press('Tab')
            expect(page.locator('#quick-key-shift')).to_have_value('-3.5')
            page.get_by_role('button',name='Increase Key shift in semitones on mobile',exact=True).tap()
            expect(page.locator('#quick-key-shift')).to_have_value('-3')
            page.get_by_role('button',name='Decrease Key shift in semitones on mobile',exact=True).tap()
            expect(page.locator('#quick-key-shift')).to_have_value('-3.5')
            pitch_slider = page.locator('#touch-pitch-slider')
            pitch_slider.focus(); pitch_slider.press('Home')
            expect(page.locator('#quick-key-shift')).to_have_value('-12')
            expect(pitch).to_have_value('-12')
            pitch_slider.press('End')
            expect(page.locator('#quick-key-shift')).to_have_value('12')
            volume = page.locator('#touch-volume')
            volume.focus(); volume.press('End'); volume.press('Home')
            assert page.evaluate('({volume:mobileAudio.volume,muted:mobileAudio.muted})') == {'volume':0,'muted':False}
            volume.press('End'); volume.press('ArrowLeft')
            assert page.evaluate('mobileAudio.volume') == 0.99
            page.locator('.touch-adjustments [data-action=pitch-reset]').tap()
            expect(pitch).to_have_value('0')
            page.evaluate("document.querySelector('.playControls__next').disabled=true")
            exact.fill('1'); exact.press('Tab')
            expect(page.locator('.touch-next')).to_be_disabled()
            page.locator('[data-action=settings]').tap()
            expect(page.locator('.settings')).to_be_visible()
            page.keyboard.press('Escape')
            expect(page.locator('.touch-settings')).to_be_focused()
            page.locator('[data-action=settings]').tap()
            page.locator('.appearance-settings summary').tap()
            page.locator('#show-key').uncheck()
            page.locator('.close-settings').tap()
            expect(pitch).to_be_hidden()
            expect(page.locator('#touch-pitch-slider')).to_be_hidden()
            page.locator('[data-action=settings]').tap()
            page.locator('#show-key').check()
            page.locator('.close-settings').tap()
            expect(pitch).to_be_visible()
            expect(page.locator('.waveform-panel,.tempo-waveform')).to_have_count(0)
            for theme in ['light','charcoal','oled']:
                page.locator('[data-action=settings]').tap()
                page.locator(f'input[name=appearance][value={theme}]').check()
                page.locator('.close-settings').tap()
                assert text_contrast(page.locator('.touch-caption strong')) >= 4.5
                page.screenshot(path=str(ROOT/'test-results'/f'mobile-player-{width}-{theme}.png'))
            page.set_viewport_size({'width':width,'height':360})
            page.wait_for_timeout(120)
            bounds = page.evaluate('''() => {const r=document.querySelector('#soundcloud-tempo-control').getBoundingClientRect(),v=visualViewport;return {top:r.top,bottom:r.bottom,visibleTop:v.offsetTop,visibleBottom:v.offsetTop+v.height};}''')
            assert bounds['top'] >= bounds['visibleTop']-1 and bounds['bottom'] <= bounds['visibleBottom']+1, bounds
            assert not errors, errors
            assert not waveform_requests, waveform_requests
            evidence.append(geometry)
            context.close()
        for width in [768, 1440]:
            context = browser.new_context(viewport={'width':width,'height':844})
            page = context.new_page()
            page.add_init_script(script=userscript_source())
            page.goto(f'http://127.0.0.1:{server.server_port}/tests/fixtures/inline-fixture.html')
            expect(page.locator('.touch-transport')).to_be_hidden()
            expect(page.locator('.waveform-panel,.tempo-waveform')).to_have_count(0)
            for theme in ['light','charcoal','oled']:
                page.locator('.settings-button').click()
                page.locator('.appearance-settings summary').click()
                page.locator(f'input[name=appearance][value={theme}]').check()
                page.locator('.close-settings').click()
                page.wait_for_timeout(100)
                page.screenshot(path=str(ROOT/'test-results'/f'desktop-player-{width}-{theme}.png'))
                # Leave Appearance closed so the next iteration tests opening it too.
                page.locator('.settings-button').click()
                page.locator('.appearance-settings summary').click()
                page.locator('.close-settings').click()
            context.close()
        context = browser.new_context(viewport={'width':393,'height':844},screen={'width':393,'height':844},is_mobile=True,has_touch=True)
        page = context.new_page()
        page.route('https://soundcloud.com/**',lambda route:route.fulfill(body='<html><body style="color:#eee;background:#161616"><main>Limited mobile page fixture</main></body></html>',content_type='text/html'))
        page.add_init_script(script=userscript_source())
        page.goto('https://soundcloud.com/test-artist/first-track')
        expect(page.locator('#soundcloud-track-mobile-availability')).to_contain_text('Turn on Desktop site')
        assert page.locator('#soundcloud-tempo-control').count() == 0
        page.get_by_role('button',name='Dismiss').tap()
        expect(page.locator('#soundcloud-track-mobile-availability')).to_have_count(0)
        context.close()
        browser.close()
        browser = p.firefox.launch(headless=True)
        verify_mobile_mirroring(browser, f'http://127.0.0.1:{server.server_port}')
        browser.close()
        print(json.dumps({'desktop_view_phone_geometry':evidence,'errors':0}))
finally:
    server.shutdown()
