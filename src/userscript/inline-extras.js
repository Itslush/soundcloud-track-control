import { exportAdjustedTrack } from '../audio/local-export.mjs';
import {
  FX_STORAGE,
  PITCH_ENGINE_STORAGE,
  normalizeFxSettings,
  readFxSettings,
  readPitchEngine,
} from '../audio/master-fx.mjs';
import {
  peakProtectionKey,
  readPeakProtection,
} from '../audio/pitch-quality.mjs';
import {
  KEYBIND_STORAGE,
  createKeybindStore,
} from '../controls/tempo-keybinds.js';
import { readTempoIncrement, tempoIncrementKey } from '../controls/tempo-increment.js';
import { pitchSettingsKey } from '../controls/tempo-pitch-settings.js';
import { loadMixerDeck, setMixerVisible, syncMixerDjState } from '../controls/tempo-mixer.js';
import { PRESETS_STORAGE } from '../controls/tempo-presets.js';
import { createTrackDeckTools } from '../controls/track-deck-tools.js';
import { createDjMode } from '../soundcloud/dj-mode.js';

export function migrateTrackStorage() {
  try {
    for (const key of Object.keys(localStorage)) {
      const match = key.match(/^[^.]+\.(soundcloud\.tempo\.track\..+)$/);
      if (!match) continue;
      const destination = match[1];
      if (localStorage.getItem(destination) === null)
        localStorage.setItem(destination, localStorage.getItem(key));
      localStorage.removeItem(key);
    }
  } catch {}
}

export function clampRate(value, min, max) {
  return Math.round(Math.max(min, Math.min(max, value)) * 1000) / 1000;
}

export function formatRate(value) {
  return `${value.toFixed(3).replace(/(\.\d{2})0$/, '$1')}×`;
}

export function buildSliderTicks(steps, min, step) {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const units = Math.round(min / step) + index;
    const height = units % 10 === 0 ? 5 : units % 2 === 0 ? 3 : 1.5;
    return `M${index} 0v${height}`;
  }).join('');
}

export function parseTrackKey(href) {
  if (!href) return '';
  try {
    const url = new URL(href, 'https://soundcloud.com');
    if (
      !['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'].includes(
        url.hostname,
      ) ||
      url.protocol !== 'https:'
    )
      return '';
    const parts = url.pathname.split('/').filter(Boolean);
    if (
      parts.length < 2 ||
      parts.length > 3 ||
      (parts.length === 3 && !/^s-[\w-]+$/.test(parts[2]))
    )
      return '';
    if (
      [
        'sets',
        'tracks',
        'albums',
        'likes',
        'reposts',
        'followers',
        'following',
      ].includes(parts[1])
    )
      return '';
    return `/${parts[0]}/${parts[1]}`;
  } catch {
    return '';
  }
}

export function readCrossfadeNextSettings(
  url,
  { parseTrackKey, tempoStore, applySaved, readSavedEntry, readPitchSetting, readKeyShift },
) {
  const key = parseTrackKey(url);
  if (!key) throw new Error('The next track identity is unavailable.');
  const saved = applySaved ? readSavedEntry(key) : null;
  const savedCues = tempoStore.cues(key);
  return {
    rate: saved ? saved.rate : 1,
    preserve: saved?.preserve ?? readPitchSetting(),
    shift: saved?.keyShift ?? readKeyShift(),
    variable: Boolean(tempoStore.timeline(key)?.enabled),
    cue: savedCues?.[0] ?? 0,
  };
}

