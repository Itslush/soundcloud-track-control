"""Capture the shipped landing layout and a source-image contact sheet."""
import json
from playwright.sync_api import sync_playwright
from userscript_fixture import ROOT, browser_options, serve_site, text_contrast

destination = ROOT / '.impeccable/review'
destination.mkdir(parents=True, exist_ok=True)
server, base = serve_site()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(**browser_options(), headless=True, args=['--mute-audio'])
        page = browser.new_page(device_scale_factor=1)
        for theme in ['charcoal', 'light', 'oled']:
            for width, name in [(1440, 'desktop'), (390, 'mobile')]:
                page.set_viewport_size({'width': width, 'height': 1000})
                page.goto(base, wait_until='networkidle')
                page.locator('html').evaluate('(root, theme) => root.dataset.theme = theme', theme)
                for text in page.locator('.proof-copy h2, .proof-copy p, .proof-copy a, .feature-overview dt, .feature-overview dd, .feature-details summary').all():
                    if text.is_visible():
                        assert text_contrast(text) >= 4.5, (theme, text.inner_text())
                for image in page.locator('.product-capture img').all():
                    if image.is_visible():
                        image.scroll_into_view_if_needed()
                        image.evaluate('image => image.decode()')
                page.evaluate('scrollTo(0, 0)')
                page.screenshot(path=str(destination / f'landing-{name}-{theme}.png'), full_page=True, animations='disabled')
                if theme == 'charcoal':
                    page.screenshot(path=str(destination / f'{name}.png'), full_page=True, animations='disabled')
                page.screenshot(path=str(destination / f'landing-hero-{name}-{theme}.png'), animations='disabled')
                for section in ['.product-proof', '.feature-information']:
                    page.evaluate('scrollTo(0, 0)')
                    bounds = page.locator(section).bounding_box()
                    page.screenshot(path=str(destination / f'landing-{"proof" if section == ".product-proof" else "details"}-{name}-{theme}.png'), clip=bounds, full_page=True, animations='disabled')
                for feature in ['player', 'styles', 'shared', 'set']:
                    page.evaluate('scrollTo(0, 0)')
                    bounds = page.locator(f'#feature-{feature}').bounding_box()
                    page.screenshot(path=str(destination / f'landing-row-{feature}-{name}-{theme}.png'), clip=bounds, full_page=True, animations='disabled')
            files = [item for item in json.loads((ROOT / 'docs/feature-capture-evidence.json').read_text())['screenshots'] if f'-{theme}' in item['file']]
            page.set_viewport_size({'width': 1440, 'height': 1000})
            page.set_content('<style>body{background:#ddd;margin:16px;font:14px Arial}main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0;background:white}img{width:100%;height:360px;object-fit:contain}figcaption{padding:8px;word-break:break-word}</style><main>' + ''.join(f'<figure><img src="{base}screenshots/{item["file"]}"><figcaption>{item["file"]}</figcaption></figure>' for item in files) + '</main>')
            for image in page.locator('img').all():
                image.evaluate('image => image.decode()')
            page.screenshot(path=str(destination / f'capture-sheet-{theme}.png'), full_page=True)
        browser.close()
finally:
    server.shutdown()
print('Landing layout and all 102 source captures recorded for the batched visual review.')
