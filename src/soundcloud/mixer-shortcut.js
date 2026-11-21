import { formatChord } from '../controls/tempo-keybinds.js';
import { cardTrack } from './page-artwork.js';
import { loadMixerDeck, mixerMessage } from '../controls/tempo-mixer.js';

const hero = 'section[aria-label="Track header"]';

export function createMixerShortcut({ parseTrack, embeddedKey, keybinds }) {
  let hovered;
  function trackFor(element) {
    if (!element?.isConnected || !element.closest) return '';
    const doc = element.ownerDocument;
    const pageKey =
      doc === document ? parseTrack(location.href) : embeddedKey(doc);
    if (doc !== document && !pageKey) return '';
    return (
      cardTrack(element, parseTrack) ||
      (element.closest(
        `.soundTitle__playButtonHero, .fullHero, .listenArtworkWrapper, ${hero}`,
      )
        ? pageKey
        : '')
    );
  }
  function matchedDeck(event) {
    if (keybinds) {
      if (keybinds.matchAction(event, 'deckA')) return 'A';
      if (keybinds.matchAction(event, 'deckB')) return 'B';
      return '';
    }
    if (
      !event.isTrusted ||
      event.repeat ||
      !event.altKey ||
      !event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      !['Digit1', 'Digit2'].includes(event.code) ||
      event
        .composedPath()
        .some((node) =>
          node.matches?.(
            'input,textarea,select,[contenteditable]:not([contenteditable="false"])',
          ),
        )
    )
      return '';
    return event.code === 'Digit1' ? 'A' : 'B';
  }
  return {
    pointer(event) {
      hovered = event.target;
    },
    keydown(event) {
      const deck = matchedDeck(event);
      if (!deck) return;
      const target =
        (hovered?.ownerDocument === event.target.ownerDocument
          ? trackFor(hovered)
          : '') || trackFor(event.target);
      if (!target) {
        const deckALabel = formatChord(keybinds?.get('deckA') || 'Alt+Shift+Digit1');
        const deckBLabel = formatChord(keybinds?.get('deckB') || 'Alt+Shift+Digit2');
        mixerMessage(`Hover or focus a track before using ${deckALabel} / ${deckBLabel}.`);
        event.preventDefault();
        return;
      }
      if (loadMixerDeck(deck, 'https://soundcloud.com' + target))
        event.preventDefault();
    },
  };
}
