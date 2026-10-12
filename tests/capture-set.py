"""Capture real set configuration, without publishing anyone's audio."""
import hashlib
import importlib
import json
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
from userscript_fixture import ROOT, browser_options, serve_site, userscript_bytes

s = importlib.import_module('capture-showcase')
s.DENSITY = 2
s.STAGING.mkdir(parents=True, exist_ok=True)
manifest = ROOT / 'docs/feature-capture-evidence.json'
evidence = json.loads(manifest.read_text(encoding='utf-8'))
assert evidence['artifactSha256'] == hashlib.sha256(userscript_bytes()).hexdigest()
evidence['screenshots'] = [item for item in evidence['screenshots'] if not item['file'].startswith('feature-set-')]
server, base = serve_site()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(**browser_options(), headless=True, args=['--mute-audio'])
        page = browser.new_page(viewport={'width': 1100, 'height': 1600}, device_scale_factor=2)
        page.on('pageerror', lambda error: evidence['pageErrors'].append(str(error)))
        page.route('**/api/shares*', lambda route: (_ for _ in ()).throw(AssertionError('Capture must not publish audio')))
        public_site = json.loads((ROOT / 'release.config.json').read_text())['siteUrl']
        parts = urlsplit(public_site)
        def relay(route):
            response = page.request.get(route.request.url, headers={'Origin': f'{parts.scheme}://{parts.netloc}'}, timeout=60000)
            headers = dict(response.headers)
            headers['access-control-allow-origin'] = base.split('/soundcloud-track-control/')[0]
            route.fulfill(response=response, headers=headers)
        page.route('**/api/resolve?*', relay)
        page.goto(base + 'set/', wait_until='networkidle')
        for url in ['https://soundcloud.com/sewerslvt/bring-me-the-horizon-drown-sewerslvt-remix', 'https://soundcloud.com/sewerslvt/pretty-cvnt']:
            page.locator('#set-source').fill(url)
            page.locator('#set-add').click()
            expect(page.locator('#set-status')).to_have_text('Track added.', timeout=60000)
        page.locator('#set-track-tempo-0').fill('0.9')
        page.locator('#set-track-tempo-0').press('Tab')
        page.locator('#set-track-pitch-1').fill('-3')
        page.locator('#set-track-pitch-1').press('Tab')
        expect(page.locator('#set-copy')).to_be_enabled()
        for theme in ['charcoal', 'light', 'oled']:
            page.locator('html').evaluate('(root, theme) => root.dataset.theme = theme', theme)
            for width, suffix in [(1100, ''), (390, '-mobile')]:
                page.set_viewport_size({'width': width, 'height': 1600})
                for image in page.locator('.set-artwork').all():
                    image.scroll_into_view_if_needed()
                    image.evaluate('image => image.decode()')
                page.locator('#set-tracks').scroll_into_view_if_needed()
                s.record_image(page, f'feature-set-{theme}{suffix}.png', evidence, selector='#set-tracks', state=f'Two real public tracks added through the set editor, using a test-only CORS relay to the public resolver; first at 0.9x, second at -3 st; 5 second crossfade. {theme} at {width}px. No render submitted or audio played.')
        assert not evidence['pageErrors'], evidence['pageErrors']
        browser.close()
    for item in evidence['screenshots']:
        if item['file'].startswith('feature-set-'):
            (s.STAGING / item['file']).replace(s.DESTINATION / item['file'])
    manifest.write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print('Captured 6 set-editor PNGs using real public track metadata. No audio was published.')
finally:
    server.shutdown()
