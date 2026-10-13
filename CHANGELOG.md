# Changelog

## 1.2.7.2

- Reduced playback work while tempo and pitch adjustments are active, without lowering audio-quality settings. Testing on Firefox Android is still needed.
- Kept the stars moving while reducing background repainting.
- Removed unnecessary phone-player refreshes during playback.

## 1.2.7.1

- Removed the optional waveform view. Tempo and pitch timelines are still available.
- Fixed missing track thumbnails in the phone player, including artwork that loads after the controls appear.

## 1.2.7

- Larger footer links, account icons and secondary controls on phones, including Firefox's desktop-site view.
- Update notices have their own space above the phone player, with reachable links and a Dismiss button.

## 1.2.6

- The phone player stays above SoundCloud's footer, with Settings available without expanding Controls.
- Mobile library cards have room for their titles, and Discover's sidebar sits below the main content.
- The website's timeline scroll slider has its visible track back in every theme.

## 1.2.5

- Phone-layout candidate for Firefox Android in desktop-site mode. The library uses larger tiles and readable titles, navigation and search fit the phone, and playback controls stay within reach. Testing on a physical phone is still pending.
- Shorter feature descriptions on the download page. Detailed ranges and limits remain under More details.
- The waveform stays optional. Loading and error messages remain, without an explanation repeated during normal playback.

## 1.2.4

- Android touch controls stay readable when the browser uses SoundCloud's desktop site. Open Controls for tempo, semitones, volume, saved tempo and settings. This requires a userscript-capable browser, not the native SoundCloud app.
- Open Waveform for a scrolling view with a fixed playhead, exact seeking and an incoming-track lane during supported crossfades. It uses SoundCloud's amplitude envelope, not an analyzed beat grid.
- Crossfade artwork has a wider feather and eased start and finish. Desktop and touch players interpolate the existing progress updates; reduced motion uses opacity. Newly rendered set videos use the same easing curve at their existing frame rate.
- Saved-speed artwork updates touch the affected covers instead of rescanning every cover after each ordinary tempo adjustment.
- The source is grouped by feature, and website deployment now waits for a successful test run of the same commit.

## 1.2.1

- Crossfades keep the current artwork on the left and blend in the next artwork from the right, following the audio overlap. Reduced-motion users get a simple opacity blend in the plugin.
- The plugin and shared players show a pitch-change notice for nonzero semitone adjustments. Timeline changes update the live notice; rendered videos show the configured pitch range.
- Website link previews include the existing orange Tempo Control icon.

## 1.2.0

- Build a shared set from 2 to 10 public tracks, with separate tempo, pitch and crossfade settings. Existing shared links retain both automation lanes.
- Render the set as one playable Discord video. Artwork fades with the audio, and track titles and creators stay visible during each overlap.
- Duration limits apply to the whole set: 15 minutes of original audio and 30 minutes after adjustment. Public copies expire after seven days.
- Shared-track playback shows artwork after loading. Discord preview titles include tempo and semitone adjustments.
- The landing page shows current controls with focused screenshots that follow the selected website theme. Technical details have a visible summary and expandable controls.

## 1.1.0

### Playback and controls

- Adjust speed from 0.25× to 4×. The horizontal slider stops at 2×; the number field, dial and vertical slider reach 4×.
- Choose a control style on first install or in Appearance. Set the default tempo increment and show or hide semitone adjustment.
- Shift pitch by semitones, with your own range and increment. Preserve key separates pitch from speed when audio processing is available.
- Save speeds for individual tracks. The bookmark and artwork show which tracks have saved settings.
- Draw tempo and pitch changes on a timeline, with gradual fades or instant changes. Preview once or save for later.
- Share settings in a link. The preview lets you apply them once or save them without replacing anything automatically.
- Search saved tracks, undo removals and export a backup for another browser.
- Choose SoundCloud, Charcoal or OLED styling. Toggle star motion or change its speed.
- Set output gain in decibels. Optional crossfade preloads the next track when its stream is available; unsupported streams play normally.

### Website

- Preview a track with fixed speed or a timeline. Compare with the original, edit points and undo changes.
- The default demo is Drown (Sewerslvt Remix). It loads after you press Play.
- Setup, sharing and troubleshooting instructions are in the guide.
- Optional crypto donations list the address and network for each currency.

### Development details

- Audio processing uses bundled Signalsmith and Mediabunny libraries. Browser pitch correction remains available as a fallback.
- Audio processing handles pauses, seeks and track changes without recreating a worklet for every action.
- Copied-link settings and artwork indicators also work in supported embedded SoundCloud track views.
- The website's optional track resolver uses pinned yt-dlp with request caching, job limits and cancellation.
- Shared previews include track metadata. Stream requests can retry, and the server returns HTML error pages and compressed static files.
- Userscript updates show a dismissible notice when the installed version changes.

See docs/TESTING.md for coverage and remaining checks.
