import assert from 'node:assert/strict';
import test from 'node:test';
import Module from '../vendor/signalsmith/wasm-factory.mjs';
import { registerLivePitch } from '../src/audio/live-pitch-worklet.mjs';
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

test('133 BPM kick attacks never interrupt an in-progress splice fade', () => {
  const length = rate * 10;
  const input = Float32Array.from(
    { length },
    (_, i) => 0.15 * Math.sin((2 * Math.PI * 220 * i) / rate),
  );
  const hits = [];
  for (let t = 0.4; t < 9.5; t += 60 / 133) hits.push(Math.round(t * rate));
  for (const hit of hits) {
    for (let j = 0; j < 2400; j++) {
      const t = j / rate;
      input[hit + j] +=
        0.7 *
        Math.sin(
          2 * Math.PI * (55 * t + 160 * 0.02 * (1 - Math.exp(-t / 0.02))),
        ) *
        Math.exp(-t / 0.03);
    }
  }
  const processor = new WaveformPitch(rate, latency);
  const output = new Float32Array(1);
  const ratio = 2 ** (-2 / 12);
  let interrupted = 0;
  for (let i = 0; i < length; i++) {
    const attackIndex =
      (processor.frame - processor.latency + processor.overlap) &
      processor.mask;
    if (
      processor.attacks[attackIndex] &&
      processor.phase > 0 &&
      processor.phase < processor.overlap
    )
      interrupted++;
    processor.process([input.subarray(i, i + 1)], [output], ratio);
  }
  assert.equal(interrupted, 0);
});

async function createLivePitch() {
  let Processor;
  const saved = {
    sampleRate: globalThis.sampleRate,
    AudioWorkletProcessor: globalThis.AudioWorkletProcessor,
    registerProcessor: globalThis.registerProcessor,
  };
  const messages = [];
  globalThis.sampleRate = rate;
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = {
        onmessage: null,
        postMessage: (msg) => messages.push(msg),
      };
    }
  };
  globalThis.registerProcessor = (_name, cls) => {
    Processor = cls;
  };
  registerLivePitch(Module, WaveformPitch, 'test-live-pitch');
  const node = new Processor({ outputChannelCount: [2] });
  while (!messages.some((m) => m[0] === 'ready'))
    await new Promise((done) => setTimeout(done, 5));
  const call = (method, arg) =>
    node.port.onmessage({ data: [messages.length, method, arg] });
  call('configure', { blockMs: 77, intervalMs: 9, splitComputation: true });
  return {
    node,
    call,
    cleanup() {
      globalThis.sampleRate = saved.sampleRate;
      globalThis.AudioWorkletProcessor = saved.AudioWorkletProcessor;
      globalThis.registerProcessor = saved.registerProcessor;
    },
  };
}

function estimateHz(samples, start, length) {
  let crossings = 0;
  for (let i = start + 1; i < start + length; i++) {
    if (samples[i - 1] <= 0 && samples[i] > 0) crossings++;
  }
  return (crossings * rate) / length;
}

