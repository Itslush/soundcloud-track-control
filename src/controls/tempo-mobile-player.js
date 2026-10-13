import { enhanceTempoFields } from './tempo-fields.js';
import { syncTempoRange } from './tempo-range.js';
import { readTrackArtwork } from '../soundcloud/tempo-track-visuals.js';
import { createMobileLayout } from '../soundcloud/mobile-layout.js';

export function touchViewport(
  viewport,
  screenWidth,
  coarse,
  touchPoints = 0,
  screenHeight = screenWidth,
) {
  const scale = Math.max(0.01, viewport?.scale || 1);
  const width = (viewport?.width || screenWidth) * scale;
  return {
    touch:
      (coarse || touchPoints > 0) &&
      Math.min(screenWidth || width, screenHeight || width, width) <= 600,
    scale,
    width,
    height: (viewport?.height || 0) * scale,
    left: viewport?.offsetLeft || 0,
    top: viewport?.offsetTop || 0,
  };
}

const style = `
:host { position:relative; }
.touch-adjustments [hidden] { display:none !important; }
.touch-transport,.touch-adjustments { display:none; }
:host([data-touch-player]) { position:fixed !important; display:block !important; left:var(--touch-left) !important; top:var(--touch-dock-top) !important; bottom:auto !important; right:auto; width:var(--touch-width) !important; max-height:var(--touch-panel-height); overflow:auto; overscroll-behavior:contain; min-width:0 !important; margin:0 !important; padding:8px 12px max(8px,env(safe-area-inset-bottom)); transform:scale(var(--touch-inverse)); transform-origin:0 0; z-index:2147483646; font:16px/1.4 Arial,sans-serif; color:var(--tempo-fg); background:var(--tempo-surface); border:0; border-top:1px solid var(--tempo-track); visibility:visible !important; box-sizing:border-box; }
:host([data-touch-player]) .controls { display:none; }
:host([data-touch-player])::backdrop { display:none; }
:host([data-touch-player]) .touch-transport { display:grid; grid-template-columns:44px minmax(0,1fr) 44px 44px 64px; align-items:center; gap:6px; }
.touch-transport button,.touch-adjustments button { display:flex; align-items:center; justify-content:center; min-height:44px; min-width:44px; border:1px solid var(--tempo-track); border-radius:4px; padding:6px; background:var(--tempo-surface); color:var(--tempo-fg); font:inherit; }
.touch-transport button:disabled { opacity:.5; }
.touch-transport svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.8; }
.touch-art { width:44px; height:44px; border-radius:4px; background-position:center; background-size:cover; }
.touch-art { position:relative; overflow:hidden; }
.touch-cover,.touch-cover > span { position:absolute; inset:0; pointer-events:none; background-position:center; background-size:cover; }
.touch-cover { transition:--tempo-artwork-start 100ms linear,--tempo-artwork-end 100ms linear,--tempo-artwork-progress 100ms linear; }
.touch-cover > span:last-child { mask-image:linear-gradient(to right,transparent var(--tempo-artwork-start),#000 var(--tempo-artwork-end)); }
@media(prefers-reduced-motion:reduce) { .touch-cover { transition:--tempo-artwork-progress 100ms linear; } .touch-cover > span:last-child { mask-image:none; opacity:var(--tempo-artwork-progress); } }
.touch-pitch-notice[hidden],.touch-feedback:empty { display:none; }
.touch-feedback { margin:0; font-size:14px; }
.touch-caption { min-width:0; overflow:hidden; }
.touch-caption strong,.touch-caption span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.touch-caption strong { font-size:14px; }
.touch-caption span { font-size:12px; }
:host([data-touch-player]) .touch-caption { grid-column:2 / -1; }
:host([data-touch-player]) .touch-caption strong { white-space:normal; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
:host([data-touch-player]) .touch-play { grid-column:3; grid-row:2; }
:host([data-touch-player]) .touch-next { grid-column:4; grid-row:2; }
:host([data-touch-player]) .touch-expand { grid-column:5; grid-row:2; font-size:14px; }
:host([data-touch-player]) .touch-settings { grid-column:1 / 3; grid-row:2; font-size:14px; justify-self:start; padding-inline:12px; }
:host([data-touch-player][data-touch-expanded]) .touch-adjustments { display:grid; gap:12px; padding-top:12px; }
.touch-adjustments label { display:grid; grid-template-columns:68px minmax(0,1fr); gap:8px; align-items:center; }
.touch-adjustments .touch-number-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px; align-items:center; }
.touch-adjustments .tempo-number { display:grid; grid-template-columns:minmax(0,1fr) 44px 44px; width:100%; }
.touch-adjustments .tempo-number-arrows { display:contents; }
.touch-adjustments .tempo-number input { width:100%; min-width:0; min-height:44px; padding:6px 12px; border:1px solid var(--tempo-track); border-radius:4px; font:inherit; text-align:center; background:var(--tempo-surface); color:var(--tempo-fg); appearance:textfield; }
.touch-adjustments .tempo-number input::-webkit-inner-spin-button { appearance:none; }
.touch-adjustments input[type=range] { height:44px; touch-action:pan-y; }
.touch-adjustments input[type=range]::-webkit-slider-thumb { width:20px; height:20px; margin-top:-9px; }
.touch-adjustments input[type=range]::-moz-range-thumb { width:20px; height:20px; }
.touch-tools { display:flex; flex-wrap:wrap; gap:8px; }
:host([data-touch-player]) .settings,:host([data-touch-player]) .tempo-editor,:host([data-touch-player]) #tempo-fader[popover] { left:var(--touch-left) !important; top:var(--touch-top) !important; bottom:auto !important; width:var(--touch-width) !important; max-width:none !important; max-height:var(--touch-panel-height) !important; transform:scale(var(--touch-inverse)) !important; transform-origin:0 0 !important; font-size:16px !important; margin:0 !important; }
:host([data-touch-player]) .settings button,:host([data-touch-player]) .settings input:not([type=checkbox],[type=radio]),:host([data-touch-player]) .tempo-editor button,:host([data-touch-player]) .tempo-editor input:not([type=checkbox],[type=radio]) { min-height:44px; }
:host([data-touch-player]) .settings header,:host([data-touch-player]) .settings-actions { flex-wrap:wrap; }
:host([data-touch-player]) .editor-fields { grid-template-columns:1fr; }
:host([data-touch-player]) .pitch-bounds { grid-template-columns:1fr; }
:host([data-touch-player]) .tempo-number-arrows { width:44px; }
:host([data-touch-player]) .settings .tempo-number-arrows,:host([data-touch-player]) .tempo-editor .tempo-number-arrows { display:flex; flex-direction:row; width:88px; }
:host([data-touch-player]) .tempo-number-arrows button { width:44px; min-height:44px; }
:host([data-touch-player]) .tempo-choice-list button { min-height:44px; }
:host([data-touch-player]) .settings summary,:host([data-touch-player]) .tempo-editor summary { min-height:44px; padding:8px 0; }
:host([data-touch-player]) .settings input[type=checkbox],:host([data-touch-player]) .settings input[type=radio],:host([data-touch-player]) .tempo-editor input[type=checkbox] { width:24px; height:24px; }
:host([data-touch-player]) label:has(input[type=checkbox],input[type=radio]) { min-height:44px; align-items:center; }
:host([data-touch-player]) ::selection { color:var(--tempo-surface); background:var(--tempo-fg); }
:host([data-touch-player]) :focus-visible { outline:2px solid var(--tempo-fg); outline-offset:2px; }
`;

