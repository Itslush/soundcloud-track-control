import { decodeTempoCode, tempoShareLink } from '../../../src/tempo-share.js';
import { validateProfile } from '../../../src/tempo-profile.js';
import {
  adjustedDuration,
  decodeTempoSet,
  encodeTempoSet,
  validateTempoSet,
} from '../../../src/tempo-set.js';
import type { TempoProfile } from '../../../src/tempo-editor';
import type { TempoSet } from '../../../src/tempo-set';
import { syncTempoRange } from '../../../src/tempo-range.js';
import { initNumberFields } from './number-field';
import { initDiscordShare } from './discord-share';

type TrackDetails = { title: string; artist: string; artwork?: string };
type Item = { profile: TempoProfile; details?: TrackDetails };
const root = document.querySelector<HTMLElement>('#set-editor')!;
const input = document.querySelector<HTMLInputElement>('#set-source')!;
const add = document.querySelector<HTMLButtonElement>('#set-add')!;
const list = document.querySelector<HTMLOListElement>('#set-tracks')!;
const template = document.querySelector<HTMLTemplateElement>(
  '#set-track-template',
)!;
const status = document.querySelector<HTMLElement>('#set-status')!;
const validation = document.querySelector<HTMLElement>('#set-validation')!;
const copy = document.querySelector<HTMLButtonElement>('#set-copy')!;
const create = document.querySelector<HTMLButtonElement>('.discord-create')!;
const video = document.querySelector<HTMLVideoElement>('#set-video')!;
const play = document.querySelector<HTMLButtonElement>('#set-play')!;
const seek = document.querySelector<HTMLInputElement>('#set-seek')!;
const volume = document.querySelector<HTMLInputElement>('#set-volume')!;
const position = document.querySelector<HTMLOutputElement>('#set-position')!;
const playStatus = document.querySelector<HTMLElement>('#set-play-status')!;
const controller = new AbortController();
const items: Item[] = [];
const overlaps: number[] = [];
let adding = false;
let lastConfiguration = '';
const parseTrack = (path: string) =>
  /^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(path) ? path : '';
const website =
  root.dataset.website ||
  new URL(import.meta.env.BASE_URL, location.origin).href;
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const profileName = (item: Item) =>
  item.details?.title || item.profile.track.slice(1).replace('/', ' / ');
const currentSet = (): TempoSet =>
  validateTempoSet(
    { v: 1, tracks: items.map((item) => item.profile), overlaps },
    parseTrack,
  );
const sharing = initDiscordShare(
  () => encodeTempoSet(currentSet()),
  (url) => {
    const media = new URL(url);
    media.pathname = media.pathname.replace('/listen/', '/media/') + '.mp4';
    video.src = media.href;
    video.poster = media.href.replace(/\.mp4$/, '.jpg');
    document.querySelector<HTMLElement>('#set-listen')!.hidden = false;
    playStatus.textContent = 'The rendered set is ready. Press Play to listen.';
  },
);

function changed() {
  const configuration = JSON.stringify([
    items.map((item) => item.profile),
    overlaps,
  ]);
  if (configuration !== lastConfiguration) {
    lastConfiguration = configuration;
    sharing?.reset();
    document.querySelector<HTMLElement>('#set-settings-result')!.hidden = true;
    video.pause();
    video.removeAttribute('src');
    video.removeAttribute('poster');
    video.load();
    document.querySelector<HTMLElement>('#set-listen')!.hidden = true;
  }
  items.forEach((item, index) => {
    const row = list.children[index];
    if (!row) return;
    row.querySelector<HTMLElement>('.set-track-duration')!.textContent =
      `${clock(item.profile.duration)} original · ${clock(adjustedDuration(item.profile))} adjusted`;
    const editor = row.querySelector<HTMLAnchorElement>('.set-edit-link')!;
    try {
      editor.href = tempoShareLink(item.profile, website);
      editor.hidden = false;
    } catch {
      editor.removeAttribute('href');
      editor.hidden = true;
    }
  });
  const source = items.reduce(
    (total, item) => total + item.profile.duration,
    0,
  );
  const adjusted = items.reduce(
    (total, item) => total + adjustedDuration(item.profile),
    0,
  );
  document.querySelector<HTMLElement>('#set-budget')!.textContent =
    `${clock(source)} / 15:00 original · ${clock(adjusted)} / 30:00 adjusted`;
  document.querySelector<HTMLElement>('#set-length')!.textContent = items.length
    ? `${items.length} ${items.length === 1 ? 'track' : 'tracks'} · ${clock(Math.max(0, adjusted - overlaps.reduce((a, b) => a + b, 0)))} with crossfades`
    : '';
  document.querySelector<HTMLElement>('#set-empty')!.hidden = items.length > 0;
  add.disabled = adding || items.length >= 10;
  try {
    encodeTempoSet(currentSet());
    validation.textContent = '';
    copy.disabled = false;
    create.disabled = false;
  } catch (error) {
    validation.textContent =
      items.length < 2
        ? 'Add at least two tracks to share a set.'
        : message(error);
    copy.disabled = true;
    create.disabled = true;
  }
}

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'The track could not be added. Check the link and try again.';
}

