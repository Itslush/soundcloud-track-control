export function artworkTransition(value) {
  const position = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const progress = position * position * (3 - 2 * position);
  return { progress, start: 1 - 1.5 * progress, end: 1.5 - 1.5 * progress };
}
