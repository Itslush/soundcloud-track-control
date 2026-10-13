import json
import math
import threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

from playwright.sync_api import sync_playwright, expect
from userscript_fixture import ROOT, userscript_source

SimpleHTTPRequestHandler.extensions_map['.mjs'] = 'text/javascript'
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.firefox.launch(headless=True, firefox_user_prefs={
            'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0,
        })
        page = browser.new_page(viewport={'width': 393, 'height': 844}, has_touch=True)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script('''
          window.steadyAudit={rateWrites:0,pitchWrites:0,messages:[],nodes:0};
          for(const name of ['playbackRate','defaultPlaybackRate','preservesPitch']){
            const d=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,name);
            Object.defineProperty(HTMLMediaElement.prototype,name,{...d,set(v){
              steadyAudit[name==='preservesPitch'?'pitchWrites':'rateWrites']++;
              d.set.call(this,v);
            }});
          }
          window.AudioWorkletNode=new Proxy(AudioWorkletNode,{construct(target,args){
            const node=Reflect.construct(target,args);
            if(args[1]==='signalsmith-stretch'){
              steadyAudit.nodes++;
              const post=node.port.postMessage.bind(node.port);
              node.port.postMessage=(data,...rest)=>{
                steadyAudit.messages.push(data.slice(1));
                return post(data,...rest);
              };
            }
            return node;
          }});
          localStorage.setItem('soundcloud.tempo.appearance','oled');
          localStorage.setItem('soundcloud.tempo.starMotion','on');
        ''' + userscript_source())
        page.goto(f'http://127.0.0.1:{server.server_port}/tests/fixtures/inline-fixture.html')
        page.wait_for_selector('.touch-play')
        page.evaluate('''async () => {
          const {steadyAudio}=await import('/tests/fixtures/steady-audio.mjs');
          window.steady=await steadyAudio();
          const root=document.querySelector('#soundcloud-tempo-control').shadowRoot;
          for(const [id,checked] of [['preserve-key',false],['use-wasm',true]]){
            const input=root.getElementById(id);input.checked=checked;
            input.dispatchEvent(new Event('change',{bubbles:true}));
          }
        }''')
        results = []
        expect(page.locator('.touch-play')).to_have_attribute('aria-label', 'Pause')
        for tempo, shift in [(1, 0), (.8, 0), (1.15, 0), (1, -6.5), (.8, -6.5), (1, 0)]:
            page.evaluate('''([tempo,shift]) => {
              const root=document.querySelector('#soundcloud-tempo-control').shadowRoot;
              for(const [id,value] of [['rate-number',tempo],['key-shift',shift]]){
                const input=root.getElementById(id);input.value=String(value);
                input.dispatchEvent(new Event('change',{bubbles:true}));
              }
            }''', [tempo, shift])
            page.wait_for_timeout(1600)
            before = page.evaluate('structuredClone(steadyAudit)')
            star_before = page.locator('.soundcloud-tempo-stars').evaluate('el=>el.style.transform')
            captures = []
            for _ in range(3):
                capture = page.evaluate('steady.capture()')
                assert capture['skippedQuanta'] == capture['missingInputs'] == 0, capture
                for hz, channel in zip([440, 660], capture['channels']):
                    expected = hz * tempo * 2**(shift/12)
                    assert abs(channel['frequency'] - expected) < 3, (expected, channel)
                    assert channel['invalid'] == channel['silentQuanta'] == 0, channel
                    assert .03 < channel['rms'] < .12, channel
                    # A sine's adjacent-sample slope plus tolerance for the stretcher.
                    assert channel['maxJump'] < 2 * channel['peak'] * math.sin(math.pi*expected/48000) + .005, channel
                captures.append(capture)
            after = page.evaluate('structuredClone(steadyAudit)')
            assert after == before, (before, after)
            assert page.locator('.soundcloud-tempo-stars').evaluate('el=>el.style.transform') != star_before
            results.append({'tempo': tempo, 'shift': shift, 'nodes': after['nodes'], 'captures': captures})
        assert before['nodes'] == 1, before
        config = next(message[1] for message in before['messages'] if message[0] == 'configure')
        assert config == {'blockMs': 120, 'intervalMs': 30, 'splitComputation': True}, config
        page.evaluate('steady.close()')
        expect(page.locator('.touch-play')).to_have_attribute('aria-label', 'Play')
        assert not errors, errors
        report = {'scope': 'Muted Firefox desktop engine, shipped bundle, three four-second PCM windows per setting; not Android scheduling or speaker listening', 'results': results, 'errors': errors}
        (ROOT/'test-results'/'steady-audio.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report))
        browser.close()
finally:
    server.shutdown()
