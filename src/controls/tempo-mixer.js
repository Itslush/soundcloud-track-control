export const SHOW_MIXER_STORAGE = 'soundcloud.tempo.showMixer';

export const MIXER_THEMES = {
  light: {
    ground: '#f7f7f5',
    surface: '#fff',
    ink: '#202020',
    muted: '#5d5d5d',
    line: '#c4c4c1',
    control: '#777',
    accent: '#b33b00',
    onAccent: '#fff',
    track: '#777',
  },
  charcoal: {
    ground: '#111',
    surface: '#202020',
    ink: '#f4f4f4',
    muted: '#b2b2b2',
    line: '#434343',
    control: '#767676',
    accent: '#ff5500',
    onAccent: '#141414',
    track: '#777',
  },
  oled: {
    ground: '#000',
    surface: '#0b0b0b',
    ink: '#f4f4f4',
    muted: '#b2b2b2',
    line: '#262626',
    control: '#767676',
    accent: '#ff5500',
    onAccent: '#141414',
    track: '#777',
  },
};

let config = null;
let dock;
let ready = false;
let pending = [];
let expanded = false;
let reportedHeight = 0;
let storageBound = false;
let playBound = false;

export function readShowMixer() {
  try {
    return localStorage.getItem(SHOW_MIXER_STORAGE) === 'true';
  } catch {
    return false;
  }
}

export function isMixerVisible() {
  return dock ? !dock.panel.hidden : readShowMixer();
}

function persistShowMixer(visible) {
  try {
    localStorage.setItem(SHOW_MIXER_STORAGE, String(Boolean(visible)));
    return true;
  } catch {
    return false;
  }
}

function setFooterMixerActive(active) {
  const bar = document.querySelector('.playControls');
  if (!bar) return;
  if (active) bar.setAttribute('data-tempo-mixer-active', 'true');
  else bar.removeAttribute('data-tempo-mixer-active');
}

