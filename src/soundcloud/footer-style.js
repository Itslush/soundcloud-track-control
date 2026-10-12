export function installFooterStyle() {
  if (document.getElementById('soundcloud-tempo-footer-style')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'soundcloud-tempo-footer-style';
  style.textContent = `
    @property --tempo-artwork-start { syntax: '<percentage>'; inherits: true; initial-value: 100%; }
    @property --tempo-artwork-end { syntax: '<percentage>'; inherits: true; initial-value: 150%; }
    @property --tempo-artwork-progress { syntax: '<number>'; inherits: true; initial-value: 0; }
    .playControls:has(.soundcloud-tempo-footer) .playControls__inner {
      width: 100%;
      max-width: none;
      box-sizing: border-box;
      padding-inline: 20px;
    }
    .playControls__elements.soundcloud-tempo-footer {
      width: 100%;
      max-width: none;
      box-sizing: border-box;
    }
    .playControls__elements.soundcloud-tempo-footer > .playControls__timeline {
      flex: 1 1 240px;
      min-width: 90px;
      max-width: 480px;
      margin-left: 12px !important;
      margin-right: 8px !important;
    }

    .soundcloud-tempo-footer .playbackTimeline__progressWrapper {
      min-width: 24px;
    }

    .playControls__elements.soundcloud-tempo-footer > .playControls__soundBadge {
      flex: 1 1 320px;
      width: auto;
      min-width: 250px;
      margin-left: 12px !important;
    }

    .soundcloud-tempo-footer .playbackSoundBadge__titleContextContainer {
      flex: 1 1 0;
      width: auto;
      max-width: none;
      min-width: 0;
      margin-right: 12px !important;
    }

    .soundcloud-tempo-footer .playbackSoundBadge__avatar {
      flex-shrink: 0;
      margin-right: 8px !important;
    }

    .playbackSoundBadge__avatar.soundcloud-tempo-artwork {
      position: relative;
    }

    .soundcloud-tempo-crossfade-artwork,
    .soundcloud-tempo-crossfade-artwork > span {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background-size: cover;
      background-position: center;
    }
    .soundcloud-tempo-crossfade-artwork {
      overflow: hidden;
      z-index: 2;
      transition: --tempo-artwork-start 100ms linear, --tempo-artwork-end 100ms linear, --tempo-artwork-progress 100ms linear;
    }
    .soundcloud-tempo-incoming-artwork {
      mask-image: linear-gradient(to right, transparent var(--tempo-artwork-start), #000 var(--tempo-artwork-end));
    }
    .soundcloud-tempo-pitch-notice {
      display: block;
      font-size: 10px;
      line-height: 12px;
      font-variant-numeric: tabular-nums;
    }
    .soundcloud-tempo-pitch-notice[hidden] { display: none; }
    .soundcloud-tempo-footer .playbackSoundBadge__titleContextContainer:has(.soundcloud-tempo-pitch-notice:not([hidden])) {
      height: auto;
    }
    @media (prefers-reduced-motion: reduce) {
      .soundcloud-tempo-crossfade-artwork {
        transition: --tempo-artwork-progress 100ms linear;
      }
      .soundcloud-tempo-incoming-artwork {
        mask-image: none;
        opacity: var(--tempo-artwork-progress);
      }
    }

    .soundcloud-tempo-page-position {
      position: relative;
    }

    .soundcloud-tempo-footer .playbackSoundBadge__actions {
      flex-shrink: 0;
    }

    .playControls__elements.soundcloud-tempo-footer > .playControls__volume {
      flex-shrink: 0;
    }

    @media (max-width: 1100px) {
      .playControls__elements.soundcloud-tempo-footer > .playControls__prev,
      .playControls__elements.soundcloud-tempo-footer > .playControls__play,
      .playControls__elements.soundcloud-tempo-footer > .playControls__next {
        margin-right: 8px !important;
      }

      .soundcloud-tempo-footer .playbackSoundBadge__titleContextContainer {
        margin-right: 8px !important;
      }
    }

    @media (max-width: 1100px) {
      .playControls__elements.soundcloud-tempo-footer > .playControls__timeline {
        min-width: 54px;
      }
    }

    @media (max-width: 1100px) {
      .playControls:has(.soundcloud-tempo-footer) {
        height: auto;
      }

      .playControls:has(.soundcloud-tempo-footer) .playControls__inner {
        height: auto;
        padding-inline: 0;
      }

      .playControls__elements.soundcloud-tempo-footer {
        height: auto;
        min-height: 92px;
        flex-wrap: wrap;
        row-gap: 6px;
        padding: 6px 8px;
      }

      .playControls__elements.soundcloud-tempo-footer > .playControls__volume {
        order: 5;
      }

      .playControls__elements.soundcloud-tempo-footer > .playControls__timeline {
        order: 6;
        flex: 1 1 90px;
        margin: 0 4px !important;
      }

      .playControls__elements.soundcloud-tempo-footer > #soundcloud-tempo-control {
        order: 10;
        flex: 1 1 416px !important;
        min-width: 292px !important;
        margin: 0 4px 0 0;
      }

      .playControls__elements.soundcloud-tempo-footer > .playControls__soundBadge {
        order: 11;
        flex: 1 1 250px;
        width: auto;
        margin: 0 !important;
      }
    }
  `;
  (document.head || document.documentElement).append(style);
}
