import type { LatLon } from './routingProvider.js';

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** The point `distanceM` from `from` along compass `bearingDeg`. */
export function destinationPoint(
  from: LatLon,
  bearingDeg: number,
  distanceM: number
): LatLon {
  const angular = distanceM / EARTH_RADIUS_M;
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(from.lat);
  const lon1 = toRad(from.lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    );
  return {
    lat: toDeg(lat2),
    lon: ((toDeg(lon2) + 540) % 360) - 180,
  };
}

/**
 * Roads wind, so a route is longer than the straight-line shape it follows.
 * This is the first guess; `scaleFromResult` corrects it from what the engine
 * actually returns.
 */
export const INITIAL_WINDING_FACTOR = 1.3;

/**
 * Where to send the engine for a loop of about `targetM`: the start sits on a
 * circle and three further points are spaced round it. `windingFactor` is the
 * expected ratio of routed distance to the circle's circumference.
 */
export function planLoop(
  start: LatLon,
  targetM: number,
  bearingDeg: number,
  windingFactor: number
): LatLon[] {
  const radius = targetM / windingFactor / (2 * Math.PI);
  const centre = destinationPoint(start, bearingDeg, radius);
  const backToStart = (bearingDeg + 180) % 360;
  const ring = [1, 2, 3].map((step) =>
    destinationPoint(centre, (backToStart + step * 90) % 360, radius)
  );
  return [start, ...ring, start];
}

/** An out-and-back: the turnaround is half the (winding-adjusted) distance away. */
export function planOutAndBack(
  start: LatLon,
  targetM: number,
  bearingDeg: number,
  windingFactor: number
): LatLon[] {
  const turnaround = destinationPoint(
    start,
    bearingDeg,
    targetM / 2 / windingFactor
  );
  return [start, turnaround, start];
}

/**
 * The winding factor to try next, given the factor used and the distance the
 * engine actually returned: if the route came back long, assume roads wind
 * more here and aim the shape smaller.
 */
export function scaleFromResult(
  windingFactor: number,
  targetM: number,
  actualM: number
): number {
  if (actualM <= 0) return windingFactor;
  return windingFactor * (actualM / targetM);
}
