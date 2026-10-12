# Track Control 1.2.2 QA

Scope: desktop plugin download, Light appearance, full-window SoundCloud footer, and the project URL/name migration. Internal storage keys, SCT1/SCS1 formats, userscript namespace, desktop plugin ID and backend API paths remain unchanged.

## Checks

- `npm test`: 583 passed, zero failed or skipped, with FFmpeg configured. Typecheck and release build passed.
- The actual installed soundcloud-rpc 0.2.0 metadata parser and PluginService loaded the generated adapter in a separate fixture profile. Its exact injection and cleanup code passed the browser fixture: tempo, save, fractional pitch/notice, settings, duplicate injection and disable/reload.
- The user confirmed that the installed desktop app works. Automated fixture checks do not establish live crossfade, protected-stream or Widevine reliability.
- Appearance tests exercised four choices, reload, cross-tab updates, same-origin embedded pages, theme restoration and forced colors. Light settings text passes 4.5:1 contrast.
- Footer checks retain a long native title and use the complete window width in Light, Charcoal and OLED at 320, 390, 768, 1050, 1440 and 1920 px. No player overflow in those eighteen combinations. The existing inline test also passed keyboard/media/storage behavior, control alignment and contrast.
- Website checks passed four content routes at five widths, navigation, asset loading, donations, keyboard controls, clipboard failure and no-JavaScript downloads. Browser aliases contain identical script bytes; the desktop download contains the same canonical code.
- Compatibility tests preserve the full query and shared-settings fragment across old root, guide, share and set URLs. Old download aliases serve JavaScript, not an HTML redirect.
- Reproduced the GitHub transfer failure locally: the all-variant gallery exceeded an obsolete 384 KiB limit. The measurement now separates initial resources from the complete 102-image gallery. Startup remains capped at 192 KiB and 32 resources; the complete gallery is capped at 4 MiB and 128 resources. Both Brotli and gzip checks pass, including ETag/304 validation. Brotli startup is 149,198 body bytes across eleven resources; all variants total 3,263,667 bytes across 113 resources. This is a conservative local-server measurement, not a live browser transfer trace.
- Regenerated 102 focused screenshots from the current script and built website, including the plugin's actual Light theme. Each PNG retains origin/provenance metadata and its checksum in `feature-capture-evidence.json`. Public track metadata was used; no audio copy was published for these captures.

The footer cannot manufacture metadata that SoundCloud has not loaded. This change removes width constraints and retains the native title/link rather than replacing it with a guessed name. Long titles still ellipsize when the window genuinely lacks space.

## Structure and compatibility

Light extends the existing token-based appearance module. Both desktop and browser builds use the same footer, settings and audio source. The desktop adapter adds no Node bridge, executable patch or browser security change. Its stable filename is necessary for the wrapper's cleanup hook. Disabling or refreshing it reloads SoundCloud and interrupts playback.

The compatibility repository contains static redirects and a migration script build. After an existing installation upgrades, its metadata points to the new website for later updates. Reusing the old GitHub repository name replaces GitHub's automatic repository redirect; its README links to the new main repository. Old website links and install/update URLs are preserved.

## Main-agent Anti Slop gate

Mode: DURING, explicitly chosen by the user. Direction: preserve the charcoal/orange listener controls and website. ENERGY 1 / RHYTHM 2 / MOTION 2. This is an extension, not a replacement design. The combined quality skill kept theme/footer behavior canonical and required executable checks instead of treating skill installation as QA.

### Hard gate

