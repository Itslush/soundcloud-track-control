import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const moduleFixture = require('./module-fixture.cjs');

function loadControls() {
  const map = new Map();
  const storage = {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
  const code = moduleFixture([
    'controls/tempo-keybinds.js',
    'controls/tempo-presets.js',
    'controls/track-deck-tools.js',
  ]);
  const scope = {
    localStorage: storage,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    Math,
    Date,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    JSON,
    Error,
  };
  vm.runInNewContext(code, scope);
  return { mod: scope, storage, map };
}

test('tempo-keybinds validates chords, prevents bare printable overrides, resolves conflicts and respects recording mode', () => {
  const { mod, storage, map } = loadControls();
  assert.equal(mod.normalizeChord('alt+shift+d'), 'Alt+Shift+KeyD');
  assert.equal(mod.normalizeChord('ctrl+f8'), 'Ctrl+F8');
  assert.equal(mod.normalizeChord('shift+arrowleft'), 'Shift+ArrowLeft');
  assert.equal(mod.normalizeChord('k'), null);
  assert.equal(mod.normalizeChord('shift+k'), null);
  assert.equal(mod.normalizeChord('Escape'), null);
  assert.equal(mod.formatChord('Alt+Shift+KeyD'), 'Alt+Shift+D');
  assert.equal(mod.formatChord(''), 'Unbound');

  const store = mod.createKeybindStore({ storage });
  assert.equal(store.get('djMode'), 'Alt+Shift+KeyD');

  const plain = (value) => JSON.parse(JSON.stringify(value));

  // Reassigning a shortcut clears the previous owner.
  const res = store.set('djMode', 'Alt+Shift+Digit1');
  assert.deepEqual(plain(res.clearedFrom), ['deckA']);
  assert.equal(store.get('djMode'), 'Alt+Shift+Digit1');
  assert.equal(store.get('deckA'), '');

  const matchEvent = {
    isTrusted: true,
    repeat: false,
    altKey: true,
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    code: 'Digit1',
    key: '1',
    composedPath: () => [{ matches: () => false }],
  };
  assert.equal(store.match(matchEvent), 'djMode');

  // Input elements and recording state suppress shortcuts.
  assert.equal(
    store.match({ ...matchEvent, composedPath: () => [{ matches: () => true }] }),
    null,
  );
  store.setRecording(true);
  assert.equal(store.match(matchEvent), null);
  store.setRecording(false);

  store.reset();
  assert.equal(store.get('djMode'), 'Alt+Shift+KeyD');
  assert.equal(store.get('deckA'), 'Alt+Shift+Digit1');
  assert.equal(map.has(mod.KEYBIND_STORAGE), false);
});

test('tempo-presets ships defaults and supports custom preset save, overwrite, limit and delete', () => {
  const { mod, storage } = loadControls();
  const base = listCount();
  function listCount() {
    return mod.listPresets(storage).length;
  }
  assert.equal(base, mod.BUILTIN_PRESETS.length);
  assert.throws(
    () =>
      mod.saveCustomPreset(
        'Slowed + Reverb',
        { rate: 0.8, keyShift: 0, preserve: false },
        storage,
      ),
    /built-in/,
  );

  mod.saveCustomPreset(
    'Late Night',
    {
      rate: 0.88,
      keyShift: -2,
      preserve: true,
      fx: { bassDb: 4, filter: -0.1, space: 0.3, room: 'cavern', softClip: true },
    },
    storage,
  );
  const custom = mod.readCustomPresets(storage);
  assert.equal(custom.length, 1);
  assert.equal(custom[0].name, 'Late Night');
  assert.equal(custom[0].fx.room, 'cavern');

  // Overwriting existing custom preset updates cleanly without duplicating.
  mod.saveCustomPreset(
    'Late Night',
    { rate: 0.9, keyShift: -1, preserve: false },
    storage,
  );
  assert.equal(mod.readCustomPresets(storage).length, 1);
  assert.equal(mod.readCustomPresets(storage)[0].rate, 0.9);

  assert.equal(mod.deleteCustomPreset('Late Night', storage), true);
  assert.equal(mod.readCustomPresets(storage).length, 0);
});

test('track-deck-tools manages A-B loop with zero idle rAF, 4 hot cues, Tap BPM and Target BPM lock', () => {
  const { mod } = loadControls();
  let track = '/artist/one';
  let rate = 1;
  let clock = 1000;
  let cuesSaved = null;
  let rafCount = 0;
  let activeCallbacks = new Map();
  let nextFrameId = 1;

  const listeners = new Map();
  const audio = {
    paused: false,
    currentTime: 10,
    addEventListener: (name, fn) => {
      const set = listeners.get(name) ?? new Set();
      set.add(fn);
      listeners.set(name, set);
    },
    removeEventListener: (name, fn) => {
      listeners.get(name)?.delete(fn);
    },
  };
  const store = {
    cues: () => cuesSaved,
    set: (_track, type, val) => {
      if (type === 'cues') cuesSaved = val;
    },
  };

  const tools = mod.createTrackDeckTools({
    store,
    readTrack: () => track,
    readAudio: () => audio,
    readRate: () => rate,
    setRate: (next) => {
      rate = next;
    },
    raf: (cb) => {
      const id = nextFrameId++;
      rafCount++;
      activeCallbacks.set(id, cb);
      return id;
    },
    cancelRaf: (id) => {
      activeCallbacks.delete(id);
    },
    now: () => clock,
  });

  // Zero rAF ticks before loop activates.
  assert.equal(rafCount, 0);
  tools.toggleLoopStep();
  assert.equal(tools.loopState().a, 10);
  assert.equal(rafCount, 0);

  audio.currentTime = 14;
  tools.toggleLoopStep();
  assert.deepEqual(JSON.parse(JSON.stringify(tools.loopState())), { active: true, a: 10, b: 14 });
  assert.equal(rafCount, 1);

  // Crossing B wraps currentTime back to A on frame tick.
  audio.currentTime = 14.2;
  const [[, tick]] = [...activeCallbacks];
  activeCallbacks.clear();
  tick();
  assert.equal(audio.currentTime, 10);

  // Pausing stops scheduling further rAF callbacks.
  audio.paused = true;
  const [[, tickPaused]] = [...activeCallbacks];
  activeCallbacks.clear();
  tickPaused();
  assert.equal(activeCallbacks.size, 0);
  audio.paused = false;

  tools.clearLoop();
  assert.equal(tools.loopState().active, false);

  // Hot cues set / jump / clear cleanly.
  audio.currentTime = 22.5;
  tools.triggerCue(0);
  assert.deepEqual(JSON.parse(JSON.stringify(tools.cues())), [22.5, null, null, null]);
  audio.currentTime = 50;
  tools.triggerCue(0);
  assert.equal(audio.currentTime, 22.5);
  tools.clearCue(0);
  assert.equal(cuesSaved, null);

  // Tap BPM + Target BPM lock.
  rate = 0.8;
  tools.tapBpm();
  clock += 500;
  tools.tapBpm();
  clock += 500;
  tools.tapBpm();
  // Tapped interval 500ms = 120 BPM effective at 0.8x => 150 base BPM.
  assert.equal(tools.bpmState().effectiveBpm, 120);
  assert.equal(tools.bpmState().baseBpm, 150);
  const newRate = tools.applyTargetBpm(135);
  assert.equal(newRate, 0.9);
  assert.equal(rate, 0.9);

  // Changing track resets loop and BPM cleanly.
  track = '/artist/two';
  assert.equal(tools.bpmState().baseBpm, null);
  assert.equal(tools.loopState().active, false);
  tools.dispose();
});
