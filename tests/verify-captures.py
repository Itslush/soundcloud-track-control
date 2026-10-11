import hashlib
import json
import os
import subprocess
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright, expect
from userscript_fixture import ROOT, browser_options, serve_site

server, default_base = serve_site()
BASE = os.environ.get('SITE_URL', default_base)
evidence = json.loads((ROOT / 'docs/screenshot-evidence.json').read_text(encoding='utf-8'))
assert evidence['deviceScaleFactor'] == 3
assert evidence['muted'] is True
assert evidence['status'] == 'CAPTURED'
assert evidence['track'] == 'https://soundcloud.com/sewerslvt/bring-me-the-horizon-drown-sewerslvt-remix'
assert evidence['contextClosed'] and evidence['recipientContextClosed'] and evidence['browserClosed']
for playback in [evidence['audio'], evidence['recipientAudio']]:
    assert playback['media'] and playback['contexts']
    assert all(item['muted'] and item['volume'] == 0 and item['paused'] for item in playback['media'])
    assert all(item['sinkGain'] == 0 for item in playback['contexts'])
for contexts in [evidence['closedAudioContexts'], evidence['recipientClosedAudioContexts']]:
    assert contexts and all(item['state'] == 'closed' and item['sinkGain'] == 0 for item in contexts)
assert len(evidence['screenshots']) == 11
for capture in evidence['screenshots']:
    assert capture['url'].startswith(evidence['track'])
    image = (ROOT / 'site/public/screenshots' / capture['file']).read_bytes()
    assert hashlib.sha256(image).hexdigest() == capture['sha256'], capture['file']

features = json.loads((ROOT / 'docs/feature-capture-evidence.json').read_text(encoding='utf-8'))
assert features['status'] == 'CAPTURED'
assert features['artifactSha256'] == hashlib.sha256((ROOT / 'dist/soundcloud-tempo-control.user.js').read_bytes()).hexdigest()
assert not features['pageErrors']
assert features['audio']['media'] and all(item['muted'] and item['volume'] == 0 and item['paused'] for item in features['audio']['media'])
assert all(item['sinkGain'] == 0 for item in features['audio']['contexts'])
assert features['sharedAudio']['media'] and all(item['muted'] and item['volume'] == 0 and item['paused'] for item in features['sharedAudio']['media'])
assert all(item['sinkGain'] == 0 for item in features['sharedAudio']['contexts'])
for capture in features['screenshots']:
    image = (ROOT / 'site/public/screenshots' / capture['file']).read_bytes()
    assert hashlib.sha256(image).hexdigest() == capture['sha256'], capture['file']
    assert capture['width'] == round(capture['cssWidth'] * features['deviceScaleFactor'])
    assert capture['height'] == round(capture['cssHeight'] * features['deviceScaleFactor'])
