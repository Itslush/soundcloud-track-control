import Bookmark from '../../node_modules/lucide/dist/esm/icons/bookmark.mjs';
import Check from '../../node_modules/lucide/dist/esm/icons/check.mjs';
import ChevronDown from '../../node_modules/lucide/dist/esm/icons/chevron-down.mjs';
import ChevronUp from '../../node_modules/lucide/dist/esm/icons/chevron-up.mjs';
import Minus from '../../node_modules/lucide/dist/esm/icons/minus.mjs';
import Pause from '../../node_modules/lucide/dist/esm/icons/pause.mjs';
import Pin from '../../node_modules/lucide/dist/esm/icons/pin.mjs';
import Play from '../../node_modules/lucide/dist/esm/icons/play.mjs';
import Plus from '../../node_modules/lucide/dist/esm/icons/plus.mjs';
import RotateCcw from '../../node_modules/lucide/dist/esm/icons/rotate-ccw.mjs';
import Search from '../../node_modules/lucide/dist/esm/icons/search.mjs';
import Settings from '../../node_modules/lucide/dist/esm/icons/settings.mjs';
import SkipForward from '../../node_modules/lucide/dist/esm/icons/skip-forward.mjs';
import SlidersVertical from '../../node_modules/lucide/dist/esm/icons/sliders-vertical.mjs';
import TriangleAlert from '../../node_modules/lucide/dist/esm/icons/triangle-exclamation-point.mjs';
import X from '../../node_modules/lucide/dist/esm/icons/x.mjs';

const NS = 'http://www.w3.org/2000/svg';

function renderNode([tag, attrs]) {
  const parts = Object.entries(attrs)
    .map(([key, value]) => `${key}="${String(value).replace(/"/g, '&quot;')}"`)
    .join(' ');
  return `<${tag} ${parts}/>`;
}

export function iconMarkup(
  nodes,
  { size = 16, strokeWidth = 1.75, cls = '' } = {},
) {
  const classAttr = cls ? ` class="${cls}"` : '';
  return `<svg${classAttr} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${nodes.map(renderNode).join('')}</svg>`;
}

export function createIconElement(document, nodes, options = {}) {
  const { size = 16, strokeWidth = 1.75, cls = '' } = options;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  for (const [tag, attrs] of nodes) {
    const child = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      child.setAttribute(key, String(value));
    }
    svg.append(child);
  }
  return svg;
}

export function memoryButtonSvg() {
  const wrapClass = (nodes, cls) =>
    nodes
      .map(([tag, attrs]) => renderNode([tag, { ...attrs, class: cls }]))
      .join('');
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${wrapClass(Bookmark, 'bookmark')}<circle class="update-dot" cx="19" cy="5" r="2.75"/>${wrapClass(Check, 'check')}${wrapClass(TriangleAlert, 'warning')}</svg>`;
}

export const LUCIDE = {
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Minus,
  Pause,
  Pin,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  SkipForward,
  SlidersVertical,
  TriangleAlert,
  X,
};