function createDock() {
  if (dock || !config?.website) return dock;
  const { website, playback } = config;
  const destination = new URL('mixer/', website);
  destination.searchParams.set('host', location.origin);
  if (playback?.trackKey)
    destination.hash = new URLSearchParams({
      track: 'https://soundcloud.com' + playback.trackKey,
    }).toString();

  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Two-deck mixer');
  panel.hidden = true;
  panel.style.cssText =
    'position:fixed;z-index:10000;left:0;right:0;bottom:50px;width:100%;height:58px;background:#111;border:0;border-top:1px solid #363636;box-sizing:border-box;display:none;flex-direction:column;margin:0;padding:0';

  const notice = document.createElement('div');
  notice.className = 'tempo-mixer-notice';
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  notice.style.cssText =
    'display:none;align-items:center;justify-content:space-between;gap:8px;padding:4px 12px;min-height:28px;font:12px/1.3 Arial,sans-serif;border-bottom:1px solid #363636;box-sizing:border-box';

  const noticeText = document.createElement('span');
  const noticeClose = document.createElement('button');
  noticeClose.type = 'button';
  noticeClose.textContent = 'Dismiss';
  noticeClose.setAttribute('aria-label', 'Dismiss mixer notice');
  noticeClose.style.cssText =
    'color:inherit;background:transparent;border:1px solid currentColor;border-radius:3px;padding:2px 8px;font:inherit;cursor:pointer;flex:none';
  notice.append(noticeText, noticeClose);

  const offsetStyle =
    document.getElementById('soundcloud-tempo-mixer-offset') ||
    document.createElement('style');
  offsetStyle.id = 'soundcloud-tempo-mixer-offset';
  if (!offsetStyle.isConnected)
    (document.head || document.documentElement).append(offsetStyle);

  const frame = document.createElement('iframe');
  frame.title = 'Two mixer decks';
  frame.allow = 'autoplay';
  frame.referrerPolicy = 'no-referrer';
  frame.style.cssText =
    'width:100%;min-height:0;flex:1;border:0;background:transparent';
  frame.src = destination.href;
  panel.append(notice, frame);
  document.body.append(panel);

  let noticeTimer = 0;
  const hideNotice = () => {
    clearTimeout(noticeTimer);
    if (notice.hidden) return;
    notice.hidden = true;
    notice.style.display = 'none';
    position();
  };
  const showNotice = (text, autoHideMs = 0) => {
    clearTimeout(noticeTimer);
    noticeText.textContent = text;
    notice.hidden = false;
    notice.style.display = 'flex';
    position();
    if (autoHideMs > 0) noticeTimer = setTimeout(hideNotice, autoHideMs);
  };
  noticeClose.addEventListener('click', hideNotice);

  const timeout = setTimeout(() => {
    if (!ready)
      showNotice(
        'Mixer is still loading. Check your connection or open the full mixer.',
      );
  }, 12000);

  let observedBar = null;
  const barObserver = new ResizeObserver(() => {
    if (!panel.hidden) position();
  });

  function position() {
    const touchHost = document.querySelector(
      '#soundcloud-tempo-control[data-touch-player]',
    );
    const bar = document.querySelector('.playControls');
    if (bar && bar !== observedBar) {
      barObserver.disconnect();
      observedBar = bar;
      barObserver.observe(bar);
    }
    const anchor = touchHost || bar;
    const bottom = Math.max(
      48,
      anchor
        ? Math.round(window.innerHeight - anchor.getBoundingClientRect().top)
        : 50,
    );
    panel.style.bottom = `${bottom}px`;

    const noticeHeight = notice.hidden ? 0 : Math.max(28, notice.offsetHeight || 28);
    const fallbackHeight = expanded
      ? 360
      : window.innerWidth <= 1100
        ? 96
        : 58;
    const iframeHeight =
      reportedHeight > 0
        ? Math.max(52, Math.min(480, Math.ceil(reportedHeight)))
        : fallbackHeight;
    const total = iframeHeight + noticeHeight;
    const maxAvailable = Math.max(52, window.innerHeight - bottom - 6);
    const applied = Math.min(total, maxAvailable);
    panel.style.height = `min(${total}px, calc(100dvh - ${bottom + 6}px))`;
    offsetStyle.textContent = panel.hidden
      ? ''
      : `body { padding-bottom: ${applied}px !important; } html[data-track-control-mobile-layout] body { padding-bottom: calc(var(--tc-phone-dock, 0px) + ${applied}px) !important; }`;

    const bg = bar ? getComputedStyle(bar).backgroundColor : '';
    const channels = bg.match(/\d+/g)?.map(Number) || [24, 24, 24];
    const theme =
      channels.slice(0, 3).reduce((a, b) => a + b, 0) > 450
        ? 'light'
        : channels.slice(0, 3).every((value) => value < 12)
          ? 'oled'
          : 'charcoal';
    const palette = MIXER_THEMES[theme] || MIXER_THEMES.charcoal;
    panel.style.background = palette.ground;
    panel.style.borderTopColor = palette.line;
    notice.style.color = palette.ink;
    notice.style.borderBottomColor = palette.line;
    if (ready)
      frame.contentWindow.postMessage(
        {
          type: 'soundcloud-track-control:mixer-theme',
          theme,
          tokens: palette,
        },
        destination.origin,
      );
  }

  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth !== lastWidth) {
      lastWidth = window.innerWidth;
      reportedHeight = 0;
    }
    position();
  });
  const themeObserver = new MutationObserver(position);
  for (const element of [
    document.documentElement,
    document.body,
    document.querySelector('.playControls'),
  ])
    if (element)
      themeObserver.observe(element, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme'],
      });

  window.addEventListener('message', (event) => {
    if (
      !event.isTrusted ||
      event.source !== frame.contentWindow ||
      event.origin !== destination.origin
    )
      return;
    if (event.data === 'soundcloud-track-control:mixer-ready') {
      ready = true;
      clearTimeout(timeout);
      hideNotice();
      position();
      if (config?.djHooks?.getState)
        dock.send({
          type: 'soundcloud-track-control:mixer-dj-state',
          ...config.djHooks.getState(),
        });
      for (const message of pending) dock.send(message);
      pending = [];
    } else if (event.data === 'soundcloud-track-control:mixer-dj-toggle') {
      config?.djHooks?.onToggle?.();
    } else if (event.data === 'soundcloud-track-control:mixer-dj-target') {
      config?.djHooks?.onCycleTarget?.();
    } else if (event.data?.type === 'soundcloud-track-control:mixer-size') {
      if (typeof event.data.expanded === 'boolean')
        expanded = event.data.expanded;
      if (
        typeof event.data.height === 'number' &&
        Number.isFinite(event.data.height) &&
        event.data.height > 0
      )
        reportedHeight = event.data.height;
      position();
    } else if (event.data === 'soundcloud-track-control:mixer-close') {
      setMixerVisible(false, true);
    } else if (event.data === 'soundcloud-track-control:mixer-playing') {
      setFooterMixerActive(true);
      document
        .querySelector(
          '.playControls__play.playing,.playControls__play[aria-label="Pause"],.playControls__play[title="Pause"]',
        )
        ?.click();
    } else if (event.data === 'soundcloud-track-control:mixer-paused') {
      setFooterMixerActive(false);
    } else if (
      event.data?.type === 'soundcloud-track-control:mixer-notice' &&
      typeof event.data.message === 'string'
    ) {
      if (event.data.message) showNotice(event.data.message, 6000);
      else hideNotice();
    }
  });

  dock = {
    panel,
    open() {
      panel.hidden = false;
      panel.style.display = 'flex';
      position();
    },
    hide() {
      panel.hidden = true;
      panel.style.display = 'none';
      offsetStyle.textContent = '';
    },
    message(value) {
      this.open();
      showNotice(value, 6000);
    },
    clearNotice: hideNotice,
    send(message) {
      if (ready) frame.contentWindow.postMessage(message, destination.origin);
      else pending.push(message);
    },
  };
  position();
  return dock;
}

