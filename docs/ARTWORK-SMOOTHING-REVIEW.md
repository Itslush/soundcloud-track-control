# Crossfade artwork smoothing

Historical local evidence. See `RELEASE-1.2.4-QA.md` for the later versioned release and its current capture manifest.

Local refinement on 2026-10-13. Not published or installed. Version remains 1.2.3.

The candidate userscript SHA-256 is `670b95294820489f88ac7d2d4a50412198956d22416fd4bacb69ac6c0eea0da6`, 1,031,098 bytes. The earlier mobile/waveform report records its own, older candidate; its full browser-suite results must not be attributed to this artifact.

## Scope and decisions

Current artwork stays on the left; incoming artwork enters from the right. The feather spans half the image instead of one fifth, and smoothstep eases the entrance and finish. The existing audio-clock callback still drives the transition. Registered, project-prefixed CSS properties interpolate its 100 ms updates without a new JavaScript animation loop. Desktop and touch artwork share the same values. Reduced motion uses opacity without the moving mask.

Set-video generation imports the same pure geometry helper. Its existing 4 fps input and RGB-buffer count are unchanged. The softer curve improves newly rendered artwork but does not make these videos as temporally smooth as browser interpolation. Existing published media is not rewritten. Audio mixing, crossfade duration, settings, stored data and share formats are unchanged; no dependency or option was added.

This follows the existing compact music-tool design read: ENERGY 1, RHYTHM 2, MOTION 2. The mask explains the handoff rather than decorating the player. Spacing, typography, controls and the Light/Charcoal/OLED palette retain the decisions in `DESIGN.md` and `MOBILE-WAVEFORM-REVIEW.md`.

## Evidence

- Regression first: wider-feather pixel assertions failed against the old renderer, recorded in `test-results/artwork-smoothing-red.log`; the same assertions pass after the shared change.
- 595 unit tests pass, none skipped, including helper endpoints, monotonic easing, bounds, fixed feather width, rendered RGB values and the real FFmpeg set-worker integration. Final log: `test-results/artwork-smoothing-tests-final.log`.
- Typecheck and production userscript/site build pass: `artwork-smoothing-types.log` and `artwork-smoothing-build.log` under `test-results`.
- `verify-track-visuals.py` passes at 390/768/1,440 pixels in all three themes. It pauses the real CSS transitions at 50 ms and checks their interpolated values, reads actual feather pixels, checks reduced motion and cancellation, and holds the current cover if the next image is missing.
- `verify-mobile-player.py` passes with touch contexts at 320/393 physical pixels over the 980-pixel desktop layout. Its source-module fixture now checks the same three real CSS transitions across the shadow boundary, reduced-motion opacity and cancellation. Existing transport, adjustment, theme, keyboard, layout and disposal checks also pass. The direct-module screenshot contains deliberately unstyled canonical fixture inputs; it is not a screenshot of the shipped player.
- `verify-crossfade.py` passes the existing real-WASM overlap/handoff fixtures at normal speed, shifted pitch and incoming 0.5x preserved pitch. This is a regression check, not a live Widevine-crash reproduction.
- Main-agent visual review used two batched rounds: native footer captures across phone/tablet/desktop sizes and themes, plus the touch source-module midpoint. The red/blue covers are honest test fixtures used to expose the blend, not real track artwork.
- Recaptured 96 feature PNGs and 6 set-editor PNGs against the exact candidate above, recorded in `docs/feature-capture-evidence.json`. The gallery check passes 17 focused views at seven widths across all three theme sources, including zoom, focus restoration, Escape, failure/retry and no-JavaScript originals. No render was submitted or audio published.
- Local HTTP transfer budgets pass, with ETag/304 revalidation. Brotli response bodies total 149,790 bytes for initial resources and 3,221,514 bytes including every preview variant; this excludes headers, TLS, playback audio, resolver responses, dynamic imports and full screenshot originals opened on demand. This is not a CPU or phone frame-rate measurement. Log: `test-results/artwork-smoothing-transfer.json`.

## Maintainability and limits

The geometry helper has one job and no state. Both the DOM and video consumers call it; the touch mirror copies the canonical values. No audio engine, polling interval, source ownership or recovery contract changed. CSS interpolation remains bounded to the existing artwork layer and disappears with it on cancellation.

