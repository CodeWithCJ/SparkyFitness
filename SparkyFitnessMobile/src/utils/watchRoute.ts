import {
  haversineMeters,
  simplifyRoute,
  type Route,
  type RouteCue,
  type RouteCueKind,
  type RoutePoint,
} from '@workspace/shared';
import type { WatchRoutePayload } from '../../modules/watch-connectivity';

/** The most points the watch is sent; matches what the server stores. */
export const WATCH_ROUTE_MAX_POINTS = 2000;

/** Degrees are sent as whole millionths (about 11 cm), so the wire holds integers. */
const MICRO = 1_000_000;

/** A turn smaller than this is just the road curving. */
const MIN_TURN_DEG = 30;
/** How far either side of a point the heading is measured, to ride over GPS wobble. */
const HEADING_SPAN_M = 25;
/** Bends this close together are one turn; the sharpest is kept. */
const MERGE_WITHIN_M = 30;

function bearingDegrees(a: RoutePoint, b: RoutePoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Signed change of heading in (-180, 180]; positive is a right turn. */
function turnDegrees(from: number, to: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return delta === -180 ? 180 : delta;
}

function cueKindForTurn(turn: number): RouteCueKind {
  const size = Math.abs(turn);
  const right = turn > 0;
  if (size >= 160) return 'uturn';
  if (size >= 120) return right ? 'sharp_right' : 'sharp_left';
  if (size >= 60) return right ? 'right' : 'left';
  return right ? 'slight_right' : 'slight_left';
}

/**
 * Turn-by-turn cues for a route that arrived without any (a GPX track has
 * none). A turn is a point where the heading, measured over ~25 m either
 * side, changes by 30 degrees or more; a run of such points is one turn, kept
 * at its sharpest. Always begins with `depart` and ends with `arrive`.
 */
export function deriveRouteCues(points: readonly RoutePoint[]): RouteCue[] {
  if (points.length < 2) return [];
  const along: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    along.push(along[i - 1] + haversineMeters(points[i - 1], points[i]));
  }
  const last = points.length - 1;

  const turns: { index: number; turn: number }[] = [];
  for (let i = 1; i < last; i++) {
    let before = i - 1;
    while (before > 0 && along[i] - along[before] < HEADING_SPAN_M) before--;
    let after = i + 1;
    while (after < last && along[after] - along[i] < HEADING_SPAN_M) after++;
    const turn = turnDegrees(
      bearingDegrees(points[before], points[i]),
      bearingDegrees(points[i], points[after])
    );
    if (Math.abs(turn) >= MIN_TURN_DEG) turns.push({ index: i, turn });
  }

  const kept: { index: number; turn: number }[] = [];
  for (const candidate of turns) {
    const previous = kept[kept.length - 1];
    if (
      previous &&
      along[candidate.index] - along[previous.index] < MERGE_WITHIN_M
    ) {
      if (Math.abs(candidate.turn) > Math.abs(previous.turn)) {
        kept[kept.length - 1] = candidate;
      }
    } else {
      kept.push(candidate);
    }
  }

  return [
    { index: 0, kind: 'depart', distanceM: 0 },
    ...kept.map(({ index, turn }) => ({
      index,
      kind: cueKindForTurn(turn),
      distanceM: along[index],
    })),
    { index: last, kind: 'arrive', distanceM: along[last] },
  ];
}

/** Index in `kept` (ascending source indexes) closest to `source`. */
function nearestKept(kept: readonly number[], source: number): number {
  let low = 0;
  let high = kept.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (kept[mid] < source) low = mid + 1;
    else high = mid;
  }
  if (low > 0 && source - kept[low - 1] <= kept[low] - source) return low - 1;
  return low;
}

/**
 * Builds the payload `startRunOnWatch` sends. A route over the point cap is
 * thinned again (cues follow their points); one with no cues gets derived
 * ones, so the watch always has something to announce.
 */
export function toWatchRoutePayload(
  route: Pick<Route, 'id' | 'name' | 'points' | 'cues'>
): WatchRoutePayload | null {
  if (route.points.length < 2) return null;

  let points: readonly RoutePoint[] = route.points;
  let cues: readonly RouteCue[] = route.cues;
  if (points.length > WATCH_ROUTE_MAX_POINTS) {
    const thinned = simplifyRoute(points, WATCH_ROUTE_MAX_POINTS);
    points = thinned.points;
    cues = cues.map((cue) => ({
      ...cue,
      index: nearestKept(thinned.sourceIndexes, cue.index),
    }));
  }
  if (cues.length === 0) cues = deriveRouteCues(points);

  const lastIndex = points.length - 1;
  const sentCues = cues
    .filter((cue) => cue.index <= lastIndex)
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(({ index, kind, text }) => ({
      index,
      kind,
      ...(text ? { text } : {}),
    }));

  return {
    id: route.id,
    name: route.name,
    points: points.flatMap((p) => [
      Math.round(p.lat * MICRO),
      Math.round(p.lon * MICRO),
    ]),
    cues: sentCues,
  };
}
