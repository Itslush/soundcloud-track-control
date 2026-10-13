import json
import hashlib
import subprocess
import sys
import threading
from urllib.request import urlopen
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright
from userscript_fixture import ROOT, userscript_source


source = userscript_source()
if '--baseline' in sys.argv:
    published = urlopen('https://itslush.github.io/soundcloud-track-control/downloads/soundcloud-track-control.user.js', timeout=20).read()
    assert hashlib.sha256(published).hexdigest() == '8731f7ba640f0c637e20cc3ce80692adec85c30ffc833df88ca5d164371ff018'
    source = published.decode('utf-8')
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
evidence = []
try:
    with sync_playwright() as playwright:
        for engine in ['chromium', 'firefox']:
            browser = getattr(playwright, engine).launch(headless=True)
            for width in [320, 393, 844]:
                scale = width / 980
                # Firefox desktop Playwright cannot emulate Android's APZ viewport.
                # Feed its documented geometry to the shipped detector, not to CSS.
                context = browser.new_context(
                    viewport={'width': 980, 'height': round(844 / scale)},
                    screen={'width': width, 'height': 844}, has_touch=True,
                )
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.add_init_script(f'''(() => {{
                    const viewport = Object.assign(new EventTarget(), {{width:980,height:{844 / scale},scale:{scale},offsetTop:0,offsetLeft:0}});
                    Object.defineProperty(window,'visualViewport',{{value:viewport}});
                    Object.defineProperty(navigator,'maxTouchPoints',{{value:5}});
                    Object.defineProperty(screen,'width',{{value:{width}}});
                    Object.defineProperty(screen,'height',{{value:{393 if width == 844 else 844}}});
                    const original = window.matchMedia.bind(window);
                    window.matchMedia = query => {{
                        const result = original(query);
                        if (/pointer\\s*:\\s*coarse/.test(query)) Object.defineProperty(result,'matches',{{value:false}});
                        return result;
                    }};
                }})();''')
                page.add_init_script(script=source)
                page.goto(f'http://127.0.0.1:{server.server_port}/tests/fixtures/inline-fixture.html')
                host = page.locator('#soundcloud-tempo-control')
                print(json.dumps({'engine': engine, 'signals': page.evaluate('({points:navigator.maxTouchPoints,width:visualViewport.width,scale:visualViewport.scale,screen:screen.width,coarse:matchMedia("(any-pointer:coarse)").matches})'), 'errors': errors}), flush=True)
                expect(host).to_have_attribute('data-touch-player', '')
                page.evaluate('''() => {
                    const style = document.createElement('style');
                    style.textContent = '.l-container{width:960px}.header{position:fixed;height:46px}.header__inner{display:flex;height:46px}.header__left,.header__middle,.header__right{width:33%}.header__navMenu{display:flex}.header__navMenuItem{list-style:none}.headerSearch__input{width:180px}.g-tabs{display:flex;list-style:none}.g-tabs a{display:block;height:32px}.soundBadgeList{display:grid;grid-template-columns:repeat(6,1fr);padding:0;list-style:none}.soundBadge__artwork{width:130px;height:130px;background:#50565a}.soundBadge__playButton{visibility:hidden}.soundTitle__title{height:20px;white-space:nowrap;font-size:12px}.l-main{width:700px;float:left}.l-sidebar{width:240px;float:right}';
                    document.head.prepend(style);
                    const header = document.createElement('header');
                    header.className = 'header';
                    header.innerHTML = '<div class="header__inner l-container"><div class="header__left"><div class="header__logo"><a class="header__logoLink-iconOnly" href="/">Home</a></div><nav class="header__navWrapper"><ul class="header__navMenu">'+['Home','Feed','Library'].map(name=>'<li class="header__navMenuItem"><a href="/'+name.toLowerCase()+'">'+name+'</a></li>').join('')+'</ul></nav></div><div class="header__middle"><form class="header__search headerSearch"><input class="headerSearch__input" aria-label="Search tracks"></form></div><div class="header__right"><button>Account</button><a href="/upload">Upload</a><button>More</button></div></div>';
                    document.body.prepend(header);
                    const main = document.querySelector('main');
                    main.className = 'l-container l-content';
                    main.innerHTML = '<div class="l-main"><ul class="g-tabs">'+['Overview','Likes','Playlists','Albums','Stations','Following','History'].map(name=>'<li><a href="/you/'+name.toLowerCase()+'">'+name+'</a></li>').join('')+'</ul><h1>Phone library fixture</h1><p>Illustrative cards, not an account capture.</p><ul class="soundBadgeList">'+Array.from({length:14},(_,index)=>'<li class="soundBadgeList__item"><article class="soundBadge"><div class="soundBadge__artwork"><button class="soundBadge__playButton sc-button-play" aria-label="Play fixture track '+index+'">Play</button></div><div class="soundBadge__content"><a class="soundTitle__title" href="/fixture/track-'+index+'">Fixture track '+index+' with a long readable title</a><span class="soundTitle__username">Fixture artist</span></div></article></li>').join('')+'</ul></div><aside class="l-sidebar">Sidebar content</aside>';
                    window.phoneActions = [];
                    main.addEventListener('click',event=>{
                        const target = event.target.closest('a,button');
                        if(target){event.preventDefault();phoneActions.push(target.getAttribute('href')||target.getAttribute('aria-label'));}
                    });
                }''')
                expect(page.locator('html')).to_have_attribute('data-track-control-mobile-layout', '')
                page.wait_for_timeout(120)
                measured = page.evaluate('''() => {
                    const scale=visualViewport.scale, header=document.querySelector('.header');
                    const items=[...document.querySelectorAll('.soundBadgeList__item')].map(item=>item.getBoundingClientRect());
                    const search=document.querySelector('.headerSearch__input').getBoundingClientRect();
                    const title=document.querySelector('.soundTitle__title');
                    return {columns:getComputedStyle(document.querySelector('.soundBadgeList')).gridTemplateColumns.split(' ').length,
                        titleSize:parseFloat(getComputedStyle(title).fontSize)*scale,
                        tabHeight:document.querySelector('.g-tabs a').getBoundingClientRect().height*scale,
                        searchHeight:search.height*scale,searchRight:search.right,
                        headerPosition:getComputedStyle(header).position,
                        cardSpacing:(items[1].left-items[0].right)*scale,
                        overflow:document.documentElement.scrollWidth>innerWidth,
                        dockPadding:parseFloat(getComputedStyle(document.body).paddingBottom)*scale};
                }''')
                assert measured['columns'] == (3 if width == 844 else 2), measured
                assert measured['titleSize'] >= 15.9 and measured['tabHeight'] >= 43.9, measured
                assert measured['searchHeight'] >= 43.9 and measured['searchRight'] <= 980, measured
                assert measured['headerPosition'] == 'relative' and measured['cardSpacing'] >= 11.9, measured
                assert not measured['overflow'] and measured['dockPadding'] >= 60, measured
                page.get_by_role('button', name='Play fixture track 0', exact=True).click()
                page.locator('.g-tabs a').nth(1).click()
                assert page.evaluate('phoneActions') == ['Play fixture track 0', '/you/likes']
                page.screenshot(path=str(ROOT / f'test-results/phone-page-{engine}-{width}.png'))
                page.evaluate('''() => {
                    visualViewport.scale *= 2;
                    visualViewport.width /= 2;
                    visualViewport.height /= 2;
                    visualViewport.dispatchEvent(new Event('resize'));
                }''')
                page.wait_for_timeout(80)
                zoomed = page.locator('.soundTitle__title').first.evaluate('element => parseFloat(getComputedStyle(element).fontSize) * visualViewport.scale')
                assert zoomed >= 31.9, zoomed
                measured['zoomedTitleSize'] = zoomed
                assert not errors, errors
                evidence.append({'engine': engine, 'physicalWidth': width, 'simulatedAndroidGeometry': True, **measured})
                context.close()
            module = subprocess.check_output(
                ['node', '-p', "require('./tests/module-fixture.cjs')(['soundcloud/mobile-layout.js'])"],
                cwd=ROOT, text=True, encoding='utf-8',
            )
            page = browser.new_page(viewport={'width': 768, 'height': 900})
            page.set_content('<main>Lifecycle fixture</main>')
            page.add_script_tag(content=module)
            restored = page.evaluate('''() => {
                const root=document.documentElement;
                root.setAttribute('data-track-control-mobile-layout','before');
                root.style.setProperty('--tc-phone-scale','7','important');
                const layout=createMobileLayout(document);
                layout.update({touch:true,width:393,scale:.4},100);
                layout.update({touch:false});
                layout.dispose();
                return {attribute:root.getAttribute('data-track-control-mobile-layout'),scale:root.style.getPropertyValue('--tc-phone-scale'),priority:root.style.getPropertyPriority('--tc-phone-scale'),dock:root.style.getPropertyValue('--tc-phone-dock'),styles:document.querySelectorAll('style').length};
            }''')
            assert restored == {'attribute':'before','scale':'7','priority':'important','dock':'','styles':0}, restored
            page.close()
            browser.close()
    print(json.dumps(evidence))
finally:
    server.shutdown()
