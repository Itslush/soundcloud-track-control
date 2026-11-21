import { createMasterFx, isDefaultFx } from '../audio/master-fx.mjs';

export function ensureMasterFx(state, currentFx, connect, disconnect) {
  if (!state || state.masterFx || state.source.context.state === 'closed')
    return state?.masterFx ?? null;
  const context = state.source.context;
  const fxOut = context.createGain();
  const masterFx = createMasterFx(context, fxOut, currentFx);
  const upstream = state.output;
  for (const sink of state.sinks) {
    try {
      disconnect.call(upstream, sink.target);
    } catch {}
  }
  upstream.connect(masterFx.input);
  for (const sink of state.sinks) connect.apply(fxOut, sink.args);
  state.fxOut = fxOut;
  state.masterFx = masterFx;
  return masterFx;
}

export function createBassSwapFilters(context, enabled, opening, now, seconds) {
  if (
    !enabled ||
    !opening ||
    typeof context?.createBiquadFilter !== 'function'
  )
    return { outHpf: null, headHpf: null };
  const make = (from, to) => {
    const hpf = context.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.Q.value = 0.7;
    hpf.frequency.setValueAtTime(from, now);
    hpf.frequency.exponentialRampToValueAtTime?.(to, now + seconds * 0.75);
    return hpf;
  };
  return {
    outHpf: make(22, 320),
    headHpf: make(300, 20),
  };
}

export function applyFxUpdate(nextFx, { references, states, connect, disconnect }) {
  let latest = nextFx;
  for (const reference of references) {
    const state = states.get(reference.deref());
    if (!state) continue;
    const fx = !isDefaultFx(nextFx)
      ? ensureMasterFx(state, nextFx, connect, disconnect)
      : state.masterFx;
    if (fx) latest = fx.update(nextFx);
  }
  return latest;
}

export function readDspSnapshot(
  audio,
  { references, states, readEngine, currentFx, connect, disconnect },
) {
  let state = audio && states.get(audio);
  if (!state) {
    for (const reference of references) {
      const candidate = states.get(reference.deref());
      if (candidate && candidate.source.context.state !== 'closed') {
        state = candidate;
        break;
      }
    }
  }
  const peak = state
    ? (ensureMasterFx(state, currentFx, connect, disconnect)?.readPeak() ?? {
        peakDb: -96,
        peakHoldDb: -96,
        clipped: false,
      })
    : { peakDb: -96, peakHoldDb: -96, clipped: false };
  return {
    engine: readEngine(),
    mode: state?.active ? state.engine || readEngine() : 'bypass',
    sampleRate: state?.source?.context?.sampleRate ?? 0,
    latencyMs: state?.active ? Math.round((state.latency ?? 0) * 1000) : 0,
    active: Boolean(state?.active),
    ...peak,
  };
}
