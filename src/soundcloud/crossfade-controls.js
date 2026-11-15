import { cardTrack } from './page-artwork.js';

const hero = 'section[aria-label="Track header"]';
const playSelector = `.playButton, .sc-button-play, ${hero} button[aria-label="Play"], ${hero} button[aria-label="Pause"]`;
const waveformSelector = '.sound__waveform .waveform';
const timelineSelector = '.playbackTimeline__progressWrapper';

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
    const waveform = event.target.closest(waveformSelector);
    const timeline = event.target.closest(timelineSelector);
    const targetElement = play || waveform || timeline;
    const target = timeline
      ? currentTrack()
      : targetElement && trackFor(targetElement);
    if (event.type !== 'click') {
      if (target && (!play || target !== currentTrack()))
        crossfade.warmManual();
      return;
    }
    if (
      targetElement &&
      event.cancelable &&
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      if (
        target &&
        play?.getAttribute('aria-label') !== 'Pause' &&
        crossfade.manualPlay(
          target,
          Boolean(!play && target === currentTrack()),
        )
      ) {
        return;
      }
      crossfade.cancel();
      return;
    }
    if (
      event.target.closest(
        '.playControls__play,.playControls__next,.playControls__prev,.playControls__repeat,.playbackTimeline',
      )
    )
      crossfade.cancel();
  };
}

export function installCrossfadeControls(doc, crossfadeClick, crossfade) {
  for (const type of ['click', 'pointerover', 'pointerdown', 'focusin'])
    doc.addEventListener(type, crossfadeClick, true);
  doc.addEventListener(
    'keydown',
    (event) => {
      if (
        event.isTrusted &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event
          .composedPath()
          .some((node) =>
            node.matches?.('input,textarea,select,[contenteditable="true"]'),
          ) &&
        [' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)
      )
        crossfade.cancel();
    },
    true,
  );
}
