export const tempoExtrasStyle = `
.pitch-engine-label,
.extras-select-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-block: 6px;
}
.settings-subsection {
  padding-top: 10px;
  margin-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--tempo-fg) 24%, transparent);
}
.settings-subsection:first-child {
  padding-top: 0;
  margin-top: 0;
  border-top: 0;
}
.settings-section-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
}
.settings-subtitle {
  margin: 8px 0 4px;
  padding: 0;
  font-size: 11px;
  font-weight: 700;
}
.diagnostics-group {
  margin-top: 10px;
  padding-top: 6px;
  border-top: 1px solid color-mix(in srgb, var(--tempo-fg) 24%, transparent);
}
.diagnostics-group > summary {
  font-weight: 600;
}
.crossfade-options,
.star-speed-wrap {
  margin-top: 8px;
}
.extras-stack {
  display: grid;
  gap: 8px;
  padding: 2px 0 4px;
}
.fx-row {
  display: grid;
  gap: 2px;
}
.fx-row label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.fx-row output {
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
}
.fx-row input[type='range'] {
  width: 100%;
  accent-color: var(--tempo-accent);
}
.fx-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.settings .extras-btn,
.settings .preset-chip,
.settings .cue-pad,
.settings .cue-clear,
.settings .kb-key {
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid var(--tempo-border, #767676);
  border-radius: 7px;
  background: var(--tempo-btn-bg, #262626);
  font-variant-numeric: tabular-nums;
}
#fx-reset,
#preset-save {
  min-width: 114px;
  min-height: 36px;
  text-align: center;
}
#loop-a,
#loop-b,
#loop-clear {
  min-width: 68px;
  text-align: center;
}
.settings .kb-key {
  min-width: 124px;
  text-align: center;
}
.settings .extras-btn:hover:not(:disabled),
.settings .preset-chip:hover:not(:disabled),
.settings .cue-pad:hover:not(:disabled),
.settings .cue-clear:hover:not(:disabled),
.settings .kb-key:hover:not(:disabled),
.settings .kb-clear:hover:not(:disabled),
.settings .preset-del:hover:not(:disabled) {
  background: var(--tempo-hover, #2c2c2c);
}
.settings .extras-btn[aria-pressed='true'],
.settings .preset-chip[aria-pressed='true'],
.settings .cue-pad[data-set='true'],
.settings .kb-key[data-recording='true'] {
  border-color: var(--tempo-accent-ink, var(--tempo-accent));
  color: var(--tempo-accent-ink, var(--tempo-accent));
  font-weight: 600;
}
.tool-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.dj-row {
  justify-content: space-between;
}
.deck-disclosure {
  border-top: 1px solid color-mix(in srgb, var(--tempo-fg) 20%, transparent);
  padding-top: 6px;
  margin-top: 4px;
}
.deck-disclosure summary {
  cursor: pointer;
  font-weight: 600;
  min-height: 36px;
  display: flex;
  align-items: center;
}
.deck-disclosure summary::before {
  content: '▸';
  margin-right: 6px;
}
.deck-disclosure[open] summary::before {
  content: '▾';
}
.extras-note {
  margin: 0;
  font-size: 11px;
  opacity: 0.85;
}
.tool-section-label {
  font-weight: 600;
  margin-top: 2px;
}
.preset-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.preset-item {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 2px;
}
.preset-chip {
  flex: 1 1 auto;
  text-align: center;
}
.settings .preset-del {
  min-height: 32px;
  min-width: 28px;
  padding: 2px 6px;
  border: 1px solid var(--tempo-border, #767676);
  border-radius: 7px;
  background: var(--tempo-btn-bg, #262626);
}
.preset-save-row input[type='text'] {
  flex: 1 1 120px;
  min-width: 0;
  min-height: 36px;
  padding: 4px 8px;
  border: 1px solid var(--tempo-track);
  border-radius: 7px;
  background: transparent;
}
.bpm-entry .tempo-number input {
  width: 64px;
  text-align: center;
}
.cue-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.cue-slot {
  display: flex;
  align-items: center;
  gap: 4px;
}
.cue-pad {
  flex: 1 1 auto;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cue-clear {
  flex: 0 0 auto;
  min-width: 28px;
}
.extras-status {
  margin: 0;
  font-size: 11px;
  opacity: 0.9;
}
.extras-status:empty,
.kb-status:empty {
  display: none;
}
.hud-grid {
  display: grid;
  gap: 6px;
  padding: 6px 0;
  font-variant-numeric: tabular-nums;
}
.hud-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.hud-meter-track {
  height: 6px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--tempo-fg) 22%, transparent);
  overflow: hidden;
}
.hud-meter-fill {
  height: 100%;
  width: 100%;
  transform-origin: left;
  transform: scaleX(0);
  background: var(--tempo-accent);
  transition: transform 60ms linear;
}
@media (prefers-reduced-motion: reduce) {
  .hud-meter-fill {
    transition: none;
  }
}
.settings .hud-clip[data-clipped='true'] {
  border-color: var(--tempo-accent-ink, var(--tempo-accent));
  color: var(--tempo-accent-ink, var(--tempo-accent));
  font-weight: 700;
}
.keybinds-mount {
  display: grid;
  gap: 6px;
  margin-block: 6px;
}
.kb-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 6px;
}
.kb-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kb-group-title {
  font-size: 11px;
  font-weight: 700;
  opacity: 0.8;
  margin: 8px 0 2px;
}
.kb-group-title:first-child {
  margin-top: 2px;
}
.settings .kb-clear {
  min-height: 32px;
  min-width: 56px;
  padding: 4px 8px;
  text-align: center;
  border: 1px solid var(--tempo-border, #767676);
  border-radius: 7px;
  background: transparent;
}
.settings .kb-clear:disabled {
  opacity: 0.45;
  cursor: default;
}
@media (pointer: coarse) {
  .settings .extras-btn,
  .settings .preset-chip,
  .settings .cue-pad,
  .settings .cue-clear,
  .settings .kb-key,
  .settings .kb-clear,
  .settings .preset-del {
    min-height: 44px;
  }
}
`;
