export {};

const root = document.querySelector<HTMLElement>('.feature-showcase');
const tablist = root?.querySelector<HTMLElement>('[role="tablist"]');
const tabs = [
  ...(root?.querySelectorAll<HTMLButtonElement>(
    '[role="tab"][data-feature-tab]',
  ) ?? []),
];
const panels = [
  ...(root?.querySelectorAll<HTMLElement>(
    '[role="tabpanel"][data-feature-panel]',
  ) ?? []),
];

function activate(id: string, focus = false) {
  const target = tabs.find((tab) => tab.dataset.featureTab === id) ?? tabs[0];
  if (!target) return;
  const active = target.dataset.featureTab;
  for (const tab of tabs) {
    const selected = tab === target;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of panels) {
    const activePanel = panel.dataset.featurePanel === active;
    panel.hidden = !activePanel;
    if (activePanel) {
      for (const img of panel.querySelectorAll<HTMLImageElement>('img')) {
        img.loading = 'eager';
      }
    }
  }
  if (focus) target.focus();
}

function syncHash() {
  const hash = location.hash;
  if (!hash || hash.length < 2) return;
  try {
    const target = root?.querySelector<HTMLElement>(hash);
    const panel = target?.closest<HTMLElement>('[data-feature-panel]');
    if (panel?.dataset.featurePanel) {
      activate(panel.dataset.featurePanel);
      target?.scrollIntoView();
    }
  } catch {}
}

if (root && tablist && tabs.length) {
  tablist.addEventListener('click', (event) => {
    const tab = (event.target as Element).closest<HTMLButtonElement>(
      '[role="tab"][data-feature-tab]',
    );
    if (tab?.dataset.featureTab) activate(tab.dataset.featureTab);
  });

  tablist.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft')
      next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const id = tabs[next]?.dataset.featureTab;
    if (id) activate(id, true);
  });

  activate(tabs[0].dataset.featureTab!);
  syncHash();
  window.addEventListener('hashchange', syncHash);
}
