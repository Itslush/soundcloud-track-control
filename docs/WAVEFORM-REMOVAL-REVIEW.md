# Waveform removal and footer thumbnails

Local candidate checked on 2026-10-13, then prepared for publication as v1.2.7.1 at the user's request. The installed soundcloud-rpc plugin is unchanged. Deployment is verified separately from the local checks below.

## Scope and outcome

Removed the plugin waveform renderer, waveform metadata loader, UI, timer, seek callback, tests and benchmark artifacts. The tempo/pitch timeline editor, audio engine, saved settings and share formats are unchanged. SoundCloud's own waveform is not removed.

The mobile footer previously read only a computed background from the outer artwork element. The new regression failed with `none` for both an image element and an inner `.image__full` background. Both now use the existing crossfade artwork reader, extended to handle these forms. Empty artwork clears the previous cover. One observer watches only the current native avatar, reconnects when that avatar changes and disconnects on disposal. A captured image-load event handles late `srcset` resolution. No polling or new dependency was added.

This does not establish a fix for the Nothing Phone (2a) audio hitching. No DSP settings were changed, and no real-phone performance result is claimed.

## Executed checks

- `npm test`: 595 tests passed, zero failures or skips, including clean-build and dependency checks.
- `npm run typecheck` and `npm run build`: passed.
- `verify-mobile-player.py`: passed. Image, nested background, missing artwork, late image/background updates and replacement avatar checks run in Chromium and Firefox. The generated userscript is also checked with an image thumbnail in 320px and 393px phone fixtures. Waveform controls are absent; tempo/pitch, volume, save/reset, settings, keyboard operation and three themes remain covered.
- `verify-inline.py`, `verify-phone-layout.py`, `verify-crossfade.py`, `verify-track-visuals.py`, `verify-artwork-overhead.py`, `verify-timeline.py`, `verify-updates.py`: passed. Crossfade tests retain left-to-right artwork, reduced-motion behavior and the pitch notice. Track-visual verification is now included in the normal browser runner.
- Inspected the 320px Light and 393px OLED mobile captures and the Firefox thumbnail capture. The flat orange thumbnail is deliberately synthetic test artwork, not a user-facing asset.
- `git diff --check`: passed. Searches found no remaining production waveform feature references; the website icon's waveform description is still accurate.

Evidence logs are under ignored `test-results/`: `thumbnail-before.log`, `thumbnail-after.log`, `waveform-removal-unit.log`, `waveform-removal-types.log`, `removal-build.log`, `removal-track-visuals.log` and `removal-verify-*.py.log`.

## Structure review

The waveform removal eliminates its state and scheduling, rather than leaving hidden work running. Artwork reading is shared with crossfade visuals instead of copied. Existing lifecycle ownership remains with the mobile player. No storage, authentication, API, backend or installation contract changed. Deleted tracked files remain recoverable from Git. No unrelated source restructuring was performed.

## Design and delivery gate

Scope: the changed player and documentation, verified in isolated browser fixtures. Existing DESIGN.md direction retained: ENERGY 1 / RHYTHM 2 / MOTION 2. Compact music controls, original themes and orange accent stay unchanged. These checks do not certify every live SoundCloud page or the physical phone.

- R-02 PASS: new documentation has no em dash; no new product wording was introduced.
- R-03 PASS: mobile player and phone-layout suites pass, including desktop-site scaling and 44px touch targets.
- R-17 PASS: test counts come from the executed logs; no speedup is claimed.
- R-18 PASS: no testimonials were added.
- R-23 PASS: only requested source artwork is displayed; synthetic test artwork is explicitly identified above.
- R-24 PASS: no navigation destinations changed.
- R-25 PASS: mobile caption contrast checks pass in Light, Charcoal and OLED; crossfade pitch-notice contrast checks pass.
- R-26 PASS: mobile controls, save/reset and settings handlers are exercised in the player suite.
- R-27 PASS: missing artwork clears the cover; late image/background loads update without playback.
- R-28 PASS: no FAQ content was added.
- R-32 PASS: keyboard adjustments, Escape and settings focus restoration pass.
- R-33 PASS: source changes were made directly, with the normal build producing artifacts.
- R-34 PASS: all three existing themes remain covered by mobile and track-visual checks.
- R-35 PASS: build and scoped browser interactions were executed; captures were inspected.
- R-36 PASS: there is no claim that audio stutters are fixed or that device performance improved.
- R-37 PASS: existing project direction and the dials above govern the change.
- R-38 PASS: fixture content is labelled, and real-phone verification remains explicitly outstanding.
- R-01 PASS: the retained gradient mask shows the crossfade's outgoing/incoming artwork; no decorative gradient was added.
- R-04 PASS: no new icons were added; existing transport symbols retain their actions.
- R-06 PASS: existing player typography is unchanged.
- R-07 PASS: no decorative grid or chart was added; the waveform chart was removed.
- R-08 PASS: existing transport arrows remain functional.
- R-09 PASS: no decorative badges were added.
- R-10 PASS: no glass surfaces were added.
- R-12 PASS: no new shadows were added.
- R-13 PASS: no glows were added.
- R-14 PASS: no feature-card layout was introduced.
- R-19 PASS: crossfade motion remains functional and respects reduced motion; the waveform loop is removed.
- R-22 PASS: no illustrations were introduced.
- Dials PASS: ENERGY 1 / RHYTHM 2 / MOTION 2 retain the established player direction.
- Dial consistency PASS: artwork restoration identifies the track without adding an effect or animation loop.
- Focal point PASS: title and current artwork lead the existing transport controls.
- Whitespace PASS: inspected captures retain grouping between transport and expanded adjustments.
- Accent PASS: the existing orange control accent is unchanged.
- Identity motif PASS: original flat controls, cover artwork and horizontal sliders remain.
- Design read PASS: project direction and the narrowly scoped changes are declared above.
- C-1 PASS: deletion follows the explicit request; thumbnail changes restore track identification.
- C-2 PASS: remaining controls keep their tested handlers.
- C-3 PASS: no filler section was added; obsolete waveform documentation was removed from the guide.
- C-4 PASS: mobile and desktop fixture checks pass, including themes, reduced motion and missing artwork.
- C-5 PASS: claims are limited to the recorded local checks.
- R-05 PASS: no new layout template was introduced.
- R-11 PASS: existing component radii are unchanged.
- R-15 PASS: action labels remain specific and unchanged.
- R-16 PASS: no marketing copy or promotional claim was added.
- R-20 PASS: SoundCloud track identity remains the basis of the footer.
- R-21 PASS: all existing appearance options are retained.
- R-29 PASS: no new production palette colors were added.
- R-30 PASS: no third-party design was copied.
- R-31 PASS: artwork identifies the current track; waveform removal follows the user's performance precaution.

## Four-part maintenance release

The user requested continued publication with a fourth version component. Version 1.2.7.1 is used consistently by the package, lockfile, userscript metadata, runtime, desktop download and release manifest. Build validation accepts three or four numeric components and still rejects malformed versions. A failing-before regression now passes for the four-part artifact. Tampermonkey documents multi-part version comparison in its [version reference](https://www.tampermonkey.net/documentation.php#meta:version).

The final versioned build passes 596 unit tests, type checking and the release build. The npm clean-install dry run succeeds. Mobile-player and update-notice checks run against this versioned artifact. Current downloads are 1,028,315 bytes, SHA-256 `2017c2b7a404a336d0af9175f0ab8e035b81c40e8a5679d9ad018ed40e5c8072`. Publication does not change the locally installed desktop plugin or establish real-phone audio performance.
