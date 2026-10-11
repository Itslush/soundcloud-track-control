import { validateProfile, evaluatePoints, round } from './tempo-profile.js';
import { encodeTempoCode, decodeTempoCode } from './tempo-share.js';

export function adjustedDuration(profile) {
  let seconds = 0;
  let previous = profile.points[0];
  for (const point of profile.points.slice(1)) {
    const start = point.c === 'instant' ? point.t : point.t - point.d;
    seconds += (start - previous.t) / previous.r;
    if (point.t > start) {
      const steps = Math.max(2, Math.ceil(((point.t - start) * 50) / 2) * 2);
      const width = (point.t - start) / steps;
      let sum = 1 / previous.r + 1 / point.r;
      for (let i = 1; i < steps; i++)
        sum +=
          (i % 2 ? 4 : 2) / evaluatePoints(profile.points, start + i * width);
      seconds += (sum * width) / 3;
    }
    previous = point;
  }
  return seconds + (profile.duration - previous.t) / previous.r;
}

export function validateTempoSet(value, parseTrack) {
  if (
    !value ||
    value.v !== 1 ||
    !Array.isArray(value.tracks) ||
    value.tracks.length < 2 ||
    value.tracks.length > 10 ||
    !Array.isArray(value.overlaps) ||
    value.overlaps.length !== value.tracks.length - 1
  )
    throw new Error('Use 2 to 10 tracks and one crossfade duration per join.');
  const tracks = value.tracks.map((track) =>
    validateProfile(track, parseTrack),
  );
  if (tracks.reduce((total, track) => total + track.duration, 0) > 900)
    throw new Error(
      'A set can contain up to 15 minutes of original audio in total.',
    );
  const durations = tracks.map(adjustedDuration);
  const overlaps = value.overlaps.map((seconds, index) => {
    if (
      !Number.isFinite(seconds) ||
      seconds < 0 ||
      seconds > 10 ||
      seconds > Math.min(durations[index], durations[index + 1])
    )
      throw new Error(
        'Crossfades must be 0 to 10 seconds and fit both tracks.',
      );
    return round(seconds);
  });
  for (let i = 0; i < tracks.length; i++)
    if ((overlaps[i - 1] || 0) + (overlaps[i] || 0) > durations[i])
      throw new Error(
        'The incoming and outgoing crossfades must fit inside each track.',
      );
  if (durations.reduce((a, b) => a + b, 0) > 1800)
    throw new Error('The adjusted set exceeds the 30-minute render limit.');
  return { v: 1, tracks, overlaps };
}

export function encodeTempoSet(value) {
  const code = encodeTempoCode(value).replace(/^SCT1\./, 'SCS1.');
  if (code.length > 16000)
    throw new Error('This set has too many timeline points to share.');
  return code;
}

export function decodeTempoSet(code, parseTrack) {
  if (
    typeof code !== 'string' ||
    !/^SCS1\.[A-Za-z0-9_-]+$/.test(code) ||
    code.length > 16000
  )
    throw new Error('Paste a valid SCS1 set code.');
  return decodeTempoCode(
    code.replace(/^SCS1\./, 'SCT1.'),
    (value) => validateTempoSet(value, parseTrack),
    parseTrack,
  );
}

export function tempoSetLink(value, website) {
  const url = new URL('set/', website.endsWith('/') ? website : website + '/');
  url.hash = 'scs=' + encodeTempoSet(value);
  if (url.href.length > 8000)
    throw new Error('Too large for a link. Use Copy code instead.');
  return url.href;
}
