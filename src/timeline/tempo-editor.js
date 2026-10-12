import { createTempoEditorPlayback } from './tempo-editor-playback.js';
import {
  renderTempoEditorGraph,
  round,
  timeLabel,
  preciseTime,
} from './tempo-editor-graph.js';
import {
  readPitchSettings,
  pitchSettingsKey,
} from '../controls/tempo-pitch-settings.js';
import { readTempoIncrement } from '../controls/tempo-increment.js';
import { tempoShareLink } from '../sharing/tempo-share.js';
import { enhanceTempoFields } from '../controls/tempo-fields.js';
import { editorTemplate } from './tempo-editor-template.js';
import { syncTempoRange } from '../controls/tempo-range.js';
import { evaluatePoints, profilePitchAt, validKeyShift } from './tempo-profile.js';

export function createTempoEditor(api) {
  const playback = createTempoEditorPlayback(api, {
    syncControls,
    updatePlayhead,
    openPendingLink,
    isAnimating: () =>
      !document.hidden && panel && !panel.hidden && draft && !imported,
  });
  const {
    website,
    storageKey,
    validate,
    encodeProfile,
    decodeProfile,
    playbackDuration,
    running,
    wake,
  } = playback;
  let panel = null;
  let syncFields = () => {};
  let draft = null;
  let selected = 0;
  let imported = null;
  let dirty = false;
  let dragging = null;
  let dragOffset = 0;
  let zoom = 1;
  let viewStart = 0;
  let lane = 'tempo';
  let speedTop = 1.5;
  let speedBottom = 0.75;
  let speedMode = 'custom';
  const laneViews = {
    tempo: [0.75, 1.5],
    pitch: [readPitchSettings().min, readPitchSettings().max],
  };
  const laneField = () => (lane === 'pitch' ? 'k' : 'r');
  const laneUnit = () => (lane === 'pitch' ? ' st' : '×');
  const lanePoints = (data = draft) =>
    lane === 'pitch'
      ? (data.pitchPoints ?? [
          { t: 0, k: data.keyShift ?? 0, d: 0, c: 'instant' },
        ])
      : data.points;
  const laneStep = () =>
    lane === 'pitch'
      ? Number(el('.pitch-step').value) || 0.5
      : readTempoIncrement();
  let graphWidth = 660;

  function draftData() {
    return validate({
      ...draft,
      pitch: draft.pitch ?? api.defaultPitchMode,
      keyShift: draft.keyShift ?? api.keyShift ?? 0,
    });
  }

  function syncControls() {
    if (!panel || panel.hidden || !draft) return;
    const current = draft.track === playback.track;
    const playing = current && running();
    let saved = null;
    try {
      saved = JSON.parse(
        localStorage.getItem(storageKey(draft.track)) || 'null',
      );
      if (saved) validate(saved.data);
    } catch {
      saved = null;
    }
    el('.editor-enable').hidden =
      !saved || (current && playback.profile?.temporary);
    el('.editor-enabled').checked = Boolean(
      saved?.enabled && !(current && playback.suspended),
    );
    el('.editor-apply-once').textContent = playing
      ? 'Stop timeline'
      : 'Apply once';
    el('.editor-apply-once').setAttribute('aria-pressed', String(playing));
    el('.editor-apply-once').disabled = !current;
    el('.editor-revert').hidden = !dirty;
    el('.editor-import').hidden = !imported;
    el('.editor-import').disabled = !imported;
    el('.editor-preview').disabled = !el('.editor-code').value.trim();
    el('.playback-state').textContent = !current
      ? 'Another track is playing'
      : playing
        ? `${playback.profile.temporary ? 'Session' : 'Saved'} timeline · ${api.pitchMode === 'preserve' ? 'Preserve key' : 'Natural'}`
        : playback.suspended && playback.profile?.enabled
          ? 'Timeline stopped'
          : 'Timeline off';
  }

  async function copyDraft(kind, button) {
    button.disabled = true;
    try {
      if (api.canShare === false)
        throw new Error('Sharing needs a full SoundCloud track.');
      const data = draftData();
      const code = encodeProfile(data);
      const text = kind === 'link' ? tempoShareLink(data, website) : code;
      if (kind === 'link' && text.length > 8000) {
        el('.editor-sharing').open = true;
        throw new Error(
          'Too large for a link. Use Copy code in Advanced sharing.',
        );
      }
      try {
        await navigator.clipboard.writeText(text);
        status(kind === 'link' ? 'Link copied.' : 'Code copied.');
      } catch {
        el('.editor-sharing').open = true;
        el('.editor-output').hidden = false;
        el('.share-output').value = text;
        el('.share-output').focus();
        el('.share-output').select();
        status('Copy unavailable. Press Ctrl+C to copy the selected text.');
      }
    } catch (error) {
      status(error.message);
    } finally {
      button.disabled = false;
    }
  }

  function setSpeedRange(mode, center) {
    speedMode = mode;
    if (mode === 'custom') return;
    if (mode === 'fine' || mode === 'close') {
      const data = imported || draft;
      const width = mode === 'fine' ? 0.5 : 0.2;
      const step = mode === 'fine' ? 0.1 : 0.05;
      const rate =
        center ??
        lanePoints(data)[Math.min(selected, lanePoints(data).length - 1)][
          laneField()
        ];
      const bottom = Math.max(0.25, Math.min(4 - width, rate - width / 2));
      speedBottom = round(
        Math.max(0.25, Math.floor(bottom / step + 1e-9) * step),
      );
      speedTop = round(
        Math.min(4, Math.ceil((bottom + width) / step - 1e-9) * step),
      );
    } else {
      speedBottom = 0.25;
      speedTop = Number(mode);
    }
  }

  function revealSpeed(rate) {
    if (speedMode === 'custom' || (rate >= speedBottom && rate <= speedTop))
      return;
    setSpeedRange(
      ['fine', 'close'].includes(speedMode) ? speedMode : rate > 2 ? '4' : '2',
      rate,
    );
  }

  function zoomView(factor) {
    const data = imported || draft;
    const center = viewStart + data.duration / zoom / 2;
    zoom = Math.max(1, Math.min(data.duration, zoom * factor));
    viewStart = Math.max(
      0,
      Math.min(
        data.duration - data.duration / zoom,
        center - data.duration / zoom / 2,
      ),
    );
    draw(data);
  }
  function hasTempoLink() {
    return (
      location.hash.startsWith('#sct=') ||
      (typeof location.search === 'string' &&
        new URLSearchParams(location.search).has('sct'))
    );
  }
  let pendingLink = hasTempoLink() ? location.href : null;
  window.addEventListener('hashchange', () => {
    if (hasTempoLink()) pendingLink = location.href;
    wake();
  });

  const evaluate = (data, time) => evaluatePoints(data.points, time);

  function changeTrack(next) {
    if (playback.track === next) return;
    playback.changeTrack(next);
    syncControls();
    if (panel && !panel.hidden)
      status(
        draft?.track === playback.track
          ? ''
          : 'Playing track changed. This draft still belongs to the track shown above.',
      );
  }

  function status(message) {
    panel.querySelector('.editor-status').textContent = message;
  }
  function el(selector) {
    return panel.querySelector(selector);
  }
  function close() {
    if (!panel) return;
    panel.hidden = true;
    panel.hidePopover?.();
    wake();
    api.root.querySelector('.settings-button').focus();
  }
  function fit() {
    if (!panel || panel.hidden || api.inline) return;
    panel.style.width = `${Math.min(720, innerWidth - 24)}px`;
    panel.style.left = `${Math.max(12, (innerWidth - Math.min(720, innerWidth - 24)) / 2)}px`;
    panel.style.top = '50%';
    panel.style.bottom = 'auto';
    panel.style.transform = 'translateY(-50%)';
  }

  function create() {
    panel = document.createElement('section');
    panel.className = 'tempo-editor';
    panel.setAttribute('role', api.inline ? 'region' : 'dialog');
    panel.setAttribute('aria-label', 'Tempo timeline editor');
    if (!api.inline) panel.setAttribute('popover', 'manual');
    else panel.classList.add('tempo-editor-inline');
    panel.hidden = true;
    panel.innerHTML = editorTemplate(Boolean(api.inline));
    api.root.append(panel);
    for (const button of panel.querySelectorAll('[data-lane]'))
      button.onclick = () => {
        laneViews[lane] = [speedBottom, speedTop];
        lane = button.dataset.lane;
        if (lane === 'pitch' && !draft.pitchPoints)
          draft.pitchPoints = lanePoints().map((point) => ({ ...point }));
        [speedBottom, speedTop] = laneViews[lane];
        speedMode = 'custom';
        selected = 0;
        refresh();
      };
    el('.pitch-step').value = String(readPitchSettings().step);
    el('.pitch-step').onchange = () => {
      const step = Number(el('.pitch-step').value);
      if (!Number.isFinite(step) || step < 0.001 || step > 12) {
        el('.pitch-step').value = '0.5';
        status('Choose a step between 0.001 and 12 semitones.');
      }
      try {
        localStorage.setItem(
          pitchSettingsKey,
          JSON.stringify({
            ...readPitchSettings(),
            step: Number(el('.pitch-step').value),
          }),
        );
        api.pitchControlsChanged?.();
      } catch {
        status('Pitch step could not be saved.');
      }
      refresh();
    };
    el('.pitch-clear').onclick = () => {
      delete draft.pitchPoints;
      lane = 'tempo';
      [speedBottom, speedTop] = laneViews.tempo;
      selected = 0;
      changed();
    };
    el('.zoom-in').onclick = () => zoomView(2);
    el('.zoom-out').onclick = () => zoomView(0.5);
    el('.zoom-focus').onclick = () => {
      const data = imported || draft;
      const point =
        lanePoints(data)[Math.min(selected, lanePoints(data).length - 1)];
      const fade = point.c === 'instant' ? 0 : point.d;
      const span = Math.min(data.duration, Math.max(1, fade * 1.5));
      zoom = data.duration / span;
      viewStart = Math.max(
        0,
        Math.min(data.duration - span, point.t - fade / 2 - span / 2),
      );
      draw(data);
    };
    el('.zoom-fit').onclick = () => {
      zoom = 1;
      viewStart = 0;
      const values = lanePoints(imported || draft).map((p) => p[laneField()]);
      speedBottom = Math.min(lane === 'pitch' ? -6 : 0.75, ...values);
      speedTop = Math.max(lane === 'pitch' ? 6 : 1.5, ...values);
      speedMode = 'custom';
      draw(imported || draft);
    };
    el('.speed-range').onchange = () => {
      setSpeedRange(el('.speed-range').value);
      draw(imported || draft);
    };
    for (const name of ['min', 'max'])
      el('.speed-' + name).onchange = () => {
        const min = el('.speed-min').valueAsNumber;
        const max = el('.speed-max').valueAsNumber;
        const valid =
          Number.isFinite(min) &&
          Number.isFinite(max) &&
          min >= (lane === 'pitch' ? -12 : 0.25) &&
          max <= (lane === 'pitch' ? 12 : 4) &&
          min < max;
        for (const bound of ['min', 'max'])
          el('.speed-' + bound).setAttribute('aria-invalid', String(!valid));
        if (!valid) {
          status(
            (lane === 'pitch'
              ? 'Use −12 to +12 semitones'
              : 'Use 0.25× to 4×') + ', with the minimum below the maximum.',
          );
          return;
        }
        speedBottom = min;
        speedTop = max;
        speedMode = 'custom';
        laneViews[lane] = [min, max];
        status('');
        draw(imported || draft);
      };
    el('.editor-pan').oninput = () => {
      viewStart = Number(el('.editor-pan').value);
      draw(imported || draft);
    };
    el('.editor-point-picker').onchange = () => {
      selected = Number(el('.editor-point-picker').value);
      const p = lanePoints()[selected];
      const span = draft.duration / zoom;
      if (p.t < viewStart || p.t > viewStart + span)
        viewStart = Math.max(
          0,
          Math.min(draft.duration - span, p.t - span / 2),
        );
      revealSpeed(p[laneField()]);
      refresh();
    };
    el('.editor-close').onclick = close;
    el('.editor-close').hidden = Boolean(api.inline);
    panel.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' && !api.inline) {
        e.preventDefault();
        close();
      }
    });
    el('.editor-enabled').onchange = () => {
      const enabled = el('.editor-enabled').checked;
      try {
        const stored = JSON.parse(
          localStorage.getItem(storageKey(draft.track)) || 'null',
        );
        if (!stored) throw new Error('Save this timeline first.');
        stored.data = validate(stored.data);
        localStorage.setItem(
          storageKey(draft.track),
          JSON.stringify({ data: stored.data, enabled }),
        );
        if (draft.track === playback.track) {
          playback.activateSaved();
          if (!enabled) api.normal();
          api.refresh();
        }
        status(
          enabled
            ? 'Saved timeline enabled.'
            : 'Timeline disabled. Current track returns to 1×.',
        );
        syncControls();
      } catch (e) {
        el('.editor-enabled').checked = !enabled;
        status(e.message);
      }
    };
    for (const name of ['time', 'rate', 'duration', 'curve'])
      el('.point-' + name).onchange = updatePoint;
    el('.point-add').onclick = () =>
      addPoint(
        draft.track === playback.track && playback.media
          ? playback.media.currentTime
          : draft.duration / 2,
        lane === 'pitch' ? (draft.keyShift ?? 0) : 1,
      );
    el('.point-remove').onclick = () => {
      if (!selected) return;
      lanePoints().splice(selected, 1);
      selected = Math.max(0, selected - 1);
      normalize();
      changed();
    };
    el('.editor-revert').onclick = () => {
      const track = draft.track;
      dirty = false;
      draft = null;
      open(track);
    };
    el('.editor-save').onclick = () => {
      try {
        const data = draftData();
        localStorage.setItem(
          storageKey(data.track),
          JSON.stringify({ data, enabled: true }),
        );
        if (data.track === playback.track) {
          playback.activateSaved();
          api.refresh();
        }
        draft = data;
        dirty = false;
        syncControls();
        status('Timeline saved.');
      } catch (e) {
        status(`Not saved: ${e.message}`);
      }
    };
    el('.editor-apply-once').onclick = () => {
      if (draft.track !== playback.track) return;
      if (running()) {
        playback.stop();
        status('Timeline stopped · 1×');
        return;
      }
      try {
        playback.applyOnce(draftData());
        status('Applied for this session.');
      } catch (error) {
        status(error.message);
      }
    };
    el('.editor-link').onclick = (event) =>
      copyDraft('link', event.currentTarget);
    el('.editor-copy').onclick = (event) =>
      copyDraft('code', event.currentTarget);
    el('.editor-pitch').onchange = () => {
      draft.pitch = el('.editor-pitch').value;
      changed();
    };
    el('.editor-key-shift').onchange = () => {
      const value = Number(el('.editor-key-shift').value);
      if (validKeyShift(value)) {
        draft.keyShift = value;
        changed();
      } else refresh();
    };
    el('.editor-code').oninput = () => {
      imported = null;
      el('.editor-import').disabled = true;
      el('.import-summary').textContent = '';
      syncControls();
      draw();
    };
    el('.editor-preview').onclick = () => {
      imported = null;
      syncControls();
      try {
        imported = decodeProfile(el('.editor-code').value);
        el('.import-summary').textContent =
          `${imported.track} · ${timeLabel(imported.duration)} · ${imported.points.length} points · ${(imported.pitch ?? api.defaultPitchMode) === 'preserve' ? 'Preserve key' : 'Natural'}`;
        draw(imported);
        syncControls();
        status('Preview only · playback unchanged.');
      } catch (e) {
        syncControls();
        draw();
        status(`Cannot import: ${e.message}`);
      }
    };
    el('.editor-import').onclick = () => {
      if (!imported) return;
      draft = structuredClone(imported);
      lane = 'tempo';
      [speedBottom, speedTop] = laneViews.tempo;
      imported = null;
      selected = 0;
      dirty = true;
      el('.editor-import').disabled = true;
      el('.import-summary').textContent = '';
      refresh();
      status('Draft loaded.');
    };
    syncFields = enhanceTempoFields(panel);
    const graph = el('.editor-graph');
    const coords = (event) => {
      const bounds = graph.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * graphWidth;
      const y = ((event.clientY - bounds.top) / bounds.height) * 220;
      const time =
        viewStart + (((x - 44) / (graphWidth - 56)) * draft.duration) / zoom;
      const rate = speedTop - ((y - 12) / 176) * (speedTop - speedBottom);
      return {
        t: Math.max(0, Math.min(draft.duration, time)),
        [laneField()]: Math.max(speedBottom, Math.min(speedTop, rate)),
      };
    };
    graph.addEventListener('dblclick', (e) => {
      if (!e.target.closest('[data-index]') && !imported) {
        const p = coords(e);
        addPoint(p.t, p[laneField()]);
      }
    });
    graph.addEventListener('pointerdown', (e) => {
      const target = e.target.closest('[data-index]');
      if (imported || e.button !== 0 || !target) return;
      selected = Number(target.dataset.index);
      dragging = target.dataset.kind;
      dragOffset =
        dragging === 'ramp'
          ? coords(e).t - (lanePoints()[selected].t - lanePoints()[selected].d)
          : 0;
      graph.setPointerCapture(e.pointerId);
      e.preventDefault();
      refresh();
    });
    graph.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const p = coords(e),
        point = lanePoints()[selected];
      const previous = lanePoints()[selected - 1];
      if (dragging === 'ramp')
        point.d = round(
          point.t - Math.max(previous.t, Math.min(point.t, p.t - dragOffset)),
        );
      else {
        if (selected)
          point.t = round(
            Math.max(
              previous.t + 0.01,
              Math.min(
                (lanePoints()[selected + 1]?.t ?? draft.duration + 0.01) - 0.01,
                p.t,
              ),
            ),
          );
        const step = e.shiftKey ? laneStep() / 5 : laneStep();
        point[laneField()] = round(
          Math.max(
            lane === 'pitch' ? -12 : 0.25,
            Math.min(
              lane === 'pitch' ? 12 : 4,
              Math.round(p[laneField()] / step) * step,
            ),
          ),
        );
      }
      normalize();
      changed();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
      graph.addEventListener(name, () => {
        dragging = null;
      });
    graph.addEventListener('keydown', (e) => {
      const target = e.target.closest('[data-index]');
      if (!target || imported) return;
      selected = Number(target.dataset.index);
      if (target.dataset.kind === 'ramp' && adjustFadeStart(e)) return;
      if (
        target.dataset.kind !== 'ramp' &&
        ['ArrowUp', 'ArrowDown'].includes(e.key)
      ) {
        e.preventDefault();
        const point = lanePoints()[selected];
        const step = laneStep() / (e.shiftKey ? 5 : 1);
        point[laneField()] = round(
          Math.max(
            lane === 'pitch' ? -12 : 0.25,
            Math.min(
              lane === 'pitch' ? 12 : 4,
              point[laneField()] + (e.key === 'ArrowUp' ? step : -step),
            ),
          ),
        );
        changed();
        el('.point.selected')?.focus({ preventScroll: true });
        return;
      }
      if (['Enter', ' '].includes(e.key)) {
        e.preventDefault();
        refresh();
        const advanced = panel.querySelector('.editor-advanced');
        if (advanced) advanced.open = true;
        el(
          target.dataset.kind === 'ramp'
            ? '.point-duration'
            : selected
              ? '.point-time'
              : '.point-rate',
        ).focus();
      }
    });
    window.addEventListener('resize', () => {
      fit();
      if (panel && !panel.hidden && draft) draw(imported || draft);
    });
  }

  function normalize() {
    lanePoints().forEach((p, i) => {
      p.d = i ? round(Math.min(p.d, p.t - lanePoints()[i - 1].t)) : 0;
    });
  }

  function adjustFadeStart(event) {
    const point = lanePoints()[selected];
    const previous = lanePoints()[selected - 1];
    const step = event.shiftKey ? 0.1 : 1;
    const start = point.t - point.d;
    const positions = {
      ArrowLeft: start - step,
      ArrowRight: start + step,
      Home: previous.t,
      End: point.t,
    };
    if (!(event.key in positions)) return false;
    event.preventDefault();
    point.d = round(
      point.t - Math.max(previous.t, Math.min(point.t, positions[event.key])),
    );
    const nextStart = point.t - point.d;
    const span = draft.duration / zoom;
    if (nextStart < viewStart || nextStart > viewStart + span)
      viewStart = Math.max(
        0,
        Math.min(draft.duration - span, nextStart - span / 2),
      );
    changed();
    el('.ramp')?.focus({ preventScroll: true });
    return true;
  }

  function changed() {
    dirty = true;
    imported = null;
    el('.editor-import').disabled = true;
    el('.editor-output').hidden = true;
    refresh();
    status('Unsaved changes');
    if (api.inline) api.refresh();
  }
  function updatePoint() {
    const p = lanePoints()[selected];
    const t = Number(el('.point-time').value),
      r = Number(el('.point-rate').value),
      d = Number(el('.point-duration').value);
    if (
      [el('.point-time'), el('.point-rate'), el('.point-duration')].some(
        (n) => n.value === '',
      ) ||
      ![t, r, d].every(Number.isFinite)
    ) {
      status('Enter valid numbers for time, speed, and duration.');
      refresh();
      return;
    }
    p.t = selected
      ? round(
          Math.max(
            lanePoints()[selected - 1].t + 0.01,
            Math.min(
              (lanePoints()[selected + 1]?.t ?? draft.duration + 0.01) - 0.01,
              t,
            ),
          ),
        )
      : 0;
    p[laneField()] = round(
      Math.max(
        lane === 'pitch' ? -12 : 0.25,
        Math.min(lane === 'pitch' ? 12 : 4, r),
      ),
    );
    revealSpeed(p[laneField()]);
    p.d = Math.max(0, d);
    p.c = el('.point-curve').value;
    normalize();
    changed();
  }
  function addPoint(time, speed) {
    if (lanePoints().length >= 200) {
      status('Maximum 200 points per timeline.');
      return;
    }
    const t = round(Math.max(0.01, Math.min(draft.duration, time)));
    if (lanePoints().some((p) => Math.abs(p.t - t) < 0.01)) {
      status('A point already exists here. Move it or choose another time.');
      return;
    }
    const previous = [...lanePoints()].reverse().find((p) => p.t < t);
    const point = {
      t,
      [laneField()]: round(
        Math.max(
          lane === 'pitch' ? -12 : 0.25,
          Math.min(
            lane === 'pitch' ? 12 : 4,
            Math.round(speed / laneStep()) * laneStep(),
          ),
        ),
      ),
      d: Math.min(4, t - previous.t),
      c: 'linear',
    };
    lanePoints().push(point);
    lanePoints().sort((a, b) => a.t - b.t);
    selected = lanePoints().indexOf(point);
    normalize();
    changed();
  }
  function draw(data = draft) {
    const graph = el('.editor-graph');
    graphWidth = Math.max(260, graph.clientWidth);
    graph.setAttribute('viewBox', `0 0 ${graphWidth} 220`);
    const plotWidth = graphWidth - 56;
    zoom = Math.max(1, Math.min(data.duration, zoom));
    const span = data.duration / zoom;
    viewStart = Math.max(0, Math.min(data.duration - span, viewStart));
    el('.zoom-label').textContent = `Time zoom ${round(zoom)}×`;
    el('.zoom-in').disabled = zoom >= data.duration;
    el('.zoom-out').disabled = zoom <= 1;
    el('.speed-range').value = speedMode;
    for (const [name, value] of [
      ['min', speedBottom],
      ['max', speedTop],
    ]) {
      el('.speed-' + name).value = String(value);
      el('.speed-' + name).setAttribute('aria-invalid', 'false');
    }
    const pan = el('.editor-pan');
    const visibleRange = `${preciseTime(round(viewStart))}–${preciseTime(round(viewStart + span))}`;
    pan.max = String(Math.max(0, data.duration - span));
    pan.value = String(viewStart);
    syncTempoRange(pan);
    pan.disabled = zoom === 1;
    pan.setAttribute(
      'aria-valuetext',
      `Viewing ${visibleRange} of ${timeLabel(data.duration)}`,
    );
    el('.timeline-navigation').hidden = zoom === 1;
    el('.view-window').textContent = visibleRange;
    el('.timeline-end').textContent = timeLabel(data.duration);
    const chosen =
      lanePoints(data)[Math.min(selected, lanePoints(data).length - 1)];
    el('.zoom-focus').hidden = !chosen.d || chosen.c === 'instant';
    el('.point-readout').textContent =
      `${chosen[laneField()]}${laneUnit()} · ${chosen.d ? chosen.d + 's fade' : 'Instant'}`;
    const picker = el('.editor-point-picker');
    picker.replaceChildren(
      ...lanePoints(data).map((point, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${index + 1} · ${preciseTime(point.t)} · ${point[laneField()]}${laneUnit()}`;
        return option;
      }),
    );
    picker.value = String(Math.min(selected, lanePoints(data).length - 1));
    picker.disabled = Boolean(imported);
    syncFields();
    renderTempoEditorGraph(graph, {
      data,
      points: lanePoints(data),
      field: laneField(),
      unit: laneUnit(),
      selected,
      imported,
      graphWidth,
      viewStart,
      span,
      speedTop,
      speedBottom,
      speedMode,
      lane,
    });
  }
  function refresh() {
    const p = lanePoints()[selected];
    for (const button of panel.querySelectorAll('[data-lane]'))
      button.setAttribute('aria-pressed', String(button.dataset.lane === lane));
    el('.pitch-options').hidden = lane !== 'pitch';
    el('.speed-range').closest('label').hidden = lane === 'pitch';
    el('.target-label').textContent =
      lane === 'pitch' ? 'Target pitch (semitones)' : 'Target speed';
    el('.editor-point-picker').setAttribute(
      'aria-label',
      'Selected ' + lane + ' point',
    );
    el('.editor-graph').setAttribute(
      'aria-label',
      lane + ' over original song time',
    );
    for (const selector of ['.point-rate', '.speed-min', '.speed-max']) {
      el(selector).min = lane === 'pitch' ? '-12' : '0.25';
      el(selector).max = lane === 'pitch' ? '12' : '4';
    }
    el('.point-rate').step = String(laneStep());
    for (const unit of panel.querySelectorAll('.axis-unit'))
      unit.textContent = laneUnit();
    el('.editor-key-shift').disabled = Boolean(draft.pitchPoints);
    el('.editor-track').textContent = draft.track;
    el('.editor-track').href = 'https://soundcloud.com' + draft.track;
    el('.point-time').value = p.t;
    el('.point-time').disabled = selected === 0;
    el('.point-rate').value = p[laneField()];
    el('.point-duration').value = p.d;
    el('.point-duration').disabled = selected === 0 || p.c === 'instant';
    el('.point-curve').value = p.c;
    el('.point-curve').disabled = selected === 0;
    el('.point-remove').disabled = selected === 0;
    el('.editor-pitch').value = draft.pitch ?? api.defaultPitchMode;
    el('.editor-key-shift').value = draft.keyShift ?? 0;
    syncControls();
    draw();
  }
  function open(requested) {
    const target = requested || (dirty && draft ? draft.track : playback.track);
    if (requested && dirty && draft?.track !== requested) {
      api.message(
        'An unsaved timeline is open. Finish or discard it before editing another track.',
      );
      return;
    }
    if (!panel) create();
    imported = null;
    el('.editor-import').disabled = true;
    el('.import-summary').textContent = '';
    if (!draft || !dirty) {
      let stored = null;
      try {
        stored = JSON.parse(localStorage.getItem(storageKey(target)) || 'null');
        if (stored) stored.data = validate(stored.data);
        if (stored?.data.track !== target) stored = null;
      } catch {
        stored = null;
      }
      const duration = playbackDuration();
      if (!target) {
        api.message('Play a track before opening its tempo editor.');
        return;
      }
      if (!stored && (target !== playback.track || duration <= 0)) {
        api.message(
          'Track duration is not available yet. Load a track and retry.',
        );
        return;
      }
      draft = stored?.data || {
        v: 1,
        track: target,
        duration,
        points: [{ t: 0, r: api.rate, d: 0, c: 'instant' }],
        pitch: api.pitchMode,
        keyShift: api.keyShift ?? 0,
      };
      if (target === playback.track && playback.keyOverride !== null) {
        draft.keyShift = playback.keyOverride;
        delete draft.pitchPoints;
      }
      lane = 'tempo';
      [speedBottom, speedTop] = laneViews.tempo;
      selected = 0;
    }
    api.closeSettings?.();
    panel.hidden = false;
    if (!api.inline) panel.showPopover?.();
    fit();
    refresh();
    status(
      dirty
        ? 'Unsaved draft restored.'
        : 'Double-click the graph to add a point.',
    );
    if (!api.inline) el('.editor-close').focus();
    wake();
  }
  function openPendingLink() {
    if (!pendingLink || !api.ready) return;
    const link = pendingLink;
    pendingLink = null;
    try {
      const data = decodeProfile(link);
      if (dirty) {
        api.message(
          'Tempo link received. Your unsaved draft was kept; paste the link in the editor to preview it.',
        );
        return;
      }
      draft = data;
      selected = 0;
      dirty = true;
      open();
      status('');
    } catch (error) {
      api.message('Cannot open tempo link: ' + error.message);
    }
  }

  function updatePlayhead() {
    if (document.hidden || !panel || panel.hidden || !draft || imported) return;
    const line = el('.playhead');
    if (!line) return;
    const visible =
      playback.media &&
      draft.track === playback.track &&
      playback.media.currentTime >= viewStart &&
      playback.media.currentTime <= viewStart + draft.duration / zoom;
    line.style.display = visible ? '' : 'none';
    if (!visible) return;
    const x =
      44 +
      ((Math.min(draft.duration, playback.media.currentTime) - viewStart) /
        (draft.duration / zoom)) *
        (graphWidth - 56);
    line.setAttribute('x1', x);
    line.setAttribute('x2', x);
  }

  return {
    wake,
    pitchMode: playback.pitchMode,
    shareLink: playback.shareLink,
    keyShift: playback.keyShift,
    setKeyShift(value) {
      playback.setKeyShift(value);
      if (draft?.track === playback.track) {
        draft.keyShift = value;
        delete draft.pitchPoints;
        selected = 0;
        dirty = true;
        if (panel && !panel.hidden) {
          refresh();
          status('Pitch changed. Save to keep it for this track.');
        }
      }
    },
    observe: playback.observe,
    value: playback.value,
    playbackSchedule: playback.playbackSchedule,
    changeTrack,
    open,
    validate,
    draftProfile: () => (draft ? draftData() : null),
    draftPlayback(time) {
      return draft
        ? {
            rate: evaluate(draft, time),
            pitch: draft.pitch ?? api.defaultPitchMode,
            keyShift: profilePitchAt(draft, time),
          }
        : null;
    },
    loadDraft(data) {
      draft = validate(data);
      selected = 0;
      lane = 'tempo';
      [speedBottom, speedTop] = laneViews.tempo;
      dirty = true;
      open();
    },
    refreshSaved: playback.refreshSaved,
    suspend: playback.suspend,
    contains(target) {
      return panel?.contains(target);
    },
  };
}
