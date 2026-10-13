# Mobile player and waveform review

The waveform described here has since been removed at the user's request. Its renderer, loader and waveform-only verification files are no longer part of the current source. See `WAVEFORM-REMOVAL-REVIEW.md` for the removal and footer-thumbnail checks. This report remains historical evidence, not current feature documentation.

Historical candidate evidence: the later motion-only refinement in `ARTWORK-SMOOTHING-REVIEW.md` supersedes the userscript artifact below. The tests here describe this report's recorded SHA, not that later build.

Local candidate reviewed on 2026-10-12, with the final serial browser gate completed on 2026-10-13 local time. This work is not published, installed in soundcloud-rpc, or certified on a physical Android phone. The version remains 1.2.3; it is not a new released version.

The frozen userscript is `dist/soundcloud-tempo-control.user.js`, SHA-256 `9ecde4e8111f955c7213a0a55bba8009ed7b8aeb8b67482877fa5bf10d1cae9f`, 1,030,034 bytes. Build output is ignored by Git, so source changes and regenerated public captures must be included in a later release.

## What changed

The touch player has artwork, wrapping track and artist names, Play, Next, and a Controls disclosure. Its expanded sheet offers tempo, semitone shift, volume, previous track, resets, saved tempo and the existing settings. It respects the saved semitone-visibility option. Targets are at least 44 physical CSS pixels in the tested phone viewports, including SoundCloud's 980-pixel desktop layout viewport. Short screens scroll inside the expanded sheet instead of putting controls below the visible screen.

The plugin does not rescale SoundCloud's library or replace its mobile website. Use a userscript-capable Android browser with Desktop site enabled. If SoundCloud does not provide its desktop player, an authored notice explains that requirement and offers installation help and Dismiss. The notice disappears when the player becomes available. This is not a native Android client or an iOS/Safari playback fix.

Waveform opens above the desktop footer or inside the touch sheet. It has a full-track overview, a scrolling 20-source-second window and a fixed central playhead. An incoming-track lane appears during supported crossfades. It uses the existing audio source positions, so tempo changes do not substitute a wall-clock estimate. Seeking supports touch, pointer, arrow keys, Home, End and an exact seconds or minutes-and-seconds field. Seeking is disabled during the buffered overlap and handoff.

The data is SoundCloud's public amplitude envelope, not a decoded spectral waveform or analyzed beat grid. Seconds markings are deliberate. Coarse amplitude samples cannot establish reliable beat or downbeat positions. Empty, loading, unavailable and invalid-seek states use authored status text rather than browser validation bubbles. Track identity is checked before displaying an envelope; delayed results cannot paint another track's waveform.

Touch artwork mirrors the existing left-to-right crossfade and reduced-motion fallback. It mirrors the pitch-modification notice and canonical error/success status. Manual transport cancels overlap before acting, but a disabled native transport button does not cancel playback. Settings closes back to the visible touch trigger, including Escape.

## Decisions and ownership

The design read in `DESIGN.md` remains a compact music tool for listeners, with charcoal/orange identity, ENERGY 1, RHYTHM 2, MOTION 2.

- Orange retains the existing playback and interaction accent; Light uses its existing darker orange for contrast.
- The phone transport is the resting focal point; the open waveform and source playhead become the listening focal point.
- A disclosure keeps advanced controls out of the resting transport without removing them.
- A 44-pixel target and 16-pixel touch input text make the desktop-site player usable without asking the listener to zoom into it.
- Transport, adjustment and waveform groups have separate spacing because they perform different tasks.
- Desktop controls inherit the player font; the touch sheet uses 16-pixel Arial/system sans to avoid the desktop site's tiny text and another font download. The website keeps its existing Mulish.
- Flat panels and small radii preserve the original controls; no icon library, blur, glow or new decorative illustration is added.
- The waveform moves only to communicate playback position. Artwork transition communicates the current-to-next track handoff. Reduced motion keeps the existing immediate or opacity-only transitions.

