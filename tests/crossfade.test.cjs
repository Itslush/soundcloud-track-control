const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('./module-fixture.cjs')([
  'soundcloud/tempo-crossfade.js',
]);
const { createCrossfade } = vm.runInNewContext(source + '\nfixtureModule;', {
  AbortController,
});
const settle = () => new Promise(setImmediate);

function fixture(onVisual, applySyncRate = null) {
  const values = new Map();
  const audio = Object.assign(new EventTarget(), {
    currentTime: 20,
    duration: 30,
    currentSrc: 'blob:first',
    paused: false,
    seeking: false,
    readyState: 4,
  });
  const settings = { rate: 1, preserve: false, shift: 0, variable: false };
  const state = {
    track: 'first',
    clicks: 0,
    reads: 0,
    stops: 0,
    fades: [],
    bound: true,
    graphReady: true,
    fail: false,
    cached: 0,
    preloads: 0,
    releases: 0,
    nextTrack: 'second',
    nextRate: 1,
    preloadRequests: [],
  };
  const context = {
    currentTime: 0,
    state: 'running',
    createBuffer: (channels, frames, sampleRate) => ({
      duration: frames / sampleRate,
      copyToChannel() {},
    }),
  };
  let tick;
  const api = createCrossfade({
    onVisual,
    applySyncRate,
    readNextRate: () => state.nextRate,
    isCurrentTrack: (_audio, track) =>
      (state.verifiedTrack ?? state.track) === track,
    readNextSettings: () => ({
      ...settings,
      rate: state.nextRate,
      variable: state.nextVariable ?? settings.variable,
    }),
    preloadNext: async () => {
      state.preloads++;
      await state.preloadWait;
      if (state.hostStale)
        throw Object.assign(new Error('Host changed.'), {
          code: 'SOUNDCLOUD_HOST_STALE',
        });
      if (state.queuePending)
        throw Object.assign(new Error('No next track is queued.'), {
          code: 'SOUNDCLOUD_QUEUE_PENDING',
        });
      const next = state.nextTrack;
      state.preloadRequests.push({ current: state.track, next });
      let released = false;
      return {
        trackUrl: next,
        matches: () => next === state.nextTrack,
        ready: (seconds) => state.cached >= seconds,
        bufferedSeconds: () => state.cached,
        streamUrl: () => state.nextUrl ?? 'https://a.sndcdn.com/next.m3u8',
        isCurrent: () => state.track === next,
        dispose() {
          if (!released) state.releases++;
          released = true;
        },
      };
    },
    graph: {
      contextFor: () => context,
      crossfadeReady: () => state.graphReady,
      prepareIncoming: async (audio, buffer) => {
        await state.openingWait;
        return { buffer, shifted: false };
      },
      beginCrossfade(
        target,
        buffer,
        offset,
        rate,
        seconds,
        opening,
        bypassHostFade = false,
      ) {
        state.start = {
          target,
          buffer,
          offset,
          rate,
          seconds,
          opening,
          bypassHostFade,
        };
        return {
          context,
          startedAt: context.currentTime,
          overlapEnd: context.currentTime + seconds,
          endTime: context.currentTime + (opening?.buffer.duration ?? seconds),
          position: () => context.currentTime,
          nativePosition: (target) => target.currentTime,
          valid: () => state.routeValid !== false,
          silence: () => true,
          fadeIn(target, duration) {
            state.fades.push({ target, duration });
            this.endTime = context.currentTime + (duration ?? 0.08);
            return true;
          },
          dispose: () => state.stops++,
        };
      },
    },
    modules: {
      loadAudioDependencies: async () => {
        state.reads++;
        await state.decodeWait;
        return {};
      },
      createPcmSource: () => ({}),
      createPcmWindow: () => ({
        info: async () => {
          if (state.fail) throw new Error('Decoder unavailable');
          return { durationHint: 30, sampleRate: 8000 };
        },
        acquire: async (from, to) => ({
          channels: [new Float32Array(to - from), new Float32Array(to - from)],
          release() {},
        }),
        dispose: async () => {},
      }),
    },
    sourceFor: () => ({
      status: state.bound ? 'bound' : 'unbound',
      reason: state.bound ? undefined : 'waiting-for-payload-proof',
      sourceId: state.track,
      playlistUrl: state.currentUrl ?? 'https://a.sndcdn.com/a.m3u8',
      proof: state.proof ?? null,
    }),
    resolveSource: async () => {
      await state.sourceWait;
      return {
        status: state.bound ? 'bound' : 'unbound',
        sourceId: state.track,
        playlistUrl: state.currentUrl ?? 'https://a.sndcdn.com/a.m3u8',
      };
    },
    sourceStats: () => ({ installed: true, playlists: 1 }),
    readSettings: () => settings,
    readTrack: () => state.track,
    nextButton: () => ({
      click() {
        state.clicks++;
      },
    }),
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    timers: {
      setTimeout: (fn) => (state.deadline = fn),
      clearTimeout: () => (state.deadline = null),
      setInterval: (fn) => {
        tick = fn;
        return 1;
      },
      clearInterval: () => {
        tick = null;
      },
    },
  });
  api.reload();
  api.select(audio);
  return {
    api,
    state,
    audio,
    settings,
    context,
    values,
    tick: () => tick?.(),
    async opening() {
      tick?.();
      await settle();
      tick?.();
    },
  };
}

