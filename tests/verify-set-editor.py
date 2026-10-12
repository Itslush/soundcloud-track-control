import base64
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright, expect
from userscript_fixture import ROOT, SITE_URL, browser_options, serve_site, text_contrast


def code(value, prefix='SCT1.'):
    return prefix + base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).decode().rstrip('=')


def silent_video():
    ffmpeg = os.environ.get('FFMPEG_PATH') or shutil.which('ffmpeg')
    assert ffmpeg, 'Set FFMPEG_PATH to verify the rendered-set playback controls.'
    with tempfile.TemporaryDirectory(prefix='tempo-set-controls-') as directory:
        movie = Path(directory) / 'fixture.mp4'
        subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error',
                        '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=4',
                        '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
                        '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac', '-movflags', '+faststart', str(movie)], check=True)
        return movie.read_bytes()


movie = silent_video()
first = {'v': 1, 'track': '/listener/first', 'duration': 60, 'pitch': 'preserve',
         'points': [{'t': 0, 'r': .9, 'd': 0, 'c': 'instant'}, {'t': 30, 'r': 1.2, 'd': 5, 'c': 'smooth'}],
         'keyShift': -3.5, 'pitchPoints': [{'t': 0, 'k': -3.5, 'd': 0, 'c': 'instant'}, {'t': 25, 'k': .5, 'd': 5, 'c': 'linear'}]}
second = {'v': 1, 'track': '/listener/second', 'duration': 50,
          'points': [{'t': 0, 'r': 1, 'd': 0, 'c': 'instant'}], 'pitch': 'natural', 'keyShift': 0}
