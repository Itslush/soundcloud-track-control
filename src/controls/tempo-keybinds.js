export const KEYBIND_STORAGE = 'soundcloud.tempo.keybinds';

export const KEYBIND_ACTIONS = Object.freeze([
  { id: 'tempoDown', label: 'Decrease tempo', defaultChord: 'Alt+Shift+ArrowLeft' },
  { id: 'tempoUp', label: 'Increase tempo', defaultChord: 'Alt+Shift+ArrowRight' },
  { id: 'tempoReset', label: 'Reset tempo to 1×', defaultChord: 'Alt+Shift+ArrowDown' },
  { id: 'deckA', label: 'Load hovered track to Deck A', defaultChord: 'Alt+Shift+Digit1' },
  { id: 'deckB', label: 'Load hovered track to Deck B', defaultChord: 'Alt+Shift+Digit2' },
  { id: 'djMode', label: 'Toggle DJ click-to-deck mode', defaultChord: 'Alt+Shift+KeyD' },
  { id: 'loopToggle', label: 'A-B loop set / clear', defaultChord: 'Alt+Shift+KeyL' },
  { id: 'tapBpm', label: 'Tap BPM', defaultChord: 'Alt+Shift+KeyT' },
  { id: 'cue1', label: 'Hot cue 1', defaultChord: 'Alt+Shift+Digit3' },
  { id: 'cue2', label: 'Hot cue 2', defaultChord: 'Alt+Shift+Digit4' },
  { id: 'cue3', label: 'Hot cue 3', defaultChord: 'Alt+Shift+Digit5' },
  { id: 'cue4', label: 'Hot cue 4', defaultChord: 'Alt+Shift+Digit6' },
  { id: 'exportWav', label: 'Export adjusted WAV', defaultChord: '' },
]);

export const DEFAULT_KEYBINDS = Object.freeze(
  Object.fromEntries(KEYBIND_ACTIONS.map((item) => [item.id, item.defaultChord])),
);

const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const MOD_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'CapsLock',
  'NumLock',
  'ScrollLock',
]);
const BANNED_KEYS = new Set(['Escape', 'Enter', 'Tab']);
const NON_CHAR_CODES = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Insert',
  'Backspace',
  'Delete',
]);

const MOD_ALIASES = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  cmd: 'Meta',
  command: 'Meta',
  win: 'Meta',
  super: 'Meta',
};

const KEY_ALIASES = {
  left: 'ArrowLeft',
  arrowleft: 'ArrowLeft',
  right: 'ArrowRight',
  arrowright: 'ArrowRight',
  up: 'ArrowUp',
  arrowup: 'ArrowUp',
  down: 'ArrowDown',
  arrowdown: 'ArrowDown',
  space: 'Space',
  ' ': 'Space',
  minus: 'Minus',
  '-': 'Minus',
  equal: 'Equal',
  '=': 'Equal',
  bracketleft: 'BracketLeft',
  '[': 'BracketLeft',
  bracketright: 'BracketRight',
  ']': 'BracketRight',
};

function canonicalKeyToken(token) {
  if (!token || typeof token !== 'string') return '';
  const trimmed = token.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];
  if (/^key[a-z]$/i.test(trimmed)) return 'Key' + trimmed.slice(3).toUpperCase();
  if (/^[a-z]$/i.test(trimmed)) return 'Key' + trimmed.toUpperCase();
  if (/^digit[0-9]$/i.test(trimmed)) return 'Digit' + trimmed.slice(5);
  if (/^[0-9]$/.test(trimmed)) return 'Digit' + trimmed;
  if (/^f(?:[1-9]|1[0-2])$/i.test(trimmed)) return trimmed.toUpperCase();
  if (NON_CHAR_CODES.has(trimmed)) return trimmed;
  if (
    /^(Comma|Period|Slash|Backslash|Semicolon|Quote|Backquote)$/.test(trimmed)
  )
    return trimmed;
  return '';
}

function isAllowedChord(mods, code) {
  if (!code || MOD_CODES.has(code) || BANNED_KEYS.has(code)) return false;
  if (mods.has('Alt') || mods.has('Ctrl') || mods.has('Meta')) return true;
  if (/^F(?:[1-9]|1[0-2])$/.test(code)) return true;
  return mods.has('Shift') && NON_CHAR_CODES.has(code);
}

export function normalizeChord(value) {
  if (value === '') return '';
  if (typeof value !== 'string') return null;
  const parts = value
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return '';
  const mods = new Set();
  let code = '';
  for (const part of parts) {
    const mod = MOD_ALIASES[part.toLowerCase()];
    if (mod) {
      mods.add(mod);
      continue;
    }
    const nextCode = canonicalKeyToken(part);
    if (!nextCode || code) return null;
    code = nextCode;
  }
  if (!isAllowedChord(mods, code)) return null;
  const ordered = MOD_ORDER.filter((mod) => mods.has(mod));
  return [...ordered, code].join('+');
}