function append(profile: TempoProfile, details?: TrackDetails) {
  if (items.length >= 10) throw new Error('A set can contain up to 10 tracks.');
  const previous = items.at(-1);
  if (previous)
    overlaps.push(
      Math.min(
        5,
        adjustedDuration(previous.profile) / 2,
        adjustedDuration(profile) / 2,
      ),
    );
  items.push({ profile, ...(details ? { details } : {}) });
}

async function resolve(track: string) {
  const api = new URL(
    `${import.meta.env.PUBLIC_API_BASE || import.meta.env.BASE_URL}api/resolve`,
    location.origin,
  );
  api.searchParams.set('url', 'https://soundcloud.com' + track);
  const response = await fetch(api, {
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
  });
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object')
    throw new Error('Track lookup returned an unreadable response. Try again.');
  if (!response.ok)
    throw new Error(
      'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Track lookup failed. Try again.',
    );
  if (
    !('duration' in data) ||
    typeof data.duration !== 'number' ||
    !Number.isFinite(data.duration) ||
    data.duration <= 0 ||
    data.duration > 900 ||
    !('permalink' in data) ||
    typeof data.permalink !== 'string' ||
    new URL(data.permalink).origin !== 'https://soundcloud.com' ||
    new URL(data.permalink).pathname !== track ||
    !('title' in data) ||
    typeof data.title !== 'string' ||
    !('artist' in data) ||
    typeof data.artist !== 'string'
  )
    throw new Error(
      'This public track could not be identified. Try another link.',
    );
  if ('preview' in data && data.preview === true)
    throw new Error(
      'This track is only available as an excerpt. Choose a full public track.',
    );
  const details: TrackDetails = { title: data.title, artist: data.artist };
  if ('artwork' in data && typeof data.artwork === 'string') {
    try {
      const image = new URL(data.artwork);
      if (
        image.protocol === 'https:' &&
        image.hostname.endsWith('.sndcdn.com') &&
        !image.username &&
        !image.password
      )
        details.artwork = image.href;
    } catch {}
  }
  return { duration: data.duration, details };
}

