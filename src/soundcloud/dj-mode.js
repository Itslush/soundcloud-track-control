import { cardTrack } from './page-artwork.js';

export const DJ_TARGET_MODES = Object.freeze(['auto', 'A', 'B']);

const HERO_SELECTOR =
  '.soundTitle__playButtonHero, .fullHero, .listenArtworkWrapper, section[aria-label="Track header"]';
const PLAY_BUTTON_SELECTOR =
  'button.sc-button-play, a.sc-button-play, .soundTitle__playButton button, .playableTile__playButton button, .trackItem__playButton button, .compactTrackListItem__playButton button, .heroPlayButton button';
const IGNORE_ANCESTORS =
  '.playControls, #soundcloud-tempo-control, [data-tempo-dj-ignore]';
const STYLE_ID = 'soundcloud-tempo-dj-style';
const PILLS_CLASS = 'tempo-dj-pills';

const DJ_STYLE_CSS = `
.tempo-dj-pills {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  vertical-align: middle;
  z-index: 4;
}
.tempo-dj-pill {
  appearance: none;
  font: 700 11px/1 system-ui, -apple-system, sans-serif;
  padding: 4px 7px;
  min-height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(255, 85, 0, 0.72);
  background: rgba(20, 20, 20, 0.88);
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
}
.tempo-dj-pill:hover,
.tempo-dj-pill:focus-visible {
  background: #f50;
  border-color: #f50;
  color: #141414;
  outline: none;
}
`;

export function createDjMode({
  parseTrack,
  embeddedKey = () => '',
  onRoute,
  onStateChange,
} = {}) {
  let enabled = false;
  let target = 'auto';
  let nextDeck = 'A';
  let disposed = false;
  const docs = new Map();

  function trackFor(element, doc) {
    if (!element?.isConnected || !element.closest) return '';
    if (element.closest(IGNORE_ANCESTORS)) return '';
    const pageKey =
      doc === document ? parseTrack(location.href) : embeddedKey(doc);
    if (doc !== document && !pageKey) return '';
    const directCard = cardTrack(element, parseTrack);
    if (directCard) return directCard;
    const listRow = element.closest('.compactTrackListItem');
    if (listRow) {
      const link = listRow.querySelector('a[href]');
      const key = link && parseTrack(link.getAttribute('href'));
      if (key) return key;
    }
    return element.closest(HERO_SELECTOR) ? pageKey : '';
  }

  function removePills(doc) {
    doc.querySelectorAll(`.${PILLS_CLASS}`).forEach((node) => node.remove());
    doc.getElementById(STYLE_ID)?.remove();
  }

  function ensureStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = DJ_STYLE_CSS;
    (doc.head || doc.documentElement).append(style);
  }

  function decorate(doc) {
    if (!enabled || disposed) return;
    ensureStyle(doc);
    for (const button of doc.querySelectorAll(PLAY_BUTTON_SELECTOR)) {
      if (button.closest(IGNORE_ANCESTORS)) continue;
      if (button.nextElementSibling?.classList?.contains(PILLS_CLASS)) continue;
      const track = trackFor(button, doc);
      if (!track) continue;
      const wrap = doc.createElement('span');
      wrap.className = PILLS_CLASS;
      wrap.dataset.djTrack = track;
      for (const deck of ['A', 'B']) {
        const pill = doc.createElement('button');
        pill.type = 'button';
        pill.className = 'tempo-dj-pill';
        pill.dataset.djDeck = deck;
        pill.setAttribute('aria-label', `Load ${track.slice(1)} to Deck ${deck}`);
        pill.title = `Load to Deck ${deck}`;
        pill.textContent = `+${deck}`;
        wrap.append(pill);
      }
      button.insertAdjacentElement('afterend', wrap);
    }
  }

  function stopDocObserver(entry) {
    if (entry.observer) {
      entry.observer.disconnect();
      entry.observer = null;
    }
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = 0;
    }
  }

  function startDocObserver(doc, entry) {
    if (entry.observer || !doc.body && !doc.documentElement) return;
    const schedule = () => {
      if (entry.timer || !enabled || disposed) return;
      entry.timer = setTimeout(() => {
        entry.timer = 0;
        if (enabled && !disposed) decorate(doc);
      }, 80);
    };
    entry.observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (
            node instanceof Element &&
            !node.classList?.contains(PILLS_CLASS) &&
            node.id !== STYLE_ID
          ) {
            schedule();
            return;
          }
        }
      }
    });
    entry.observer.observe(doc.body || doc.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function handleDocClick(doc, event) {
    if (!enabled || disposed) return;
    const rawTarget = event.target;
    if (!(rawTarget instanceof Element)) return;
    const pill = rawTarget.closest('.tempo-dj-pill');
    if (pill) {
      const wrap = pill.closest(`.${PILLS_CLASS}`);
      const track = wrap?.dataset.djTrack;
      const deck = pill.dataset.djDeck;
      if (track && (deck === 'A' || deck === 'B')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        onRoute?.(deck, 'https://soundcloud.com' + track);
      }
      return;
    }
    const playButton = rawTarget.closest(PLAY_BUTTON_SELECTOR);
    if (!playButton || playButton.closest(IGNORE_ANCESTORS)) return;
    const track = trackFor(playButton, doc);
    if (!track) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    const deck = target === 'auto' ? nextDeck : target;
    if (target === 'auto') nextDeck = nextDeck === 'A' ? 'B' : 'A';
    onRoute?.(deck, 'https://soundcloud.com' + track);
    emitState();
  }

  function attachDocument(doc) {
    if (!doc || docs.has(doc) || disposed) return;
    const onClick = (event) => handleDocClick(doc, event);
    doc.addEventListener('click', onClick, true);
    const entry = { onClick, observer: null, timer: 0 };
    docs.set(doc, entry);
    if (enabled) {
      decorate(doc);
      startDocObserver(doc, entry);
    }
  }

  function emitState() {
    onStateChange?.({ enabled, target, nextDeck });
  }

  function syncActiveDocs() {
    for (const [doc, entry] of [...docs]) {
      if (!doc.documentElement) {
        stopDocObserver(entry);
        docs.delete(doc);
        continue;
      }
      if (enabled) {
        decorate(doc);
        startDocObserver(doc, entry);
      } else {
        stopDocObserver(entry);
        removePills(doc);
      }
    }
  }

  function setEnabled(value) {
    const next = Boolean(value);
    if (enabled === next || disposed) return enabled;
    enabled = next;
    syncActiveDocs();
    emitState();
    return enabled;
  }

  function setTarget(value) {
    if (!DJ_TARGET_MODES.includes(value)) return target;
    target = value;
    emitState();
    return target;
  }

  function cycleTarget() {
    const idx = DJ_TARGET_MODES.indexOf(target);
    return setTarget(DJ_TARGET_MODES[(idx + 1) % DJ_TARGET_MODES.length]);
  }

  if (typeof document !== 'undefined') attachDocument(document);

  return {
    state: () => ({ enabled, target, nextDeck }),
    enabled: () => enabled,
    target: () => target,
    nextDeck: () => nextDeck,
    setEnabled,
    toggle: () => setEnabled(!enabled),
    setTarget,
    cycleTarget,
    attachDocument,
    detachDocument(doc) {
      const entry = docs.get(doc);
      if (!entry) return;
      doc.removeEventListener('click', entry.onClick, true);
      stopDocObserver(entry);
      removePills(doc);
      docs.delete(doc);
    },
    dispose() {
      disposed = true;
      enabled = false;
      for (const doc of [...docs.keys()]) this.detachDocument(doc);
    },
  };
}