captures = ROOT / '.impeccable/review'
captures.mkdir(parents=True, exist_ok=True)
server, base = serve_site()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(**browser_options(), headless=True)
        page = browser.new_page(permissions=['clipboard-read', 'clipboard-write'])
        errors, resolves, posts, gets = [], [], [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        job = 'a' * 32
        api_origin = 'https://tempo.88-96-45-138.sslip.io'
        response = {'state': 'ready', 'id': job, 'url': api_origin + '/soundcloud-tempo-control/listen/' + job}
        response_status = 200
        hold = {'enabled': False, 'route': None}

        def resolve(route):
            resolves.append(route.request.url)
            permalink = parse_qs(urlparse(route.request.url).query)['url'][0]
            first_track = permalink.endswith('/first')
            route.fulfill(json={'title': 'Fixture first track' if first_track else 'Fixture second track', 'artist': 'Fixture artist', 'permalink': permalink, 'duration': 60 if first_track else 50, 'preview': False})

        def shares(route):
            if route.request.method == 'POST':
                posts.append(route.request.post_data_json)
                if hold['enabled']:
                    hold['route'] = route
                    return
            else:
                gets.append(route.request.url)
            route.fulfill(status=response_status, json=response)

        def media(route):
            requested = route.request.headers.get('range', '')
            if requested.startswith('bytes='):
                start, end = requested[6:].split('-')
                start = int(start or 0)
                end = min(int(end) if end else len(movie) - 1, len(movie) - 1)
                route.fulfill(status=206, content_type='video/mp4', body=movie[start:end + 1],
                              headers={'Accept-Ranges': 'bytes', 'Content-Range': f'bytes {start}-{end}/{len(movie)}'})
            else:
                route.fulfill(content_type='video/mp4', body=movie, headers={'Accept-Ranges': 'bytes'})

        page.route('**/api/resolve?**', resolve)
        page.route('**/api/shares**', shares)
        page.route('**/media/*.mp4', media)
        page.route('**/media/*.jpg', lambda route: route.abort())
        page.goto(base + 'set/#sct=' + code(first))
        expect(page.locator('.set-track')).to_have_count(1)
        assert resolves == posts == gets == []
        expect(page.locator('#set-track-tempo-0')).to_have_attribute('readonly', '')
        expect(page.locator('#set-track-pitch-0')).to_have_attribute('readonly', '')
        page.locator('#set-source').fill('https://soundcloud.com/listener/second')
        page.locator('#set-add').click()
        expect(page.locator('.set-track')).to_have_count(2)
        assert len(resolves) == 1 and posts == []
        page.locator('#set-track-pitch-1').fill('-2.5')
        page.locator('#set-track-pitch-1').press('Enter')
        page.locator('.set-track').last.locator('[data-pitch="preserve"]').click()
        expect(page.locator('.set-track').last.locator('[data-pitch="preserve"]')).to_have_attribute('aria-pressed', 'true')
        page.locator('.set-track').last.locator('[data-pitch="natural"]').click()
        page.locator('.set-track').last.locator('[aria-controls="set-track-pitch-1"][data-step="1"]').click()
        expect(page.locator('#set-track-pitch-1')).to_have_value('-2')
        page.locator('.set-track').last.locator('[aria-controls="set-track-pitch-1"][data-step="-1"]').click()
        expect(page.locator('#set-track-pitch-1')).to_have_value('-2.5')
        page.locator('#set-track-overlap-0').fill('7.5')
        page.locator('#set-track-overlap-0').press('Enter')
        page.locator('#set-copy').click()
        copied = page.evaluate('navigator.clipboard.readText()')
        set_code = copied.split('#scs=')[1]
        payload = json.loads(base64.urlsafe_b64decode(set_code[5:] + '==='))
        assert payload['tracks'][0]['points'] == first['points']
        assert payload['tracks'][0]['pitchPoints'] == first['pitchPoints']
        assert payload['tracks'][1]['keyShift'] == -2.5
        assert payload['overlaps'] == [7.5]
        page.evaluate('() => { window.originalClipboard = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = async () => {throw new Error("denied")}; }')
        page.locator('#set-copy').click()
        expect(page.locator('#set-settings-result')).to_be_visible()
        expect(page.locator('#set-settings-link')).to_have_attribute('href', copied)
        expect(page.locator('#set-status')).to_contain_text('Clipboard access is unavailable')
        page.evaluate('() => { navigator.clipboard.writeText = window.originalClipboard; }')
        page.locator('.set-track').first.locator('[data-move="1"]').click()
        expect(page.locator('.set-track-link').first).to_have_attribute('href', 'https://soundcloud.com/listener/second')
        expect(page.locator('.set-track').last.locator('[data-move="-1"]')).to_be_focused()
        page.locator('.set-track').first.locator('[data-move="1"]').click()
        page.locator('#discord-sharing summary').click()
        page.locator('.discord-create').click()
        expect(page.locator('#set-listen')).to_be_visible()
        assert len(posts) == 1 and posts[0]['publish'] is True and posts[0]['code'].startswith('SCS1.')
        expect(page.locator('#set-video')).to_have_attribute('preload', 'none')
        expect(page.locator('#set-video')).to_have_attribute('src', api_origin + '/soundcloud-tempo-control/media/' + job + '.mp4')
        expect(page.locator('#set-video')).to_have_attribute('poster', api_origin + '/soundcloud-tempo-control/media/' + job + '.jpg')
        assert page.locator('#set-video').evaluate('video => video.paused')
        page.locator('.discord-copy').click()
        expect(page.locator('.discord-status')).to_have_text('Link copied.')
        discord_copy = page.evaluate('navigator.clipboard.readText()')
        assert discord_copy == '[' + SITE_URL.removeprefix('https://') + '](' + response['url'] + ')'
        page.locator('#set-play').click()
        expect(page.locator('#set-play')).to_have_text('Pause')
        page.wait_for_function('document.querySelector("#set-video").readyState === 4')
        page.locator('#set-play').click()
        expect(page.locator('#set-play')).to_have_text('Play')
        page.wait_for_function('document.querySelector("#set-video").duration === 2')
        page.locator('#set-seek').evaluate('range => { range.value = "1"; range.dispatchEvent(new Event("input", {bubbles:true})); }')
        assert abs(page.locator('#set-video').evaluate('video => video.currentTime') - 1) < .1
        expect(page.locator('#set-position')).to_contain_text('0:01 / 0:02')
        page.locator('#set-volume').focus()
        page.locator('#set-volume').press('ArrowRight')
        assert abs(page.locator('#set-video').evaluate('video => video.volume') - .16) < .001
        page.locator('#set-video').evaluate('video => video.dispatchEvent(new Event("error"))')
        expect(page.locator('#set-play-status')).to_contain_text('unavailable or expired')
        page.locator('#set-track-overlap-0').fill('8')
        page.locator('#set-track-overlap-0').press('Enter')
        expect(page.locator('#set-listen')).to_be_hidden()
        expect(page.locator('.discord-result')).to_be_hidden()
        hold['enabled'] = True
        page.locator('.discord-create').click()
        page.wait_for_timeout(100)
        assert hold['route'] is not None
        page.locator('#set-track-overlap-0').fill('6')
        page.locator('#set-track-overlap-0').press('Enter')
        hold['route'].fulfill(json=response)
        hold['enabled'] = False
        page.wait_for_timeout(100)
        expect(page.locator('#set-listen')).to_be_hidden()
        expect(page.locator('.discord-result')).to_be_hidden()
        page.locator('.set-track').first.locator('.set-fixed-tempo').click()
        expect(page.locator('#set-track-tempo-0')).not_to_have_attribute('readonly', '')
        page.locator('.set-track').first.locator('.set-fixed-pitch').click()
        expect(page.locator('#set-track-pitch-0')).not_to_have_attribute('readonly', '')
        page.locator('#set-track-tempo-0').fill('2')
        page.locator('#set-track-tempo-0').press('Enter')
        page.locator('#set-track-pitch-0').fill('3')
        page.locator('#set-track-pitch-0').press('Enter')
        expect(page.locator('.set-track-duration').first).to_have_text('1:00 original · 0:30 adjusted')
        editor_code = page.locator('.set-edit-link').first.get_attribute('href').split('#sct=')[1]
        editor_payload = json.loads(base64.urlsafe_b64decode(editor_code[5:] + '==='))
        assert editor_payload['points'][0]['r'] == 2 and editor_payload['keyShift'] == 3
        page.locator('#set-source').fill('https://example.com/untrusted')
        page.locator('#set-add').click()
        expect(page.locator('#set-status')).to_contain_text('direct public SoundCloud')
        assert len(resolves) == 1
        over_budget = {**second, 'track': '/listener/too-long', 'duration': 800}
        page.locator('#set-source').fill(code(over_budget))
        page.locator('#set-add').click()
        expect(page.locator('#set-validation')).to_contain_text('15 minutes')
        expect(page.locator('#set-copy')).to_be_disabled()
        page.locator('.set-remove').last.click()
        expect(page.locator('#set-copy')).to_be_enabled()

        for width in [360, 390, 600, 768, 1440]:
            page.set_viewport_size({'width': width, 'height': 1100})
            for theme in ['charcoal', 'light', 'oled']:
                page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
                page.locator('.discord-create').evaluate('async button => { for (const animation of button.getAnimations()) await animation.finished; }')
                assert page.evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth')
                assert text_contrast(page.locator('#set-budget')) >= 4.5
                assert page.locator('.set-budget').bounding_box()['y'] < page.locator('#set-tracks').bounding_box()['y']
                assert page.locator('.set-budget').bounding_box()['y'] < 750
                assert page.locator('.discord-create').evaluate('button => button.classList.contains("primary")')
                assert text_contrast(page.locator('.discord-create')) >= 4.5, (theme, page.locator('.discord-create').evaluate('button => [getComputedStyle(button).color, getComputedStyle(button).backgroundColor]'))
                for selector in ['#set-add', '#set-copy', '.set-remove', '[data-move]', '[data-number-field] button']:
                    for element in page.locator(selector).all():
                        if element.is_visible():
                            assert element.bounding_box()['height'] >= 44
                if width in [390, 1440]:
                    page.evaluate('window.scrollTo(0, 0)')
                    page.screenshot(path=str(captures / f'set-{width}-{theme}.png'), full_page=True, animations='disabled')

        page.locator('.set-remove').first.click()
        expect(page.locator('.set-track')).to_have_count(1)
        expect(page.locator('#set-copy')).to_be_disabled()

        payload = {'v': 1, 'tracks': [first, second], 'overlaps': [5]}
        page.goto(base + 'set/#scs=' + code(payload, 'SCS1.'))
        expect(page.locator('.set-track')).to_have_count(2)
        page.locator('#set-copy').click()
        canonical = page.evaluate('navigator.clipboard.readText()').split('#scs=')[1]
        expected_id = hashlib.sha256(('discord-render-v1:' + canonical).encode()).hexdigest()[:32]
        response = {'state': 'ready', 'id': expected_id, 'url': api_origin + '/soundcloud-tempo-control/listen/' + expected_id}
        before_posts, before_gets = len(posts), len(gets)
        page.goto(base + 'set/?render=' + expected_id + '#scs=' + canonical)
        expect(page.locator('#set-listen')).to_be_visible()
        assert len(posts) == before_posts and len(gets) == before_gets + 1
        assert page.locator('#set-video').evaluate('video => video.paused')
        ready_source = page.locator('#set-video').get_attribute('src')
        ready_link = page.locator('#discord-sharing .discord-link').get_attribute('href')
        page.locator('.set-details').first.click()
        expect(page.locator('.set-track-link').first).to_have_text('1. Fixture first track')
        expect(page.locator('#set-listen')).to_be_visible()
        expect(page.locator('#set-video')).to_have_attribute('src', ready_source)
        expect(page.locator('#discord-sharing .discord-link')).to_have_attribute('href', ready_link)
        assert len(posts) == before_posts
        page.locator('#set-track-overlap-0').press('Enter')
        expect(page.locator('#set-listen')).to_be_visible()
        page.goto(base + 'set/?render=' + 'b' * 32 + '#scs=' + canonical)
        expect(page.locator('#set-status')).to_contain_text('does not match')
        assert len(gets) == before_gets + 1
        response = {'error': 'This shared audio has expired. Create a new link.'}
        response_status = 410
        page.goto(base + 'set/?render=' + expected_id + '#scs=' + canonical)
        expect(page.locator('#set-status')).to_contain_text('expired')
        expect(page.locator('#set-listen')).to_be_hidden()
        assert len(posts) == before_posts
        response_status = 200
        response = {'state': 'ready', 'id': expected_id, 'url': 'https://example.com/soundcloud-tempo-control/listen/' + expected_id}
        page.goto(base + 'set/?render=' + expected_id + '#scs=' + canonical)
        page.reload()
        expect(page.locator('#set-status')).to_contain_text('invalid')
        expect(page.locator('#set-listen')).to_be_hidden()
        assert errors == [], errors
        browser.close()
        print('Set UI verified: retained automation, explicit resolve/publish, reorder/remove, limits, themes, controls, no-autoplay recipient GET, mismatch and expiry.')
finally:
    server.shutdown()
