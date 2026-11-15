import { cardTrack } from './page-artwork.js';
import { loadMixerDeck, mixerMessage } from '../controls/tempo-mixer.js';

const hero = 'section[aria-label="Track header"]';

export function createMixerShortcut({ parseTrack, embeddedKey }) {
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
  return {
    pointer(event) {
      hovered = event.target;
    },
    keydown(event) {
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
        return;
      const target =
        (hovered?.ownerDocument === event.target.ownerDocument
          ? trackFor(hovered)
          : '') || trackFor(event.target);
      if (!target) {
        mixerMessage('Hover or focus a track before using Alt+Shift+1 / 2.');
        event.preventDefault();
        return;
      }
      const deck = event.code === 'Digit1' ? 'A' : 'B';
      if (loadMixerDeck(deck, 'https://soundcloud.com' + target))
        event.preventDefault();
    },
  };
}
