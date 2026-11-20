# Testing

Use Node 22.12+ (or Node 24 in CI) and Python 3.12 or newer. Tests resolve paths from the repository root. `CHROME_PATH` can point to an installed Chromium browser; otherwise install Playwright Chromium.

## Quick start

```sh
npm ci --ignore-scripts
npm run setup:backend
npm run setup:decoder-probe
npm test
npm run typecheck
npm run build
npm run test:transfer
python -m pip install -r tests/requirements.txt
python -m playwright install chromium
npm run test:browser
```

`npm test` builds and validates the userscript (`dist/soundcloud-tempo-control.user.js`), verifies embedded WASM and dependency checksums, checks the buffered PCM window cursor, and runs all Node unit suites (`tests/*.test.cjs` and `tests/*.test.mjs`) via `npm run test:unit`.

`npm run test:server` runs offline yt-dlp resolver, process-lifecycle and HTTP server tests (`tests/server.test.mjs` and `tests/ytdlp.test.mjs`).

`npm run test:transfer` starts an isolated local server against `dist/site/` and enforces compressed initial transfer budgets (192 KiB initial, 384 KiB with preview crops, 48 KiB JS, 16 KiB CSS, 112 KiB fonts) plus ETag/304 revalidation.

## Browser verification suites

`npm run test:browser` (`python tests/run.py`) runs the offline Playwright userscript suites against local SoundCloud fixtures, covering:

- Playback rate, slider/dial/vertical fader styles, custom number steppers and keyboard shortcuts (`verify-inline.py`, `verify-ux.py`, `verify-control-styles.py`, `verify-number-fields.py`, `verify-slider-ticks.py`, `verify-slider-style.py`)
- Saved-track library, search, pagination, removal undo and backup export/import (`verify-compact-library.py`)
- SoundCloud, Light, Charcoal and OLED themes, star motion paint bounds and embedded track views (`verify-appearance.py`, `verify-star-paint.py`, `verify-embedded-track.py`, `verify-display-duration.py`)
- Touch player layout and controls (`verify-mobile-player.py`)
- Live pitch worklet lifecycle, boundary continuity, kick transient alignment and crossfade transitions (`verify-wasm.py`, `verify-wasm-boundaries.py`, `verify-kick-pitch.py`, `verify-crossfade.py`, `verify-crossfade-clicks.py`, `verify-seek-route.py`)

For website and two-deck mixer suites, start the local server (`npm start`) or run the self-hosted verifiers:

```sh
python tests/verify-mixer.py
python tests/verify-demo.py
python tests/verify-site.py
python tests/verify-site-polish.py
python tests/verify-shared-player.py
python tests/verify-site-presentation.py
python tests/verify-star-motion.py
python tests/verify-site-themes.py
python tests/verify-hero.py
python tests/verify-captures.py
python tests/verify-interface.py
python tests/verify-demo-recovery.py
python tests/verify-preview-lifecycle.py
python tests/verify-navigation.py
```

`SITE_URL` overrides the default `http://127.0.0.1:4322/`. Screenshots and diagnostic outputs are written to `test-results/` (ignored by git). All browser checks run muted.

## Sustained audio and buffered transport checks

```sh
npm run test:audio-candidate
npm run test:host-clock
python tests/verify-natural-chunks.py
python tests/verify-natural-output.py
python tests/verify-natural-truncate.py
python tests/verify-buffered-transport.py --local-only
python tests/verify-steady-audio.py
```

`python tests/verify-steady-audio.py` runs the built userscript in muted Firefox across six tempo and pitch settings and verifies frequency, level, sample continuity and single-worklet reuse. CI runs both the Chromium verification job and the Firefox PulseAudio null-sink job before deploying GitHub Pages.
