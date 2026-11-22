const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

export function createSettingsTabs({ root, settings, onTabChange }) {
  const tablist = root.querySelector('.settings-tabs');
  const tabs = [...root.querySelectorAll('[role="tab"][data-settings-tab]')];
  const panels = [
    ...root.querySelectorAll('[role="tabpanel"][data-settings-panel]'),
  ];
  const pinButton = root.querySelector('.pin-settings');

  let activeTab = tabs[0]?.dataset.settingsTab || 'tracks';
  let pinned = false;
  let chooserMode = false;

  function visibleFocusables() {
    return [...settings.querySelectorAll(FOCUSABLE)].filter((element) => {
      if (element.hidden || element.closest('[hidden]')) return false;
      if (element.closest('details:not([open])') && !element.matches('summary'))
        return false;
      return element.getClientRects().length > 0;
    });
  }

  function select(tabId, { focus = false } = {}) {
    const target =
      tabs.find((tab) => tab.dataset.settingsTab === tabId) || tabs[0];
    if (!target) return;
    activeTab = target.dataset.settingsTab;
    for (const tab of tabs) {
      const selected = tab === target;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of panels) {
      panel.hidden = panel.dataset.settingsPanel !== activeTab;
    }
    if (focus) target.focus();
    onTabChange?.(activeTab);
  }

  function setPinned(next) {
    pinned = chooserMode ? false : Boolean(next);
    if (pinButton) {
      pinButton.setAttribute('aria-pressed', String(pinned));
      pinButton.textContent = pinned ? 'Pinned' : 'Pin';
      pinButton.setAttribute(
        'aria-label',
        pinned
          ? 'Unpin tempo settings'
          : 'Pin tempo settings to keep open when clicking SoundCloud',
      );
      pinButton.title = pinned
        ? 'Settings stay open while clicking SoundCloud'
        : 'Keep open while clicking SoundCloud waveforms';
    }
    settings.toggleAttribute('data-pinned', pinned);
    settings.setAttribute('aria-modal', String(!pinned));
  }

  function setChooserMode(enabled) {
    chooserMode = Boolean(enabled);
    if (tablist) tablist.hidden = chooserMode;
    if (pinButton) pinButton.hidden = chooserMode;
    if (chooserMode) {
      setPinned(false);
      select('appearance');
    }
  }

  tablist?.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"][data-settings-tab]');
    if (!tab || chooserMode) return;
    select(tab.dataset.settingsTab);
  });

  tablist?.addEventListener('keydown', (event) => {
    if (chooserMode || !tabs.length) return;
    const current = tabs.indexOf(root.activeElement);
    if (current < 0) return;
    let nextIndex = -1;
    if (event.key === 'ArrowRight') nextIndex = (current + 1) % tabs.length;
    else if (event.key === 'ArrowLeft')
      nextIndex = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex < 0) return;
    event.preventDefault();
    select(tabs[nextIndex].dataset.settingsTab, { focus: true });
  });

  pinButton?.addEventListener('click', () => {
    if (!chooserMode) setPinned(!pinned);
  });

  settings.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || settings.hidden || pinned) return;
    const items = visibleFocusables();
    if (!items.length) return;
    const active = settings.getRootNode().activeElement;
    const index = items.indexOf(active);
    if (event.shiftKey) {
      if (index <= 0) {
        event.preventDefault();
        items[items.length - 1].focus();
      }
    } else if (index === -1 || index >= items.length - 1) {
      event.preventDefault();
      items[0].focus();
    }
  });

  select(activeTab);
  setPinned(false);

  return {
    select,
    active: () => activeTab,
    isPinned: () => pinned,
    setPinned,
    setChooserMode,
  };
}
