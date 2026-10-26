import {
  routeGenerateCapabilitiesSchema,
  ROUTE_GENERATE_MAX_DISTANCE_M,
  ROUTE_GENERATE_MAX_WAYPOINTS,
  ROUTE_GENERATE_MIN_DISTANCE_M,
  type GenerateRouteBody,
  type RouteCue,
  type RouteGenerateCapabilities,
  type RouteOptionLabel,
  type RoutePoint,
  type RouteStyle,
} from '../schemas/api/Route.api.zod.ts';

type LatLon = Pick<RoutePoint, 'lat' | 'lon'>;
type RouteActivity = GenerateRouteBody['activity'];
type WaypointsBody = Extract<GenerateRouteBody, { mode: 'waypoints' }>;
type LoopBody = Extract<GenerateRouteBody, { mode: 'loop' }>;

const METERS_PER_KM = 1000;
const METERS_PER_MILE = 1609.344;

/** The first tap is the start, so a routed line takes this many taps at most. */
export const ROUTE_FOLLOW_ROADS_MAX_POINTS = ROUTE_GENERATE_MAX_WAYPOINTS + 1;

/** Whether one more tap still fits inside what the generate endpoint takes. */
export function canAddFollowRoadsPoint(pointCount: number): boolean {
  return pointCount < ROUTE_FOLLOW_ROADS_MAX_POINTS;
}

/**
 * Keeps at most `max` waypoints, always the first and last, with the rest
 * spread evenly. A list already within `max` is returned unchanged.
 */
export function limitWaypoints<T>(
  waypoints: readonly T[],
  max = ROUTE_GENERATE_MAX_WAYPOINTS
): T[] {
  if (waypoints.length <= max) return [...waypoints];
  if (max <= 1) return waypoints.slice(waypoints.length - Math.max(max, 0));
  const result: T[] = [];
  for (let i = 0; i < max; i++) {
    result.push(
      waypoints[Math.round((i * (waypoints.length - 1)) / (max - 1))] as T
    );
  }
  return result;
}

/**
 * Turns ordered taps into a waypoints-mode generate request: the first tap is
 * the start and the rest are waypoints. Null until there are two taps.
 */
export function buildFollowRoadsRequest(
  taps: readonly LatLon[],
  activity: RouteActivity = 'run',
  style?: RouteStyle
): WaypointsBody | null {
  const [start, ...rest] = taps;
  if (!start || rest.length === 0) return null;
  return {
    mode: 'waypoints',
    start: { lat: start.lat, lon: start.lon },
    activity,
    waypoints: limitWaypoints(rest).map((p) => ({ lat: p.lat, lon: p.lon })),
    returnToStart: false,
    ...(style ? { style } : {}),
  };
}

/** A stable string for the taps, to tell whether a result is still current. */
export function followRoadsKey(
  taps: readonly LatLon[],
  activity: RouteActivity = 'run',
  style?: RouteStyle
): string {
  return `${activity}|${styleKey(style)}|${taps.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join(';')}`;
}

export type RouteGenerateErrorKind =
  | 'noRoute'
  | 'rateLimited'
  | 'engineError'
  | 'timeout'
  | 'notConfigured'
  | 'invalid'
  | 'unknown';

/** Names what an HTTP status from the generate endpoint means. */
export function routeGenerateErrorKind(
  status: number | undefined
): RouteGenerateErrorKind {
  switch (status) {
    case 422:
      return 'noRoute';
    case 429:
      return 'rateLimited';
    case 502:
      return 'engineError';
    case 504:
      return 'timeout';
    case 503:
      return 'notConfigured';
    case 400:
      return 'invalid';
    default:
      return 'unknown';
  }
}

/** Cue kinds that are not a turn. */
const NON_TURN_KINDS = new Set<RouteCue['kind']>([
  'depart',
  'straight',
  'arrive',
]);

