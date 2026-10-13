import { pitchSettingsKey } from '../controls/tempo-pitch-settings.js';
import { tempoIncrementKey } from '../controls/tempo-increment.js';
import * as audioModules from '../audio/index.mjs';
import { syncTempoRange } from '../controls/tempo-range.js';
import { createTempoAppearance } from '../appearance/tempo-appearance.js';
import { createStretchNode } from '../soundcloud/tempo-dependency.js';
import { createOutputLevel } from '../soundcloud/tempo-output.js';
import { createWasmAudio } from '../soundcloud/tempo-wasm.js';
import { createBufferedPlayback } from '../soundcloud/tempo-buffered.js';
import { createCrossfade } from '../soundcloud/tempo-crossfade.js';
import { createTrackVisuals } from '../soundcloud/tempo-track-visuals.js';
import { createTempoEditor } from '../timeline/tempo-editor.js';
import { createTempoStore } from '../library/tempo-library.js';
import { createTempoEmbeddedPages } from '../soundcloud/tempo-embedded-pages.js';
import { showReleaseNotice } from '../soundcloud/tempo-updates.js';
import { installFooterStyle } from '../soundcloud/footer-style.js';
import { createPageArtwork } from '../soundcloud/page-artwork.js';
import { createMediaGuards } from '../soundcloud/media-guards.js';
import { createMobilePlayer } from '../controls/tempo-mobile-player.js';
import { createMobileAvailability } from '../controls/mobile-availability.js';
import { createTempoControls } from '../controls/tempo-controls.js';
import { createFooterVisuals } from '../soundcloud/footer-visuals.js';
import { installClipboardSharing } from '../sharing/clipboard.js';