test('crossfade is opt-in, overlaps once, then restores normal playback', async () => {
  const visuals = [];
  const f = fixture((value) => visuals.push(value));
  f.tick();
  assert.equal(f.state.reads, 0);
  f.api.set(true, 5);
  f.tick();
  await settle();
  assert.equal(f.state.preloads, 1);
  assert.equal(f.state.clicks, 0);
  f.state.cached = 24;
  await f.opening();
  assert.equal(f.api.label(), 'Crossfade ready.');
  f.audio.currentTime = 25;
  f.tick();
  assert.equal(f.state.clicks, 1);
  assert.equal(f.state.start.offset, 2);
  assert.equal(f.state.start.seconds, 5);
  assert.equal(visuals.at(-1).progress, 0);
  f.audio.dispatchEvent(new Event('pause'));
  assert.equal(f.state.stops, 0);
  f.state.track = 'second';
  f.audio.currentTime = 0;
  f.audio.currentSrc = 'blob:second';
  f.context.currentTime = 1;
  f.audio.dispatchEvent(new Event('playing'));
  assert.equal(
    f.state.fades.length,
    0,
    'buffered intro keeps playing during native startup',
  );
  assert.equal(
    f.audio.currentTime,
    1,
    'native playback is aligned while muted',
  );
  f.tick();
  assert.equal(f.state.clicks, 1);
  assert.ok(Math.abs(visuals.at(-1).progress - 0.2) < 1e-12);
  assert.equal(visuals.at(-1).track, 'first');
  assert.equal(visuals.at(-1).position, 26);
  assert.equal(visuals.at(-1).duration, 30);
  assert.equal(visuals.at(-1).nextPosition, 1);
  f.context.currentTime = 5;
  f.audio.currentTime = 5;
  f.tick();
  assert.equal(f.state.fades.length, 1);
  f.context.currentTime = 5.1;
  f.tick();
  assert.equal(f.state.stops, 1);
  assert.equal(f.state.releases, 1);
  assert.equal(visuals.at(-1), null);
  f.api.dispose();
});

test('local queue identity is separate from copied diagnostic data', async () => {
  const f = fixture();
  f.state.proof = 'selected-player-controller';
  f.state.nextTrack = 'https://soundcloud.com/artist/queued?s=private';
  f.api.set(true, 5);
  f.tick();
  await settle();
  assert.equal(f.api.nextTrack(), f.state.nextTrack);
  assert.equal(
    f.api.diagnostics().player.sourceProof,
    'selected-player-controller',
  );
  assert.ok(!JSON.stringify(f.api.diagnostics()).includes('artist/queued'));
  f.state.nextTrack = 'https://soundcloud.com/artist/other';
  assert.equal(f.api.nextTrack(), '');
  f.api.dispose();
});

test('failed artwork cannot interrupt the audio overlap or cancellation', async () => {
  const f = fixture(() => {
    throw new Error('Detached artwork');
  });
  f.api.set(true, 5);
  f.state.cached = 24;
  f.tick();
  await settle();
  await f.opening();
  f.audio.currentTime = 25;
  f.tick();
  assert.equal(f.state.clicks, 1);
  assert.equal(f.api.diagnostics().stage, 'buffered-overlap');
  f.api.cancel();
  assert.equal(f.state.stops, 1);
});

test('pending identification waits for proof and cannot resume after cancellation', async () => {
  for (const cancelled of [false, true]) {
    const f = fixture();
    let identify;
    f.state.bound = false;
    f.state.sourceWait = new Promise((resolve) => {
      identify = resolve;
    });
    f.api.set(true, 5);
    f.tick();
    await settle();
    assert.equal(f.api.diagnostics().stage, 'identifying-source');
    assert.equal(
      f.api.diagnostics().player.sourceReason,
      'waiting-for-payload-proof',
    );
    assert.equal(f.api.diagnostics().player.sourceCapture.installed, true);
    assert.equal(f.state.reads, 0);
    if (cancelled) f.api.cancel();
    f.state.bound = true;
    identify();
    await settle();
    assert.equal(f.state.reads, cancelled ? 0 : 1);
    assert.equal(f.state.clicks, 0);
    f.api.dispose();
  }
});

