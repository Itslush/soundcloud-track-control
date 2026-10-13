# Adjusted playback performance, v1.2.7.2

## Scope

The reported symptom is steady audio hitching on Firefox Android whenever tempo or pitch differs from normal playback. Desktop captures do not reproduce that phone's audio-device scheduling. This release addresses the measured processing spikes and redundant rendering work, then leaves physical-device confirmation to the phone test.

The userscript, generated desktop download, website downloads, and legacy compatibility downloads use the same source. The installed desktop plugin and the hosted audio backend are unchanged. No storage keys, saved-track data, share formats, audio-quality controls, or dependencies change.

## Changes and risks

- The live Signalsmith node uses split computation. The existing 120 ms block and 30 ms interval remain unchanged, as do the stereo signal path, sample rate, gain, and algorithm. Offline preparation retains its existing configuration.
- Split computation adds one interval of latency, about 30 ms. Startup gating, seek recovery, and crossfade alignment already read the actual node latency. They do not assume the old value.
- Stars use the existing random-direction motion on a separate, clipped layer. Only its transform changes each frame. A 32 px margin is rebased occasionally, avoiding both full-page paints and a texture padded by whole 960 by 840 px tiles.
- The mobile player no longer refreshes from `timeupdate`. Its visible controls have no elapsed-time field. Playback, volume, track, pitch, and settings changes retain their update paths. Detached audio elements now receive direct lifecycle listeners, because their events do not reach the document. Unchanged labels and the play icon are not rewritten.

The star layer is decorative, ignores pointer input, disappears in forced colors, and pauses when the document is hidden. Selecting the native theme removes both the layer and its styles. The layer uses graphics memory proportional to the viewport, not page length. Actual device memory and battery usage are not measured here.

## Measured evidence

`node tests/measure-dsp.cjs` executes the pinned processor and WASM at 48 kHz with stereo tones and a -6.5 st shift. Five alternating pairs each contain 1,024 warmup and 8,192 measured callbacks. This is synchronous Node execution, not real-time Android playback.

The median per-run p99 callback cost changed from 0.3524 ms to 0.0945 ms. The five-run ranges were 0.3445 to 0.4894 ms before and 0.0838 to 0.1320 ms after. Average work did not decrease: the median mean changed from 0.03353 ms to 0.03474 ms. The benefit is fewer concentrated computation spikes, not less total DSP work. Every run produced finite output at the expected frequency. No callback exceeded the 2.667 ms quantum in this desktop measurement.

The machine was an AMD Ryzen 9 5950X with other applications left running. A load sample immediately after the run was 67 percent. Raw runs are generated in `test-results/dsp-callback-cost.json`. These figures are not low-end-device benchmarks.

The previous star diagnostic recorded 242 to 245 renderer paints in each one-second moving window. The new layer recorded 0 to 4 in five alternating moving and paused runs. All paused windows recorded zero. Transform style updates still occur each frame. The fixture used headless Chrome at a phone-sized viewport on a high-refresh desktop. It measures repaint counts, not phone frame rate or audio reliability.

Twenty unchanged playback-time events previously produced 100 mutations in the mobile transport. The shipped-bundle regression now produces zero.

## Behavior checks

- `npm test` and `npm run test:unit`: 598 unit tests pass with FFmpeg configured, with no skips.
- `npm run typecheck` and `npm run release`: pass.
- `verify-steady-audio.py`: the actual bundle runs in muted Firefox with moving stars. It captures three four-second stereo PCM windows for each of six settings: 1x, 0.8x, 1.15x, -6.5 st, 0.8x with -6.5 st, and return to normal. All windows have finite output, expected pitch and level, no silent quanta, no missing inputs, and no detected discontinuities. Steady-state media parameters and worklet messages remain unchanged. One pitch node is created and reused.
- `verify-wasm-boundaries.py`: seek and source-replacement PCM checks pass at 48 and 96 kHz, including a deliberately contaminated-silence detector control.
- `verify-mobile-player.py`: no playback-time transport mutations, working tempo and pitch controls, volume, saving, settings, artwork, and all three custom themes.
- `verify-appearance.py`: theme restoration, cross-tab changes, embedded-document cleanup, keyboard selection, and forced colors pass.
- `verify-control-styles.py`: moving stars, reduced-motion pause, explicit motion override, speed changes, reload, and explicit stop use the new layer.
- `verify-star-paint.py`: actual motion remains active with fewer than 20 paints per one-second observation.
- Fresh feature captures retain their PNG checksums and match the v1.2.7.2 artifact. Capture and transfer-budget verification pass.

The first GitHub run stalled during Firefox audio startup on the headless Linux runner and was cancelled. CI now starts a 48 kHz stereo PulseAudio null sink; the Firefox test also has a 15-second startup deadline. This changes test infrastructure only, not the shipped audio path or its assertions.

## Maintainability review

The production change stays in three existing modules. The DSP change is one configuration flag. Star ownership and cleanup remain in the appearance module. The mobile change removes a periodic event subscription, avoids redundant writes, and observes detached media without retaining it in a strong collection. Disposal aborts those listeners. No new runtime dependency, settings option, timer, quality downgrade, or alternative audio path is introduced. Changed production files remain below 1,000 lines.

The safety checks use the shipped processor and bundle rather than a second implementation of the fixes. The existing latency query is the critical compatibility point: processing, gating, and handoff continue to use the measured value.

The remaining risk is the original phone-only symptom. These tests do not establish clean output on Firefox 157.0.1 Android, perceptual quality on music, prolonged background playback, or speaker-device underruns. Natural tempo-only playback still uses Firefox's native rate conversion; this release does not replace that browser path.
