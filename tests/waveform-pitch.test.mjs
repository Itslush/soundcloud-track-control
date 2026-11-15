import assert from 'node:assert/strict';
import test from 'node:test';
import { WaveformPitch } from '../src/audio/waveform-pitch.mjs';

const rate = 48000;
const latency = Math.round(0.077 * rate);

function downTwoSemitones(input) {
  const processor = new WaveformPitch(rate, latency);
  const result = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 128) {
    processor.process(
      [input.subarray(i, i + 128)],
      [result.subarray(i, i + 128)],
      2 ** (-2 / 12),
    );
  }
  return result;
}

test('a short drum hit stays audible over a sustained bass note', () => {
  const pcm = Float32Array.from(
    { length: 45 * rate },
    (_, i) => 0.22 * Math.sin((2 * Math.PI * 53 * i) / rate),
  );
  const hits = Array.from({ length: 110 }, (_, i) =>
    Math.round((0.3 + i * 0.397883) * rate),
  );
  for (const hit of hits) {
    for (let j = 0; j < 0.08 * rate; j++) {
      const t = j / rate;
      pcm[hit + j] += Math.sin(2 * Math.PI * 1300 * t) * Math.exp(-t / 0.0015);
    }
  }
  const out = downTwoSemitones(pcm);
  for (const hit of hits) {
    const near = out.subarray(hit + latency - 2400, hit + latency + 2400);
    assert.ok(
      Math.max(...near.map(Math.abs)) > 0.6,
      'Missing attack at ' + hit / rate,
    );
  }
});

test('steady harmonics retain their level through waveform splices and resampling', () => {
  for (const hz of [3000, 20000]) {
    const input = Float32Array.from(
      { length: rate * 2 },
      (_, i) => 0.7 * Math.sin((2 * Math.PI * hz * i) / rate),
    );
    const out = downTwoSemitones(input);
    for (let i = rate / 2; i < out.length - 384; i += 384) {
      const rms = Math.sqrt(
        out.subarray(i, i + 384).reduce((sum, x) => sum + x * x, 0) / 384,
      );
      assert.ok(rms > 0.45 && rms < 0.53, hz + ' Hz RMS ' + rms);
    }
  }
});

test('live downward steps keep distorted kick attacks on the melody clock', () => {
  const length = rate * 10;
  const hits = Array.from({ length: 27 }, (_, i) =>
    Math.round((0.4 + i / 3) * rate),
  );
  const input = Float32Array.from(
    { length },
    (_, i) =>
      0.2 * Math.sin((2 * Math.PI * 440 * i) / rate) +
      0.2 * Math.sin((2 * Math.PI * 659.25 * i) / rate),
  );
  for (const hit of hits) {
    for (let j = 0; j < 2200; j++) {
      const t = j / rate;
      input[hit + j] +=
        0.6 *
        Math.tanh(
          5 *
            Math.sin(
              2 * Math.PI * (55 * t + 180 * 0.02 * (1 - Math.exp(-t / 0.02))),
            ),
        ) *
        Math.exp(-t / 0.027);
    }
  }
  for (const rightOnly of [false, true]) {
    const processor = new WaveformPitch(rate, latency);
    const output = new Float32Array(length);
    const silent = new Float32Array(length);
    const shifts = [-2.5, -3, -3.5, -4, -3.5, -3];
    for (let i = 0; i < length; i += 128) {
      const shift = shifts[Math.min(shifts.length - 1, Math.floor(i / rate))];
      const signal = input.subarray(i, i + 128);
      const zero = silent.subarray(i, i + 128);
      const result = output.subarray(i, i + 128);
      processor.process(
        rightOnly ? [zero, signal] : [signal],
        rightOnly ? [zero, result] : [result],
        2 ** (shift / 12),
      );
    }
    for (const hit of hits) {
      let peak = 0;
      let position = 0;
      for (let i = hit + latency - 1440; i < hit + latency + 1440; i++) {
        if (Math.abs(output[i]) > peak) {
          peak = Math.abs(output[i]);
          position = i;
        }
      }
      const delayMs = (position - hit - latency) / (rate / 1000);
      assert.ok(
        peak > 0.4 && delayMs >= -2 && delayMs < 8,
        `${hit / rate}s: peak ${peak}, delay ${delayMs}ms`,
      );
    }
  }
});
