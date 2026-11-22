import {
  DEFAULT_FX,
  FX_STORAGE,
  PITCH_ENGINE_STORAGE,
  normalizeFxSettings,
  readFxSettings,
  readPitchEngine,
} from '../audio/master-fx.mjs';
import {
  KEYBIND_ACTIONS,
  eventToChord,
  formatChord,
} from './tempo-keybinds.js';
import { syncTempoRange } from './tempo-range.js';
import {
  deleteCustomPreset,
  listPresets,
  saveCustomPreset,
} from './tempo-presets.js';

function formatTimestamp(seconds) {
  if (!Number.isFinite(seconds)) return 'Empty';
  const total = Math.max(0, seconds);
  const mins = Math.floor(total / 60);
  const secs = (total % 60).toFixed(1).padStart(4, '0');
  return `${mins}:${secs}`;
}

function formatFilterLabel(value) {
  const pct = Math.round(value * 100);
  if (pct === 0) return 'Flat';
  return pct < 0 ? `LPF ${Math.abs(pct)}%` : `HPF ${pct}%`;
}

export function createTempoExtrasUi({ ui, root, playback, services, actions }) {
  const get = (selector) => root.querySelector(selector);
  const bassSwapEl = get('#crossfade-bass-swap');
  const cueEntryEl = get('#crossfade-cue-entry');
  const pitchEngineEl = get('#pitch-engine');
  const outputMaxEl = get('#output-max-db');
  const fxBassEl = get('#fx-bass');
  const fxFilterEl = get('#fx-filter');
  const fxSpaceEl = get('#fx-space');
  const fxRoomEl = get('#fx-room');
  const fxClipEl = get('#fx-soft-clip');
  const fxBassOut = get('#fx-bass-value');
  const fxFilterOut = get('#fx-filter-value');
  const fxSpaceOut = get('#fx-space-value');
  const djToggleEl = get('#dj-mode-toggle');
  const djTargetEl = get('#dj-target');
  const djTargetWrap = get('.dj-target-wrap');
  const presetListEl = get('.preset-list');
  const presetNameEl = get('#preset-name');
  const presetUndoBtn = get('#preset-undo');
  const toolsStatusEl = get('#tools-status');
  const loopReadoutEl = get('#loop-readout');
  const bpmReadoutEl = get('#bpm-readout');
  const bpmTargetEl = get('#bpm-target');
  const exportBtn = get('#export-wav');
  const exportCancelBtn = get('#export-cancel');
  const kbMount = get('.keybinds-mount');
  const kbStatus = get('.kb-status');
  const diagnosticsGroup = get('.diagnostics-group');
  const hudEngine = get('#hud-engine');
  const hudRate = get('#hud-rate');
  const hudFill = get('.hud-meter-fill');
  const hudPeak = get('#hud-peak');
  const hudClip = get('#hud-clip');
  const hudCrossfade = get('#hud-crossfade');

  let activeTab = 'tracks';
  let recordingAction = null;
  let exportController = null;
  let hudFrame = 0;

  function applyFx(next, persist = true) {
    const clean = normalizeFxSettings(next);
    if (persist) {
      try {
        localStorage.setItem(FX_STORAGE, JSON.stringify(clean));
      } catch {
        ui.settingsStatus.textContent = 'FX setting could not be saved.';
      }
    }
    services.wasmAudio?.setFx(clean);
    syncFx();
  }

  function syncFx() {
    const fx = readFxSettings();
    fxBassEl.value = String(fx.bassDb);
    fxBassOut.value = `${fx.bassDb} dB`;
    syncTempoRange(fxBassEl);
    fxFilterEl.value = String(Math.round(fx.filter * 100));
    fxFilterOut.value = formatFilterLabel(fx.filter);
    const filterFill =
      fx.filter === 0
        ? '0%'
        : `${((Number(fxFilterEl.value) + 100) / 200) * 100}%`;
    if (fxFilterEl.style.getPropertyValue('--range-fill') !== filterFill)
      fxFilterEl.style.setProperty('--range-fill', filterFill);
    fxSpaceEl.value = String(Math.round(fx.space * 100));
    fxSpaceOut.value = `${Math.round(fx.space * 100)}%`;
    syncTempoRange(fxSpaceEl);
    fxRoomEl.value = fx.room;
    fxClipEl.checked = fx.softClip;
  }

  function currentFxFromInputs() {
    return normalizeFxSettings({
      bassDb: Number(fxBassEl.value),
      filter: Number(fxFilterEl.value) / 100,
      space: Number(fxSpaceEl.value) / 100,
      room: fxRoomEl.value,
      softClip: fxClipEl.checked,
    });
  }

  for (const el of [fxBassEl, fxFilterEl, fxSpaceEl, fxRoomEl, fxClipEl]) {
    el.addEventListener('input', () => applyFx(currentFxFromInputs(), true));
    el.addEventListener('change', () => applyFx(currentFxFromInputs(), true));
  }

  get('#fx-reset').addEventListener('click', () => {
    try {
      localStorage.removeItem(FX_STORAGE);
    } catch {}
    applyFx({ ...DEFAULT_FX }, false);
    toolsStatusEl.textContent = 'FX reset to flat bypass.';
  });

  for (const el of [bassSwapEl, cueEntryEl]) {
    el.addEventListener('change', () => {
      try {
        services.crossfade?.set(
          get('#crossfade').checked,
          Number(get('#crossfade-seconds').value),
          {
            bassSwap: bassSwapEl.checked,
            cueEntry: cueEntryEl.checked,
          },
        );
      } catch (error) {
        ui.settingsStatus.textContent = `Crossfade could not be saved. ${error.message}`;
        sync();
      }
    });
  }

  pitchEngineEl.addEventListener('change', () => {
    try {
      localStorage.setItem(
        PITCH_ENGINE_STORAGE,
        JSON.stringify(pitchEngineEl.value),
      );
      ui.settingsStatus.textContent = '';
    } catch {
      ui.settingsStatus.textContent = 'Pitch engine could not be saved.';
    }
    services.crossfade?.settingsChanged();
    actions.updateAll();
  });

  outputMaxEl.addEventListener('change', () => {
    try {
      services.outputLevel.setMax(outputMaxEl.value);
      ui.settingsStatus.textContent = '';
      actions.updateAll();
    } catch (error) {
      ui.settingsStatus.textContent = error.message;
      services.outputLevel.syncUI();
    }
  });

  djToggleEl.addEventListener('change', () => {
    services.djMode?.setEnabled(djToggleEl.checked);
    syncDeckTools();
  });

  djTargetEl.addEventListener('change', () => {
    services.djMode?.setTarget(djTargetEl.value);
    syncDeckTools();
  });

  function renderPresets() {
    presetListEl.replaceChildren();
    const currentRate = Math.round(playback.rate * 1000) / 1000;
    const currentShift =
      Math.round((services.timeline.keyShift() ?? playback.keyShift) * 1000) /
      1000;
    const currentPreserve = actions.preservesKey();
    const currentFx = readFxSettings();
    for (const preset of listPresets()) {
      const wrap = document.createElement('span');
      wrap.className = 'preset-item';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-chip';
      btn.textContent = preset.name;
      const matches =
        preset.rate === currentRate &&
        preset.keyShift === currentShift &&
        preset.preserve === currentPreserve &&
        JSON.stringify(normalizeFxSettings(preset.fx)) ===
          JSON.stringify(currentFx);
      btn.setAttribute('aria-pressed', String(matches));
      btn.addEventListener('click', () => {
        actions.applyPreset?.(preset);
        toolsStatusEl.textContent = `Applied ${preset.name}.`;
        sync();
      });
      wrap.append(btn);
      if (!preset.builtin) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'preset-del';
        del.textContent = '×';
        del.setAttribute('aria-label', `Delete preset ${preset.name}`);
        del.addEventListener('click', () => {
          deleteCustomPreset(preset.name);
          toolsStatusEl.textContent = `Deleted ${preset.name}.`;
          renderPresets();
        });
        wrap.append(del);
      }
      presetListEl.append(wrap);
    }
    if (presetUndoBtn) presetUndoBtn.hidden = !actions.canUndoPreset?.();
  }

  presetUndoBtn?.addEventListener('click', () => {
    if (!actions.undoPreset?.()) return;
    toolsStatusEl.textContent = 'Reverted previous preset.';
    sync();
  });

  get('#preset-save').addEventListener('click', () => {
    try {
      const saved = saveCustomPreset(presetNameEl.value, {
        rate: playback.rate,
        keyShift: services.timeline.keyShift() ?? playback.keyShift,
        preserve: actions.preservesKey(),
        fx: readFxSettings(),
      });
      presetNameEl.value = '';
      toolsStatusEl.textContent = `Saved preset "${saved.name}".`;
      renderPresets();
    } catch (error) {
      toolsStatusEl.textContent = error.message;
    }
  });

  get('#loop-a').addEventListener('click', () => {
    services.deckTools?.setA();
    syncDeckTools();
  });
  get('#loop-b').addEventListener('click', () => {
    const state = services.deckTools?.setB();
    if (!state?.active)
      toolsStatusEl.textContent =
        'Move playback after Point A before setting B.';
    syncDeckTools();
  });
  get('#loop-clear').addEventListener('click', () => {
    services.deckTools?.clearLoop();
    syncDeckTools();
  });

  for (const pad of root.querySelectorAll('.cue-pad')) {
    pad.addEventListener('click', (event) => {
      const idx = Number(pad.dataset.cue);
      if (event.shiftKey) services.deckTools?.clearCue(idx);
      else services.deckTools?.triggerCue(idx);
      syncDeckTools();
    });
  }
  for (const clr of root.querySelectorAll('.cue-clear')) {
    clr.addEventListener('click', () => {
      const idx = Number(clr.dataset.cueClear);
      services.deckTools?.clearCue(idx);
      syncDeckTools();
    });
  }

  get('#bpm-tap').addEventListener('click', () => {
    services.deckTools?.tapBpm();
    syncDeckTools();
  });
  get('#bpm-reset').addEventListener('click', () => {
    services.deckTools?.resetBpm();
    syncDeckTools();
  });
  get('#bpm-lock').addEventListener('click', () => {
    try {
      const next = services.deckTools?.applyTargetBpm(bpmTargetEl.value);
      toolsStatusEl.textContent = `Matched speed to ${next}×.`;
      syncDeckTools();
    } catch (error) {
      toolsStatusEl.textContent = error.message;
    }
  });

  exportBtn.addEventListener('click', async () => {
    if (exportController) return;
    exportController = new AbortController();
    exportBtn.disabled = true;
    exportCancelBtn.hidden = false;
    try {
      const file = await actions.exportWav?.(
        exportController.signal,
        (_pct, msg) => {
          toolsStatusEl.textContent = msg;
        },
      );
      if (file) toolsStatusEl.textContent = `Saved ${file}.`;
    } catch (error) {
      toolsStatusEl.textContent =
        error?.name === 'AbortError'
          ? 'WAV export cancelled.'
          : error?.message || 'WAV export failed.';
    } finally {
      exportController = null;
      exportBtn.disabled = false;
      exportCancelBtn.hidden = true;
    }
  });
  exportCancelBtn.addEventListener('click', () => exportController?.abort());

  function stopRecording(message = '', refocus = false) {
    if (recordingAction === null) return;
    const action = recordingAction;
    recordingAction = null;
    services.keybinds?.setRecording(false);
    window.removeEventListener('keydown', onRecordKey, true);
    if (message) kbStatus.textContent = message;
    renderKeybinds(refocus ? action : null);
  }

  function onRecordKey(event) {
    if (recordingAction === null) return;
    if (
      ['Control', 'Shift', 'Alt', 'Meta', 'OS', 'CapsLock'].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    if (event.key === 'Escape') {
      stopRecording('Shortcut edit cancelled.', true);
      return;
    }
    if (
      (event.key === 'Backspace' || event.key === 'Delete') &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.shiftKey
    ) {
      try {
        services.keybinds?.set(recordingAction, '');
        stopRecording('Shortcut cleared.', true);
      } catch (error) {
        kbStatus.textContent = error.message;
      }
      return;
    }
    const chord = eventToChord(event);
    if (!chord) {
      kbStatus.textContent =
        'Use Alt, Ctrl, Meta, F1-F12, or Shift + arrow keys.';
      return;
    }
    try {
      const res = services.keybinds?.set(recordingAction, chord);
      const conflictNames = (res?.clearedFrom ?? []).map(
        (id) => KEYBIND_ACTIONS.find((a) => a.id === id)?.label || id,
      );
      const conflictNote = conflictNames.length
        ? ` Reassigned from ${conflictNames.join(', ')}.`
        : '';
      stopRecording(`Bound ${formatChord(chord)}.${conflictNote}`, true);
    } catch (error) {
      kbStatus.textContent = error.message;
    }
  }

  const KB_GROUPS = [
    { title: 'Playback', ids: ['tempoDown', 'tempoUp', 'tempoReset'] },
    { title: 'Mixer & DJ', ids: ['djMode', 'deckA', 'deckB'] },
    {
      title: 'Loops, Cues & Export',
      ids: [
        'loopToggle',
        'tapBpm',
        'cue1',
        'cue2',
        'cue3',
        'cue4',
        'exportWav',
      ],
    },
  ];

  function renderKeybinds(focusAction = null) {
    if (!services.keybinds) return;
    const map = services.keybinds.getAll();
    kbMount.replaceChildren();
    let buttonToFocus = null;
    for (const group of KB_GROUPS) {
      const heading = document.createElement('h4');
      heading.className = 'kb-group-title';
      heading.textContent = group.title;
      kbMount.append(heading);
      for (const id of group.ids) {
        const item = KEYBIND_ACTIONS.find((entry) => entry.id === id);
        if (!item) continue;
        const row = document.createElement('div');
        row.className = 'kb-row';
        const label = document.createElement('span');
        label.className = 'kb-name';
        label.textContent = item.label;
        const keyBtn = document.createElement('button');
        keyBtn.type = 'button';
        keyBtn.className = 'kb-key';
        keyBtn.dataset.action = item.id;
        const activeRec = recordingAction === item.id;
        keyBtn.dataset.recording = String(activeRec);
        keyBtn.textContent = activeRec
          ? 'Press keys…'
          : formatChord(map[item.id]);
        keyBtn.setAttribute(
          'aria-label',
          `${item.label}: ${formatChord(map[item.id])}. Click to change`,
        );
        if (focusAction === item.id) buttonToFocus = keyBtn;
        keyBtn.addEventListener('click', () => {
          if (activeRec) {
            stopRecording('Shortcut edit cancelled.', true);
            return;
          }
          stopRecording('');
          recordingAction = item.id;
          services.keybinds.setRecording(true);
          window.addEventListener('keydown', onRecordKey, true);
          kbStatus.textContent = `Press a chord for ${item.label}, or Esc to cancel.`;
          renderKeybinds(item.id);
        });
        const clr = document.createElement('button');
        clr.type = 'button';
        clr.className = 'kb-clear';
        clr.textContent = 'Clear';
        clr.setAttribute('aria-label', `Clear shortcut for ${item.label}`);
        clr.disabled = !map[item.id];
        clr.addEventListener('click', () => {
          stopRecording('');
          try {
            services.keybinds.set(item.id, '');
            kbStatus.textContent = `${item.label} cleared.`;
            renderKeybinds();
          } catch (error) {
            kbStatus.textContent = error.message;
          }
        });
        row.append(label, keyBtn, clr);
        kbMount.append(row);
      }
    }
    buttonToFocus?.focus();
  }

  get('#kb-reset').addEventListener('click', () => {
    stopRecording('');
    services.keybinds?.reset();
    kbStatus.textContent = 'Default shortcuts restored.';
    renderKeybinds();
  });

  function updateHudOnce() {
    const snap = services.wasmAudio?.dspSnapshot?.() ?? {
      engine: readPitchEngine(),
      mode: 'bypass',
      sampleRate: 0,
      latencyMs: 0,
      peakDb: -96,
      peakHoldDb: -96,
      clipped: false,
    };
    hudEngine.textContent = `${snap.engine} (${snap.mode})`;
    hudRate.textContent = `${snap.sampleRate} Hz · ${snap.latencyMs} ms`;
    const pct = Math.max(0, Math.min(100, ((snap.peakDb + 60) / 60) * 100));
    hudFill.style.transform = `scaleX(${(pct / 100).toFixed(3)})`;
    hudPeak.textContent = `${snap.peakDb.toFixed(1)} dB / ${snap.peakHoldDb.toFixed(1)} dB`;
    hudClip.dataset.clipped = String(snap.clipped);
    hudClip.textContent = snap.clipped ? 'CLIP (Reset)' : 'Clean';
    hudCrossfade.textContent = services.crossfade?.label() || 'Idle';
  }

  function hudVisible() {
    return (
      !ui.settings.hidden &&
      activeTab === 'audio' &&
      Boolean(diagnosticsGroup?.open) &&
      !document.hidden
    );
  }

  function hudTick() {
    hudFrame = 0;
    if (!hudVisible()) return;
    updateHudOnce();
    hudFrame = requestAnimationFrame(hudTick);
  }

  function ensureHud() {
    if (hudVisible()) {
      updateHudOnce();
      if (!hudFrame) hudFrame = requestAnimationFrame(hudTick);
    } else if (hudFrame) {
      cancelAnimationFrame(hudFrame);
      hudFrame = 0;
    }
  }

  diagnosticsGroup?.addEventListener('toggle', ensureHud);
  hudClip.addEventListener('click', () => {
    services.wasmAudio?.resetPeakHold?.();
    updateHudOnce();
  });
  document.addEventListener('visibilitychange', ensureHud);

  function syncDeckTools() {
    const dj = services.djMode?.state?.();
    if (dj) {
      djToggleEl.checked = dj.enabled;
      djTargetEl.value = dj.target;
    }
    if (djTargetWrap) djTargetWrap.hidden = !dj?.enabled;
    const loop = services.deckTools?.loopState?.() ?? {
      active: false,
      a: null,
      b: null,
    };
    loopReadoutEl.textContent = loop.active
      ? `${formatTimestamp(loop.a)} -> ${formatTimestamp(loop.b)}`
      : loop.a !== null
        ? `A ${formatTimestamp(loop.a)}`
        : 'Off';
    const cues = services.deckTools?.cues?.() ?? [null, null, null, null];
    for (let i = 0; i < 4; i++) {
      const pad = get(`.cue-pad[data-cue="${i}"]`);
      const clr = get(`.cue-clear[data-cue-clear="${i}"]`);
      const val = cues[i];
      const set = val !== null && val !== undefined;
      pad.dataset.set = String(set);
      pad.textContent = `Cue ${i + 1}: ${set ? formatTimestamp(val) : 'Empty'}`;
      if (clr) clr.hidden = !set;
    }
    const bpm = services.deckTools?.bpmState?.();
    if (bpm) {
      bpmReadoutEl.textContent =
        bpm.effectiveBpm !== null
          ? `${bpm.effectiveBpm.toFixed(1)} BPM`
          : bpm.taps === 1
            ? '1 tap…'
            : 'No BPM';
    }
  }

  function sync() {
    bassSwapEl.checked = services.crossfade?.bassSwap?.() ?? false;
    cueEntryEl.checked = services.crossfade?.cueEntry?.() ?? false;
    pitchEngineEl.value = readPitchEngine();
    syncFx();
    renderPresets();
    syncDeckTools();
    if (activeTab === 'shortcuts' && !ui.settings.hidden) renderKeybinds();
    if (hudVisible()) updateHudOnce();
  }

  return {
    sync,
    onTabChange(tabId) {
      activeTab = tabId;
      if (tabId === 'shortcuts') renderKeybinds();
      else stopRecording('');
      ensureHud();
    },
    onSettingsOpen() {
      sync();
      ensureHud();
    },
    onSettingsClose() {
      stopRecording('');
      if (hudFrame) {
        cancelAnimationFrame(hudFrame);
        hudFrame = 0;
      }
    },
    dispose() {
      stopRecording('');
      exportController?.abort();
      if (hudFrame) {
        cancelAnimationFrame(hudFrame);
        hudFrame = 0;
      }
      document.removeEventListener('visibilitychange', ensureHud);
    },
  };
}
