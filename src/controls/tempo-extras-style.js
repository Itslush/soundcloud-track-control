export const tempoExtrasStyle = `
.pitch-engine-label,
.extras-select-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-block: 6px;
}
#pitch-engine,
#fx-room,
#dj-target {
  min-height: 28px;
  padding: 2px 6px;
  border: 1px solid var(--tempo-track);
  border-radius: 3px;
  background: var(--tempo-surface, transparent);
}
#output-max-db {
  width: 84px;
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid var(--tempo-track);
  border-radius: 2px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.extras-nested {
  margin-top: 6px;
  padding-top: 4px;
  border-top: 1px solid color-mix(in srgb, var(--tempo-fg) 14%, transparent);
}
.extras-nested > summary {
  font-weight: 600;
}
.extras-stack {
  display: grid;
  gap: 8px;
  padding: 6px 0 4px;
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
  opacity: 0.85;
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
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--tempo-fg) 28%, transparent);
  border-radius: 3px;
  background: color-mix(in srgb, var(--tempo-fg) 4%, transparent);
  font-variant-numeric: tabular-nums;
}
.settings .extras-btn:hover:not(:disabled),
.settings .preset-chip:hover:not(:disabled),
.settings .cue-pad:hover:not(:disabled),
.settings .cue-clear:hover:not(:disabled),
.settings .kb-key:hover:not(:disabled),
.settings .kb-clear:hover:not(:disabled),
.settings .preset-del:hover:not(:disabled) {
  background: color-mix(in srgb, var(--tempo-fg) 12%, transparent);
}
.settings .extras-btn[aria-pressed='true'],
.settings .preset-chip[aria-pressed='true'],
.settings .cue-pad[data-set='true'],
.settings .kb-key[data-recording='true'] {
  border-color: var(--tempo-accent);
  color: var(--tempo-accent);
  font-weight: 600;
}
.tool-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
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
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.settings .preset-del {
  min-height: 28px;
  min-width: 24px;
  padding: 2px 6px;
  border: 1px solid color-mix(in srgb, var(--tempo-fg) 28%, transparent);
  border-radius: 3px;
  background: color-mix(in srgb, var(--tempo-fg) 4%, transparent);
}
.preset-save-row input[type='text'],
#bpm-target {
  min-height: 28px;
  padding: 3px 6px;
  border: 1px solid var(--tempo-track);
  border-radius: 3px;
  background: transparent;
}
.preset-save-row input[type='text'] {
  flex: 1 1 120px;
  min-width: 0;
}
#bpm-target {
  width: 72px;
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
  border-radius: 999px;
  background: color-mix(in srgb, var(--tempo-fg) 15%, transparent);
  overflow: hidden;
}
.hud-meter-fill {
  height: 100%;
  width: 0%;
  background: var(--tempo-accent);
  transition: width 60ms linear;
}
.settings .hud-clip[data-clipped='true'] {
  border-color: var(--tempo-accent);
  color: var(--tempo-accent);
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
.settings .kb-clear {
  min-height: 28px;
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--tempo-fg) 28%, transparent);
  border-radius: 3px;
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
