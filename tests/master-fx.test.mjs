import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { registerLivePitch } from '../src/audio/live-pitch-worklet.mjs';
import { encodeWav } from '../src/audio/local-export.mjs';
import {
  DEFAULT_FX,
  FX_STORAGE,
  PITCH_ENGINE_STORAGE,
  buildImpulseBuffer,
  createMasterFx,
  isDefaultFx,
  normalizeFxSettings,
  readFxSettings,
  readPitchEngine,
  softClipCurve,
  validFxSettings,
  validPitchEngine,
} from '../src/audio/master-fx.mjs';

function makeAudioContext(samples = [0.25, -0.5]) {
  const created = [];
  class MockNode {
    constructor(kind) {
      this.kind = kind;
      this.connections = new Set();
      this.gain = { value: 1, setValueAtTime(v) { this.value = v; } };
      this.frequency = { value: 0, setValueAtTime(v) { this.value = v; } };
      this.Q = { value: 1, setValueAtTime(v) { this.value = v; } };
      created.push(this);
    }
    connect(dest) {
      this.connections.add(dest);
      return dest;
    }
    disconnect(dest) {
      if (dest) this.connections.delete(dest);
      else this.connections.clear();
    }
  }
  const context = {
    sampleRate: 48000,
    currentTime: 0,
    destination: new MockNode('destination'),
    created,
    createGain: () => new MockNode('gain'),
    createBiquadFilter: () => new MockNode('biquad'),
    createConvolver: () => new MockNode('convolver'),
    createWaveShaper: () => new MockNode('shaper'),
    createBuffer: (channels, length, sampleRate) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData: (ch) => data[ch],
      };
    },
    createAnalyser: () => {
      const node = new MockNode('analyser');
      node.fftSize = 1024;
      node.getFloatTimeDomainData = (out) => {
        out.fill(0);
        for (let i = 0; i < samples.length && i < out.length; i++)
          out[i] = samples[i];
      };
      return node;
    },
  };
  return { context, samples };
}

test('pitch engine and fx validators handle valid, partial, JSON and corrupt storage values', () => {
  assert.equal(validPitchEngine('auto'), true);
  assert.equal(validPitchEngine('punch'), true);
  assert.equal(validPitchEngine('smooth'), true);
  assert.equal(validPitchEngine('tape'), false);

  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null) };
  assert.equal(readPitchEngine(storage), 'auto');
  mem.set(PITCH_ENGINE_STORAGE, 'punch');
  assert.equal(readPitchEngine(storage), 'punch');
  mem.set(PITCH_ENGINE_STORAGE, JSON.stringify('smooth'));
  assert.equal(readPitchEngine(storage), 'smooth');
  mem.set(PITCH_ENGINE_STORAGE, 'invalid');
  assert.equal(readPitchEngine(storage), 'auto');

  assert.equal(isDefaultFx(DEFAULT_FX), true);
  assert.equal(validFxSettings(DEFAULT_FX), true);
  assert.equal(validFxSettings({ ...DEFAULT_FX, bassDb: 9.5 }), false);
  assert.equal(validFxSettings({ ...DEFAULT_FX, filter: -1.1 }), false);
  assert.equal(validFxSettings({ ...DEFAULT_FX, room: 'garage' }), false);

  const normalized = normalizeFxSettings({ bassDb: 20, filter: -2, space: 0.5, room: 'bad', softClip: 1 });
  assert.deepEqual(normalized, { bassDb: 9, filter: -1, space: 0.5, room: 'room', softClip: false });

  mem.set(FX_STORAGE, JSON.stringify({ bassDb: 4, filter: 0.25, space: 0.3, room: 'hall', softClip: true }));
  assert.deepEqual(readFxSettings(storage), { bassDb: 4, filter: 0.25, space: 0.3, room: 'hall', softClip: true });
  mem.set(FX_STORAGE, '{broken');
  assert.deepEqual(readFxSettings(storage), { ...DEFAULT_FX });
});

test('softClipCurve keeps unity slope within knee and saturates peaks smoothly', () => {
  const curve = softClipCurve(4097);
  const mid = 2048;
  assert.equal(curve[mid], 0);
  // 0.25 maps inside the linear region [-0.55, 0.55].
  const quarter = curve[mid + 512];
  assert.ok(Math.abs(quarter - 0.25) < 1e-6);
  assert.ok(curve[4096] > 0.85 && curve[4096] < 0.92);
  assert.ok(curve[0] < -0.85 && curve[0] > -0.92);
});

