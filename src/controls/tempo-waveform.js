import { createWaveformLoader } from '../soundcloud/track-waveform.js';

export function envelopeColumns(samples, duration, start, span, columns) {
  const values = new Float32Array(
    Math.min(1024, Math.max(1, Math.floor(columns))),
  );
  if (!(duration > 0) || !(span > 0)) return values;
  for (let column = 0; column < values.length; column++) {
    const from = start + (span * column) / values.length;
    const to = start + (span * (column + 1)) / values.length;
    if (to <= 0 || from >= duration) continue;
    const first = Math.max(0, Math.floor((from / duration) * samples.length));
    const last = Math.min(
      samples.length,
      Math.max(first + 1, Math.ceil((to / duration) * samples.length)),
    );
    for (let i = first; i < last; i++)
      values[column] = Math.max(values[column], samples[i]);
  }
  return values;
}

export function waveformTime(value) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export const waveformStyle = `
.tempo-waveform { min-width:0; color:var(--tempo-fg); background:var(--tempo-surface); }
.tempo-waveform canvas { display:block; width:100%; height:160px; touch-action:pan-y; cursor:pointer; }
.tempo-waveform canvas:focus-visible, .tempo-waveform input:focus-visible, .tempo-waveform button:focus-visible { outline:2px solid var(--tempo-accent); outline-offset:2px; }
.tempo-waveform p { margin:.4rem 0; font:inherit; font-size:.85em; }
.tempo-waveform form { display:flex; flex-wrap:wrap; align-items:center; gap:.5rem; }
.tempo-waveform form[hidden] { display:none; }
.tempo-waveform label { display:flex; align-items:center; flex-wrap:wrap; gap:.5rem; }
.tempo-waveform input { width:6rem; min-height:44px; box-sizing:border-box; border:1px solid var(--tempo-fg); border-radius:4px; background:var(--tempo-surface); color:var(--tempo-fg); padding:.5rem; font:inherit; }
.tempo-waveform input::placeholder { color:var(--tempo-fg); opacity:1; }
.tempo-waveform button { min-height:44px; padding:.5rem .8rem; border:1px solid var(--tempo-fg); border-radius:4px; color:var(--tempo-fg); background:var(--tempo-surface); font:inherit; }
.tempo-waveform button:disabled { opacity:.5; cursor:default; }
@media (min-width:600px) { .tempo-waveform canvas { height:180px; } }
@media (forced-colors:active) { .tempo-waveform { --tempo-fg:CanvasText; --tempo-surface:Canvas; --tempo-accent:Highlight; --tempo-border:CanvasText; } }
`;

