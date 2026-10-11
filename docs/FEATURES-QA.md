# Version 1.2.0 verification

Scope: the expanded landing page, themed feature captures, single-track artwork, Discord adjustment labels, and the new shared-set flow. This is not a fresh audit of every older audio-engine feature.

The main agent ran the Anti Slop delivery gate below. The visual reviewer separately requested two changes: move duration budgets before the track list and give the public-share action the existing primary treatment. Both were applied. The reviewer scored both findings resolved and gave a ship verdict on that fix batch, not a second whole-surface review.

## Evidence

- `npm test`: 577 passing tests, no failures or skips, including the existing clean-build, dependency and buffered-cursor checks.
- `npm run typecheck`: passed.
- `tests/tempo-set.test.mjs`, `tests/discord-render.test.mjs`, `tests/set-entry.test.mjs`: 16 passing tests under an 80 MiB Node heap, including the real WASM and FFmpeg fixture render, AAC decode, halfway artwork blend and fast-start MP4 check.
- `tests/verify-set-editor.py`: retained automation, explicit resolution/publication, reorder focus, removal, bounds, clipboard fallback, stale requests, metadata-only changes, recipient GET-only loading, mismatched render identifiers and expiry.
- `tests/verify-captures.py`: 17 capture subjects, all three themes and seven viewport widths, with viewer keyboard/zoom/retry/no-JavaScript checks and native-size limits for small controls.
- `tests/verify-site.py`: existing content routes, links, downloads, editor interaction, sharing, appearance, donation copy and no-JavaScript behavior.
- `tests/verify-shared-player.py`: plugin-free shared settings, both automation lanes, original comparison, responsive layout, artwork load/failure and restricted-audio errors.
- `tests/verify-discord-share.py`: the existing single-track publication and copy flow.
- `docs/feature-capture-evidence.json`: 102 focused product PNGs, exact userscript version/checksum, source URLs, themes and viewport context. Actual SoundCloud captures and shared-track captures were muted; no public render was created for screenshots.
- Final rendered landing and set screens were inspected at desktop and narrow widths in Light, Charcoal and OLED. Contrast assertions cover the landing feature copy, set budget and enabled primary publication action.

One repeat of the full suite hit the existing compressed-transfer disconnect test's retry deadline. The isolated test then passed, followed by all 577 tests passing in the next full run. No production timeout or assertion was changed to hide that result; the transient test failure is not evidence of a set-render failure.

## Hard gate

R-02 PASS: changed listener-facing copy contains no em dash; track titles are external content.
R-03 PASS: responsive browser assertions found no page overflow at the tested widths; set fields stack on narrow screens.
R-17 PASS: no audience, uptime or performance statistics were added; duration limits match canonical validation and actual PCM checks.
R-18 PASS: no testimonials or fabricated people were added.
R-23 PASS: the user explicitly requested feature PNGs, artwork and a set flow; captures show shipped controls and public track metadata.
R-24 PASS: route and link checks cover the existing navigation and the new Build a set/editor links.
R-25 PASS: text uses incumbent theme tokens; changed feature copy, budget and publication action pass 4.5:1 assertions across all three themes.
R-26 PASS: changed controls have tested behavior, including fixed-value overrides, reorder, removal, publication, copy and recipient playback controls.
R-27 PASS: the set has empty, resolving, queued, ready, failure and expired states; stale responses cannot restore an old result.
R-28 PASS: no generic FAQ was introduced.
R-32 PASS: semantic controls retain focus styling, keyboard number entry and disclosure operation; reorder focus and capture-viewer Escape are verified.
R-33 PASS: source changes used apply_patch; capture scripts produce evidence files rather than rewriting UI source or CSS.
R-34 PASS: Light, Charcoal and OLED source selection, layout and controls were checked in the browser.
R-35 PASS: the release was built and changed flows clicked through; tests distinguish mocked network/video fixtures from real public-track captures.
R-36 PASS: no new security, compliance or seamless-playback claims were added; rendering and live-test limits are recorded below.
R-37 PASS: the user selected preservation of the existing identity; landing and set direction contracts were declared before implementation.
R-38 PASS: production PNGs show actual controls and metadata; synthetic audio/artwork fixtures remain labelled test evidence and are not landing assets.