Browser evidence is owned, muted headless Chromium, not a physical Android phone, Firefox, installed soundcloud-rpc session or live Discord playback. Older browsers without typed custom-property interpolation still receive the eased values and wider feather, but their interpolation is not certified here. Native peak memory, cheap-phone frame pacing and DRM playback remain unmeasured. The separately documented missing-render backend recovery issue and unexplained paused-seek trial are not addressed by this motion refinement.

## Anti Slop delivery gate

Main-agent, nondelegated PASS report for this motion-only refinement. Unchanged interface decisions are retained, not recertified as a full-site redesign. Evidence refers to the source and runnable checks above, plus the existing design read.

### Hard gate

- R-02 PASS: no user-facing copy is added or changed.
- R-03 PASS: native three-width and touch desktop-view bounds checks pass; artwork stays inside its existing cover.
- R-17 PASS: no statistic or performance claim is introduced.
- R-18 PASS: no testimonial, person or avatar is invented.
- R-23 PASS: only existing track covers are blended; red/blue review covers are labelled fixtures.
- R-24 PASS: navigation and destinations are unchanged.
- R-25 PASS: text and palette are unchanged; pitch-notice contrast and the existing mobile theme checks pass.
- R-26 PASS: current mobile transport and adjustment action checks pass; no new control is added.
- R-27 PASS: missing-next-cover hold and cancellation pass; existing error and unavailable states are retained.
- R-28 PASS: no FAQ is introduced.
- R-32 PASS: artwork is noninteractive and aria-hidden; existing keyboard and focus checks pass.
- R-33 PASS: source changes use patch edits; existing capture scripts only generate evidence images.
- R-34 PASS: native artwork runs in Light, Charcoal and OLED, with mobile theme checks passing.
- R-35 PASS: build, types, unit tests and the named browser action fixtures run against the local candidate.
- R-36 PASS: no low-end smoothness, security certification or live-crash fix is claimed.
- R-37 PASS: the established design read and explicit dials govern this refinement.
- R-38 PASS: solid-colour tests are identified as fixtures; public captures use actual track metadata.

### Purpose gate

- R-01 PASS: the broader gradient mask represents the requested outgoing-to-incoming handoff.
- R-04 PASS: no icon or icon library is added.
- R-06 PASS: typography is unchanged under the existing readable-player design decision.
- R-07 PASS: no grid or decorative background is added.
- R-08 PASS: no arrow or CTA is added.
- R-09 PASS: existing pitch notice still reports real adjustment; no promotional badge is added.
- R-10 PASS: no blur or glass surface is introduced.
- R-12 PASS: no shadow is introduced.
- R-13 PASS: no glow is introduced.
- R-14 PASS: no card or section layout is introduced.
- R-19 PASS: easing follows the audio-clock handoff; reduced-motion opacity and cancellation have executable checks.
- R-22 PASS: actual track covers are reused; no generic illustration is introduced.

### Liveliness

- Dials PASS: ENERGY 1, RHYTHM 2, MOTION 2 remain explicit above.
- Dial consistency PASS: only handoff artwork is eased; no decorative entrance or bounce is added.
- Focal point PASS: resting transport and the optional waveform remain the existing focal points.
- Whitespace PASS: existing grouped controls and spacing are unchanged and remain in bounds.
- Accent PASS: the existing orange playback/control accent is unchanged.
- Identity motif PASS: the established left-to-right cover handoff and rail/thumb controls remain.
- Design read PASS: this is a refinement under the existing compact music-tool direction, not a new template.

### Craftsmanship and quality locks

- C-1 PASS: feather width, easing and interpolation each have a purpose recorded above.
- C-2 PASS: no new interaction is introduced; existing mobile actions pass.
- C-3 PASS: no section or template filler is introduced.
- C-4 PASS: endpoints, missing cover, cancellation, reduced motion, themes and touch mirroring have checks.
- C-5 PASS: test logs and the exact candidate hash back the claims; hardware limits are explicit.
- R-05 PASS: existing task-driven player structure is unchanged.
- R-11 PASS: control shapes and radii are unchanged.
- R-15 PASS: action names are unchanged; no generic CTA is added.
- R-16 PASS: no marketing copy is added.
- R-20 PASS: the requested cover handoff refines the existing music-player identity.
- R-21 PASS: existing Light/Charcoal/OLED choice remains; all modes are exercised.
- R-29 PASS: no palette colour or accent is added; real artwork retains its own colours.
- R-30 PASS: this alters the project's existing mask rather than copying a third-party skin.
- R-31 PASS: the motion decisions have one-line reasons in the scope section; other design decisions are unchanged.