test('Play on a long track starts a single preload before the graph is ready', async () => {
  const f = fixture();
  f.audio.duration = 183.05;
  f.audio.currentTime = 1.4;
  f.state.graphReady = false;
  f.api.set(true, 10);
  f.tick();
  assert.match(f.api.label(), /needs a ready player/);
  assert.equal(f.state.preloads, 1);
  f.state.graphReady = true;
  f.audio.dispatchEvent(new Event('playing'));
  assert.match(f.api.label(), /Preloading the next track/);
  assert.equal(f.api.diagnostics().player.graphReady, true);
  assert.equal(f.state.preloads, 1);
  f.tick();
  assert.equal(f.state.preloads, 1);
  await settle();
  assert.equal(f.state.clicks, 0);
  f.api.dispose();
});

test('cancelling a resolved preload before graph adoption releases it', async () => {
  const f = fixture();
  f.state.graphReady = false;
  f.api.set(true, 5);
  f.tick();
  await settle();
  assert.equal(f.state.preloads, 1);
  assert.equal(f.state.releases, 0);
  f.api.cancel();
  assert.equal(f.state.releases, 1);
  f.api.dispose();
  assert.equal(f.state.releases, 1);
});

test('variable, short and unknown-duration playing tracks still preload once', async () => {
  for (const duration of [4, NaN, 30]) {
    const f = fixture();
    f.audio.duration = duration;
    f.audio.currentTime = 1;
    f.settings.variable = true;
    f.state.graphReady = false;
    f.api.set(true, 5);
    f.audio.dispatchEvent(new Event('playing'));
    await settle();
    f.tick();
    assert.equal(f.state.preloads, 1);
    assert.equal(f.state.reads, 0);
    assert.equal(f.state.releases, 0);
    f.audio.dispatchEvent(new Event('pause'));
    assert.equal(f.state.releases, 1);
    f.api.dispose();
  }
});

test('tempo and pitch edits retain the verified preload but queue changes replace it', async () => {
  const f = fixture();
  assert.doesNotThrow(() => f.api.settingsChanged());
  f.api.set(true, 5);
  f.tick();
  await settle();
  f.api.settingsChanged();
  f.settings.shift = 3;
  f.tick();
  await settle();
  f.api.settingsChanged();
  f.settings.rate = 1.25;
  f.tick();
  await settle();
  f.api.settingsChanged();
  f.settings.variable = true;
  f.tick();
  await settle();
  assert.equal(f.state.preloads, 1);
  assert.equal(f.state.releases, 0);
  f.state.nextTrack = 'third';
  f.tick();
  await settle();
  assert.equal(f.state.preloads, 2);
  assert.equal(f.state.releases, 1);
  f.api.dispose();
  assert.equal(f.state.releases, 2);
});

test('tempo edits during a slow preload retain its eventual queue item', async () => {
  const f = fixture();
  let finish;
  f.state.preloadWait = new Promise((resolve) => {
    finish = resolve;
  });
  f.api.set(true, 5);
  f.tick();
  f.api.settingsChanged();
  f.settings.shift = -2;
  f.tick();
  f.api.settingsChanged();
  f.settings.rate = 0.75;
  f.tick();
  finish();
  await settle();
  f.tick();
  await settle();
  assert.equal(f.state.preloads, 1);
  assert.equal(f.state.releases, 0);
  f.api.dispose();
  assert.equal(f.state.releases, 1);
});

test('an edit arriving during decoding does not release the verified queue item', async () => {
  const f = fixture();
  let finish;
  f.state.decodeWait = new Promise((resolve) => {
    finish = resolve;
  });
  f.api.set(true, 5);
  f.tick();
  await settle();
  f.settings.shift = 2;
  finish();
  await settle();
  f.tick();
  await settle();
  assert.equal(f.state.preloads, 1);
  assert.equal(f.state.releases, 0);
  f.api.dispose();
  assert.equal(f.state.releases, 1);
});

test('outgoing identification and decode failures retain a verified next item', async () => {
  for (const failure of ['unbound', 'decode']) {
    const f = fixture();
    f.state.bound = failure !== 'unbound';
    f.state.fail = failure === 'decode';
    f.api.set(true, 5);
    f.tick();
    await settle();
    assert.equal(f.api.diagnostics().stage, 'unavailable');
    assert.equal(f.state.releases, 0);
    for (let i = 0; i < 4; i++) f.tick();
    assert.equal(f.state.preloads, 1);
    f.state.bound = true;
    f.state.fail = false;
    if (failure === 'decode') f.api.settingsChanged();
    f.tick();
    await settle();
    assert.equal(f.state.preloads, 1);
    assert.equal(f.state.releases, 0);
    f.api.dispose();
    assert.equal(f.state.releases, 1);
  }
});

test('an incoming tempo timeline keeps its preload and retries when steady', async () => {
  const f = fixture();
  f.state.nextVariable = true;
  f.state.cached = 30;
  f.api.set(true, 5);
  f.tick();
  await settle();
  f.tick();
  await settle();
  assert.equal(f.api.diagnostics().stage, 'unavailable');
  assert.equal(f.state.releases, 0);
  for (let i = 0; i < 4; i++) f.tick();
  assert.equal(f.state.preloads, 1);
  f.state.nextVariable = false;
  f.tick();
  await settle();
  f.tick();
  await settle();
  assert.equal(f.api.label(), 'Crossfade ready.');
  assert.equal(f.state.preloads, 1);
  assert.equal(f.state.releases, 0);
  f.api.dispose();
  assert.equal(f.state.releases, 1);
});

