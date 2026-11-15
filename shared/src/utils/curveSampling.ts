/**
 * Sample times for a modeled curve that web and mobile both draw (active
 * caffeine). One grid keeps the charts and the numbers beside them in
 * agreement.
 */

/** Epoch milliseconds for an instant given as epoch ms, an ISO string or a Date. */
export function instantToMs(instant: string | number | Date): number {
  return typeof instant === 'number' ? instant : new Date(instant).getTime();
}

/**
 * Most grid points any one curve is walked at. Extra times are added on top of
 * these, so a curve can exceed it slightly; it bounds the walk, not the output
 * exactly.
 */
const MAX_CURVE_POINTS = 2000;

/**
 * Sorted, distinct sample times from `fromMs` to `toMs` (both included) every
 * `stepMinutes`, plus any `extraTimesMs` inside the window. Empty for an
 * inverted or empty window or a non-positive step.
 *
 * Backstop against a caller handing in a range far wider than it meant to: the
 * grid is walked one step at a time, so an unbounded span turns straight into
 * unbounded work and an unrenderable series -- a year at ten-minute steps is
 * ~52k points. Callers are expected to pass a window of hours; if one passes
 * days, widen the step rather than refusing or hanging, which keeps the
 * curve's shape honest at a resolution the range can carry.
 */
export function curveSampleTimes(
  fromMs: number,
  toMs: number,
  stepMinutes: number,
  extraTimesMs: readonly number[] = []
): number[] {
  if (isNaN(fromMs) || isNaN(toMs) || toMs <= fromMs) return [];
  if (!(stepMinutes > 0)) return [];

  const requestedStepMs = stepMinutes * 60 * 1000;
  const spanMs = toMs - fromMs;
  const stepMs =
    spanMs / requestedStepMs > MAX_CURVE_POINTS
      ? Math.ceil(spanMs / MAX_CURVE_POINTS)
      : requestedStepMs;

  const points = new Set<number>();
  for (let t = fromMs; t < toMs; t += stepMs) points.add(t);
  points.add(toMs);
  for (const t of extraTimesMs) {
    if (!isNaN(t) && t >= fromMs && t <= toMs) points.add(t);
  }
  return [...points].sort((a, b) => a - b);
}