## Purpose gate

R-01 PASS: no default gradient or glow layer was introduced; flat incumbent surfaces carry hierarchy.
R-04 PASS: download, link, reorder and disclosure icons identify their actions; stars remain the user's requested background motif.
R-06 PASS: Mulish preserves the established listener-facing identity; no new display monospace or tracked uppercase style was introduced.
R-07 PASS: timeline grids encode time and values, not decorative blueprint texture; the background remains sparse stars.
R-08 PASS: arrows indicate a real external/navigation or reorder action, not decoration on every button.
R-09 PASS: no promotional capsule badges were added.
R-10 PASS: no additional glassmorphism was added.
R-12 PASS: no blanket shadow treatment was added; borders and tonal surfaces separate controls.
R-13 PASS: no multi-surface glow treatment was added.
R-14 PASS: feature rows are grouped by actual listening workflows; control captures keep their own proportions instead of uniform cards.
R-19 PASS: background star motion is the established optional appearance feature; the set artwork follows real audio join times rather than template entrance animation.
R-22 PASS: screenshots replace generic illustration; covers belong to actual resolved tracks.

## Liveliness

Dials PASS: ENERGY 1 / RHYTHM 2 / MOTION 2 are explicit in both surface contracts.
Consistency PASS: restrained outlined controls, alternating copy/capture proportions and optional drifting stars match those dials.
Focal point PASS: installation/editor lead the landing; track entry, visible budgets and the public-share action lead the set workflow.
Whitespace PASS: section spacing separates main features, technical summaries and installation; set rows separate tracks and their joins.
Accent PASS: orange marks active settings, links and the primary action; neutral surfaces remain dominant.
Motif PASS: the existing orange control line, sparse stars and track-focused screenshots repeat across themes.
Design read PASS: both contracts commit to a local extension of the existing shared-player system, not a replacement identity.

## Craftsmanship and quality locks

C-1 PASS: layout, typography and controls reuse the identity the user explicitly chose to keep.
C-2 PASS: no inert product controls were added; intentional initial disabled states are tied to validity or readiness.
C-3 PASS: each new section maps to an implemented feature; technical summaries remain visible before expansion.
C-4 PASS: changed states, narrow layouts, theme switches and keyboard paths have browser checks; failures preserve settings rather than silently publishing.
C-5 PASS: claims describe tested behavior or documented limits, not invented adoption or speed measurements.
R-05 PASS: the page keeps its real editor and focused workflow rows; the three installation steps reflect the actual manager/script/SoundCloud process.
R-11 PASS: existing slight-radius fields and outlined buttons remain; no pill-everywhere restyling was added.
R-15 PASS: actions name their result: Install userscript, Build a set, Add track, Copy settings link, Create public Discord link.
R-16 PASS: changed copy avoids generic marketing superlatives and promises of seamless playback.
R-20 PASS: timeline controls, fractional semitones and track artwork identify this listening tool without relying on its logo.
R-21 PASS: dark appearance is user-selected branding; a working Light option remains available.
R-29 PASS: existing neutral palettes plus the single orange accent are preserved.
R-30 PASS: no outside product template or visual identity was substituted.
R-31 PASS: focused screenshots prove controls, custom fields retain consistency, and visible budgets prevent a long list from hiding the render limits.

## Not established by these checks

A newly rendered set has not been tested inside the live Discord client. Maximum-length rendering on the small Oracle instance has not been benchmarked. The successful local fixture does not prove those two outcomes, or repair a previously reported live Widevine crossfade crash.

Set artwork is encoded at four frames per second to limit server cost. Audio crossfades are linear, not beat matching or loudness normalization. The source and adjusted budgets are 15 and 30 minutes respectively; the adjusted budget is checked before subtracting overlaps. Public copies expire after seven days and require permission to share every track.