test('a persistently stale host is retried once rather than polled forever', async () => {
  const f = fixture();
  f.state.hostStale = true;
  f.api.set(true, 5);
  f.tick();
  await settle();
  for (let i = 0; i < 8; i++) {
    f.audio.currentTime += 2;
    f.tick();
    await settle();
  }
  assert.equal(f.state.preloads, 2);
  f.api.dispose();
});

test('a queue replacement during a decode failure retries the new item', async () => {
  const f = fixture();
  let finish;
  f.state.decodeWait = new Promise((resolve) => {
    finish = resolve;
  });
  f.api.set(true, 5);
  f.tick();
  await settle();
  f.state.nextTrack = 'third';
  f.state.fail = true;
  finish();
  await settle();
  assert.equal(f.state.releases, 1);
  f.state.fail = false;
  f.audio.currentTime += 2;
  f.tick();
  await settle();
  assert.equal(f.state.preloads, 2);
  f.api.dispose();
  assert.equal(f.state.releases, 2);
});

test('manual Play prepares a bounded outgoing tail and fades into the selected native track', async () => {
  const f = fixture();
  f.audio.currentTime = 4;
  f.api.set(true, 2);
  f.api.warmManual();
  await settle();
  assert.equal(f.api.manualPlay('chosen'), true);
  f.state.track = 'chosen';
  f.audio.currentSrc = 'blob:chosen';
  f.audio.currentTime = 0;
  f.audio.dispatchEvent(new Event('playing'));
  f.tick();
  await settle();
  assert.equal(f.state.clicks, 0);
  assert.equal(f.state.start.buffer.duration, 10);
  assert.equal(f.state.start.opening, null);
  assert.equal(f.state.start.bypassHostFade, true);
  assert.equal(f.state.fades[0].duration, 2);
  assert.equal(
    f.state.preloads,
    1,
    'preload starts while the outgoing bridge is playing',
  );
  f.context.currentTime = 2;
  f.tick();
  assert.equal(f.state.stops, 1);
  f.tick();
  await settle();
  assert.equal(
    f.state.preloads,
    1,
    'the following preparation reuses that preload',
  );
  f.api.dispose();
});

test('a loading pause cannot keep the selected-track bridge alive indefinitely', async () => {
  const f = fixture();
  f.api.set(true, 2);
  f.api.warmManual();
  await settle();
  assert.equal(f.api.manualPlay('chosen'), true);
  f.audio.paused = true;
  f.audio.dispatchEvent(new Event('pause'));
  assert.equal(f.state.stops, 0);
  f.context.currentTime = 2.1;
  f.tick();
  assert.equal(f.state.stops, 1);
  f.api.dispose();
});

test('pausing the started target cancels its selected-track bridge', async () => {
  const f = fixture();
  f.api.set(true, 2);
  f.api.warmManual();
  await settle();
  assert.equal(f.api.manualPlay('chosen'), true);
  f.state.track = 'chosen';
  f.audio.currentSrc = 'blob:chosen';
  f.audio.currentTime = 0;
  f.audio.dispatchEvent(new Event('playing'));
  f.audio.paused = true;
  f.audio.dispatchEvent(new Event('pause'));
  assert.equal(f.state.stops, 1);
  f.api.dispose();
});

test('a direct seek uses the rolling outgoing window without pointer intent', async () => {
  const f = fixture();
  f.audio.currentTime = 4;
  f.state.cached = 30;
  f.api.set(true, 2);
  f.tick();
  await settle();
  f.tick();
  await settle();
  f.tick();
  await settle();
  assert.equal(f.api.manualPlay('first', true), true);
  f.audio.dispatchEvent(new Event('seeking'));
  f.audio.currentTime = 15;
  f.audio.dispatchEvent(new Event('seeked'));
  assert.equal(f.state.fades.length, 1);
  assert.equal(f.audio.currentTime, 15);
  f.api.dispose();
});

test('playing an earlier row preloads the next item from the new queue position', async () => {
  const f = fixture();
  f.state.track = 'middle';
  f.state.nextTrack = 'later';
  f.audio.currentTime = 4;
  f.api.set(true, 2);
  f.api.warmManual();
  await settle();
  assert.equal(f.api.manualPlay('earlier'), true);
  f.state.track = 'earlier';
  f.state.nextTrack = 'middle';
  f.audio.currentSrc = 'blob:earlier';
  f.audio.currentTime = 0;
  f.audio.dispatchEvent(new Event('playing'));
  await settle();
  assert.deepEqual(f.state.preloadRequests, [
    { current: 'earlier', next: 'middle' },
  ]);
  f.api.dispose();
});