export function createMobilePlayer({
  host,
  root,
  document,
  media,
  readTrack,
  changeRate,
  cancelTransition,
  openSettings,
}) {
  const window = document.defaultView;
  const pageLayout = createMobileLayout(document);
  const events = new AbortController();
  const on = (target, name, listener) =>
    target?.addEventListener(name, listener, { signal: events.signal });
  function readPlayback() {
    let audio;
    for (const reference of media) {
      const candidate = reference.deref();
      if (candidate && (!audio || !candidate.paused)) audio = candidate;
    }
    return {
      audio,
      track: readTrack(),
      paused: !audio || audio.paused,
    };
  }
  const sheet = document.createElement('style');
  sheet.textContent = style;
  const transport = document.createElement('div');
  transport.className = 'touch-transport';
  transport.innerHTML = `<div class="touch-art" aria-hidden="true"></div><div class="touch-caption"><strong></strong><span></span></div><button type="button" class="touch-play" aria-label="Play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4l12 8-12 8Z"/></svg></button><button type="button" class="touch-next" aria-label="Next track"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l12 8-12 8ZM20 4v16"/></svg></button><button type="button" class="touch-expand" aria-expanded="false" aria-controls="touch-adjustments">Controls</button>`;
  const pitchNotice = document.createElement('span');
  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  settingsButton.className = 'touch-settings';
  settingsButton.dataset.action = 'settings';
  settingsButton.textContent = 'Settings';
  on(settingsButton, 'click', () => openSettings(settingsButton));
  transport.append(settingsButton);
  pitchNotice.className = 'touch-pitch-notice';
  pitchNotice.hidden = true;
  transport.querySelector('.touch-caption').append(pitchNotice);
  const adjustments = document.createElement('div');
  adjustments.className = 'touch-adjustments';
  adjustments.id = 'touch-adjustments';
  adjustments.innerHTML = `<label>Tempo <span class="touch-number-row"><input id="touch-rate" type="number" min="0.25" max="4" step="0.025" value="1" aria-label="Exact playback speed on mobile"><span>×</span></span></label><input id="touch-rate-slider" type="range" min="0.25" max="4" step="0.001" value="1" aria-label="Playback speed on mobile"><label class="touch-pitch">Pitch <span class="touch-number-row"><input id="touch-pitch" type="number" min="-12" max="12" step="0.5" value="0" aria-label="Key shift in semitones on mobile"><span>st</span></span></label><input id="touch-pitch-slider" type="range" min="-12" max="12" step="0.001" value="0" aria-label="Key shift on mobile"><label>Volume <input id="touch-volume" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume on mobile"></label><div class="touch-tools"><button type="button" data-action="previous">Previous</button><button type="button" data-action="reset">Reset tempo</button><button type="button" data-action="pitch-reset">Reset pitch</button><button type="button" data-action="save">Save tempo</button></div>`;
  root.append(sheet, transport, adjustments);
  const feedback = document.createElement('p');
  feedback.className = 'touch-feedback';
  adjustments.append(feedback);
  const syncFields = enhanceTempoFields(adjustments);
  const native = (selector) =>
    document.querySelector(`.playControls ${selector}`);
  const rate = adjustments.querySelector('#touch-rate'),
    pitch = adjustments.querySelector('#touch-pitch');
  const rateSlider = adjustments.querySelector('#touch-rate-slider'),
    pitchSlider = adjustments.querySelector('#touch-pitch-slider');
  const volume = adjustments.querySelector('#touch-volume');
  const play = transport.querySelector('.touch-play'),
    expand = transport.querySelector('.touch-expand');
  let frame,
    disposed = false,
    touch = false;
  const coarse = window.matchMedia('(any-pointer: coarse)');
  let artworkSource;
  const artworkObserver = new window.MutationObserver(refreshArtwork);
  function refreshArtwork() {
    const source = native('.playbackSoundBadge__avatar');
    if (source !== artworkSource) {
      artworkObserver.disconnect();
      artworkSource = source;
      if (source)
        artworkObserver.observe(source, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['src', 'srcset', 'style', 'class'],
        });
    }
    const background = readTrackArtwork(source);
    if (transport.firstElementChild.style.backgroundImage !== background)
      transport.firstElementChild.style.backgroundImage = background;
  }
  document.addEventListener(
    'load',
    (event) => {
      if (artworkSource?.contains(event.target)) refreshArtwork();
    },
    { capture: true, signal: events.signal },
  );
  function forward(input, selector) {
    const original = root.querySelector(selector);
    original.value = input.value;
    original.dispatchEvent(new window.Event('change', { bubbles: true }));
    refresh();
  }
  let editingTrack;
  on(rate, 'focus', () => {
    editingTrack = readTrack();
  });
  adjustments.addEventListener(
    'click',
    (event) => {
      if (
        event.target.closest('button') &&
        rate.closest('.touch-number-row').contains(event.target)
      )
        editingTrack = readTrack();
    },
    { capture: true, signal: events.signal },
  );
  on(rate, 'change', () => {
    if (editingTrack === readTrack()) changeRate(rate.value);
    refresh();
  });
  on(rate, 'blur', refresh);
  on(rateSlider, 'input', () => {
    changeRate(rateSlider.value);
    refresh();
  });
  on(pitch, 'change', () => forward(pitch, '#quick-key-shift'));
  on(pitchSlider, 'input', () => forward(pitchSlider, '#quick-key-shift'));
  on(volume, 'input', () => {
    const audio = readPlayback().audio;
    if (audio) {
      audio.volume = volume.valueAsNumber;
      audio.muted = false;
    }
    syncTempoRange(volume);
  });
  function nativeTransport(selector) {
    const button = native(selector);
    if (
      !button ||
      button.disabled ||
      button.getAttribute('aria-disabled') === 'true'
    )
      return;
    cancelTransition();
    button.click();
  }
  on(play, 'click', () => nativeTransport('.playControls__play'));
  on(transport.querySelector('.touch-next'), 'click', () =>
    nativeTransport('.playControls__next'),
  );
  on(expand, 'click', () => {
    const expanded = host.toggleAttribute('data-touch-expanded');
    expand.setAttribute('aria-expanded', String(expanded));
    expand.textContent = expanded ? 'Close' : 'Controls';
    refresh();
    layout();
  });
  on(adjustments, 'click', (event) => {
    switch (event.target.closest('[data-action]')?.dataset.action) {
      case 'previous':
        nativeTransport('.playControls__prev');
        break;
      case 'reset':
        rate.value = '1';
        changeRate(1);
        refresh();
        break;
      case 'pitch-reset':
        pitch.value = '0';
        forward(pitch, '#quick-key-shift');
        break;
      case 'save':
        root.querySelector('.memory').click();
        break;
    }
  });
  function refresh() {
    if (disposed) return;
    const state = readPlayback();
    const currentRate = root.querySelector('#rate-number');
    const currentPitch = root.querySelector('#quick-key-shift');
    for (const [input, source] of [
      [rate, currentRate],
      [pitch, currentPitch],
    ]) {
      if (root.activeElement !== input) input.value = source.value;
      input.min = source.min;
      input.max = source.max;
    }
    rate.step = root.querySelector('#tempo-increment').value || '0.025';
    pitch.step = currentPitch.step;
    for (const [slider, input] of [
      [rateSlider, rate],
      [pitchSlider, pitch],
    ]) {
      slider.min = input.min;
      slider.max = input.max;
      if (root.activeElement !== slider) slider.value = input.value;
      syncTempoRange(slider);
    }
    const hiddenPitch = root.querySelector('.quick-key').hidden;
    adjustments.querySelector('.touch-pitch').hidden = hiddenPitch;
    pitchSlider.hidden = hiddenPitch;
    adjustments.querySelector('[data-action=pitch-reset]').hidden = hiddenPitch;
    const nativePlay = native('.playControls__play');
    play.disabled =
      !nativePlay ||
      nativePlay.disabled ||
      nativePlay.getAttribute('aria-disabled') === 'true';
    const next = native('.playControls__next');
    transport.querySelector('.touch-next').disabled =
      !next || next.disabled || next.getAttribute('aria-disabled') === 'true';
    const previous = native('.playControls__prev');
    adjustments.querySelector('[data-action=previous]').disabled =
      !previous ||
      previous.disabled ||
      previous.getAttribute('aria-disabled') === 'true';
    play.setAttribute('aria-label', state.paused ? 'Play' : 'Pause');
    play
      .querySelector('path')
      .setAttribute('d', state.paused ? 'M8 4l12 8-12 8Z' : 'M8 4v16M16 4v16');
    const title = native('.playbackSoundBadge__titleLink');
    transport.querySelector('strong').textContent =
      title?.getAttribute('title') ||
      title?.textContent?.trim() ||
      'Choose a track';
    transport.querySelector('.touch-caption span').textContent =
      native('.playbackSoundBadge__lightLink')?.textContent?.trim() ||
      state.track ||
      '';
    const nativeNotice = native('.soundcloud-tempo-pitch-notice');
    pitchNotice.textContent = nativeNotice?.textContent || '';
    pitchNotice.hidden = !nativeNotice || nativeNotice.hidden;
    const error = root.querySelector('.error');
    feedback.textContent = error.hidden
      ? root.querySelector('.status').textContent
      : error.title;
    const save = adjustments.querySelector('[data-action=save]');
    save.textContent = root.querySelector('.memory').title || 'Save tempo';
    save.disabled = !state.track;
    refreshArtwork();
    if (state.audio && root.activeElement !== volume)
      volume.value = String(state.audio.muted ? 0 : state.audio.volume);
    volume.disabled = !state.audio;
    syncTempoRange(volume);
    syncFields();
  }
  function layout() {
    if (disposed || !host.isConnected) return;
    const geometry = touchViewport(
      window.visualViewport,
      window.screen.width,
      coarse.matches,
      window.navigator.maxTouchPoints,
      window.screen.height,
    );
    touch = geometry.touch;
    pageLayout.update(geometry, touch ? host.offsetHeight : 0);
    host.toggleAttribute('data-touch-player', touch);
    if (touch && !host.matches(':popover-open')) {
      host.setAttribute('popover', 'manual');
      host.showPopover();
    }
    if (!touch) {
      if (host.matches(':popover-open')) host.hidePopover();
      host.removeAttribute('popover');
      return;
    }
    for (const [name, value] of Object.entries({
      'touch-width': `${geometry.width}px`,
      'touch-inverse': 1 / geometry.scale,
      'touch-left': `${geometry.left}px`,
      'touch-top': `${geometry.top}px`,
      'touch-panel-height': `${Math.max(100, geometry.height - 16)}px`,
    })) {
      if (host.style.getPropertyValue(`--${name}`) !== String(value))
        host.style.setProperty(`--${name}`, String(value));
    }
    const height = host.offsetHeight;
    const top = `${geometry.top + (geometry.height - height) / geometry.scale}px`;
    if (host.style.getPropertyValue('--touch-dock-top') !== top)
      host.style.setProperty('--touch-dock-top', top);
  }
  function scheduleLayout() {
    if (frame || disposed) return;
    frame = window.requestAnimationFrame(() => {
      frame = undefined;
      layout();
    });
  }
  on(window.visualViewport, 'resize', scheduleLayout);
  on(window.visualViewport, 'scroll', scheduleLayout);
  on(window, 'resize', scheduleLayout);
  on(coarse, 'change', scheduleLayout);
  on(document, 'visibilitychange', refresh);
  for (const name of [
    'play',
    'pause',
    'timeupdate',
    'durationchange',
    'volumechange',
    'emptied',
  ]) {
    document.addEventListener(name, refresh, {
      capture: true,
      signal: events.signal,
    });
  }
  const observer = new window.ResizeObserver(scheduleLayout);
  observer.observe(host);
  refresh();
  layout();
  return {
    refresh() {
      refresh();
      scheduleLayout();
    },
    overlap(state) {
      const source = native('.soundcloud-tempo-crossfade-artwork');
      const artwork = transport.firstElementChild;
      let copy = artwork.firstElementChild;
      if (!state || !source) {
        copy?.remove();
      } else {
        if (!copy) {
          copy = document.createElement('span');
          copy.className = 'touch-cover';
          copy.append(
            document.createElement('span'),
            document.createElement('span'),
          );
          artwork.append(copy);
        }
        for (const name of [
          '--tempo-artwork-start',
          '--tempo-artwork-end',
          '--tempo-artwork-progress',
        ])
          copy.style.setProperty(name, source.style.getPropertyValue(name));
        [...copy.children].forEach((child, index) => {
          child.style.backgroundImage =
            source.children[index].style.backgroundImage;
        });
      }
      refresh();
    },
    dispose() {
      disposed = true;
      events.abort();
      observer.disconnect();
      artworkObserver.disconnect();
      window.cancelAnimationFrame(frame);
      pageLayout.dispose();
      if (host.matches(':popover-open')) host.hidePopover();
      host.removeAttribute('popover');
      host.removeAttribute('data-touch-player');
      host.removeAttribute('data-touch-expanded');
      sheet.remove();
      transport.remove();
      adjustments.remove();
    },
  };
}