function render() {
  list.replaceChildren();
  items.forEach((item, index) => {
    const row = template.content.firstElementChild!.cloneNode(true);
    if (!(row instanceof HTMLElement))
      throw new Error('The set controls are unavailable. Reload the page.');
    const get = <T extends Element>(selector: string) =>
      row.querySelector<T>(selector)!;
    const name = profileName(item);
    get<HTMLAnchorElement>('.set-track-link').href =
      'https://soundcloud.com' + item.profile.track;
    get<HTMLElement>('.set-track-link').textContent = `${index + 1}. ${name}`;
    get<HTMLElement>('.set-track-artist').textContent =
      item.details?.artist || '';
    const image = get<HTMLImageElement>('.set-artwork');
    if (item.details?.artwork) {
      image.src = item.details.artwork;
      image.hidden = false;
      image.addEventListener(
        'error',
        () => {
          image.hidden = true;
        },
        { once: true },
      );
    }
    const tempo = get<HTMLInputElement>('#set-track-tempo');
    const pitch = get<HTMLInputElement>('#set-track-pitch');
    const overlap = get<HTMLInputElement>('#set-track-overlap');
    for (const field of [tempo, pitch, overlap]) {
      const oldId = field.id;
      field.id += `-${index}`;
      get<HTMLLabelElement>(`label[for="${oldId}"]`).htmlFor = field.id;
      row
        .querySelectorAll<HTMLButtonElement>(`[aria-controls="${oldId}"]`)
        .forEach((button) => button.setAttribute('aria-controls', field.id));
    }
    tempo.value = String(item.profile.points[0].r);
    pitch.value = String(
      item.profile.pitchPoints?.[0].k ?? item.profile.keyShift ?? 0,
    );
    tempo.readOnly = item.profile.points.length > 1;
    pitch.readOnly = Boolean(item.profile.pitchPoints);
    const fixedTempo = get<HTMLButtonElement>('.set-fixed-tempo');
    const fixedPitch = get<HTMLButtonElement>('.set-fixed-pitch');
    fixedTempo.hidden = !tempo.readOnly;
    fixedPitch.hidden = !pitch.readOnly;
    const automation = get<HTMLElement>('.set-automation');
    automation.hidden = !tempo.readOnly && !pitch.readOnly;
    automation.textContent = [
      tempo.readOnly ? 'Tempo timeline retained.' : '',
      pitch.readOnly ? 'Pitch timeline retained.' : '',
    ]
      .filter(Boolean)
      .join(' ');
    fixedTempo.addEventListener('click', () => {
      item.profile.points = [
        { t: 0, r: tempo.valueAsNumber, d: 0, c: 'instant' },
      ];
      render();
    });
    fixedPitch.addEventListener('click', () => {
      item.profile.keyShift = pitch.valueAsNumber;
      delete item.profile.pitchPoints;
      render();
    });
    tempo.addEventListener('change', () => {
      item.profile.points[0].r = tempo.valueAsNumber;
      changed();
    });
    pitch.addEventListener('change', () => {
      if (pitch.valueAsNumber !== (item.profile.keyShift ?? 0))
        item.profile.keyShift = pitch.valueAsNumber;
      changed();
    });
    get<HTMLElement>('.set-overlap').hidden = index === items.length - 1;
    overlap.value = String(overlaps[index] ?? 5);
    overlap.addEventListener('change', () => {
      overlaps[index] = overlap.valueAsNumber;
      changed();
    });
    row
      .querySelectorAll<HTMLButtonElement>('[data-pitch]')
      .forEach((button) => {
        button.setAttribute(
          'aria-pressed',
          String(button.dataset.pitch === (item.profile.pitch || 'natural')),
        );
        button.addEventListener('click', () => {
          if (button.dataset.pitch !== (item.profile.pitch || 'natural'))
            item.profile.pitch = button.dataset.pitch;
          render();
        });
      });
    row.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => {
      const next = index + Number(button.dataset.move);
      button.disabled = next < 0 || next >= items.length;
      button.setAttribute(
        'aria-label',
        `Move ${name} ${next < index ? 'earlier' : 'later'}`,
      );
      button.addEventListener('click', () => {
        [items[index], items[next]] = [items[next], items[index]];
        render();
        const moved = list.children[next];
        const focus =
          moved.querySelector<HTMLButtonElement>(
            `[data-move="${button.dataset.move}"]:not(:disabled)`,
          ) ||
          moved.querySelector<HTMLButtonElement>('[data-move]:not(:disabled)');
        focus?.focus();
      });
    });
    get<HTMLButtonElement>('.set-remove').setAttribute(
      'aria-label',
      `Remove ${name}`,
    );
    get<HTMLButtonElement>('.set-remove').addEventListener('click', () => {
      items.splice(index, 1);
      if (overlaps.length)
        overlaps.splice(Math.min(index, overlaps.length - 1), 1);
      render();
      input.focus();
    });
    const details = get<HTMLButtonElement>('.set-details');
    details.hidden = Boolean(item.details);
    details.addEventListener('click', async () => {
      details.disabled = true;
      status.textContent = 'Loading the track title and artwork…';
      try {
        item.details = (await resolve(item.profile.track)).details;
        render();
        status.textContent = 'Track details loaded.';
      } catch (error) {
        status.textContent = message(error);
        details.disabled = false;
      }
    });
    list.append(row);
    initNumberFields(row);
  });
  changed();
}

