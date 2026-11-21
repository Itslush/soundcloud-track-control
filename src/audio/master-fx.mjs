export const FX_STORAGE = 'soundcloud.tempo.fx';
export const PITCH_ENGINE_STORAGE = 'soundcloud.tempo.pitchEngine';

export const DEFAULT_FX = Object.freeze({
  bassDb: 0,
  filter: 0,
  space: 0,
  room: 'room',
  softClip: false,
});

const ROOM_PRESETS = Object.freeze({
  room: { duration: 0.72, decay: 2.5, damp: 0.35, preDelay: 0.004, wetScale: 0.38 },
  hall: { duration: 1.75, decay: 2.1, damp: 0.25, preDelay: 0.012, wetScale: 0.45 },
  cavern: { duration: 3.1, decay: 1.55, damp: 0.18, preDelay: 0.022, wetScale: 0.52 },
});

const impulseCache = new Map();
let softClipTable = null;

function round(value) {
  return Math.round(value * 1000) / 1000;
}

export function validPitchEngine(value) {
  return value === 'auto' || value === 'punch' || value === 'smooth';
}

export function readPitchEngine(storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    const raw = store?.getItem?.(PITCH_ENGINE_STORAGE);
    if (raw === null || raw === undefined) return 'auto';
    let parsed = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {}
    return validPitchEngine(parsed) ? parsed : 'auto';
  } catch {
    return 'auto';
  }
}

export function isDefaultFx(value = DEFAULT_FX) {
  const fx = normalizeFxSettings(value);
  return (
    fx.bassDb === 0 &&
    Math.abs(fx.filter) < 0.005 &&
    fx.space === 0 &&
    !fx.softClip
  );
}

export function validFxSettings(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof value.bassDb === 'number' &&
      Number.isFinite(value.bassDb) &&
      value.bassDb >= 0 &&
      value.bassDb <= 9 &&
      typeof value.filter === 'number' &&
      Number.isFinite(value.filter) &&
      value.filter >= -1 &&
      value.filter <= 1 &&
      typeof value.space === 'number' &&
      Number.isFinite(value.space) &&
      value.space >= 0 &&
      value.space <= 1 &&
      Object.hasOwn(ROOM_PRESETS, value.room) &&
      typeof value.softClip === 'boolean',
  );
}

export function normalizeFxSettings(value) {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const clamp = (raw, min, max, fallback) => {
    const n = Number(raw);
    return Number.isFinite(n) ? round(Math.min(max, Math.max(min, n))) : fallback;
  };
  return {
    bassDb: clamp(source.bassDb, 0, 9, DEFAULT_FX.bassDb),
    filter: clamp(source.filter, -1, 1, DEFAULT_FX.filter),
    space: clamp(source.space, 0, 1, DEFAULT_FX.space),
    room: Object.hasOwn(ROOM_PRESETS, source.room) ? source.room : DEFAULT_FX.room,
    softClip:
      typeof source.softClip === 'boolean' ? source.softClip : DEFAULT_FX.softClip,
  };
}

export function readFxSettings(storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    const raw = store?.getItem?.(FX_STORAGE);
    if (raw === null || raw === undefined) return { ...DEFAULT_FX };
    const parsed = JSON.parse(raw);
    return validFxSettings(parsed) ? normalizeFxSettings(parsed) : { ...DEFAULT_FX };
  } catch {
    return { ...DEFAULT_FX };
  }
}

export function softClipCurve(samples = 4096) {
  if (softClipTable && softClipTable.length === samples) return softClipTable;
  const curve = new Float32Array(samples);
  const knee = 0.55;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    const abs = Math.abs(x);
    if (abs <= knee) {
      curve[i] = x;
    } else {
      const over = (abs - knee) / (1 - knee);
      curve[i] = Math.sign(x) * (knee + (1 - knee) * Math.tanh(over));
    }
  }
  if (samples === 4096) softClipTable = curve;
  return curve;
}

export function buildImpulseBuffer(context, room = 'room') {
  const preset = ROOM_PRESETS[room] ?? ROOM_PRESETS.room;
  const sampleRate = Number.isFinite(context?.sampleRate) ? context.sampleRate : 48000;
  const cacheKey = `${room}@${sampleRate}`;
  const cached = impulseCache.get(cacheKey);
  if (cached) return cached;
  const length = Math.max(128, Math.round(preset.duration * sampleRate));
  const buffer = context.createBuffer(2, length, sampleRate);
  const attackSamples = Math.max(1, Math.round(preset.preDelay * sampleRate));
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let seed =
      ((room.charCodeAt(0) * 2654435761) ^ ((channel + 1) * 1597334677)) >>> 0;
    let low = 0;
    for (let i = 0; i < length; i++) {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      const white = ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
      low += preset.damp * (white - low);
      const attack = i < attackSamples ? i / attackSamples : 1;
      const decay = (1 - i / length) ** preset.decay;
      data[i] = low * attack * decay * 0.45;
    }
  }
  if (impulseCache.size > 12) impulseCache.clear();
  impulseCache.set(cacheKey, buffer);
  return buffer;
}

function disconnectSafely(node) {
  try {
    node?.disconnect();
  } catch {}
}

