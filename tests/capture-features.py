"""Capture the shipped controls, not illustrations of them, in all website themes."""
import base64
import hashlib
import importlib
import json
from datetime import datetime, timezone
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright, expect
from userscript_fixture import ROOT, browser_options, choose_option, serve_site, userscript_bytes, userscript_source

s = importlib.import_module('capture-showcase')
s.DENSITY = 2
THEMES = ['charcoal', 'light', 'oled']
evidence = {
    'capturedAt': datetime.now(timezone.utc).isoformat(),
    'capture': 'Unedited screenshots of the exact built userscript on the public Drown track and the built website, using the plugin’s Light, Charcoal and OLED appearances. A test-only CORS relay loads real public metadata for the local shared player. No audio is audible. Website sharing captures are before publication, not fabricated render results.',
    'artifactSha256': hashlib.sha256(userscript_bytes()).hexdigest(),
    'deviceScaleFactor': 2, 'screenshots': [], 'pageErrors': [],
}
s.STAGING.mkdir(parents=True, exist_ok=True)
server, base = serve_site()


def capture(page, name, theme, selectors):
    viewport = page.viewport_size
    narrow_width = viewport['width'] if name in ['player', 'dial', 'vertical'] else 390
    for width, suffix in [(viewport['width'], ''), (narrow_width, '-mobile')]:
        page.set_viewport_size({'width': width, 'height': viewport['height']})
        page.wait_for_timeout(160)
        if name == 'vertical' and not page.locator('#tempo-fader').is_visible():
            page.locator('#vertical-toggle').click()
        for selector in selectors:
            page.locator(selector).scroll_into_view_if_needed()
        boxes = [page.locator(selector).bounding_box() for selector in selectors]
        x, y = min(box['x'] for box in boxes), min(box['y'] for box in boxes)
        right = max(box['x'] + box['width'] for box in boxes)
        bottom = max(box['y'] + box['height'] for box in boxes)
        s.record_image(page, f'feature-{name}-{theme}{suffix}.png', evidence,
                       clip={'x': max(0, x - 6), 'y': max(0, y - 6), 'width': right - x + 12, 'height': bottom - y + 12},
                       state=f'{name} controls, {theme} variant at {width}px; playback paused or not started.')
    page.set_viewport_size(viewport)
    print(f'Captured {name}: {theme}', flush=True)


def settings(page):
    if not page.locator('.settings').is_visible():
        page.locator('.settings-button').click()


def disclosure(page, selector, opened=True):
    element = page.locator(selector)
    if (element.get_attribute('open') is not None) != opened:
        element.locator('summary').first.click()