test('an earlier row reusing the same media source still starts the new next preload', async () => {
  const f = fixture();
  f.state.track = 'middle';
  f.audio.currentTime = 4;
  f.api.set(true, 2);
  f.api.warmManual();
  await settle();
  assert.equal(f.api.manualPlay('earlier'), true);
  f.state.track = 'earlier';
  f.state.nextTrack = 'middle';
  f.audio.currentTime = 0;
  f.audio.dispatchEvent(new Event('playing'));
  await settle();
  assert.deepEqual(f.state.preloadRequests, [
    { current: 'earlier', next: 'middle' },
  ]);
  assert.equal(f.api.diagnostics().player.nextBufferedSeconds, 0);
  f.api.dispose();
});

test('near-zero same-source selection waits for the verified current queue item', async () => {
  const f = fixture();
  f.state.track = 'middle';
  f.audio.currentTime = 0.05;
  f.api.set(true, 2);
  f.api.warmManual();
  await settle();
  assert.equal(f.api.manualPlay('earlier'), true);
  f.state.track = 'earlier';
  f.state.nextTrack = 'middle';
  f.state.verifiedTrack = 'middle';
  f.tick();
  assert.equal(f.state.preloads, 0);
  assert.equal(f.state.fades.length, 0);
  f.state.verifiedTrack = 'earlier';
  f.tick();
  await settle();
  assert.deepEqual(f.state.preloadRequests, [
    { current: 'earlier', next: 'middle' },
  ]);
  assert.equal(f.state.fades.length, 1);
  f.api.dispose();
});

test('the previous window remains usable while its replacement is decoding', async () => {
  const f = fixture();
  f.audio.currentTime = 4;
  f.state.cached = 30;
  f.api.set(true, 2);
  f.tick();
  await settle();
  f.tick();
  await settle();
  f.tick();
  await settle();
  let finish;
  f.state.decodeWait = new Promise((resolve) => {
    finish = resolve;
  });
  f.audio.currentTime = 11;
  f.tick();
  assert.equal(f.api.manualPlay('first', true), true);
  finish();
  await settle();
  f.api.dispose();
});

test('failed rolling preparation is not retried on every playback tick', async () => {
  const f = fixture();
  f.state.queuePending = true;
  f.state.fail = true;
  f.api.set(true, 5);
  f.tick();
  await settle();
  f.tick();
  await settle();
  const reads = f.state.reads;
  assert.equal(reads, 1);
  for (let i = 0; i < 20; i++) f.tick();
  await settle();
  assert.equal(f.state.reads, reads);
  f.api.dispose();
});

test('manual intent does not start another decoder during next-track preparation', async () => {
  const f = fixture();
  let finish;
  f.state.sourceWait = new Promise((resolve) => {
    finish = resolve;
  });
  f.api.set(true, 5);
  f.tick();
  await settle();
  assert.equal(f.api.diagnostics().stage, 'identifying-source');
  f.api.warmManual();
  await settle();
  assert.equal(f.state.reads, 0);
  finish();
  await settle();
  f.api.dispose();
});

test('cold, cancelled and stale manual preparations never defer native selection', async () => {
  for (const outcome of ['cold', 'cancel', 'replaced', 'identity', 'decode']) {
    const f = fixture();
    f.api.set(true, 3);
    let finish;
    f.state.decodeWait = new Promise((resolve) => {
      finish = resolve;
    });
    f.api.warmManual();
    assert.equal(f.api.manualPlay('chosen'), false);
    if (outcome === 'cancel') f.api.cancel();
    if (outcome === 'replaced') f.state.track = 'different-selection';
    if (outcome === 'identity') f.state.bound = false;
    if (outcome === 'decode') f.state.fail = true;
    finish();
    await settle();
    if (outcome !== 'cold')
      assert.equal(f.api.manualPlay('chosen'), false, outcome);
    assert.equal(f.state.start, undefined);
    f.api.dispose();
  }
});

test('a rapid later selection releases a pending next-track preload', async () => {
  const f = fixture();
  f.audio.currentTime = 4;
  f.api.set(true, 2);
  f.api.warmManual();
  await settle();
  let finish;
  f.state.preloadWait = new Promise((resolve) => {
    finish = resolve;
  });
  assert.equal(f.api.manualPlay('chosen'), true);
  f.state.track = 'chosen';
  f.audio.currentSrc = 'blob:chosen';
  f.audio.currentTime = 0;
  f.audio.dispatchEvent(new Event('playing'));
  assert.equal(f.state.preloads, 1);
  f.api.cancel();
  finish();
  await settle();
  assert.equal(f.state.releases, 1);
  f.api.dispose();
});

test('a warmed same-track seek fades only after the native seek completes', async () => {
  const f = fixture();
  f.audio.currentTime = 4;
  f.api.set(true, 2);
  f.api.warmManual();
  await settle();
  assert.equal(f.api.manualPlay('first', true), true);
  f.audio.seeking = true;
  f.audio.dispatchEvent(new Event('seeking'));
  f.tick();
  assert.equal(f.state.fades.length, 0);
  f.audio.currentTime = 18;
  f.audio.seeking = false;
  f.audio.dispatchEvent(new Event('seeked'));
  assert.equal(f.state.fades.length, 1);
  assert.equal(f.audio.currentTime, 18);
  f.api.dispose();
});

