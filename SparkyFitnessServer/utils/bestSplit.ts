import { haversineMeters } from '@workspace/shared';
import type { GpsTrackPoint } from '@workspace/shared';

/** One reading of a recorded activity: seconds since the start, metres covered. */
export interface SplitSample {
  seconds: number;
  meters: number;
}

/**
 * Samples from a stored GPS track. Uses the device's own cumulative distance
 * when every point carries it (the watch's figure matches the distance saved on
 * the entry); otherwise sums the straight lines between fixes. Null when the
 * track has no usable timestamps or covers no distance.
 *
 * `maxSpeedMps` is the fastest the sport can plausibly go. On the straight-line
 * path a segment faster than that is a GPS glitch (a jump and its return would
 * otherwise both count as distance and make a split too fast), so its distance
 * is dropped. The device's own distance is trusted as recorded.
 */
export function samplesFromGpsPoints(
  points: readonly GpsTrackPoint[],
  maxSpeedMps = Infinity
): SplitSample[] | null {
  const timed: { seconds: number; point: GpsTrackPoint }[] = [];
  for (const point of points) {
    const ms = Date.parse(point.t);
    if (!Number.isFinite(ms)) continue;
    const previous = timed[timed.length - 1];
    // A repeated or backwards timestamp is a duplicate fix, not movement.
    if (previous && ms / 1000 <= previous.seconds) continue;
    timed.push({ seconds: ms / 1000, point });
  }
  const first = timed[0];
  if (!first || timed.length < 2) return null;

  const deviceDistance = timed.every(
    ({ point }, i) =>
      typeof point.dist === 'number' &&
      Number.isFinite(point.dist) &&
      (i === 0 || point.dist >= (timed[i - 1]?.point.dist ?? 0))
  );

  const samples: SplitSample[] = [];
  let cumulative = 0;
  timed.forEach(({ seconds, point }, i) => {
    if (deviceDistance) {
      cumulative = (point.dist as number) - (first.point.dist as number);
    } else if (i > 0) {
      const before = timed[i - 1];
      if (before) {
        const meters = haversineMeters(before.point, point);
        if (meters / (seconds - before.seconds) <= maxSpeedMps) {
          cumulative += meters;
        }
      }
    }
    samples.push({ seconds: seconds - first.seconds, meters: cumulative });
  });
  return cumulative > 0 ? samples : null;
}

/** Samples from an indoor run's `[active seconds, cumulative metres]` rows. */
export function samplesFromDistanceSeries(
  points: readonly (readonly [number, number])[]
): SplitSample[] | null {
  const samples: SplitSample[] = [];
  for (const [seconds, meters] of points) {
    if (!Number.isFinite(seconds) || !Number.isFinite(meters)) continue;
    const previous = samples[samples.length - 1];
    if (previous && (seconds < previous.seconds || meters < previous.meters)) {
      continue;
    }
    samples.push({ seconds, meters });
  }
  const last = samples[samples.length - 1];
  return last && samples.length >= 2 && last.meters > 0 ? samples : null;
}

/**
 * Time in the samples at which `meters` was reached. A stop leaves a run of
 * samples at one distance; `earliest` returns the moment it was first reached
 * (where a window ends) and `latest` the moment it was left (where one starts),
 * so a pause at a window edge is not charged to the window.
 */
function secondsAtMeters(
  samples: readonly SplitSample[],
  meters: number,
  edge: 'earliest' | 'latest'
): number {
  let lo = 0;
  let hi = samples.length - 1;
  // earliest: first index with meters >= target; latest: last index with
  // meters <= target.
  if (edge === 'earliest') {
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((samples[mid] as SplitSample).meters >= meters) hi = mid;
      else lo = mid + 1;
    }
    const upper = samples[lo] as SplitSample;
    const lower = samples[lo - 1];
    if (!lower || upper.meters === lower.meters) return upper.seconds;
    const fraction = (meters - lower.meters) / (upper.meters - lower.meters);
    return lower.seconds + fraction * (upper.seconds - lower.seconds);
  }
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((samples[mid] as SplitSample).meters <= meters) lo = mid;
    else hi = mid - 1;
  }
  const lower = samples[lo] as SplitSample;
  const upper = samples[lo + 1];
  if (!upper || upper.meters === lower.meters) return lower.seconds;
  const fraction = (meters - lower.meters) / (upper.meters - lower.meters);
  return lower.seconds + fraction * (upper.seconds - lower.seconds);
}

/**
 * The fastest continuous stretch of `targetMeters` inside the activity, in
 * seconds, or null when the activity never covers that far. The best window
 * starts or ends on a sample (the track is linear between them), so only those
 * windows are measured.
 */
export function bestSplitSeconds(
  samples: readonly SplitSample[],
  targetMeters: number
): number | null {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last || !(targetMeters > 0)) return null;
  if (last.meters - first.meters < targetMeters) return null;

  let best = Infinity;
  for (const sample of samples) {
    const startMeters = sample.meters - targetMeters;
    if (startMeters >= first.meters) {
      best = Math.min(
        best,
        sample.seconds - secondsAtMeters(samples, startMeters, 'latest')
      );
    }
    const endMeters = sample.meters + targetMeters;
    if (endMeters <= last.meters) {
      best = Math.min(
        best,
        secondsAtMeters(samples, endMeters, 'earliest') - sample.seconds
      );
    }
  }
  return Number.isFinite(best) && best > 0 ? best : null;
}