count = len(features['screenshots']) // 6
assert len(features['screenshots']) == count * 6

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(**browser_options(), headless=True, args=['--mute-audio'])
    context = browser.new_context(device_scale_factor=2)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    measurements = []
    for width in [360, 390, 600, 768, 1280, 1440, 1920]:
        page.set_viewport_size({'width': width, 'height': 950})
        page.goto(BASE, wait_until='networkidle')
        links = page.locator('a[data-capture]')
        expect(links).to_have_count(count)
        expect(page.locator('.feature-details')).not_to_have_attribute('open', '')
        page.locator('.feature-details summary').click()
        expect(page.locator('.product-capture figcaption')).to_have_count(0)
        expect(page.locator('#capture-description, .viewer-hint')).to_have_count(0)
        assert page.locator('.product-proof').bounding_box()['y'] < page.locator('#install').bounding_box()['y']
        for link in links.all():
            image = link.locator('img')
            image.scroll_into_view_if_needed()
            image.evaluate('image => image.decode()')
            source = image.evaluate('image => image.currentSrc')
            assert image.get_attribute('width') and image.get_attribute('height')
            assert image.get_attribute('alt')
            if link.locator('..').evaluate('figure => figure.classList.contains("capture-controls")'):
                assert image.bounding_box()['width'] <= float(link.get_attribute('data-native-width')) + 1
            assert link.get_attribute('data-description') is None
            if width <= 600:
                assert 'mobile.png' in source, source
            link.click()
            expect(page.locator('.capture-viewer')).to_be_visible()
            expect(page.locator('.viewer-image')).to_be_visible()
            expect(page.locator('.viewer-image')).to_have_attribute('alt', image.get_attribute('alt'))
            expect(page.locator('.viewer-stage')).to_have_accessible_name('Full screenshot. Scroll to inspect when zoomed in. Escape closes the viewer.')
            assert page.locator('.viewer-stage').evaluate('stage => { const image = stage.querySelector("img").getBoundingClientRect(); return image.width <= stage.clientWidth && image.height <= stage.clientHeight; }'), width
            assert page.locator('.viewer-image').get_attribute('src').endswith(link.get_attribute('href'))
            page.locator('.viewer-actual').click()
            focal = [link.get_attribute('data-focus-x'), link.get_attribute('data-focus-y')]
            if all(focal):
                assert page.locator('.viewer-stage').evaluate('''(stage, focal) => {
                  const frame = stage.getBoundingClientRect();
                  const image = stage.querySelector('img').getBoundingClientRect();
                  const x = image.x + Number(focal[0]);
                  const y = image.y + Number(focal[1]);
                  return x >= frame.left && x <= frame.right && y >= frame.top && y <= frame.bottom;
                }''', focal), (width, focal)
            page.locator('.viewer-in').click()
            expect(page.locator('.viewer-zoom')).to_have_text('125%')
            page.locator('.viewer-fit').click()
            assert page.locator('.viewer-stage').evaluate('stage => { const image = stage.querySelector("img").getBoundingClientRect(); return image.width <= stage.clientWidth && image.height <= stage.clientHeight; }'), width
            page.locator('.viewer-actual').click()
            expect(page.locator('.viewer-zoom')).to_have_text('100%')
            page.locator('.viewer-stage').focus()
            page.keyboard.press('Escape')
            expect(page.locator('.capture-viewer')).not_to_be_visible()
            expect(link).to_be_focused()
            assert page.evaluate('document.documentElement.style.overflow') == ''
        assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), width
        measurements.append({'width': width, 'images': page.locator('.product-capture img').evaluate_all('images => images.map(image => ({source: image.currentSrc.split("/").pop(), width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height}))')})
    page.goto(BASE)
    for theme in ['light', 'oled', 'charcoal']:
        page.locator('html').evaluate('(root, theme) => root.dataset.theme = theme', theme)
        page.locator('.feature-details').evaluate('details => details.open = true')
        for index, link in enumerate(page.locator('a[data-capture]').all()):
            image = link.locator('img')
            image.scroll_into_view_if_needed()
            page.wait_for_function('(args) => {const image=document.querySelectorAll("a[data-capture] img")[args.index];return image.complete && image.currentSrc.includes(args.theme)}', arg={'index':index, 'theme':theme})
            assert f'-{theme}.png' in link.get_attribute('href')
    failed_image = page.locator('a[data-capture]').last.get_attribute('href')
    failure_pattern = '**/' + failed_image.split('/')[-1]
    page.route(failure_pattern, lambda route: route.abort())
    page.locator('a[data-capture]').last.click()
    expect(page.locator('.viewer-error')).to_be_visible()
    expect(page.locator('.viewer-fit')).to_be_disabled()
    expect(page.locator('.viewer-in')).to_be_disabled()
    expect(page.locator('.viewer-original')).to_have_attribute('href', urljoin(BASE, failed_image))
    page.unroute(failure_pattern)
    page.locator('.viewer-retry').click()
    expect(page.locator('.viewer-image')).to_be_visible()
    page.locator('.viewer-close').click()
    expect(page.locator('a[data-capture]').last).to_be_focused()
    no_js = browser.new_context(java_script_enabled=False)
    fallback = no_js.new_page()
    fallback.goto(BASE)
    expect(fallback.locator('a[data-capture]')).to_have_count(count)
    for link in fallback.locator('a[data-capture]').all():
        assert no_js.request.get(urljoin(BASE, link.get_attribute('href'))).ok
    assert not errors, errors
    browser.close()
    server.shutdown()
    (ROOT / 'test-results/capture-verification.json').write_text(json.dumps(measurements, indent=2) + '\n', encoding='utf-8')
    print(f'Passed: {count} focused capture views at 7 widths, all 3 theme sources, focus restoration, Escape, zoom, loading failure/retry, no-JS originals and muted provenance.')
