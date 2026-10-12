import json
from playwright.sync_api import sync_playwright, expect
from userscript_fixture import ROOT, browser_options, userscript_source


with sync_playwright() as p:
    browser = p.chromium.launch(**browser_options(), headless=True, args=['--mute-audio'])
    page = browser.new_page(viewport={'width': 1050, 'height': 900})
    page.route('https://soundcloud.com/**', lambda route: route.fulfill(
        path=str(ROOT / 'tests/fixtures/inline-fixture.html'), content_type='text/html'))
    page.add_init_script(userscript_source())
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('https://soundcloud.com/test-artist/first-track')
    page.locator('#quick-key-shift').fill('12')
    page.locator('#quick-key-shift').press('Tab')
    page.evaluate('''() => {
      window.audio = new Audio(); audio.muted = true;
      Object.defineProperty(audio, 'duration', {value: 200});
      document.body.append(audio);
    }''')
    page.locator('.settings-button').click()
    page.locator('.open-editor').click()
    page.locator('.editor-key-shift').fill('-3')
    page.locator('.editor-key-shift').press('Tab')
    page.locator('.editor-apply-once').click()
    expect(page.locator('#quick-key-shift')).to_have_value('-3')
    expect(page.locator('.editor-status')).to_have_text('Applied for this session.')
    assert not errors, errors
    browser.close()
    print(json.dumps({'editor_pitch_field_to_session_playback': 'passed', 'errors': 0, 'silent': True}))