See [source ownership](../src/README.md). Templates, state, rendering, media hooks and profile/sharing formats now live in feature folders. The distribution remains one userscript and one desktop plugin. A single installed bundle does not require monolithic source files.

The controls call canonical tempo and pitch actions; they do not own another audio graph. The waveform reads source position and public envelope metadata. It never downloads or decodes the track's audio. Public profile versions, storage keys, old installation paths and share formats are unchanged. Server and website imports were migrated with the source files, not replaced with compatibility wrappers inside `src/`.

`tests/source-structure.test.mjs` rejects implementation files directly under `src/` and modules over 1,000 formatted physical lines. Large remaining modules are named in the ownership map; the ceiling is a backstop, not justification for arbitrary callback layers. A future split should follow independently owned state or lifecycle.

## Review findings fixed in this candidate

- A tempo draft begun on track A could commit after navigation to track B. The touch control now captures the editing track and uses the canonical setter. The browser regression changes tracks before committing.
- The editor split omitted `validKeyShift`, breaking Apply once for pitch. The import was restored and a canonical editor-session regression checks the resulting pitch value.
- The waveform seek placeholder inherited low-contrast browser grey in Charcoal and OLED. It now inherits the authored foreground at full opacity; all three themes have contrast checks.
- Escape from touch settings restored focus to a hidden desktop button. The canonical settings action now receives the visible touch trigger; the regression asserts returned focus.
- Disabled transport could cancel a crossfade before discovering the action was unavailable. Availability is checked first, and the direct module fixture verifies no cancellation or action occurs.
- Returning from buffered low-speed playback left a retained native gate, making crossfade unavailable until reload. The adapter now distinguishes active buffered ownership from an idle retained gate and reuses its native gain node. The regression covers overlap, cancellation, mute, volume, fade-in, another buffered session and cleanup.
- Saved-rate artwork updates scanned every cover and read storage/layout on every rate change. Track-indexed updates now touch the affected covers; the 500/1,000-cover fixture checks zero storage reads, geometry reads and whole-document scans for 20 ordinary tempo changes. Discovery, resize and full-import paths remain proportional to the cover count.
- The waveform seek field used the browser's validation popup. It now uses the existing authored status with `aria-invalid`, keeps focus on the field and clears the error when edited.

## Verification and limits

`npm test` passes 594 tests, with zero failures and zero skips when FFmpeg is configured. `npm run typecheck` and the production userscript/website build pass. The checked artifact hash is recorded above.

The final serial run passed all 27 muted browser suites on the frozen artifact, including the unchanged audio-boundary suite. Its log is `test-results/mobile-waveform-browser-serial-final.log`; the final boundary report is `test-results/wasm-boundaries.json`, with the matching userscript hash and closed browser/server. Earlier runs also passed seven additional website/shared-player suites, but those older artifact results are not presented as final-hash evidence.

The final build, type and 594-test logs are `test-results/mobile-waveform-build.log`, `mobile-waveform-types.log` and `mobile-waveform-final-test.log`. The additional structure/loader/theme/workflow contract run passed 13 tests in `mobile-waveform-structure-final.log`. The transfer and strict idle-operation runs passed in `mobile-waveform-transfer.json` and `mobile-waveform-overhead-final.log`. `git diff --check` and the changed documentation's formatting checks pass. Counts from overlapping focused runs are not added to the 594-test total.

The 27-suite runner includes mobile geometry and actions, waveform parsing/rendering/seeking, editor session, timeline/pitch automation, controls, saved library, native copy, embedded views, real WASM tone tests, output, crossfade, idle overhead, large artwork grids and updates. The new direct-module fixture also checks artwork transition variables, reduced motion, pitch notice, overlap cancellation, disabled actions and restoration of the native footer's preexisting visibility.

Phone tests use owned, muted Chromium with 320- and 393-pixel visual viewports over a 980-pixel mobile layout viewport. Separate desktop checks use 768 and 1,440 pixels. Light, Charcoal and OLED are tested. Actual public SoundCloud envelope metadata is used for the measurement; deterministic fixtures cover failure, delayed-result, seek and lifecycle behavior. Generated PCM and muted output validate audio logic, not subjective music quality.

