# v1.2.4 release checks

Prepared on 2026-10-13 for publication requested by the project owner. This report records local release gates; GitHub Actions and live download checks are separate publication evidence.

Userscript SHA-256: `8731f7ba640f0c637e20cc3ce80692adec85c30ffc833df88ca5d164371ff018`, 1,031,098 bytes. Desktop plugin SHA-256: `0e17a24e01dc1d73d0eb0a08ea89c98fe463f1acaa6fbe4489a0ecd83a35b799`. Both come from the same canonical source build. Storage keys and existing shared-link formats are retained.

## Gates and scope

- All 595 unit tests pass, with no skips and FFmpeg configured. Typecheck, deterministic packaging and the production release build pass.
- All 27 muted browser suites pass serially against this userscript, including touch desktop-site detection, phone geometry/actions, waveform, timeline automation, saved tracks, transport, real WASM overlap/handoff and update notices.
- The focused artwork check also covers the real interpolated CSS properties, feather pixels, reduced motion, missing incoming image and cancellation at three widths across Light, Charcoal and OLED.
- The installed soundcloud-rpc v0.2.0 loader activates and deactivates the release adapter in a separate fixture profile. Its browser fixture passes tempo, saved state, fractional pitch, notice, settings, reinjection, disable/reload and restoration. It does not read the user's account or settings.
- All 102 feature/set PNGs were recaptured against this exact userscript hash. `docs/feature-capture-evidence.json` records their provenance, dimensions and checksums. No audio was published by the capture scripts.
- The source-ownership check rejects root implementation modules and source modules over 1,000 physical lines. Browser, website and server imports use the owning feature folders. The render runtime payload includes the new shared artwork helper.
- Before the server update, a read-only check found 18 unexpired ready jobs, all 18 MP4s present, and no running render. Deployment must preserve those files and retain the prior runtime for rollback.
- The first server health check rejected the repository config's renamed path and restored the prior code. Keeping the VM's existing config preserved its old API prefix. The corrected update passed service readiness and all 18 saved-link checks; the deployed set renderer matches the repository SHA-256. Deployment instructions now distinguish the VM config from the Pages build config.
- The installed desktop file matches the release adapter hash. Its prior v1.2.2 file is retained as a backup; the app archive stays byte-identical. File replacement is atomic, and the wrapper's existing watcher refreshes the plugin. Live desktop music playback is not certified by this installation check.
- The compatibility site is generated from this release. Old redirects preserve path, query and fragment; legacy metadata/download URLs retain updates for existing installs.

Local logs are under `test-results/release-1.2.4-*.log`. The design and broader implementation reviews are `MOBILE-WAVEFORM-REVIEW.md` and `ARTWORK-SMOOTHING-REVIEW.md`; their older artifact hashes remain historical evidence, not hashes for this release.

## Limits

This is an Android-browser touch player, not a native Android app or a Safari playback fix. SoundCloud's desktop site and a userscript-capable browser are required. Waveforms use public amplitude envelopes, not decoded spectral data or analyzed beats.

Physical low-end phone latency, Firefox Android playback, prolonged background audio and live protected-stream crossfades remain unverified. Newly rendered set videos retain 4 fps artwork; older published videos are not rewritten. The previously recorded transient paused-seek trial has no established cause. A passing serial gate is not proof that it cannot recur.

The separate missing-render startup recovery issue remains documented in the mobile review. Current saved media passed the predeployment check; that does not fix recovery after future file loss. No unrelated backend or account system is changed.

## Anti Slop delivery gate

Main-agent, nondelegated release PASS report. The release retains the existing design read, ENERGY 1, RHYTHM 2, MOTION 2, and introduces no new layout. Each line covers the current release within the stated fixture scope.