test('LivePitch transitions clear stale WASM frames, update ratio immediately, and crossfade equal-power', async (t) => {
  const { node, call, cleanup } = await createLivePitch();
  t.after(cleanup);
  const runBlock = (inputLeft, outLeft, outRight) => {
    node.process([[inputLeft, inputLeft]], [[outLeft, outRight]]);
  };
  const block = new Float32Array(128);
  const outL = new Float32Array(128);
  const outR = new Float32Array(128);

  // 1. Stale WASM frame leak check: 1s tone at -2 st, then silence + switch to -5 st.
  call('schedule', { active: true, semitones: -2 });
  for (let f = 0; f < rate; f += 128) {
    for (let i = 0; i < 128; i++)
      block[i] = 0.5 * Math.sin((2 * Math.PI * 440 * (f + i)) / rate);
    runBlock(block, outL, outR);
  }
  block.fill(0);
  call('schedule', { active: true, semitones: -5 });
  const tail = [];
  for (let f = 0; f < Math.round(rate * 0.25); f += 128) {
    runBlock(block, outL, outR);
    tail.push(...outL);
  }
  const afterTailPeak = Math.max(
    ...tail.slice(node.delay + node.fadeFrames + 512).map(Math.abs),
  );
  assert.ok(afterTailPeak < 1e-6, `Stale WASM leak peak ${afterTailPeak}`);

  // 2. Immediate pitch change leaving [-4, -1]: -1 st -> -4.5 st at 1 kHz (no 86ms stall at -1 st).
  call('configure', { blockMs: 77, intervalMs: 9, splitComputation: true });
  call('schedule', { active: true, semitones: -1 });
  let frame = 0;
  for (let b = 0; b < 375; b++) {
    for (let i = 0; i < 128; i++)
      block[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * frame++) / rate);
    runBlock(block, outL, outR);
  }
  call('schedule', { active: true, semitones: -4.5 });
  const warmupOut = [];
  for (let b = 0; b < 40; b++) {
    for (let i = 0; i < 128; i++)
      block[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * frame++) / rate);
    runBlock(block, outL, outR);
    warmupOut.push(...outL);
  }
  const hzDuringWarmup = estimateHz(warmupOut, 512, 3000);
  const expectedDown = 1000 * 2 ** (-4.5 / 12);
  assert.ok(
    Math.abs(hzDuringWarmup - expectedDown) < 40,
    `Expected ~${expectedDown.toFixed(1)}Hz during warmup, got ${hzDuringWarmup.toFixed(1)}Hz`,
  );

  // 3. Equal-power crossfade preserves RMS floor across -0.5 -> -1 on rich/complex audio.
  call('configure', { blockMs: 77, intervalMs: 9, splitComputation: true });
  call('schedule', { active: true, semitones: -0.5 });
  frame = 0;
  const complexSample = (idx) => {
    let sum = 0;
    for (let h = 1; h <= 16; h++)
      sum += Math.sin(
        (2 * Math.PI * (110 * h * 1.07 ** (h % 5)) * idx) / rate + h,
      );
    return sum * 0.08;
  };
  const baseRmsSamples = [];
  for (let b = 0; b < 375; b++) {
    for (let i = 0; i < 128; i++) block[i] = complexSample(frame++);
    runBlock(block, outL, outR);
    if (b >= 340) baseRmsSamples.push(...outL);
  }
  const baselineRms = Math.sqrt(
    baseRmsSamples.reduce((s, x) => s + x * x, 0) / baseRmsSamples.length,
  );
  call('schedule', { active: true, semitones: -1 });
  const fadeOut = [];
  for (let b = 0; b < 80; b++) {
    for (let i = 0; i < 128; i++) block[i] = complexSample(frame++);
    runBlock(block, outL, outR);
    fadeOut.push(...outL);
  }
  let minWindowRms = Infinity;
  const win = 576;
  for (let i = 0; i + win <= fadeOut.length; i += 64) {
    let sum = 0;
    for (let j = 0; j < win; j++) sum += fadeOut[i + j] * fadeOut[i + j];
    minWindowRms = Math.min(minWindowRms, Math.sqrt(sum / win));
  }
  assert.ok(
    minWindowRms > baselineRms * 0.7,
    `Crossfade dip: minRms=${minWindowRms.toFixed(4)} vs baseline=${baselineRms.toFixed(4)}`,
  );
});

