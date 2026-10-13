import json
import re
from playwright.sync_api import sync_playwright, expect
from userscript_fixture import ROOT, userscript_source, userscript_bytes, browser_options, text_contrast

KEY = 'soundcloud.tempo.seenVersion'
VERSION = json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
homepage = re.search(r'^// @homepageURL\s+(https://\S+)', userscript_bytes().decode('utf-8'), re.MULTILINE)


def verify_phone_notice(browser, engine):
    for width, height in [(320, 640), (393, 844), (844, 393), (393, 360)]:
        scale = width / 980
        for theme in ['native', 'light', 'charcoal', 'oled']:
            context = browser.new_context(viewport={'width': 980, 'height': round(height / scale)}, has_touch=True)
            context.route('https://soundcloud.com/**', lambda route: route.fulfill(path=str(ROOT/'tests/fixtures/inline-fixture.html')))
            context.add_init_script(f'''(() => {{
                Object.defineProperty(window,'visualViewport',{{value:Object.assign(new EventTarget(),{{width:980,height:{height / scale},scale:{scale},offsetTop:0,offsetLeft:0}})}});
                Object.defineProperty(screen,'width',{{value:{width}}});
                Object.defineProperty(screen,'height',{{value:{height}}});
                Object.defineProperty(navigator,'maxTouchPoints',{{value:5}});
                localStorage.setItem('{KEY}','0.9.0');
                localStorage.setItem('soundcloud.tempo.appearance','{theme}');
            }})();\n''' + userscript_source())
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto('https://soundcloud.com/test-artist/first-track')
            host = page.locator('#soundcloud-tempo-control')
            notice = page.locator('.release-notice')
            expect(host).to_have_attribute('data-touch-player', '')
            if theme != 'native':
                expect(page.locator('html')).to_have_attribute('data-tempo-appearance', theme)
            expect(notice).to_be_visible()
            page.evaluate('''() => {
                const inner=document.createElement('div');
                inner.style.transform='translateY(0)';
                const elements=document.querySelector('.playControls__elements');
                elements.before(inner);inner.append(elements);
            }''')
            page.wait_for_timeout(100)
            geometry = notice.evaluate('''notice => {
                const host=notice.getRootNode().host, box=notice.getBoundingClientRect();
                const dock=host.getBoundingClientRect(), transport=host.shadowRoot.querySelector('.touch-transport').getBoundingClientRect();
                return {top:box.top,bottom:box.bottom,left:box.left,right:box.right,dockTop:dock.top,transportTop:transport.top};
            }''')
            assert geometry['top'] >= geometry['dockTop'] and geometry['bottom'] <= geometry['transportTop'], geometry
            assert geometry['top'] >= 0 and geometry['right'] <= 980 and geometry['left'] >= 0, geometry
            for selector in ['span', 'a', 'button']:
                element = notice.locator(selector)
                assert float(element.evaluate('el=>parseFloat(getComputedStyle(el).fontSize)')) >= 14
                assert text_contrast(element) >= 4.5
                if selector != 'span':
                    assert element.bounding_box()['height'] * scale >= 43.9
            if width == 393 and height == 844:
                page.screenshot(path=str(ROOT/'test-results'/f'phone-notice-{engine}-{theme}.png'))
            page.locator('.touch-settings').focus()
            page.keyboard.press('Enter')
            expect(page.locator('.settings')).to_be_visible()
            page.keyboard.press('Escape')
            expect(page.locator('.touch-settings')).to_be_focused()
            notice.locator('button').focus()
            page.keyboard.press('Enter')
            expect(notice).to_have_count(0)
            expect(page.locator('.touch-settings')).to_be_focused()
            page.wait_for_timeout(100)
            dock = host.bounding_box()
            assert dock['y'] + dock['height'] <= height / scale + 2, dock
            assert not errors, errors
            context.close()


with sync_playwright() as p:
    browser = p.chromium.launch(**browser_options(), headless=True, args=['--mute-audio'])
    context = browser.new_context()
    context.route('https://soundcloud.com/**', lambda route: route.fulfill(path=str(ROOT/'tests/fixtures/inline-fixture.html')))
    context.add_init_script(userscript_source())
    page = context.new_page()
    page.goto('https://soundcloud.com/test-artist/first-track')
    expect(page.locator('#rate-number')).to_be_visible()
    expect(page.locator('.release-notice')).to_have_count(0)
    assert page.evaluate('key=>localStorage.getItem(key)', KEY) == VERSION
    page.evaluate('key=>localStorage.setItem(key,"0.9.0")', KEY)
    page.reload()
    expect(page.locator('.release-notice')).to_contain_text(f'v{VERSION}')
    expect(page.locator('.release-notice a')).to_have_count(1 if homepage else 0)
    if homepage:
        expect(page.locator('.release-notice a')).to_have_attribute('href', homepage.group(1).rstrip('/')+'/updates/')
    page.locator('.release-notice button').click()
    expect(page.locator('.release-notice')).to_have_count(0)
    page.reload()
    expect(page.locator('.release-notice')).to_have_count(0)
    second = context.new_page()
    second.goto('https://soundcloud.com/test-artist/first-track')
    expect(second.locator('.release-notice')).to_have_count(0)
    blocked = browser.new_context()
    blocked.route('https://soundcloud.com/**', lambda route: route.fulfill(path=str(ROOT/'tests/fixtures/inline-fixture.html')))
    blocked.add_init_script('Storage.prototype.setItem=()=>{throw new Error("blocked")};\n'+userscript_source())
    third = blocked.new_page()
    third.goto('https://soundcloud.com/test-artist/first-track')
    expect(third.locator('#rate-number')).to_be_visible()
    expect(third.locator('.release-notice')).to_have_count(0)
    verify_phone_notice(browser, 'chromium')
    browser.close()
    firefox = p.firefox.launch(headless=True)
    verify_phone_notice(firefox, 'firefox')
    firefox.close()
print('One-time notice and phone notice bounds, controls, focus and contrast passed in Chromium and Firefox, all themes.')
