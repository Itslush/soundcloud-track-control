import { tempoExtrasStyle } from './tempo-extras-style.js';
import { tempoFieldStyle } from './tempo-fields.js';
import { tempoLiquidGlassStyle } from './tempo-liquid-glass.js';
import { tempoRangeStyle } from './tempo-range.js';

export const controlsStyle = `
        :host {
          font: inherit;
          color: inherit;
          --tempo-fg: #222;
          --tempo-accent: #ff5500;
          --tempo-accent-ink: #b23c00;
          --tempo-accent-surface: #242424;
          --tempo-accent-hover: #ededeb;
          --tempo-selection-fg: #ffffff;
          --tempo-track: #6d6d6d;
        }

        * {
          box-sizing: border-box;
        }

        .controls {
          display: grid;
          grid-template-columns: 54px 20px minmax(0, 1fr) 104px 28px 28px;
          align-items: center;
          gap: 4px;
          width: 100%;
          height: 32px;
          color: var(--tempo-fg);
          font-size: 12px;
        }

        .controls.hide-key { grid-template-columns: 54px 20px minmax(0, 1fr) 28px 28px; }

        button,
        input,
        select {
          font: inherit;
          color: inherit;
        }

        button {
          cursor: pointer;
        }

        button:focus-visible,
        input:focus-visible,
        select:focus-visible {
          outline: 2px solid var(--tempo-fg);
          outline-offset: 2px;
        }

        .field {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 2px;
          height: 28px;
          padding: 0 3px 0 5px;
          border: 1px solid var(--tempo-capsule-border);
          border-right: 0;
          border-radius: 7px 0 0 7px;
          box-shadow: var(--tempo-capsule-shadow);
          font-variant-numeric: tabular-nums;
        }

        .field:focus-within {
          border-color: color-mix(in srgb, var(--tempo-accent) 70%, transparent);
        }

        .field #rate-number {
          width: 36px;
          text-align: right;
        }

        .field #rate-number:hover {
          background: transparent;
        }

        .unit {
          flex: none;
          line-height: 24px;
        }

        .slider-wrap {
          position: relative;
          min-width: 0;
          height: 32px;
        }
        .slider-wrap[data-style='slider'] {
          transform: translateY(var(--tempo-rail-offset, 0px));
        }
        .controls:has(.slider-wrap:not([data-style='slider'])) {
          grid-template-columns: 54px 20px 36px 104px 28px 28px;
        }
        .controls.hide-key:has(.slider-wrap:not([data-style='slider'])) {
          grid-template-columns: 54px 20px 36px 28px 28px;
        }
        .quick-key {
          display: inline-grid;
          grid-template-columns: 38px 12px 20px;
          align-items: center;
          gap: 4px;
          height: 28px;
          margin-left: 16px;
          padding: 0 2px 0 6px;
          border: 1px solid var(--tempo-capsule-border);
          border-radius: 7px;
          box-shadow: var(--tempo-capsule-shadow);
          font-size: 12px;
          line-height: 26px;
        }
        .quick-key:focus-within {
          border-color: color-mix(in srgb, var(--tempo-accent) 70%, transparent);
        }
        @media (max-width: 340px) {
          .controls { grid-template-columns: 46px 18px minmax(24px, 1fr) 94px 26px 26px; gap: 2px; }
          .controls:has(.slider-wrap:not([data-style='slider'])) { grid-template-columns: 46px 18px 32px 94px 26px 26px; }
          .controls.hide-key, .controls.hide-key:has(.slider-wrap:not([data-style='slider'])) { grid-template-columns: 46px 18px minmax(24px, 1fr) 26px 26px; }
          .controls.hide-key:has(.slider-wrap:not([data-style='slider'])) { grid-template-columns: 46px 18px 32px 26px 26px; }
          .field { padding: 0 2px 0 4px; }
          .field #rate-number { width: 30px; }
          .step { width: 18px; }
          .quick-key { grid-template-columns: 32px 12px 18px; gap: 3px; padding: 0 2px 0 5px; }
        }
        .fader-value, .fader-reset, .fader-normal, .fader-limit, .fader-level, .fader-ticks { display: none; }
        #tempo-fader[popover] .fader-value {
          display: block;
          text-align: center;
          font: inherit;
          font-variant-numeric: tabular-nums;
          line-height: 24px;
          margin-bottom: 4px;
        }
        #tempo-fader[popover] .fader-reset {
          display: block;
          width: 100%;
          height: 32px;
          margin-top: 8px;
          padding: 0;
          border: 1px solid var(--tempo-track);
          border-radius: 7px;
          background: transparent;
          font-size: 11px;
        }
        .fader-reset:hover { background: color-mix(in srgb, var(--tempo-fg) 8%, transparent); }
        #tempo-fader[popover] .fader-rail { position: relative; margin: 8px 0; }
        #tempo-fader[popover] .fader-normal {
          display: block;
          position: absolute;
          top: calc(6px + (100% - 12px) * 0.8);
          right: calc(50% + 16px);
          transform: translateY(-50%);
          font-size: 11px;
          line-height: 12px;
          pointer-events: none;
        }
        #tempo-fader[popover] .fader-normal::before {
          content: '';
          position: absolute;
          left: calc(100% + 4px);
          width: 6px;
          top: 50%;
          border-top: 1px solid var(--tempo-fg);
        }
        #tempo-fader[popover] .fader-limit {
          display: block; position: absolute; right: calc(50% + 16px);
          font-size: 11px; line-height: 12px; pointer-events: none;
        }
        .fader-max { top: 0; }
        .fader-min { bottom: 0; }
        #tempo-fader[popover] .fader-ticks {
          display: block; position: absolute; top: 0; left: calc(50% - 16px);
          width: 32px; height: 144px; pointer-events: none;
          fill: none; stroke: var(--tempo-track); stroke-width: 1;
        }
        #tempo-fader[popover] .fader-level {
          display: block; position: absolute; right: calc(50% + 16px);
          top: calc(6px + (100% - 12px) * var(--position));
          transform: translateY(-50%); font-size: 11px; line-height: 12px;
          pointer-events: none;
        }

        .ticks {
          position: absolute;
          inset: 24px 6px auto;
          width: calc(100% - 12px);
          height: 5px;
          overflow: visible;
          pointer-events: none;
        }

        .ticks path {
          fill: none;
          stroke: var(--tempo-track);
          stroke-width: 1px;
          vector-effect: non-scaling-stroke;
        }

        .ticks .normal-tick {
          stroke: var(--tempo-fg);
        }

        #rate-dial {
          display: block;
          position: relative;
          width: 32px;
          height: 32px;
          margin: auto;
          padding: 0;
          border: 0;
          border-radius: 3px;
          background: transparent;
          touch-action: none;
          cursor: ns-resize;
          user-select: none;
        }
        #rate-dial svg { position: absolute; inset: 0; width: 32px; height: 32px; overflow: visible; }
        #rate-dial svg path { fill: none; stroke-width: 1.5; stroke-linecap: round; }
        .dial-track { stroke: var(--tempo-track); }
        #rate-dial svg .dial-ticks { stroke: var(--tempo-track); stroke-width: 1; }
        .dial-fill { stroke: var(--tempo-accent); stroke-dasharray: 100; stroke-dashoffset: var(--dial-unfilled, 50); }
        .dial-zero { stroke: var(--tempo-fg); }
        #rate-dial circle { fill: color-mix(in srgb, var(--tempo-fg) 10%, var(--tempo-surface)); }
        #rate-dial:hover circle, #rate-dial:active circle { fill: color-mix(in srgb, var(--tempo-fg) 18%, var(--tempo-surface)); }
        #rate-dial span {
          position: absolute;
          inset: 8px;
          transform: rotate(var(--dial-angle, 0deg));
        }
        #rate-dial span::before {
          content: '';
          display: block;
          width: 2px;
          height: 6px;
          margin: 0 auto;
          background: var(--tempo-accent);
        }
        #rate-dial[hidden], #rate-slider[hidden], #vertical-toggle[hidden] { display: none; }
        #vertical-toggle {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          margin: auto;
          padding: 6px;
          border: 0;
          border-radius: 3px;
          background: transparent;
        }
        #vertical-toggle:hover, #vertical-toggle[aria-expanded='true'] {
          background: color-mix(in srgb, var(--tempo-fg) 8%, transparent);
        }
        #vertical-toggle svg {
          width: 20px;
          height: 20px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        #tempo-fader[popover] {
          position: fixed;
          inset: auto;
          margin: 0;
          padding: 8px;
          width: 96px;
          border: 1px solid var(--tempo-border, #767676);
          border-radius: 4px;
          background: var(--tempo-surface, #f2f2f2);
          color: var(--tempo-fg);
          font: inherit;
        }
        .slider-wrap[data-style='dial'] .ticks,
        .slider-wrap[data-style='vertical'] .ticks { display: none; }
        .slider-wrap[data-style='vertical'] #rate-slider {
          width: 32px;
          height: 144px;
          --range-thumb-opacity: 1;
          border: 0;
          padding: 0;
          margin: auto;
          writing-mode: vertical-lr;
          direction: rtl;
          background: linear-gradient(to top, var(--tempo-accent) var(--range-fill, 0%), var(--tempo-track) var(--range-fill, 0%)) center / 2px calc(100% - 12px) no-repeat;
        }
        .slider-wrap[data-style='vertical'] #rate-slider::-webkit-slider-runnable-track { width: 2px; height: 100%; }
        .slider-wrap[data-style='vertical'] #rate-slider::-webkit-slider-thumb { margin-top: 0; margin-left: -5px; }
        .slider-wrap[data-style='vertical'] #rate-slider::-moz-range-track { width: 2px; height: 100%; }
        .control-style-label,
        .key-shift-label { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0; flex-wrap: wrap; }
        .settings select { font: inherit; color: inherit; background: var(--tempo-surface); border: 1px solid var(--tempo-track); min-height: 32px; }

        @media (forced-colors: active) {
          .slider-wrap {
            forced-color-adjust: none;
            --tempo-accent: Highlight;
            --tempo-track: GrayText;
            --tempo-fg: CanvasText;
          }
        }

        .settings {
          display: flex;
          flex-direction: column;
          position: fixed;
          inset: auto;
          margin: 0;
          z-index: 2147483647;
          max-height: calc(100dvh - 80px);
          overflow: hidden;
          padding: 12px;
          border: 1px solid var(--tempo-track);
          border-radius: 4px;
          background: var(--tempo-surface, #f2f2f2);
          color: var(--tempo-fg);
          font-family: inherit;
          font-size: 12px;
          line-height: 1.5;
        }

        .settings > * {
          flex-shrink: 0;
        }

        .settings header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .settings-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        @media (min-width: 480px) {
          .settings-actions button {
            min-width: 60px;
            text-align: center;
          }
        }
        .settings-tabs {
          display: flex;
          gap: 2px;
          margin: 0 0 10px;
          padding: 3px;
          border-radius: 9px;
          background: color-mix(in srgb, var(--tempo-fg) 6%, transparent);
          border: 1px solid color-mix(in srgb, var(--tempo-fg) 12%, transparent);
          overflow-x: auto;
          scrollbar-width: none;
        }
        .settings .settings-tab {
          flex: 1 0 auto;
          min-height: 30px;
          padding: 4px 10px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          font-weight: 600;
          white-space: nowrap;
        }
        .settings .settings-tab[aria-selected='true'] {
          background: var(--tempo-surface);
          color: var(--tempo-accent-ink, var(--tempo-accent));
          box-shadow:
            0 1px 3px rgb(0 0 0 / 24%),
            inset 0 1px 0 color-mix(in srgb, #ffffff 10%, transparent);
        }
        .settings .pin-settings[aria-pressed='true'] {
          border-color: var(--tempo-accent-ink, var(--tempo-accent));
          color: var(--tempo-accent-ink, var(--tempo-accent));
          font-weight: 600;
        }
        .settings-panels {
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1 1 auto;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding-right: 4px;
        }
        #settings-panel-tracks {
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1 1 auto;
        }
        #settings-panel-appearance {
          display: grid;
          gap: 6px;
        }
        .settings[data-choosing-style] .settings-tabs,
        .settings[data-choosing-style] .pin-settings,
        .settings[data-choosing-style] .open-editor,
        .settings[data-choosing-style] .settings-panel:not(.appearance-settings),
        .settings[data-choosing-style] .appearance-options,
        .settings[data-choosing-style] .show-mixer-label,
        .settings[data-choosing-style] .increment-label,
        .settings[data-choosing-style] .star-motion-label,
        .settings[data-choosing-style] .star-speed-wrap {
          display: none;
        }
        .settings[data-choosing-style] header {
          flex-wrap: wrap;
          gap: 8px;
        }
        .settings[data-choosing-style] .close-settings {
          min-height: 44px;
        }

        .quick-settings {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 20px;
          margin-bottom: 8px;
        }

        .advanced-audio {
          margin: 0;
        }

        .settings summary {
          cursor: pointer;
          padding: 5px 0;
        }

        .crossfade-debug pre {
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          max-height: 180px;
          overflow: auto;
          font-size: 11px;
          line-height: 1.5;
        }
        .settings button {
          min-height: 30px;
          padding: 4px 10px;
          border: 1px solid var(--tempo-border, #767676);
          border-radius: 7px;
          background: transparent;
        }

        .settings button:hover {
          background: var(--tempo-hover, #2c2c2c);
        }

        .check-label {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
        }

        .settings input[type='checkbox'] {
          margin: 0;
        }

        .settings p {
          margin: 6px 0 12px;
        }
        .output-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 12px;
        }

        .output-entry { display: inline-flex; align-items: center; }
        .output-entry input { text-align: center; font-variant-numeric: tabular-nums; }

        #output-level {
          display: block;
          width: 100%;
          accent-color: var(--tempo-accent);
        }

        .settings input[type='search'] {
          width: 100%;
          padding: 6px;
          border: 1px solid var(--tempo-track);
          border-radius: 3px;
          background: transparent;
        }

        .settings input::placeholder {
          color: var(--tempo-fg);
          opacity: 0.7;
        }

        .saved-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 144px;
          gap: 4px 12px;
          align-items: center;
          padding: 4px 2px;
          border-bottom: 1px solid color-mix(in srgb, var(--tempo-fg) 16%, transparent);
          min-width: 0;
        }

        .saved-list {
          flex: 1 1 auto;
          min-height: 80px;
          max-height: 680px;
          overflow: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          scrollbar-width: thin;
          scrollbar-color: var(--tempo-track) transparent;
          padding-right: 6px;
        }

        .saved-list:empty {
          min-height: 0;
        }

        .saved-row:last-child {
          border-bottom: 0;
        }

        .settings .saved-count {
          margin: 6px 0;
        }

        .saved-setting {
          display: grid;
          grid-column: 2;
          grid-template-columns: 28px 68px 32px;
          gap: 8px;
          align-items: center;
        }

        .saved-switch {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 32px;
          cursor: pointer;
        }

        .saved-setting button {
          min-height: 32px;
          height: 32px;
          box-sizing: border-box;
          border: 1px solid var(--tempo-border, #767676);
          border-radius: 7px;
          background: var(--tempo-btn-bg, transparent);
        }
        .saved-setting .saved-remove {
          width: 32px;
          padding: 0;
        }

        .saved-row a {
          grid-column: 1;
          grid-row: 1;
          overflow: hidden;
          color: inherit;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-underline-offset: 3px;
        }

        .saved-row input[type='number'] {
          width: 38px;
          height: 30px;
          padding-right: 3px;
          text-align: right;
          border: 0;
        }

        .saved-value {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 32px;
          box-sizing: border-box;
          border: 1px solid var(--tempo-track);
          border-radius: 7px;
          font-variant-numeric: tabular-nums;
        }

        .saved-remove svg {
          display: block;
          width: 12px;
          height: 12px;
          margin: auto;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.5;
          stroke-linecap: round;
        }

        .settings-tools {
          margin-top: 8px;
          border-top: 1px solid color-mix(in srgb, var(--tempo-fg) 16%, transparent);
          padding-top: 4px;
        }

        .appearance-options {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 16px;
          margin: 0 0 4px;
          padding: 0;
          border: 0;
        }

        .appearance-options label {
          display: flex;
          align-items: center;
          min-height: 32px;
          gap: 6px;
          cursor: pointer;
        }

        .appearance-options input {
          margin: 0;
          accent-color: var(--tempo-accent);
        }

        .library-backup {
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px solid color-mix(in srgb, var(--tempo-fg) 22%, transparent);
        }

        .backup-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-block: 10px;
        }
        .backup-actions button {
          min-width: 114px;
          text-align: center;
        }

        .backup-preview p {
          margin-block: 8px;
        }

        .saved-more {
          margin-top: 10px;
        }

        @media (max-width: 390px) {
          .saved-row {
            grid-template-columns: minmax(0, 1fr) 118px;
            column-gap: 6px;
          }

          .saved-setting {
            grid-template-columns: 24px 58px 28px;
            gap: 4px;
          }

          .saved-row input[type='number'] {
            width: 42px;
          }
        }

        @media (pointer: coarse) {
          .settings button,
          .settings .settings-tab,
          .settings .tempo-choice-trigger,
          .settings summary,
          .appearance-options label,
          .check-label,
          .saved-setting button,
          .saved-switch,
          .saved-row input[type='number'] {
            min-height: 44px;
          }
          .settings .tempo-number-arrows {
            grid-auto-flow: column;
          }
          .settings .tempo-number-arrows button {
            min-width: 32px;
            min-height: 44px;
          }
          .settings .tempo-number {
            width: auto;
            min-width: 114px;
          }
        }

        .settings-status:empty {
          display: none;
        }

        input[type='number'] {
          width: 46px;
          min-width: 0;
          height: 24px;
          padding: 0;
          border: 0;
          border-radius: 2px;
          background: transparent;
          text-align: center;
          font-variant-numeric: tabular-nums;
          appearance: textfield;
          -moz-appearance: textfield;
          caret-color: var(--tempo-accent);
        }

        input[type='number']::-webkit-inner-spin-button,
        input[type='number']::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        input[type='number']:hover {
          background: color-mix(in srgb, var(--tempo-fg) 8%, transparent);
        }

        .steppers {
          display: grid;
          grid-template-rows: repeat(2, 13px);
          align-content: center;
          height: 28px;
          margin-left: -4px;
          border: 1px solid var(--tempo-capsule-border);
          border-left: 1px solid color-mix(in srgb, var(--tempo-fg) 10%, transparent);
          border-radius: 0 7px 7px 0;
          box-shadow: var(--tempo-capsule-shadow);
          overflow: hidden;
        }

        .step {
          display: grid;
          place-items: center;
          width: 19px;
          height: 13px;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
        }

        .step:hover:not(:disabled) {
          color: var(--tempo-accent);
          background: color-mix(in srgb, var(--tempo-fg) 8%, transparent);
        }

        .step:disabled {
          opacity: 0.35;
          cursor: default;
        }

        .step svg {
          width: 10px;
          height: 8px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        @media (max-width: 960px) {
          .controls { gap: 4px; }
          :host {
            flex-basis: var(--tempo-compact-width, 292px) !important;
            min-width: var(--tempo-compact-width, 292px) !important;
          }
        }

        @media (max-width: 340px) {
          :host { min-width: 0 !important; flex-basis: 100% !important; }
          .controls { gap: 2px; }
          .steppers { margin-left: -2px; }
          .memory, .settings-button { width: 26px; height: 26px; }
        }

        input::selection {
          background: var(--tempo-accent);
          color: var(--tempo-selection-fg, #fff);
        }

        ${tempoRangeStyle}${tempoFieldStyle}${tempoLiquidGlassStyle}
.quick-key .tempo-number{display:contents}
.quick-key .tempo-number input{grid-column:1;grid-row:1;width:38px;height:24px;padding:0;border:0;background:transparent;text-align:center;color:inherit;font:inherit;font-variant-numeric:tabular-nums}
.quick-key .tempo-number-arrows{grid-column:3;grid-row:1;height:24px;place-content:center}
.quick-key .tempo-number-arrows button{width:20px;height:12px;min-height:12px}
.quick-key .key-unit{grid-column:2;grid-row:1;text-align:center}
@media (max-width: 340px){.quick-key .tempo-number input{width:32px}.quick-key .tempo-number-arrows button{width:18px}}
#tempo-settings input[type='range']{--range-thumb-opacity:1}
.settings .tempo-choice-trigger{min-height:36px;padding:6px 8px;gap:6px;border:1px solid var(--tempo-track);border-radius:7px;background:var(--tempo-surface)}
.settings .tempo-number{width:114px;min-height:36px;height:36px;box-sizing:border-box;justify-content:space-between;border:1px solid var(--tempo-track);border-radius:7px;background:var(--tempo-surface)}
.settings .tempo-number input{flex:1;min-width:0;width:auto;height:34px;padding:4px 2px 4px 6px;border:0;background:transparent;text-align:center;font-variant-numeric:tabular-nums}
.control-style-label .tempo-choice,.pitch-engine-label .tempo-choice,.extras-select-row .tempo-choice,.dj-target-wrap .tempo-choice{width:114px}
.quick-key{white-space:nowrap}


        .memory,
        .settings-button {
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          padding: 0;
          border: 1px solid var(--tempo-capsule-border);
          border-radius: 7px;
          box-shadow: var(--tempo-capsule-shadow);
          background: transparent;
        }
        @media (max-width: 340px) {
          .memory, .settings-button { width: 26px; height: 26px; }
        }

        .memory:hover,
        .settings-button:hover {
          background: color-mix(in srgb, var(--tempo-fg) 8%, transparent);
        }

        .memory svg,
        .settings-button svg {
          width: 15px;
          height: 15px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.85;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .memory[aria-pressed='true'] {
          color: var(--tempo-accent-ink, var(--tempo-accent));
        }

        .memory[data-state='saved'] .bookmark {
          fill: currentColor;
        }

        .memory .update-dot,
        .memory .warning,
        .memory .check {
          display: none;
        }

        .memory[data-state='modified'] .update-dot {
          display: block;
          fill: currentColor;
          stroke: none;
        }

        .memory[data-state='error'] .warning {
          display: block;
        }

        .memory[data-state='error'] .bookmark,
        .memory[data-state='error'] .update-dot {
          display: none;
        }

        .memory:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .memory[data-feedback='saved'] .check {
          display: block;
        }

        .memory[data-feedback='saved'] .bookmark,
        .memory[data-feedback='saved'] .update-dot {
          display: none;
        }

        .error {
          font-weight: 700;
        }

        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
          border: 0;
        }

        [hidden] {
          display: none !important;
        }

.pitch-bounds{display:grid;gap:12px;margin:12px 0}
.pitch-bounds label,.increment-label{display:flex;justify-content:space-between;gap:12px;align-items:center}
.increment-label{margin:12px 0}
${tempoExtrasStyle}
`;
