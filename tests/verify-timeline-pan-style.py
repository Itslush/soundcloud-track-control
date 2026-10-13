import json

from playwright.sync_api import expect, sync_playwright
from userscript_fixture import ROOT, serve_site, userscript_source


server, base = serve_site()
results = []
try:
    with sync_playwright() as playwright:
        for engine in ['chromium', 'firefox']:
            browser = getattr(playwright, engine).launch(headless=True)
            for surface in ['site', 'userscript']:
                page = browser.new_page(viewport={'width': 1050, 'height': 1000}, reduced_motion='reduce')
                if surface == 'site':
                    page.goto(base, wait_until='networkidle')
                else:
                    page.route('https://soundcloud.com/**', lambda route: route.fulfill(
                        path=str(ROOT / 'tests/fixtures/inline-fixture.html'), content_type='text/html'))
                    page.add_init_script(userscript_source())
                    page.goto('https://soundcloud.com/test-artist/first-track')
                    page.evaluate('''() => {
                        const audio = new Audio(); audio.muted = true;
                        Object.defineProperty(audio, 'duration', {value: 200});
                        document.body.append(audio);
                    }''')
                    page.locator('.settings-button').click()
                    page.locator('.open-editor').click()
                page.locator('.zoom-in').click()
                slider = page.get_by_role('slider', name='Scroll timeline')
                expect(slider).to_be_visible()
                for theme in ['charcoal', 'light', 'oled']:
                    if surface == 'site':
                        page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
                    else:
                        page.locator(f'[name=appearance][value={theme}]').evaluate('''el => {
                            el.checked = true; el.dispatchEvent(new Event('change', {bubbles: true}));
                        }''')
                        expect(page.locator('html')).to_have_attribute('data-tempo-appearance', theme)
                    slider.focus()
                    slider.press('Home')
                    before = slider.input_value()
                    slider.press('ArrowRight')
                    assert float(slider.input_value()) > float(before)
                    style = slider.evaluate('''el => {
                        const style = getComputedStyle(el);
                        return {background: style.backgroundImage, border: style.borderTopWidth,
                            height: style.height, fill: style.getPropertyValue('--range-fill')};
                    }''')
                    assert 'linear-gradient' in style['background'], (engine, surface, theme, style)
                    assert style['border'] == '0px', (engine, surface, theme, style)
                    assert float(style['height'].removesuffix('px')) >= 28
                    slider.hover()
                    assert slider.evaluate('el => getComputedStyle(el).getPropertyValue("--range-thumb-opacity").trim()') == '1'
                    slider.screenshot(path=str(ROOT / f'test-results/timeline-pan-style-{surface}-{engine}-{theme}.png'))
                    results.append({'surface': surface, 'engine': engine, 'theme': theme, **style})
                page.close()
            browser.close()
finally:
    server.shutdown()
print(json.dumps(results))
