import subprocess

from playwright.sync_api import sync_playwright
from userscript_fixture import ROOT, browser_options

source = subprocess.check_output(
    [
        'node',
        '-p',
        "require('./tests/module-fixture.cjs')(['soundcloud/crossfade-controls.js','soundcloud/page-artwork.js'])",
    ],
    cwd=ROOT,
    text=True,
    encoding='utf-8',
)

with sync_playwright() as p:
    browser = p.chromium.launch(**browser_options(), headless=True)
    page = browser.new_page()
    page.set_content("""<div class="soundList__item"><div class="sound">
      <a class="soundTitle__title" href="/artist/earlier">Earlier</a>
      <button class="playButton">Play</button>
      <div class="sound__waveform"><div class="waveform" style="width:300px;height:60px"><canvas width="300" height="60"></canvas></div></div>
    </div></div><div class="sound"><a class="soundTitle__title" href="/artist/current">Current</a><div class="sound__waveform"><div class="waveform" style="width:300px;height:60px"></div></div></div><div class="playbackTimeline"><div class="playbackTimeline__progressWrapper" style="width:300px;height:20px"></div></div>""")
    page.add_script_tag(content=source)
    page.evaluate("""() => {
      window.calls=[]; window.native=[]; window.allowBridge=true;
      const crossfade={warmManual(){calls.push('warm')},manualPlay(track,seek){calls.push(seek ? 'seek:'+track : track);return allowBridge},cancel(){calls.push('cancel')}};
      const handler=createCrossfadeClickHandler({crossfade,
        parseTrack:href=>href ? new URL(href,'https://soundcloud.com').pathname : '',
        currentTrack:()=>'/artist/current', embeddedKey:()=>''
      });
      installCrossfadeControls(document,handler,crossfade);
      document.addEventListener('click',e=>native.push({trusted:e.isTrusted,prevented:e.defaultPrevented,x:e.clientX}));
    }""")
    page.locator('.playButton').click()
    page.locator('.waveform canvas').click(position={'x': 210, 'y': 30})
    page.locator('.sound').nth(1).locator('.waveform').click(
        position={'x': 130, 'y': 30}
    )
    page.locator('.playbackTimeline__progressWrapper').click(
        position={'x': 250, 'y': 10}
    )
    calls = page.evaluate('calls')
    native = page.evaluate('native')
    assert calls.count('/artist/earlier') == 2, calls
    assert calls.count('seek:/artist/current') == 2, calls
    assert calls.count('warm') >= 4, calls
    assert len(native) == 4 and all(
        x['trusted'] and not x['prevented'] for x in native
    ), native
    box = page.locator('.waveform canvas').bounding_box()
    assert abs(native[1]['x'] - (box['x'] + 210)) < 1, native
    page.evaluate('allowBridge=false; calls=[]')
    page.locator('.playbackTimeline__progressWrapper').click(
        position={'x': 100, 'y': 10}
    )
    assert page.evaluate("calls.filter(x=>x==='cancel').length") == 1
    browser.close()
    print(
        'Earlier-row Play, waveform and current-track seeks preserve trusted native clicks and position'
    )
