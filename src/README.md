# Source ownership

The build still produces one installable userscript and one soundcloud-rpc plugin. The source modules are grouped by the behavior they own; this is not runtime code splitting.

| Folder        | Owns                                                                            |
| ------------- | ------------------------------------------------------------------------------- |
| `userscript/` | Startup and component wiring for SoundCloud                                     |
| `controls/`   | Desktop controls, touch player, fields and waveform rendering                   |
| `timeline/`   | Profile validation, timeline editing, graph rendering and playback coordination |
| `library/`    | Saved-track library and its interface                                           |
| `sharing/`    | Shared-track/set formats, clipboard behavior and pitch notices                  |
| `appearance/` | Theme preferences, star motion and crossfade artwork geometry                   |
| `soundcloud/` | Media hooks, footer styling, artwork, waveform metadata and host adapters       |
| `audio/`      | Decoding, output, bounded transport and playback clocks                         |

Keep playback rules in the existing audio/profile modules. Touch controls call the same tempo/pitch actions as desktop controls; they do not own another audio engine. The waveform consumes source positions and public amplitude envelopes. It does not decode audio or infer beats.

`scripts/build-userscript.cjs` bundles the browser entry. Website and server consumers import the same profile/sharing modules. Storage keys, profile versions, legacy installation paths and public share formats remain compatibility contracts.

`tests/source-structure.test.mjs` rejects implementation files directly under `src/` and modules over 1,000 physical lines. That ceiling is a backstop, not a reason to move code into arbitrary wrappers: split by state and lifecycle ownership, and update every import when moving a module.
