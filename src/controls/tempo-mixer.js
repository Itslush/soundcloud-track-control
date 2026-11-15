export function mixerButton(website, playback) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Two-deck mixer';
  button.addEventListener('click', () => {
    const dialog = document.createElement('dialog');
    dialog.className = 'mixer-dialog';
    dialog.setAttribute('aria-label', 'Two-deck mixer');
    const destination = new URL('mixer/', website);
    if (playback.trackKey)
      destination.hash = new URLSearchParams({
        track: 'https://soundcloud.com' + playback.trackKey,
      }).toString();
    const toolbar = document.createElement('header');
    const title = document.createElement('strong');
    title.textContent = 'Two-deck mixer';
    const external = document.createElement('a');
    external.href = destination.href;
    external.target = '_blank';
    external.rel = 'noopener noreferrer';
    external.textContent = 'Open in browser';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', () => dialog.close());
    toolbar.append(title, external, close);
    const frame = document.createElement('iframe');
    frame.title = 'Decks and crossfader';
    frame.allow = 'autoplay';
    frame.referrerPolicy = 'no-referrer';
    destination.searchParams.set('host', location.origin);
    frame.src = destination.href;
    dialog.append(toolbar, frame);
    button.closest('.settings').append(dialog);
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.stopPropagation();
    });
    const playing = (event) => {
      if (
        !dialog.open ||
        !event.isTrusted ||
        event.source !== frame.contentWindow ||
        event.origin !== destination.origin
      )
        return;
      if (event.data === 'soundcloud-track-control:mixer-close')
        return dialog.close();
      if (event.data !== 'soundcloud-track-control:mixer-playing') return;
      document
        .querySelector(
          '.playControls__play.playing,.playControls__play[aria-label="Pause"],.playControls__play[title="Pause"]',
        )
        ?.click();
    };
    window.addEventListener('message', playing);
    dialog.addEventListener(
      'close',
      () => {
        window.removeEventListener('message', playing);
        frame.remove();
        dialog.remove();
        if (button.isConnected) button.focus();
      },
      { once: true },
    );
    dialog.showModal();
  });
  return button;
}
