# Phone layout and copy review

## v1.2.7 sizing and update notice

The user's Firefox Android screenshots confirm the v1.2.6 two-column cards and accessible mobile Settings button. They also expose footer text and account glyphs that still use desktop-sized pixels, and an update notice clipped against the player.

The notice lives inside the plugin's shadow root. Its fixed positioning conflicts with the scaled, scrolling mobile host; this is not a missing z-index or a SoundCloud text rule crossing the shadow boundary. The phone notice now occupies its own row before transport, so the existing host ResizeObserver reserves its height. Dismiss returns focus to the visible mobile Settings button. The desktop notice keeps its position. Its link uses underlined foreground text for readable contrast under the native theme as well as the three custom appearances.

The mobile adapter now sizes the native header glyphs and avatar, footer links and language selector, sidebar headings/actions, promotional message and dismiss control, and app-store links. Selectors come from the public SoundCloud page and its current bundle. These overrides only apply while the existing mobile-layout attribute is present. Background artwork, original destinations and native handlers remain unchanged. No new observer, animation loop, dependency, preference or shared-link format is introduced.

Focused evidence:

- Before the notice correction, the 320px fixture placed its top at 1350.56 CSS px while the host began at 1620.06, reproducing clipping outside the host. The updated notice fits inside the host and ends before transport begins.
- Before the glyph correction, a 22px native SVG measured only 7.18px at the simulated 320/980 viewport scale. Header icons now measure 22px, avatars 26px, footer text 14px and link targets at least 44px in the phone fixtures.
- `tests/verify-updates.py` exercises Chromium and Firefox at 320x640, 393x844, 844x393 and 393x360, with native, Light, Charcoal and OLED appearances. It checks notice bounds, non-overlap, text contrast, target height, Settings/Escape, dismissal focus and page errors. First install, reload, second tab and blocked storage retain their original behavior.
- `tests/verify-phone-layout.py` checks known glyph and footer dimensions, banner wrapping, store-link bounds, original privacy-link activation, two/three columns, layout teardown and 200% title enlargement in both engines.
- Public anonymous SoundCloud inspection confirms the footer, menu/search icons and sidebar selectors. Account-only avatar/mail/notification markup was inspected in the public source and represented in fixtures, not tested through a signed-in account.
- Final public Firefox inspection measures 14px footer/banner text, 22px search/menu glyphs and 44px targets at the simulated phone scale. Store graphics preserve their native proportions. Language spacing and the sidebar dismiss glyph were corrected in the bounded visual review. The document remains 980 CSS px wide without horizontal overflow.

Verification: the unit run passed 600 tests with zero skips; all 29 muted browser suites passed. Final v1.2.7 focused layout and notice checks passed after the last CSS changes. Type checking and the release build passed. Main-agent screenshot inspection confirmed the footer and notice layout. These are desktop browser checks with simulated phone geometry, not physical-device evidence.

Design and review: preserve ENERGY 1 / RHYTHM 2 / MOTION 2. The notice row separates temporary feedback from playback without adding a modal. Existing type, flat boundaries and themes remain; no decoration or marketing copy is added. The main-agent delivery gate below still applies, with R-03/R-25/R-26/R-32/R-34/R-35 evidence extended by the focused tests above. The native link contrast correction is deliberate, not a new accent palette. The source changes stay in the existing layout and update-notice owners; storage, audio processing and saved settings are untouched.

Physical Firefox Android behavior, account-only menus and low-end hardware performance remain unverified for this revision. The installed desktop plugin and backend are not part of this change. Empty native loading placeholders are not claimed fixed by these sizing changes.

## v1.2.6 follow-up

The mobile player now uses a manual popover so SoundCloud's transformed footer cannot move it below the viewport. Settings is on the collapsed transport and opens the existing customization panel. Native footer descendants are hidden only while the mobile adapter is active. Teardown restores the desktop player and the original root styles.

Live anonymous inspection found a transformed `.playControls__inner`, a 360px main-column margin, and an absolutely positioned `.l-sidebar-right` whose child becomes fixed on scroll. The adapter resets those desktop layout constraints. Track-list selectors match direct card children, so Discover's outer list of sections does not accidentally become a card grid. The nested `soundBadgeList > ul > li` shape comes from SoundCloud's public list implementation; signed-in Likes remains unverified.

Discover's native carousel lazily creates cards and calculates translation from a fixed panel count. Overriding card widths and adding horizontal scrolling left empty slots. The mobile version instead uses a two-column grid, hides unrendered slots, and keeps the native forward button to reveal the next group. Live Chromium at 393px and desktop Firefox with simulated 980px Android geometry both loaded every item in the tested eight- and ten-item galleries without removing earlier cards. The forward button disappeared when complete. No private view APIs or scroll-triggered synthetic clicks are used. Idle native buffering controls remain hidden instead of being exposed as spinners on every cover.

The website's black timeline control came from a text-input selector overriding the range background and border. Excluding range inputs restores the existing rail without changing timeline behavior. A regression checks keyboard adjustment and rendered styles on the website and userscript in Chromium and Firefox, in Light, Charcoal and OLED.

Verification includes 600 passing unit tests, 29 muted browser suites, typecheck, builds, website themes and capture checks. The final spinner rule has a focused phone-layout regression in both engines. Settings opens from the collapsed player, Escape restores focus, native playback controls remain hidden, cards wrap, the sidebar follows content, and page zoom and teardown retain their checks. The screenshots in `test-results/mobile-gallery-reveal-*` are real anonymous SoundCloud pages. Library test cards are clearly labelled fixtures.

Main-agent Anti Slop recheck for this follow-up: the existing design read and delivery gate below still govern the changed controls. R-03 and C-4 PASS for the tested fixtures and anonymous pages, with no horizontal page overflow or sidebar overlap. R-26 and R-32 PASS for native gallery activation, collapsed Settings, keyboard pan and focus return. R-25 and R-34 PASS for the existing three-theme contrast checks and restored range styling. R-35 and R-38 PASS for built-code tests and explicitly distinguished live, simulated and unverified contexts. R-19 PASS because the change adds no animation or polling loop. R-31 PASS because the top layer prevents displacement, direct Settings removes the hidden entry point, and progressive card reveal preserves the host's lazy loading. The unchanged purpose, identity, copy and evidence items below retain their evidence and scope.

The strict code review kept the existing settings implementation and removed inline footer-visibility bookkeeping in favor of the scoped adapter stylesheet. No storage keys, share formats, audio routes, server code or installed desktop files changed. Real Firefox Android touch gestures, its keyboard viewport behavior, signed-in Likes and physical low-end performance still need a phone check. Browser fixtures are not proof of those results.

## Phone feedback after v1.2.5

The user found an older duplicate userscript overriding v1.2.5. After disabling it, the mobile layout activated, but newer screenshots exposed separate failures: the touch player was missing, six-column tiles had oversized clipped text, and Discover's sidebar overlaid the main content. Detection is no longer the unresolved issue. The original fixtures did not model these host constraints.

The download-page heading also displayed "pitchon" on mobile. Its hidden line break had no adjacent whitespace. The source now includes a word separator, and the three-theme browser test checks the rendered heading text at 320, 390 and 1440 pixels. Build, contrast, theme, keyboard and interaction checks pass. This correction changes no plugin code, stored settings, audio or desktop installation. The delivery gate below continues to describe the original candidate's scoped checks, not a successful phone result.

## Original candidate review

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
