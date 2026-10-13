import json
import subprocess
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright
from userscript_fixture import ROOT, userscript_source


source = userscript_source()
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
                page.evaluate('''fragment => {
                    const shell = document.createElement('template');
                    shell.innerHTML = fragment;
                    document.querySelector('main').replaceWith(shell.content);
                    const inner = document.createElement('div');
                    inner.className = 'playControls__inner';
                    const elements = document.querySelector('.playControls__elements');
                    elements.before(inner);
                    inner.append(elements);
                    const tile = index => '<article class="playableTile"><div class="playableTile__artwork"><div class="playableTile__image"></div><div class="playableTile__playButton"><button class="playButton" aria-label="Play fixture track '+index+'">Play</button></div></div><div class="playableTile__description"><a class="playableTile__heading playableTile__mainHeading sc-truncate" href="/fixture/track-'+index+'">Fixture track '+index+' with a long readable title</a><span class="playableTile__heading sc-truncate">Fixture artist</span></div></article>';
                    document.querySelector('.lazyLoadingList__list').innerHTML = Array.from({length:14},(_,i)=>'<li>'+tile(i)+'</li>').join('');
                    document.querySelector('.tileGallery__sliderPanel').innerHTML = Array.from({length:6},(_,i)=>'<div class="tileGallery__sliderPanelSlide m-sixPanels">'+(i < 4 ? tile(i+14) : '')+'</div>').join('');
                    document.querySelector('.tileGallery__slideForwardButton').onclick = () => {
                        document.querySelectorAll('.tileGallery__sliderPanelSlide:empty').forEach((slide,i)=>slide.innerHTML=tile(i+18));
                        document.querySelector('.tileGallery').classList.remove('m-hasItemsForward');
                    };
                    window.phoneActions = [];
                    document.querySelector('main').addEventListener('click', event => {
                        const target=event.target.closest('a,button');
                        if(target){event.preventDefault();phoneActions.push(target.getAttribute('href')||target.getAttribute('aria-label'));}
                    });
                }''', (ROOT / 'tests/fixtures/mobile-host-fragment.html').read_text(encoding='utf-8'))
                page.wait_for_timeout(100)
                dock = host.bounding_box()
                assert dock['y'] >= 0 and dock['y'] + dock['height'] <= 844 / scale + 2, dock
                expect(page.locator('.playControls__play')).to_be_hidden()
                page.locator('.touch-settings').click()
                expect(page.locator('.settings')).to_be_visible()
                page.keyboard.press('Escape')
                expect(page.locator('.touch-settings')).to_be_focused()
                first_play = page.get_by_role('button', name='Play fixture track 0', exact=True, include_hidden=True)
                first_play.evaluate("el => el.classList.add('sc-button-buffering')")
                expect(first_play).to_be_hidden()
                first_play.evaluate("el => el.classList.remove('sc-button-buffering')")
                expect(first_play).to_be_visible()
                expect(page.locator('html')).to_have_attribute('data-track-control-mobile-layout', '')
                page.wait_for_timeout(120)
                for selector, minimum in [('.header__right svg', 21.9), ('.header__userNavAvatar .image__full', 25.9), ('.headerSearch__submit svg', 21.9), ('.notificationIcon__badge', 7.9)]:
                    for element in page.locator(selector).all():
                        bounds = element.bounding_box()
                        assert min(bounds['width'], bounds['height']) * scale >= minimum, (selector, bounds, scale)
                for element in page.locator('.l-footer a').all():
                    assert float(element.evaluate('el=>parseFloat(getComputedStyle(el).fontSize)')) * scale >= 13.9
                    assert element.bounding_box()['height'] * scale >= 43.9
                for element in page.locator('.sidebarHeader__actualTitle,.sidebarHeader__more').all():
                    assert float(element.evaluate('el=>parseFloat(getComputedStyle(el).fontSize)')) * scale >= 13.9
                assert page.locator('.banner__content span').evaluate('el=>parseFloat(getComputedStyle(el).fontSize)*visualViewport.scale') >= 13.9
                for element in page.locator('.banner__close,.mobileAppsButtons a').all():
                    bounds = element.bounding_box()
                    assert bounds['height'] * scale >= 43.9 and bounds['x'] + bounds['width'] <= 980, bounds
                measured = page.evaluate('''() => {
                    const scale=visualViewport.scale, header=document.querySelector('.header');
                    const items=[...document.querySelectorAll('.fixture-library > li')].map(item=>item.getBoundingClientRect());
                    const search=document.querySelector('.headerSearch__input').getBoundingClientRect();
                    const title=document.querySelector('.playableTile__mainHeading');
                    const main=document.querySelector('.l-main').getBoundingClientRect(), sidebar=document.querySelector('.l-sidebar-right').getBoundingClientRect();
                    const gallery=document.querySelector('.tileGallery__slider'), panel=gallery.firstElementChild;
                    return {columns:getComputedStyle(document.querySelector('.lazyLoadingList__list')).gridTemplateColumns.split(' ').length,
                        titleSize:parseFloat(getComputedStyle(title).fontSize)*scale,
                        wrappedTitle:title.getBoundingClientRect().height*scale > 40,
                        sidebarAfterMain:sidebar.top >= main.bottom - 1,
                        sidebarPosition:getComputedStyle(document.querySelector('.streamSidebar')).position,
                        galleryColumns:getComputedStyle(panel).gridTemplateColumns.split(' ').length,
                        galleryUnclipped:panel.scrollHeight <= panel.clientHeight + 1,
                        galleryWidth:gallery.clientWidth * scale,
                        tabHeight:document.querySelector('.g-tabs a').getBoundingClientRect().height*scale,
                        searchHeight:search.height*scale,searchRight:search.right,
                        headerPosition:getComputedStyle(header).position,
                        cardSpacing:(items[1].left-items[0].right)*scale,
                        overflow:document.documentElement.scrollWidth>innerWidth,
                        dockPadding:parseFloat(getComputedStyle(document.body).paddingBottom)*scale};
                }''')
                assert measured['columns'] == (3 if width == 844 else 2), measured
                assert measured['wrappedTitle'] and measured['sidebarAfterMain'] and measured['sidebarPosition'] == 'static', measured
                assert measured['galleryColumns'] == measured['columns'] and measured['galleryUnclipped'], measured
                assert measured['galleryWidth'] >= width - 26, measured
                assert measured['titleSize'] >= 15.9 and measured['tabHeight'] >= 43.9, measured
                assert measured['searchHeight'] >= 43.9 and measured['searchRight'] <= 980, measured
                assert measured['headerPosition'] == 'relative' and measured['cardSpacing'] >= 11.9, measured
                assert not measured['overflow'] and measured['dockPadding'] >= 60, measured
                page.get_by_role('button', name='Play fixture track 0', exact=True).click()
                page.locator('.g-tabs a').nth(1).click()
                assert page.evaluate('phoneActions') == ['Play fixture track 0', '/you/likes']
                expect(page.locator('.tileGallery__sliderPanelSlide:empty')).to_have_count(2)
                page.get_by_role('button', name='Next tracks', exact=True).click()
                expect(page.locator('.tileGallery__sliderPanelSlide:empty')).to_have_count(0)
                expect(page.get_by_role('button', name='Next tracks', exact=True)).to_be_hidden()
                expect(page.get_by_role('button', name='Play fixture track 14', exact=True)).to_be_visible()
                page.get_by_role('button', name='Play fixture track 19', exact=True).click()
                assert page.evaluate('phoneActions.at(-1)') == 'Play fixture track 19'
                page.locator('.l-footer a[href="/pages/privacy"]').focus()
                page.keyboard.press('Enter')
                assert page.evaluate('phoneActions.at(-1)') == '/pages/privacy'
                page.evaluate('window.scrollTo(0,0)')
                page.screenshot(path=str(ROOT / f'test-results/phone-page-{engine}-{width}.png'))
                page.evaluate('''() => {
                    const list=document.querySelector('.fixture-library'), wrapper=document.createElement('div');
                    wrapper.className='soundBadgeList';
                    list.before(wrapper); wrapper.append(list);
                    list.className='fixture-library sc-list-nostyle sc-clearfix';
                    for(const item of list.children)item.className='soundBadgeList__item';
                }''')
                assert page.locator('.fixture-library').evaluate('el => getComputedStyle(el).gridTemplateColumns.split(" ").length') == measured['columns']
                page.evaluate('''() => {
                    visualViewport.scale *= 2;
                    visualViewport.width /= 2;
                    visualViewport.height /= 2;
                    visualViewport.dispatchEvent(new Event('resize'));
                }''')
                page.wait_for_timeout(80)
                zoomed = page.locator('.playableTile__mainHeading').first.evaluate('element => parseFloat(getComputedStyle(element).fontSize) * visualViewport.scale')
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
