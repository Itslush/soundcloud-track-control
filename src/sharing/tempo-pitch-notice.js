export function formatPitchNotice(shift) {
  const values = Array.isArray(shift) ? shift : [shift];
  const min = Math.min(...values),
    max = Math.max(...values);
  const format = (value) => {
    const rounded = Number(value.toPrecision(4));
    return `${rounded < 0 ? '−' : rounded > 0 ? '+' : ''}${Math.abs(rounded)}`;
  };
  if (min === 0 && max === 0) return '';
  return `Pitch shifted ${format(min)}${min === max ? '' : ` to ${format(max)}`} st`;
}
