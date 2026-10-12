import json
from playwright.sync_api import expect, sync_playwright
from userscript_fixture import ROOT, browser_options, userscript_source


with sync_playwright() as runtime:
    browser = runtime.chromium.launch(**browser_options(), headless=True, args=['--mute-audio'])
    context = browser.new_context()
    context.add_init_script(userscript_source())
    context.route('https://soundcloud.com/**', lambda route: route.fulfill(path=str(ROOT / 'tests/fixtures/inline-fixture.html')))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('https://soundcloud.com/test-artist/first-track')
    expect(page.locator('#rate-number')).to_be_visible()
    page.evaluate('''() => {
        const bar = document.querySelector('.playControls__elements');
        const inner = document.createElement('div');
        inner.className = 'playControls__inner l-container';
        bar.replaceWith(inner); inner.append(bar);
        const style = document.createElement('style');
        style.textContent = '.playControls__inner{width:1240px;max-width:1240px;margin:auto} .playbackSoundBadge__titleContextContainer{width:160px;max-width:160px}';
        document.head.append(style);
    }''')
    reports = []
    for mode in ['light', 'charcoal', 'oled']:
        page.set_viewport_size({'width': 1440, 'height': 900})
        page.locator('.settings-button').click()
        if page.locator('.appearance-settings').get_attribute('open') is None:
            page.locator('.appearance-settings summary').click()
        page.locator(f'[name=appearance][value={mode}]').check()
        page.locator('.close-settings').click()
        for width in [1920, 1440, 1050, 768, 390, 320]:
            page.set_viewport_size({'width': width, 'height': 900})
            bounds = page.locator('.playControls__inner').bounding_box()
            assert bounds['x'] == 0 and abs(bounds['width'] - width) <= 1, bounds
            title = page.locator('.playbackSoundBadge__titleLink')
            expect(title).to_have_text('A track with a deliberately long title')
            assert title.bounding_box()['width'] >= 70, (width, title.bounding_box())
            assert page.locator('.playControls__elements').evaluate('el => el.scrollWidth <= el.clientWidth + 1')
            if width >= 1440:
                assert title.bounding_box()['width'] > 160
            page.locator('.playControls').screenshot(path=str(ROOT / f'test-results/footer-{mode}-{width}.png'))
            reports.append({'theme': mode, 'width': width, 'titleWidth': title.bounding_box()['width']})
    assert not errors, errors
    browser.close()
    (ROOT / 'test-results/footer-width.json').write_text(json.dumps(reports, indent=2))
    print('Footer checks passed: full window width, long title retained, no player overflow in 18 theme/width combinations.')
