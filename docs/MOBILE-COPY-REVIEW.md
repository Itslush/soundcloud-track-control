# Phone layout and copy review

v1.2.5 is a phone-testing candidate, not a certification of Firefox Android playback. The user reported the latest script still showing SoundCloud's tiny desktop footer and six-column library in Firefox. Earlier mobile checks covered Chromium and the player fixture, not the whole library page.

## Change and evidence

The touch detector now accepts touch capability when a pointer query reports fine, and keeps the phone layout through rotation. A scoped SoundCloud adapter reflows the existing header, search, tabs and sound-badge lists. It preserves native links and handlers, reserves the player space, and restores its owned styles when the touch layout stops. It introduces no stored preference, audio route, background animation loop or replacement client.

`verify-phone-layout.py --baseline` fails against the published v1.2.4 checksum because the touch-player attribute is absent. The candidate passes six isolated views in desktop Chromium and Firefox at simulated physical widths of 320, 393 and 844 pixels. The tests exercise native card and tab handlers, readable title size, search and tab targets, column count, overflow, player padding, 200% pinch geometry and style restoration. Page sizing follows the layout-to-screen ratio rather than the current pinch scale, so text can grow when the listener zooms. Desktop Firefox cannot emulate Android's APZ viewport, so the test supplies viewport, screen and touch signals explicitly. Its library cards are labelled fixtures, not a capture of the user's account.

Touch capability follows the browser API described by [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/maxTouchPoints). The exact signal values on the user's phone have not been collected. The detector gap is a reproduced candidate cause, not a confirmed diagnosis of that phone.

The landing page now describes listening actions. Speed ranges, steps and set limits remain in More details. The setup guide keeps instructions and warnings while moving processing names into a styled disclosure. A ready waveform no longer repeats an implementation explanation. Loading, empty, unavailable and invalid-seek messages remain, with a useful crossfade status.

Local checks: 600 unit tests pass without skips, typecheck and build pass, the focused mobile-player and waveform fixtures pass, and the mechanical design scan reports no findings. Three website themes pass their existing contrast, keyboard, storage, route and layout checks. All 102 feature/set PNGs were recaptured with checksums against this build. GitHub's full test run and live publication are separate gates.

The first Windows waveform draw-count trial failed. Its bounded rerun passed without weakening the assertion. The cause remains unproven. Physical low-end phone performance, Firefox Android gestures, keyboard resizing and protected-stream playback remain unverified. Other SoundCloud layouts and future host markup changes need their own checks. The desktop installation and backend were not changed.

## Anti Slop delivery gate

Main-agent report, limited to the changed copy and isolated layout fixtures. Design read: the existing compact music tool for listeners, with charcoal/orange surfaces, inherited SoundCloud type and ENERGY 1 / RHYTHM 2 / MOTION 2. The audio and artwork behavior stays unchanged.

- R-02 PASS: revised copy and this report use no em dashes.
- R-03 PASS: six scoped phone views have no page overflow, with readable titles, two portrait columns, three landscape columns and reserved player space.
- R-17 PASS: version, test count and layout measurements come from the build and test outputs.
- R-18 PASS: no testimonials or real-looking invented people are added.
- R-23 PASS: existing artwork is reused. New test cards explicitly say Fixture and are not published as product images.
- R-24 PASS: existing site routes and SoundCloud links stay unchanged. Card and tab fixture handlers receive their original destinations.
- R-25 PASS: the existing three-theme contrast suite passes. The adapter inherits foreground colours and input tokens rather than assigning new text colours.
- R-26 PASS: fixture card and tab actions fire. Existing player tests cover adjustment, save, settings and seek controls.
- R-27 PASS: waveform tests retain empty, loading, unavailable and invalid-input states. Only routine ready narration disappears.
- R-28 PASS: no FAQ is added.
- R-32 PASS: visible focus styling remains. Existing player, waveform and website tests exercise keyboard actions and Escape.
- R-33 PASS: UI changes are authored in source with patch edits, not string-rewrite scripts.
- R-34 PASS: existing Light, Charcoal and OLED checks pass with the inherited tokens and unchanged theme controls.
- R-35 PASS: the candidate is built and exercised in both desktop engines. The physical Android gap is explicit above.
- R-36 PASS: no universal compatibility, low-end speed, playback or crash-fix claim is added.
- R-37 PASS: the existing DESIGN.md governs the change and the dials are explicit above.
- R-38 PASS: the report distinguishes real captures, labelled fixture cards and unverified phone behavior.
- R-01 PASS: no new gradient is added. Existing crossfade and graph gradients retain their purpose.
- R-04 PASS: the guide disclosure reuses the existing chevron icon to indicate expansion.
- R-06 PASS: the adapter inherits SoundCloud type, changing size to make it readable at the supplied viewport scale.
- R-07 PASS: no background grid or decorative graph is added.
- R-08 PASS: arrows remain control or disclosure affordances, not decoration.
- R-09 PASS: no new badge is added.
- R-10 PASS: no glass layer or blur is added.
- R-12 PASS: no new shadows are added.
- R-13 PASS: no glow is added.
- R-14 PASS: existing sections keep their task-specific structure and captures.
- R-19 PASS: no new animation loop is added. The adapter updates on the existing layout events.
- R-22 PASS: no illustrations are created.
- Dials PASS: ENERGY 1 / RHYTHM 2 / MOTION 2 retain the existing direction.
- Dial consistency PASS: the change reflows controls and shortens copy rather than adding effects.
- Focal point PASS: the library remains the page's content, and the new non-sticky header scrolls away.
- Whitespace PASS: native groups wrap, cards have a measured gap and body padding reserves the player height.
- Accent PASS: existing theme accents remain unchanged.
- Identity motif PASS: existing flat controls, artwork and player rails remain.
- Design read PASS: the audience, visual language and dials are declared above.
- C-1 PASS: reflow serves readable navigation and touch input. Disclosure serves shorter main copy without removing limits.
- C-2 PASS: no new product action is added without a handler.
- C-3 PASS: no template section or extra feature card is added.
- C-4 PASS: the isolated views cover portrait, landscape, two engines and teardown. Existing theme and player checks cover their states.
- C-5 PASS: numerical claims are tied to the actual logs, and hardware claims are excluded.
- R-05 PASS: existing site composition stays intact. The host library changes its columns for phone use.
- R-11 PASS: the authored search border retains the existing small radius.
- R-15 PASS: installation, sharing and playback labels stay specific to their actions.
- R-16 PASS: revised descriptions state actions without promotional claims or buzzwords.
- R-20 PASS: the SoundCloud music-tool identity stays intact.
- R-21 PASS: all existing theme choices remain available and pass their checks.
- R-29 PASS: the adapter inherits the palette without adding colours.
- R-30 PASS: no mobile app design or third-party skin is copied.
- R-31 PASS: column changes prevent miniature cards, target sizes support touch, a flowing header preserves screen space, and disclosures separate normal listening from technical lookup.

Copy audit PASS: action descriptions come from existing features. Permissions, expiry, pitch limitations and retained ranges remain available. No fabricated claim or forced casual voice is added.

The old editor surface brief still names `src/tempo-editor.js`. Its source moved during the earlier module split. That unrelated design-context path remains unchanged and can be repointed separately.
