import json
import threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

from playwright.sync_api import sync_playwright
from userscript_fixture import ROOT, userscript_source, browser_options

# Counts actual renderer paint events, not phone CPU cost or audio dropouts.
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(**browser_options(),headless=True)
        page=browser.new_page(viewport={'width':393,'height':844},has_touch=True)
        page.add_init_script("localStorage.setItem('soundcloud.tempo.appearance','oled');localStorage.setItem('soundcloud.tempo.starMotion','on');"+userscript_source())
        page.goto(f'http://127.0.0.1:{server.server_port}/tests/fixtures/inline-fixture.html')
        page.wait_for_selector('#soundcloud-tempo-control')
        page.wait_for_timeout(500)
        cdp=page.context.new_cdp_session(page)
        events=[]
        cdp.on('Tracing.dataCollected',lambda data:events.extend(data['value']))
        complete=[]
        cdp.on('Tracing.tracingComplete',lambda _:complete.append(True))
        runs=[]
        for iteration in range(5):
            for motion in ['on','off']:
                page.evaluate('''motion=>{
                  const input=document.querySelector('#soundcloud-tempo-control').shadowRoot.querySelector('#star-motion');
                  input.checked=motion==='on';input.dispatchEvent(new Event('change',{bubbles:true}));
                }''',motion)
                page.wait_for_timeout(150)
                assert page.evaluate("localStorage.getItem('soundcloud.tempo.starMotion')")==motion
                before=page.evaluate("document.querySelector('.soundcloud-tempo-stars').style.transform")
                events.clear();complete.clear()
                cdp.send('Tracing.start',{'categories':'devtools.timeline','transferMode':'ReportEvents'})
                page.wait_for_timeout(1000)
                after=page.evaluate("document.querySelector('.soundcloud-tempo-stars').style.transform")
                assert (before!=after)==(motion=='on'), (motion,before,after)
                cdp.send('Tracing.end')
                for _ in range(50):
                    if complete:break
                    page.wait_for_timeout(20)
                assert complete
                paints=[e for e in events if e['name']=='Paint' and e.get('ph')=='X']
                styles=[e for e in events if e['name']=='UpdateLayoutTree' and e.get('ph')=='X']
                runs.append({'round':iteration+1,'motion':motion,'paints':len(paints),'styleUpdates':len(styles),
                    'paintMs':sum(e.get('dur',0) for e in paints)/1000})
        assert max(run['paints'] for run in runs if run['motion']=='on') < 20, runs
        report={'scope':'headless Chrome, shipped userscript OLED phone-sized silent fixture; paint counts, not Firefox Android or audio performance','runs':runs}
        (ROOT/'test-results/star-paint.json').write_text(json.dumps(report,indent=2))
        print(json.dumps(report,indent=2))
        browser.close()
finally:
    server.shutdown()
