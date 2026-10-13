import json
import statistics
import subprocess
import time
from playwright.sync_api import sync_playwright
from userscript_fixture import ROOT, browser_options

module = subprocess.check_output(['node','-p',"require('./tests/module-fixture.cjs')(['controls/tempo-waveform.js'])"],cwd=ROOT,text=True,encoding='utf-8')
host_load=json.loads(subprocess.check_output(['powershell','-NoProfile','-Command',"Get-CimInstance Win32_Processor | Select-Object Name,NumberOfLogicalProcessors,LoadPercentage | ConvertTo-Json -Compress"],text=True))

def metrics(session):
    return {item['name']:item['value'] for item in session.send('Performance.getMetrics')['metrics']}

with sync_playwright() as p:
    browser=p.chromium.launch(**browser_options(),headless=True,args=['--mute-audio'])
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=3,has_touch=True)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content('<main style="--tempo-fg:#f4f4f4;--tempo-surface:#202020;--tempo-accent:#ff8a42"></main>')
    page.add_script_tag(content=module)
    page.evaluate('''() => {
      window.draws=0; const clear=CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect=function(...args){ draws++; return clear.apply(this,args); };
      window.wave=createTrackWaveform({container:document.querySelector('main')});
      window.state={track:'https://soundcloud.com/sewerslvt/bring-me-the-horizon-drown-sewerslvt-remix',position:120,duration:496.503,paused:true,metadata:{permalink_url:'https://soundcloud.com/sewerslvt/bring-me-the-horizon-drown-sewerslvt-remix',duration:496503,waveform_url:'https://wave.sndcdn.com/i8iGCAxlflnc_m.json'}};
      wave.update(state);
    }''')
    page.wait_for_function("document.querySelector('[role=status]').hidden",timeout=15000)
    page.wait_for_timeout(200)
    session=page.context.new_cdp_session(page)
    session.send('Performance.enable')
    session.send('Emulation.setCPUThrottlingRate',{'rate':6})
    records=[]
    for run in range(5):
        for enabled in [True,False]:
            page.evaluate('''enabled=>{
              wave.element.hidden=!enabled;
              state.paused=false;
              window.updates=0;
              window.updateTimer=setInterval(()=>{ updates++; state.position+=.05; wave.update({...state}); },50);
              wave.refresh();
            }''',enabled)
            before=metrics(session)
            draw_before=page.evaluate('draws')
            started=time.monotonic()
            page.wait_for_timeout(3000)
            page.evaluate('clearInterval(updateTimer)')
            elapsed=time.monotonic()-started
            after=metrics(session)
            count=page.evaluate('draws')-draw_before
            records.append({'run':run+1,'state':'enabled' if enabled else 'collapsed','elapsedSeconds':round(elapsed,4),'updates':page.evaluate('updates'),'draws':count,'taskSeconds':round(after['TaskDuration']-before['TaskDuration'],6),'scriptSeconds':round(after['ScriptDuration']-before['ScriptDuration'],6),'heapDeltaBytes':after['JSHeapUsedSize']-before['JSHeapUsedSize']})
            if not enabled: assert count==0,records[-1]
            assert count <= elapsed*20+2,records[-1]
    page.evaluate('wave.element.hidden=false;state.paused=true;wave.update({...state})')
    page.wait_for_timeout(150)
    paused_before=page.evaluate('draws')
    page.wait_for_timeout(300)
    paused_stop=page.evaluate('draws')==paused_before
    page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
    hidden_before=page.evaluate('draws')
    page.evaluate('state.position+=1;wave.update({...state,paused:false})')
    page.wait_for_timeout(300)
    hidden_stop=page.evaluate('draws')==hidden_before
    page.evaluate('wave.dispose()')
    assert paused_stop and hidden_stop and not errors,(paused_stop,hidden_stop,errors)
    summary={name:{'medianTaskSeconds':round(statistics.median(item['taskSeconds'] for item in records if item['state']==name),6),'taskSecondsRange':[min(item['taskSeconds'] for item in records if item['state']==name),max(item['taskSeconds'] for item in records if item['state']==name)],'drawsRange':[min(item['draws'] for item in records if item['state']==name),max(item['draws'] for item in records if item['state']==name)],'totalDraws':sum(item['draws'] for item in records if item['state']==name)} for name in ['enabled','collapsed']}
    report={'browser':browser.version,'hostLoadAtStart':host_load,'scope':'Owned headless Chromium, isolated production renderer, warm real SoundCloud 1800-sample envelope, no audio playback. 390px/DPR3 capped internally at2,6x CDP CPU throttle, five alternating 3s enabled/collapsed pairs. Whole-page task/script time includes DOM update loop and instrumentation; not physical low-end hardware or live SoundCloud performance. Heap endpoint deltas include GC timing. Concurrent machine workload is uncontrolled. Draw counts show actual work and can be lower than the20Hz cap. These observations establish neither a speedup nor low-end smoothness.','runs':records,'summary':summary,'pausedStopsDrawing':paused_stop,'hiddenStopsDrawing':hidden_stop,'errors':errors}
    browser.close()
print(json.dumps(report,indent=2))