test('multi-layer music keeps steady read-head lag and hi-hat timing across -1 to -4 st', () => {
  const duration = 8;
  const total = rate * duration;
  const workletLatency = Math.round(0.086 * rate);
  const inL = new Float32Array(total);
  const inR = new Float32Array(total);
  const beatDuration = 60 / 162;
  const kickTimes = [];
  for (let t = 0.5; t < 4.5; t += beatDuration)
    kickTimes.push(Math.round(t * rate));
  const hatTimes = [];
  for (let t = 0.5 + beatDuration / 2; t < 7.6; t += beatDuration)
    hatTimes.push(Math.round(t * rate));
  let bassPhase = 0;
  let melodyPhase = 0;
  const notes = [220, 261.63, 293.66, 329.63, 392, 329.63, 293.66, 246.94];
  for (let i = 0; i < total; i++) {
    const t = i / rate;
    const beatIndex = Math.floor(t / beatDuration);
    bassPhase += (beatIndex % 8 < 4 ? 55 : 65.41) / rate;
    melodyPhase += notes[beatIndex % notes.length] / rate;
    let bass = 0;
    for (let h = 1; h <= 8; h++)
      bass += Math.sin(2 * Math.PI * bassPhase * h) / h;
    bass *= 0.22;
    const melody =
      0.2 * Math.sin(2 * Math.PI * melodyPhase) +
      0.1 * Math.sin(2 * Math.PI * melodyPhase * 1.5 + 0.4);
    inL[i] = bass + melody;
    inR[i] = bass * 0.9 + melody * 1.1;
  }
  for (const kick of kickTimes) {
    for (let j = 0; j < Math.round(rate * 0.05) && kick + j < total; j++) {
      const t = j / rate;
      const sample =
        0.8 *
        Math.tanh(
          5 *
            Math.sin(
              2 * Math.PI * (52 * t + 180 * 0.015 * (1 - Math.exp(-t / 0.015))),
            ),
        ) *
        Math.exp(-t / 0.03);
      inL[kick + j] += sample;
      inR[kick + j] += sample;
    }
  }
  for (const hat of hatTimes) {
    for (let j = 0; j < Math.round(rate * 0.01) && hat + j < total; j++) {
      const t = j / rate;
      const sample =
        0.5 * Math.sin(2 * Math.PI * 3500 * t) * Math.exp(-t / 0.002);
      inL[hat + j] += sample;
      inR[hat + j] -= sample * 0.8;
    }
  }
  for (const shift of [-1, -2, -3, -4]) {
    const processor = new WaveformPitch(rate, workletLatency);
    const outL = new Float32Array(total);
    const outR = new Float32Array(total);
    const ratio = 2 ** (shift / 12);
    let minLagMs = Infinity;
    let maxLagMs = -Infinity;
    for (let i = 0; i < total; i += 128) {
      const len = Math.min(128, total - i);
      processor.process(
        [inL.subarray(i, i + len), inR.subarray(i, i + len)],
        [outL.subarray(i, i + len), outR.subarray(i, i + len)],
        ratio,
      );
      if (i >= rate) {
        const lagMs =
          ((processor.head - (processor.frame - workletLatency)) / rate) * 1000;
        if (lagMs < minLagMs) minLagMs = lagMs;
        if (lagMs > maxLagMs) maxLagMs = lagMs;
      }
    }
    assert.ok(
      minLagMs >= -18 && maxLagMs <= 16,
      `Shift ${shift} st read-head lag out of bounds: [${minLagMs.toFixed(1)}, ${maxLagMs.toFixed(1)}] ms`,
    );
    const win = Math.round(rate * 0.05);
    const step = Math.round(rate * 0.0005);
    const energyLen = Math.round(rate * 0.002);
    for (const pos of hatTimes.slice(1)) {
      const expected = pos + workletLatency;
      let bestIndex = expected;
      let bestEnergy = -1;
      for (let i = expected - win; i <= expected + win; i += step) {
        let energy = 0;
        for (let j = 0; j < energyLen; j++) {
          const diff = outL[i + j] - outL[i + j - 1];
          energy += diff * diff;
        }
        if (energy > bestEnergy) {
          bestEnergy = energy;
          bestIndex = i;
        }
      }
      const errMs = ((bestIndex - expected) / rate) * 1000;
      assert.ok(
        bestEnergy > 0.25 && errMs >= -12 && errMs <= 18,
        `Shift ${shift} st hat at ${(pos / rate).toFixed(2)}s: energy=${bestEnergy.toFixed(3)}, err=${errMs.toFixed(1)} ms`,
      );
    }
  }
});

