# Desktop integration QA

Historical record for the initial 1.2.1 adapter. The user subsequently confirmed that the installed app works. See [the 1.2.2 checks](TRACK-CONTROL-1.2.2-QA.md) for the new download, Light appearance, full-width footer and rename.

Scope: soundcloud-rpc v0.2.0 adapter, build output and installation instructions. No player layout, website design, audio algorithm or shared-link format changed.

## Evidence

- The installed app archive stayed unchanged, SHA-256 `062628732432b7f384e29abfff34580ee7875d96e692a7eddd4a4e3b6f81c029`.
- The adapter embeds the current v1.2.1 userscript. Its SHA-256 stayed `8073ba0987218141bf501e1438c479fb8d24e086b42ab1118515edb4ac86e43b`.
- `npm test`: 581 tests passed, none failed or skipped, with FFmpeg configured. `npm run typecheck` and `npm run release` passed.
- `tests/rpc-host-injection.cjs` ran the installed app's compiled metadata parser and PluginService with a separate fixture profile. It discovered, activated and deactivated the generated plugin.
- `tests/verify-rpc.py` ran that loader's exact injection and cleanup code in Chrome against the existing player fixture. Entering 0.75 changed the media element's rate; saving persisted it; entering -0.5 persisted pitch and displayed its notice. Settings opened and closed. Repeated injection kept one control group. Disable reloaded the page, removed the hooks, and reinjection restored the saved tempo. No page errors occurred.
- Origin, insecure HTTP, subframe and duplicate guards passed unit tests. The adapter neither exposes Node APIs to the page nor fetches executable updates.
- The installed plugin matched the generated file. Enabling it preserved every prior app setting. The app files were copied to B:, all 85 original files matched SHA-256 checks, and both shortcuts were updated. The original install path is a junction to B: for existing launch and uninstall paths.

Live desktop audio, Discord presence, crossfading, protected streams and future app versions remain unverified. The app process started from B:, but automated live inspection was blocked and no user playback confirmation was available at this check. This record is not a claim that all desktop playback works.

## Quality review

The adapter is one 26-line build helper. It reuses the canonical userscript, the wrapper's plugin API and the existing page guard. It adds no runtime dependency, app patch or new audio state. The build emits both browser and desktop files together. Existing saved and shared formats remain unchanged.

The behavior that protects other users is verified: the browser userscript stays byte-identical and the desktop adapter executes only in top-level HTTPS SoundCloud pages. Disabling removes hooks by reloading rather than leaving partial audio state.

## Anti Slop delivery gate

This is an integration and documentation change, not a new design. All visual gates below are outside the changed scope; the existing authored controls are reused without edits.

- R-02 PASS: new instructions and metadata contain no em dashes.
- R-03 PASS: no responsive layout changed.
- R-17 PASS: version, file count and test count come from the recorded app and test outputs.
- R-18 PASS: no testimonials added.
- R-23 PASS: no visual assets or navigation structure invented.
- R-24 PASS: the added README links target the upstream repository and saved instructions.
- R-25 PASS: no text color changed.
- R-26 PASS: no new interface controls added; fixture exercised the reused tempo, pitch, memory and settings controls.
- R-27 PASS: no loading, empty or error presentation changed.
- R-28 PASS: no FAQ added.
- R-32 PASS: no keyboard behavior changed; fixture entered tempo and pitch by keyboard.
- R-33 PASS: no source or CSS rewritten by a patch script; the adapter uses the wrapper's existing contentScript API.
- R-34 PASS: no theme styles changed.
- R-35 PASS: built and ran the shipped adapter through the installed loader and browser fixture; live desktop limitations are stated above.
- R-36 PASS: no performance, security or playback claim exceeds the evidence above.
- R-37 PASS: no new visual design or direction introduced.
- R-38 PASS: the feature description names existing Track Control functions; no fabricated product content added.
- R-01 PASS: no gradients or glows added.
- R-04 PASS: no icons added.
- R-06 PASS: no typography changed.
- R-07 PASS: no background pattern added.
- R-08 PASS: no decorative arrows added.
- R-09 PASS: no badges added.
- R-10 PASS: no glass effects added.
- R-12 PASS: no shadows added.
- R-13 PASS: no glow styling added.
- R-14 PASS: no cards added.
- R-19 PASS: no animations added.
- R-22 PASS: no illustrations added.
- Liveliness PASS: dials, focal points, spacing, accent, identity motif and Design Read do not apply to this nonvisual adapter; the existing interface remains intact.
- C-1 PASS: metadata identifies the installed plugin; instructions explain its actual installation path and limitations.
- C-2 PASS: no new inert interface elements.
- C-3 PASS: instructions cover installation, stored settings, lifecycle and verification only.
- C-4 PASS: no layout or state styling changed; loader guards and disable/reload behavior passed.
- C-5 PASS: numbers and compatibility limits match recorded evidence.
- R-05 PASS: no page layout added.
- R-11 PASS: no corner styling changed.
- R-15 PASS: instructions use specific actions: copy, refresh, enable and reload.
- R-16 PASS: no marketing buzzwords added.
- R-20 PASS: the adapter reuses Track Control's interface.
- R-21 PASS: no theme default changed.
- R-29 PASS: no palette changed.
- R-30 PASS: no new visual design or product clone created.
- R-31 PASS: no visual decisions added; canonical controls prevent browser and desktop variants from diverging.

Copywriting check: instructions use direct actions, name the actual files, separate fixture checks from live playback, and contain no invented claims, decorative punctuation or marketing framing. The only new executable-code comment explains why cleanup reloads the document.
