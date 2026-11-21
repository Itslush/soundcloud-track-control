import {
  DEFAULT_FX,
  normalizeFxSettings,
  validFxSettings,
} from '../audio/master-fx.mjs';

export const PRESETS_STORAGE = 'soundcloud.tempo.presets';

export const BUILTIN_PRESETS = Object.freeze([
  Object.freeze({
    id: 'normal',
    name: 'Normal',
    builtin: true,
    rate: 1,
    keyShift: 0,
    preserve: false,
    fx: Object.freeze({ ...DEFAULT_FX }),
  }),
  Object.freeze({
    id: 'slowed-reverb',
    name: 'Slowed + Reverb',
    builtin: true,
    rate: 0.85,
    keyShift: 0,
    preserve: false,
    fx: Object.freeze({
      bassDb: 2,
      filter: 0,
      space: 0.42,
      room: 'hall',
      softClip: true,
    }),
  }),
  Object.freeze({
    id: 'nightcore',
    name: 'Nightcore',
    builtin: true,
    rate: 1.25,
    keyShift: 0,
    preserve: false,
    fx: Object.freeze({ ...DEFAULT_FX, softClip: true }),
  }),
  Object.freeze({
    id: 'deep-bass',
    name: 'Deep Bass',
    builtin: true,
    rate: 0.92,
    keyShift: -1,
    preserve: true,
    fx: Object.freeze({
      bassDb: 6,
      filter: 0,
      space: 0.15,
      room: 'room',
      softClip: true,
    }),
  }),
]);

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function validCustomPreset(item) {
  return Boolean(
    item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      typeof item.name === 'string' &&
      item.name.trim().length > 0 &&
      item.name.length <= 40 &&
      typeof item.rate === 'number' &&
      Number.isFinite(item.rate) &&
      item.rate >= 0.25 &&
      item.rate <= 4 &&
      typeof item.keyShift === 'number' &&
      Number.isFinite(item.keyShift) &&
      Math.abs(item.keyShift) <= 12 &&
      typeof item.preserve === 'boolean' &&
      (item.fx === undefined || validFxSettings(item.fx)),
  );
}

function normalizeCustomPreset(item) {
  return {
    name: item.name.trim(),
    builtin: false,
    rate: round(Math.max(0.25, Math.min(4, Number(item.rate)))),
    keyShift: round(Math.max(-12, Math.min(12, Number(item.keyShift)))),
    preserve: Boolean(item.preserve),
    fx: normalizeFxSettings(item.fx),
  };
}

export function readCustomPresets(storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    const raw = store?.getItem?.(PRESETS_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(validCustomPreset)
      .slice(0, 24)
      .map(normalizeCustomPreset);
  } catch {
    return [];
  }
}

export function listPresets(storage) {
  return [...BUILTIN_PRESETS, ...readCustomPresets(storage)];
}

export function saveCustomPreset(
  name,
  settings,
  storage,
) {
  const store = storage ?? globalThis.localStorage;
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName || cleanName.length > 40)
    throw new Error('Enter a preset name up to 40 characters.');
  if (
    BUILTIN_PRESETS.some(
      (preset) => preset.name.toLowerCase() === cleanName.toLowerCase(),
    )
  )
    throw new Error('Choose a name that does not overwrite a built-in preset.');
  const candidate = normalizeCustomPreset({
    name: cleanName,
    rate: settings?.rate ?? 1,
    keyShift: settings?.keyShift ?? 0,
    preserve: settings?.preserve ?? false,
    fx: settings?.fx,
  });
  const current = readCustomPresets(store);
  const existing = current.findIndex(
    (preset) => preset.name.toLowerCase() === cleanName.toLowerCase(),
  );
  const next = [...current];
  if (existing >= 0) {
    next[existing] = candidate;
  } else {
    if (next.length >= 24) throw new Error('Save at most 24 custom presets.');
    next.push(candidate);
  }
  const serialized = next.map(({ builtin: _, ...rest }) => rest);
  store?.setItem?.(PRESETS_STORAGE, JSON.stringify(serialized));
  return candidate;
}

export function deleteCustomPreset(name, storage) {
  const store = storage ?? globalThis.localStorage;
  const cleanName = typeof name === 'string' ? name.trim().toLowerCase() : '';
  const current = readCustomPresets(store);
  const next = current.filter(
    (preset) => preset.name.toLowerCase() !== cleanName,
  );
  if (next.length === current.length) return false;
  if (next.length === 0) store?.removeItem?.(PRESETS_STORAGE);
  else {
    const serialized = next.map(({ builtin: _, ...rest }) => rest);
    store?.setItem?.(PRESETS_STORAGE, JSON.stringify(serialized));
  }
  return true;
}
