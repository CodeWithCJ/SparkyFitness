import type { RoutePoint } from '../schemas/api/Route.api.zod.ts';

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;
/** Element at an index the caller has already checked is in range. */
const at = <T>(items: readonly T[], index: number): T => items[index] as T;

/** Great-circle distance in metres between two points. */
export function haversineMeters(a: RoutePoint, b: RoutePoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of the path through the points, in metres. */
export function routeDistanceMeters(points: readonly RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(at(points, i - 1), at(points, i));
  }
  return total;
}

/**
 * Total climb in metres. Altitude wobble is ignored: a rise only counts once it
 * exceeds `thresholdM` from the last counted height. Null if the points carry
 * no altitude.
 */
export function routeElevationGainMeters(
  points: readonly RoutePoint[],
  thresholdM = 2
): number | null {
  let reference: number | null = null;
  let gain = 0;
  for (const point of points) {
    if (point.alt === undefined) continue;
    if (reference === null) {
      reference = point.alt;
      continue;
    }
    const delta = point.alt - reference;
    if (delta >= thresholdM) {
      gain += delta;
      reference = point.alt;
    } else if (delta <= -thresholdM) {
      reference = point.alt;
    }
  }
  return reference === null ? null : gain;
}

/** Points on a flat plane in metres around the first one (fine at route scale). */
function projectToMeters(points: readonly RoutePoint[]): {
  xs: Float64Array;
  ys: Float64Array;
} {
  const origin = at(points, 0);
  const cosLat = Math.cos(toRad(origin.lat));
  const xs = new Float64Array(points.length);
  const ys = new Float64Array(points.length);
  points.forEach((p, i) => {
    xs[i] = toRad(p.lon - origin.lon) * cosLat * EARTH_RADIUS_M;
    ys[i] = toRad(p.lat - origin.lat) * EARTH_RADIUS_M;
  });
  return { xs, ys };
}

interface Span {
  start: number;
  end: number;
  farthest: number;
  distance: number;
}

/**
 * The point between `start` and `end` farthest from the straight line joining
 * them, with its distance in metres.
 */
function farthestFromChord(
  xs: Float64Array,
  ys: Float64Array,
  start: number,
  end: number
): Span {
  const ax = xs[start] as number;
  const ay = ys[start] as number;
  const bx = (xs[end] as number) - ax;
  const by = (ys[end] as number) - ay;
  const lengthSq = bx * bx + by * by;
  let farthest = -1;
  let distance = 0;
  for (let i = start + 1; i < end; i++) {
    const px = (xs[i] as number) - ax;
    const py = (ys[i] as number) - ay;
    let d: number;
    if (lengthSq === 0) {
      d = Math.hypot(px, py);
    } else {
      const t = Math.max(0, Math.min(1, (px * bx + py * by) / lengthSq));
      d = Math.hypot(px - t * bx, py - t * by);
    }
    if (d > distance) {
      distance = d;
      farthest = i;
    }
  }
  return { start, end, farthest, distance };
}

/**
 * Douglas-Peucker, best first: always splits the span whose farthest point is
 * the most significant, and stops when that is within `toleranceM` or when
 * `maxPoints` are kept. One pass, so the count is bounded without retrying with
 * a wider tolerance. Returns the kept indexes in order.
 */
function simplifyBestFirst(
  points: readonly RoutePoint[],
  maxPoints: number,
  toleranceM: number
): number[] {
  const last = points.length - 1;
  const { xs, ys } = projectToMeters(points);
  const kept = [0, last];
  // A binary max-heap of spans by distance.
  const heap: Span[] = [];
  const push = (span: Span): void => {
    if (span.farthest === -1 || span.distance <= toleranceM) return;
    heap.push(span);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((heap[parent] as Span).distance >= (heap[i] as Span).distance) break;
      [heap[parent], heap[i]] = [heap[i] as Span, heap[parent] as Span];
      i = parent;
    }
  };
  const pop = (): Span => {
    const top = heap[0] as Span;
    const tail = heap.pop() as Span;
    if (heap.length > 0) {
      heap[0] = tail;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let largest = i;
        if (
          l < heap.length &&
          (heap[l] as Span).distance > (heap[largest] as Span).distance
        )
          largest = l;
        if (
          r < heap.length &&
          (heap[r] as Span).distance > (heap[largest] as Span).distance
        )
          largest = r;
        if (largest === i) break;
        [heap[largest], heap[i]] = [heap[i] as Span, heap[largest] as Span];
        i = largest;
      }
    }
    return top;
  };
  push(farthestFromChord(xs, ys, 0, last));
  while (heap.length > 0 && kept.length < maxPoints) {
    const span = pop();
    kept.push(span.farthest);
    push(farthestFromChord(xs, ys, span.start, span.farthest));
    push(farthestFromChord(xs, ys, span.farthest, span.end));
  }
  return kept.sort((x, y) => x - y);
}

