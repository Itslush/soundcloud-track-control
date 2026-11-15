export const pitchTiming: Readonly<{ blockMs: number; intervalMs: number }>;
export const peakProtectionKey: string;
export function readPeakProtection(storage?: Storage): boolean;
export function createPitchOutput(
  context: BaseAudioContext,
  destination: AudioNode,
  enabled: boolean,
): { input: GainNode; setEnabled(enabled: boolean): void };
