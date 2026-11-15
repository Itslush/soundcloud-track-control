import { cardTrack } from './page-artwork.js';

const hero = 'section[aria-label="Track header"]';
const playSelector = `.playButton, .sc-button-play, ${hero} button[aria-label="Play"], ${hero} button[aria-label="Pause"]`;

export function createCrossfadeClickHandler({
  crossfade,
  parseTrack,
  currentTrack,
  embeddedKey,
}) {
  function trackFor(button) {
    const doc = button.ownerDocument;
    const pageKey =
      doc === document ? parseTrack(location.href) : embeddedKey(doc);
    if (doc !== document && !pageKey) return '';
    const card = cardTrack(button, parseTrack);
    if (card !== null) return card;
    return button.closest(`.soundTitle__playButtonHero, ${hero}`)
      ? pageKey
      : '';
  }

  return (event) => {
    if (!event.isTrusted || !event.target?.closest) return;
    const play = event.target.closest(playSelector);
    if (
      play &&
      event.cancelable &&
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const target = trackFor(play);
      if (
        target &&
        play.getAttribute('aria-label') !== 'Pause' &&
        crossfade.manualPlay(target, () => {
          if (
            !play.isConnected ||
            play.disabled ||
            trackFor(play) !== target ||
            currentTrack() === target
          )
            return false;
          play.click();
          return true;
        })
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      crossfade.cancel();
    }
    if (
      event.target.closest(
        '.playControls__play,.playControls__next,.playControls__prev,.playControls__repeat,.playbackTimeline',
      )
    )
      crossfade.cancel();
  };
}
