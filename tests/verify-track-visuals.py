import io
import subprocess
from PIL import Image
from playwright.sync_api import sync_playwright, expect
from userscript_fixture import ROOT, browser_options, userscript_source, text_contrast

NODE = 'node'
module = subprocess.check_output([NODE, '-p', "require('./tests/module-fixture.cjs')(['soundcloud/tempo-track-visuals.js'])"], cwd=ROOT, text=True, encoding='utf-8')
captures = ROOT / '.impeccable/review/artwork'
captures.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(**browser_options(), headless=True, args=['--mute-audio'])
    for width in [390, 768, 1440]:
        for theme in ['charcoal', 'light', 'oled']:
            page = browser.new_page(viewport={'width': width, 'height': 900})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('https://soundcloud.com/**', lambda route: route.fulfill(path=str(ROOT / 'tests/fixtures/inline-fixture.html'), content_type='text/html'))
            page.goto('https://soundcloud.com/test-artist/first-track')
            if theme == 'light': page.locator('body').evaluate('body=>body.classList.add("light")')
            if theme == 'oled': page.add_style_tag(content='.playControls{background:#000} body{background:#000}')
            page.add_script_tag(content=userscript_source())
            expect(page.locator('#soundcloud-tempo-control')).to_be_visible()
            page.locator('#quick-key-shift').fill('-3.5')
            page.locator('#quick-key-shift').dispatch_event('change')
            notice = page.locator('.soundcloud-tempo-pitch-notice')
            expect(notice).to_have_text('Pitch shifted −3.5 st')
            assert text_contrast(notice) >= 4.5
            page.add_script_tag(content=module)
            page.evaluate('''() => {
              const color = value => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='${value}'/%3E%3C/svg%3E")`;
              const avatar = document.querySelector('.playbackSoundBadge__avatar');
              avatar.style.backgroundImage = color('red');
              const row=document.createElement('div'); row.className='queueItemView';
              const next=document.createElement('a'); next.href='/test-artist/second-track';
              const image=document.createElement('span'); image.className='queueItemView__artwork'; image.style.backgroundImage=color('blue');
              row.append(next,image); document.querySelector('main').append(row);
              window.visualTrack='/test-artist/first-track';
              window.visuals=createTrackVisuals({document,readTrack:()=>visualTrack});
              visuals.overlap({nextTrack:'/test-artist/second-track',progress:0});
              const layer=document.querySelector('.soundcloud-tempo-crossfade-artwork');
              getComputedStyle(layer).getPropertyValue('--tempo-artwork-start');
              window.nativeCover=color('blue');
              avatar.style.backgroundImage=nativeCover;
              window.visualTrack='/test-artist/second-track';
              visuals.overlap({nextTrack:'/test-artist/second-track',progress:.5});
            }''')
            interpolation = page.evaluate('''() => {
              const layer=document.querySelector('.soundcloud-tempo-crossfade-artwork');
              const animations=layer.getAnimations();
              for(const animation of animations){animation.pause();animation.currentTime=50;}
              const style=getComputedStyle(layer);
              const result={count:animations.length,start:parseFloat(style.getPropertyValue('--tempo-artwork-start')),end:parseFloat(style.getPropertyValue('--tempo-artwork-end'))};
              for(const animation of animations)animation.finish();
              return result;
            }''')
            assert interpolation['count'] == 3, interpolation
            assert abs(interpolation['start'] - 62.5) < .1 and abs(interpolation['end'] - 112.5) < .1, interpolation
            cover = page.locator('.playbackSoundBadge__avatar')
            pixels = Image.open(io.BytesIO(cover.screenshot())).convert('RGB')
            left, right = pixels.getpixel((3, 8)), pixels.getpixel((28, 8))
            assert left[0] > 200 and left[2] < 30, left
            assert right[0] < 30 and right[2] > 200, right
            feather = pixels.getpixel((12, 8))
            assert 150 < feather[0] < 210 and 45 < feather[2] < 105, feather
            bar = page.locator('.playControls')
            bar_box, notice_box = bar.bounding_box(), notice.bounding_box()
            assert notice_box['y'] >= bar_box['y'] and notice_box['y'] + notice_box['height'] <= bar_box['y'] + bar_box['height'] + 1
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, theme)
            bar.screenshot(path=str(captures / f'plugin-{width}-{theme}.png'))
            page.emulate_media(reduced_motion='reduce')
            assert page.locator('.soundcloud-tempo-incoming-artwork').evaluate('el=>getComputedStyle(el).maskImage') == 'none'
            assert page.locator('.soundcloud-tempo-incoming-artwork').evaluate('el=>getComputedStyle(el).opacity') == '0.5'
            page.evaluate('visuals.overlap(null)')
            expect(page.locator('.soundcloud-tempo-crossfade-artwork')).to_have_count(0)
            page.evaluate("visuals.overlap({nextTrack:'/test-artist/missing-cover',progress:.8})")
            assert page.locator('.soundcloud-tempo-crossfade-artwork').evaluate("layer=>layer.style.getPropertyValue('--tempo-artwork-progress')") == '0'
            page.evaluate('visuals.overlap(null)')
            page.locator('#quick-key-shift').fill('0')
            page.locator('#quick-key-shift').dispatch_event('change')
            expect(notice).to_be_hidden()
            assert not errors, errors
            page.close()
    browser.close()
print('PASS: directional covers, reduced motion, cancellation, fractional/zero pitch notice, contrast and footer bounds at three widths/themes. Isolated player fixture.')