export function setMixerVisible(visible, persist = true) {
  const saved = persist ? persistShowMixer(visible) : true;
  if (visible) {
    const activeDock = dock || createDock();
    activeDock?.open();
  } else {
    dock?.hide();
  }
  config?.onVisibilityChange?.(Boolean(visible));
  return saved;
}

export function toggleMixer() {
  return setMixerVisible(!isMixerVisible(), true);
}

export function initMixerDock(website, playback, onVisibilityChange, djHooks) {
  config = { website, playback, onVisibilityChange, djHooks };
  if (!storageBound) {
    storageBound = true;
    window.addEventListener('storage', (event) => {
      if (event.key === null || event.key === SHOW_MIXER_STORAGE)
        setMixerVisible(readShowMixer(), false);
    });
  }
  if (!playBound) {
    playBound = true;
    document.addEventListener(
      'play',
      (event) => {
        if (!(event.target instanceof HTMLMediaElement)) return;
        setFooterMixerActive(false);
        if (ready && dock)
          dock.send({ type: 'soundcloud-track-control:mixer-pause' });
      },
      true,
    );
  }
  const initial = dock ? !dock.panel.hidden : readShowMixer();
  if (initial && !dock) setMixerVisible(true, false);
  onVisibilityChange?.(initial);
  return initial;
}

export function loadMixerDeck(deck, track) {
  if (!config?.website) return false;
  setMixerVisible(true, true);
  if (!dock) return false;
  dock.clearNotice();
  dock.send({ type: 'soundcloud-track-control:mixer-load', deck, track });
  return true;
}

export function mixerMessage(message) {
  if (!config?.website) return;
  setMixerVisible(true, true);
  dock?.message(message);
}

export function syncMixerDjState(state) {
  dock?.send({
    type: 'soundcloud-track-control:mixer-dj-state',
    ...state,
  });
}