/** Cues that are actual turns (not depart, arrive or carry on straight). */
export function routeTurnCues(cues: readonly RouteCue[]): RouteCue[] {
  return cues.filter((cue) => !NON_TURN_KINDS.has(cue.kind));
}

export function countRouteTurns(cues: readonly RouteCue[]): number {
  return routeTurnCues(cues).length;
}

/** The next heading to try: at least a quarter turn away from the last one. */
export function nextBearingDeg(
  previous: number | null,
  random: () => number = Math.random
): number {
  if (previous === null) return Math.floor(random() * 360);
  return Math.floor((previous + 90 + random() * 180) % 360);
}

/** A distance typed in the person's unit, as metres. */
export function routeDistanceToMeters(
  value: number,
  unit: 'km' | 'miles'
): number {
  return value * (unit === 'miles' ? METERS_PER_MILE : METERS_PER_KM);
}

/** The target range for a generated loop, expressed in the person's unit. */
export function generateDistanceRange(unit: 'km' | 'miles'): {
  min: number;
  max: number;
} {
  const perUnit = unit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
  return {
    min: Math.ceil((ROUTE_GENERATE_MIN_DISTANCE_M / perUnit) * 10) / 10,
    max: Math.floor((ROUTE_GENERATE_MAX_DISTANCE_M / perUnit) * 10) / 10,
  };
}

/**
 * Builds a loop-mode generate request, or null when the distance (typed in the
 * person's unit) is outside what the server accepts.
 */
export function buildLoopRequest(input: {
  start: LatLon;
  activity: RouteActivity;
  shape: LoopBody['shape'];
  distance: number;
  unit: 'km' | 'miles';
  bearingDeg: number;
  style?: RouteStyle;
  alternatives?: number;
}): LoopBody | null {
  const distanceM = routeDistanceToMeters(input.distance, input.unit);
  if (
    !Number.isFinite(distanceM) ||
    distanceM < ROUTE_GENERATE_MIN_DISTANCE_M ||
    distanceM > ROUTE_GENERATE_MAX_DISTANCE_M
  ) {
    return null;
  }
  return {
    mode: 'loop',
    start: { lat: input.start.lat, lon: input.start.lon },
    activity: input.activity,
    shape: input.shape,
    distanceM: Math.round(distanceM),
    bearingDeg: input.bearingDeg,
    alternatives: input.alternatives ?? 1,
    ...(input.style ? { style: input.style } : {}),
  };
}

export const DEFAULT_ROUTE_STYLE: RouteStyle = {
  surface: 'any',
  hilliness: 'any',
  avoidSteps: false,
  avoidBusyRoads: false,
};

/** True when the style asks for nothing beyond the engine's own defaults. */
export function isDefaultRouteStyle(style: RouteStyle | undefined): boolean {
  return (
    !style ||
    (style.surface === 'any' &&
      style.hilliness === 'any' &&
      !style.avoidSteps &&
      !style.avoidBusyRoads)
  );
}

/** A stable string for a style, so a changed choice reads as a changed request. */
export function styleKey(style: RouteStyle | undefined): string {
  const s = style ?? DEFAULT_ROUTE_STYLE;
  return `${s.surface}/${s.hilliness}/${s.avoidSteps ? 1 : 0}/${s.avoidBusyRoads ? 1 : 0}`;
}

/**
 * Keeps only the preferences the engine supports; undefined when none remain,
 * so a request carries no `style` at all rather than an empty one.
 */
export function restrictRouteStyle(
  style: RouteStyle | undefined,
  supported: RouteGenerateCapabilities['style']
): RouteStyle | undefined {
  if (!style) return undefined;
  const restricted: RouteStyle = {
    surface: supported.surface ? style.surface : 'any',
    hilliness: supported.hilliness ? style.hilliness : 'any',
    avoidSteps: supported.avoidSteps && style.avoidSteps,
    avoidBusyRoads: supported.avoidBusyRoads && style.avoidBusyRoads,
  };
  return isDefaultRouteStyle(restricted) ? undefined : restricted;
}