test('kick attack anti-flam clamps backward fade length and suppresses pre-echo', () => {
  const workletLatency = Math.round(0.086 * rate);
  const ratio = 2 ** (-2 / 12);
  const length = rate * 2;
  const hit = Math.round(1.0 * rate);
  const input = Float32Array.from(
    { length },
    (_, i) => 0.15 * Math.tanh(4 * Math.sin((2 * Math.PI * 46 * i) / rate)),
  );
  for (let j = 0; j < 2400; j++) {
    const t = j / rate;
    input[hit + j] +=
      0.85 *
      Math.tanh(
        6 *
          Math.sin(
            2 * Math.PI * (52 * t + 180 * 0.015 * (1 - Math.exp(-t / 0.015))),
          ),
      ) *
      Math.exp(-t / 0.03);
  }
  const processor = new WaveformPitch(rate, workletLatency);
  const out = new Float32Array(length);
  const sampleOut = new Float32Array(1);
  let backwardTrigger = null;
  for (let i = 0; i < length; i++) {
    const target = processor.frame - processor.latency;
    const attackPos = target + processor.overlap;
    const preHead = processor.head;
    const desired = target + (1 - ratio) * processor.overlap;
    const attackFired =
      attackPos >= 0 && Boolean(processor.attacks[attackPos & processor.mask]);
    processor.process([input.subarray(i, i + 1)], [sampleOut], ratio);
    out[i] = sampleOut[0];
    if (attackFired && preHead > desired && Math.abs(desired - preHead) >= 1) {
      backwardTrigger = {
        preHead,
        attackPos,
        fadeLength: processor.fadeLength,
        safe: Math.floor((attackPos - preHead) / ratio),
      };
    }
  }
  // Also explicitly verify backward clamping with a forced leading read head before a second hit.
  const forcedLength = rate * 2;
  const forcedInput = Float32Array.from(
    { length: forcedLength },
    (_, i) => 0.15 * Math.tanh(4 * Math.sin((2 * Math.PI * 46 * i) / rate)),
  );
  for (let j = 0; j < 2400; j++) {
    const t = j / rate;
    forcedInput[hit + j] +=
      0.85 *
      Math.tanh(
        6 *
          Math.sin(
            2 * Math.PI * (52 * t + 180 * 0.015 * (1 - Math.exp(-t / 0.015))),
          ),
      ) *
      Math.exp(-t / 0.03);
  }
  const forced = new WaveformPitch(rate, workletLatency);
  const forcedOut = new Float32Array(forcedLength);
  let clampedTrigger = null;
  for (let i = 0; i < forcedLength; i++) {
    const target = forced.frame - forced.latency;
    const attackPos = target + forced.overlap;
    if (
      attackPos >= 0 &&
      forced.attacks[attackPos & forced.mask] &&
      forced.head <= target + (1 - ratio) * forced.overlap
    ) {
      forced.head = target + Math.round(0.012 * rate);
    }
    const preHead = forced.head;
    const desired = target + (1 - ratio) * forced.overlap;
    const attackFired =
      attackPos >= 0 && Boolean(forced.attacks[attackPos & forced.mask]);
    forced.process([forcedInput.subarray(i, i + 1)], [sampleOut], ratio);
    forcedOut[i] = sampleOut[0];
    if (attackFired && preHead > desired && Math.abs(desired - preHead) >= 1) {
      clampedTrigger = {
        fadeLength: forced.fadeLength,
        safe: Math.floor((attackPos - preHead) / ratio),
      };
    }
  }
  assert.ok(clampedTrigger, 'Expected backward kick alignment trigger');
  assert.ok(
    clampedTrigger.fadeLength <= clampedTrigger.safe &&
      clampedTrigger.fadeLength < forced.overlap,
    `Fade not clamped: ${JSON.stringify(clampedTrigger)}`,
  );
  let preEchoPeak = 0;
  for (let i = hit + workletLatency - 960; i < hit + workletLatency - 96; i++)
    preEchoPeak = Math.max(preEchoPeak, Math.abs(forcedOut[i]));
  assert.ok(
    preEchoPeak < 0.25,
    `Double-kick pre-echo detected: ${preEchoPeak.toFixed(3)}`,
  );
  if (backwardTrigger) {
    assert.ok(backwardTrigger.fadeLength <= Math.max(2, backwardTrigger.safe));
  }
});
