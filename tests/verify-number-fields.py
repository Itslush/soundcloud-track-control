import os
import re
from playwright.sync_api import sync_playwright, expect
from userscript_fixture import browser_options

BASE = os.environ.get('SITE_URL', 'http://127.0.0.1:4322/')

with sync_playwright() as p:
    browser = p.chromium.launch(**browser_options(), headless=True, args=['--mute-audio'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1100})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE, wait_until='networkidle')
    expect(page.locator('input[type=number]')).to_have_count(9)
    expect(page.locator('[data-number-field]')).to_have_count(2)
    expect(page.locator('.tempo-number')).to_have_count(7)
    page.locator('#preview-fixed').click()
    rate = page.locator('#demo-speed-number')
    plus = page.get_by_role('button', name='Increase tempo', exact=True)
    minus = page.get_by_role('button', name='Decrease tempo', exact=True)
    plus.click()
    expect(rate).to_have_value('1.025')
    minus.click()
    expect(rate).to_have_value('1')
    rate.press('ArrowUp')
    expect(rate).to_have_value('1.025')
    rate.press('ArrowDown')
    expect(rate).to_have_value('1')
    rate.fill('1.075')
    rate.press('Enter')
    plus.click()
    expect(rate).to_have_value('1.1')
    rate.fill('')
    rate.press('Enter')
    expect(rate).to_have_value('1.1')
    for value, expected, disabled in [('99', '4', plus), ('-1', '0.25', minus)]:
        rate.fill(value)
        rate.press('Enter')
        expect(rate).to_have_value(expected)
        expect(disabled).to_be_disabled()
        expect(page.locator('#demo-speed')).to_have_value(expected)
    pitch = page.locator('#demo-key-shift')
    page.get_by_role('button', name='Increase key shift', exact=True).click()
    expect(pitch).to_have_value('0.5')
    pitch.press('ArrowDown')
    expect(pitch).to_have_value('0')
    pitch.fill('-0.125')
    pitch.press('Enter')
    expect(pitch).to_have_value('-0.125')
    for width in [320, 360, 600, 768, 1001, 1024, 1440]:
        page.set_viewport_size({'width': width, 'height': 1100})
        assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), width
        for field in page.locator('[data-number-field] input').all():
            expect(field).to_have_accessible_name(re.compile(r'.+'))
            assert field.evaluate('input => getComputedStyle(input).appearance') == 'textfield'
        for button in page.locator('.number-step:visible').all():
            box = button.bounding_box()
            assert box['width'] >= 44 and box['height'] >= 44, (width, box)
    page.locator('#preview-timeline').click()
    page.locator('.editor-advanced summary').click()
    target = page.locator('.point-rate')
    target.fill('1')
    target.press('Tab')
    page.get_by_role('button', name='Increase value', exact=True).click()
    expect(target).to_have_value('1.025')
    for selector in ['.point-time', '.point-duration']:
        field = page.locator(selector)
        expect(field).to_be_disabled()
        for button in field.locator('..').get_by_role('button').all():
            expect(button).to_be_disabled()
    page.locator('#preview-fixed').click()
    rate.fill('1')
    rate.press('Enter')
    plus.focus()
    plus.press('Space')
    expect(rate).to_have_value('1.025')
    page.emulate_media(forced_colors='active', reduced_motion='reduce')
    minus.focus()
    assert minus.evaluate('button => getComputedStyle(button).outlineStyle') != 'none'
    assert errors == [], errors
    browser.close()
print('Current fixed controls and shared timeline: typing, fractional values, arrows, keyboard, bounds, disabled sync, 44px targets, seven widths and forced-colour focus passed.')
