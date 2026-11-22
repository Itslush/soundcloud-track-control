const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');

const source = require('./module-fixture.cjs')(['soundcloud/tempo-wasm.js']);
const settle = async () => {
  for (let index = 0; index < 20; index++) await Promise.resolve();
  await new Promise(setImmediate);
};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

function fixture() {
  class Node extends EventTarget {
    constructor(context) {
      super();
      this.context = context;
      this.connections = new Set();
      this.gain = {
        value: 1,
        events: [],
        cancelScheduledValues(time) {
          this.events.push(['cancel', time]);
        },
        setValueAtTime(value, time) {
          this.value = value;
          this.events.push(['set', value, time]);
        },
        linearRampToValueAtTime(value, time) {
          this.value = value;
          this.events.push(['ramp', value, time]);
        },
      };
    }
    connect(destination) {
      this.connections.add(destination);
      return destination;
    }
    disconnect(destination) {
      if (destination) this.connections.delete(destination);
      else this.connections.clear();
    }
  }
  class Audio extends EventTarget {
    paused = false;
    seeking = false;
  }
  class Context extends EventTarget {
    sampleRate = 48000;
    currentTime = 0;
    state = 'running';
    createGain() {
      return new Node(this);
    }
    createBufferSource() {
      return Object.assign(new Node(this), {
        playbackRate: { value: 1 },
        buffer: null,
        start() {},
        stop() {},
      });
    }
    createWaveShaper() {
      return new Node(this);
    }
    createMediaElementSource() {
      return new Node(this);
    }
  }
  const context = new Context();
  const audio = new Audio();
  audio.currentTime = 10;
  audio.playbackRate = 1;
  const nodes = [];
  const timers = new Map();
  const warnings = [];
  let timerId = 0;
  let api;
  const state = {
    enabled: true,
    speed: 0.5,
    creation: null,
    keyShift: 0,
    preserve: true,
  };
  const refresh = () => api.sync(audio, state.enabled, state.speed);
  const globals = {
    window: { AudioContext: Context, AudioNode: Node },
    AudioContext: Context,
    AudioNode: Node,
    HTMLAudioElement: Audio,
    DOMException,
    WeakMap,
    WeakRef,
    setTimeout: (callback) => {
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    console: { warn: (...args) => warnings.push(args) },
    preservesKey: () => state.preserve,
    readKeyShift: () => state.keyShift,
    useWasm: true,
    bufferedAudio: null,
    references: new Set([new WeakRef(audio)]),
    discover() {},
    apply: refresh,
    updateAll: refresh,
    outputLevel: {
      subscribeLevel(audio, callback) {
        callback({ volume: 1, muted: false, outputDb: -6 });
        return () => {};
      },
    },
    createStretchNode: async () => {
      const node = new Node(context);
      node.port = {
        closed: false,
        close() {
          this.closed = true;
        },
      };
      node.configurations = [];
      node.schedules = [];
      node.configure = async (options) => {
        node.configurations.push(options);
        if (node.configureGate) await node.configureGate.promise;
      };
      node.latency = async () => 0.15;
      node.schedule = async (options) => {
        node.schedules.push(options);
        if (options.active && node.scheduleGate)
          await node.scheduleGate.promise;
        if (!options.active && node.stopGate) await node.stopGate.promise;
      };
      nodes.push(node);
      if (state.creation) await state.creation.promise;
      return node;
    },
  };
  api = vm.runInNewContext(
    source +
      '\ncreateWasmAudio({...globalThis, readUseWasm: () => useWasm, onGraphReady: audio => globalThis.bufferedAudio?.graphReady(audio)});',
    globals,
  );
  const mediaSource = context.createMediaElementSource(audio);
  const boost = [...mediaSource.connections][0];
  const input = [...boost.connections].find((node) => node.gain.value === 0);
  return {
    api,
    audio,
    context,
    nodes,
    state,
    timers,
    warnings,
    refresh,
    mediaSource,
    boost,
    input,
  };
}

test('key shifting composes with pitch preservation and updates at the same speed', async () => {
  const value = fixture();
  value.refresh();
  await settle();
  assert.equal(value.nodes[0].schedules.at(-1).semitones, 12);
  value.state.keyShift = -3;
  value.refresh();
  await settle();
  assert.equal(value.nodes[0].schedules.at(-1).semitones, 9);
  value.state.preserve = false;
  value.refresh();
  await settle();
  assert.equal(value.nodes[0].schedules.at(-1).semitones, -3);
  for (const semitones of [-1.25, -0.5, 0.125, 2.5]) {
    value.state.keyShift = semitones;
    value.refresh();
    await settle();
    assert.equal(value.nodes[0].schedules.at(-1).semitones, semitones);
    assert.equal(value.nodes.length, 1);
  }
});

test('unity playback starts dry and keeps an active processor across zero', async () => {
  const value = fixture();
  value.state.speed = 1;
  value.refresh();
  await settle();
  assert.equal(value.nodes.length, 0);
  assert.equal(value.api.active(value.audio), false);
  assert.equal(value.input.gain.value, 0);
  value.state.keyShift = 2;
  value.refresh();
  await settle();
  assert.equal(value.api.active(value.audio), true);
  value.state.keyShift = 0;
  value.refresh();
  await settle();
  assert.equal(value.api.active(value.audio), true);
  assert.equal(value.nodes[0].schedules.at(-1).semitones, 0);
  assert.ok(value.nodes[0].connections.size);
  assert.equal(value.api.label(), 'Original pitch at 1×.');
  for (const semitones of [-4.5, -4, -1, -0.5, 0, 0.5, 0, -2]) {
    value.state.keyShift = semitones;
    value.refresh();
    await settle();
    assert.equal(value.nodes[0].schedules.at(-1).semitones, semitones);
    assert.equal(value.nodes[0].configurations.length, 1);
    assert.equal(value.api.active(value.audio), true);
  }
});

test('peak protection switches only the output route of an active pitch processor', async () => {
  const value = fixture();
  value.refresh();
  await settle();
  const [node] = value.nodes;
  const [output] = node.connections;
  const [shaper] = output.connections;
  const [wet] = shaper.connections;
  const schedules = node.schedules.length;
  value.api.setPeakProtection(false);
  assert.deepEqual([...output.connections], [wet]);
  assert.equal(output.gain.value, 1);
  value.api.setPeakProtection(true);
  assert.deepEqual([...output.connections], [shaper]);
  assert.equal(node.schedules.length, schedules);
  assert.equal(value.api.active(value.audio), true);
});

test('pause, seek and mode changes reuse one node and the short pitch window', async () => {
  const value = fixture();
  value.refresh();
  await settle();
  assert.equal(value.api.active(value.audio), true);
  const node = value.nodes[0];
  assert.equal(node.configurations[0].blockMs, 77);
  assert.equal(node.configurations[0].intervalMs, 9);
  assert.equal(node.configurations[0].splitComputation, true);
  assert.deepEqual(value.input.gain.events.slice(-3), [
    ['cancel', 0],
    ['set', 0, 0],
    ['ramp', 1, 0.005],
  ]);
  const [headroom] = node.connections;
  const [shaper] = headroom.connections;
  const [wet] = shaper.connections;
  const dry = [...value.boost.connections].find((item) => item !== value.input);
  assert.deepEqual(dry.gain.events.slice(-3), [
    ['set', 1, 0],
    ['set', 1, 0.15],
    ['ramp', 0, 0.16],
  ]);
  assert.deepEqual(wet.gain.events.slice(-3), [
    ['set', 0, 0],
    ['set', 0, 0.15],
    ['ramp', 1, 0.16],
  ]);
  for (let index = 0; index < 20; index++) {
    value.audio.paused = true;
    value.audio.dispatchEvent(new Event('pause'));
    value.refresh();
    await settle();
    assert.equal(node.connections.size, 0);
    assert.equal(node.port.closed, false);
    assert.equal(value.api.active(value.audio), false);
    assert.equal(node.schedules.at(-1).active, false);
    assert.equal(value.input.gain.value, 0);
    assert.equal(value.input.connections.size, 0);
    assert.equal(value.boost.connections.has(value.input), true);
    value.audio.paused = false;
    value.state.speed = 0.75;
    value.refresh();
    await settle();
    value.audio.seeking = true;
    value.audio.dispatchEvent(new Event('seeking'));
    value.audio.seeking = false;
    value.audio.dispatchEvent(new Event('seeked'));
    await settle();
    value.state.enabled = false;
    value.refresh();
    await settle();
    value.state.enabled = true;
    value.refresh();
    await settle();
    assert.equal(value.api.active(value.audio), true);
  }
  assert.equal(value.nodes.length, 1);
  assert.equal(node.configurations.length, 61);
  assert.equal(value.timers.size, 0);
  assert.equal(value.warnings.length, 0);
});

test('late creation remains cached but cannot reconnect a paused or stale source', async () => {
  const value = fixture();
  value.state.creation = deferred();
  value.refresh();
  value.audio.paused = true;
  value.audio.dispatchEvent(new Event('pause'));
  value.state.creation.resolve();
  await settle();
  assert.equal(value.nodes.length, 1);
  assert.equal(value.nodes[0].connections.size, 0);
  assert.equal(value.nodes[0].port.closed, false);
  assert.equal(value.api.active(value.audio), false);
  value.audio.paused = false;
  value.refresh();
  await settle();
  assert.equal(value.nodes.length, 1);
  assert.equal(value.api.active(value.audio), true);
});

test('a stale schedule cannot activate after a seek, and the newest speed wins', async () => {
  const value = fixture();
  value.refresh();
  await settle();
  const node = value.nodes[0];
  node.scheduleGate = deferred();
  value.state.speed = 0.6;
  value.refresh();
  value.audio.seeking = true;
  value.audio.dispatchEvent(new Event('seeking'));
  value.state.speed = 0.8;
  value.audio.seeking = false;
  value.audio.dispatchEvent(new Event('seeked'));
  assert.equal(value.api.active(value.audio), false);
  node.scheduleGate.resolve();
  await settle();
  assert.equal(value.nodes.length, 1);
  assert.equal(value.api.active(value.audio), true);
  assert.equal(node.schedules.at(-1).semitones, -12 * Math.log2(0.8));
  assert.equal(node.configurations.length, 2);
});

test('initial compensation stays dry until the newest speed is acknowledged without a seek', async () => {
  const value = fixture();
  value.refresh();
  const node = value.nodes[0];
  const first = deferred();
  const latest = deferred();
  node.scheduleGate = first;
  await settle();
  assert.equal(value.api.active(value.audio), false);
  assert.equal(node.schedules.at(-1).semitones, -12 * Math.log2(0.5));
  value.state.speed = 0.8;
  value.refresh();
  node.scheduleGate = latest;
  first.resolve();
  await settle();
  assert.equal(node.schedules.at(-1).semitones, -12 * Math.log2(0.8));
  assert.equal(value.api.active(value.audio), false);
  latest.resolve();
  await settle();
  assert.equal(value.api.active(value.audio), true);
  assert.equal(value.nodes.length, 1);
  assert.equal(node.configurations.length, 1);
});

test('live speed changes keep the active route while the newest schedule is pending', async () => {
  const value = fixture();
  value.refresh();
  await settle();
  const node = value.nodes[0];
  const primingEvents = value.input.gain.events.length;
  const first = deferred();
  const latest = deferred();
  node.scheduleGate = first;
  value.state.speed = 0.6;
  value.refresh();
  await settle();
  value.state.speed = 0.8;
  value.refresh();
  node.scheduleGate = latest;
  first.resolve();
  await settle();
  assert.equal(node.schedules.at(-1).semitones, -12 * Math.log2(0.8));
  assert.equal(value.api.active(value.audio), true);
  latest.resolve();
  await settle();
  assert.equal(value.api.active(value.audio), true);
  assert.equal(node.configurations.length, 1);
  assert.equal(
    node.schedules.some((schedule) => !schedule.active),
    false,
  );
  assert.equal(value.input.gain.events.length, primingEvents);
});

test('configure timeout poisons the node and cannot trigger recreation bursts', async () => {
  const value = fixture();
  value.refresh();
  await settle();
  const node = value.nodes[0];
  node.configureGate = deferred();
  value.audio.dispatchEvent(new Event('seeking'));
  value.refresh();
  await settle();
  for (const timeout of [...value.timers.values()]) timeout();
  await settle();
  assert.equal(value.api.active(value.audio), false);
  assert.equal(node.port.closed, true);
  for (let index = 0; index < 10; index++) {
    value.state.enabled = !value.state.enabled;
    value.refresh();
  }
  assert.equal(value.nodes.length, 1);
  node.configureGate.resolve();
  await settle();
  assert.equal(node.connections.size, 0);
  assert.equal(value.api.active(value.audio), false);
  assert.match(value.api.label(), /browser fallback/);
});

test('creation timeout closes a late result without a replacement attempt', async () => {
  const value = fixture();
  value.state.creation = deferred();
  value.refresh();
  for (const timeout of [...value.timers.values()]) timeout();
  await settle();
  value.state.creation.resolve();
  await settle();
  for (let index = 0; index < 10; index++) value.refresh();
  assert.equal(value.nodes.length, 1);
  assert.equal(value.nodes[0].port.closed, true);
  assert.equal(value.nodes[0].connections.size, 0);
  assert.equal(value.api.active(value.audio), false);
});

test('processor errors and closed contexts retire cached nodes', async () => {
  for (const failure of ['processor', 'context']) {
    const value = fixture();
    value.refresh();
    await settle();
    const node = value.nodes[0];
    if (failure === 'processor')
      node.dispatchEvent(new Event('processorerror'));
    else {
      value.context.state = 'closed';
      value.context.dispatchEvent(new Event('statechange'));
    }
    await settle();
    value.refresh();
    assert.equal(value.api.active(value.audio), false);
    assert.equal(node.connections.size, 0);
    assert.equal(node.port.closed, true);
    assert.equal(value.nodes.length, 1);
  }
});

test('failed or stalled deactivation uses fallback without uncaught event errors', async () => {
  for (const failure of ['throw', 'timeout']) {
    const value = fixture();
    value.refresh();
    await settle();
    const node = value.nodes[0];
    if (failure === 'throw')
      node.schedule = () => {
        throw new Error('Port failed');
      };
    else node.stopGate = deferred();
    value.audio.paused = true;
    value.audio.dispatchEvent(new Event('pause'));
    await settle();
    for (const timeout of [...value.timers.values()]) timeout();
    await settle();
    value.audio.paused = false;
    value.refresh();
    assert.equal(value.nodes.length, 1);
    assert.equal(node.connections.size, 0);
    assert.equal(node.port.closed, true);
    assert.equal(value.api.active(value.audio), false);
    assert.equal(value.warnings.length, 1);
  }
});

test('a partial graph connection failure removes the gated input-to-worklet edge', async () => {
  const value = fixture();
  value.refresh();
  const node = value.nodes[0];
  node.connect = () => {
    throw new Error('Connection rejected');
  };
  await settle();
  assert.equal(value.input.connections.has(node), false);
  assert.equal(node.port.closed, true);
  assert.equal(value.api.active(value.audio), false);
  assert.equal(value.nodes.length, 1);
});

test('Natural-mode keep-alive keeps zero-shift warm while preserve-off at zero disconnects', async () => {
  const value = fixture();
  const guardEnabled = () =>
    (value.state.preserve && value.state.enabled) ||
    value.state.keyShift !== 0 ||
    (!value.state.preserve && value.api.keepsZero(value.audio));
  const applyGuarded = () =>
    value.api.sync(value.audio, guardEnabled(), value.state.speed);

  value.state.speed = 1;
  value.state.preserve = false;
  value.state.keyShift = -1;
  applyGuarded();
  await settle();
  assert.equal(value.nodes.length, 1);
  assert.equal(value.api.active(value.audio), true);
  assert.equal(value.api.keepsZero(value.audio), true);

  value.state.keyShift = 0;
  applyGuarded();
  await settle();
  assert.equal(value.api.active(value.audio), true);
  assert.equal(value.nodes[0].configurations.length, 1);
  assert.equal(value.nodes[0].schedules.at(-1).semitones, 0);

  // When preserve is true at zero shift, keepsZero is false so turning preserve off disconnects cleanly.
  value.state.preserve = true;
  applyGuarded();
  await settle();
  assert.equal(value.api.keepsZero(value.audio), false);
  value.state.preserve = false;
  applyGuarded();
  await settle();
  assert.equal(value.api.active(value.audio), false);
  assert.equal(value.input.connections.size, 0);
});

test('rapid keyShift changes during stretch node creation schedule only the newest semitone', async () => {
  const value = fixture();
  value.state.speed = 1;
  value.state.preserve = false;
  value.state.creation = deferred();
  value.state.keyShift = -0.5;
  value.refresh();
  value.state.keyShift = -1;
  value.refresh();
  value.state.keyShift = -2;
  value.refresh();
  value.state.creation.resolve();
  await settle();
  assert.equal(value.nodes.length, 1);
  assert.deepEqual(
    value.nodes[0].schedules.map((s) => s.semitones),
    [-2],
  );
  assert.equal(value.api.active(value.audio), true);
});

test('crossfadeReady, nativePosition and beginCrossfade respect single-latency activeAt', async () => {
  const value = fixture();
  const incomingAudio = Object.assign(new value.audio.constructor(), {
    paused: false,
    seeking: false,
    currentTime: 10,
    playbackRate: 1,
  });
  value.context.createMediaElementSource(incomingAudio);
  value.state.speed = 1;
  value.state.preserve = false;
  value.state.keyShift = -2;
  value.refresh();
  value.api.sync(incomingAudio, true, 1);
  await settle();
  // At t=0, node.latency() is 0.15 so activeAt is 0.15; dry is still playing.
  assert.equal(
    value.api.crossfadeReady(value.audio, {
      preserve: false,
      shift: -2,
      rate: 1,
    }),
    false,
  );
  const dryGain = [...value.boost.connections].find(
    (item) => item !== value.input,
  ).gain;
  const tail = { duration: 4, length: 192000, sampleRate: 48000 };
  const warmupSession = value.api.beginCrossfade(
    value.audio,
    tail,
    1,
    1,
    1,
    null,
  );
  assert.equal(warmupSession.nativePosition(incomingAudio), 10);
  assert.equal(value.input.gain.value, 0);
  assert.equal(value.api.active(value.audio), false);
  warmupSession.dispose();

  // Re-activate outgoing deck and advance currentTime past activeAt (0.15s).
  value.refresh();
  await settle();
  value.context.currentTime = 0.2;
  assert.equal(
    value.api.crossfadeReady(value.audio, {
      preserve: false,
      shift: -2,
      rate: 1,
    }),
    true,
  );
  const readySession = value.api.beginCrossfade(
    value.audio,
    tail,
    1,
    1,
    1,
    null,
  );
  assert.equal(readySession.nativePosition(incomingAudio), 10 - 0.15);
  assert.equal(dryGain.events.at(-1)[0], 'cancel');
  assert.equal(dryGain.value, 1);
  assert.equal(value.input.gain.value, 0);
  assert.equal(value.api.active(value.audio), false);
  readySession.dispose();
});

test('discontinuity flush window waits full latency after seek then restores fast single-latency activation', async () => {
  const value = fixture();
  value.state.speed = 1;
  value.state.preserve = false;
  value.state.keyShift = -2;
  // Normal live engagement at t=0 has no prior seek/source reset -> single-latency ramp.
  value.refresh();
  await settle();
  assert.deepEqual(value.input.gain.events.slice(-3), [
    ['cancel', 0],
    ['set', 0, 0],
    ['ramp', 1, 0.005],
  ]);
  const wet = [...value.nodes[0].connections][0].connections;
  const wetGain = [...[...wet][0].connections][0].gain;
  assert.deepEqual(wetGain.events.slice(-3), [
    ['set', 0, 0],
    ['set', 0, 0.15],
    ['ramp', 1, 0.16],
  ]);

  // Immediate re-activation after seek holds input closed for state.latency before opening.
  value.audio.seeking = true;
  value.audio.dispatchEvent(new Event('seeking'));
  value.audio.seeking = false;
  value.audio.dispatchEvent(new Event('seeked'));
  await settle();
  assert.deepEqual(value.input.gain.events.slice(-4), [
    ['cancel', 0],
    ['set', 0, 0],
    ['set', 0, 0.15],
    ['ramp', 1, 0.155],
  ]);
  assert.deepEqual(wetGain.events.slice(-3), [
    ['set', 0, 0],
    ['set', 0, 0.3],
    ['ramp', 1, 0.31],
  ]);

  // Once currentTime advances past flushAt + latency, pause -> resume returns to single-latency.
  value.context.currentTime = 1;
  value.audio.paused = true;
  value.audio.dispatchEvent(new Event('pause'));
  await settle();
  value.audio.paused = false;
  value.refresh();
  await settle();
  assert.deepEqual(value.input.gain.events.slice(-3), [
    ['cancel', 1],
    ['set', 0, 1],
    ['ramp', 1, 1.005],
  ]);
  assert.deepEqual(wetGain.events.slice(-3), [
    ['set', 0, 1],
    ['set', 0, 1.15],
    ['ramp', 1, 1.16],
  ]);
});

test('track starts near 0:00 and post-seek/emptied warmups mute dry until wet activates or falls back', async () => {
  const value = fixture();
  const dryGain = [...value.boost.connections].find(
    (item) => item !== value.input,
  ).gain;
  value.state.speed = 1;
  value.state.preserve = false;
  value.state.keyShift = -2;
  value.audio.currentTime = 0;
  value.refresh();
  const node = value.nodes[0];
  node.scheduleGate = deferred();
  await settle();
  assert.equal(
    dryGain.value,
    0,
    'brand-new track at 0:00 mutes dry during warmup',
  );
  node.scheduleGate.resolve();
  await settle();
  assert.deepEqual(dryGain.events.at(-1), ['set', 0, 0]);
  assert.equal(
    dryGain.value,
    0,
    'dry stays muted after wet takes over from muteDry',
  );

  // Emptied track switch keeps dry muted until ready, then restores dry to 1 if pitch is disabled or node fails.
  node.scheduleGate = deferred();
  value.audio.dispatchEvent(new Event('emptied'));
  assert.equal(dryGain.value, 0);
  value.state.keyShift = 0;
  value.refresh();
  assert.equal(dryGain.value, 1, 'disabling pitch restores dry gain to 1');

  value.state.keyShift = -2;
  value.audio.currentTime = 0;
  value.refresh();
  assert.equal(dryGain.value, 0);
  node.dispatchEvent(new Event('processorerror'));
  await settle();
  assert.equal(
    dryGain.value,
    1,
    'retire/fail restores dry gain to 1 for fallback',
  );
});

test('beginCrossfade uses equal-power curves when supported and 8ms native anti-click fade', async () => {
  const value = fixture();
  const curves = [];
  const createdGains = [];
  const origCreateGain = value.context.createGain.bind(value.context);
  value.context.createGain = () => {
    const g = origCreateGain();
    createdGains.push(g);
    g.gain.setValueCurveAtTime = (curve, start, duration) => {
      curves.push({
        start,
        duration,
        first: curve[0],
        mid: curve[Math.floor(curve.length / 2)],
        last: curve[curve.length - 1],
      });
      g.gain.events.push([
        'curve',
        curve[0],
        curve[curve.length - 1],
        start,
        duration,
      ]);
      g.gain.value = curve[curve.length - 1];
    };
    return g;
  };
  const nextAudio = Object.assign(new value.audio.constructor(), {
    paused: false,
    seeking: false,
    currentTime: 0,
    playbackRate: 1,
  });
  value.context.createMediaElementSource(nextAudio);
  value.state.speed = 1;
  value.state.preserve = false;
  value.state.keyShift = 0;
  value.context.currentTime = 2;
  const tail = { duration: 4, length: 192000, sampleRate: 48000 };
  const opening = { buffer: { duration: 10 }, shifted: false };
  const gainsBefore = createdGains.length;
  const session = value.api.beginCrossfade(value.audio, tail, 0, 1, 5, opening);
  const nativeFadeGain = createdGains[gainsBefore].gain;
  assert.deepEqual(nativeFadeGain.events.slice(-3), [
    ['cancel', 2],
    ['set', 1, 2],
    ['ramp', 0, 2.008],
  ]);
  assert.equal(curves.length, 2);
  assert.ok(
    Math.abs(curves[0].mid ** 2 + curves[1].mid ** 2 - 1) < 1e-6,
    'equal-power midpoint sums to unity power',
  );
  assert.equal(curves[0].last, 0);
  assert.equal(curves[1].first, 0);
  assert.equal(curves[1].last, 1);

  value.context.currentTime = 7;
  curves.length = 0;
  assert.equal(session.fadeIn(nextAudio), true);
  assert.equal(curves.length, 2);
  assert.equal(curves[0].first, 0);
  assert.equal(curves[0].last, 1);
  assert.equal(curves[0].duration, 0.04);
  assert.equal(curves[1].first, 1);
  assert.equal(curves[1].last, 0);
  assert.equal(curves[1].duration, 0.04);
  session.dispose();
});