- R-02 PASS: new visible wording has no em dashes.
- R-03 PASS: footer eighteen-combination and website five-width checks found no horizontal overflow; intermediate windows reflow.
- R-17 PASS: versions, counts and checksums come from test output and built artifacts, not promotional statistics.
- R-18 PASS: no testimonials introduced.
- R-23 PASS: the user requested themed product screenshots; only the actual rendered interfaces were captured, with provenance.
- R-24 PASS: route/link checks passed; desktop download and setup links target generated files and the existing guide.
- R-25 PASS: Light settings and existing inline control contrast checked against 4.5:1; semantic tokens keep dark text on light surfaces.
- R-26 PASS: new appearance radio persists/restores selection; desktop download is a generated plugin; compatibility redirects preserve settings.
- R-27 PASS: existing saved-library empty state and player loading/retry states retained; the capture run exercised loading before playback.
- R-28 PASS: no FAQ added.
- R-32 PASS: semantic appearance radios, authored focus styles and keyboard inline/website tests retained.
- R-33 PASS: feature logic lives in source; only display-name replacements were a bulk mechanical rewrite. No runtime stylesheet patcher added.
- R-34 PASS: custom Light, Charcoal and OLED plus native restoration exercised across host themes and forced colors.
- R-35 PASS: built and ran shipped controls, actual installed loader and browser fixtures. Live desktop basics are user-confirmed; advanced audio limits remain explicit.
- R-36 PASS: no unsupported reliability, security or quality claims added.
- R-37 PASS: incumbent DESIGN.md and scoped direction preserved.
- R-38 PASS: native track metadata retained; fixture titles identified as tests; screenshots use real public track metadata.

### Purpose gate

- R-01 PASS: no decorative gradient/glow added; existing artwork blend conveys overlapping tracks.
- R-04 PASS: reused download icon denotes a file download; user-requested stars remain a background motif, not feature icons.
- R-06 PASS: existing Mulish website type and inherited SoundCloud player type retained.
- R-07 PASS: no background grid added; existing graph grids measure automation.
- R-08 PASS: setup-path arrows describe navigation; no new decorative button arrows.
- R-09 PASS: no capsule/eyebrow badge added.
- R-10 PASS: no glass or backdrop blur added.
- R-12 PASS: no new shadows added.
- R-13 PASS: no glow added.
- R-14 PASS: download information extends the existing installation section rather than adding template feature cards.
- R-19 PASS: existing interruptible star motion and reduced-motion/forced-color behavior retained; no new animation introduced.
- R-22 PASS: no stock illustration introduced.

### Liveliness

- Dials PASS: ENERGY 1 / RHYTHM 2 / MOTION 2 explicitly retained.
- Consistency PASS: flat controls, sparse motion and existing section rhythm preserved.
- Focus PASS: transport/adjustment remains the footer's task; installation remains the landing action.
- Whitespace PASS: full window space goes to timeline/title, while the desktop download has a separate ruled section.
- Accent PASS: orange marks playback/adjustment and installation actions; Light uses a darker orange for contrast.
- Motif PASS: existing waveform/slider icon, numeric controls and requested stars preserved.
- Design read PASS: this is the existing listener-facing Operate/Persuade design, not a new visual world.

### Craftsmanship and quality locks

- C-1 PASS: Light follows the user request; footer changes allocate real available space; downloads identify distinct hosts.
- C-2 PASS: actionable controls and download destinations exercised.
- C-3 PASS: desktop installation addresses the wrapper the user uses; no filler section added.
- C-4 PASS: keyboard, intermediate/narrow widths, themes, restore and forced colors exercised.
- C-5 PASS: evidence and limitations recorded rather than invented.
- R-05 PASS: preserved existing content-led layout; no new template structure.
- R-11 PASS: existing restrained corners retained.
- R-15 PASS: actions name the actual userscript/desktop download and setup destination.
- R-16 PASS: no marketing buzzwords added.
- R-20 PASS: SoundCloud listening controls and waveform identity retained.
- R-21 PASS: native default remains unchanged; requested Light option works explicitly.
- R-29 PASS: neutral surfaces with one orange accent.
- R-30 PASS: existing integration visual language preserved; no unrelated product clone.
- R-31 PASS: width serves title readability, token colors serve theme contrast, stable IDs preserve installed data and updates.

No new live Widevine or Discord-client playback test ran. The native app archive remains unmodified. Existing legacy DESIGN.md format and absent Impeccable sidecar are retained documentation drift, not silently repaired.
