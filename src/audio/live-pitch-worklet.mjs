export function registerLivePitch(Module, Waveform, name) {
  class LivePitch extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.channels = options.outputChannelCount[0];
      Module()
        .then((wasm) => {
          this.wasm = wasm;
          wasm._main();
          this.port.onmessage = ({ data: [id, method, arg] }) => {
            try {
              let value;
              if (method === 'configure') this.configure(arg);
              if (method === 'latency') value = this.delay / sampleRate;
              if (method === 'schedule') this.schedule(arg);
              this.port.postMessage([id, value]);
            } catch (error) {
              this.port.postMessage([id, null, error.message]);
            }
          };
          this.port.postMessage(['ready']);
        })
        .catch((error) =>
          this.port.postMessage(['ready', null, error.message]),
        );
    }

    configure({ blockMs, intervalMs, splitComputation }) {
      const wasm = this.wasm;
      wasm._configure(
        this.channels,
        Math.round((sampleRate * blockMs) / 1000),
        Math.round((sampleRate * intervalMs) / 1000),
        splitComputation,
      );
      wasm._reset();
      this.delay = wasm._inputLatency() + wasm._outputLatency();
      const pointer = wasm._setBuffers(this.channels, this.delay);
      const memory = wasm.HEAP8.buffer;
      this.buffers = Array.from(
        { length: this.channels * 2 },
        (_, c) =>
          new Float32Array(memory, pointer + c * this.delay * 4, this.delay),
      );
      this.wave = new Waveform(sampleRate, this.delay);
      this.active = false;
      this.blend = 0;
      this.warmup = 0;
      this.ratio = 1;
      this.semitones = 0;
      this.wasmIdle = false;
      this.fadeFrames = Math.round(sampleRate * 0.012);
    }

    schedule({ active, semitones = 0 }) {
      // Larger intervals and upward shifts retain the spectral engine's anti-aliasing.
      this.semitones = semitones;
      this.target = active && semitones <= -1 && semitones >= -4 ? 1 : 0;
      if (this.target || (active && this.blend > 0))
        this.ratio = 2 ** (Math.min(0, semitones) / 12);
      this.wasm._setTransposeSemitones(semitones, 8000 / sampleRate);
      if (!this.active) this.blend = this.target;
      this.active = active;
    }

    process(inputs, outputs) {
      const out = outputs[0];
      if (!this.active || !out?.length) return true;
      const input = inputs[0],
        count = out[0].length;
      const needWave = this.target || this.blend > 0;
      this.wave.process(input, out, needWave ? this.ratio : 0);
      if (this.target && this.blend === 1) {
        this.wasmIdle = true;
        this.warmup = this.delay;
        return true;
      }
      if (this.wasmIdle) {
        this.wasm._reset();
        this.wasm._setTransposeSemitones(this.semitones, 8000 / sampleRate);
        this.wasmIdle = false;
      }
      for (let c = 0; c < this.channels; c++) {
        const source = input[c] ?? input[0];
        if (source) this.buffers[c].set(source);
        else this.buffers[c].fill(0, 0, count);
      }
      this.wasm._process(count, count);
      for (let i = 0; i < count; ++i) {
        if (this.warmup > 0) this.warmup--;
        else if (this.target)
          this.blend = Math.min(1, this.blend + 1 / this.fadeFrames);
        else this.blend = Math.max(0, this.blend - 1 / this.fadeFrames);
        const waveGain =
          this.blend === 0
            ? 0
            : this.blend === 1
              ? 1
              : Math.sin((this.blend * Math.PI) / 2);
        const spectralGain =
          this.blend === 0
            ? 1
            : this.blend === 1
              ? 0
              : Math.cos((this.blend * Math.PI) / 2);
        for (let c = 0; c < this.channels; c++) {
          out[c][i] =
            spectralGain * this.buffers[c + this.channels][i] +
            waveGain * out[c][i];
        }
      }
      return true;
    }
  }
  registerProcessor(name, LivePitch);
}
