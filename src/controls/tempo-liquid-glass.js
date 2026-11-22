export const tempoLiquidGlassStyle = `
  :host, .tempo-editor {
    --tempo-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
    --tempo-glass-bg: color-mix(in srgb, var(--tempo-surface, #202020) 92%, transparent);
    --tempo-glass-border: color-mix(in srgb, var(--tempo-fg, #f4f4f4) 16%, transparent);
    --tempo-glass-rim: color-mix(in srgb, #ffffff 16%, transparent);
    --tempo-glass-shadow:
      inset 0 1px 0 var(--tempo-glass-rim),
      inset 0 -1px 0 rgb(0 0 0 / 20%),
      0 18px 44px rgb(0 0 0 / 38%),
      0 2px 8px rgb(0 0 0 / 16%);
    --tempo-capsule-border: color-mix(in srgb, var(--tempo-fg, #f4f4f4) 15%, transparent);
    --tempo-capsule-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 10%, transparent);
    scrollbar-width: thin;
    scrollbar-color: var(--tempo-track) transparent;
  }

  /* Liquid glass floating overlays (modest blur + specular top highlight) */
  #tempo-fader[popover],
  .settings,
  .tempo-editor:not(.tempo-editor-inline),
  .tempo-choice-list {
    background: var(--tempo-glass-bg);
    -webkit-backdrop-filter: blur(24px) saturate(185%);
    backdrop-filter: blur(24px) saturate(185%);
    border-color: var(--tempo-glass-border);
    box-shadow: var(--tempo-glass-shadow);
    overscroll-behavior: contain;
  }

  #tempo-fader[popover] {
    border-radius: 12px;
    padding: 10px;
  }

  .settings {
    border-radius: 14px;
    padding: 12px;
  }

  .tempo-editor:not(.tempo-editor-inline) {
    border-radius: 14px;
    padding: 14px;
  }

  .tempo-choice-list {
    border-radius: 10px;
    padding: 4px;
    transform-origin: top left;
    transition: opacity 150ms var(--tempo-ease-out), transform 150ms var(--tempo-ease-out);
  }
  .tempo-choice-list[data-side='top'] {
    transform-origin: bottom left;
  }

  /* Tactile button & trigger feedback */
  :is(:host, .tempo-editor) button {
    -webkit-tap-highlight-color: transparent;
    transition:
      border-color 140ms var(--tempo-ease-out),
      transform 110ms var(--tempo-ease-out);
  }
  :is(:host, .tempo-editor) button:not(:disabled):active {
    transform: scale(0.97);
  }

  /* Replace default browser checkboxes with Apple/Radix style toggle switches */
  :is(.settings, .tempo-editor) input[type='checkbox'] {
    appearance: none;
    -webkit-appearance: none;
    position: relative;
    flex: none;
    width: 34px;
    height: 20px;
    margin: 0;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--tempo-fg) 26%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--tempo-fg) 18%, transparent);
    cursor: pointer;
    vertical-align: middle;
    transition:
      background-color 160ms var(--tempo-ease-out),
      border-color 160ms var(--tempo-ease-out);
  }
  :is(.settings, .tempo-editor) input[type='checkbox']::before {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 32%);
    transition: transform 180ms var(--tempo-ease-out);
  }
  :is(.settings, .tempo-editor) input[type='checkbox']:checked {
    background: var(--tempo-accent);
    border-color: var(--tempo-accent);
  }
  :is(.settings, .tempo-editor) input[type='checkbox']:checked::before {
    transform: translateX(14px);
  }
  :is(.settings, .tempo-editor) input[type='checkbox']:disabled {
    opacity: 0.45;
    cursor: default;
  }

  /* Compact switch inside 44px-max saved track rows */
  .saved-row input[type='checkbox'] {
    width: 28px;
    height: 16px;
  }
  .saved-row input[type='checkbox']::before {
    top: 1px;
    left: 1px;
    width: 12px;
    height: 12px;
  }
  .saved-row input[type='checkbox']:checked::before {
    transform: translateX(12px);
  }

  /* Segmented capsule buttons replacing native radio circles in Appearance */
  .settings .appearance-options {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    padding: 0;
    margin: 6px 0 8px;
    border-radius: 0;
    background: transparent;
    border: 0;
  }
  .settings .appearance-options legend {
    margin-bottom: 6px;
    padding: 0;
    font-weight: 500;
  }
  .settings .appearance-options label {
    position: relative;
    justify-content: center;
    min-height: 30px;
    padding: 4px 6px;
    border-radius: 8px;
    border: 1px solid var(--tempo-capsule-border);
    background: color-mix(in srgb, var(--tempo-fg) 6%, transparent);
    font-weight: 500;
    text-align: center;
    cursor: pointer;
    user-select: none;
    transition:
      background-color 150ms var(--tempo-ease-out),
      border-color 150ms var(--tempo-ease-out),
      color 150ms var(--tempo-ease-out),
      box-shadow 150ms var(--tempo-ease-out);
  }
  .settings .appearance-options input[type='radio'] {
    appearance: none;
    -webkit-appearance: none;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    border: 0;
    opacity: 0;
    cursor: pointer;
  }
  .settings .appearance-options label:has(input:checked) {
    background: var(--tempo-surface);
    border-color: var(--tempo-accent-ink, var(--tempo-accent));
    color: var(--tempo-fg);
    font-weight: 600;
    box-shadow:
      0 1px 3px rgb(0 0 0 / 26%),
      inset 0 1px 0 color-mix(in srgb, #ffffff 12%, transparent);
  }
  .settings .appearance-options label:has(input:focus-visible) {
    outline: 2px solid var(--tempo-accent);
    outline-offset: 1px;
  }

  /* Custom search field & disclosure chrome */
  .saved-search-box {
    position: relative;
    display: flex;
    align-items: center;
  }
  .saved-search-icon {
    position: absolute;
    left: 10px;
    width: 14px;
    height: 14px;
    opacity: 0.65;
    pointer-events: none;
  }
  .settings input[type='search'] {
    padding: 7px 28px 7px 30px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--tempo-fg) 5%, transparent);
  }
  .settings input[type='search']::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
  }
  .saved-search-clear {
    position: absolute;
    right: 4px;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    min-height: 24px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 5px;
    background: transparent !important;
    opacity: 0.72;
  }
  .saved-search-clear:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--tempo-fg) 10%, transparent) !important;
  }

  :is(.settings, .tempo-editor) summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    list-style: none;
    border-radius: 6px;
    user-select: none;
  }
  :is(.settings, .tempo-editor) summary::-webkit-details-marker {
    display: none;
  }
  .settings .deck-disclosure summary::before {
    display: none;
  }
  :is(.settings, .tempo-editor) summary .summary-chevron,
  .tempo-editor details > summary::after,
  .settings details > summary::after {
    flex: none;
    transition: transform 160ms var(--tempo-ease-out);
  }
  .settings details:not(.deck-disclosure) > summary:not(:has(svg))::after,
  .tempo-editor details > summary:not(:has(svg))::after {
    content: '';
    width: 6px;
    height: 6px;
    margin-right: 4px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(-45deg);
  }
  .settings details[open]:not(.deck-disclosure) > summary:not(:has(svg))::after,
  .tempo-editor details[open] > summary:not(:has(svg))::after {
    transform: rotate(45deg);
  }
  .settings .deck-disclosure[open] summary svg {
    transform: rotate(180deg);
  }

  @media (max-width: 380px) {
    .settings .appearance-options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* Coarse touch targets */
  @media (pointer: coarse) {
    :is(.settings, .tempo-editor) input[type='checkbox'] {
      width: 44px;
      height: 26px;
    }
    :is(.settings, .tempo-editor) input[type='checkbox']::before {
      width: 20px;
      height: 20px;
    }
    :is(.settings, .tempo-editor) input[type='checkbox']:checked::before {
      transform: translateX(18px);
    }
    .saved-row input[type='checkbox'] {
      width: 34px;
      height: 20px;
    }
    .saved-row input[type='checkbox']::before {
      width: 14px;
      height: 14px;
    }
    .saved-row input[type='checkbox']:checked::before {
      transform: translateX(14px);
    }
    .settings .appearance-options label {
      min-height: 44px;
    }
  }

  @media (hover: none) {
    :is(:host, .tempo-editor) button:hover {
      background: transparent;
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    #tempo-fader[popover],
    .settings,
    .tempo-editor:not(.tempo-editor-inline),
    .tempo-choice-list {
      background: var(--tempo-surface);
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :is(:host, .tempo-editor) button,
    :is(.settings, .tempo-editor) input[type='checkbox'],
    :is(.settings, .tempo-editor) input[type='checkbox']::before,
    .settings .appearance-options label,
    .tempo-choice-list {
      transition: none;
    }
    :is(:host, .tempo-editor) button:not(:disabled):active {
      transform: none;
    }
  }

  @media (forced-colors: active) {
    #tempo-fader[popover],
    .settings,
    .tempo-editor:not(.tempo-editor-inline),
    .tempo-choice-list {
      background: Canvas;
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
      box-shadow: none;
      border-color: ButtonText;
    }
    :is(.settings, .tempo-editor) input[type='checkbox'] {
      background: Canvas;
      border: 2px solid ButtonText;
    }
    :is(.settings, .tempo-editor) input[type='checkbox']::before {
      background: ButtonText;
    }
    :is(.settings, .tempo-editor) input[type='checkbox']:checked {
      background: Highlight;
      border-color: Highlight;
    }
    :is(.settings, .tempo-editor) input[type='checkbox']:checked::before {
      background: HighlightText;
    }
    .settings .appearance-options label:has(input:checked) {
      background: Highlight;
      color: HighlightText;
    }
  }
`;