export function eventToChord(event) {
  if (!event) return null;
  const code = canonicalKeyToken(event.code || event.key);
  if (!code || MOD_CODES.has(code)) return null;
  const mods = new Set();
  if (event.ctrlKey) mods.add('Ctrl');
  if (event.altKey) mods.add('Alt');
  if (event.shiftKey) mods.add('Shift');
  if (event.metaKey) mods.add('Meta');
  if (!isAllowedChord(mods, code)) return null;
  const ordered = MOD_ORDER.filter((mod) => mods.has(mod));
  return [...ordered, code].join('+');
}

export function formatChord(chord) {
  if (!chord) return 'Unbound';
  return chord
    .split('+')
    .map((part) => {
      if (part.startsWith('Key')) return part.slice(3);
      if (part.startsWith('Digit')) return part.slice(5);
      if (part.startsWith('Arrow')) return part.slice(5);
      return part;
    })
    .join('+');
}

export function isEditableTarget(event) {
  const path =
    typeof event?.composedPath === 'function' ? event.composedPath() : [event?.target];
  return path.some((node) => {
    if (!node?.matches) return false;
    if (node.id === 'rate-number') return false;
    if (
      node.tagName === 'INPUT' &&
      ['range', 'checkbox', 'radio', 'button'].includes(node.type)
    )
      return false;
    return node.matches(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"])',
    );
  });
}

export function validKeybinds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([action, chord]) =>
      Object.hasOwn(DEFAULT_KEYBINDS, action) &&
      typeof chord === 'string' &&
      normalizeChord(chord) !== null,
  );
}

export function createKeybindStore({
  storage,
  onChange,
} = {}) {
  const getStorage = () => {
    try {
      return storage ?? globalThis.localStorage;
    } catch {
      return null;
    }
  };
  let overrides = read();
  let recording = false;

  function read() {
    try {
      const raw = getStorage()?.getItem?.(KEYBIND_STORAGE);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return {};
      const next = {};
      for (const [action, rawChord] of Object.entries(parsed)) {
        if (!Object.hasOwn(DEFAULT_KEYBINDS, action)) continue;
        const normalized = normalizeChord(rawChord);
        if (normalized !== null && normalized !== DEFAULT_KEYBINDS[action])
          next[action] = normalized;
      }
      return next;
    } catch {
      return {};
    }
  }

  function persist() {
    try {
      const target = getStorage();
      if (!target) throw new Error('Unavailable');
      if (Object.keys(overrides).length === 0)
        target.removeItem?.(KEYBIND_STORAGE);
      else target.setItem?.(KEYBIND_STORAGE, JSON.stringify(overrides));
    } catch {
      throw new Error('Shortcuts could not be saved.');
    }
  }

  function effective() {
    return { ...DEFAULT_KEYBINDS, ...overrides };
  }

  return {
    get: (action) =>
      Object.hasOwn(DEFAULT_KEYBINDS, action)
        ? (overrides[action] ?? DEFAULT_KEYBINDS[action])
        : '',
    getAll: effective,
    isRecording: () => recording,
    setRecording(value) {
      recording = Boolean(value);
    },
    set(action, rawChord) {
      if (!Object.hasOwn(DEFAULT_KEYBINDS, action))
        throw new Error('Unknown shortcut action.');
      const chord = normalizeChord(rawChord);
      if (chord === null)
        throw new Error(
          'Use Alt, Ctrl, Meta, a function key, or Shift + arrow keys.',
        );
      const prev = { ...overrides };
      const clearedFrom = [];
      if (chord) {
        const currentAll = effective();
        for (const [otherAction, otherChord] of Object.entries(currentAll)) {
          if (otherAction !== action && otherChord === chord) {
            overrides[otherAction] = '';
            clearedFrom.push(otherAction);
          }
        }
      }
      if (chord === DEFAULT_KEYBINDS[action]) delete overrides[action];
      else overrides[action] = chord;
      try {
        persist();
      } catch (error) {
        overrides = prev;
        throw error;
      }
      onChange?.(effective());
      return { action, chord, clearedFrom };
    },
    reset() {
      const prev = { ...overrides };
      overrides = {};
      try {
        persist();
      } catch (error) {
        overrides = prev;
        throw error;
      }
      onChange?.(effective());
    },
    match(event) {
      if (!event?.isTrusted || event.repeat || recording || isEditableTarget(event))
        return null;
      const chord = eventToChord(event);
      if (!chord) return null;
      const map = effective();
      for (const item of KEYBIND_ACTIONS) {
        if (map[item.id] === chord) return item.id;
      }
      return null;
    },
    matchAction(event, action) {
      return Boolean(action && this.match(event) === action);
    },
    reload() {
      overrides = read();
      onChange?.(effective());
    },
  };
}