/** Whether any style control is worth showing. */
export function hasRouteStyleControls(
  supported: RouteGenerateCapabilities['style']
): boolean {
  return (
    supported.surface ||
    supported.hilliness ||
    supported.avoidSteps ||
    supported.avoidBusyRoads
  );
}

/**
 * Reads a capabilities answer from any server version: fields an older
 * server does not send read as unsupported, and nonsense reads as off.
 */
export function resolveRouteGenerateCapabilities(
  raw: unknown
): RouteGenerateCapabilities {
  const parsed = routeGenerateCapabilitiesSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return routeGenerateCapabilitiesSchema.parse({ available: false });
}

export interface RouteOptionStats {
  distanceM: number;
  elevationGainM: number | null;
  trailShare: number | null;
}

/** A climb difference smaller than this is not worth a label. */
const FLATTER_MIN_DIFF_M = 15;
const FLATTER_MIN_RATIO = 0.8;
const TRAIL_MIN_SHARE = 0.2;
const TRAIL_MIN_DIFF = 0.15;
const SHORTER_MIN_DIFF_M = 200;
const SHORTER_MIN_RATIO = 0.95;

/**
 * A short label for each candidate, only where the numbers back it up: the
 * flattest is "flatter" if it climbs clearly less than the steepest, the one
 * with the most path is "moreTrail" if it has clearly more than the next, the
 * shortest is "shorter" if it is clearly shorter than the longest. Each label
 * goes to one candidate, and a candidate gets at most one.
 */
export function labelRouteOptions(
  options: readonly RouteOptionStats[]
): (RouteOptionLabel | null)[] {
  const labels: (RouteOptionLabel | null)[] = options.map(() => null);
  if (options.length < 2) return labels;

  const extreme = (
    value: (o: RouteOptionStats) => number | null,
    pick: 'min' | 'max'
  ): number => {
    let best = -1;
    options.forEach((option, i) => {
      const v = value(option);
      if (v === null || labels[i] !== null) return;
      const bestValue =
        best < 0 ? null : value(options[best] as RouteOptionStats);
      if (
        bestValue === null ||
        (pick === 'min' ? v < bestValue : v > bestValue)
      ) {
        best = i;
      }
    });
    return best;
  };
  const values = (value: (o: RouteOptionStats) => number | null): number[] =>
    options.map(value).filter((v): v is number => v !== null);

  const climb = (o: RouteOptionStats) => o.elevationGainM;
  const climbs = values(climb);
  if (climbs.length === options.length) {
    const flattest = extreme(climb, 'min');
    const flattestClimb = climbs[flattest] as number;
    if (
      flattestClimb <= Math.max(...climbs) * FLATTER_MIN_RATIO &&
      Math.max(...climbs) - flattestClimb >= FLATTER_MIN_DIFF_M
    ) {
      labels[flattest] = 'flatter';
    }
  }

  const trail = (o: RouteOptionStats) => o.trailShare;
  const shares = values(trail);
  if (shares.length === options.length) {
    const mostTrail = extreme(trail, 'max');
    if (mostTrail >= 0) {
      const share = shares[mostTrail] as number;
      const others = shares.filter((_, i) => i !== mostTrail);
      if (
        share >= TRAIL_MIN_SHARE &&
        share - Math.max(...others) >= TRAIL_MIN_DIFF
      ) {
        labels[mostTrail] = 'moreTrail';
      }
    }
  }

  const length = (o: RouteOptionStats) => o.distanceM;
  const lengths = values(length);
  const shortest = extreme(length, 'min');
  if (shortest >= 0) {
    const shortestLength = lengths[shortest] as number;
    if (
      shortestLength <= Math.max(...lengths) * SHORTER_MIN_RATIO &&
      Math.max(...lengths) - shortestLength >= SHORTER_MIN_DIFF_M
    ) {
      labels[shortest] = 'shorter';
    }
  }
  return labels;
}