/** Keeps the first and last of `indexes` and spreads the rest evenly. */
function sampleEvenly(indexes: number[], count: number): number[] {
  if (indexes.length <= count) return indexes;
  const sampled: number[] = [];
  const last = indexes.length - 1;
  for (let i = 0; i < count; i++) {
    sampled.push(at(indexes, Math.round((i * last) / (count - 1))));
  }
  return [...new Set(sampled)];
}

/** Douglas-Peucker is quadratic in the worst case, so it never sees more than this. */
const MAX_SIMPLIFY_INPUT = 4000;

/**
 * Thins a track to at most `maxPoints`: points closer than 2 m to the last kept
 * one go first, then Douglas-Peucker (most significant points first) until the
 * rest are within the tolerance or the track fits. Returns the kept points and,
 * for each, its index in the input (so cues can be re-pointed). The first and
 * last point are always kept, so `maxPoints` is raised to 2 if lower. Bounded
 * work even for adversarial input.
 */
export function simplifyRoute(
  points: readonly RoutePoint[],
  requestedMaxPoints: number,
  toleranceM = 3
): { points: RoutePoint[]; sourceIndexes: number[] } {
  const maxPoints = Math.max(2, Math.floor(requestedMaxPoints));
  if (points.length <= 2) {
    return {
      points: [...points],
      sourceIndexes: points.map((_, i) => i),
    };
  }
  const last = points.length - 1;

  let candidates: number[] = [0];
  for (let i = 1; i < last; i++) {
    if (
      haversineMeters(
        at(points, at(candidates, candidates.length - 1)),
        at(points, i)
      ) >= 2
    ) {
      candidates.push(i);
    }
  }
  candidates.push(last);
  candidates = sampleEvenly(candidates, MAX_SIMPLIFY_INPUT);

  const subset = candidates.map((i) => at(points, i));
  const kept = simplifyBestFirst(subset, maxPoints, toleranceM);
  let sourceIndexes = kept.map((i) => at(candidates, i));
  if (sourceIndexes.length > maxPoints) {
    sourceIndexes = sampleEvenly(sourceIndexes, maxPoints);
  }
  return {
    points: sourceIndexes.map((i) => at(points, i)),
    sourceIndexes,
  };
}

export interface RouteBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export function routeBounds(points: readonly RoutePoint[]): RouteBounds | null {
  if (points.length === 0) return null;
  const first = at(points, 0);
  const bounds = {
    minLat: first.lat,
    minLon: first.lon,
    maxLat: first.lat,
    maxLon: first.lon,
  };
  for (const p of points) {
    bounds.minLat = Math.min(bounds.minLat, p.lat);
    bounds.minLon = Math.min(bounds.minLon, p.lon);
    bounds.maxLat = Math.max(bounds.maxLat, p.lat);
    bounds.maxLon = Math.max(bounds.maxLon, p.lon);
  }
  return bounds;
}

type LatLon = Pick<RoutePoint, 'lat' | 'lon'>;
type Xy = { x: number; y: number };

/**
 * An equirectangular projection around `origin`, in metres. Accurate to a
 * few centimetres over the distances a route spans, and far cheaper than
 * great-circle maths for nearest-point searches.
 */
export function localProjector(origin: LatLon): (p: LatLon) => Xy {
  const metresPerDegLat = (Math.PI * EARTH_RADIUS_M) / 180;
  const metresPerDegLon = metresPerDegLat * Math.cos(toRad(origin.lat));
  return (p) => ({
    x: (p.lon - origin.lon) * metresPerDegLon,
    y: (p.lat - origin.lat) * metresPerDegLat,
  });
}

/** Distance from `p` to the segment `a`-`b`, and where along it (0 to 1). */
export function distanceToSegment(
  p: Xy,
  a: Xy,
  b: Xy
): { distance: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq)
        );
  return {
    distance: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)),
    t,
  };
}

