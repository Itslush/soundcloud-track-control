export function createPageArtwork({
  parseTrackKey,
  readSavedRate,
  formatRate,
  tempoLogo,
  readTrack,
  readEmbeddedPages,
}) {
  const pageArtwork = new Map();
  const tracks = new Map();
  const savedRates = new Map();
  const changedTracks = new Set();
  let lastPlayback;
  let artworkDirty = true;
  let artworkFrame = 0;

  function embeddedArtwork(image) {
    const artwork = image.parentElement;
    if (!artwork) return null;
    try {
      const url = new URL(image.currentSrc || image.src);
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.sndcdn.com'))
        return null;
      if (url.pathname.startsWith('/artworks-')) return artwork;
      if (!url.pathname.startsWith('/avatars-')) return null;
      const title = image
        .closest('section[aria-label="Track header"]')
        ?.querySelector('h1')
        ?.textContent.replace(/\s+/gu, ' ')
        .trim();
      if (!title || image.alt.replace(/\s+/gu, ' ').trim() !== title)
        return null;
      const interactive =
        'a, button, input, select, textarea, [role="button"], [role="link"]';
      if (
        artwork.tagName !== 'DIV' ||
        artwork.textContent.trim() ||
        image.closest(interactive) ||
        artwork.querySelector(interactive) ||
        artwork.querySelectorAll('img').length !== 1
      )
        return null;
      const { width, height } = image.getBoundingClientRect();
      if (width >= 96 && height >= 96 && Math.abs(width - height) <= 1)
        return artwork;
      const size = image.sizes.match(/^\s*(\d+(?:\.\d+)?)px\s*$/)?.[1];
      return width === 0 && height === 0 && Number(size) >= 96 ? artwork : null;
    } catch {
      return null;
    }
  }

  function collectArtworkTargets(page, targets) {
    for (const link of page.querySelectorAll('a[href]')) {
      if (link.closest('.playControls')) {
        continue;
      }
      const key = parseTrackKey(link.getAttribute('href'));
      if (!key) {
        continue;
      }
      const visual = link.querySelector('.image, [style*="background-image"]');
      if (
        !visual &&
        !link.querySelector('img') &&
        !link.matches('[style*="background-image"], .image')
      ) {
        continue;
      }
      const artwork =
        visual && !['IMG', 'SVG'].includes(visual.tagName) ? visual : link;
      targets.set(artwork, key);
    }
    for (const card of page.querySelectorAll(
      '.playableTile, .sound, .queueItemView, .soundBadge, .trackItem',
    )) {
      const title = card.querySelector(
        'a.playableTile__mainHeading, .playableTile__mainHeading a, a.soundTitle__title, a.queueItemView__title, .queueItemView__title a, a.soundBadge__titleLink, a.trackItem__trackTitle',
      );
      const key = parseTrackKey(title?.getAttribute('href'));
      const artwork = card.querySelector(
        '.playableTile__artwork .image, .sound__coverArt .image, .queueItemView__artwork .image, .soundBadge__avatar .image, .trackItem__artwork .image',
      );
      if (key && artwork && !targets.has(artwork)) {
        targets.set(artwork, key);
      }
    }
    const pageKey =
      page === document
        ? parseTrackKey(location.href)
        : readEmbeddedPages().key(page);
    if (pageKey) {
      page
        .querySelectorAll(
          '.listenArtworkWrapper .image, .fullHero__artwork .image',
        )
        .forEach((artwork) => targets.set(artwork, pageKey));
      if (page !== document) {
        for (const image of page.querySelectorAll(
          'section[aria-label="Track header"] img',
        )) {
          const artwork = embeddedArtwork(image);
          if (artwork) targets.set(artwork, pageKey);
        }
      }
    }
  }

  function collectPageArtwork() {
    const targets = new Map();
    for (const page of [document, ...(readEmbeddedPages()?.documents() || [])])
      collectArtworkTargets(page, targets);
    for (const [artwork, entry] of pageArtwork) {
      if (targets.get(artwork) !== entry.key) {
        entry.badge?.remove();
        if (entry.positioned) {
          artwork.classList.remove('soundcloud-tempo-page-position');
        }
        pageArtwork.delete(artwork);
      }
    }
    for (const [artwork, key] of targets) {
      if (!pageArtwork.has(artwork)) {
        artwork.classList.remove('soundcloud-tempo-page-position');
        artwork
          .querySelectorAll(':scope > .soundcloud-tempo-page-indicator')
          .forEach((badge) => badge.remove());
        pageArtwork.set(artwork, { key, badge: null, positioned: false });
      }
    }
    tracks.clear();
    savedRates.clear();
    for (const [artwork, entry] of pageArtwork) {
      entry.small = undefined;
      if (!tracks.has(entry.key)) tracks.set(entry.key, new Map());
      tracks.get(entry.key).set(artwork, entry);
    }
  }

  function renderPageArtwork(full) {
    const { trackKey, rate, failure } = readTrack();
    const playbackChanged =
      !lastPlayback ||
      lastPlayback.trackKey !== trackKey ||
      lastPlayback.rate !== rate ||
      lastPlayback.failed !== Boolean(failure);
    const targets = full ? pageArtwork : new Map();
    if (!full) {
      const keys = new Set(changedTracks);
      if (playbackChanged) {
        keys.add(trackKey);
        keys.add(lastPlayback?.trackKey);
      }
      for (const key of keys)
        for (const [artwork, entry] of tracks.get(key) || [])
          targets.set(artwork, entry);
    }
    changedTracks.clear();
    lastPlayback = { trackKey, rate, failed: Boolean(failure) };
    for (const [artwork, entry] of targets) {
      if (!artwork.isConnected) {
        pageArtwork.delete(artwork);
        tracks.get(entry.key)?.delete(artwork);
        continue;
      }
      if (!savedRates.has(entry.key)) {
        savedRates.set(entry.key, readSavedRate(entry.key));
      }
      const stored = savedRates.get(entry.key);
      const active = entry.key === trackKey && rate !== 1 && !failure;
      const value = active ? rate : stored;
      if (value === null || value === 1) {
        if (entry.badge) {
          entry.badge.hidden = true;
        }
        continue;
      }
      if (!entry.badge?.isConnected) {
        const badge = artwork.ownerDocument.createElement('span');
        badge.className = 'soundcloud-tempo-page-indicator';
        badge.setAttribute('role', 'img');
        badge.attachShadow({ mode: 'open' }).innerHTML = `
          <style>
            :host {
              position: absolute;
              bottom: 3px;
              right: 3px;
              display: grid;
              place-items: center;
              width: 24px;
              height: 24px;
              box-sizing: border-box;
              border: 1px solid #ff7733;
              border-radius: 3px;
              background: #303030;
              color: #ff7733;
              --logo-cutout: #303030;
              z-index: 5;
              line-height: 0;
            }

            :host([data-active='true']) {
              background: #ff5500;
              color: #fff;
              --logo-cutout: #ff5500;
              border-color: #161616;
            }

            :host([data-small='true']) {
              width: 18px;
              height: 18px;
              bottom: 1px;
              right: 1px;
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
        entry.positioned =
          artwork.ownerDocument.defaultView.getComputedStyle(artwork)
            .position === 'static';
        if (entry.positioned) {
          artwork.classList.add('soundcloud-tempo-page-position');
        }
        artwork.append(badge);
        entry.badge = badge;
      }
      const label = active
        ? `Playing at ${formatRate(value)}`
        : `Saved tempo ${formatRate(value)}`;
      if (entry.badge.hidden) {
        entry.badge.hidden = false;
      }
      if (entry.badge.dataset.active !== String(active)) {
        entry.badge.dataset.active = String(active);
      }
      if (entry.small === undefined) {
        const width = artwork.getBoundingClientRect().width;
        entry.small = String(width > 0 && width <= 48);
      }
      if (entry.badge.dataset.small !== entry.small) {
        entry.badge.dataset.small = entry.small;
      }
      if (entry.badge.title !== label) {
        entry.badge.title = label;
        entry.badge.setAttribute('aria-label', label);
      }
    }
  }

  function schedulePageArtwork() {
    if (artworkFrame) return;
    artworkFrame = requestAnimationFrame(() => {
      artworkFrame = 0;
      const full = artworkDirty;
      if (full) {
        artworkDirty = false;
        collectPageArtwork();
      }
      renderPageArtwork(full);
    });
  }

  function refreshSaved(track) {
    if (track) {
      savedRates.delete(track);
      changedTracks.add(track);
    } else artworkDirty = true;
    schedulePageArtwork();
  }

  window.addEventListener('resize', () => {
    artworkDirty = true;
    schedulePageArtwork();
  });
  window.addEventListener('storage', (event) => {
    const prefix = 'soundcloud.tempo.track.';
    if (event.key === null) refreshSaved();
    else if (event.key?.startsWith(prefix)) {
      try {
        refreshSaved(decodeURIComponent(event.key.slice(prefix.length)));
      } catch {}
    }
  });

  return {
    schedule: schedulePageArtwork,
    refreshSaved,
    markDirty() {
      artworkDirty = true;
    },
  };
}
