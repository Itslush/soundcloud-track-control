let dock;
let launcher;
let ready = false;
let pending = [];
let expanded = false;

export function loadMixerDeck(deck, track) {
  if (!dock) launcher?.click();
  if (!dock) return false;
  dock.open();
  dock.send({ type: 'soundcloud-track-control:mixer-load', deck, track });
  return true;
}

export function mixerMessage(message) {
  if (!dock) launcher?.click();
  dock?.message(message);
}

export function mixerButton(website, playback) {
  const button = document.createElement('button');
  button.type = 'button';
  launcher = button;
  button.className = 'mixer-button';
  button.textContent = 'Mix';
  button.title = 'Two-deck mixer (Alt+Shift+1 or 2 loads a track)';
  button.setAttribute('aria-label', button.title);
  button.addEventListener('click', () => {
    if (dock) return dock.toggle();
    const destination = new URL('mixer/', website);
    destination.searchParams.set('host', location.origin);
    if (playback.trackKey)
      destination.hash = new URLSearchParams({
        track: 'https://soundcloud.com' + playback.trackKey,
      }).toString();
    const panel = document.createElement('section');
    panel.setAttribute('aria-label', 'Two-deck mixer');
    panel.style.cssText =
      'position:fixed;z-index:10000;bottom:50px;right:0;width:min(900px,100vw);height:min(140px,calc(100dvh - 55px));background:#181818;border:1px solid #555;box-sizing:border-box;display:flex;flex-direction:column';
    const header = document.createElement('header');
    header.style.cssText =
      'display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:5px 10px;color:white;font:13px Arial,sans-serif';
    const title = document.createElement('strong');
    title.textContent = 'Mixer · hover or focus a track, then Alt+Shift+1 / 2';
    title.style.flex = '1';
    const external = document.createElement('a');
    external.href = new URL('mixer/', website).href;
    external.target = '_blank';
    external.rel = 'noopener noreferrer';
    external.textContent = 'Full mixer';
    external.style.color = 'white';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Collapse';
    close.style.cssText =
      'color:inherit;background:transparent;border:1px solid currentColor;border-radius:3px;padding:3px 7px;font:inherit;cursor:pointer';
    close.addEventListener('click', () => {
      panel.hidden = true;
      panel.style.display = 'none';
      launcher?.setAttribute('aria-expanded', 'false');
    });
    header.append(title, external, close);
    const timeout = setTimeout(() => {
      if (!ready)
        title.textContent =
          'Mixer is still loading. Check your connection or open the full mixer.';
    }, 12000);
    const frame = document.createElement('iframe');
    frame.title = 'Two mixer decks';
    frame.allow = 'autoplay';
    frame.referrerPolicy = 'no-referrer';
    frame.style.cssText = 'width:100%;min-height:0;flex:1;border:0';
    frame.src = destination.href;
    panel.append(header, frame);
    document.body.append(panel);
    const position = () => {
      const bar = document.querySelector('.playControls');
      const bottom = Math.max(
        50,
        bar ? window.innerHeight - bar.getBoundingClientRect().top : 50,
      );
      panel.style.bottom = `${bottom}px`;
      const height = expanded ? 430 : window.innerWidth <= 620 ? 190 : 140;
      panel.style.height = `min(${height}px, calc(100dvh - ${bottom + 5}px))`;
      const bg = bar ? getComputedStyle(bar).backgroundColor : '';
      const channels = bg.match(/\d+/g)?.map(Number) || [24, 24, 24];
      const theme =
        channels.slice(0, 3).reduce((a, b) => a + b, 0) > 450
          ? 'light'
          : channels.slice(0, 3).every((value) => value < 12)
            ? 'oled'
            : 'charcoal';
      panel.style.background =
        theme === 'light' ? '#f2f2f2' : theme === 'oled' ? '#000' : '#181818';
      header.style.color = external.style.color =
        theme === 'light' ? '#222' : '#fff';
      if (ready)
        frame.contentWindow.postMessage(
          { type: 'soundcloud-track-control:mixer-theme', theme },
          destination.origin,
        );
    };
    window.addEventListener('resize', position);
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
    const open = () => {
      position();
      panel.hidden = false;
      panel.style.display = 'flex';
      launcher?.setAttribute('aria-expanded', 'true');
    };
    dock = {
      open,
      message(value) {
        open();
        title.textContent = value;
      },
      toggle() {
        if (panel.hidden) open();
        else close.click();
      },
      send(message) {
        if (ready) frame.contentWindow.postMessage(message, destination.origin);
        else pending.push(message);
      },
    };
    position();
    button.setAttribute('aria-expanded', 'true');
    window.addEventListener('message', (event) => {
      if (
        !event.isTrusted ||
        event.source !== frame.contentWindow ||
        event.origin !== destination.origin
      )
        return;
      if (event.data === 'soundcloud-track-control:mixer-ready') {
        ready = true;
        position();
        clearTimeout(timeout);
        for (const message of pending) dock.send(message);
        pending = [];
      } else if (
        event.data?.type === 'soundcloud-track-control:mixer-size' &&
        typeof event.data.expanded === 'boolean'
      ) {
        expanded = event.data.expanded;
        position();
      } else if (event.data === 'soundcloud-track-control:mixer-close')
        close.click();
      else if (event.data === 'soundcloud-track-control:mixer-playing')
        document
          .querySelector(
            '.playControls__play.playing,.playControls__play[aria-label="Pause"],.playControls__play[title="Pause"]',
          )
          ?.click();
    });
  });
  button.setAttribute('aria-expanded', 'false');
  return button;
}
