/** Inverts Victory/Skia's horizontal affine transform into visible day minutes. */
export function measurementViewport(
  scale: number,
  translation: number,
  left: number,
  right: number,
  dayMinutes: number
) {
  const width = right - left;
  if (!Number.isFinite(scale) || scale <= 0 || width <= 0)
    return { from: 0, to: dayMinutes };
  const clamp = (value: number) => Math.max(0, Math.min(dayMinutes, value));
  return {
    from: clamp((((left - translation) / scale - left) / width) * dayMinutes),
    to: clamp((((right - translation) / scale - left) / width) * dayMinutes),
  };
}