test('a native pause cancels a same-track seek bridge before handoff', async () => {
  const f = fixture();
  f.api.set(true, 2);
  f.api.warmManual();
  await settle();
  assert.equal(f.api.manualPlay('first', true), true);
  f.audio.paused = true;
  f.audio.dispatchEvent(new Event('pause'));
  assert.equal(f.state.stops, 1);
  f.audio.dispatchEvent(new Event('seeked'));
  assert.equal(f.state.fades.length, 0);
  f.api.dispose();
});

test('a host pause fade invalidates a same-track seek bridge', async () => {
  const f = fixture();
  f.api.set(true, 2);
  f.api.warmManual();
  await settle();
  assert.equal(f.api.manualPlay('first', true), true);
  f.state.routeValid = false;
  f.tick();
  assert.equal(f.state.stops, 1);
  assert.match(f.api.label(), /player routing changed/);
  f.api.dispose();
});

test('a repeated native seek cancels its old bridge', async () => {
  const f = fixture();
  f.api.set(true, 2);
  f.api.warmManual();
  await settle();
  assert.equal(f.api.manualPlay('first', true), true);
  f.audio.dispatchEvent(new Event('seeking'));
  f.audio.dispatchEvent(new Event('seeking'));
  f.audio.dispatchEvent(new Event('seeked'));
  assert.equal(f.state.stops, 1);
  assert.equal(f.state.fades.length, 0);
  f.api.dispose();
});

test('a seek cannot hand off to a changed source', async () => {
  const f = fixture();
  f.api.set(true, 2);
  f.api.warmManual();
  await settle();
  assert.equal(f.api.manualPlay('first', true), true);
  f.audio.dispatchEvent(new Event('seeking'));
  f.state.track = 'replacement';
  f.audio.dispatchEvent(new Event('seeked'));
  assert.equal(f.state.stops, 1);
  assert.equal(f.state.fades.length, 0);
  f.api.dispose();
});

test('a changed rendition URL invalidates an otherwise matching outgoing identity', async () => {
  const f = fixture();
  f.api.set(true, 2);
  f.api.warmManual();
  await settle();
  f.state.currentUrl = 'https://a.sndcdn.com/replacement.m3u8';
  assert.equal(f.api.manualPlay('first', true), false);
  f.api.dispose();

  const n = fixture();
  n.state.cached = 30;
  n.api.set(true, 5);
  n.tick();
  await settle();
  await n.opening();
  n.state.currentUrl = 'https://a.sndcdn.com/replacement.m3u8';
  n.audio.currentTime = 25;
  n.tick();
  assert.equal(n.state.clicks, 0);
  assert.equal(n.state.releases, 1);
  n.api.dispose();
});

test('a pending payload hash at the fade boundary waits without dropping the prepared overlap', async () => {
  const f = fixture();
  f.api.set(true, 5);
  f.tick();
  await settle();
  f.state.cached = 24;
  await f.opening();
  f.audio.currentTime = 25;
  f.state.bound = false;
  f.tick();
  assert.equal(f.state.clicks, 0);
  assert.equal(f.state.releases, 0);
  assert.match(f.api.label(), /Waiting for stream verification/);
  f.state.bound = true;
  f.tick();
  assert.equal(f.state.clicks, 1);
  assert.equal(f.state.preloads, 1);
  f.api.dispose();
});

test('pause, seek, disable and manual cancellation dispose the overlap', async () => {
  for (const action of ['pause', 'seeking', 'off', 'cancel']) {
    const f = fixture();
    f.api.set(true, 5);
    f.tick();
    await settle();
    f.state.cached = 24;
    await f.opening();
    f.audio.currentTime = 25;
    f.tick();
    f.state.track = 'second';
    f.audio.currentTime = 0;
    f.tick();
    if (action === 'off') f.api.set(false, 5);
    else if (action === 'cancel') f.api.cancel();
    else if (action === 'seeking')
      f.api.cancel(); // Trusted seek controls cancel before the native seek event.
    else f.audio.dispatchEvent(new Event(action));
    assert.equal(f.state.stops, 1, action);
    f.api.dispose();
  }
});

test('delayed next-track loading never starts a fade or advances an unbuffered queue', async () => {
  const f = fixture();
  f.api.set(true, 5);
  f.tick();
  await settle();
  f.audio.currentTime = 25;
  f.tick();
  assert.equal(f.state.clicks, 0);
  assert.equal(f.state.start, undefined);
  assert.match(f.api.label(), /Buffering the next track/);
  f.state.cached = 2;
  f.audio.currentTime = 27;
  f.tick();
  assert.equal(f.state.clicks, 0);
  f.state.cached = 24;
  await f.opening();
  assert.equal(f.state.clicks, 1);
  assert.equal(f.state.start.seconds, 3);
  f.api.dispose();
});

