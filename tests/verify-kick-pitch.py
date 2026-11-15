"""Render the reported kick through the pinned WASM and real Web Audio graph."""
import json
import subprocess
from playwright.sync_api import sync_playwright
from userscript_fixture import ROOT, browser_options

bundle = subprocess.check_output([
    'node', '-p', "require('./tests/module-fixture.cjs')(['soundcloud/tempo-dependency.js','audio/pitch-quality.mjs'])"
], cwd=ROOT, text=True, encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(**browser_options(), headless=True)
    page = browser.new_page()
    page.route('https://test.invalid/', lambda route: route.fulfill(body='<html></html>', content_type='text/html'))
    page.goto('https://test.invalid/')
    page.add_script_tag(path=ROOT / "vendor/signalsmith/SignalsmithStretch.js")
    page.add_script_tag(content=bundle)
    bypass = page.evaluate("""async () => {
      const ctx = new OfflineAudioContext(2, 12288, 48000);
      const source = ctx.createBufferSource();
      const buffer = ctx.createBuffer(2, ctx.length, ctx.sampleRate);
      for (const [channel, gain] of [[0, 1.6], [1, 0.5]]) {
        const samples = buffer.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) samples[i] = gain * Math.sin(i / 23);
      }
      const output = createPitchOutput(ctx, ctx.destination, true);
      source.buffer = buffer;
      source.connect(output.input);
      source.start();
      const turnOff = ctx.suspend(4096 / ctx.sampleRate);
      const turnOn = ctx.suspend(8192 / ctx.sampleRate);
      const rendering = ctx.startRendering();
      await turnOff;
      output.setEnabled(false);
      await ctx.resume();
      await turnOn;
      output.setEnabled(true);
      await ctx.resume();
      const rendered = await rendering;
      return [0, 1].map(channel => {
        const samples = rendered.getChannelData(channel);
        const raw = buffer.getChannelData(channel);
        const peak = values => Math.max(...values.map(Math.abs));
        return {
          before: peak(samples.subarray(0, 4096)),
          bypass: peak(samples.subarray(4096, 8192)),
          after: peak(samples.subarray(8192)),
          maxBypassError: peak(samples.subarray(4096, 8192).map((v, i) => v - raw[i + 4096])),
        };
      });
    }""")
    hot, quiet = bypass
    assert .98 < hot['before'] < .99 and .98 < hot['after'] < .99, hot
    assert hot['bypass'] > 1.59 and quiet['bypass'] > .49, bypass
    assert hot['maxBypassError'] == quiet['maxBypassError'] == 0, bypass
    results = page.evaluate("""async () => {
      const rate = 48000;
      const frames = rate * 8;
      const hits = Array.from({ length: 10 }, (_, i) =>
        Math.round((0.55 + i * 0.53) * rate),
      );
      let seed = 5;
      const burst = Array.from({ length: 144 }, (_, i) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return 0.55 * (seed / 2147483648 - 1) * Math.sin((Math.PI * i) / 143) ** 2;
      });
      const input = new Float32Array(frames);
      for (const hit of hits) {
        for (let j = 0; j < rate * 0.275; j++) {
          const t = j / rate,
            phase = 2 * Math.PI * (52 * t + 238 * 0.02 * (1 - Math.exp(-t / 0.02)));
          input[hit + j] =
            (0.46 * Math.tanh(7 * Math.sin(phase)) + 0.35 * (burst[j] || 0)) *
            Math.exp(-t / 0.093) *
            Math.min(1, (rate * 0.275 - j) / 240);
        }
      }
      for (let i = rate * 5.7; i < frames; i++) {
        const hz = i < rate * 6.8 ? 440 : 55;
        input[i] = 0.16 * Math.sin((2 * Math.PI * hz * i) / rate);
      }
      // Measure the dominant tone; secondary harmonics can add extra zero crossings.
      function toneFrequency(pcm, start, expected) {
        let max = 0,
          best = 0;
        for (let hz = expected - 10; hz <= expected + 10; hz += 0.25) {
          let re = 0,
            im = 0;
          const omega = (2 * Math.PI * hz) / rate;
          for (let i = 0; i < rate * 0.6; i += 8) {
            const x = pcm[start + i] * (1 - Math.cos((2 * Math.PI * i) / (rate * 0.6)));
            re += x * Math.cos(omega * i);
            im += x * Math.sin(omega * i);
          }
          const power = re * re + im * im;
          if (power > max) {
            max = power;
            best = hz;
          }
        }
        const amplitude = (2 * Math.sqrt(max)) / ((rate * 0.6) / 8);
        if (amplitude < 0.05) throw new Error('Shifted test tone is missing');
        return best;
      }
      const rows = [];
      for (const shift of [-6, -3, -2, 0, 3, 6]) {
        for (const legacy of [true, false]) {
          const ctx = new OfflineAudioContext(2, frames, rate);
          const node = await (legacy ? SignalsmithStretch : createStretchNode)(ctx, {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
          });
          const timing = legacy ? { blockMs: 120, intervalMs: 30 } : pitchTiming;
          await node.configure({ ...timing, splitComputation: true });
          const delay = Math.round((await node.latency()) * rate);
          await node.schedule({ active: true, semitones: shift });
          const source = ctx.createBufferSource();
          source.buffer = ctx.createBuffer(2, frames, rate);
          source.buffer.copyToChannel(input, 0);
          // Stress the peak guard independently in the second channel.
          source.buffer.copyToChannel(
            input.map((x) => x * 1.5),
            1,
          );
          source
            .connect(node)
            .connect(
              legacy ? ctx.destination : createPitchOutput(ctx, ctx.destination, true).input,
            );
          source.start();
          const rendered = await ctx.startRendering();
          node.port.close();
          const pcm = rendered.getChannelData(0),
            pres = [],
            levels = [];
          for (const hit of hits) {
            let pre = 0,
              total = 0,
              peak = 0;
            for (let i = hit + delay - 7200; i < hit + delay + 18000; i++) {
              total += pcm[i] ** 2;
              if (i < hit + delay) pre += pcm[i] ** 2;
              peak = Math.max(peak, Math.abs(pcm[i]));
            }
            pres.push(pre / total);
            levels.push(peak);
          }
          const median = (a) => {
            a.sort((a, b) => a - b);
            return (a[4] + a[5]) / 2;
          };
          let wetPeak = 0;
          for (const v of rendered.getChannelData(1))
            wetPeak = Math.max(wetPeak, Math.abs(v));
          rows.push({
            shift,
            legacy,
            prePercent: median(pres) * 100,
            peak: median(levels),
            wetPeak,
            hz: toneFrequency(pcm, rate * 6 + delay, 440 * 2 ** (shift / 12)),
            bassHz: toneFrequency(pcm, rate * 7 + delay, 55 * 2 ** (shift / 12)),
          });
        }
      }
      return rows;
    }""")
    sustained = page.evaluate("""async () => {
      const rate = 48000, n = rate * 5;
      const ctx = new OfflineAudioContext(2, n, rate);
      const buffer = ctx.createBuffer(2, n, rate);
      for (let c = 0; c < 2; ++c) {
        const x = buffer.getChannelData(c);
        for (let i = 0; i < n; ++i) {
          const phase = 2 * Math.PI * 46 * i / rate;
          x[i] = (c ? -0.43 : 0.8) * Math.tanh(8 * (Math.sin(phase) + 0.22 * Math.sin(3 * phase + 0.9)));
        }
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 1.05;
      const node = await createStretchNode(ctx, {outputChannelCount: [2]});
      await node.configure({...pitchTiming, splitComputation: true});
      await node.schedule({active: true, semitones: -2});
      source.connect(node).connect(createPitchOutput(ctx, ctx.destination, false).input);
      source.start();
      const up = ctx.suspend(2.6), down = ctx.suspend(3.6);
      const rendering = ctx.startRendering();
      await up;
      await node.schedule({active: true, semitones: 3});
      await ctx.resume();
      await down;
      await node.schedule({active: true, semitones: -2});
      await ctx.resume();
      const out = await rendering;
      node.port.close();
      const left = out.getChannelData(0), right = out.getChannelData(1);
      let crossings = 0, stereoError = 0, maxCrest = 0;
      for (let start = rate / 2; start < rate * 2.5; start += 1920) {
        let peak = 0, power = 0;
        for (let i = start; i < start + 1920; ++i) {
          peak = Math.max(peak, Math.abs(left[i]));
          power += left[i] ** 2;
          stereoError = Math.max(stereoError, Math.abs(right[i] + 0.43 / 0.8 * left[i]));
          if (left[i] > 0 && left[i-1] <= 0) crossings++;
        }
        maxCrest = Math.max(maxCrest, 20 * Math.log10(peak / Math.sqrt(power / 1920)));
      }
      let minSwitchRms = Infinity;
      for (let start = 2.5 * rate; start < 4.6 * rate; start += 1920) {
        const power = left.subarray(start, start + 1920).reduce((sum, x) => sum + x*x, 0);
        minSwitchRms = Math.min(minSwitchRms, Math.sqrt(power / 1920));
      }
      return {frequency: crossings / 2, stereoError, maxCrest, minSwitchRms};
    }""")
    assert abs(sustained['frequency'] - 46 * 1.05 * 2 ** (-2 / 12)) < 1, sustained
    assert sustained['maxCrest'] < 1.5 and sustained['stereoError'] < 1e-5, sustained
    assert sustained['minSwitchRms'] > 0.25, sustained
    print('Sustained saturated kick, protection bypassed:', sustained)
    transitions = page.evaluate("""async () => {
      const rate = 48000, length = rate * 6;
      const ctx = new OfflineAudioContext(2, length, rate);
      const source = ctx.createBufferSource(), buffer = ctx.createBuffer(2, length, rate);
      for (let c = 0; c < 2; c++) {
        const samples = buffer.getChannelData(c);
        for (let i = 0; i < length; i++)
          samples[i] = 0.3 * Math.tanh(3 * Math.sin(2 * Math.PI * 53 * i / rate));
      }
      source.buffer = buffer;
      const node = await createStretchNode(ctx, {outputChannelCount: [2]});
      await node.configure({...pitchTiming, splitComputation: true});
      await node.schedule({active: true, semitones: -2});
      source.connect(node).connect(ctx.destination);
      source.start();
      const shifts = [-4, -4.5, -4, -1, -0.5, 0, 0.5, 0, -2];
      const stops = shifts.map((_, i) => ctx.suspend(1 + i * 0.4));
      const rendering = ctx.startRendering();
      for (let i = 0; i < stops.length; i++) {
        await stops[i];
        await node.schedule({active: true, semitones: shifts[i]});
        await ctx.resume();
      }
      const pcm = (await rendering).getChannelData(0);
      node.port.close();
      let minRms = Infinity;
      for (let start = rate; start < rate * 5; start += 960) {
        let power = 0;
        for (let i = start; i < start + 960; i++) power += pcm[i] ** 2;
        minRms = Math.min(minRms, Math.sqrt(power / 960));
      }
      return {minRms};
    }""")
    assert transitions['minRms'] > 0.08, transitions
    print('Range and zero transitions:', transitions)
    browser.close()

for before, after in zip(results[::2], results[1::2]):
    print(json.dumps([before, after]))
    shift = after['shift']
    assert after['wetPeak'] <= .99001, after
    assert abs(after['hz'] - 440 * 2**(shift/12)) <= 1.5, after
    assert abs(after['bassHz'] - 55 * 2**(shift/12)) <= .8, after
    if shift:
        assert after['prePercent'] < before['prePercent'], (before, after)
    else:
        assert abs(after['peak'] - before['peak']) < 1e-4, (before, after)
    if shift == 3:
        assert before['peak'] > 1 and after['peak'] < 1, (before, after)
