# Artwork and pitch-notice QA, 1.2.1

Scope: crossfade artwork, explicit pitch notices, website preview icon and related landing copy. This is not a new whole-repository audit or proof that a live SoundCloud decoder crash is fixed. Anti Slop was applied during the work, with Ponytail full, pstack behavior checks and the strict maintainability review. The main agent performed the delivery gate below.

## Evidence

- `npm test`: 579 tests passed, none skipped.
- `npm run typecheck` and the release build passed.
- Thirty focused crossfade, set, pitch-notice and Discord-render tests passed with an 80 MiB Node heap. The real WASM/FFmpeg test checks red artwork on the left, blue on the right, readable credits, pitch-notice text, AAC/H264 decoding and fast-start metadata.
- `verify-track-visuals.py`: nine footer combinations, at 390/768/1440 px in Light/Charcoal/OLED. Fractional and zero pitch notices, contrast, footer bounds, directional cover pixels, reduced motion and cancellation passed.
- `verify-shared-player.py`: audible pitch measurement, timeline updates, original comparison, unchanged storage and error states passed. The notice passed contrast and overflow checks in twelve width/theme combinations, including 320 px.
- `verify-site.py`: four content routes at five widths, exact download, PNG icon dimensions/type, absolute image metadata, navigation and existing controls passed. The new title wrapper initially caused 320 px overflow; its flex minimum and title display were corrected before the passing run.
- `verify-crossfade.py`: existing muted browser audio fixtures still overlap both tracks without an audio gap in the tested cases. This does not test a protected live SoundCloud stream.
- The scoped Impeccable detector returned no findings. Updated feature assets contain 102 actual browser captures of the current artifact, with source hashes and origin metadata. Eleven earlier showcase images retain their historical capture record, not a false current hash.
- A fresh finish reviewer returned `ship` for this scoped extension after inspecting all changed-surface captures, encoded frames, icon and connected source, and independently rerunning fifteen pitch/crossfade tests. That verdict does not certify live SoundCloud or Discord playback.
- The fresh documenter verified all 102 current PNG hashes and embedded origins against the built artifact, all eleven historical image records, and the icon source/built copies. The incumbent design documents were preserved; their pre-existing format/description drift was recorded separately.
- The four-file renderer update was deployed only while idle, with rollback copies retained. Both existing backend services remain active; a previously saved public share remains ready and its MP4 still returns HTTP 200.

## Hard gate

R-02 PASS: new listener-facing copy has no em dash; the notice uses a minus sign for negative pitch.
R-03 PASS: all tested website widths have no overflow; the new footer notice fits inside the footer at all nine tested combinations.
R-17 PASS: no popularity or performance numbers were added; existing duration limits are unchanged.
R-18 PASS: no testimonials or invented people were added.
R-23 PASS: the user requested artwork and icon; the PNG is the existing SVG rasterized unchanged, and colored audio-test covers remain labelled fixture evidence.
R-24 PASS: website local links were requested and returned successful responses.
R-25 PASS: new notices pass 4.5:1 browser contrast assertions in all three themes.
R-26 PASS: no inert controls were added; existing controls retain their tested handlers.
R-27 PASS: zero shift hides the notice; original comparison removes it; missing covers keep native artwork; cancellation removes overlays; existing loading/error paths were exercised.
R-28 PASS: no FAQ content was added.
R-32 PASS: notices do not steal focus; direct number entry and keyboard/browser controls were exercised, with no new interaction required.
R-33 PASS: source and CSS edits used apply_patch; scripts only capture and attach provenance to evidence assets.
R-34 PASS: Light, Charcoal and OLED notices and footer bounds were tested.
R-35 PASS: the actual release was built and the affected flows run in muted browsers and real local encoders.
R-36 PASS: no decoder-safety, live Discord or maximum-length rendering claims were invented.
R-37 PASS: the user confirmed both surfaces; the artwork direction and quality bar were declared before implementation.
R-38 PASS: production screenshots use real public track metadata; synthetic covers/audio are test fixtures, not landing artwork.

## Purpose gate

R-01 PASS: the only added gradient is an opacity mask that shows the two tracks' overlap, not a decorative surface gradient.
R-04 PASS: the existing product icon identifies the linked plugin; no new decorative icon set was added.
R-06 PASS: incumbent Mulish and SoundCloud fonts remain; tabular numerals make changing pitch values readable.
R-07 PASS: no background pattern was added.
R-08 PASS: no decorative button arrows were added.
R-09 PASS: the notice is plain track text, not a promotional badge.
R-10 PASS: no glass surface was added.
R-12 PASS: no shadows were added.
R-13 PASS: no glow effects were added.
R-14 PASS: existing feature proportions remain; no uniform card layout was introduced.
R-19 PASS: the cover mask follows the audio overlap clock; reduced motion changes it to opacity. No template entrance sequence was added.
R-22 PASS: the icon is the incumbent identity and screenshots are real controls, not generic illustration.

## Liveliness

Dials PASS: ENERGY 1 / RHYTHM 2 / MOTION 2 remain explicit in the scoped direction contract.
Consistency PASS: a single bounded artwork transition serves the existing compact player.
Focal point PASS: the playing track, not the new notice, remains primary.
Whitespace PASS: notice text uses existing metadata space without moving player controls.
Accent PASS: incumbent orange remains the control accent; no new accent colors ship.
Motif PASS: the same two-cover seam is used in live and rendered set artwork.
Design read PASS: this was declared as an incumbent refinement, with no identity replacement.

## Craftsmanship and quality locks

C-1 PASS: each added element maps directly to the confirmed request.
C-2 PASS: notices are informational, and existing interactive paths remain functional.
C-3 PASS: no empty or filler section was added.
C-4 PASS: changed notice and artwork states passed the tested width/theme/reduced-motion combinations.
C-5 PASS: evidence distinguishes fixtures, real public metadata and untested live playback.
R-05 PASS: the landing retains its established workflow rows, not a new template.
R-11 PASS: no radius or pill treatment was changed.
R-15 PASS: no generic CTA was added.
R-16 PASS: copy describes the visible cover blend and pitch adjustment without a seamless-playback claim.
R-20 PASS: the visible semitone value and track-to-track artwork tie the change to this listening tool.
R-21 PASS: Light, Charcoal and OLED remain available and tested.
R-29 PASS: the existing neutral/orange palette remains unchanged; red/blue covers exist only in tests.
R-30 PASS: no outside product template was introduced.
R-31 PASS: the cover mask explains overlap; the notice identifies explicit pitch modification; the preview icon identifies the linked plugin.

## Limits and retained behavior

No live Discord-client playback or SoundCloud crossfade was performed for this update. Previously rendered public videos are immutable cached media and retain their old visuals; new renders use the new effect. Discord may retain an earlier website preview. Rendered artwork remains four frames per second to bound server cost. Live notices show current explicit semitone adjustment; encoded notices show the configured range, not an instantaneous automation value.

The audio scheduling, PCM processing, share-code schema, stored preferences and TCD backend were not changed. The large incumbent inline source gained integration and CSS only; artwork lifecycle is isolated in a small module, and pitch wording is shared by all three consumers. Artwork callback failures cannot interrupt audio, covered by a regression test. No dependency was added.
