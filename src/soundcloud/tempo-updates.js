let releaseNoticeChecked = false;

export function showReleaseNotice(ui, VERSION, WEBSITE) {
  if (releaseNoticeChecked || !ui?.host.isConnected) return;
  releaseNoticeChecked = true;
  const key = 'soundcloud.tempo.seenVersion';
  let previous;
  try {
    previous = localStorage.getItem(key);
    if (previous === VERSION) return;
    localStorage.setItem(key, VERSION);
  } catch {
    return;
  }
  if (!previous) return;
  const notice = document.createElement('aside');
  notice.className = 'release-notice';
  const style = document.createElement('style');
  style.textContent = `
    .release-notice {
      position: fixed;
      right: 16px;
      bottom: 108px;
      z-index: 10001;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      max-width: calc(100vw - 32px);
      box-sizing: border-box;
      padding: 12px 16px;
      border: 1px solid var(--tempo-track, #888);
      border-radius: 4px;
      background: var(--tempo-surface, #303030);
      color: var(--tempo-fg, #fff);
      font-size: 13px;
      line-height: 1.5;
      font-family: inherit;
    }
    .release-notice a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
    .release-notice button {
      padding: 6px 9px;
      border: 1px solid var(--tempo-track, #888);
      border-radius: 3px;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .release-notice :focus-visible { outline: 2px solid var(--tempo-accent, #ff7733); outline-offset: 3px; }
    :host([data-touch-player]) .release-notice {
      position: static;
      display: grid;
      grid-template-columns: 1fr auto;
      width: 100%;
      max-width: none;
      margin: 0 0 8px;
      padding: 8px;
      gap: 8px;
      font-size: 14px;
    }
    :host([data-touch-player]) .release-notice > span { grid-column: 1 / -1; }
    :host([data-touch-player]) .release-notice :is(a,button) {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding: 6px 9px;
      box-sizing: border-box;
      font: inherit;
    }
  `;
  const message = document.createElement('span');
  message.setAttribute('role', 'status');
  message.textContent = `Track Control updated · v${VERSION}`;
  notice.append(message);
  if (WEBSITE) {
    const link = document.createElement('a');
    link.textContent = "What's new";
    link.href = new URL('updates/', WEBSITE).href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    notice.append(link);
  }
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Dismiss';
  dismiss.addEventListener(
    'click',
    () => {
      notice.remove();
      style.remove();
      const settings = ui.host.hasAttribute('data-touch-player')
        ? ui.root.querySelector('.touch-settings')
        : ui.settingsButton;
      settings.focus();
    },
    { once: true },
  );
  notice.append(dismiss);
  ui.root.prepend(style, notice);
}
