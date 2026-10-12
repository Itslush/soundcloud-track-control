# Shared sets

Sets use `SCS1.` codes, separate from single-track `SCT1.` codes. The canonical payload is:

```json
{
  "v": 1,
  "tracks": ["TempoProfile objects, in playback order"],
  "overlaps": [5]
}
```

Each track keeps its tempo points, pitch mode, fractional semitone shift and pitch automation. `src/sharing/tempo-set.js` validates, encodes and decodes this payload. `tempoSetLink` opens `/set/#scs=...`. Track titles and creators come from the resolved public SoundCloud tracks, not from link-provided labels.

The existing render endpoint accepts `{code: "SCS1...", publish: true}`. Publishing remains an explicit action. Ready jobs use the same `/listen/<id>` and `/media/<id>.mp4` routes, storage quota and seven-day expiry as single tracks. Existing SCT1 codes and cache identifiers do not change.

## Limits

- 2 to 10 tracks.
- Up to 900 seconds of original audio in total.
- Up to 1800 seconds of adjusted audio in total, before subtracting overlaps.
- Each join uses 0 to 10 seconds of overlap. Zero joins without a fade.
- Incoming and outgoing overlaps together must fit inside the middle track. Three simultaneous tracks are not supported.
- Codes are at most 16000 characters; website links are at most 8000 characters.
- Published MP4 files are at most 48 MiB. The existing single-worker and 15-minute job deadline remain in force.

The codec estimates adjusted duration by integrating the reciprocal tempo curve. The worker checks the actual decoded source duration and adjusted PCM duration as well. A fade cannot bypass either duration budget. Restricted previews, private audio, DRM, unsupported hosts and mismatched timelines fail through the existing resolver and download checks.

## Rendering

Each track passes through the existing Signalsmith PCM renderer. Source files are processed one at a time and removed after adjustment. Adjusted files stay on disk, never as whole-track buffers. `stitchPcm` copies 4096 stereo frames at a time and linearly mixes each join. The two gains sum to one to avoid extra peak gain for correlated tracks. This is not loudness normalization or beat matching.

The video uses the same actual PCM join times. Covers crossfade evenly at four frames per second. During the overlap, both title/creator rows remain readable rather than blending letters together. Outside the overlap, the current track and its adjustments appear below the cover. The four-frame rate keeps the render cost down on the existing small server; it is not 60 fps animation.

FFmpeg must support `drawtext`, `libx264` and AAC. Oracle's installed font is `/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf`. `SHARE_FONT_PATH` can point to another installed font on other deployments. Windows defaults to Arial.

## Verification

`node --test tests/tempo-set.test.mjs tests/discord-render.test.mjs` checks codec boundaries, automation duration, PCM overlap samples, zero-length joins, artwork timing and unchanged single-track behavior. Set `FFMPEG_PATH` to the installed binary to run the real video test. Without FFmpeg, that test reports a skip.

The video test downloads only local mocked fixtures. It exercises the real WASM processor and FFmpeg encoder, decodes the resulting AAC/H264 MP4, checks the halfway cover blend and verifies `moov` precedes `mdat`. Its PNGs under `test-results/set-render-fixture-*.png` are test evidence, not public product screenshots. It does not establish live Discord playback or production server performance.