The screenshot pipeline uses actual rendered UI and records each PNG hash and the userscript artifact hash. It captures the existing selected Drown example in all three themes, not generated product imagery. Gallery checks cover proportional crops, accessible names, phone variants, loading/retry, zoom, focus, Escape and no-JavaScript originals.

One Windows Node test trial observed a render-store job still `rendering` at its polling deadline instead of `failed`. The isolated seven render tests and later full 594-test runs passed without changing that deadline. The underlying transient has not been established or fixed. A paused-waveform browser assertion also initially sampled before its queued one-time draw settled under concurrent load. Its fixture now waits for 250 milliseconds without a draw before asserting another unchanged interval; the zero-idle-work requirement was not relaxed.

The first full browser run on the frozen artifact passed 26 suites and failed one 48 kHz, 0.5× synthetic seek case because the media unexpectedly became paused at 6.043149 seconds. The separately rerun, unchanged boundary suite passed all ten detector/seek/replacement cases at 48/96 kHz, with full teardown. The failed report and PCM files are preserved under `test-results/mobile-waveform-first-frozen-boundary-failure/`; `mobile-waveform-wasm-final.json` records the separate passing run. No audio threshold or production code was changed to make it pass. The cause of that one unexpected pause remains unexplained; the final serial full-run result is recorded separately below.

Final capture provenance matches all 102 PNGs to the frozen hash, with zero page errors. The owned-server gallery gate passed 17 views at seven widths from 360 to 1,920 pixels, in Light, Charcoal and OLED, including focus, Escape, actual-size/fit zoom, failed-image retry and no-JavaScript original links. One unchanged gate trial failed at the final no-JavaScript request because the Playwright driver connection closed; the unchanged retry passed. No gallery assertion was weakened. Both capture/browser/server teardown and muted/paused media are recorded in the capture evidence.

No physical low-end Android device, signed native app, live-account crossfade/Widevine reproduction, long background playback, Firefox Android audio run, Oracle deployment or soundcloud-rpc installation was exercised. A passing synthetic audio fixture is not proof that a protected live stream crash is fixed.

## Performance boundaries

The waveform loader permits at most two active requests and three cached tracks. Envelope JSON is capped at 128 KiB, public metadata HTML at 2 MiB, and requests at eight seconds. Waveform URLs are constrained to the expected HTTPS host, with no credentials or redirect following. Disposal cancels outstanding work.

The renderer caps drawing at 20 Hz, raster width at 1,024 columns and effective device-pixel ratio at two. The refresh loop runs only while the waveform is open, the document is visible and audio is playing. Paused, hidden, collapsed and disposed conditions have zero continuing drawing. These are implemented bounds, not a claim that every phone reaches 20 frames per second.

The serial measurement used owned muted Chromium 144.0.7559.110, a warm real 1,800-sample SoundCloud envelope, a 390-pixel viewport at DPR 3 capped internally at two, and six-times CPU throttling. Five alternating enabled/collapsed runs lasted approximately three seconds each. Enabled median whole-page task time was 68.272 ms, ranging from 61.872 to 80.042 ms; collapsed median was 12.524 ms, ranging from 10.664 to 14.548 ms. Enabled runs actually drew only 16–19 times, with 22–27 update callbacks per interval; collapsed runs drew zero times. Paused and hidden checks also stopped drawing, with zero page errors. Host load at the start was 26% on a Ryzen 9 5950X with 32 logical processors; other machine workload remains uncontrolled. Raw runs are in `test-results/mobile-waveform-performance.json`.

These are whole-page task observations with instrumentation, not pure renderer cost. The low actual callback/draw counts explicitly do not establish a 20 FPS result, a speedup, audio quality or smoothness on a physical low-end phone. Heap endpoint deltas depend on garbage-collection timing and are not used as a memory-footprint claim. The earlier exploratory measurement in `tests/waveform-measurement.json` is separate evidence, not a result for this frozen candidate.