test('normal-speed next tracks need six buffered seconds, not twenty-four; diagnostics explain readiness', async () => {
  const f = fixture();
  f.state.nextRate = 1;
  f.state.cached = 5;
  f.api.set(true, 5);
  f.tick();
  await settle();
  f.audio.currentTime = 25;
  f.tick();
  assert.equal(f.state.clicks, 0);
  const waiting = f.api.diagnostics();
  assert.equal(waiting.player.requiredSeconds, 6);
  assert.equal(waiting.player.nextBufferedSeconds, 5);
  assert.equal(waiting.stage, 'waiting-for-next-buffer');
  f.state.cached = 6;
  await f.opening();
  assert.equal(f.state.clicks, 1);
  f.api.cancel();
  assert.match(f.api.diagnostics().status, /playback controls changed/);
  assert.ok(!JSON.stringify(f.api.diagnostics()).includes('sndcdn.com'));
  for (let i = 0; i < 20; i++) f.api.set(i % 2 === 0, 5);
  assert.equal(f.api.diagnostics().history.length, 12);
  f.api.dispose();
});

test('queue reordering releases stale preloads and buffers the new next track', async () => {
  const f = fixture();
  f.api.set(true, 5);
  f.tick();
  await settle();
  f.state.cached = 24;
  f.state.nextTrack = 'third';
  f.audio.currentTime = 25;
  f.tick();
  assert.equal(f.state.releases, 1);
  assert.equal(f.state.clicks, 0);
  await settle();
  await f.opening();
  assert.equal(f.state.preloads, 2);
  assert.equal(f.state.clicks, 1);
  f.state.track = 'unexpected';
  f.audio.currentTime = 0;
  f.tick();
  assert.equal(f.state.stops, 1);
  assert.equal(f.state.releases, 2);
  f.api.dispose();
});

test('an initially empty queue is retried when playback advances, without toggling crossfade', async () => {
  const f = fixture();
  f.state.queuePending = true;
  f.api.set(true, 5);
  f.tick();
  await settle();
  assert.equal(f.api.diagnostics().stage, 'unavailable');
  f.tick();
  assert.equal(f.state.preloads, 1);
  f.state.queuePending = false;
  f.audio.currentTime += 2;
  f.tick();
  await settle();
  assert.equal(f.state.preloads, 2);
  f.state.cached = 24;
  await f.opening();
  f.audio.currentTime = 25;
  f.tick();
  assert.equal(f.state.clicks, 1);
  f.api.dispose();
});

test('unsupported sources and decode failures never advance the queue', async () => {
  for (const mode of ['unbound', 'decode', 'timeline']) {
    const f = fixture();
    f.state.bound = mode !== 'unbound';
    f.state.fail = mode === 'decode';
    f.settings.variable = mode === 'timeline';
    f.api.set(true, 5);
    f.tick();
    await settle();
    f.audio.currentTime = 25;
    f.tick();
    assert.equal(f.state.clicks, 0, mode);
    assert.match(f.api.label(), /Playing normally|timeline/);
    f.api.dispose();
  }
});

test('cancelled preparation cannot start later and settings validate before writing', async () => {
  const f = fixture();
  f.api.set(true, 5);
  f.tick();
  f.api.set(false, 5);
  await settle();
  f.audio.currentTime = 25;
  f.tick();
  assert.equal(f.state.clicks, 0);
  const before = [...f.values];
  for (const value of [0, 11, 1.5, Infinity, NaN])
    assert.throws(() => f.api.set(true, value));
  assert.deepEqual([...f.values], before);
  f.api.dispose();
});

test('a late native start stays masked until it matches the already-audible opening', async () => {
  const f = fixture();
  f.state.cached = 24;
  f.api.set(true, 5);
  f.tick();
  await settle();
  await f.opening();
  f.audio.currentTime = 25;
  f.tick();
  f.context.currentTime = 6; // Native startup lasts longer than the overlap.
  f.tick();
  assert.equal(
    f.state.stops,
    0,
    'opening keeps playing after the outgoing tail ends',
  );
  f.state.track = 'second';
  f.audio.currentTime = 0;
  f.tick();
  assert.equal(f.audio.currentTime, 6);
  assert.equal(f.state.fades.length, 0);
  f.context.currentTime = 6.1;
  f.audio.currentTime = 6.1;
  f.tick();
  assert.equal(f.state.fades.length, 1);
  f.context.currentTime = 6.2;
  f.tick();
  assert.equal(f.state.stops, 1);
  f.api.dispose();
});