export function createMasterFx(context, destination, initialFx = DEFAULT_FX) {
  const input = context.createGain();
  let fx = normalizeFxSettings(initialFx);
  let bassNode = null;
  let djNode = null;
  let dryGain = null;
  let wetGain = null;
  let wetSum = null;
  let convolver = null;
  let loadedRoom = '';
  let clipper = null;
  let analyser = null;
  let meterData = null;
  let lastTail = null;
  let peakHold = 0;
  let clipped = false;
  let disposed = false;

  const setParam = (param, value) => {
    if (!param) return;
    if (typeof param.setTargetAtTime === 'function' && context.currentTime !== undefined) {
      try {
        param.setValueAtTime(value, context.currentTime);
        return;
      } catch {}
    }
    param.value = value;
  };

  function connectRoute() {
    if (disposed || !input || !destination) return;
    for (const node of [input, bassNode, djNode, dryGain, wetGain, convolver, wetSum, clipper, analyser]) {
      disconnectSafely(node);
    }

    const activeFilter = Math.abs(fx.filter) >= 0.005;
    const activeBass = fx.bassDb > 0;
    const activeSpace = fx.space > 0 && typeof context.createConvolver === 'function' && typeof context.createBuffer === 'function';
    const activeClip = fx.softClip && typeof context.createWaveShaper === 'function';

    let cursor = input;

    if (activeBass && typeof context.createBiquadFilter === 'function') {
      if (!bassNode) {
        bassNode = context.createBiquadFilter();
        bassNode.type = 'lowshelf';
        setParam(bassNode.frequency, 75);
      }
      setParam(bassNode.gain, fx.bassDb);
      cursor.connect(bassNode);
      cursor = bassNode;
    }

    if (activeFilter && typeof context.createBiquadFilter === 'function') {
      if (!djNode) djNode = context.createBiquadFilter();
      if (fx.filter < 0) {
        djNode.type = 'lowpass';
        const freq = 20000 * (160 / 20000) ** -fx.filter;
        setParam(djNode.frequency, freq);
        setParam(djNode.Q, 1.1 + 1.4 * Math.abs(fx.filter));
      } else {
        djNode.type = 'highpass';
        const freq = 22 * (5500 / 22) ** fx.filter;
        setParam(djNode.frequency, freq);
        setParam(djNode.Q, 1.1 + 1.4 * fx.filter);
      }
      cursor.connect(djNode);
      cursor = djNode;
    }

    if (activeSpace) {
      if (!dryGain) dryGain = context.createGain();
      if (!wetGain) wetGain = context.createGain();
      if (!wetSum) wetSum = context.createGain();
      if (!convolver) convolver = context.createConvolver();
      if (loadedRoom !== fx.room) {
        convolver.buffer = buildImpulseBuffer(context, fx.room);
        loadedRoom = fx.room;
      }
      const preset = ROOM_PRESETS[fx.room] ?? ROOM_PRESETS.room;
      setParam(dryGain.gain, 1 - fx.space * 0.2);
      setParam(wetGain.gain, fx.space * preset.wetScale * 2);
      cursor.connect(dryGain);
      cursor.connect(convolver);
      convolver.connect(wetGain);
      dryGain.connect(wetSum);
      wetGain.connect(wetSum);
      cursor = wetSum;
    }

    if (activeClip) {
      if (!clipper) {
        clipper = context.createWaveShaper();
        clipper.curve = softClipCurve();
        try {
          clipper.oversample = '2x';
        } catch {}
      }
      cursor.connect(clipper);
      cursor = clipper;
    }

    lastTail = cursor;
    if (analyser) {
      cursor.connect(analyser);
      analyser.connect(destination);
    } else {
      cursor.connect(destination);
    }
  }

  connectRoute();

  return {
    input,
    current: () => ({ ...fx }),
    update(nextFx) {
      fx = normalizeFxSettings(nextFx);
      connectRoute();
      return { ...fx };
    },
    readPeak() {
      if (disposed || typeof context.createAnalyser !== 'function') {
        return { peakDb: -96, peakHoldDb: -96, clipped: false };
      }
      if (!analyser) {
        analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        meterData = new Float32Array(analyser.fftSize);
        connectRoute();
      }
      let peak = 0;
      if (typeof analyser.getFloatTimeDomainData === 'function') {
        analyser.getFloatTimeDomainData(meterData);
        for (let i = 0; i < meterData.length; i++) {
          const sample = Math.abs(meterData[i]);
          if (sample > peak) peak = sample;
        }
      }
      if (peak > peakHold) peakHold = peak;
      if (peak >= 0.999) clipped = true;
      const toDb = (linear) =>
        Math.round(Math.max(-96, 20 * Math.log10(Math.max(1e-5, linear))) * 10) / 10;
      return {
        peakDb: toDb(peak),
        peakHoldDb: toDb(peakHold),
        clipped,
      };
    },
    resetPeakHold() {
      peakHold = 0;
      clipped = false;
    },
    dispose() {
      disposed = true;
      for (const node of [input, bassNode, djNode, dryGain, wetGain, convolver, wetSum, clipper, analyser]) {
        disconnectSafely(node);
      }
    },
  };
}
