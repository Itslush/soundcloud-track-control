import io
import math
import struct
import wave
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright
from userscript_fixture import ROOT, browser_options, serve_site, userscript_source


def tone(hz):
    data = io.BytesIO()
    with wave.open(data, 'wb') as out:
        out.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
        second = b''.join(
            struct.pack('<h', round(10000 * math.sin(2 * math.pi * hz * i / 16000)))
            for i in range(16000)
        )
        out.writeframes(second * 15)
    return data.getvalue()


server, base = serve_site()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            **browser_options(), headless=True, args=['--mute-audio']
        )
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.add_init_script(userscript_source())

        published_base = 'https://itslush.github.io/soundcloud-track-control/'

        def published(route):
            relative = urlsplit(route.request.url).path.removeprefix(
                '/soundcloud-track-control/'
            )
            path = ROOT / 'dist/site' / relative
            if path.is_dir():
                path = path / 'index.html'
            if path.is_file():
                route.fulfill(path=path)
            else:
                route.abort()

        pcm = tone(440)
        page.route(published_base + '**', published)
        page.route(
            'https://soundcloud.com/artist/track',
            lambda r: r.fulfill(
                path=ROOT / 'tests/fixtures/inline-fixture.html',
                content_type='text/html',
            ),
        )
        page.route(
            '**/api/resolve?*',
            lambda r: r.fulfill(
                json={
                    'title': 'Alpha Beta',
                    'artist': 'Artist',
                    'duration': 15,
                    'permalink': r.request.url,
                    'stream': base + 'tone.wav',
                    'format': 'audio',
                    'preview': False,
                },
                headers={'Access-Control-Allow-Origin': '*'},
            ),
        )
        page.route(
            '**/tone.wav',
            lambda r: r.fulfill(
                body=pcm,
                content_type='audio/wav',
                headers={'Access-Control-Allow-Origin': '*'},
            ),
        )

        page.goto('https://soundcloud.com/artist/track')
        expect(page.locator('#rate-slider')).to_be_visible()

        page.evaluate("""() => {
            window.nativePlays = 0;
            const main = document.querySelector('main');
            const makeCard = (cls, linkCls, href, title) => {
                const card = document.createElement('div');
                card.className = cls;
                card.style.cssText = 'display:flex;align-items:center;gap:10px;margin:12px 0;padding:10px;border:1px solid #333;border-radius:4px;';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'sc-button-play';
                btn.textContent = 'Play';
                btn.style.cssText = 'padding:6px 10px;border:1px solid #666;border-radius:3px;';
                btn.addEventListener('click', () => { window.nativePlays++; });
                const link = document.createElement('a');
                link.className = linkCls;
                link.href = href;
                link.textContent = title;
                card.append(btn, link);
                return card;
            };
            main.append(
                makeCard('sound', 'soundTitle__title', '/artist/alpha', 'Alpha Track'),
                makeCard('playableTile', 'playableTile__mainHeading', '/artist/beta', 'Beta Track'),
            );
            const audio = document.createElement('audio');
            audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
            document.body.append(audio);
        }""")

        # Idle state: no DJ pills or style injected, normal native click increments nativePlays.
        expect(page.locator('.tempo-dj-pills')).to_have_count(0)
        expect(page.locator('#soundcloud-tempo-dj-style')).to_have_count(0)
        page.locator('.sound .sc-button-play').click()
        assert page.evaluate('window.nativePlays') == 1

        # Toggle DJ Mode via Alt+Shift+D.
        page.keyboard.press('Alt+Shift+KeyD')
        panel = page.get_by_role('region', name='Two-deck mixer')
        expect(panel).to_be_visible()
        frame = page.frame_locator('iframe[title="Two mixer decks"]')
        dj_btn = frame.get_by_role('button', name='DJ', exact=True)
        expect(dj_btn).to_have_attribute('aria-pressed', 'true')
        expect(page.locator('.tempo-dj-pills')).to_have_count(2)
        expect(page.locator('#soundcloud-tempo-dj-style')).to_have_count(1)
        page.wait_for_timeout(200)
        page.screenshot(path=str(ROOT / 'test-results/dj-mode-desktop.png'))

        # Click play buttons -> blocks SoundCloud native play and auto-routes A -> B.
        page.locator('.sound .sc-button-play').click()
        assert page.evaluate('window.nativePlays') == 1
        deck_a = frame.get_by_role('region', name='Deck A', exact=True)
        deck_b = frame.get_by_role('region', name='Deck B', exact=True)
        expect(deck_a.get_by_label('SoundCloud track URL')).to_have_value(
            'https://soundcloud.com/artist/alpha'
        )
        page.locator('.playableTile .sc-button-play').click()
        assert page.evaluate('window.nativePlays') == 1
        expect(deck_b.get_by_label('SoundCloud track URL')).to_have_value(
            'https://soundcloud.com/artist/beta'
        )

        # Explicit +A pill sends directly to Deck A.
        page.locator('.playableTile .tempo-dj-pill[data-dj-deck="A"]').click()
        expect(deck_a.get_by_label('SoundCloud track URL')).to_have_value(
            'https://soundcloud.com/artist/beta'
        )

        # Toggle DJ Mode OFF -> cleans up pills & style, restores native click.
        page.keyboard.press('Alt+Shift+KeyD')
        expect(page.locator('.tempo-dj-pills')).to_have_count(0)
        expect(page.locator('#soundcloud-tempo-dj-style')).to_have_count(0)
        expect(dj_btn).to_have_attribute('aria-pressed', 'false')
        page.locator('.sound .sc-button-play').click()
        assert page.evaluate('window.nativePlays') == 2

        # Customize DJ mode keybind in Shortcuts settings.
        page.get_by_role('button', name='Tempo settings', exact=True).click()
        page.locator('.shortcuts summary').click()
        dj_kb = page.locator('.kb-key[data-action="djMode"]')
        expect(dj_kb).to_be_visible()
        expect(dj_kb).to_have_text('Alt+Shift+D')
        page.screenshot(path=str(ROOT / 'test-results/settings-shortcuts-desktop.png'))
        dj_kb.click()
        expect(dj_kb).to_have_text('Press keys…')
        page.keyboard.press('Alt+Shift+KeyM')
        expect(dj_kb).to_have_text('Alt+Shift+M')

        page.keyboard.press('Escape')
        expect(page.locator('#tempo-settings')).to_be_hidden()
        page.keyboard.press('Alt+Shift+KeyD')
        expect(page.locator('.tempo-dj-pills')).to_have_count(0)
        page.keyboard.press('Alt+Shift+KeyM')
        expect(page.locator('.tempo-dj-pills')).to_have_count(2)
        page.keyboard.press('Alt+Shift+KeyM')
        expect(page.locator('.tempo-dj-pills')).to_have_count(0)

        # Reset shortcuts -> restored to Alt+Shift+D.
        page.get_by_role('button', name='Tempo settings', exact=True).click()
        page.locator('#kb-reset').click()
        expect(dj_kb).to_have_text('Alt+Shift+D')
        page.locator('.shortcuts summary').click()

        # Verify unlimited Volume Cap persistence & Master FX / Presets / Tools / DSP HUD.
        page.locator('.advanced-audio > summary').click()
        cap_input = page.locator('#output-max-db')
        val_input = page.locator('#output-value')
        cap_input.fill('36')
        cap_input.blur()
        expect(page.locator('#output-level')).to_have_attribute('max', '36')
        val_input.fill('30')
        val_input.blur()
        expect(page.locator('#output-level')).to_have_value('30')

        val_input.fill('10000')
        val_input.blur()
        expect(page.locator('#tempo-settings .settings-status')).to_contain_text('Enter a dB')
        expect(val_input).to_have_value('30')

        page.locator('.fx-panel > summary').scroll_into_view_if_needed()
        page.locator('.fx-panel > summary').click()
        expect(page.locator('.fx-panel')).to_have_attribute('open', '')
        page.locator('#fx-soft-clip').scroll_into_view_if_needed()
        page.locator('#fx-soft-clip').check()
        page.locator('.deck-tools-panel > summary').scroll_into_view_if_needed()
        page.locator('.deck-tools-panel > summary').click()
        slowed_btn = page.get_by_role('button', name='Slowed + Reverb', exact=True)
        slowed_btn.scroll_into_view_if_needed()
        slowed_btn.click()
        expect(page.locator('#rate-number')).to_have_value('0.85')
        page.locator('.dsp-hud > summary').scroll_into_view_if_needed()
        page.locator('.dsp-hud > summary').click()
        expect(page.locator('#hud-engine')).to_be_visible()
        page.wait_for_timeout(120)
        page.screenshot(path=str(ROOT / 'test-results/settings-extras-desktop.png'))

        # Reload verifies Volume Cap & Output level persist cleanly.
        page.reload()
        expect(page.locator('#rate-slider')).to_be_visible()
        page.get_by_role('button', name='Tempo settings', exact=True).click()
        page.locator('.advanced-audio > summary').click()
        expect(page.locator('#output-max-db')).to_have_value('36')
        expect(page.locator('#output-value')).to_have_value('30')
        expect(page.locator('#output-level')).to_have_attribute('max', '36')

        assert not errors, errors
        browser.close()
        print('DJ mode, customizable keybinds, unlimited volume cap and settings extras passed.')
finally:
    server.shutdown()
    server.server_close()
