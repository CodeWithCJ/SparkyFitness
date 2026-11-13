/**
 * Change in resting heart rate across a window: the average of the later half
 * of the readings minus the average of the earlier half, rounded to whole bpm.
 * Negative means the resting rate is falling (improving). Needs at least four
 * readings; returns null otherwise. `bpms` must be in date order.
 */
export function restingHeartRateTrendDelta(
  bpms: readonly number[]
): number | null {
  if (bpms.length < 4) return null;
  const half = Math.floor(bpms.length / 2);
  const mean = (values: readonly number[]) =>
    values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.round(mean(bpms.slice(-half)) - mean(bpms.slice(0, half)));
}