document
  .querySelector<HTMLFormElement>('#set-add-form')!
  .addEventListener('submit', async (event) => {
    event.preventDefault();
    if (adding) return;
    const text = input.value.trim();
    if (!text) {
      status.textContent =
        'Paste a SoundCloud track URL or shared settings link.';
      input.focus();
      return;
    }
    adding = true;
    add.disabled = true;
    status.textContent = 'Adding the track…';
    try {
      const parsed =
        text.startsWith('SCT1.') || text.includes('sct=')
          ? decodeTempoCode(
              text,
              (value) => validateProfile(value, parseTrack),
              parseTrack,
              website,
            )
          : null;
      if (parsed) append(parsed);
      else {
        const url = new URL(text);
        if (
          url.origin !== 'https://soundcloud.com' ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          !parseTrack(url.pathname)
        )
          throw new Error(
            'Paste a direct public SoundCloud track URL, or a shared SCT1 link.',
          );
        const track = await resolve(url.pathname);
        append(
          validateProfile(
            {
              v: 1,
              track: url.pathname,
              duration: track.duration,
              points: [{ t: 0, r: 1, d: 0, c: 'instant' }],
              pitch: 'natural',
              keyShift: 0,
            },
            parseTrack,
          ),
          track.details,
        );
      }
      input.value = '';
      render();
      status.textContent = 'Track added.';
      input.focus();
    } catch (error) {
      status.textContent = message(error);
    } finally {
      adding = false;
      add.disabled = items.length >= 10;
    }
  });

copy.addEventListener('click', async () => {
  try {
    const url = new URL('set/', website);
    url.hash = 'scs=' + encodeTempoSet(currentSet());
    if (url.href.length > 8000)
      throw new Error(
        'This set has too many automation points for a settings link. Create a playable share instead.',
      );
    try {
      await navigator.clipboard.writeText(url.href);
      status.textContent =
        'Settings link copied. Create a playable share to include the audio.';
    } catch {
      const link =
        document.querySelector<HTMLAnchorElement>('#set-settings-link')!;
      link.href = url.href;
      link.textContent = url.href;
      document.querySelector<HTMLElement>('#set-settings-result')!.hidden =
        false;
      status.textContent =
        'Clipboard access is unavailable. Copy the settings link below.';
    }
  } catch (error) {
    status.textContent = message(error);
  }
});

play.addEventListener('click', async () => {
  if (!video.paused) return video.pause();
  try {
    playStatus.textContent = 'Loading the rendered set…';
    await video.play();
    playStatus.textContent = '';
  } catch {
    playStatus.textContent =
      'Playback failed. Try Play again, or open the public link.';
  }
});
video.volume = 0.15;
for (const event of ['play', 'pause', 'ended'])
  video.addEventListener(event, () => {
    play.textContent = video.paused ? 'Play' : 'Pause';
  });
video.addEventListener('timeupdate', () => {
  position.value = `${clock(video.currentTime)} / ${clock(video.duration || 0)}`;
  seek.value = String(video.currentTime);
  syncTempoRange(seek);
});
video.addEventListener('loadedmetadata', () => {
  if (Number.isFinite(video.duration)) seek.max = String(video.duration);
});
video.addEventListener('error', () => {
  playStatus.textContent =
    'The audio copy is unavailable or expired. Create a new playable share.';
});
seek.addEventListener('input', () => {
  if (Number.isFinite(video.duration)) video.currentTime = seek.valueAsNumber;
  syncTempoRange(seek);
});
volume.addEventListener('input', () => {
  video.volume = volume.valueAsNumber;
  syncTempoRange(volume);
});
syncTempoRange(seek);
syncTempoRange(volume);
window.addEventListener(
  'pagehide',
  () => {
    controller.abort();
    video.pause();
  },
  { once: true },
);
window.addEventListener('hashchange', () => location.reload());
try {
  if (location.hash.startsWith('#scs=')) {
    const data = decodeTempoSet(location.hash.slice(5), parseTrack);
    items.push(...data.tracks.map((profile) => ({ profile })));
    overlaps.push(...data.overlaps);
  } else if (location.hash.startsWith('#sct='))
    append(
      decodeTempoCode(
        location.hash.slice(5),
        (value) => validateProfile(value, parseTrack),
        parseTrack,
        website,
      ),
    );
  else if (location.hash)
    throw new Error(
      'The set settings in this link are invalid. Ask for a new copy.',
    );
  render();
  const sharedId = new URL(location.href).searchParams.get('render');
  if (sharedId) {
    const sharedCode = encodeTempoSet(currentSet());
    void crypto.subtle
      .digest(
        'SHA-256',
        new TextEncoder().encode('discord-render-v1:' + sharedCode),
      )
      .then(async (digest) => {
        const expected = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, '0'),
        )
          .join('')
          .slice(0, 32);
        if (sharedId !== expected)
          throw new Error(
            'The rendered copy does not match this set. Ask for a new link.',
          );
        if (encodeTempoSet(currentSet()) !== sharedCode) return;
        await sharing?.readReady(sharedId);
      })
      .catch((error: unknown) => {
        status.textContent = message(error);
      });
  }
} catch (error) {
  status.textContent = message(error);
  changed();
}