const MAX_OVERLAP_SAMPLES = 20000;

/** Points every `stepM` along the line, always including both ends. */
function sampleLine(line: readonly Xy[], stepM: number): Xy[] {
  const samples: Xy[] = [];
  const first = line[0];
  if (!first) return samples;
  samples.push(first);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as Xy;
    const b = line[i] as Xy;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const pieces = Math.max(1, Math.ceil(length / stepM));
    for (let k = 1; k <= pieces; k++) {
      const t = k / pieces;
      samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return samples;
}

/**
 * The share (0 to 1) of route `a` that lies within `toleranceM` of route `b`.
 * Both are sampled along their length, so sparse points do not matter, and
 * the work is bounded however long the routes are.
 */
export function routeOverlapFraction(
  a: readonly RoutePoint[],
  b: readonly RoutePoint[],
  toleranceM = 30
): number {
  const origin = a[0];
  if (!origin || a.length < 2 || b.length < 2) return 0;
  const project = localProjector(origin);
  const lineA = a.map(project);
  const lineB = b.map(project);

  const totalM = routeDistanceMeters(a) + routeDistanceMeters(b);
  const stepM = Math.max(toleranceM / 2, totalM / MAX_OVERLAP_SAMPLES);
  const samplesA = sampleLine(lineA, stepM);
  const samplesB = sampleLine(lineB, stepM);

  const cell = toleranceM;
  const grid = new Map<string, Xy[]>();
  // A sample within a quarter of the tolerance of one already in its cell adds
  // nothing, and skipping it keeps a cell to a few dozen samples however
  // tangled the line is (a track that doubles back over one spot would
  // otherwise make the search below quadratic).
  const dedupeM = toleranceM / 4;
  for (const s of samplesB) {
    const key = `${Math.floor(s.x / cell)},${Math.floor(s.y / cell)}`;
    const bucket = grid.get(key);
    if (!bucket) {
      grid.set(key, [s]);
    } else if (
      !bucket.some((q) => Math.hypot(q.x - s.x, q.y - s.y) < dedupeM)
    ) {
      bucket.push(s);
    }
  }

  let near = 0;
  for (const s of samplesA) {
    const cx = Math.floor(s.x / cell);
    const cy = Math.floor(s.y / cell);
    let found = false;
    for (let dx = -1; dx <= 1 && !found; dx++) {
      for (let dy = -1; dy <= 1 && !found; dy++) {
        const bucket = grid.get(`${cx + dx},${cy + dy}`);
        found =
          bucket?.some((q) => Math.hypot(q.x - s.x, q.y - s.y) <= toleranceM) ??
          false;
      }
    }
    if (found) near++;
  }
  return near / samplesA.length;
}

/**
 * Whether two routes really are different shapes: false when most of each
 * lies on the other.
 */
export function routesAreDistinct(
  a: readonly RoutePoint[],
  b: readonly RoutePoint[],
  { toleranceM = 30, maxOverlap = 0.7 } = {}
): boolean {
  const overlap = Math.min(
    routeOverlapFraction(a, b, toleranceM),
    routeOverlapFraction(b, a, toleranceM)
  );
  return overlap < maxOverlap;
}

/**
 * Filters out invalid GPS points (Null Island, out-of-range coordinates)
 * and extreme distance outliers (> maxRadiusMeters, default 500 km from the workout's median center).
 *
 * This guards against corrupted coordinate columns, sensor glitches, or stale first fixes
 * that draw straight lines across continents.
 */
export function filterGpsTrackOutliers<T extends { lat: number; lon: number }>(
  points: readonly T[],
  maxRadiusMeters = 500_000
): T[] {
  const valid = points.filter(
    (p) =>
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lon) &&
      !(p.lat === 0 && p.lon === 0) &&
      p.lat >= -90 &&
      p.lat <= 90 &&
      p.lon >= -180 &&
      p.lon <= 180
  );
  if (valid.length < 3) return valid;

  const sortedLats = valid.map((p) => p.lat).sort((a, b) => a - b);
  const sortedLons = valid.map((p) => p.lon).sort((a, b) => a - b);
  const mid = Math.floor(valid.length / 2);
  const medianPoint: LatLon = {
    lat: sortedLats[mid] as number,
    lon: sortedLons[mid] as number,
  };

  return valid.filter(
    (p) => haversineMeters(medianPoint, p) <= maxRadiusMeters
  );
}
