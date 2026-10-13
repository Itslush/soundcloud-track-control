// Diagnostic only: compare callback-cost distribution for the shipped WASM,
// not phone performance, audible dropouts, or end-to-end browser scheduling.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const source = fs.readFileSync(
  'vendor/signalsmith/SignalsmithStretch.js',
  'utf8',
);
const crypto = require('node:crypto');
const rate = 48000;
const quantum = 128;
const rounds = process.argv.includes('--profile') ? 1 : 5;
const frames = 8192;
const warmup = 1024;
async function run(splitComputation) {
  let Processor;
  const scope = vm.createContext({
    console,
    WebAssembly,
    atob,
    setTimeout,
    clearTimeout,
    sampleRate: rate,
    currentTime: 0,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { postMessage() {} };
      }
    },
    registerProcessor(name, value) {
      Processor = value;
    },
  });
  vm.runInContext(source, scope);
  const processor = new Processor({
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  for (let n = 0; !processor.wasmReady && n < 1000; n++)
    await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(processor.wasmReady, true);
  const send = (method, value) =>
    processor.port.onmessage({ data: [0, method, value] });
  send('configure', { blockMs: 120, intervalMs: 30, splitComputation });
  send('schedule', { active: true, semitones: -6.5 });
  const input = [new Float32Array(quantum), new Float32Array(quantum)];
  const output = [new Float32Array(quantum), new Float32Array(quantum)];
  const inputs = [input],
    outputs = [output];
  const timings = new Float64Array(frames);
  let squares = 0,
    crosses = 0,
    previous = 0,
    finite = 0;
  for (let block = 0; block < warmup + frames; block++) {
    scope.currentTime = (block * quantum) / rate;
    for (let i = 0; i < quantum; i++) {
      const t = (block * quantum + i) / rate;
      input[0][i] = 0.15 * Math.sin(t * 440 * 2 * Math.PI);
      input[1][i] = 0.12 * Math.sin(t * 660 * 2 * Math.PI);
    }
    const started = performance.now();
    const keep = processor.process(inputs, outputs, {});
    const elapsed = performance.now() - started;
    assert.equal(keep, true);
    if (block < warmup) continue;
    timings[block - warmup] = elapsed;
    for (const channel of output)
      for (const value of channel) {
        assert.ok(Number.isFinite(value));
        squares += value * value;
        finite++;
      }
    for (const value of output[0]) {
      if (previous <= 0 && value > 0) crosses++;
      previous = value;
    }
  }
  const frequency = (crosses * rate) / (frames * quantum);
  const expectedHz = 440 * 2 ** (-6.5 / 12);
  assert.ok(
    Math.abs(frequency - expectedHz) < 3,
    `${frequency} != ${expectedHz}`,
  );
  const sorted = [...timings].sort((a, b) => a - b);
  const p = (percentile) =>
    sorted[Math.floor((sorted.length - 1) * percentile)];
  return {
    splitComputation,
    frames,
    finiteSamples: finite,
    errors: 0,
    frequency,
    expectedHz,
    rms: Math.sqrt(squares / finite),
    meanMs: sorted.reduce((a, b) => a + b, 0) / frames,
    p50Ms: p(0.5),
    p95Ms: p(0.95),
    p99Ms: p(0.99),
    maxMs: p(1),
    exceedsQuantum: sorted.filter((ms) => ms > (quantum / rate) * 1000).length,
  };
}
(async () => {
  const runs = [];
  for (let i = 0; i < rounds; i++)
    for (const split of [false, true]) {
      const result = await run(split);
      runs.push(result);
      console.log(JSON.stringify({ round: i + 1, ...result }));
    }
  const report = {
    scope:
      'Node VM executing exact vendor processor/WASM; not a real-time browser or phone test',
    sha256: crypto.createHash('sha256').update(source).digest('hex'),
    rate,
    quantum,
    budgetMs: (quantum / rate) * 1000,
    warmup,
    runs,
  };
  if (!process.argv.includes('--profile'))
    fs.writeFileSync(
      'test-results/dsp-callback-cost.json',
      JSON.stringify(report, null, 2),
    );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
