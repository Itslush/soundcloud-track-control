import {
  DEFAULT_FX,
  isDefaultFx,
  readFxSettings,
  readPitchEngine,
} from '../audio/master-fx.mjs';
import { createPitchOutput, pitchTiming } from '../audio/pitch-quality.mjs';
import {
  applyFxUpdate,
  createBassSwapFilters,
  ensureMasterFx,
  readDspSnapshot,
} from './wasm-master-bus.js';

export function createWasmAudio({
  audioModules,
  outputLevel,
  seekOutput = () => null,
  createStretchNode,
  preservesKey,
  readKeyShift = () => 0,
  readUseWasm,
  readPitchEngine: readEngine = () => readPitchEngine(),
  readFx = () => readFxSettings(),
  peakProtection = true,
  references,
  updateAll,
  apply,
  discover,
  onGraphReady,
}) {
  if (!window.AudioContext || !window.AudioNode)
    return {
      sync: () => false,
      keepsZero: () => false,
      setPeakProtection() {},
      setFx: () => ({ ...DEFAULT_FX }),
      dspSnapshot: () => ({
        engine: readEngine(),
        mode: 'bypass',
        sampleRate: 0,
        latencyMs: 0,
        peakDb: -96,
        peakHoldDb: -96,
        clipped: false,
        active: false,
      }),
      resetPeakHold() {},
      active: () => false,
      hasGraph: () => false,
      crossfadeReady: () => false,
      acquireBuffered() {
        throw new Error('Web Audio is unavailable.');
      },
      label: () =>
        preservesKey()
          ? 'Browser fallback · Web Audio is unavailable.'
          : 'Natural pitch follows speed.',
    };
  let currentFx = readFx();
  const routes = new WeakMap();
  const connect = AudioNode.prototype.connect;
  const disconnect = AudioNode.prototype.disconnect;
  const create = AudioContext.prototype.createMediaElementSource;
  const states = new WeakMap();
  const overlapOutputs = new Set();
  const fadeOutCurve = Float32Array.from({ length: 65 }, (_, i) =>
    i === 64 ? 0 : Math.cos((i / 64) * Math.PI * 0.5),
  );
  const fadeInCurve = Float32Array.from({ length: 65 }, (_, i) =>
    i === 64 ? 1 : Math.sin((i / 64) * Math.PI * 0.5),
  );

  function rampCurve(param, curve, start, duration) {
    if (duration > 0 && typeof param.setValueCurveAtTime === 'function') {
      param.setValueCurveAtTime(curve, start, duration);
      return;
    }
    param.setValueAtTime(curve[0], start);
    param.linearRampToValueAtTime(curve[curve.length - 1], start + duration);
  }

  function gains(state, wet) {
    if (state.active === wet) return;
    const starting = wet && !state.active;
    state.active = wet;
    state.wet.gain.cancelScheduledValues(state.source.context.currentTime);
    state.dry.gain.cancelScheduledValues(state.source.context.currentTime);
    if (starting) {
      const now = state.source.context.currentTime;
      const inputDelay = Math.max(0, state.latency - (now - state.flushAt));
      const wetDelay = inputDelay + state.latency;
      const fade = Math.min(0.005, state.latency);
      state.activeAt = now + wetDelay;
      if (state.muteDry) {
        state.dry.gain.setValueAtTime(0, now);
        state.muteDry = false;
      } else {
        state.dry.gain.setValueAtTime(1, now);
        state.dry.gain.setValueAtTime(1, now + wetDelay);
        state.dry.gain.linearRampToValueAtTime(0, now + wetDelay + 0.01);
      }
      state.input.gain.cancelScheduledValues(now);
      state.input.gain.setValueAtTime(0, now);
      if (inputDelay > 0) state.input.gain.setValueAtTime(0, now + inputDelay);
      state.input.gain.linearRampToValueAtTime(1, now + inputDelay + fade);
      state.wet.gain.setValueAtTime(0, now);
      state.wet.gain.setValueAtTime(0, now + wetDelay);
      state.wet.gain.linearRampToValueAtTime(1, now + wetDelay + 0.01);
    } else {
      state.activeAt = 0;
      state.dry.gain.value = state.muteDry ? 0 : 1;
      state.wet.gain.value = 0;
    }
  }

  function clear(state) {
    const connected = state.connected;
    state.epoch++;
    gains(state, false);
    if (state.muteDry) {
      state.dry.gain.cancelScheduledValues(state.source.context.currentTime);
      state.dry.gain.value = 0;
    } else if (!state.active && state.dry.gain.value !== 1) {
      state.dry.gain.cancelScheduledValues(state.source.context.currentTime);
      state.dry.gain.value = 1;
    }
    state.input.gain.cancelScheduledValues(state.source.context.currentTime);
    state.input.gain.value = 0;
    state.needsReset = true;
    state.applied = null;
    if (state.node && connected) {
      try {
        state.input.disconnect(state.node);
      } catch {}
      state.node.disconnect();
      state.connected = false;
    }
    if (!connected || state.failed || state.stopping) return;
    state.stopping = stop(state.node)
      .catch((error) => fail(state, error))
      .finally(() => {
        state.stopping = null;
      });
  }

  async function stop(node) {
    await timed(node.schedule({ active: false }));
  }

  function retire(state) {
    state.failed = true;
    state.muteDry = false;
    clear(state);
    if (!state.node) return;
    state.node.disconnect();
    state.node.port.close();
    state.node = null;
  }

  function fail(state, error) {
    if (state.failed) return;
    retire(state);
    console.warn(
      '[SoundCloud Tempo] WASM unavailable; browser fallback.',
      error,
    );
    updateAll();
  }

  function ready(state, epoch) {
    const audio = state.audio.deref();
    return (
      epoch === state.epoch &&
      !state.buffered &&
      !state.failed &&
      state.wanted &&
      audio &&
      !audio.paused &&
      !audio.seeking &&
      state.source.context.state !== 'closed'
    );
  }

  async function timed(promise) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('WASM processor timed out')),
            6000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function prepare(state) {
    if (state.loading || state.failed || state.buffered) return;
    state.loading = true;
    const epoch = state.epoch;
    try {
      if (!state.node) {
        const pending = createStretchNode(state.source.context, {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        pending.then(
          (node) => {
            if (state.failed || state.source.context.state === 'closed') {
              node.disconnect();
              node.port.close();
              return;
            }
            state.node = node;
            const reference = new WeakRef(state);
            node.addEventListener('processorerror', () => {
              const current = reference.deref();
              if (current?.node === node)
                fail(current, new Error('WASM processor stopped'));
            });
          },
          () => {},
        );
        await timed(pending);
      }
      if (!ready(state, epoch)) return;
      if (state.stopping) await state.stopping;
      if (!ready(state, epoch)) return;
      const node = state.node;
      if (state.needsReset) {
        await timed(node.configure({ ...pitchTiming, splitComputation: true }));
        state.latency = await timed(node.latency());
        if (!ready(state, epoch)) return;
        if (!Number.isFinite(state.latency) || state.latency < 0)
          throw new Error('WASM processor returned invalid latency');
        state.needsReset = false;
        state.input.connect(node);
        state.connected = true;
        state.pitchOutput ??= createPitchOutput(
          state.source.context,
          state.wet,
          peakProtection,
        );
        node.connect(state.pitchOutput.input);
      }
      while (ready(state, epoch)) {
        const speed = state.speed;
        const semitones = state.semitones;
        const engine = readEngine();
        await timed(node.schedule({ active: true, semitones, engine }));
        if (!ready(state, epoch)) return;
        if (
          speed !== state.speed ||
          semitones !== state.semitones ||
          engine !== readEngine()
        )
          continue;
        state.applied = semitones;
        state.engine = engine;
        gains(state, true);
        return;
      }
    } catch (error) {
      fail(state, error);
    } finally {
      state.loading = false;
      updateAll();
    }
  }

  function sync(audio, enabled, speed) {
    const state = states.get(audio);
    if (!state) return false;
    state.speed = speed;
    state.preserve = preservesKey();
    state.semitones =
      readKeyShift() - (state.preserve ? 12 * Math.log2(speed) : 0);
    const wanted =
      enabled && (speed !== 1 || state.semitones !== 0 || state.connected);
    const changed = state.wanted !== wanted;
    state.wanted = wanted;
    if (state.buffered) return false;
    if (!wanted || audio.seeking || audio.paused) {
      if (!wanted) state.muteDry = false;
      if (
        changed ||
        state.connected ||
        state.active ||
        (!wanted && state.dry.gain.value !== 1)
      )
        clear(state);
      return false;
    }
    if (state.failed || state.source.context.state === 'closed') return false;
    if (
      !state.active &&
      state.needsReset &&
      !state.muteDry &&
      Number.isFinite(audio.currentTime) &&
      audio.currentTime < 0.25
    ) {
      state.muteDry = true;
      state.dry.gain.cancelScheduledValues(state.source.context.currentTime);
      state.dry.gain.value = 0;
    }
    if (
      state.needsReset ||
      state.applied !== state.semitones ||
      state.engine !== readEngine()
    )
      prepare(state);
    return state.active;
  }

  function bufferedHooks(state, name, command) {
    const owner = state.buffered;
    if (!owner)
      throw new DOMException('Buffered ownership ended', 'AbortError');
    if (name === 'restoreNative') clear(state);
    return owner.hooks[name](command);
  }

  function makeGate(state) {
    const context = state.source.context;
    const nativeMix = context.createGain();
    const reference = state.audio;
    const audio = () => {
      const current = reference.deref();
      if (!current) throw new Error('Audio element is unavailable.');
      return current;
    };
    let gate;
    try {
      gate = audioModules.createPlaybackGate({
        context,
        nativeInput: nativeMix,
        destination: state.output,
        levels: {
          read: () => outputLevel.readLevel(audio()),
          subscribe: (callback) =>
            outputLevel.subscribeLevel(audio(), callback),
        },
        parkNative: (command) => bufferedHooks(state, 'parkNative', command),
        restoreNative: (command) =>
          bufferedHooks(state, 'restoreNative', command),
      });
      return { gate, nativeMix };
    } catch (error) {
      try {
        disconnect.call(nativeMix);
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          'Buffered route allocation failed',
        );
      }
      throw error;
    }
  }

  function moveNative(state, nativeMix) {
    const changed = [];
    const previous = state.fade || state.output;
    try {
      for (const node of [state.dry, state.wet]) {
        changed.push({ node, removed: false });
        connect.call(node, nativeMix);
      }
      for (const entry of changed) {
        entry.removed = true;
        disconnect.call(entry.node, previous);
      }
    } catch (error) {
      const errors = [error];
      for (const { node, removed } of changed) {
        try {
          disconnect.call(node, nativeMix);
        } catch (cleanup) {
          errors.push(cleanup);
        }
        if (!removed) continue;
        try {
          connect.call(node, previous);
        } catch (cleanup) {
          errors.push(cleanup);
        }
      }
      if (errors.length > 1)
        throw new AggregateError(
          errors,
          'Native audio route restoration failed',
        );
      throw error;
    }
  }

  function acquireBuffered(audio, hooks) {
    const state = states.get(audio);
    if (!state || state.source.context.state === 'closed')
      throw new Error('An active native audio graph is required.');
    if (
      !hooks ||
      typeof hooks.parkNative !== 'function' ||
      typeof hooks.restoreNative !== 'function'
    )
      throw new TypeError('Native ownership hooks are required.');
    if (state.buffered)
      throw new Error('Buffered playback already has an owner.');
    const owner = {
      hooks: {
        parkNative: hooks.parkNative,
        restoreNative: hooks.restoreNative,
      },
      releasePromise: null,
    };
    state.buffered = owner;
    let created;
    let lease;
    try {
      if (!state.gate) created = makeGate(state);
      const gate = state.gate || created.gate;
      lease = gate.acquire();
      state.muteDry = false;
      clear(state);
      if (created) {
        moveNative(state, created.nativeMix);
        state.gate = created.gate;
        state.nativeMix = created.nativeMix;
      }
    } catch (error) {
      state.buffered = null;
      try {
        created?.gate.dispose();
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          'Buffered route allocation failed',
        );
      }
      throw error;
    }
    return Object.freeze({
      context: state.source.context,
      input: lease.input,
      ready: lease.ready,
      release(position, options) {
        if (owner.releasePromise) return owner.releasePromise;
        const result = lease.release(position, options);
        owner.releasePromise = result
          .then((snapshot) => {
            if (state.buffered === owner) state.buffered = null;
            return snapshot;
          })
          .catch((error) => {
            owner.releasePromise = null;
            throw error;
          });
        owner.releasePromise.catch(() => {});
        return owner.releasePromise;
      },
    });
  }

  function crossfadeReady(audio, { preserve, shift, rate }) {
    const state = states.get(audio);
    return Boolean(
      state &&
        state.source.context.state === 'running' &&
        !state.buffered &&
        !state.loading &&
        !state.stopping &&
        (!(shift || (preserve && rate !== 1)) ||
          (state.active &&
            state.source.context.currentTime >= (state.activeAt || 0))),
    );
  }

  function fadeNode(state) {
    if (state.gate) return state.nativeMix;
    if (!state.fade) {
      const fade = state.source.context.createGain();
      connect.call(fade, state.output);
      try {
        moveNative(state, fade);
      } catch (error) {
        disconnect.call(fade);
        throw error;
      }
      state.fade = fade;
    }
    return state.fade;
  }

  async function prepareIncoming(audio, buffer, settings, { signal }) {
    signal.throwIfAborted();
    const { rate, preserve, shift } = settings;
    if (
      !Number.isFinite(rate) ||
      rate < 0.25 ||
      rate > 4 ||
      !Number.isFinite(shift) ||
      Math.abs(shift) > 24
    )
      throw new Error('Unsupported incoming tempo or pitch.');
    const sampleRate = states.get(audio).source.context.sampleRate;
    const duration = buffer.duration / rate;
    const frames = Math.ceil((duration + 1) * sampleRate);
    if (frames * 8 > 32 * 1024 * 1024)
      throw new Error('The incoming crossfade buffer is too large.');
    const offline = new OfflineAudioContext(2, frames, sampleRate);
    const input = offline.createBufferSource();
    input.buffer = buffer;
    input.playbackRate.value = rate;
    let processor;
    let latency = 0;
    try {
      const semitones = shift - (preserve ? 12 * Math.log2(rate) : 0);
      if (semitones) {
        processor = await timed(
          createStretchNode(offline, {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
          }),
        );
        await timed(
          processor.configure({
            ...pitchTiming,
            splitComputation: false,
          }),
        );
        latency = await timed(processor.latency());
        if (!Number.isFinite(latency) || latency < 0 || latency > 1)
          throw new Error('Unsupported pitch processor latency.');
        await timed(
          processor.schedule({ active: true, semitones, engine: readEngine() }),
        );
        input.connect(processor).connect(offline.destination);
      } else input.connect(offline.destination);
      signal.throwIfAborted();
      input.start();
      const rendered = await timed(offline.startRendering());
      signal.throwIfAborted();
      const result = offline.createBuffer(
        2,
        Math.floor(duration * sampleRate),
        sampleRate,
      );
      const start = Math.round(latency * sampleRate);
      for (let channel = 0; channel < 2; channel++)
        result.copyToChannel(
          rendered
            .getChannelData(channel)
            .subarray(start, start + result.length),
          channel,
        );
      return { buffer: result, shifted: Boolean(processor) };
    } finally {
      input.disconnect();
      processor?.disconnect();
      processor?.port.close();
    }
  }

  function beginCrossfade(
    audio,
    buffer,
    offset,
    rate,
    seconds,
    opening,
    bypassHostFade = false,
    options = {},
  ) {
    const state = states.get(audio);
    if (
      !state ||
      state.buffered ||
      state.loading ||
      state.stopping ||
      state.source.context.state !== 'running' ||
      !Number.isFinite(offset) ||
      offset < 0 ||
      !Number.isFinite(rate) ||
      rate < 0.25 ||
      rate > 4 ||
      !Number.isFinite(seconds) ||
      seconds <= 0 ||
      seconds > 10 ||
      (opening !== null &&
        (!Number.isFinite(opening?.buffer?.duration) ||
          opening.buffer.duration < seconds ||
          opening.buffer.duration > 19))
    )
      throw new Error(
        'The player audio connection is not ready for crossfade.',
      );
    const context = state.source.context;
    const seekDestination =
      bypassHostFade && seekOutput(audio, context, state.source);
    const destination = seekDestination || state.output;
    const nativeFade = fadeNode(state);
    const tail = context.createBufferSource();
    const level = context.createGain();
    const envelope = context.createGain();
    const head = opening && context.createBufferSource();
    const headEnvelope = opening && context.createGain();
    const headLevel = opening && context.createGain();
    const { outHpf, headHpf } = createBassSwapFilters(
      context,
      options?.bassSwap,
      opening,
      context.currentTime,
      seconds,
    );
    let processor = null;
    let unsubscribe;
    let levelAudio;
    let closed = false;
    const incoming = new Set([state]);
    const outputs = [];
    function pitchInput(destination) {
      const output = createPitchOutput(context, destination, peakProtection);
      outputs.push(output);
      overlapOutputs.add(output);
      return output.input;
    }
    const now = context.currentTime;
    function followLevel(target) {
      if (target === levelAudio) return;
      unsubscribe?.();
      unsubscribe = outputLevel.subscribeLevel(
        target,
        ({ volume, muted, outputDb }) => {
          level.gain.value = muted ? 0 : volume * 10 ** (outputDb / 20);
          if (headLevel) headLevel.gain.value = level.gain.value;
        },
      );
      levelAudio = target;
    }
    function restore(target) {
      const fade = target.nativeMix || target.fade;
      if (!fade || target.source.context.state === 'closed') return;
      fade.gain.cancelScheduledValues(target.source.context.currentTime);
      fade.gain.setValueAtTime(1, target.source.context.currentTime);
    }
    function dispose() {
      if (closed) return;
      closed = true;
      for (const output of outputs) overlapOutputs.delete(output);
      unsubscribe?.();
      try {
        tail.stop();
      } catch {}
      try {
        head?.stop();
      } catch {}
      for (const node of [
        tail,
        head,
        headEnvelope,
        headLevel,
        level,
        envelope,
        outHpf,
        headHpf,
        processor,
      ]) {
        try {
          if (node) disconnect.call(node);
        } catch {}
      }
      processor?.port.close();
      for (const target of incoming) restore(target);
    }
    try {
      tail.buffer = buffer;
      if (head) head.buffer = opening.buffer;
      tail.playbackRate.value = rate;
      tail.connect(level);
      if (outHpf) envelope.connect(outHpf).connect(destination);
      else envelope.connect(destination);
      followLevel(audio);
      // Both streams follow the same master volume, without double-applying the outgoing pitch processor.
      if (head) {
        head.connect(opening.shifted ? pitchInput(headEnvelope) : headEnvelope);
        if (headHpf)
          headEnvelope.connect(headHpf).connect(headLevel).connect(state.output);
        else headEnvelope.connect(headLevel).connect(state.output);
      }
      // Keep the outgoing processor's history while the native player loads a new track.
      if (state.active && state.node) {
        processor = state.node;
        disconnect.call(state.input, processor);
        disconnect.call(processor);
        level.connect(processor);
        processor.connect(pitchInput(envelope));
        processor.addEventListener('processorerror', dispose, { once: true });
        state.node = null;
        state.connected = false;
        state.active = false;
        state.activeAt = 0;
        state.applied = null;
        state.needsReset = true;
        state.input.gain.cancelScheduledValues(now);
        state.input.gain.value = 0;
        state.wet.gain.cancelScheduledValues(now);
        state.wet.gain.value = 0;
        state.dry.gain.cancelScheduledValues(now);
        state.dry.gain.value = 1;
      } else level.connect(envelope);
      nativeFade.gain.cancelScheduledValues(now);
      nativeFade.gain.setValueAtTime(nativeFade.gain.value, now);
      nativeFade.gain.linearRampToValueAtTime(0, now + 0.008);
      rampCurve(envelope.gain, fadeOutCurve, now, seconds);
      if (headEnvelope) rampCurve(headEnvelope.gain, fadeInCurve, now, seconds);
      tail.start(now, offset);
      tail.stop(now + seconds);
      head?.start(now);
    } catch (error) {
      dispose();
      throw error;
    }
    return {
      endTime: now + (opening?.buffer.duration ?? seconds),
      overlapEnd: now + seconds,
      startedAt: now,
      context,
      valid() {
        return (
          !seekDestination ||
          seekOutput(audio, context, state.source) === seekDestination
        );
      },
      silence(target) {
        const next = states.get(target);
        if (!next || closed) return false;
        followLevel(target);
        if (!incoming.has(next)) {
          fadeNode(next).gain.setValueAtTime(
            0,
            next.source.context.currentTime,
          );
          incoming.add(next);
        }
        return true;
      },
      position() {
        return Math.max(0, context.currentTime - now);
      },
      nativePosition(target) {
        const next = states.get(target);
        const compensating =
          next?.active &&
          next.source.context.currentTime >= (next.activeAt || 0);
        return (
          target.currentTime -
          (compensating ? next.latency * target.playbackRate : 0)
        );
      },
      fadeIn(target, duration = 0.04) {
        if (!this.silence(target)) return false;
        const next = states.get(target);
        const at = next.source.context.currentTime;
        const fade = fadeNode(next);
        fade.gain.cancelScheduledValues(at);
        rampCurve(fade.gain, fadeInCurve, at, duration);
        const time = context.currentTime;
        if (headEnvelope) {
          headEnvelope.gain.cancelScheduledValues(time);
          rampCurve(headEnvelope.gain, fadeOutCurve, time, duration);
        }
        this.endTime = time + duration;
        return true;
      },
      dispose,
    };
  }

  AudioContext.prototype.createMediaElementSource = function (audio) {
    const source = create.call(this, audio);
    if (!(audio instanceof HTMLAudioElement)) return source;
    const dry = this.createGain(),
      wet = this.createGain(),
      input = this.createGain(),
      output = this.createGain(),
      boost = this.createGain();
    wet.gain.value = 0;
    input.gain.value = 0;
    connect.call(source, boost);
    boost.connect(dry);
    boost.connect(input);
    const stopBoost = outputLevel.subscribeLevel(audio, ({ outputDb }) => {
      boost.gain.value = 10 ** (Math.max(0, outputDb) / 20);
    });
    dry.connect(output);
    wet.connect(output);
    const state = {
      source,
      input,
      dry,
      wet,
      output,
      fxOut: null,
      masterFx: null,
      sinks: [],
      audio: new WeakRef(audio),
      epoch: 0,
      latency: 0,
      flushAt: -Infinity,
      muteDry: false,
      active: false,
      failed: false,
      connected: false,
      loading: false,
      needsReset: true,
    };
    states.set(audio, state);
    routes.set(source, state);
    if (!isDefaultFx(currentFx))
      ensureMasterFx(state, currentFx, connect, disconnect);
    audio.addEventListener('pause', () => clear(state));
    for (const event of ['seeking', 'emptied', 'loadstart', 'ended']) {
      audio.addEventListener(event, () => {
        state.flushAt = state.source.context.currentTime;
        state.muteDry = Boolean(state.wanted && !state.failed && !state.buffered);
        clear(state);
      });
    }
    const reference = new WeakRef(state);
    const close = () => {
      if (this.state !== 'closed') return;
      stopBoost();
      const current = reference.deref();
      if (current) {
        try {
          current.gate?.dispose();
        } catch (error) {
          console.warn(error);
        }
        current.buffered = null;
        try {
          current.masterFx?.dispose();
        } catch {}
        retire(current);
      }
      this.removeEventListener('statechange', close);
    };
    this.addEventListener('statechange', close);
    audio.addEventListener('seeked', () => {
      state.flushAt = state.source.context.currentTime;
      apply(audio);
    });
    discover(audio);
    onGraphReady(audio);
    return source;
  };
  AudioNode.prototype.connect = function (...args) {
    const routed = routes.get(this);
    if (!routed) return connect.apply(this, args);
    if (args[0]) routed.sinks.push({ target: args[0], args });
    return connect.apply(routed.fxOut || routed.output, args);
  };
  AudioNode.prototype.disconnect = function (...args) {
    const routed = routes.get(this);
    if (!routed) return disconnect.apply(this, args);
    if (!args.length) routed.sinks.length = 0;
    else routed.sinks = routed.sinks.filter((sink) => sink.target !== args[0]);
    return disconnect.apply(routed.fxOut || routed.output, args);
  };

  return {
    sync,
    setPeakProtection(enabled) {
      if (peakProtection === enabled) return;
      peakProtection = enabled;
      for (const reference of references) {
        states.get(reference.deref())?.pitchOutput?.setEnabled(enabled);
      }
      for (const output of overlapOutputs) output.setEnabled(enabled);
    },
    setFx(nextFx) {
      currentFx = applyFxUpdate(nextFx, {
        references,
        states,
        connect,
        disconnect,
      });
      return currentFx;
    },
    dspSnapshot: (audio) =>
      readDspSnapshot(audio, {
        references,
        states,
        readEngine,
        currentFx,
        connect,
        disconnect,
      }),
    resetPeakHold() {
      for (const reference of references) {
        states.get(reference.deref())?.masterFx?.resetPeakHold();
      }
    },
    crossfadeReady,
    beginCrossfade,
    prepareIncoming,
    contextFor: (audio) => states.get(audio)?.source.context,
    acquireBuffered,
    hasGraph: (audio) => {
      const state = states.get(audio);
      return Boolean(state && state.source.context.state !== 'closed');
    },
    active: (audio) => Boolean(states.get(audio)?.active),
    keepsZero: (audio) =>
      Boolean(states.get(audio)?.connected && !states.get(audio)?.preserve),
    label: () => {
      const shift = readKeyShift();
      if (!preservesKey() && !shift) return 'Natural pitch follows speed.';
      if (!readUseWasm() && !shift) return 'Browser pitch preservation.';
      let paused = false;
      for (const reference of references) {
        const audio = reference.deref();
        if (!audio) continue;
        if (audio.paused) {
          paused = true;
          continue;
        }
        const state = states.get(audio);
        if (state?.speed === 1 && !shift) return 'Original pitch at 1×.';
        if (state?.active)
          return shift
            ? `Key shift ${shift > 0 ? '+' : ''}${shift} semitones.`
            : 'Pitch preservation active.';
        if (state?.loading)
          return preservesKey()
            ? 'Loading WASM · browser correction until ready.'
            : 'Loading WASM pitch shifter…';
        if (state?.failed)
          return shift
            ? 'Key shift unavailable. Reload to retry.'
            : 'WASM unavailable · browser fallback. Reload to retry.';
      }
      if (paused)
        return shift
          ? 'Key shift selected · playback paused.'
          : 'Preserve key selected · playback paused.';
      if (shift)
        return 'Key shift needs a player audio connection. Reload SoundCloud if already playing.';
      return 'Browser fallback · WASM needs a player audio connection. Reload if already playing.';
    },
  };
}