(() => {
  'use strict';

  const KEY = '__soundCloudTempoControlV1';
  if (window[KEY]) {
    return;
  }
  window[KEY] = true;
  const VERSION = __TEMPO_VERSION__;
  const WEBSITE = __TEMPO_WEBSITE__;
  const COPY_STORAGE = 'soundcloud.tempo.copyLinks';
  function copyLinksEnabled() {
    try {
      return localStorage.getItem(COPY_STORAGE) === 'true';
    } catch {
      return false;
    }
  }
  const PITCH_STORAGE = 'soundcloud.tempo.preserveKey';
  const WASM_STORAGE = 'soundcloud.tempo.useWasm';
  let timeline = null;
  let clipboardSharing = null;
  let bufferedAudio = null;
  let crossfade = null;
  const trackVisuals = createTrackVisuals({
    document,
    readTrack: () => currentTrackKey(),
  });
  let badgeAnimations = [];
  let appearance = null;
  const MIN = 0.25;
  const MAX = 4;
  const SLIDER_MAX = 2;
  const SLIDER_STEP = 0.025;
  const SLIDER_STEPS = Math.round((SLIDER_MAX - MIN) / SLIDER_STEP);
  const TRACK_STORAGE = 'soundcloud.tempo.track.';
  migrateTrackStorage();

  function migrateTrackStorage() {
    try {
      for (const key of Object.keys(localStorage)) {
        const match = key.match(/^[^.]+\.(soundcloud\.tempo\.track\..+)$/);
        if (!match) continue;
        const destination = match[1];
        if (localStorage.getItem(destination) === null) {
          localStorage.setItem(destination, localStorage.getItem(key));
        }
        localStorage.removeItem(key);
      }
    } catch {}
  }
  const SAVED_STORAGE = 'soundcloud.tempo.applySaved';
  const STYLE_STORAGE = 'soundcloud.tempo.controlStyle';
  const SHOW_KEY_STORAGE = 'soundcloud.tempo.showKey';
  const KEY_SHIFT_STORAGE = 'soundcloud.tempo.keyShift';
  const TRACK_LINK = '.playControls__soundBadge .playbackSoundBadge__titleLink';
  const {
    references,
    discover,
    isAudio,
    applyNative,
    installGuards,
    supportsPitch,
  } = createMediaGuards({
    apply,
    handleShortcut,
    readUI: () => ui,
    readServices: () => ({ outputLevel, wasmAudio, bufferedAudio, crossfade }),
    readPlayback: () => ({
      preserve: preservesKey(),
      useWasm,
      keyShift: timeline.keyShift() ?? keyShift,
      rate,
    }),
  });
  let ui;
  let mobilePlayer;
  const mobileAvailability = createMobileAvailability({
    document,
    website: WEBSITE,
  });
  let controlSetupShown = false;
  let mountQueued = false;
  let failure = '';
  let storageFailure = '';
  let rate = 1;
  let savedRate = null;
  let trackKey = '';
  let lastTrackKey = '';
  let applySaved = readSavedSetting();
  let keyShift = readKeyShift();
  let preserveKey = readPitchSetting();
  let useWasm = readWasmSetting();

  function readWasmSetting() {
    try {
      return localStorage.getItem(WASM_STORAGE) !== 'false';
    } catch {
      return true;
    }
  }

  function preservesKey() {
    const mode = timeline?.pitchMode();
    return mode ? mode === 'preserve' : preserveKey;
  }
  let embeddedPages;
  const pageArtwork = createPageArtwork({
    parseTrackKey,
    readSavedRate,
    formatRate,
    tempoLogo,
    readTrack: () => ({ trackKey, rate, failure }),
    readEmbeddedPages: () => embeddedPages,
  });

  function readSavedSetting() {
    try {
      return localStorage.getItem(SAVED_STORAGE) !== 'false';
    } catch {
      return true;
    }
  }

  function readKeyShift() {
    try {
      const value = Number(localStorage.getItem(KEY_SHIFT_STORAGE));
      return Number.isFinite(value) && Math.abs(value) <= 12 ? value : 0;
    } catch {
      return 0;
    }
  }

  function syncControlStyle() {
    ui?.syncControlStyle();
  }

  function readPitchSetting() {
    try {
      return supportsPitch() && localStorage.getItem(PITCH_STORAGE) === 'true';
    } catch {
      return false;
    }
  }

  function clamp(value) {
    return Math.round(Math.max(MIN, Math.min(MAX, value)) * 1000) / 1000;
  }

  function formatRate(value) {
    return `${value.toFixed(3).replace(/(\.\d{2})0$/, '$1')}×`;
  }

  function sliderTicks() {
    return Array.from({ length: SLIDER_STEPS + 1 }, (_, index) => {
      const units = Math.round(MIN / SLIDER_STEP) + index;
      const height = units % 10 === 0 ? 5 : units % 2 === 0 ? 3 : 1.5;
      return `M${index} 0v${height}`;
    }).join('');
  }

  const footerVisuals = createFooterVisuals({
    readUI: () => ui,
    readPlayback: () => ({ rate, trackKey, failure }),
    themeChanged: () => mobilePlayer?.refresh(),
  });
  function tempoLogo() {
    return footerVisuals.tempoLogo();
  }

  function currentTrackKey() {
    const anchor = document.querySelector(TRACK_LINK);
    const href = anchor?.getAttribute('href');
    return parseTrackKey(clipboardSharing?.originalLink(anchor) ?? href);
  }

  function parseTrackKey(href) {
    if (!href) {
      return '';
    }
    try {
      const url = new URL(href, 'https://soundcloud.com');
      if (
        !['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'].includes(
          url.hostname,
        ) ||
        url.protocol !== 'https:'
      ) {
        return '';
      }
      const parts = url.pathname.split('/').filter(Boolean);
      if (
        parts.length < 2 ||
        parts.length > 3 ||
        (parts.length === 3 && !/^s-[\w-]+$/.test(parts[2]))
      ) {
        return '';
      }
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
      ) {
        return '';
      }
      return `/${parts[0]}/${parts[1]}`;
    } catch {
      return '';
    }
  }

  function storageKey(key) {
    return TRACK_STORAGE + encodeURIComponent(key);
  }

  function readSavedRate(key) {
    try {
      const saved = tempoStore.speed(key);
      return saved?.enabled ? saved.rate : null;
    } catch {
      storageFailure =
        'Track memory is unavailable. Allow site storage and reload.';
      return null;
    }
  }

  function announce(message) {
    if (ui && ui.status.textContent !== message) {
      ui.status.textContent = message;
    }
  }

  function syncTrack() {
    const next = currentTrackKey();
    if (next === trackKey) {
      return false;
    }
    bufferedAudio?.changeTrack(trackKey, next);
    for (const animation of badgeAnimations) animation.cancel();
    badgeAnimations = [];
    if (
      trackKey &&
      next &&
      crossfade?.diagnostics().stage !== 'buffered-overlap' &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      badgeAnimations = [
        ...document.querySelectorAll(
          '.playControls__soundBadge .playbackSoundBadge__avatar, .playControls__soundBadge .playbackSoundBadge__titleContextContainer',
        ),
      ].map((element) =>
        element.animate([{ opacity: 0.25 }, { opacity: 1 }], {
          duration: 240,
          easing: 'ease-out',
        }),
      );
    }
    trackKey = next;
    timeline?.changeTrack(next);
    if (!next) {
      savedRate = null;
      render();
      return false;
    }
    storageFailure = '';
    savedRate = readSavedRate(next);
    if (next === lastTrackKey) {
      render();
      return false;
    }
    lastTrackKey = next;
    rate = applySaved ? clamp(savedRate ?? 1) : 1;
    if (ui) {
      delete ui.memory.dataset.feedback;
      ui.editTrack = next;
      ui.rateNumber.value = String(rate);
    }
    announce(
      savedRate === null
        ? 'New track. Normal speed.'
        : `Playback speed: ${formatRate(rate)}.`,
    );
    render();
    return true;
  }

  function rememberTrack(forget = false) {
    if (ui) {
      delete ui.memory.dataset.feedback;
    }
    if (syncTrack()) {
      updateAll();
      return;
    }
    if (!trackKey) {
      return;
    }
    const remove = savedRate !== null && (forget || savedRate === rate);
    try {
      if (remove) {
        localStorage.removeItem(storageKey(trackKey));
      } else {
        localStorage.setItem(storageKey(trackKey), String(rate));
      }
      savedRate = remove ? null : rate;
      pageArtwork.refreshSaved(trackKey);
      clearTimeout(ui.feedbackTimer);
      ui.memory.dataset.feedback = remove ? '' : 'saved';
      ui.feedbackTimer = setTimeout(
        () => delete ui.memory.dataset.feedback,
        1000,
      );
      storageFailure = '';
      announce(
        remove
          ? 'Saved tempo removed. Playback is unchanged; next visit starts at 1×.'
          : `Remembered ${formatRate(rate)} for this track.`,
      );
    } catch (error) {
      console.warn('[SoundCloud Tempo] Could not save track tempo.', error);
      storageFailure =
        'Could not save track tempo. Allow site storage or free space, then click to retry.';
      announce(storageFailure);
    }
    render();
  }

  function closeSettings(restoreFocus = false) {
    ui?.closeSettings(restoreFocus);
  }
  function positionSettings() {
    ui?.positionSettings();
  }
  function openSettings(trigger) {
    ui?.openSettings(trigger);
  }
  function scheduleSavedTracks() {
    ui?.scheduleSavedTracks();
  }

  function apply(audio) {
    if (!isAudio(audio)) {
      return;
    }
    syncTrack();
    discover(audio);
    timeline?.observe(audio);
    const automated = timeline?.value();
    if (automated !== null && automated !== undefined) {
      rate = automated;
    }
    try {
      if (!bufferedAudio?.sync(audio)) applyNative(audio);
    } catch (error) {
      if (!failure) {
        console.warn('[SoundCloud Tempo]', error);
      }
      failure = 'Could not change playback rate. Reload SoundCloud and retry.';
      announce(failure);
      render();
    }
  }

  function updateAll() {
    syncTrack();
    for (const reference of references) {
      const audio = reference.deref();
      if (!audio) references.delete(reference);
      else apply(audio);
    }
    render();
    timeline?.wake();
  }

  function setRate(value) {
    crossfade?.cancel();
    if (syncTrack()) {
      updateAll();
      return;
    }
    if (String(value).trim() === '') {
      return;
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return;
    }
    rate = clamp(number);
    timeline?.suspend();
    failure = '';
    updateAll();
    if (!failure) announce(`Playback speed ${formatRate(rate)}.`);
  }

  function handleShortcut(event) {
    if (
      !event.altKey ||
      !event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.isComposing
    ) {
      return false;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    setRate(
      event.key === 'ArrowDown'
        ? 1
        : rate + (event.key === 'ArrowLeft' ? -0.05 : 0.05),
    );
    return true;
  }

  function createUi() {
    ui = createTempoControls({
      playback: {
        get rate() {
          return rate;
        },
        get trackKey() {
          return trackKey;
        },
        get keyShift() {
          return keyShift;
        },
        get savedRate() {
          return savedRate;
        },
        get failure() {
          return failure;
        },
        get storageFailure() {
          return storageFailure;
        },
      },
      settings: {
        get applySaved() {
          return applySaved;
        },
        get preserveKey() {
          return preserveKey;
        },
        get useWasm() {
          return useWasm;
        },
      },
      services: {
        appearance,
        crossfade,
        timeline,
        outputLevel,
        wasmAudio,
        bufferedAudio,
        tempoStore,
        references,
        trackVisuals,
      },
      limits: { MIN, MAX, SLIDER_MAX, SLIDER_STEP, SLIDER_STEPS, sliderTicks },
      version: VERSION,
      website: WEBSITE,
      onCreate(view) {
        ui = view;
      },
      actions: {
        setRate,
        currentTrackKey,
        updateAll,
        handleShortcut,
        rememberTrack,
        syncTrack,
        copyLinksEnabled,
        preservesKey,
        formatRate,
        clamp,
        announce,
        supportsPitch,
        keyShiftChanged(value) {
          keyShift = value;
        },
        wasmChanged(value) {
          useWasm = value;
        },
        pitchChanged(value) {
          preserveKey = value;
        },
        savedPreferenceChanged(value) {
          applySaved = value;
          rate = applySaved ? clamp(savedRate ?? 1) : 1;
        },
        savedTrackChanged(track, type) {
          pageArtwork.refreshSaved(track);
          if (type === 'timeline') timeline.refreshSaved(track);
          if (track === trackKey) {
            savedRate = readSavedRate(trackKey);
            if (type === 'speed' && applySaved) rate = clamp(savedRate ?? 1);
          }
          updateAll();
        },
        importSettings() {
          pageArtwork.refreshSaved();
          ui.syncPitchControls?.();
          applySaved = readSavedSetting();
          keyShift = readKeyShift();
          syncControlStyle();
          preserveKey = readPitchSetting();
          useWasm = readWasmSetting();
          savedRate = readSavedRate(trackKey);
          ui.savedToggle.checked = applySaved;
          ui.pitchToggle.checked = preserveKey;
          ui.wasmToggle.checked = useWasm;
          ui.copyToggle.checked = copyLinksEnabled();
          outputLevel.reload();
          crossfade.reload();
          timeline.refreshSaved(trackKey);
          rate = applySaved ? clamp(savedRate ?? 1) : 1;
          updateAll();
        },
        afterRender(description) {
          syncArtworkIndicator(description);
          pageArtwork.schedule();
          mobilePlayer?.refresh();
        },
      },
    });
  }

  function syncTheme() {
    footerVisuals.syncTheme();
  }

  function syncArtworkIndicator(description) {
    footerVisuals.syncArtworkIndicator(description);
  }

  function mount() {
    mobileAvailability.update();
    const bar = document.querySelector('.playControls__elements');
    if (!bar) {
      return;
    }
    installFooterStyle();
    if (!ui) {
      createUi();
      mobilePlayer = createMobilePlayer({
        host: ui.host,
        root: ui.root,
        document,
        media: references,
        changeRate: setRate,
        openSettings,
        cancelTransition: () => crossfade?.cancel('manual transport'),
        readTrack: currentTrackKey,
      });
    }
    bar.classList.add('soundcloud-tempo-footer');
    if (ui.host.parentNode !== bar) {
      closeSettings();
      bar.querySelectorAll('#soundcloud-tempo-control').forEach((node) => {
        if (node !== ui.host) {
          node.remove();
        }
      });
      const volume = bar.querySelector('.playControls__volume');
      bar.insertBefore(
        ui.host,
        volume || bar.querySelector('.playControls__soundBadge'),
      );
      syncTheme();
      showReleaseNotice(ui, VERSION, WEBSITE);
    }
    if (!controlSetupShown) {
      controlSetupShown = true;
      try {
        if (localStorage.getItem(STYLE_STORAGE)) return;
      } catch {
        return;
      }
      if (
        new URLSearchParams(location.search).has('sct') ||
        location.hash.startsWith('#sct=')
      )
        return;
      ui.settings.setAttribute('data-choosing-style', '');
      ui.root.querySelector('.control-setup-intro').hidden = false;
      ui.root.querySelector('#settings-title').textContent =
        'Choose your tempo control';
      ui.root.querySelector('.appearance-settings').open = true;
      const close = ui.root.querySelector('.close-settings');
      close.textContent = 'Use this style';
      close.setAttribute('aria-label', 'Use this style');
      openSettings(ui.settingsButton);
      ui.root.querySelector('#control-style').nextElementSibling?.focus();
    }
  }

  function render() {
    ui?.render();
  }

  function scheduleRefresh() {
    if (mountQueued) return;
    mountQueued = true;
    queueMicrotask(() => {
      mountQueued = false;
      mount();
      updateAll();
    });
  }
  timeline = createTempoEditor({
    pitchControlsChanged: () => ui?.syncPitchControls?.(),
    get applySaved() {
      return applySaved;
    },
    get keyShift() {
      return timeline.keyShift() ?? keyShift;
    },
    get copyLinks() {
      return copyLinksEnabled();
    },
    get pitchMode() {
      return preservesKey() ? 'preserve' : 'natural';
    },
    get defaultPitchMode() {
      return preserveKey ? 'preserve' : 'natural';
    },
    get ready() {
      return Boolean(ui);
    },
    get rate() {
      return rate;
    },
    get root() {
      return ui.root;
    },
    get host() {
      return ui.host;
    },
    parseTrack: parseTrackKey,
    refresh: updateAll,
    normal: () => setRate(1),
    closeSettings,
    message: (text) => {
      ui.settingsStatus.textContent = text;
    },
  });
  const tempoStore = createTempoStore({
    storage: () => localStorage,
    parseTrack: parseTrackKey,
    validateTimeline: timeline.validate,
  });
  appearance = createTempoAppearance({
    onChange() {
      if (!ui) return;
      for (const input of ui.root.querySelectorAll('[name="appearance"]'))
        input.checked = input.value === appearance.mode();
      const moving = appearance.motion() === 'on';
      ui.root.querySelector('#star-motion').checked = moving;
      ui.root.querySelector('#star-speed').value = String(appearance.speed());
      ui.root.querySelector('#star-speed').disabled = !moving;
      syncTempoRange(ui.root.querySelector('#star-speed'));
      ui.root.querySelector('#star-speed-value').value =
        `${appearance.speed()}×`;
      ui.settingsStatus.textContent = '';
      syncTheme();
    },
    onError() {
      if (ui)
        ui.settingsStatus.textContent =
          'Theme applied for this tab. Could not save it.';
    },
  });
  embeddedPages = createTempoEmbeddedPages({
    parseTrack: parseTrackKey,
    currentTrack: () => trackKey,
    copyLinks: copyLinksEnabled,
    shareLink: (text) => timeline.shareLink(text),
    appearance(doc) {
      try {
        return appearance.attachDocument(doc);
      } catch {
        if (ui && appearance.mode() !== 'native')
          ui.settingsStatus.textContent =
            'Theme unavailable in this track view.';
      }
    },
    changed: () => {
      pageArtwork.markDirty();
      pageArtwork.schedule();
    },
  });
  const outputLevel = createOutputLevel({ references, readUI: () => ui });
  const wasmAudio = createWasmAudio({
    audioModules,
    outputLevel,
    createStretchNode,
    preservesKey,
    readKeyShift: () => timeline.keyShift() ?? keyShift,
    readUseWasm: () => useWasm,
    references,
    updateAll,
    apply,
    discover,
    onGraphReady: (audio) => {
      bufferedAudio?.graphReady(audio);
      if (!audio.paused) crossfade?.select(audio);
    },
  });
  bufferedAudio = createBufferedPlayback({
    modules: audioModules,
    graph: wasmAudio,
    readSettings: (audio) => ({
      track: trackKey,
      rate,
      mode: preservesKey() ? 'preserve' : 'natural',
      wasm: useWasm,
      schedule: timeline.playbackSchedule(audio),
    }),
    media: function* () {
      for (const reference of references) {
        const audio = reference.deref();
        if (audio) yield audio;
      }
    },
    applyNative,
    onState: render,
    recoverNative(audio) {
      timeline?.suspend();
      rate = 0.25;
      applyNative(audio);
    },
    onFailure(message) {
      failure = message;
      announce(message);
    },
  });
  crossfade = createCrossfade({
    modules: audioModules,
    graph: wasmAudio,
    sourceFor: (audio) => bufferedAudio.sourceFor(audio),
    resolveSource: (audio, options) =>
      bufferedAudio.resolveSource(audio, options),
    sourceStats: () => bufferedAudio.sourceStats(),
    preloadNext: (audio, options) => bufferedAudio.preloadNext(audio, options),
    readNextSettings: (url) => {
      const key = parseTrackKey(url);
      if (!key) throw new Error('The next track identity is unavailable.');
      return {
        rate: applySaved ? (readSavedRate(key) ?? 1) : 1,
        preserve: preserveKey,
        shift: keyShift,
        variable: Boolean(tempoStore.timeline(key)?.enabled),
      };
    },
    readNextRate: (url) => {
      const key = parseTrackKey(url);
      if (!key) return 4;
      const savedTimeline = tempoStore.timeline(key);
      if (savedTimeline?.enabled)
        return Math.max(
          ...savedTimeline.data.points.map((point) => Math.max(0.25, point.r)),
        );
      return applySaved ? (readSavedRate(key) ?? 1) : 1;
    },
    readTrack: () => currentTrackKey(),
    readSettings: (audio) => ({
      rate,
      preserve: preservesKey(),
      shift: timeline.keyShift() ?? keyShift,
      variable:
        timeline.playbackSchedule(audio)?.isConstantFrom(audio.currentTime) ===
        false,
    }),
    nextButton: () => {
      const button = document.querySelector('.playControls__next');
      const repeatOne = document.querySelector('.playControls__repeat.m-one');
      return button &&
        !button.disabled &&
        button.getAttribute('aria-disabled') !== 'true' &&
        !repeatOne
        ? button
        : null;
    },
    onState: render,
    onVisual(state) {
      trackVisuals.overlap(state);
      mobilePlayer?.overlap(state);
    },
  });
  crossfade.reload();
  document.addEventListener(
    'click',
    (event) => {
      if (
        event.isTrusted &&
        event.target instanceof Element &&
        event.target.closest(
          '.playControls__play,.playControls__next,.playControls__prev,.playControls__repeat,.playbackTimeline',
        )
      )
        crossfade.cancel();
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (
        event.isTrusted &&
        [' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)
      )
        crossfade.cancel();
    },
    true,
  );
  window.addEventListener('pagehide', () => crossfade.dispose());
  installGuards();
  clipboardSharing = installClipboardSharing({
    copyLinksEnabled,
    shareLink: timeline.shareLink,
  });
  const relevantNodes =
    'a[href], audio, .image, .playControls, .playControls__elements, .playableTile, .sound, .queueItemView, .soundBadge, .trackItem';
  const ownedNodes =
    '#soundcloud-tempo-control, #soundcloud-tempo-artwork-indicator, .soundcloud-tempo-page-indicator';

  function relevantMutation(mutation) {
    if (mutation.type === 'attributes') return true;
    for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
      if (!(node instanceof Element)) continue;
      if (node === ui?.host) {
        if (!node.isConnected) return true;
        continue;
      }
      if (node.matches(ownedNodes)) {
        if (!node.isConnected && mutation.target.isConnected) return true;
        continue;
      }
      if (node.matches(relevantNodes) || node.querySelector(relevantNodes))
        return true;
    }
    return false;
  }

  new MutationObserver((mutations) => {
    if (!mutations.some(relevantMutation)) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (isAudio(node)) apply(node);
        else node.querySelectorAll('audio').forEach(apply);
      }
    }
    pageArtwork.markDirty();
    scheduleRefresh();
  }).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href'],
  });
  window.addEventListener('storage', (event) => {
    if (
      event.key === null ||
      [
        'soundcloud.tempo.crossfade',
        'soundcloud.tempo.crossfadeSeconds',
      ].includes(event.key)
    )
      crossfade.reload();
    if (
      event.key === null ||
      event.key?.startsWith(TRACK_STORAGE) ||
      event.key?.startsWith('soundcloud.tempo.timeline.')
    )
      scheduleSavedTracks();
    if (event.key === null || event.key === WASM_STORAGE) {
      useWasm = readWasmSetting();
      if (ui) ui.wasmToggle.checked = useWasm;
      updateAll();
    }
    if (event.key === null || event.key === PITCH_STORAGE) {
      preserveKey = readPitchSetting();
      if (ui) {
        ui.pitchToggle.checked = preserveKey;
      }
      updateAll();
    }
    if (event.key === null || event.key?.startsWith(TRACK_STORAGE)) {
      pageArtwork.schedule();
    }
    if (event.key === null || event.key === SAVED_STORAGE) {
      applySaved = readSavedSetting();
      if (ui) {
        ui.savedToggle.checked = applySaved;
      }
      timeline.changeTrack('');
      timeline.changeTrack(trackKey);
      rate = applySaved ? clamp(savedRate ?? 1) : 1;
      updateAll();
    }
    if (event.key === null || event.key === pitchSettingsKey)
      ui?.syncPitchControls?.();
    if (event.key === null || event.key === tempoIncrementKey) render();
    if (
      event.key === null ||
      event.key === STYLE_STORAGE ||
      event.key === SHOW_KEY_STORAGE
    )
      syncControlStyle();
    if (event.key === null || event.key === KEY_SHIFT_STORAGE) {
      keyShift = readKeyShift();
      timeline.setKeyShift(keyShift);
      if (ui) ui.root.querySelector('#key-shift').value = String(keyShift);
      updateAll();
    }
    if (event.key === null || event.key === storageKey(trackKey)) {
      storageFailure = '';
      savedRate = trackKey ? readSavedRate(trackKey) : null;
      if (applySaved) rate = clamp(savedRate ?? 1);
      updateAll();
    }
  });
  window.addEventListener('resize', syncTheme);
  window.addEventListener('resize', positionSettings);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    pageArtwork.markDirty();
    scheduleRefresh();
    syncTheme();
  });
  const themeObserver = new MutationObserver(syncTheme);
  function observeTheme() {
    for (const element of [document.documentElement, document.body]) {
      if (element)
        themeObserver.observe(element, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme'],
        });
    }
  }
  document.addEventListener('DOMContentLoaded', observeTheme, { once: true });
  observeTheme();
  window
    .matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener('change', syncTheme);
  document.querySelectorAll('audio').forEach(discover);
  mount();
  updateAll();
})();
