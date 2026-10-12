import subprocess
from playwright.sync_api import sync_playwright
from userscript_fixture import ROOT, browser_options, text_contrast

module = subprocess.check_output(['node','-p',"require('./tests/module-fixture.cjs')(['controls/tempo-waveform.js'])"],cwd=ROOT,text=True,encoding='utf-8')
with sync_playwright() as p:
    browser=p.chromium.launch(**browser_options(),headless=True,args=['--mute-audio'])
    for width in [320,768,1440]:
        page=browser.new_page(viewport={'width':width,'height':700},has_touch=width==320,device_scale_factor=3)
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.set_content('<main style="--tempo-fg:#f4f4f4;--tempo-surface:#202020;--tempo-accent:#ff8a42;--tempo-border:#999;color:var(--tempo-fg);background:var(--tempo-surface)"></main>')
        page.add_script_tag(content=module)
        page.evaluate('''() => {
          window.draws=0; window.lastDrawTime=-Infinity; const fill=CanvasRenderingContext2D.prototype.clearRect;
          CanvasRenderingContext2D.prototype.clearRect=function(...args){ draws++; lastDrawTime=performance.now(); return fill.apply(this,args); };
          window.seeks=[]; window.pending=[];
          window.wave=createTrackWaveform({container:document.querySelector('main'),seek:value=>seeks.push(value),loadWaveform:(track,{signal})=>new Promise((resolve,reject)=>{
            pending.push({track,resolve}); signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
          })});
          wave.update({track:'/a/first',position:30,duration:100,paused:true});
        }''')
        page.wait_for_timeout(100)
        page.evaluate("wave.update({track:'/a/second',position:30,duration:100,paused:true})")
        page.wait_for_timeout(50)
        page.evaluate('''() => { pending[0].resolve({samples:new Float32Array([1,1]),duration:100}); pending[1].resolve({samples:new Float32Array([0,.5,1,.5]),duration:100}); }''')
        page.wait_for_timeout(100)
        assert 'Audio envelope.' in page.locator('[role=status]').inner_text()
        # Allow the load/resize paint to settle before measuring paused idle work.
        page.wait_for_function('performance.now()-lastDrawTime>=250',timeout=5000)
        count=page.evaluate('draws')
        page.wait_for_timeout(180)
        assert page.evaluate('draws') == count
        assert page.locator('canvas').evaluate('el=>el.width<=Math.ceil(el.getBoundingClientRect().width*2)')
        page.evaluate("for(let i=0;i<100;i++)wave.update({track:'/a/second',position:30+i/100,duration:100,paused:false})")
        page.wait_for_timeout(100)
        assert page.evaluate('draws') <= count+1
        page.evaluate("wave.update({track:'/a/second',position:30,duration:100,paused:true})")
        page.locator('canvas').focus()
        page.keyboard.press('ArrowRight')
        assert page.evaluate('seeks.at(-1)') == 35
        page.locator('input').fill('1:20')
        page.locator('button').click()
        assert page.evaluate('seeks.at(-1)') == 80
        page.locator('canvas').click(position={'x':10,'y':10})
        assert page.evaluate('seeks.at(-1)') < 5
        page.locator('input').fill('bad')
        page.locator('button').click()
        assert page.locator('input').evaluate('el=>!el.checkValidity()')
        assert page.locator('form').evaluate('el=>el.noValidate')
        assert page.locator('input').get_attribute('aria-invalid') == 'true'
        assert page.locator('[role=status]').inner_text() == 'Enter seconds or a time such as 1:30.'
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        for fg,surface,accent in [('#202020','#ffffff','#a74300'),('#f4f4f4','#202020','#ff8a42'),('#ffffff','#000000','#ff8a42')]:
            page.locator('main').evaluate('''(el,colors)=>{ for(const [key,value] of Object.entries(colors))el.style.setProperty(key,value); wave.refresh(); }''',{'--tempo-fg':fg,'--tempo-surface':surface,'--tempo-accent':accent})
            page.wait_for_timeout(60)
            assert text_contrast(page.locator('[role=status]')) >= 4.5
            assert page.locator('input').evaluate("el=>getComputedStyle(el,'::placeholder').color===getComputedStyle(el).color && getComputedStyle(el,'::placeholder').opacity==='1'")
            assert text_contrast(page.locator('input')) >= 4.5
            page.keyboard.press('Tab')
            page.locator('canvas').focus()
            assert page.locator('canvas').evaluate("el=>getComputedStyle(el).outlineStyle") != 'none'
        if width==320:
            rect=page.locator('canvas').bounding_box()
            page.touchscreen.tap(rect['x']+rect['width']/2,rect['y']+65)
            assert page.evaluate('seeks.at(-1)') == 30
        page.locator('main').evaluate("el=>{el.style.transform='scale(.5)'; el.style.transformOrigin='0 0';wave.refresh()}")
        page.wait_for_timeout(100)
        assert page.locator('canvas').evaluate('el=>el.width===el.clientWidth*2 && el.height===el.clientHeight*2')
        rect=page.locator('canvas').bounding_box()
        page.mouse.click(rect['x']+rect['width']/2,rect['y']+20)
        assert page.evaluate('seeks.at(-1)') == 30
        page.locator('main').evaluate("el=>{el.style.transform='';wave.refresh()}")
        page.evaluate("wave.update({track:'/a/second',position:50,duration:100,paused:false,nextTrack:'/a/third',nextPosition:2,nextDuration:100,progress:.5})")
        page.wait_for_timeout(60)
        page.evaluate('pending.at(-1).resolve({samples:new Float32Array([1,.5]),duration:100})')
        page.wait_for_timeout(100)
        assert page.locator('button').is_disabled()
        assert 'incoming' in page.locator('[role=status]').inner_text()
        page.evaluate('''() => { Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange')); }''')
        count=page.evaluate('draws')
        page.evaluate("wave.update({track:'/a/second',position:60,duration:100,paused:false})")
        page.wait_for_timeout(180)
        assert page.evaluate('draws') == count
        page.evaluate('''() => { Object.defineProperty(document,'hidden',{configurable:true,value:false}); document.dispatchEvent(new Event('visibilitychange')); }''')
        page.wait_for_timeout(100)
        assert page.evaluate('draws') > count
        page.evaluate("document.querySelector('main').remove()")
        count=page.evaluate('draws')
        page.evaluate("wave.update({track:'/a/second',position:70,duration:100,paused:false})")
        page.wait_for_timeout(150)
        assert page.evaluate('draws') == count
        page.evaluate('wave.dispose()')
        assert page.locator('canvas').count() == 0
        page.set_content('<main style="--tempo-fg:#fff;--tempo-surface:#000;--tempo-accent:#ff8a42"></main>')
        page.evaluate("wave=createTrackWaveform({container:document.querySelector('main'),loadWaveform:()=>Promise.reject(new Error('Unavailable'))}); wave.update({track:'/a/missing',duration:100,position:0,paused:true})")
        page.wait_for_timeout(100)
        assert 'unavailable' in page.locator('[role=status]').inner_text()
        assert page.locator('form').is_hidden()
        page.evaluate('wave.dispose()')
        assert not errors,errors
        page.close()
    browser.close()
print('PASS: waveform math, stale data, paused/hidden rendering, keyboard/pointer/typed seek, invalid input, overlap and teardown at 320/768/1440px. Isolated muted fixture.')
