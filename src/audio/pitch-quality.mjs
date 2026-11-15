export const pitchTiming = Object.freeze({ blockMs: 77, intervalMs: 9 });

let peakCurve;

export function protectedPitchInput(context, destination) {
  // WaveShaper clamps its input at ±1. Scale first to retain the shape of hot peaks.
  const headroom = context.createGain();
  headroom.gain.value = 0.25;
  const shaper = context.createWaveShaper();
  peakCurve ??= Float32Array.from({ length: 4097 }, (_, index) => {
    const x = (index - 2048) / 512;
    const excess = Math.abs(x) - 0.9;
    return excess <= 0
      ? x
      : Math.sign(x) * (0.9 - 0.09 * Math.expm1(-excess / 0.09));
  });
  shaper.curve = peakCurve;
  headroom.connect(shaper).connect(destination);
  return headroom;
}