export function createTrackWaveform({ container, seek, loadWaveform }) {
  const document = container.ownerDocument,
    window = document.defaultView;
  const loader = loadWaveform ? null : createWaveformLoader({ document });
  const load =
    loadWaveform || ((track, options) => loader.load(track, options));
  const element = document.createElement('section');
  element.className = 'tempo-waveform';
  element.setAttribute('aria-label', 'Track waveform');
  const style = document.createElement('style');
  style.textContent = waveformStyle;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'slider');
  canvas.setAttribute(
    'aria-label',
    'Playback position. Arrow keys seek five seconds.',
  );
  canvas.setAttribute('aria-valuemin', '0');
  canvas.tabIndex = seek ? 0 : -1;
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Choose a track to see its waveform.';
  const form = document.createElement('form'),
    label = document.createElement('label');
  form.noValidate = true;
  label.textContent = 'Seek to';
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.placeholder = '0:00';
  input.setAttribute(
    'aria-label',
    'Playback time in minutes and seconds or seconds',
  );
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Seek';
  label.append(input);
  form.append(label, button);
  form.hidden = !seek;
  element.append(style, canvas, status, form);
  container.append(element);
  const context = canvas.getContext('2d');
  const events = new AbortController();
  let state = { paused: true, position: 0, duration: 0 },
    lanes = [],
    disposed = false;
  let timer,
    frame,
    lastDraw = -Infinity,
    visible = true,
    signature = '';
  const on = (target, type, listener) =>
    target.addEventListener(type, listener, { signal: events.signal });
  function cancelDraw() {
    window.clearTimeout(timer);
    window.cancelAnimationFrame(frame);
    timer = frame = undefined;
  }
  function schedule() {
    if (
      disposed ||
      document.hidden ||
      !visible ||
      !element.isConnected ||
      element.hidden ||
      timer !== undefined ||
      frame !== undefined
    )
      return;
    timer = window.setTimeout(
      () => {
        timer = undefined;
        frame = window.requestAnimationFrame(() => {
          frame = undefined;
          draw();
        });
      },
      Math.max(0, 50 - (window.performance.now() - lastDraw)),
    );
  }
  function bars(data, y, height, start, span, color, width) {
    if (!data) return;
    const columns = envelopeColumns(
      data.samples,
      data.duration,
      start,
      span,
      Math.ceil(width / 2),
    );
    context.fillStyle = color;
    const step = width / columns.length;
    for (let i = 0; i < columns.length; i++) {
      const amplitude = columns[i] * (height - 6);
      if (amplitude)
        context.fillRect(
          i * step,
          y + (height - amplitude) / 2,
          Math.max(1, step - 1),
          amplitude,
        );
    }
  }
  function draw() {
    if (
      disposed ||
      document.hidden ||
      !visible ||
      !element.isConnected ||
      element.hidden ||
      !context
    )
      return;
    const width = Math.min(2048, canvas.clientWidth);
    if (width <= 0) return;
    const height = canvas.clientHeight,
      dpr = Math.min(2, window.devicePixelRatio || 1);
    if (
      canvas.width !== Math.round(width * dpr) ||
      canvas.height !== Math.round(height * dpr)
    ) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const css = window.getComputedStyle(element);
    const fg = css.getPropertyValue('--tempo-fg').trim() || css.color;
    const accent = css.getPropertyValue('--tempo-accent').trim() || fg;
    const position = Number.isFinite(state.position) ? state.position : 0;
    const duration = Number.isFinite(state.duration) ? state.duration : 0;
    const second = Boolean(state.nextTrack),
      rowHeight = second ? 44 : 72;
    bars(lanes[0]?.data, 0, 24, 0, duration, fg, width);
    bars(lanes[0]?.data, 38, rowHeight, position - 10, 20, accent, width);
    if (second)
      bars(
        lanes[1]?.data,
        90,
        44,
        (state.nextPosition || 0) - 10,
        20,
        fg,
        width,
      );
    context.fillStyle = fg;
    context.font = `12px ${css.fontFamily}`;
    context.fillText(second ? 'Current' : 'Now', 2, 35);
    if (second) context.fillText('Incoming', 2, 88);
    for (
      let tick = Math.ceil((position - 10) / 5) * 5;
      tick <= position + 10;
      tick += 5
    ) {
      if (tick < 0 || tick > duration) continue;
      const x = ((tick - position + 10) / 20) * width;
      context.fillRect(x, height - 20, 1, 4);
      context.fillText(
        waveformTime(tick),
        Math.min(width - 32, Math.max(0, x - 12)),
        height - 3,
      );
    }
    context.fillStyle = fg;
    context.fillRect(width / 2, 32, 1, height - 54);
    if (duration > 0)
      context.fillRect(
        Math.min(width - 1, Math.max(0, (position / duration) * width)),
        0,
        2,
        24,
      );
    lastDraw = window.performance.now();
  }
  function requestLane(index, track, metadata) {
    const old = lanes[index];
    if (
      old &&
      old.track === track &&
      !(
        old.status === 'unavailable' &&
        metadata?.waveform_url &&
        old.waveformUrl !== metadata.waveform_url
      )
    )
      return;
    old?.controller.abort();
    const lane = {
      track,
      controller: new AbortController(),
      data: null,
      status: 'loading',
      waveformUrl: metadata?.waveform_url,
    };
    lanes[index] = lane;
    if (!track) {
      lane.status = 'empty';
      return;
    }
    Promise.resolve()
      .then(() => load(track, { signal: lane.controller.signal, metadata }))
      .then((data) => {
        if (disposed || lane.controller.signal.aborted || lanes[index] !== lane)
          return;
        lane.data = data;
        lane.status = 'ready';
        updateStatus();
        schedule();
      })
      .catch(() => {
        if (disposed || lane.controller.signal.aborted || lanes[index] !== lane)
          return;
        lane.status = 'unavailable';
        updateStatus();
        schedule();
      });
  }
  function updateStatus() {
    const value =
      input.validationMessage ||
      (!state.track
        ? 'Choose a track to see its waveform.'
        : lanes.some((lane) => lane.track && lane.status === 'loading')
          ? 'Loading waveform…'
          : lanes.some((lane) => lane.track && lane.status === 'unavailable')
            ? 'Waveform unavailable for this track. Playback controls still work.'
            : state.nextTrack
              ? 'Current and incoming audio envelopes. Time marks are seconds, not detected beats.'
              : 'Audio envelope. Time marks are seconds, not detected beats.');
    if (status.textContent !== value) status.textContent = value;
  }
  function seekTo(value) {
    if (
      !seek ||
      !Number.isFinite(value) ||
      !(state.duration > 0) ||
      state.nextTrack
    )
      return;
    seek(Math.max(0, Math.min(state.duration, value)));
  }
  on(canvas, 'pointerup', (event) => {
    if (event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const y = ((event.clientY - rect.top) * canvas.clientHeight) / rect.height;
    if (y > 30)
      seekTo(
        state.position + ((event.clientX - rect.left) / rect.width - 0.5) * 20,
      );
    else seekTo(((event.clientX - rect.left) / rect.width) * state.duration);
  });
  on(canvas, 'keydown', (event) => {
    const values = {
      ArrowLeft: state.position - 5,
      ArrowRight: state.position + 5,
      Home: 0,
      End: state.duration,
    };
    if (Object.hasOwn(values, event.key)) {
      event.preventDefault();
      seekTo(values[event.key]);
    }
  });
  on(form, 'submit', (event) => {
    event.preventDefault();
    const text = input.value.trim(),
      match = text.match(/^(\d+):([0-5]\d)(?:\.(\d+))?$/);
    const value = match
      ? Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`)
      : /^\d+(?:\.\d+)?$/.test(text)
        ? Number(text)
        : NaN;
    if (!Number.isFinite(value)) {
      input.setCustomValidity('Enter seconds or a time such as 1:30.');
      input.setAttribute('aria-invalid', 'true');
      updateStatus();
      input.focus();
      return;
    }
    input.setCustomValidity('');
    input.setAttribute('aria-invalid', 'false');
    updateStatus();
    seekTo(value);
  });
  on(input, 'input', () => {
    input.setCustomValidity('');
    input.setAttribute('aria-invalid', 'false');
    updateStatus();
  });
  on(document, 'visibilitychange', () => {
    cancelDraw();
    if (!document.hidden) schedule();
  });
  const resize = new window.ResizeObserver(schedule);
  resize.observe(element);
  const intersection = new window.IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    cancelDraw();
    if (visible) schedule();
  });
  intersection.observe(element);
  return {
    element,
    update(next) {
      if (disposed) return;
      const duration = Number.isFinite(next.duration)
        ? Math.max(0, next.duration)
        : 0;
      const position = Number.isFinite(next.position)
        ? Math.max(0, Math.min(duration, next.position))
        : 0;
      next = { ...next, duration, position };
      state = next;
      requestLane(0, next.track, next.metadata);
      requestLane(1, next.nextTrack, next.nextMetadata);
      canvas.setAttribute(
        'aria-valuemax',
        String(Math.max(0, next.duration || 0)),
      );
      canvas.setAttribute(
        'aria-valuenow',
        String(Math.max(0, next.position || 0)),
      );
      canvas.setAttribute(
        'aria-valuetext',
        `${waveformTime(next.position)} of ${waveformTime(next.duration)}`,
      );
      const disabled = !seek || !(next.duration > 0) || Boolean(next.nextTrack);
      canvas.setAttribute('aria-disabled', String(disabled));
      button.disabled = input.disabled = disabled;
      updateStatus();
      const key = JSON.stringify([
        next.track,
        next.position,
        next.duration,
        next.paused,
        next.nextTrack,
        next.nextPosition,
        next.nextDuration,
        next.progress,
      ]);
      if (key !== signature) {
        signature = key;
        schedule();
      }
    },
    refresh: schedule,
    dispose() {
      disposed = true;
      cancelDraw();
      events.abort();
      resize.disconnect();
      intersection.disconnect();
      lanes.forEach((lane) => lane.controller.abort());
      loader?.dispose();
      element.remove();
    },
  };
}
