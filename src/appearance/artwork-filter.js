export function artworkFilter(rate, shift, preserve) {
  const pitch = shift + (preserve ? 0 : 12 * Math.log2(rate));
  return pitch ? `hue-rotate(${pitch * 15}deg)` : '';
}
