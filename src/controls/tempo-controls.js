import { controlsTemplate } from './tempo-controls-template.js';
import { enhanceTempoFields } from './tempo-fields.js';
import { syncTempoRange } from './tempo-range.js';
import {
  readTempoIncrement,
  validTempoIncrement,
  tempoIncrementKey,
} from './tempo-increment.js';
import {
  readPitchSettings,
  validPitchSettings,
  pitchSettingsKey,
} from './tempo-pitch-settings.js';
import { createTempoLibrary } from '../library/tempo-library.js';

export function createTempoControls({
  playback,
  settings,
  services,
  actions,
  limits,
  version,
  website,
  onCreate,
}) {
  const { MIN, MAX, SLIDER_MAX, SLIDER_STEP, SLIDER_STEPS, sliderTicks } =
    limits;
  const STYLE_STORAGE = 'soundcloud.tempo.controlStyle';
  const SHOW_KEY_STORAGE = 'soundcloud.tempo.showKey';
  const KEY_SHIFT_STORAGE = 'soundcloud.tempo.keyShift';
  const WASM_STORAGE = 'soundcloud.tempo.useWasm';
  const PITCH_STORAGE = 'soundcloud.tempo.preserveKey';
  const COPY_STORAGE = 'soundcloud.tempo.copyLinks';
  const SAVED_STORAGE = 'soundcloud.tempo.applySaved';
  let ui;
  let savedRefreshFrame = 0;
  function createView() {
    const host = document.createElement('span');
    host.id = 'soundcloud-tempo-control';
    host.style.cssText = `
      display: flex;
      align-items: center;
      flex: 0 0 348px;
      min-width: 348px;
      margin-inline: 4px;
    `;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = controlsTemplate({
      MIN,
      MAX,
      SLIDER_MAX,
      SLIDER_STEP,
      SLIDER_STEPS,
      sliderTicks,
    });
    const get = (selector) => root.querySelector(selector);
    ui = {
      host,
      root,
      rateNumber: get('#rate-number'),
      slider: get('#rate-slider'),
      dial: get('#rate-dial'),
      verticalToggle: get('#vertical-toggle'),
      fader: get('#tempo-fader'),
      stepUp: get('.step-up'),
      stepDown: get('.step-down'),
      memory: get('.memory'),
      settingsButton: get('.settings-button'),
      error: get('.error'),
      unit: get('.unit'),
      status: get('.status'),
      editTrack: playback.trackKey,
      editingNumber: false,
      settings: get('.settings'),
      savedToggle: get('#apply-saved'),
      copyToggle: get('#copy-tempo-links'),
      pitchToggle: get('#preserve-key'),
      savedFilter: get('#saved-filter'),
      savedList: get('.saved-list'),
      savedCount: get('.saved-count'),
      settingsStatus: get('.settings-status'),
      wasmStatus: get('#wasm-status'),
      outputSlider: get('#output-level'),
      outputValue: get('#output-value'),
      outputStatus: get('#output-status'),
      wasmToggle: get('#use-wasm'),
    };
    Object.assign(ui, {
      render,
      syncControlStyle,
      closeSettings,
      openSettings,
      positionSettings,
      populateSavedTracks,
      scheduleSavedTracks,
    });
    onCreate(ui);
    syncControlStyle();
    ui.fader.addEventListener('beforetoggle', (event) => {
      if (event.newState !== 'open') return;
      const rect = ui.verticalToggle.getBoundingClientRect();
      const footerTop =
        ui.host.closest('.playControls')?.getBoundingClientRect().top ??
        rect.top;
      ui.fader.style.left = `${Math.max(8, Math.min(innerWidth - 104, rect.x + rect.width / 2 - 48))}px`;
      ui.fader.style.bottom = `${innerHeight - Math.min(rect.top, footerTop) + 8}px`;
    });
    ui.fader.addEventListener('toggle', (event) => {
      const open = event.newState === 'open';
      ui.verticalToggle.setAttribute('aria-expanded', String(open));
      if (open) ui.slider.focus();
    });
    window.addEventListener('resize', () => {
      if (ui.fader.matches(':popover-open')) ui.fader.hidePopover();
    });
    get('.fader-reset').addEventListener('click', () => actions.setRate(1));
    const starMotion = get('#star-motion');
    starMotion.checked = services.appearance.motion() === 'on';
    starMotion.addEventListener('change', () =>
      services.appearance.setMotion(starMotion.checked ? 'on' : 'off'),
    );
    const starSpeed = get('#star-speed');
    starSpeed.value = String(services.appearance.speed());
    starSpeed.disabled = !starMotion.checked;
    syncTempoRange(starSpeed);
    get('#star-speed-value').value = `${services.appearance.speed()}×`;
    starSpeed.addEventListener('input', () =>
      services.appearance.setSpeed(Number(starSpeed.value)),
    );
    get('#control-style').addEventListener('change', (event) => {
      try {
        localStorage.setItem(STYLE_STORAGE, event.target.value);
      } catch {
        ui.settingsStatus.textContent = 'Control style could not be saved.';
      }
      syncControlStyle();
    });
    const shiftInput = get('#key-shift');
    for (const id of ['#crossfade', '#crossfade-seconds'])
      get(id).addEventListener('change', () => {
        try {
          services.crossfade.set(
            get('#crossfade').checked,
            Number(get('#crossfade-seconds').value),
          );
        } catch (error) {
          ui.settingsStatus.textContent = `Crossfade could not be saved. ${error.message}`;
          render();
        }
      });
    get('#crossfade-seconds').addEventListener('input', () => {
      get('#crossfade-value').value =
        `${get('#crossfade-seconds').value} seconds`;
    });
    const refreshCrossfadeDebug = () => {
      const report = JSON.stringify(
        { version: version, ...services.crossfade.diagnostics() },
        null,
        2,
      );
      get('#crossfade-debug-output').textContent = report;
      return report;
    };
    get('.crossfade-debug').addEventListener('toggle', () => {
      if (get('.crossfade-debug').open) refreshCrossfadeDebug();
    });
    get('#crossfade-debug-refresh').addEventListener(
      'click',
      refreshCrossfadeDebug,
    );
    get('#crossfade-debug-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(refreshCrossfadeDebug());
        get('#crossfade-debug-feedback').textContent =
          'Diagnostics copied. No track links or account details included.';
      } catch {
        get('#crossfade-debug-feedback').textContent =
          'Could not copy. Select the diagnostics above and copy them manually.';
      }
    });
    get('#show-key').addEventListener('change', (event) => {
      try {
        localStorage.setItem(SHOW_KEY_STORAGE, String(event.target.checked));
      } catch {
        ui.settingsStatus.textContent = 'Key visibility could not be saved.';
      }
      syncControlStyle();
    });
    shiftInput.value = String(playback.keyShift);
    for (const input of [shiftInput, get('#quick-key-shift')])
      input.addEventListener('change', () => {
        const next = Number(input.value);
        if (
          input.value === '' ||
          !Number.isFinite(next) ||
          Math.abs(next) > 12
        ) {
          input.value = String(
            services.timeline.keyShift() ?? playback.keyShift,
          );
          return;
        }
        try {
          localStorage.setItem(KEY_SHIFT_STORAGE, String(next));
        } catch {
          input.value = String(
            services.timeline.keyShift() ?? playback.keyShift,
          );
          ui.settingsStatus.textContent = 'Key shift could not be saved.';
          ui.status.textContent = 'Key shift could not be saved.';
          return;
        }
        actions.keyShiftChanged(next);
        services.crossfade?.cancel();
        services.timeline.setKeyShift(next);
        actions.updateAll();
      });
    ui.syncFields = enhanceTempoFields(ui.root);
    get('#tempo-increment').addEventListener('change', (event) => {
      const increment = Number(event.target.value);
      if (!validTempoIncrement(increment)) {
        ui.settingsStatus.textContent =
          'Choose a tempo increment from 0.001 to 1.';
      } else {
        try {
          localStorage.setItem(tempoIncrementKey, String(increment));
          ui.settingsStatus.textContent = '';
        } catch {
          ui.settingsStatus.textContent = 'Tempo increment could not be saved.';
        }
      }
      event.target.value = String(readTempoIncrement());
      render();
    });
    const syncPitchControls = () => {
      const settings = readPitchSettings();
      for (const name of ['min', 'max', 'step'])
        get('#pitch-' + name).value = String(settings[name]);
      for (const input of [shiftInput, get('#quick-key-shift')]) {
        input.min = String(settings.min);
        input.max = String(settings.max);
        input.step = String(settings.step);
      }
      ui.syncFields();
    };
    for (const name of ['min', 'max', 'step'])
      get('#pitch-' + name).addEventListener('change', () => {
        const settings = Object.fromEntries(
          ['min', 'max', 'step'].map((name) => [
            name,
            Number(get('#pitch-' + name).value),
          ]),
        );
        if (!validPitchSettings(settings)) {
          ui.settingsStatus.textContent =
            'Choose a pitch range inside −12 to +12 and a step between 0.001 and 12.';
          syncPitchControls();
          return;
        }
        try {
          localStorage.setItem(pitchSettingsKey, JSON.stringify(settings));
        } catch {
          ui.settingsStatus.textContent = 'Pitch controls could not be saved.';
        }
        syncPitchControls();
        render();
      });
    ui.syncPitchControls = syncPitchControls;
    syncPitchControls();
    let dialDrag;
    ui.dial.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      ui.dial.focus();
      ui.dial.setPointerCapture(event.pointerId);
      dialDrag = {
        y: event.clientY,
        rate: playback.rate,
        track: playback.trackKey,
      };
    });
    ui.dial.addEventListener('pointermove', (event) => {
      if (!dialDrag || dialDrag.track !== actions.currentTrackKey()) return;
      const distance = dialDrag.y - event.clientY;
      dialDrag.y = event.clientY;
      dialDrag.rate = Math.max(
        MIN,
        Math.min(
          MAX,
          dialDrag.rate * 2 ** (distance / (event.shiftKey ? 800 : 160)),
        ),
      );
      actions.setRate(dialDrag.rate);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
      ui.dial.addEventListener(name, () => {
        dialDrag = null;
      });
    const stepTempo = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const limit =
        event.currentTarget === ui.slider ? Number(ui.slider.max) : MAX;
      const current = Math.min(playback.rate, limit);
      const changes = {
        ArrowUp: readTempoIncrement(),
        ArrowRight: readTempoIncrement(),
        ArrowDown: -readTempoIncrement(),
        ArrowLeft: -readTempoIncrement(),
        PageUp: 0.25,
        PageDown: -0.25,
      };
      if (event.key === 'Home' || event.key === 'End' || event.key in changes) {
        event.preventDefault();
        actions.setRate(
          Math.min(
            limit,
            event.key === 'Home'
              ? MIN
              : event.key === 'End'
                ? limit
                : current + changes[event.key] * (event.shiftKey ? 0.2 : 1),
          ),
        );
      }
    };
    ui.dial.addEventListener('keydown', stepTempo);
    ui.slider.addEventListener('keydown', stepTempo);
    ui.dial.addEventListener('dblclick', () => actions.setRate(1));
    for (const input of root.querySelectorAll('[name="appearance"]')) {
      input.checked = input.value === services.appearance.mode();
      input.addEventListener('change', () => {
        if (!input.checked) return;
        try {
          services.appearance.setMode(input.value);
        } catch {
          for (const option of root.querySelectorAll('[name="appearance"]'))
            option.checked = option.value === services.appearance.mode();
          ui.settingsStatus.textContent = 'Theme could not be saved.';
        }
      });
    }
    ui.library = createTempoLibrary({
      root,
      store: services.tempoStore,
      edit: (track) => services.timeline.open(track),
      changed: actions.savedTrackChanged,
      imported: () => {
        actions.importSettings();
        shiftInput.value = String(playback.keyShift);
      },
    });
    ui.wasmToggle.checked = settings.useWasm;
    ui.wasmToggle.addEventListener('change', () => {
      try {
        localStorage.setItem(WASM_STORAGE, String(ui.wasmToggle.checked));
        actions.wasmChanged(ui.wasmToggle.checked);
        actions.updateAll();
      } catch {
        ui.wasmToggle.checked = settings.useWasm;
        ui.settingsStatus.textContent = 'Audio setting could not be saved.';
      }
    });
    services.outputLevel.syncUI();
    const setOutput = (event) => {
      try {
        services.outputLevel.set(event.target.value);
        ui.settingsStatus.textContent = '';
        render();
      } catch (error) {
        ui.settingsStatus.textContent = error.message;
        services.outputLevel.syncUI();
      }
    };
    ui.outputSlider.addEventListener('input', setOutput);
    ui.outputValue.addEventListener('change', setOutput);
    root.addEventListener('input', (event) => {
      if (event.target.matches("input[type='range']"))
        syncTempoRange(event.target);
    });
    ui.copyToggle.checked = actions.copyLinksEnabled();
    ui.copyToggle.addEventListener('change', () => {
      try {
        localStorage.setItem(COPY_STORAGE, String(ui.copyToggle.checked));
      } catch {
        ui.copyToggle.checked = actions.copyLinksEnabled();
        ui.settingsStatus.textContent = 'Could not save setting.';
      }
    });
    ui.settingsButton.addEventListener('click', () => {
      ui.copyToggle.checked = actions.copyLinksEnabled();
      if (ui.settings.hidden) {
        openSettings(ui.settingsButton);
      } else {
        closeSettings(true);
      }
    });
    get('.open-editor').addEventListener('click', () =>
      services.timeline.open(),
    );
    if (website) {
      const buildSet = document.createElement('button');
      buildSet.type = 'button';
      buildSet.className = 'build-set';
      buildSet.textContent = 'Build a set';
      buildSet.addEventListener('click', () => {
        const original = playback.trackKey
          ? 'https://soundcloud.com' + playback.trackKey
          : '';
        const shared = services.timeline.shareLink(original, true);
        const destination = new URL('set/', website);
        if (shared !== original) destination.hash = new URL(shared).hash;
        window.open(destination.href, '_blank', 'noopener,noreferrer');
      });
      get('.settings-actions').prepend(buildSet);
    }
    ui.pitchToggle.setAttribute('aria-describedby', 'pitch-mode-help');
    ui.pitchToggle.disabled = !actions.supportsPitch();
    if (ui.pitchToggle.disabled) {
      get('#pitch-mode-help').textContent =
        'Pitch preservation is unavailable in this browser. Natural mode remains active.';
    }
    ui.pitchToggle.addEventListener('change', () => {
      try {
        localStorage.setItem(PITCH_STORAGE, String(ui.pitchToggle.checked));
        actions.pitchChanged(ui.pitchToggle.checked);
        actions.updateAll();
        ui.settingsStatus.textContent = services.timeline.pitchMode()
          ? 'Default saved. This timeline keeps its own pitch mode.'
          : settings.preserveKey
            ? services.wasmAudio.label()
            : 'Natural pitch restored.';
      } catch {
        ui.pitchToggle.checked = settings.preserveKey;
        ui.settingsStatus.textContent =
          'Could not save audio mode. Allow site storage and retry.';
      }
    });
    ui.memory.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSettings();
    });
    ui.memory.addEventListener('keydown', (event) => {
      if (
        event.key === 'ContextMenu' ||
        (event.shiftKey && event.key === 'F10') ||
        (event.altKey && event.key === 'Enter')
      ) {
        event.preventDefault();
        event.stopPropagation();
        openSettings();
      }
    });
    get('.close-settings').addEventListener('click', () => closeSettings(true));
    ui.savedFilter.addEventListener('input', populateSavedTracks);
    ui.savedToggle.addEventListener('change', () => {
      try {
        localStorage.setItem(SAVED_STORAGE, String(ui.savedToggle.checked));
        actions.savedPreferenceChanged(ui.savedToggle.checked);
        services.timeline.changeTrack('');
        services.timeline.changeTrack(playback.trackKey);

        actions.updateAll();
        ui.settingsStatus.textContent = settings.applySaved
          ? 'Saved tempos enabled.'
          : 'Saved tempos off.';
      } catch {
        ui.savedToggle.checked = settings.applySaved;
        ui.settingsStatus.textContent =
          'Could not save this preference. Allow site storage and retry.';
      }
    });
    document.addEventListener('pointerdown', (event) => {
      if (
        !event.composedPath().includes(ui.settings) &&
        !event.composedPath().includes(ui.memory) &&
        !event.composedPath().includes(ui.settingsButton)
      ) {
        closeSettings();
      }
    });
    ui.slider.addEventListener('input', () => actions.setRate(ui.slider.value));
    for (const [button, direction] of [
      [ui.stepUp, 1],
      [ui.stepDown, -1],
    ]) {
      let timer;
      let repeated = false;
      let pressedTrack = '';
      const stop = () => clearTimeout(timer);
      button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) {
          return;
        }
        stop();
        repeated = false;
        button.setPointerCapture(event.pointerId);
        const startingTrack = actions.currentTrackKey();
        pressedTrack = startingTrack;
        const step = event.shiftKey ? 0.01 : readTempoIncrement();
        const repeat = () => {
          if (
            actions.currentTrackKey() !== startingTrack ||
            !button.isConnected ||
            button.disabled
          ) {
            stop();
            return;
          }
          repeated = true;
          actions.setRate(playback.rate + direction * step);
          timer = setTimeout(repeat, 100);
        };
        timer = setTimeout(repeat, 400);
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        button.addEventListener(type, stop);
      }
      window.addEventListener('blur', stop);
      document.addEventListener('visibilitychange', stop);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (event.detail !== 0 && pressedTrack !== actions.currentTrackKey()) {
          return;
        }
        if (repeated && event.detail !== 0) {
          repeated = false;
          return;
        }
        actions.setRate(
          playback.rate +
            direction * (event.shiftKey ? 0.01 : readTempoIncrement()),
        );
      });
    }
    ui.slider.addEventListener('dblclick', () => actions.setRate(1));
    ui.rateNumber.addEventListener('dblclick', () => {
      actions.setRate(1);
      ui.rateNumber.value = String(playback.rate);
    });
    ui.slider.addEventListener('pointerdown', () => {
      if (ui.root.activeElement === ui.rateNumber) {
        ui.rateNumber.blur();
      }
      if (playback.rate > Number(ui.slider.max)) {
        actions.setRate(Number(ui.slider.max));
      }
    });
    for (const type of [
      'pointerdown',
      'mousedown',
      'touchstart',
      'click',
      'dblclick',
    ]) {
      ui.slider.addEventListener(type, (event) => event.stopPropagation());
    }
    ui.rateNumber.addEventListener('focus', () => {
      ui.editTrack = playback.trackKey;
    });
    ui.rateNumber.addEventListener('input', () => {
      ui.editingNumber = true;
    });
    const commitNumber = () => {
      const draft = ui.rateNumber.value;
      ui.editingNumber = false;
      const editingTrack = ui.editTrack;
      const changed = actions.syncTrack();
      if (!changed && editingTrack === playback.trackKey) {
        actions.setRate(draft);
      } else {
        actions.updateAll();
      }
      ui.rateNumber.value = String(playback.rate);
      render();
    };
    ui.rateNumber.addEventListener('change', commitNumber);
    ui.rateNumber.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        commitNumber();
        stepTempo(event);
      }
    });
    ui.rateNumber.addEventListener('blur', () => {
      ui.editingNumber = false;
      ui.rateNumber.value = String(playback.rate);
    });
    ui.memory.addEventListener('click', (event) =>
      playback.trackKey
        ? actions.rememberTrack(event.shiftKey)
        : openSettings(),
    );
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && ui.fader.matches(':popover-open')) {
        event.preventDefault();
        event.stopPropagation();
        ui.fader.hidePopover();
        ui.verticalToggle.focus();
        return;
      }
      if (event.key === 'Escape' && !ui.settings.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeSettings(true);
        return;
      }
      if (
        ui.settings.contains(event.target) ||
        services.timeline?.contains(event.target)
      ) {
        event.stopPropagation();
        return;
      }
      if (actions.handleShortcut(event)) {
        ui.rateNumber.value = String(playback.rate);
        return;
      }
      if (event.target === ui.rateNumber && event.key === 'Enter') {
        event.preventDefault();
        commitNumber();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        ui.rateNumber.value = String(playback.rate);
        ui.root.activeElement?.blur();
      }
      event.stopPropagation();
    });
    render();
    return ui;
  }

  function readControlStyle() {
    try {
      const value = localStorage.getItem(STYLE_STORAGE);
      return ['slider', 'dial', 'vertical'].includes(value) ? value : 'slider';
    } catch {
      return 'slider';
    }
  }

  function syncControlStyle() {
    if (!ui) return;
    const style = readControlStyle();
    let showKey = true;
    try {
      showKey = localStorage.getItem(SHOW_KEY_STORAGE) !== 'false';
    } catch {}
    ui.root.querySelector('.quick-key').hidden = !showKey;
    ui.root.querySelector('#show-key').checked = showKey;
    ui.root.querySelector('.controls').classList.toggle('hide-key', !showKey);
    const keySpace = showKey ? 0 : 136;
    ui.host.style.flexBasis = `${(style === 'slider' ? 416 : 312) - keySpace}px`;
    ui.host.style.minWidth = `${(style === 'slider' ? 320 : 312) - keySpace}px`;
    ui.host.style.setProperty('--tempo-compact-width', `${308 - keySpace}px`);
    ui.root.querySelector('.slider-wrap').dataset.style = style;
    ui.root.querySelector('#control-style').value = style;
    ui.slider.hidden = style === 'dial';
    ui.slider.max = String(style === 'vertical' ? MAX : SLIDER_MAX);
    ui.dial.hidden = style !== 'dial';
    ui.verticalToggle.hidden = style !== 'vertical';
    if (style === 'vertical') ui.fader.setAttribute('popover', 'auto');
    else {
      if (ui.fader.matches(':popover-open')) ui.fader.hidePopover();
      ui.fader.removeAttribute('popover');
    }
    ui.slider.setAttribute(
      'aria-orientation',
      style === 'vertical' ? 'vertical' : 'horizontal',
    );
    render();
  }

  function closeSettings(restoreFocus = false) {
    if (!ui) {
      return;
    }
    if (ui.settings.hasAttribute('data-choosing-style')) {
      try {
        localStorage.setItem(
          STYLE_STORAGE,
          ui.root.querySelector('#control-style').value,
        );
      } catch {
        actions.announce(
          'Control style could not be saved. Allow site storage to remember your choice.',
        );
      }
      ui.settings.removeAttribute('data-choosing-style');
      ui.root.querySelector('.control-setup-intro').hidden = true;
      ui.root.querySelector('#settings-title').textContent = 'Tempo settings';
      const close = ui.root.querySelector('.close-settings');
      close.textContent = 'Close';
      close.setAttribute('aria-label', 'Close tempo settings');
    }
    ui.settings.hidden = true;
    ui.settings.hidePopover?.();
    ui.memory.setAttribute('aria-expanded', 'false');
    ui.settingsButton.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      (ui.settingsTrigger || ui.settingsButton).focus();
    }
  }

  function positionSettings() {
    if (!ui || ui.settings.hidden) {
      return;
    }
    const width = Math.min(600, Math.max(0, innerWidth - 24));
    ui.settings.style.width = `${width}px`;
    ui.settings.style.left = `${(innerWidth - width) / 2}px`;
    ui.settings.style.top = '50%';
    ui.settings.style.bottom = 'auto';
    ui.settings.style.transform = 'translateY(-50%)';
  }

  function openSettings(trigger = ui.memory) {
    ui.settingsTrigger = trigger;
    ui.settings.hidden = false;
    ui.memory.setAttribute('aria-expanded', 'true');
    ui.settingsButton.setAttribute('aria-expanded', 'true');
    ui.savedToggle.checked = settings.applySaved;
    ui.pitchToggle.checked = settings.preserveKey;
    ui.settingsStatus.textContent = '';
    ui.savedFilter.value = '';
    ui.library.clearPreview();
    populateSavedTracks();
    positionSettings();
    if (ui.settings.showPopover && !ui.settings.matches(':popover-open')) {
      ui.settings.showPopover();
    }
    ui.savedToggle.focus();
  }

  function populateSavedTracks() {
    ui.library.render();
  }

  function scheduleSavedTracks() {
    if (!ui || ui.settings.hidden || savedRefreshFrame) return;
    savedRefreshFrame = requestAnimationFrame(() => {
      savedRefreshFrame = 0;
      if (!ui.settings.hidden) populateSavedTracks();
    });
  }

  function render() {
    if (!ui) {
      return;
    }
    ui.wasmStatus.textContent =
      services.bufferedAudio?.label() || services.wasmAudio.label();
    const increment = readTempoIncrement();
    const incrementInput = ui.root.querySelector('#tempo-increment');
    if (ui.root.activeElement !== incrementInput)
      incrementInput.value = String(increment);
    ui.stepUp.setAttribute(
      'aria-label',
      `Increase speed by ${increment}×; Shift for 0.01×`,
    );
    ui.stepDown.setAttribute(
      'aria-label',
      `Decrease speed by ${increment}×; Shift for 0.01×`,
    );
    ui.root.querySelector('#crossfade').checked =
      services.crossfade?.enabled() ?? false;
    ui.root.querySelector('#crossfade-seconds').value = String(
      services.crossfade?.seconds() ?? 5,
    );
    ui.root.querySelector('#crossfade-seconds').disabled =
      !services.crossfade?.enabled();
    syncTempoRange(ui.root.querySelector('#crossfade-seconds'));
    ui.root.querySelector('#crossfade-value').value =
      `${services.crossfade?.seconds() ?? 5} seconds`;
    ui.root.querySelector('#crossfade-status').textContent =
      services.crossfade?.label() ?? '';
    ui.outputStatus.textContent =
      services.outputLevel.value() > 0 &&
      ![...services.references].some((ref) => {
        const audio = ref.deref();
        return audio && services.wasmAudio.hasGraph(audio);
      })
        ? 'Boost needs the player’s audio connection. Start playback; reload SoundCloud if it stays unavailable.'
        : '';
    const text = actions.formatRate(playback.rate);
    const shift = services.timeline.keyShift() ?? playback.keyShift;
    services.trackVisuals.pitch(
      playback.trackKey && !playback.failure ? shift : 0,
    );
    const pitch = 12 * Math.log2(playback.rate) + shift;
    const pitchText = `${pitch > 0 ? '+' : ''}${pitch.toFixed(2)} st`;
    const description = actions.preservesKey()
      ? `${text} · Preserve key${shift ? ` · key shift ${shift > 0 ? '+' : ''}${shift} st` : ''}`
      : `${text} · natural pitch ${pitchText}`;
    const sliderRate = actions.clamp(
      Math.round(Math.min(playback.rate, Number(ui.slider.max)) / 0.025) *
        0.025,
    );
    ui.stepUp.disabled = playback.rate >= MAX;
    ui.stepDown.disabled = playback.rate <= MIN;
    if (ui.slider.valueAsNumber !== sliderRate) {
      ui.slider.value = String(sliderRate);
    }
    syncTempoRange(ui.slider);
    ui.dial.setAttribute('aria-valuenow', String(playback.rate));
    const shiftField = ui.root.querySelector('#key-shift');
    if (ui.root.activeElement !== shiftField)
      shiftField.value = String(
        services.timeline.keyShift() ?? playback.keyShift,
      );
    const quickShift = ui.root.querySelector('#quick-key-shift');
    if (ui.root.activeElement !== quickShift)
      quickShift.value = String(Math.round(shift * 1000) / 1000);
    ui.syncFields?.();
    ui.dial.setAttribute('aria-valuetext', description);
    ui.dial.style.setProperty(
      '--dial-angle',
      `${Math.log2(playback.rate) * 67.5}deg`,
    );
    ui.dial.style.setProperty(
      '--dial-unfilled',
      String(50 - Math.log2(playback.rate) * 25),
    );
    ui.root.querySelector('.fader-value').textContent = actions.formatRate(
      playback.rate,
    );
    const sliderDescription =
      playback.rate > Number(ui.slider.max)
        ? `Slider limit ${actions.formatRate(SLIDER_MAX)}; current speed ${description}. Use the number field for speeds above 2×`
        : `${description} · slider steps 0.025×`;
    ui.slider.setAttribute('aria-valuetext', sliderDescription);
    ui.slider.title = 'Tempo · double-click to reset';
    if (ui.root.activeElement !== ui.rateNumber || !ui.editingNumber) {
      ui.rateNumber.value = String(playback.rate);
    }
    ui.rateNumber.title =
      playback.failure || 'Exact tempo · double-click to reset';
    ui.rateNumber.setAttribute(
      'aria-invalid',
      String(Boolean(playback.failure)),
    );
    ui.unit.hidden = Boolean(playback.failure);
    ui.error.hidden = !playback.failure;
    ui.error.title = playback.failure;
    const state =
      playback.savedRate === null
        ? 'unsaved'
        : playback.savedRate === playback.rate
          ? 'saved'
          : 'modified';
    ui.memory.dataset.state = playback.storageFailure ? 'error' : state;
    ui.memory.setAttribute('aria-pressed', String(playback.savedRate !== null));
    let label = !playback.trackKey
      ? 'Settings'
      : state === 'saved'
        ? 'Forget saved tempo'
        : state === 'modified'
          ? 'Update saved tempo'
          : 'Save tempo';
    if (playback.storageFailure) {
      label = playback.storageFailure;
    }
    ui.memory.title = label;
    ui.memory.setAttribute('aria-label', label);
    actions.afterRender(
      `${text} · ${actions.preservesKey() ? 'Preserve key' : pitchText}`,
    );
  }

  return createView();
}
