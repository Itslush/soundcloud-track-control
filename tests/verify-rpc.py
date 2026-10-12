import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from userscript_fixture import browser_options

ROOT = Path(__file__).resolve().parent.parent


def main():
    injection = json.loads((ROOT / 'test-results/rpc-host-injection.json').read_text(encoding='utf-8'))
    fixture = (ROOT / 'tests/fixtures/inline-fixture.html').read_text(encoding='utf-8')
    with sync_playwright() as p:
        browser = p.chromium.launch(**browser_options(), headless=True, args=['--mute-audio'])
        context = browser.new_context(viewport={'width': 1440, 'height': 900})
        context.route('https://soundcloud.com/**', lambda route: route.fulfill(body=fixture, content_type='text/html'))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('https://soundcloud.com/test-artist/first-track')
        page.evaluate("localStorage.setItem('soundcloud.tempo.controlStyle','slider'); localStorage.setItem('soundcloud.tempo.showKey','true')")
        page.evaluate(injection['inject'])
        expect(page.locator('#rate-number')).to_have_value('1')
        page.evaluate('''() => {
            window.audio = new Audio(); audio.muted = true;
            audio.dispatchEvent(new Event('loadedmetadata'));
            audio.play().catch(() => {}); audio.pause();
        }''')
        page.locator('#rate-number').fill('0.75')
        page.locator('#rate-number').press('Enter')
        assert page.evaluate('audio.playbackRate') == .75
        page.locator('.memory').click()
        assert page.evaluate("localStorage.getItem('soundcloud.tempo.track.%2Ftest-artist%2Ffirst-track')") == '0.75'
        page.locator('#quick-key-shift').fill('-0.5')
        page.locator('#quick-key-shift').press('Enter')
        assert page.evaluate("localStorage.getItem('soundcloud.tempo.keyShift')") == '-0.5'
        expect(page.locator('.soundcloud-tempo-pitch-notice')).to_contain_text('−0.5 st')
        page.locator('.settings-button').click()
        expect(page.locator('#tempo-settings')).to_be_visible()
        page.locator('.close-settings').click()
        expect(page.locator('#tempo-settings')).to_be_hidden()
        page.evaluate(injection['inject'])
        assert page.locator('#rate-number').count() == 1
        page.screenshot(path=str(ROOT / 'test-results/rpc-host-controls.png'))
        page.evaluate(injection['cleanup'])
        page.wait_for_function('!window.__soundCloudTempoControlV1')
        assert page.locator('#rate-number').count() == 0
        page.evaluate(injection['inject'])
        expect(page.locator('#rate-number')).to_have_value('0.75')
        assert not errors, errors
        browser.close()
    print('RPC host fixture passed: late injection, tempo, save, pitch field/notice, settings, reinjection, disable/reload, saved-state restore.')


if __name__ == '__main__':
    main()
