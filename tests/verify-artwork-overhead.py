import json
import os
import subprocess
from playwright.sync_api import sync_playwright

from userscript_fixture import ROOT, browser_options

source = subprocess.check_output(
    [os.environ.get('NODE', 'node'), '-p',
     "require('./tests/module-fixture.cjs')(['soundcloud/page-artwork.js'])"],
    cwd=ROOT, text=True, encoding='utf-8',
)

with sync_playwright() as p:
    browser = p.chromium.launch(**browser_options(), headless=True, args=['--mute-audio'])
    results = []
    for count in [500, 1000]:
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.set_content('<main></main>')
        page.add_script_tag(content=source)
        report = page.evaluate('''async count => {
          const flush = () => new Promise(resolve => requestAnimationFrame(resolve));
          const main = document.querySelector('main');
          const key = index => `/artist/track-${index}`;
          const saved = new Map();
          for (let index = 0; index < count; index++) {
            const link = document.createElement('a');
            link.href = key(index);
            const artwork = document.createElement('div');
            artwork.className = 'image';
            artwork.dataset.testArtwork = String(index);
            artwork.style.cssText = 'width:80px;height:80px';
            link.append(artwork);
            main.append(link);
            saved.set(key(index), .8);
          }
          const counters = { savedReads: 0, geometryReads: 0, documentScans: 0 };
          const scan = Document.prototype.querySelectorAll;
          Document.prototype.querySelectorAll = function(...args) {
            counters.documentScans++;
            return scan.apply(this, args);
          };
          const geometry = Element.prototype.getBoundingClientRect;
          Element.prototype.getBoundingClientRect = function() {
            if (this.hasAttribute('data-test-artwork')) counters.geometryReads++;
            return geometry.call(this);
          };
          const reset = () => Object.keys(counters).forEach(key => counters[key] = 0);
          const snapshot = () => ({...counters});
          const check = (condition, detail) => { if (!condition) throw Error(JSON.stringify(detail)); };
          let playback = { trackKey: key(0), rate: .5, failure: '' };
          const artwork = createPageArtwork({
            parseTrackKey: href => typeof href === 'string' && /^\\/artist\\/track-/.test(href) ? href : '',
            readSavedRate: track => { counters.savedReads++; return saved.get(track) ?? null; },
            formatRate: value => `${value}×`,
            tempoLogo: () => '<svg></svg>',
            readTrack: () => playback,
            readEmbeddedPages: () => null,
          });
          const node = index => main.children[index].firstElementChild;
          const badge = index => node(index).querySelector('.soundcloud-tempo-page-indicator');
          artwork.schedule(); await flush();
          const initial = snapshot();
          check(initial.savedReads === count && initial.geometryReads === count, initial);
          reset();
          for (let update = 0; update < 20; update++) {
            playback.rate = .51 + update / 100;
            artwork.schedule(); await flush();
          }
          const tempoUpdates = snapshot();
          check(Object.values(tempoUpdates).every(value => value === 0), tempoUpdates);
          check(badge(0).title === 'Playing at 0.7×', badge(0).title);
          playback = { trackKey: key(1), rate: .6, failure: '' };
          artwork.schedule(); await flush();
          check(badge(0).title === 'Saved tempo 0.8×' && badge(0).dataset.active === 'false', badge(0).title);
          check(badge(1).title === 'Playing at 0.6×', badge(1).title);
          playback.failure = 'Playback unavailable';
          artwork.schedule(); await flush();
          check(badge(1).title === 'Saved tempo 0.8×' && badge(1).dataset.active === 'false', badge(1).title);
          playback.failure = ''; playback.rate = 1;
          artwork.schedule(); await flush();
          check(badge(1).title === 'Saved tempo 0.8×' && badge(1).dataset.active === 'false', badge(1).title);
          playback.rate = .6;
          artwork.schedule(); await flush();
          check(badge(1).title === 'Playing at 0.6×', badge(1).title);
          reset();
          saved.set(key(400), .65);
          artwork.refreshSaved(key(400)); await flush();
          const savedUpdate = snapshot();
          check(savedUpdate.savedReads === 1 && savedUpdate.geometryReads === 0 && savedUpdate.documentScans === 0, savedUpdate);
          check(badge(400).title === 'Saved tempo 0.65×', badge(400).title);
          reset();
          saved.delete(key(400));
          window.dispatchEvent(new StorageEvent('storage', {key:'soundcloud.tempo.track.' + encodeURIComponent(key(400))}));
          await flush();
          check(badge(400).hidden && counters.savedReads === 1, snapshot());
          const removed = main.lastElementChild;
          const removedBadge = removed.querySelector('.soundcloud-tempo-page-indicator');
          removed.remove(); artwork.markDirty(); artwork.schedule(); await flush();
          check(!removedBadge.isConnected, 'Removed artwork badge remains connected');
          reset();
          node(3).style.width = '40px';
          window.dispatchEvent(new Event('resize')); await flush();
          check(badge(3).dataset.small === 'true', badge(3).dataset.small);
          const resized = snapshot();
          reset();
          artwork.schedule(); await flush();
          check(Object.values(counters).every(value => value === 0), snapshot());
          saved.set(key(10), .9); artwork.refreshSaved(); await flush();
          check(badge(10).title === 'Saved tempo 0.9×', badge(10).title);
          return {count, initial, tempoUpdates, savedUpdate, resized};
        }''', count)
        assert errors == [], errors
        results.append(report)
        page.close()
    browser.close()
    print(json.dumps({'scope': 'isolated real DOM; operation counts, not weak-device CPU or heap', 'results': results}, indent=2))
