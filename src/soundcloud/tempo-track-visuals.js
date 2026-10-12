import { formatPitchNotice } from '../sharing/tempo-pitch-notice.js';
import { artworkTransition } from '../appearance/artwork-transition.js';

export function createTrackVisuals({ document, readTrack }) {
  let layer, incoming, nextTrack, notice;
  const avatar = () =>
    document.querySelector(
      '.playControls__soundBadge .playbackSoundBadge__avatar',
    );
  const cover = (element) => {
    const image = element?.querySelector('img');
    if (image) return `url(${JSON.stringify(image.currentSrc || image.src)})`;
    const background = element?.querySelector('.image') || element;
    return background
      ? document.defaultView.getComputedStyle(background).backgroundImage
      : 'none';
  };
  const path = (url) => new URL(url, document.location.href).pathname;

  function overlap(state) {
    if (!state) {
      layer?.remove();
      layer = incoming = nextTrack = null;
      return;
    }
    if (!layer) {
      const host = avatar();
      if (!host) return;
      nextTrack = state.nextTrack ? path(state.nextTrack) : null;
      layer = document.createElement('span');
      layer.className = 'soundcloud-tempo-crossfade-artwork';
      layer.setAttribute('aria-hidden', 'true');
      const outgoing = document.createElement('span');
      outgoing.style.backgroundImage = cover(host);
      incoming = document.createElement('span');
      incoming.className = 'soundcloud-tempo-incoming-artwork';
      layer.append(outgoing, incoming);
      host.append(layer);
      if (nextTrack) {
        for (const link of document.querySelectorAll('a[href]')) {
          if (path(link.href) !== nextTrack) continue;
          const row = link.closest('.queueItemView, .sound, .playableTile');
          const image = row?.querySelector(
            '.queueItemView__artwork, .sound__coverArt, .playableTile__artwork',
          );
          const background = cover(image);
          if (background !== 'none') {
            incoming.style.backgroundImage = background;
            break;
          }
        }
      }
    }
    const host = avatar();
    if (!host) return;
    if (layer.parentElement !== host) host.append(layer);
    if (nextTrack && readTrack() === nextTrack) {
      const background = cover(host);
      if (background !== 'none') incoming.style.backgroundImage = background;
    }
    const { progress, start, end } = artworkTransition(
      incoming.style.backgroundImage ? state.progress : 0,
    );
    layer.style.setProperty('--tempo-artwork-progress', String(progress));
    layer.style.setProperty('--tempo-artwork-start', `${start * 100}%`);
    layer.style.setProperty('--tempo-artwork-end', `${end * 100}%`);
  }

  function pitch(shift) {
    const host = document.querySelector(
      '.playControls__soundBadge .playbackSoundBadge__titleContextContainer',
    );
    if (!host) {
      notice?.remove();
      notice = null;
      return;
    }
    if (!notice || notice.parentElement !== host) {
      notice?.remove();
      notice = document.createElement('span');
      notice.className = 'soundcloud-tempo-pitch-notice';
      host.append(notice);
    }
    const text = formatPitchNotice(shift);
    if (notice.textContent !== text) notice.textContent = text;
    notice.hidden = !text;
  }
  return { overlap, pitch };
}
