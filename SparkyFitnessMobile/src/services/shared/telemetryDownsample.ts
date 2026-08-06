import type { WorkoutGpsPoint, WorkoutHrSample } from '../../types/healthRecords';

/**
 * Payload reduction for workout telemetry, shared by the HealthKit and Health
 * Connect providers.
 *
 * A two-hour ride sampled at 1 Hz produces ~7200 trackpoints and as many heart
 * rate readings. Uploaded raw, a handful of workouts in one sync exceeds the
 * reverse proxy's 10 MB body limit and the request fails outright. These caps
 * keep a long session near 250 KB while preserving the shape of the route and
 * the curves — well under the limit even when a backfill batches several
 * sessions together.
 */

/** Trackpoints kept per workout after simplification. */
export const MAX_GPS_POINTS = 2000;

/** Samples kept per scalar series after bucketing. */
export const MAX_SERIES_POINTS = 1200;

/** Douglas-Peucker tolerance. Roughly the accuracy of a consumer GPS fix. */
const SIMPLIFY_EPSILON_METERS = 3;

/** Window for attaching a scalar reading to a trackpoint. */
const MERGE_TOLERANCE_MS = 5000;

const METERS_PER_DEGREE_LAT = 111320;

/** One timestamped scalar reading. */
export interface SeriesPoint {
  t: string;
  v: number;
}

/**
 * Perpendicular distance from `point` to the segment `start`-`end`, in metres.
 *
 * Latitude and longitude are projected to a local flat plane first: degrees are
 * not equal distances (a degree of longitude shrinks toward the poles), so
 * simplifying on raw coordinates would apply a much tighter tolerance at high
 * latitudes than at the equator.
 */
function perpendicularDistance(
  point: WorkoutGpsPoint,
  start: WorkoutGpsPoint,
  end: WorkoutGpsPoint
): number {
  const lonScale = Math.cos((start.lat * Math.PI) / 180) * METERS_PER_DEGREE_LAT;
  const toXY = (p: WorkoutGpsPoint): [number, number] => [
    p.lon * lonScale,
    p.lat * METERS_PER_DEGREE_LAT,
  ];

  const [px, py] = toXY(point);
  const [sx, sy] = toXY(start);
  const [ex, ey] = toXY(end);

  const dx = ex - sx;
  const dy = ey - sy;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(px - sx, py - sy);
  }

  const t = Math.max(
    0,
    Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared)
  );
  return Math.hypot(px - (sx + t * dx), py - (sy + t * dy));
}

/**
 * Douglas-Peucker line simplification.
 *
 * Iterative rather than recursive: a long ride can recurse thousands of levels
 * deep on a straight-ish track and blow the JS stack on device.
 */