def theme(page, name):
    settings(page)
    disclosure(page, '.appearance-settings')
    page.locator(f'[name=appearance][value={name}]').check()
    page.locator('body').evaluate('(body, light) => {body.classList.toggle("theme-dark", !light); body.classList.toggle("theme-light", light)}', name == 'light')


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(**browser_options(), headless=True, args=['--mute-audio'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1200}, device_scale_factor=2)
        context.grant_permissions(['clipboard-read', 'clipboard-write'], origin='https://soundcloud.com')
        probe = (ROOT / 'tests/fixtures/buffered-player-probe.js').read_text()
        context.add_init_script(s.MUTE + '\n' + probe + '\n' + userscript_source())
        page = context.new_page()
        page.on('pageerror', lambda error: evidence['pageErrors'].append(str(error)))
        s.load_track(page, s.TRACK)
        page.locator('#quick-key-shift').fill('-3')
        page.locator('#quick-key-shift').press('Enter')
        s.save_speed(page, .9)
        for name in THEMES:
            theme(page, name)
            for style in ['slider', 'dial', 'vertical']:
                choose_option(page.locator('#control-style'), style)
                page.locator('.close-settings').click()
                if style == 'vertical':
                    page.locator('#vertical-toggle').click()
                    capture(page, style, name, ['#tempo-fader'])
                    page.keyboard.press('Escape')
                else:
                    capture(page, 'player' if style == 'slider' else style, name, ['#soundcloud-tempo-control .controls'])
                settings(page)
            choose_option(page.locator('#control-style'), 'slider')
        page.locator('.open-editor').click()
        page.locator('.point-rate').fill('1')
        page.locator('.point-rate').press('Tab')
        duration = s.media_state(page)[0]['duration']
        for x, time, rate, fade in [(235, round(duration / 3), .75, round(duration / 4)), (490, round(duration * .75), .9, round(duration / 3))]:
            page.locator('.editor-graph').dblclick(position={'x': x, 'y': 110})
            for field, value in [('time', time), ('rate', rate), ('duration', fade)]:
                page.locator('.point-' + field).fill(str(value))
                page.locator('.point-' + field).press('Tab')
            choose_option(page.locator('.point-curve'), 'smooth')
        page.locator('[data-lane=pitch]').click()
        for x, time, shift in [(235, round(duration / 3), 0), (490, round(duration * .75), 2)]:
            page.locator('.editor-graph').dblclick(position={'x': x, 'y': 110})
            for field, value in [('time', time), ('rate', shift), ('duration', 20)]:
                page.locator('.point-' + field).fill(str(value))
                page.locator('.point-' + field).press('Tab')
            choose_option(page.locator('.point-curve'), 'smooth')
        page.locator('.editor-save').click()
        expect(page.locator('.editor-status')).to_have_text('Timeline saved.')
        page.locator('.editor-link').click()
        shared = page.evaluate('navigator.clipboard.readText()')
        code = shared.split('#sct=', 1)[1]
        evidence['profile'] = json.loads(base64.urlsafe_b64decode(code[5:] + '==='))
        page.locator('.editor-close').click()
        for name in THEMES:
            theme(page, name)
            disclosure(page, '.appearance-settings', False)
            page.locator('.open-editor').click()
            for lane in ['tempo', 'pitch']:
                page.locator(f'[data-lane={lane}]').click()
                capture(page, lane, name, ['.editor-lanes', '.editor-toolbar', '.editor-graph', '.point-readout'])
            page.locator('.editor-close').click()
            settings(page)
            capture(page, 'saved', name, ['.quick-settings', '#saved-filter', '.saved-list'])
            disclosure(page, '.appearance-settings')
            capture(page, 'appearance', name, ['.appearance-settings'])
            capture(page, 'increments', name, ['.control-style-label', '.increment-label'])
            disclosure(page, '.appearance-settings', False)
            disclosure(page, '.advanced-audio')
            capture(page, 'crossfade', name, ['.advanced-audio > label:first-of-type', '[for=crossfade-seconds]', '#crossfade-seconds', '.crossfade-debug'])
            disclosure(page, '.pitch-customization')
            capture(page, 'semitones', name, ['.pitch-customization'])
            disclosure(page, '.pitch-customization', False)
            capture(page, 'output', name, ['[for=output-value]', '#output-level', '#output-help'])
            disclosure(page, '.advanced-audio', False)
            for feature, selector in [('shortcuts', '.shortcuts'), ('backup', '.library-backup')]:
                disclosure(page, selector)
                capture(page, feature, name, [selector])
                disclosure(page, selector, False)
            page.locator('.close-settings').click()
        evidence['audio'] = s.audio_evidence(page)
        page.evaluate('bufferedPlayerProbe.stop()')
        context.close()
        web = browser.new_context(viewport={'width': 1100, 'height': 1300}, device_scale_factor=2)
        web.add_init_script(s.MUTE.replace(" || location.origin !== 'https://soundcloud.com'", '') + '\n' + probe.replace("location.origin !== 'https://soundcloud.com' || ", ''))
        website = web.new_page()
        website.on('pageerror', lambda error: evidence['pageErrors'].append(str(error)))
        public_site = json.loads((ROOT / 'release.config.json').read_text())['siteUrl']
        parts = urlsplit(public_site)
        def relay(route):
            response = website.request.get(route.request.url, headers={'Origin': f'{parts.scheme}://{parts.netloc}'}, timeout=60000)
            headers = dict(response.headers)
            headers['access-control-allow-origin'] = base.split('/soundcloud-track-control/')[0]
            route.fulfill(response=response, headers=headers)
        website.route('**/api/resolve?*', relay)
        website.goto(base + 'share/#sct=' + code)
        website.locator('#preview-play').click()
        expect(website.locator('#preview-play')).to_have_text('Pause', timeout=60000)
        expect(website.locator('#preview-artwork')).to_be_visible()
        website.locator('#preview-artwork').evaluate('image => image.decode()')
        website.locator('#preview-play').click()
        expect(website.locator('#preview-play')).to_have_text('Play')
        evidence['sharedAudio'] = s.audio_evidence(website)
        for name in THEMES:
            website.locator('html').evaluate('(html, name) => html.dataset.theme = name', name)
            capture(website, 'shared', name, ['.demo-heading', '.preview-meta', '.preview-transport', '.preview-mode-row', '.editor-lanes', '.editor-graph'])
            website.locator('#discord-sharing summary').click()
            capture(website, 'discord', name, ['#discord-sharing'])
            website.locator('#discord-sharing summary').click()
        website.goto(base)
        for name in THEMES:
            website.locator('html').evaluate('(html, name) => html.dataset.theme = name', name)
            disclosure(website, '#preview-loader')
            capture(website, 'local', name, ['#preview-loader'])
            disclosure(website, '#preview-loader', False)
        assert not evidence['pageErrors'], evidence['pageErrors']
        assert len(evidence['screenshots']) == 96
        web.close()
        browser.close()
    evidence['status'] = 'CAPTURED'
    for item in evidence['screenshots']:
        (s.STAGING / item['file']).replace(s.DESTINATION / item['file'])
    (ROOT / 'docs/feature-capture-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print('Published 96 focused PNGs with source metadata and checksums.')
finally:
    server.shutdown()