The exact frozen userscript also passed `verify-overhead.py --assert`: a 3.2-second idle interval had zero interval ticks, whole-document scans and animation callbacks; 20 unrelated text mutations also caused zero scans or animation callbacks. The synthetic timeline still advanced, paused, resumed and stopped after manual override. This is an operation-count fixture, not total browser CPU or heap measurement.

Website transfer budgets passed for Brotli and gzip, including response ETag/304 checks. Initial body transfer was 149,790 and 149,092 bytes respectively, below 196,608 bytes. All 102 responsive preview variants brought the totals to 3,221,377 and 3,220,679 bytes, below 4,194,304 bytes. Initial JavaScript, CSS and all font subsets also remained within their separate budgets. Playback audio, deferred audio modules and full-resolution originals opened on demand are excluded, as stated by `test-results/mobile-waveform-transfer.json`. The existing deferred website audio chunk still exceeds the bundler's 500 KiB warning threshold.

## Whole-repository audit

What this repo does: it adds track tempo, pitch, automation and sharing to SoundCloud in a browser or the supported desktop wrapper. Its website also previews shared settings and uses a backend to resolve streams and publish bounded rendered sets. The assumed load is one playback owner per listening tab and the existing single-instance backend with its configured bounded queue, not an untested multi-instance service.

The review covered audio decoding/transport/clocks, source binding, WASM/buffered handoff, crossfade/output, profiles/sharing, host integration, source structure, server resolution/process limits, rendered-share lifecycle and release workflows. The low-speed-to-crossfade problem above was the confirmed audio bug. Bounded decode paths and cache sizes do not by themselves prove acceptable peak native memory or DSP cost on cheap phones.

Pages previously ran independently of Test, so a failed check could accompany a successful public deployment. The local workflow now runs after a successful main-branch push Test, checks the repository and current main SHA, and checks out that tested SHA. Manual Pages deployment is removed; rerun Test to retry. The static contract test passes. The first real GitHub workflow run after publication still needs observation.

A separate backend problem remains: startup cleanup stats a nonexpired ready render's MP4 and lets `ENOENT` abort share-store initialization. A missing MP4 after an incomplete restore or selective file loss can therefore prevent the entire share service starting. A throwaway real-store reproduction confirmed it. See `server/shares/store.mjs`, the ready-job cleanup and awaited startup cleanup. A follow-up should invalidate only the affected job and preserve other links. This task does not silently change the backend's recovery contract.

### Must fix in a backend follow-up

1. A single missing render can stop the share service starting, at `server/shares/store.mjs:110` and `:140`.
   - What this is: startup cleanup counts and sizes existing published jobs before accepting requests.
   - Problem: a ready, unexpired job without its MP4 makes `stat` throw; the awaited cleanup rejects service initialization. The throwaway-store reproduction used exactly that state.
   - Fix: handle missing media for that job, invalidate it and continue counting intact jobs. Keep other filesystem errors visible rather than swallowing every failure.
   - If we skip it: incomplete restores or selective file loss can take all shared links offline until the affected job is repaired or removed.

Verdict: the scoped mobile/waveform change has no remaining confirmed functional or structural blocker in the checked paths. Fix the missing-render recovery before relying on unattended backend restarts. No line-saving or dependency-removal total is claimed; the migration changes ownership rather than proving a smaller bundle. Not checked: live Oracle recovery, multi-instance deployment, native peak memory, physical phone latency, protected-stream playback and the desktop wrapper's installed session.

`docs/DISCORD.md` now distinguishes set pages playing an existing published render from single-track pages resolving and processing the original stream. The latter still depend on SoundCloud availability. No TCD backend changes, domain changes, external publication or account access are part of this work.

## Reference findings and useful next work

