export const pitchTiming = Object.freeze({ blockMs: 77, intervalMs: 9 });
export const peakProtectionKey = 'soundcloud.tempo.peakProtection';

export function readPeakProtection(storage) {
  try {
    return (
      (storage ?? globalThis.localStorage).getItem(peakProtectionKey) !==
      'false'
    );
  } catch {
    return true;
  }
}

let peakCurve;

function createPeakShaper(context, destination) {
  const shaper = context.createWaveShaper();
  peakCurve ??= Float32Array.from({ length: 4097 }, (_, index) => {
    const x = (index - 2048) / 512;
    const excess = Math.abs(x) - 0.9;
    return excess <= 0
      ? x
      : Math.sign(x) * (0.9 - 0.09 * Math.expm1(-excess / 0.09));
  });
  shaper.curve = peakCurve;
  shaper.connect(destination);
  return shaper;
}

export function createPitchOutput(context, destination, enabled) {
  const input = context.createGain();
  let shaper;
  let connected;
  function setEnabled(protect) {
    const target = protect
      ? (shaper ??= createPeakShaper(context, destination))
      : destination;
    if (target === connected) return;
    if (connected) input.disconnect(connected);
    // WaveShaper clamps its input at ±1. The curve accounts for this 4× headroom.
    input.gain.value = protect ? 0.25 : 1;
    input.connect(target);
    connected = target;
  }
  setEnabled(enabled);
  return { input, setEnabled };
}
