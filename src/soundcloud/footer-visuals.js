export function createFooterVisuals({ readUI, readPlayback, themeChanged }) {
  let lastHost;
  let lastTheme;
  function tempoLogo() {
    return `
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <g fill="currentColor">
          <rect x="5" y="36" width="3" height="10" rx="1.5" />
          <rect x="10" y="31" width="3" height="18" rx="1.5" />
          <rect x="15" y="26" width="3" height="23" rx="1.5" />
          <rect x="20" y="21" width="3" height="28" rx="1.5" />
          <path d="M26 20C33 9 49 14 49 29C62 27 66 49 51 49H30Q26 49 26 45Z" />
        </g>
        <path d="M31 40H54" stroke="var(--logo-cutout)" stroke-width="3" stroke-linecap="round" />
        <circle cx="45" cy="40" r="4" fill="currentColor" stroke="var(--logo-cutout)" stroke-width="2" />
      </svg>
    `;
  }

  function syncTheme() {
    const ui = readUI();
    if (!ui?.host.isConnected) {
      return;
    }
    const bar = ui.host.closest('.playControls');
    const reference =
      bar?.querySelector('.volume__button') || bar || document.body;
    const foreground = getComputedStyle(reference).color;
    const values = foreground.match(/[\d.]+/g)?.map(Number) || [34, 34, 34];
    const dark = values.slice(0, 3).reduce((a, b) => a + b, 0) > 450;
    ui.host.style.setProperty('--tempo-fg', foreground);
    const progress = bar?.querySelector('.playbackTimeline__progressBar');
    const accent = progress && getComputedStyle(progress).backgroundColor;
    const nativeRail = progress?.getBoundingClientRect();
    const controls = ui.root.querySelector('.controls').getBoundingClientRect();
    const offset = nativeRail?.height
      ? nativeRail.y + nativeRail.height / 2 - controls.y - controls.height / 2
      : 0;
    ui.host.style.setProperty(
      '--tempo-rail-offset',
      `${Math.abs(offset) <= 8 ? offset : 0}px`,
    );
    ui.host.style.setProperty(
      '--tempo-accent',
      accent && accent !== 'rgba(0, 0, 0, 0)' ? accent : '#ff5500',
    );
    ui.host.style.setProperty('--tempo-track', dark ? '#888' : '#777');
    const surface = getComputedStyle(document.documentElement)
      .getPropertyValue('--tempo-page-surface')
      .trim();
    ui.host.style.setProperty(
      '--tempo-surface',
      surface || (dark ? '#303030' : '#f2f2f2'),
    );
    ui.host.style.setProperty('--tempo-accent-surface', surface || '#242424');
    ui.host.style.colorScheme = dark ? 'dark' : 'light';
    ui.host.style.fontFamily = getComputedStyle(reference).fontFamily;
    const nextTheme = [
      foreground,
      accent,
      dark,
      surface,
      ui.host.style.fontFamily,
    ].join('|');
    if (lastHost !== ui.host || lastTheme !== nextTheme) {
      lastHost = ui.host;
      lastTheme = nextTheme;
      themeChanged();
    }
  }

  function syncArtworkIndicator(description) {
    const ui = readUI();
    if (!ui) return;
    const { rate, trackKey, failure } = readPlayback();
    const artwork = document.querySelector(
      '.playControls__soundBadge .playbackSoundBadge__avatar',
    );
    if (ui.artwork !== artwork) {
      ui.artwork?.classList.remove('soundcloud-tempo-artwork');
      ui.artworkIndicator?.remove();
      ui.artwork = artwork;
      ui.artworkIndicator = null;
    }
    if (!artwork) {
      return;
    }
    if (!ui.artworkIndicator?.isConnected) {
      artwork
        .querySelectorAll('#soundcloud-tempo-artwork-indicator')
        .forEach((node) => {
          node.remove();
        });
      const indicator = document.createElement('span');
      indicator.id = 'soundcloud-tempo-artwork-indicator';
      indicator.setAttribute('role', 'img');
      indicator.attachShadow({ mode: 'open' }).innerHTML = `
        <style>
          :host {
            position: absolute;
            inset: auto 1px 1px auto;
            display: grid;
            place-items: center;
            width: 18px;
            height: 18px;
            box-sizing: border-box;
            border: 1px solid #161616;
            border-radius: 3px;
            background: #ff5500;
            color: #fff;
            --logo-cutout: #ff5500;
            z-index: 1;
            line-height: 0;
          }
          :host([hidden]) {
            display: none;
          }
          svg {
            width: 100%;
            height: 100%;
            pointer-events: none;
          }
          @media (forced-colors: active) {
            :host {
              background: Canvas;
              color: CanvasText;
              border-color: CanvasText;
            }
          }
        </style>
        ${tempoLogo()}
      `;
      artwork.classList.add('soundcloud-tempo-artwork');
      artwork.append(indicator);
      ui.artworkIndicator = indicator;
    }
    const label = description;
    const indicator = ui.artworkIndicator;
    const hidden = rate === 1 || !trackKey || Boolean(failure);
    if (indicator.hidden !== hidden) {
      indicator.hidden = hidden;
    }
    if (indicator.title !== label) {
      indicator.title = label;
      indicator.setAttribute('aria-label', label);
    }
  }

  return { tempoLogo, syncTheme, syncArtworkIndicator };
}