[VirtualDJ's rhythm waveform](https://virtualdj.com/manuals/virtualdj/interface/topsection/rhythmwave.html) and [waveform layouts](https://virtualdj.com/manuals/virtualdj/interface/topsection/appcontrols/layout/waveform.html) separate playback display from beat-grid analysis. The fixed playhead and overlap lanes are behavioral references, not copied UI or proprietary code. A real beat grid would need a separate analysis path and correction controls, as in its [BPM editor](https://virtualdj.com/manuals/virtualdj/editors/bpmeditor.html).

[SoundCloud-Android](https://github.com/okeydw/SoundCloud-Android) is a Kotlin/Media3 native application, not just a web wrapper. Its account/backend route is not suitable to adopt here. Its design and source were not copied. A full native Android port needs a separate authentication and playback plan, not an injected footer renamed as an app.

[SoundCloud-Desktop](https://github.com/zxcloli666/SoundCloud-Desktop) has useful patterns worth considering:

- Plugin-only UI scale, borrowing the idea of its [bounded scale control](https://github.com/zxcloli666/SoundCloud-Desktop/blob/main/desktop/src/lib/ui-scale.ts), rather than scaling the whole SoundCloud page.
- A desktop compact/expanded player based on our own controls. Its [mini-player](https://github.com/zxcloli666/SoundCloud-Desktop/blob/main/desktop/src/tray/MiniPlayer.tsx) is a feature reference, not a layout to copy.
- Editable shortcuts that ignore typing and expose conflicts. Page-local shortcuts can use our existing bindings; global keys and conflict reporting like its [native hotkey code](https://github.com/zxcloli666/SoundCloud-Desktop/blob/main/desktop/src-tauri/src/app/hotkeys.rs) require support from the desktop wrapper.

Lyrics, scrobbling, downloads, third-party account proxies and a native client rewrite are not included. No new dependency was added for the mobile controls or waveform.

## Anti Slop delivery gate

This is the main agent's nondelegated gate for the implemented touch/waveform UI and its connected settings. It does not certify the entire existing website, SoundCloud's own layout, physical hardware, or the separate backend recovery issue. Evidence is in the named source and runnable fixtures above. Each PASS below describes what was actually checked within that scope.

### Hard gate

- R-02 PASS: authored mobile/waveform labels and status text contain no em dash; copy uses direct action names.
- R-03 PASS: the 320/393-pixel visual-viewport fixture asserts player bounds, 44-pixel transport targets and short-screen containment; 768/1,440-pixel waveform panels remain in bounds.
- R-17 PASS: the UI shows media time, tempo, semitones and real envelope metadata; it adds no customer, speedup or uptime statistic.
- R-18 PASS: no testimonial, invented person or generated avatar is added.
- R-23 PASS: artwork comes from the current track; captures use the already authorized Drown example and existing themes; no new logo or identity asset is created.
- R-24 PASS: the availability notice uses the existing installation-help destination; no navigation page or fake anchor is added.
- R-25 PASS: the three-theme fixture checks text contrast; the waveform placeholder inherits full-opacity foreground instead of the failing browser grey.
- R-26 PASS: mobile action fixtures exercise transport, tempo/pitch typing and stepping, sliders, resets, volume, saved tempo, settings and waveform seeking; disabled actions are tested explicitly.
- R-27 PASS: waveform fixtures cover empty, loading, unavailable/error and valid data; invalid seeking produces authored status and `aria-invalid`; missing native player has a truthful notice.
- R-28 PASS: no FAQ is introduced.
- R-32 PASS: waveform arrows/Home/End/exact submission and control keyboard stepping are tested; Escape returns settings focus to the visible touch button; authored focus styling is retained.
- R-33 PASS: features are authored in source modules using patch edits; capture scripts produce PNG evidence, not source/CSS rewrites.
- R-34 PASS: Light, Charcoal and OLED are exercised for touch controls, waveform and existing settings; the light waveform uses theme foreground and surface tokens.
- R-35 PASS: production build/type checks and runnable browser action fixtures are recorded; a screenshot alone is not treated as functional evidence.
- R-36 PASS: performance text names the bounds and measurement scope; it makes no low-end smoothness, security certification or live crash-fix claim.
- R-37 PASS: the existing user-approved `DESIGN.md` supplies identity, dials and design read; this is not an unlabelled design without direction.
- R-38 PASS: phone/library content in isolated tests is fixture data; public captures retain provenance and the real selected track; no fixture is presented as a live account or customer.

### Purpose gate

- R-01 PASS: the only artwork gradient is the requested current-left/next-right crossfade mask; it encodes the handoff, not a decorative background.
- R-04 PASS: existing transport/stepper/disclosure symbols describe their actions; no generic icon library or decorative feature icon is added.
- R-06 PASS: desktop controls inherit SoundCloud typography; the touch sheet uses 16-pixel Arial/system sans for readable physical text without a font request; numbers keep the existing tabular treatment, not display monospace.
- R-07 PASS: seconds ticks belong to the waveform axis; no graph-paper or decorative background grid is introduced.
- R-08 PASS: arrows step numbers, operate transport or disclose controls; none is a decorative CTA.
- R-09 PASS: the pitch notice reports an actual modification; no promotional capsule or fake status is added.
- R-10 PASS: mobile and waveform panels are opaque; no blur/backdrop-filter layer is added.
- R-12 PASS: the floating desktop waveform panel uses separation from the host page, not shadows on every control; touch controls remain flat.
- R-13 PASS: no glow is added.
- R-14 PASS: the transport row, adjustment groups and waveform have different layouts because their tasks differ; no feature-card grid is added.
- R-19 PASS: waveform movement follows the audio source, and the artwork mask follows crossfade progress; paused/hidden/collapsed work stops and reduced-motion artwork is tested.
- R-22 PASS: real track artwork and real captured UI replace illustrations; no generic or generated illustration is added.

### Liveliness

- Dials PASS: ENERGY 1, RHYTHM 2, MOTION 2 are explicit in the design read above and in `DESIGN.md`.
- Dial consistency PASS: quiet resting transport, grouped expanded controls and position-driven motion match those values; no decorative entrance sequence is added.
- Focal point PASS: transport is primary at rest; the fixed playhead and scrolling waveform take priority when opened.
- Whitespace PASS: separate transport, adjustment and waveform groups are visible in the reviewed phone/desktop captures rather than equally padded generic cards.
- Accent PASS: the existing orange marks playback position, filled rails and active state against neutral opaque panels.
- Identity motif PASS: the existing outlined rail/thumb/tick treatment repeats across tempo, pitch and waveform navigation.
- Design read PASS: this change follows the existing preimplementation compact-music-tool design read, recorded again above with its purpose.

### Craftsmanship and quality locks

- C-1 PASS: colour, layout, typography, targets, grouping, artwork and motion each have a concrete reason in the decisions section.
- C-2 PASS: new controls call real canonical actions; no visual-only fake transport or seek field is shipped.
- C-3 PASS: every new group operates the current track or explains native-player availability; no marketing section is added to fill a template.
- C-4 PASS: scoped empty/loading/error, three themes, phone/desktop widths, keyboard and disabled-action states have executable checks; unsupported host mobile pages are labelled, not disguised.
- C-5 PASS: real source values, bounded-work assertions and capture hashes back the claims; physical-device performance remains explicitly unverified.
- R-05 PASS: a compact transport and disclosed adjustment/waveform sheet follow listening tasks, not a hero/card/pricing template.
- R-11 PASS: the existing small-radius rectangular controls remain; no all-pill redesign is introduced.
- R-15 PASS: action labels name Play, Next, Controls, Settings, Seek, Dismiss and Installation help rather than generic marketing CTAs.
- R-16 PASS: authored UI copy describes track actions and limitations without marketing buzzwords.
- R-20 PASS: the orange ruler/outlined-thumb language and current-to-next artwork transition preserve the existing music-tool identity.
- R-21 PASS: existing Light/Charcoal/OLED preferences apply to the added controls; light mode is exercised rather than deferred.
- R-29 PASS: neutral panels and foregrounds plus the existing orange accent remain the active palette.
- R-30 PASS: neither Android reference layout nor VirtualDJ skin is copied; only the requested fixed-playhead and overlap behavior is used.
- R-31 PASS: the decisions section states a one-line reason for each major visual choice; no new asset or visual technique lacks a purpose.
