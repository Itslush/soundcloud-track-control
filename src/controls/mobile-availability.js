import { touchViewport } from './tempo-mobile-player.js';

export function createMobileAvailability({ document, website }) {
  const window = document.defaultView,
    events = new AbortController();
  let notice,
    dismissed = false;
  function update() {
    const geometry = touchViewport(
      window.visualViewport,
      window.screen.width,
      window.matchMedia('(any-pointer:coarse)').matches,
    );
    if (!geometry.touch || document.querySelector('.playControls__elements')) {
      notice?.remove();
      notice = undefined;
      return;
    }
    if (dismissed || document.readyState !== 'complete' || !document.body)
      return;
    if (!notice) {
      notice = document.createElement('aside');
      notice.id = 'soundcloud-track-mobile-availability';
      notice.setAttribute('aria-label', 'Track Control availability');
      notice.style.cssText =
        'position:fixed;z-index:2147483646;box-sizing:border-box;padding:12px;border:1px solid currentColor;border-radius:4px;font:16px/1.5 Arial,sans-serif;transform-origin:0 0';
      const text = document.createElement('p');
      text.style.cssText = 'margin:0 0 12px';
      text.textContent =
        'Track Control needs SoundCloud’s desktop player. Turn on Desktop site in your browser to use the touch controls.';
      const help = document.createElement('a');
      help.href = new URL('guide/', website).href;
      help.textContent = 'Installation help';
      help.style.cssText =
        'display:inline-flex;align-items:center;min-height:44px;color:inherit;text-underline-offset:3px';
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Dismiss';
      close.style.cssText =
        'float:right;min-height:44px;padding:8px 12px;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;font:inherit;cursor:pointer';
      close.addEventListener(
        'click',
        () => {
          dismissed = true;
          notice.remove();
          notice = undefined;
        },
        { signal: events.signal },
      );
      notice.append(text, help, close);
      document.body.append(notice);
    }
    const foreground = window.getComputedStyle(document.body).color;
    const bright =
      (foreground
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .reduce((sum, value) => sum + Number(value), 0) || 0) > 450;
    Object.assign(notice.style, {
      color: foreground,
      background: bright ? '#161616' : '#f2f2f2',
      width: `${geometry.width - 24}px`,
      left: `${geometry.left + 12 / geometry.scale}px`,
      transform: `scale(${1 / geometry.scale})`,
    });
    notice.style.top = `${geometry.top + (geometry.height - notice.offsetHeight - 12) / geometry.scale}px`;
  }
  for (const [target, name] of [
    [window, 'load'],
    [window, 'resize'],
    [window.visualViewport, 'resize'],
    [window.visualViewport, 'scroll'],
  ])
    target?.addEventListener(name, update, { signal: events.signal });
  return {
    update,
    dispose() {
      events.abort();
      notice?.remove();
    },
  };
}
