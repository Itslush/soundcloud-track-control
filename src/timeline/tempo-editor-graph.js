import { evaluatePoints } from './tempo-profile.js';

export const round = (n) => Math.round(n * 1000) / 1000;
export const timeLabel = (n) =>
  `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
export const preciseTime = (n) =>
  timeLabel(n) +
  (Number.isInteger(round(n))
    ? ''
    : '.' +
      String(Math.round(n * 1000) % 1000)
        .padStart(3, '0')
        .replace(/0+$/, ''));

function drawFadeStart(svg, point, previous, position, graphWidth, selected) {
  const labelX =
    position + 100 <= graphWidth - 12 ? position + 8 : position - 100;
  const labelLeft = Math.max(44, Math.min(graphWidth - 104, labelX));
  const handle = svg('g', {
    class: 'ramp',
    'data-index': selected,
    'data-kind': 'ramp',
    tabindex: 0,
    role: 'slider',
    'aria-label': 'Fade start',
    'aria-orientation': 'horizontal',
    'aria-valuemin': previous.t,
    'aria-valuemax': point.t,
    'aria-valuenow': round(point.t - point.d),
    'aria-valuetext': `${preciseTime(round(point.t - point.d))}, ${point.d} seconds fade`,
  });
  svg('title', {}, 'Drag to change fade duration', handle);
  svg(
    'rect',
    { x: position - 12, y: 12, width: 24, height: 176, fill: 'transparent' },
    null,
    handle,
  );
  svg(
    'line',
    { x1: position, x2: position, y1: 12, y2: 188, class: 'ramp-line' },
    null,
    handle,
  );
  svg(
    'rect',
    { x: labelLeft, y: 4, width: 92, height: 44, fill: 'transparent' },
    null,
    handle,
  );
  svg(
    'rect',
    {
      x: labelLeft,
      y: 14,
      width: 92,
      height: 24,
      rx: 3,
      class: 'ramp-label',
    },
    null,
    handle,
  );
  svg(
    'path',
    {
      d: `M${labelLeft + 8} 26h12m-9 -3-3 3 3 3m6 -6 3 3-3 3`,
      class: 'ramp-arrow',
    },
    null,
    handle,
  );
  svg('text', { x: labelLeft + 26, y: 30 }, 'Fade start', handle);
}

export function renderTempoEditorGraph(
  graph,
  {
    data,
    points,
    field,
    unit,
    selected,
    imported,
    graphWidth,
    viewStart,
    span,
    speedTop,
    speedBottom,
    speedMode,
    lane,
  },
) {
  const plotWidth = graphWidth - 56;
  graph.replaceChildren();
  const svg = (name, attrs, label, parent = graph) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    if (label) node.textContent = label;
    parent.append(node);
    return node;
  };
  const x = (t) => 44 + ((t - viewStart) / span) * plotWidth,
    y = (r) => 12 + ((speedTop - r) / (speedTop - speedBottom)) * 176;
  const defs = svg('defs', {});
  const clip = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'clipPath',
  );
  clip.id = 'tempo-plot-clip';
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  for (const [k, v] of Object.entries({
    x: 44,
    y: 12,
    width: plotWidth,
    height: 176,
  }))
    rect.setAttribute(k, v);
  clip.append(rect);
  defs.append(clip);
  const step =
    speedMode === 'custom'
      ? [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 6].find(
          (value) => value >= (speedTop - speedBottom) / 8,
        )
      : speedMode === 'fine'
        ? 0.1
        : 0.05;
  const first = Math.ceil(speedBottom / step - 1e-9);
  const last = Math.floor(speedTop / step + 1e-9);
  const ticks = ['fine', 'close', 'custom'].includes(speedMode)
    ? Array.from({ length: last - first + 1 }, (_, i) =>
        round((first + i) * step),
      )
    : speedTop <= 2
      ? Array.from({ length: speedTop * 4 }, (_, i) => (i + 1) / 4)
      : [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
  if (!ticks.includes(speedBottom)) ticks.unshift(speedBottom);
  if (speedMode === 'custom' && !ticks.includes(speedTop)) ticks.push(speedTop);
  for (const r of ticks) {
    svg('line', {
      x1: 44,
      x2: graphWidth - 12,
      y1: y(r),
      y2: y(r),
      class: 'grid',
      ...(r === (lane === 'pitch' ? 0 : 1)
        ? {
            style: 'stroke:var(--tempo-fg);stroke-width:1;stroke-dasharray:3 4',
          }
        : {}),
    });
    if (
      r === speedBottom ||
      (y(speedBottom) - y(r) >= 14 &&
        (r === speedTop || y(r) - y(speedTop) >= 14))
    )
      svg('text', { x: 2, y: y(r) + 4 }, `${r}${unit}`);
  }
  for (let i = 0; i <= 8; i++) {
    const time = viewStart + (span * i) / 8;
    svg('line', { x1: x(time), x2: x(time), y1: 12, y2: 188, class: 'grid' });
    if (i % (graphWidth < 480 ? 4 : 2)) continue;
    svg(
      'text',
      {
        x: x(time),
        y: 212,
        'text-anchor': i === 8 ? 'end' : 'start',
      },
      span < 10 ? preciseTime(round(time)) : timeLabel(time),
    );
  }
  let path = `M${x(0)},${y(points[0][field])}`;
  let previous = points[0];
  for (const point of points.slice(1)) {
    const start = point.c === 'instant' ? point.t : point.t - point.d;
    path += ` L${x(start)},${y(previous[field])}`;
    for (let i = 1; i <= 24; i++) {
      const t = start + ((point.t - start) * i) / 24;
      path += ` L${x(t)},${y(evaluatePoints(points, t, field))}`;
    }
    previous = point;
  }
  path += ` L${x(data.duration)},${y(previous[field])}`;
  svg('path', {
    d: path,
    class: 'curve',
    'clip-path': 'url(#tempo-plot-clip)',
  });
  points.forEach((p, i) => {
    if (i === selected && i && p.d && p.c !== 'instant')
      svg('rect', {
        x: x(p.t - p.d),
        y: 12,
        width: x(p.t) - x(p.t - p.d),
        height: 176,
        fill: 'var(--tempo-accent)',
        opacity: 0.08,
        'clip-path': 'url(#tempo-plot-clip)',
        'pointer-events': 'none',
      });
    if (
      i === selected &&
      i &&
      !imported &&
      p.c !== 'instant' &&
      p.t - p.d >= viewStart &&
      p.t - p.d <= viewStart + span
    ) {
      drawFadeStart(svg, p, points[i - 1], x(p.t - p.d), graphWidth, selected);
    }
    if (
      p.t < viewStart ||
      p.t > viewStart + span ||
      p[field] > speedTop ||
      p[field] < speedBottom
    )
      return;
    if (!imported)
      svg('ellipse', {
        cx: x(p.t),
        cy: y(p[field]),
        rx: 12,
        ry: 12,
        fill: 'transparent',
        'data-index': i,
        'data-kind': 'point',
        'aria-hidden': 'true',
        class: 'point-hit',
        style: 'cursor:grab',
      });
    const dot = svg('circle', {
      cx: x(p.t),
      cy: y(p[field]),
      r: 7,
      class: `point ${i === selected ? 'selected' : ''}`,
      'data-index': i,
      'data-kind': 'point',
      tabindex: imported ? -1 : 0,
      role: 'button',
      'aria-label': `Point ${i + 1}: ${p.t} seconds, ${p[field]}${unit}. Enter to edit.`,
    });
    const title = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'title',
    );
    title.textContent = `${preciseTime(p.t)} · ${p[field]}${unit}`;
    dot.append(title);
  });
  svg('line', {
    class: 'playhead',
    x1: 44,
    x2: 44,
    y1: 12,
    y2: 188,
    stroke: 'var(--tempo-fg)',
    'stroke-dasharray': '3 3',
    'pointer-events': 'none',
  });
}
