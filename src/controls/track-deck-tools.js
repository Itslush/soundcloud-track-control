const round = (value) => Math.round(value * 1000) / 1000;

export function createTrackDeckTools({
  store,
  readTrack,
  readAudio,
  readRate,
  setRate,
  onChange,
  raf = (cb) => globalThis.requestAnimationFrame?.(cb) ?? 0,
  cancelRaf = (id) => globalThis.cancelAnimationFrame?.(id),
  now = () => Date.now(),
} = {}) {
  let loopTrack = '';
  let loop = { active: false, a: null, b: null };
  let frame = 0;
  let boundAudio = null;
  let taps = [];
  let bpmTrack = '';
  let baseBpm = null;

  function syncScope() {
    const current = readTrack?.() || '';
    if (current !== loopTrack) {
      loopTrack = current;
      loop = { active: false, a: null, b: null };
      stopTicker();
    }
    if (current !== bpmTrack) {
      bpmTrack = current;
      taps = [];
      baseBpm = null;
    }
    return current;
  }

  function unbindAudio() {
    if (!boundAudio) return;
    boundAudio.removeEventListener?.('play', ensureTicker);
    boundAudio.removeEventListener?.('pause', stopTicker);
    boundAudio.removeEventListener?.('ended', stopTicker);
    boundAudio = null;
  }

  function stopTicker() {
    if (frame) {
      cancelRaf(frame);
      frame = 0;
    }
    if (!loop.active) unbindAudio();
  }

  function tick() {
    frame = 0;
    const track = readTrack?.() || '';
    if (!loop.active || loop.a === null || loop.b === null || track !== loopTrack) {
      if (track !== loopTrack) loop = { active: false, a: null, b: null };
      return;
    }
    const audio = readAudio?.();
    if (!audio || audio.paused) return;
    if (audio.currentTime >= loop.b || audio.currentTime < loop.a - 0.1) {
      audio.currentTime = loop.a;
    }
    frame = raf(tick);
  }

  function ensureTicker() {
    if (!loop.active || loop.a === null || loop.b === null) return;
    const audio = readAudio?.();
    if (!audio) return;
    if (boundAudio !== audio) {
      unbindAudio();
      boundAudio = audio;
      boundAudio.addEventListener?.('play', ensureTicker, { passive: true });
      boundAudio.addEventListener?.('pause', stopTicker, { passive: true });
      boundAudio.addEventListener?.('ended', stopTicker, { passive: true });
    }
    if (!audio.paused && !frame) frame = raf(tick);
  }

  function setA() {
    syncScope();
    const audio = readAudio?.();
    if (!audio || !Number.isFinite(audio.currentTime)) return loopState();
    const a = round(Math.max(0, audio.currentTime));
    if (loop.b !== null && loop.b <= a + 0.05) {
      loop = { active: false, a, b: null };
      stopTicker();
    } else {
      loop = { ...loop, a };
      if (loop.b !== null) loop.active = true;
      ensureTicker();
    }
    onChange?.();
    return loopState();
  }

  function setB() {
    syncScope();
    const audio = readAudio?.();
    if (!audio || !Number.isFinite(audio.currentTime)) return loopState();
    const a = loop.a ?? 0;
    const b = round(audio.currentTime);
    if (b <= a + 0.05) return loopState();
    loop = { active: true, a, b };
    ensureTicker();
    onChange?.();
    return loopState();
  }

  function clearLoop() {
    loop = { active: false, a: null, b: null };
    stopTicker();
    onChange?.();
    return loopState();
  }

  function toggleLoopStep() {
    syncScope();
    if (loop.active) return clearLoop();
    if (loop.a === null) return setA();
    if (loop.b === null) return setB();
    return clearLoop();
  }

  function loopState() {
    syncScope();
    return { ...loop };
  }

  function cues() {
    const track = readTrack?.() || '';
    if (!track || !store?.cues) return [null, null, null, null];
    return store.cues(track) ?? [null, null, null, null];
  }

  function writeCues(track, next) {
    const hasAny = next.some((point) => point !== null);
    store?.set?.(track, 'cues', hasAny ? next : null);
    onChange?.();
    return next;
  }

  function setCue(index) {
    if (index < 0 || index > 3) return cues();
    const track = readTrack?.() || '';
    const audio = readAudio?.();
    if (!track || !audio || !Number.isFinite(audio.currentTime)) return cues();
    const next = [...cues()];
    next[index] = round(Math.max(0, audio.currentTime));
    return writeCues(track, next);
  }

  function clearCue(index) {
    if (index < 0 || index > 3) return cues();
    const track = readTrack?.() || '';
    if (!track) return cues();
    const next = [...cues()];
    next[index] = null;
    return writeCues(track, next);
  }

  function triggerCue(index) {
    if (index < 0 || index > 3) return cues();
    const audio = readAudio?.();
    const current = cues();
    if (current[index] === null) return setCue(index);
    if (audio) audio.currentTime = current[index];
    return current;
  }

  function tapBpm() {
    syncScope();
    const timestamp = now();
    if (taps.length && timestamp - taps[taps.length - 1] > 2500) taps = [];
    taps.push(timestamp);
    if (taps.length > 8) taps.shift();
    if (taps.length >= 2) {
      const avgMs = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      if (avgMs > 0) {
        const tappedBpm = 60000 / avgMs;
        const rate = Math.max(0.25, Number(readRate?.()) || 1);
        baseBpm = Math.round((tappedBpm / rate) * 10) / 10;
      }
    }
    onChange?.();
    return bpmState();
  }

  function resetBpm() {
    taps = [];
    baseBpm = null;
    onChange?.();
    return bpmState();
  }

  function applyTargetBpm(targetBpm) {
    syncScope();
    const target = Number(targetBpm);
    if (!Number.isFinite(target) || target < 20 || target > 300)
      throw new Error('Enter a target BPM between 20 and 300.');
    if (!baseBpm || baseBpm <= 0)
      throw new Error('Tap BPM first so the track BPM is known.');
    const nextRate = round(Math.max(0.25, Math.min(4, target / baseBpm)));
    setRate?.(nextRate);
    onChange?.();
    return nextRate;
  }

  function bpmState() {
    syncScope();
    const rate = Math.max(0.25, Number(readRate?.()) || 1);
    return {
      taps: taps.length,
      baseBpm,
      effectiveBpm:
        baseBpm !== null ? Math.round(baseBpm * rate * 10) / 10 : null,
    };
  }

  return {
    syncTrack: syncScope,
    setA,
    setB,
    clearLoop,
    toggleLoopStep,
    loopState,
    cues,
    setCue,
    clearCue,
    triggerCue,
    tapBpm,
    resetBpm,
    applyTargetBpm,
    bpmState,
    dispose() {
      loop = { active: false, a: null, b: null };
      stopTicker();
      unbindAudio();
    },
  };
}
