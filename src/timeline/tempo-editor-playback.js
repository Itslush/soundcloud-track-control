import {
  encodeTempoCode,
  decodeTempoCode,
  tempoShareLink,
} from '../sharing/tempo-share.js';
import {
  validateProfile,
  evaluatePoints,
  profilePitchAt,
  validKeyShift,
} from './tempo-profile.js';

export function createTempoEditorPlayback(api, view) {
  const website =
    api.website ??
    (typeof __TEMPO_WEBSITE__ === 'string' ? __TEMPO_WEBSITE__ : '');
  const PREFIX = 'soundcloud.tempo.timeline.';
  let active = null;
  let key = '';
  let profile = null;
  let scheduleData = null;
  let scheduleOverride = null;
  let schedule = null;
  let suspended = false;
  let keyOverride = null;
  let lastPitch = null;
  let timer = 0;
  function running() {
    return Boolean(profile?.enabled && !suspended);
  }

  function pitchMode() {
    return running() ? (profile.data.pitch ?? null) : null;
  }

  const encodeProfile = (value) => encodeTempoCode(validate(value));
  const decodeProfile = (text) =>
    decodeTempoCode(text, validate, api.parseTrack, website);
  const storageKey = (track) => PREFIX + encodeURIComponent(track);
  const validate = (value) => validateProfile(value, api.parseTrack);
  function displayedDuration() {
    const element = document.querySelector('.playbackTimeline__duration');
    const clock = element?.querySelector('span[aria-hidden="true"]') || element;
    const text = clock?.textContent.trim() || '';
    if (
      text.length > 32 ||
      !/^(?:\d+:[0-5]\d|\d+):[0-5]\d(?:\.\d+)?$/.test(text)
    )
      return 0;
    const duration = text
      .split(':')
      .reduce((total, part) => total * 60 + Number(part), 0);
    return duration >= 1 && duration <= 86400 ? duration : 0;
  }

  function playbackDuration() {
    const duration = active?.duration;
    return Number.isFinite(duration) && duration > 0
      ? duration
      : displayedDuration();
  }

  function shareLink(text, force = false) {
    if (
      (!api.copyLinks && !force) ||
      typeof text !== 'string' ||
      text.length > 8000
    )
      return text;
    try {
      const url = new URL(text);
      if (
        url.origin !== 'https://soundcloud.com' ||
        url.username ||
        url.password ||
        url.hash ||
        url.searchParams.has('sct') ||
        api.parseTrack(url.pathname) !== key ||
        !key
      )
        return text;
      const duration = playbackDuration();
      const data =
        profile?.enabled && !suspended
          ? profile.data
          : {
              v: 1,
              track: key,
              duration,
              points: [{ t: 0, r: api.rate, d: 0, c: 'instant' }],
            };
      url.searchParams.set(
        'sct',
        encodeProfile({
          ...data,
          pitch: api.pitchMode,
          keyShift: keyOverride ?? data.keyShift ?? api.keyShift ?? 0,
          ...(keyOverride === null ? {} : { pitchPoints: undefined }),
        }),
      );
      if (website) return tempoShareLink(decodeProfile(url.href), website);
      return url.href.length <= 8000 ? url.href : text;
    } catch {
      return text;
    }
  }

  const evaluate = (data, time) => evaluatePoints(data.points, time);

  function immutableProfile(data) {
    for (const points of [data.points, data.pitchPoints]) {
      if (!points) continue;
      for (const point of points) Object.freeze(point);
      Object.freeze(points);
    }
    return Object.freeze(data);
  }

  function playbackSchedule(audio) {
    if (!key || !active || audio !== active || !running()) return null;
    const data = profile.data;
    if (data.track !== key) return null;
    if (scheduleData !== data || scheduleOverride !== keyOverride) {
      const overridden = keyOverride !== null;
      let minimumRate = data.points[0].r;
      for (let index = 1; index < data.points.length; index++)
        minimumRate = Math.min(minimumRate, data.points[index].r);
      schedule = Object.freeze({
        isConstantFrom(time) {
          const rate = evaluate(data, time);
          const pitch = profilePitchAt(data, time);
          return (
            data.points.every((point) => point.t < time || point.r === rate) &&
            (overridden ||
              !data.pitchPoints ||
              data.pitchPoints.every(
                (point) => point.t < time || point.k === pitch,
              ))
          );
        },
        rateAt(sourceSeconds) {
          if (!Number.isFinite(sourceSeconds))
            throw new RangeError('Timeline source time must be finite');
          return evaluate(data, sourceSeconds);
        },
        minimumRate,
      });
      scheduleData = data;
      scheduleOverride = keyOverride;
    }
    return schedule;
  }

  function load() {
    profile = null;
    keyOverride = null;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(key)) || 'null');
      if (saved)
        profile = {
          data: immutableProfile(validate(saved.data)),
          enabled: saved.enabled === true,
        };
      if (profile?.data.track !== key) profile = null;
    } catch {
      profile = null;
    }
  }

  function observe(audio) {
    if (!active || !audio.paused) active = audio;
    if (audio.dataset.tempoTimelineObserved) return;
    audio.dataset.tempoTimelineObserved = 'true';
    for (const name of [
      'playing',
      'seeking',
      'seeked',
      'timeupdate',
      'loadedmetadata',
      'pause',
      'ended',
    ]) {
      audio.addEventListener(name, () => {
        if (!audio.paused || !active || active === audio) active = audio;
        tick();
      });
    }
  }

  function value() {
    if (!key || !active || !profile?.enabled || suspended) return null;
    return (
      Math.round(evaluate(profile.data, active.currentTime || 0) * 1000) / 1000
    );
  }

  function changeTrack(next) {
    if (key === next) return;
    key = next;
    keyOverride = null;
    active = null;
    suspended = api.applySaved === false;
    load();
  }
  function activateSaved() {
    load();
    suspended = false;
  }
  function applyOnce(data) {
    profile = {
      data: immutableProfile(validate(data)),
      enabled: true,
      temporary: true,
    };
    keyOverride = null;
    suspended = false;
    api.refresh();
    view.syncControls();
  }
  function stop() {
    if (profile?.temporary) load();
    suspended = true;
    api.normal();
    view.syncControls();
    wake();
  }

  function tick() {
    const nextRate = value();
    const nextPitch = effectivePitch();
    const pitchChanged = nextPitch !== lastPitch;
    lastPitch = nextPitch;
    if ((nextRate !== null && nextRate !== api.rate) || pitchChanged)
      api.refresh();
    view.updatePlayhead();
    wake();
  }

  function wake() {
    view.openPendingLink();
    const automate =
      running() &&
      (profile.data.points.length > 1 ||
        (keyOverride === null && profile.data.pitchPoints?.length > 1));
    const animate = view.isAnimating();
    if (!active || active.paused || active.ended || (!automate && !animate)) {
      clearTimeout(timer);
      timer = 0;
      return;
    }
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      tick();
    }, 50);
  }
  document.addEventListener('visibilitychange', wake);
  function refreshSaved(track) {
    if (track === key && !profile?.temporary) {
      const wasRunning = running();
      load();
      suspended = api.applySaved === false;
      if (wasRunning && !profile?.enabled) api.normal();
      else api.refresh();
    }
    view.syncControls();
    wake();
  }
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === storageKey(key)) {
      refreshSaved(key);
    }
  });
  function effectivePitch() {
    return (
      keyOverride ??
      (running()
        ? profilePitchAt(profile.data, active?.currentTime || 0)
        : null)
    );
  }
  return {
    get track() {
      return key;
    },
    get media() {
      return active;
    },
    get profile() {
      return profile;
    },
    get suspended() {
      return suspended;
    },
    get keyOverride() {
      return keyOverride;
    },
    website,
    storageKey,
    validate,
    encodeProfile,
    decodeProfile,
    playbackDuration,
    running,
    pitchMode,
    shareLink,
    observe,
    value,
    playbackSchedule,
    changeTrack,
    activateSaved,
    applyOnce,
    stop,
    refreshSaved,
    wake,
    keyShift: effectivePitch,
    setKeyShift(value) {
      if (!validKeyShift(value)) throw new RangeError('Invalid key shift');
      keyOverride = value;
    },
    suspend() {
      suspended = true;
      view.syncControls();
      wake();
    },
  };
}