test('buildImpulseBuffer is deterministic per room and sampleRate', () => {
  const { context } = makeAudioContext();
  const a = buildImpulseBuffer(context, 'hall');
  const b = buildImpulseBuffer(context, 'hall');
  assert.equal(a, b);
  assert.equal(a.numberOfChannels, 2);
  assert.deepEqual(a.getChannelData(0).subarray(0, 64), b.getChannelData(0).subarray(0, 64));
  const cavern = buildImpulseBuffer(context, 'cavern');
  assert.ok(cavern.length > a.length);
});

test('createMasterFx bypasses heavy nodes at defaults, wires active chain, and tracks peak hold + clip reset', () => {
  const { context, samples } = makeAudioContext([0.25, -0.5]);
  const fx = createMasterFx(context, context.destination, DEFAULT_FX);
  assert.deepEqual(context.created.map((n) => n.kind), ['destination', 'gain']);
  assert.equal(fx.input.connections.has(context.destination), true);

  fx.update({ bassDb: 6, filter: -0.5, space: 0.35, room: 'room', softClip: true });
  const kinds = context.created.map((n) => n.kind);
  assert.ok(kinds.includes('biquad'));
  assert.ok(kinds.includes('convolver'));
  assert.ok(kinds.includes('shaper'));

  const p1 = fx.readPeak();
  assert.equal(p1.clipped, false);
  assert.ok(Math.abs(p1.peakHoldDb - 20 * Math.log10(0.5)) < 0.1);

  samples[0] = 1.05;
  const p2 = fx.readPeak();
  assert.equal(p2.clipped, true);

  samples[0] = 0.1;
  fx.resetPeakHold();
  const p3 = fx.readPeak();
  assert.equal(p3.clipped, false);
  assert.ok(Math.abs(p3.peakHoldDb - 20 * Math.log10(0.5)) < 0.1);

  fx.dispose();
  assert.equal(fx.input.connections.size, 0);
});

test('encodeWav produces valid RIFF/WAVE 16-bit PCM buffer', () => {
  const fakeBuffer = {
    numberOfChannels: 2,
    length: 2,
    sampleRate: 48000,
    getChannelData: (ch) => new Float32Array(ch === 0 ? [0, 1] : [-1, 0.5]),
  };
  const wav = encodeWav(fakeBuffer);
  const view = new DataView(wav);
  const tag = (off) =>
    String.fromCharCode(
      view.getUint8(off),
      view.getUint8(off + 1),
      view.getUint8(off + 2),
      view.getUint8(off + 3),
    );
  assert.equal(tag(0), 'RIFF');
  assert.equal(view.getUint32(4, true), 44);
  assert.equal(tag(8), 'WAVE');
  assert.equal(tag(12), 'fmt ');
  assert.equal(view.getUint32(24, true), 48000);
  assert.equal(tag(36), 'data');
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(view.getInt16(44, true), 0);
  assert.equal(view.getInt16(46, true), -32768);
  assert.equal(view.getInt16(48, true), 32767);
  assert.equal(view.getInt16(50, true), 16384);
});

test('LivePitch worklet schedule honors auto, punch and smooth pitch engine modes', async () => {
  let Processor;
  class MockWaveform {
    reset() {}
    setRate() {}
    process() {}
  }
  const wasm = {
    HEAP8: new Int8Array(65536),
    _main() {},
    _configure() {},
    _reset() {},
    _inputLatency: () => 256,
    _outputLatency: () => 128,
    _setBuffers: () => 0,
    _setTransposeSemitones() {},
    _setFormantSemitones() {},
    _setFormantBase() {},
    _process() {},
  };
  const scope = {
    sampleRate: 48000,
    Float32Array,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { postMessage() {} };
      }
    },
    registerProcessor: (_, cls) => {
      Processor = cls;
    },
    Module: async () => wasm,
    WaveformPitch: MockWaveform,
  };
  vm.runInNewContext(`(${registerLivePitch})(Module, WaveformPitch, 'live-test')`, scope);
  const processor = new Processor({ outputChannelCount: [2] });
  await new Promise((resolve) => setImmediate(resolve));

  processor.schedule({ active: true, semitones: -0.5, engine: 'auto' });
  assert.equal(processor.target, 0);
  processor.schedule({ active: true, semitones: -0.5, engine: 'punch' });
  assert.equal(processor.target, 1);
  processor.schedule({ active: true, semitones: -2, engine: 'smooth' });
  assert.equal(processor.target, 0);
  processor.schedule({ active: true, semitones: -2, engine: 'auto' });
  assert.equal(processor.target, 1);
  processor.schedule({ active: true, semitones: -5.5, engine: 'punch' });
  assert.equal(processor.target, 1);
  processor.schedule({ active: true, semitones: -5.5, engine: 'auto' });
  assert.equal(processor.target, 0);
});
