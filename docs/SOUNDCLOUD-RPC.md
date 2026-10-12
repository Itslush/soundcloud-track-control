# SoundCloud desktop plugin

The adapter uses the plugin loader in [soundcloud-rpc v0.2.0](https://github.com/richardhbtz/soundcloud-rpc/tree/v0.2.0). It contains the same Track Control code as the userscript. It does not modify the app's executable, Discord integration or browser security settings.

## Install

1. [Download the desktop plugin](https://itslush.github.io/soundcloud-track-control/downloads/soundcloud-track-control.rpc.js) and save it as `soundcloud_tempo_control.js`. To build it yourself, run `npm ci` and `npm run build:script`.
2. Open soundcloud-rpc, press F1, and open the Plugins folder from its settings.
3. Copy `dist/soundcloud_tempo_control.js` into that folder. Keep this filename so the wrapper can find the cleanup hook.
4. Refresh the plugin list and enable SoundCloud Track Control. Reload SoundCloud, then start a track after the tempo controls appear.

The Windows plugin folder is usually `%APPDATA%\soundcloud-rpc\plugins`. A browser userscript manager is not needed inside this app.

Keep the wrapper's separate Playback Speed plugin disabled. Both plugins would try to set the same audio element's playback rate.

The adapter does not update itself. Replace its file with the plugin from a newer Track Control build to update it. The browser userscript is a separate file.

## Settings and playback

The desktop app has its own SoundCloud storage. Browser settings do not transfer automatically. Use Track Control's export and import controls to transfer saved tempos and timelines.

Appearance offers SoundCloud's own theme, Light, Charcoal and OLED. The player footer uses the full window width; narrow windows reflow instead of squeezing the title beside every control.

The wrapper injects plugins after the page loads, not at document start. An already-playing stream may not be available to the buffered audio engine. For the first playback check, reload the page and start a track after Track Control appears.

Disabling or refreshing this plugin reloads the SoundCloud page and interrupts playback. A reload removes the audio hooks completely; deleting the injected script element alone would leave them running. Saved tempos and timelines remain in storage.

## Verification

The adapter was tested against the plugin loader extracted from the installed v0.2.0 app. These checks use a separate test profile and do not read your login or settings:

```sh
npm run build:script
node tests/rpc-host-injection.cjs "PATH/TO/soundcloud-rpc/resources/app.asar"
python tests/verify-rpc.py
```

The browser fixture checks tempo, saved state, the pitch field and notice, opening settings, repeated injection, and disabling with a reload. It does not prove live desktop audio, crossfading or Widevine playback. See [the integration QA record](SOUNDCLOUD-RPC-QA.md).