- R-02 PASS: the new changelog uses plain sentences without em dashes.
- R-03 PASS: current touch geometry/actions and native artwork bounds pass at the tested widths.
- R-17 PASS: version, artifact sizes and test counts come from actual build/test output.
- R-18 PASS: no testimonial or invented person is added.
- R-23 PASS: the existing selected track and artwork supply captures; fixture covers are labelled in their review.
- R-24 PASS: install/download paths use the configured main site; compatibility redirects preserve shared settings.
- R-25 PASS: the current theme and pitch-notice contrast checks pass; release copy uses existing page styles.
- R-26 PASS: the 27-suite action gate and desktop adapter fixture exercise the reused controls.
- R-27 PASS: waveform states, missing artwork, cancelled transitions and unsupported native-player notices have checks.
- R-28 PASS: no FAQ is added.
- R-32 PASS: keyboard stepping, seeking, Escape and focus restoration remain in the browser gate.
- R-33 PASS: source changes use patch edits; build and capture scripts generate artifacts, not feature rewrites.
- R-34 PASS: Light, Charcoal and OLED are exercised by the current browser checks and captures.
- R-35 PASS: the exact release is built and run through unit, browser and desktop-loader gates.
- R-36 PASS: the release claims no hardware certification or live DRM-crash fix.
- R-37 PASS: the established compact music-tool direction governs the release.
- R-38 PASS: actual track metadata supplies public captures; isolated fixtures are not presented as real accounts.
- R-01 PASS: the artwork gradient encodes the requested track handoff, as recorded in the design.
- R-04 PASS: no new icon set is added.
- R-06 PASS: existing readable player/page typography is retained.
- R-07 PASS: waveform ticks indicate source time; no decorative grid is added.
- R-08 PASS: existing arrows operate numeric or transport controls, not decorative CTAs.
- R-09 PASS: the pitch notice reports an actual modification.
- R-10 PASS: player panels stay opaque; no new glass layer is added.
- R-12 PASS: no additional shadow system is introduced.
- R-13 PASS: no glow is added.
- R-14 PASS: transport, adjustment and waveform groups retain their task-specific layouts.
- R-19 PASS: waveform follows source time, artwork follows overlap, and reduced motion has checks.
- R-22 PASS: real track artwork and actual UI captures are used.
- Dials PASS: ENERGY 1, RHYTHM 2, MOTION 2 remain explicit above and in the design.
- Dial consistency PASS: position-driven movement and grouped controls match the recorded direction.
- Focal point PASS: transport remains primary at rest; the expanded waveform centers the playhead.
- Whitespace PASS: current mobile and native bounds checks retain the reviewed grouping and spacing.
- Accent PASS: the existing orange playback/control accent remains.
- Identity motif PASS: authored rails, outlined thumbs and the cover handoff remain consistent.
- Design read PASS: this release uses the previously reviewed compact music-tool design, not a new template.
- C-1 PASS: major decisions and their reasons remain in the design and implementation reviews.
- C-2 PASS: current action tests cover the controls; no visual-only feature is introduced.
- C-3 PASS: the changelog names shipped behavior; no template section is added.
- C-4 PASS: current fixture gates cover states, themes, touch geometry and keyboard operation.
- C-5 PASS: exact hashes and runnable evidence support claims; unverified hardware is stated above.
- R-05 PASS: the task-driven player layout is retained.
- R-11 PASS: existing authored control shapes and radii remain.
- R-15 PASS: install and player actions retain concrete labels.
- R-16 PASS: new release copy names behavior and requirements without marketing buzzwords.
- R-20 PASS: the existing music-player identity is retained.
- R-21 PASS: the existing three-theme choice is exercised, including Light.
- R-29 PASS: the existing palette and accent are retained.
- R-30 PASS: no third-party skin or Android-reference layout is copied.
- R-31 PASS: design reasons remain written in the connected reviews; this release adds no unexplained visual choice.

Copywriting audit PASS: changelog facts come from implemented behavior and the recorded checks, with no invented claim, generic CTA or promotional wording.