export function createInlineExtras({
  tempoStore,
  outputLevel,
  wasmAudio,
  bufferedAudio,
  getCrossfade,
  timeline,
  audioModules,
  createStretchNode,
  parseTrackKey,
  getEmbeddedPages,
  currentTrackKey,
  references,
  readState,
  mutations,
  storageKeys,
}) {
  const keybinds = createKeybindStore({
    onChange: () => mutations.render(),
  });

  const djMode = createDjMode({
    parseTrack: parseTrackKey,
    embeddedKey: (doc) => getEmbeddedPages()?.key(doc) ?? '',
    onRoute: (deck, url) => {
      if (loadMixerDeck(deck, url))
        mutations.announce(`Loaded track into Deck ${deck}.`);
    },
    onStateChange: (state) => {
      if (state.enabled) setMixerVisible(true, true);
      syncMixerDjState(state);
      mutations.announce(
        state.enabled
          ? `DJ mode on (${state.target === 'auto' ? `next: Deck ${state.nextDeck}` : `Deck ${state.target}`}).`
          : 'DJ mode off.',
      );
      mutations.render();
    },
  });

  function readActiveAudio() {
    let first = null;
    for (const ref of references) {
      const audio = ref.deref();
      if (!audio) continue;
      if (!audio.paused) return audio;
      first ??= audio;
    }
    return first;
  }

  const deckTools = createTrackDeckTools({
    store: tempoStore,
    readTrack: currentTrackKey,
    readAudio: readActiveAudio,
    readRate: () => readState().rate,
    setRate: mutations.setRate,
    onChange: () => mutations.render(),
  });

  let previousPresetSnapshot = null;

  function applyPreset(preset) {
    if (!preset) return;
    const current = readState();
    previousPresetSnapshot = {
      rate: current.rate,
      keyShift: current.keyShift(),
      preserve: Boolean(current.preservesKey()),
      fx: readFxSettings(),
    };
    const fx = normalizeFxSettings(preset.fx);
    try {
      localStorage.setItem(FX_STORAGE, JSON.stringify(fx));
      localStorage.setItem(storageKeys.KEY_SHIFT_STORAGE, String(preset.keyShift));
      localStorage.setItem(storageKeys.PITCH_STORAGE, String(Boolean(preset.preserve)));
    } catch {}
    wasmAudio.setFx(fx);
    mutations.setPresetState({
      rate: preset.rate,
      keyShift: preset.keyShift,
      preserve: Boolean(preset.preserve),
    });
    timeline.clearKeyOverride?.();
    getCrossfade()?.settingsChanged();
    mutations.updateAll();
  }

  function undoPreset() {
    if (!previousPresetSnapshot) return false;
    const snap = previousPresetSnapshot;
    previousPresetSnapshot = null;
    try {
      localStorage.setItem(FX_STORAGE, JSON.stringify(snap.fx));
      localStorage.setItem(storageKeys.KEY_SHIFT_STORAGE, String(snap.keyShift));
      localStorage.setItem(storageKeys.PITCH_STORAGE, String(Boolean(snap.preserve)));
    } catch {}
    wasmAudio.setFx(snap.fx);
    mutations.setPresetState({
      rate: snap.rate,
      keyShift: snap.keyShift,
      preserve: Boolean(snap.preserve),
    });
    timeline.clearKeyOverride?.();
    getCrossfade()?.settingsChanged();
    mutations.updateAll();
    mutations.announce('Reverted preset.');
    return true;
  }

  function canUndoPreset() {
    return Boolean(previousPresetSnapshot);
  }

  function exportWav(signal, onProgress) {
    const state = readState();
    return exportAdjustedTrack({
      audio: readActiveAudio(),
      trackKey: currentTrackKey(),
      modules: audioModules,
      resolveSource: (audio, options) =>
        bufferedAudio.resolveSource(audio, options),
      createStretchNode,
      settings: {
        rate: state.rate,
        keyShift: state.keyShift(),
        preserve: state.preservesKey(),
        pitchEngine: readPitchEngine(),
        peakProtection: readPeakProtection(),
        outputDb: outputLevel.value(),
      },
      fx: readFxSettings(),
      onProgress,
      signal,
    });
  }

  function handleShortcut(event) {
    const action = keybinds.match(event);
    if (!action || action === 'deckA' || action === 'deckB') return false;
    event.preventDefault();
    event.stopPropagation();
    const currentRate = readState().rate;
    const increment = readTempoIncrement();
    if (action === 'tempoDown') mutations.setRate(currentRate - increment);
    else if (action === 'tempoUp') mutations.setRate(currentRate + increment);
    else if (action === 'tempoReset') mutations.setRate(1);
    else if (action === 'djMode') djMode.toggle();
    else if (action === 'loopToggle') deckTools.toggleLoopStep();
    else if (action === 'tapBpm') deckTools.tapBpm();
    else if (action.startsWith('cue'))
      deckTools.triggerCue(Number(action.slice(3)) - 1);
    else if (action === 'exportWav')
      void exportWav().catch((error) => {
        mutations.announce(
          error instanceof Error ? error.message : 'WAV export failed.',
        );
      });
    return true;
  }

  function handleStorage(event) {
    const key = event.key;
    const keys = storageKeys;
    const crossfade = getCrossfade();
    if (key === null || key === peakProtectionKey) keys.syncPeakProtection();
    if (
      key === null ||
      [
        'soundcloud.tempo.crossfade',
        'soundcloud.tempo.crossfadeSeconds',
        'soundcloud.tempo.crossfadeBassSwap',
        'soundcloud.tempo.crossfadeCueEntry',
      ].includes(key)
    )
      crossfade?.reload();
    if (
      key === null ||
      key?.startsWith(keys.TRACK_STORAGE) ||
      key?.startsWith('soundcloud.tempo.timeline.')
    )
      keys.scheduleSavedTracks();
    if (key === null || key === keys.WASM_STORAGE) keys.reloadWasm();
    if (key === null || key === keys.PITCH_STORAGE) keys.reloadPitch();
    if (key === null || key?.startsWith(keys.TRACK_STORAGE))
      keys.scheduleArtwork();
    if (key === null || key === keys.SAVED_STORAGE) keys.reloadSaved();
    if (key === null || key === pitchSettingsKey) keys.reloadPitchUi();
    if (key === null || key === tempoIncrementKey) mutations.render();
    if (
      key === null ||
      key === keys.STYLE_STORAGE ||
      key === keys.SHOW_KEY_STORAGE
    )
      keys.syncControlStyle();
    if (key === null || key === keys.KEY_SHIFT_STORAGE) keys.reloadKeyShift();
    if (key === null || key === keys.trackStorageKey()) keys.reloadTrack();
    if (key === null || key === KEYBIND_STORAGE) keybinds.reload();
    if (key === null || key === FX_STORAGE) wasmAudio.setFx(readFxSettings());
    if (key === null || key === PITCH_ENGINE_STORAGE) {
      crossfade?.settingsChanged();
      mutations.updateAll();
    }
    if (
      key === null ||
      key === PRESETS_STORAGE ||
      key?.startsWith('soundcloud.tempo.cues.')
    )
      mutations.render();
  }

  function importSettings() {
    keybinds.reload();
    wasmAudio.setFx(readFxSettings());
    getCrossfade()?.reload();
  }

  return {
    keybinds,
    djMode,
    deckTools,
    handleShortcut,
    applyPreset,
    undoPreset,
    canUndoPreset,
    exportWav,
    handleStorage,
    importSettings,
    dispose() {
      djMode.dispose();
      deckTools.dispose();
    },
  };
}