function simplify(
  points: WorkoutGpsPoint[],
  epsilon: number
): WorkoutGpsPoint[] {
  if (points.length < 3) return points;

  const keep: boolean[] = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    if (last <= first + 1) continue;

    let maxDistance = 0;
    let index = first;
    for (let i = first + 1; i < last; i += 1) {
      const distance = perpendicularDistance(points[i], points[first], points[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }

    if (maxDistance > epsilon) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/** Keeps `max` items spread evenly across the array, always keeping the ends. */
function stride<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i += 1) {
    out.push(items[Math.round(i * step)]);
  }
  return out;
}

/**
 * Simplifies a GPS track, then hard-caps its length.
 *
 * Simplification alone is unbounded — a winding trail can stay above the cap at
 * any sane tolerance — so the stride pass guarantees the ceiling.
 */
export function downsampleGpsPoints(
  points: readonly WorkoutGpsPoint[],
  max = MAX_GPS_POINTS
): WorkoutGpsPoint[] {
  if (points.length === 0) return [];
  const ordered = [...points].sort((a, b) => a.t.localeCompare(b.t));
  if (ordered.length <= max) return ordered;
  return stride(simplify(ordered, SIMPLIFY_EPSILON_METERS), max);
}

/**
 * Averages a scalar series into fixed time buckets so it never exceeds `max`
 * points. Averaging rather than sampling keeps the curve's shape; picking every
 * Nth reading would alias spikes in or out depending on where they landed.
 */
export function downsampleSeries(
  points: readonly SeriesPoint[],
  max = MAX_SERIES_POINTS
): SeriesPoint[] {
  if (points.length === 0) return [];
  const ordered = [...points]
    .filter((p) => Number.isFinite(p.v) && Number.isFinite(Date.parse(p.t)))
    .sort((a, b) => a.t.localeCompare(b.t));
  if (ordered.length <= max) return ordered;

  const startMs = Date.parse(ordered[0].t);
  const endMs = Date.parse(ordered[ordered.length - 1].t);
  const durationSeconds = Math.max(1, (endMs - startMs) / 1000);
  const bucketMs = Math.max(1000, Math.ceil(durationSeconds / max) * 1000);

  const out: SeriesPoint[] = [];
  let bucketIndex = -1;
  let sum = 0;
  let count = 0;
  let firstT = ordered[0].t;

  const flush = () => {
    if (count > 0) out.push({ t: firstT, v: sum / count });
  };

  for (const point of ordered) {
    // A reading landing exactly on the final bucket boundary sits at index
    // `max`, one past the ceiling; clamping folds it into the last bucket.
    const index = Math.min(
      max - 1,
      Math.floor((Date.parse(point.t) - startMs) / bucketMs)
    );
    if (index !== bucketIndex) {
      flush();
      bucketIndex = index;
      sum = 0;
      count = 0;
      firstT = point.t;
    }
    sum += point.v;
    count += 1;
  }
  flush();

  return out;
}

/** Reduces a heart-rate series and rounds to whole bpm. */
export function downsampleHrSamples(
  samples: readonly WorkoutHrSample[],
  max = MAX_SERIES_POINTS
): WorkoutHrSample[] {
  return downsampleSeries(
    samples.map((s) => ({ t: s.t, v: s.bpm })),
    max
  ).map((s) => ({ t: s.t, bpm: Math.round(s.v) }));
}

/**
 * Attaches scalar series onto the nearest trackpoint within MERGE_TOLERANCE_MS.
 *
 * Merging inline means the map and most charts read a single array rather than
 * correlating several by timestamp on render. Series are still sent separately
 * where the server needs them (heart rate), because an indoor workout has the
 * series but no track to hang it on.
 */
export function mergeSeriesIntoGpsPoints(
  points: readonly WorkoutGpsPoint[],
  series: Partial<Record<'hr' | 'speed' | 'cad' | 'power', SeriesPoint[]>>
): WorkoutGpsPoint[] {
  if (points.length === 0) return [];

  const pointTimes = points.map((p) => Date.parse(p.t));
  const merged: WorkoutGpsPoint[] = points.map((p) => ({ ...p }));

  for (const [key, samples] of Object.entries(series)) {
    if (!samples || samples.length === 0) continue;
    const field = key as 'hr' | 'speed' | 'cad' | 'power';

    // Both sides are time-ordered, so advance a single cursor instead of
    // searching the whole track for every sample.
    let cursor = 0;
    for (const sample of samples) {
      const sampleMs = Date.parse(sample.t);
      if (!Number.isFinite(sampleMs)) continue;

      while (
        cursor < pointTimes.length - 1 &&
        Math.abs(pointTimes[cursor + 1] - sampleMs) <=
          Math.abs(pointTimes[cursor] - sampleMs)
      ) {
        cursor += 1;
      }

      if (Math.abs(pointTimes[cursor] - sampleMs) <= MERGE_TOLERANCE_MS) {
        const target = merged[cursor];
        // Keep the first reading that lands on a point: with a coarser track
        // than series, several samples map to the same point and the last
        // writer would otherwise win arbitrarily.
        if (target[field] === undefined || target[field] === null) {
          target[field] = field === 'hr' ? Math.round(sample.v) : sample.v;
        }
      }
    }
  }

  return merged;
}

/** Mean of a series, or null when it is empty. */
export function seriesMean(points: readonly SeriesPoint[]): number | null {
  if (points.length === 0) return null;
  return points.reduce((sum, p) => sum + p.v, 0) / points.length;
}

/** Maximum of a series, or null when it is empty. */
export function seriesMax(points: readonly SeriesPoint[]): number | null {
  if (points.length === 0) return null;
  return points.reduce((max, p) => (p.v > max ? p.v : max), -Infinity);
}