test('opening cancellation, changed stream and exhausted handoff restore safely', async () => {
  for (const action of ['cancel', 'stream', 'queue', 'timeout']) {
    const f = fixture();
    f.state.cached = 24;
    f.api.set(true, 5);
    f.tick();
    await settle();
    let finish;
    f.state.openingWait = new Promise((resolve) => {
      finish = resolve;
    });
    f.tick();
    await settle();
    assert.equal(f.api.diagnostics().stage, 'decoding-incoming');
    if (action === 'cancel') f.api.cancel();
    if (action === 'stream')
      f.state.nextUrl = 'https://a.sndcdn.com/replacement.m3u8';
    if (action === 'queue') f.state.nextTrack = 'third';
    finish();
    await settle();
    assert.equal(f.state.clicks, 0);
    if (action === 'timeout') {
      f.audio.currentTime = 25;
      f.tick();
      f.context.currentTime = 14;
      f.tick();
      assert.equal(f.state.stops, 1);
      assert.match(f.api.label(), /before SoundCloud could synchronize/);
    } else if (action === 'cancel') assert.equal(f.state.releases, 1);
    else if (action === 'queue') {
      assert.equal(f.state.releases, 1);
      f.audio.currentTime += 2;
      f.tick();
      await settle();
      assert.equal(f.state.preloads, 2);
    } else {
      assert.equal(f.state.releases, 0);
      f.tick();
      await settle();
      f.tick();
      await settle();
      assert.equal(f.api.label(), 'Crossfade ready.');
      assert.equal(f.state.preloads, 1);
    }
    f.api.dispose();
    assert.equal(f.state.releases, action === 'queue' ? 2 : 1);
  }
});

test('adaptive seek lead compensates repeated undershot seeks without changing initial exact seek', async () => {
  const f = fixture();
  f.state.cached = 24;
  f.api.set(true, 5);
  f.tick();
  await settle();
  await f.opening();
  f.audio.currentTime = 25;
  f.tick();
  f.state.track = 'second';
  f.audio.currentTime = 0;
  f.context.currentTime = 1;
  f.tick();
  assert.equal(f.audio.currentTime, 1, 'initial seek uses zero lead');
  // Simulate undershot seek landing 300ms behind desired (2.0) when context advances by 1s.
  f.context.currentTime = 2.0;
  f.audio.currentTime = 1.7;
  f.tick();
  assert.ok(f.audio.currentTime > 2.1, `Expected adaptive lead past 2.0, got ${f.audio.currentTime}`);
  f.api.dispose();
});

test('muted rate pull tightens sub-5ms handoff without seeking and resets to 1 before fadeIn and cancel', async () => {
  const pullCalls = [];
  let f;
  f = fixture(undefined, (audio) => {
    pullCalls.push({ audio, factor: f.api.syncRate(audio) });
  });
  f.state.cached = 24;
  f.api.set(true, 5);
  f.tick();
  await settle();
  await f.opening();
  f.audio.currentTime = 25;
  f.tick();
  f.state.track = 'second';
  f.audio.currentTime = 1;
  f.context.currentTime = 1;
  f.tick();
  // Introduce a 100ms native lag (< 180ms threshold) -> pulls playbackRate faster without seeking.
  f.context.currentTime = 2.0;
  f.audio.currentTime = 1.9;
  f.tick();
  assert.equal(f.audio.currentTime, 1.9, 'small error uses rate pull rather than seek');
  assert.ok(f.api.syncRate(f.audio) > 1.01 && f.api.syncRate(f.audio) <= 1.04);
  assert.ok(pullCalls.length >= 1);

  // Once caught up within 5ms at overlapEnd, rate resets to 1 and fadeIn engages.
  f.context.currentTime = 5.0;
  f.audio.currentTime = 4.998;
  f.tick();
  assert.equal(f.api.syncRate(f.audio), 1);
  assert.equal(f.state.fades.length, 1);

  f.api.cancel();
  assert.equal(f.api.syncRate(f.audio), 1);
  f.api.dispose();
});

test('manualNext launches full buffered overlap when opening is ready and falls back to warm tail otherwise', async () => {
  // 1. Full overlap when job.opening + job.buffer are ready before auto end-of-track threshold.
  const f = fixture();
  f.state.cached = 24;
  f.api.set(true, 5);
  f.tick();
  await settle();
  await f.opening();
  f.audio.currentTime = 23.5; // past job.start (23), before auto trigger (25)
  assert.equal(f.api.manualNext(), true);
  assert.equal(f.state.start.offset, 0.5);
  assert.ok(f.state.start.opening);
  f.api.dispose();

  // 2. Fallback to manualPlay bridge when only warm.tail is prepared.
  const b = fixture();
  b.state.cached = 0;
  b.api.set(true, 5);
  b.tick();
  await settle();
  b.audio.currentTime = 10;
  b.api.warmManual();
  await settle();
  assert.equal(b.api.manualNext(), true);
  assert.equal(b.state.start.opening, null);
  assert.equal(b.state.start.bypassHostFade, true);
  b.state.track = 'second';
  b.audio.currentTime = 0.2;
  b.tick();
  assert.equal(b.state.fades.length, 1, 'wildcard next target accepts next playing track');
  b.api.dispose();
});
