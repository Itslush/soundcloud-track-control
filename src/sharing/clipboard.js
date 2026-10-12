export function installClipboardSharing({ copyLinksEnabled, shareLink }) {
  let contextLink = null;
  if (navigator.clipboard?.writeText) {
    const writeText = navigator.clipboard.writeText.bind(navigator.clipboard);
    try {
      navigator.clipboard.writeText = (text) => writeText(shareLink(text));
    } catch {}
  }
  function restoreContextLink() {
    if (!contextLink) return;
    const { anchor, original, shared } = contextLink;
    if (anchor.getAttribute('href') === shared)
      anchor.setAttribute('href', original);
    contextLink = null;
  }
  document.addEventListener(
    'contextmenu',
    (event) => {
      restoreContextLink();
      if (!copyLinksEnabled()) return;
      const anchor = event
        .composedPath()
        .find((node) => node instanceof HTMLAnchorElement);
      if (!anchor) return;
      const original = anchor.getAttribute('href');
      if (original === null) return;
      const shared = shareLink(anchor.href);
      if (shared === anchor.href) return;
      contextLink = { anchor, original, shared };
      anchor.setAttribute('href', shared);
    },
    true,
  );
  document.addEventListener('pointerdown', restoreContextLink, true);
  document.addEventListener('keydown', restoreContextLink, true);
  window.addEventListener('pagehide', restoreContextLink);
  window.addEventListener('copy', (event) => {
    if (!copyLinksEnabled() || !event.clipboardData) return;
    const target = document.activeElement;
    const selected =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
        ? target.value.slice(
            target.selectionStart ?? 0,
            target.selectionEnd ?? 0,
          )
        : String(window.getSelection());
    const original = event.clipboardData.getData('text/plain') || selected;
    const shared = shareLink(original);
    if (shared !== original) {
      event.clipboardData.setData('text/plain', shared);
      event.clipboardData.clearData('text/html');
      event.preventDefault();
    }
  });
  return {
    originalLink(anchor) {
      return contextLink?.anchor === anchor &&
        anchor?.getAttribute('href') === contextLink.shared
        ? contextLink.original
        : null;
    },
  };
}
