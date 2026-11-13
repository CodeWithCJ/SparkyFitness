import {
  ROUTE_FOLLOW_ROADS_MAX_POINTS,
  distanceToSegment,
  haversineMeters,
  localProjector,
  routeElevationGainMeters,
  simplifyRoute,
  type GeneratedRoutePreview,
  type Route,
  type RouteCue,
  type RoutePoint,
} from '@workspace/shared';

/** The most waypoints the editor keeps, so dragging and snapping stay cheap. */
export const ROUTE_EDITOR_MAX_POINTS = 100;
/** A saved route is thinned to this many draggable points when opened. */
const EDIT_ANCHOR_COUNT = 60;
const EDIT_ANCHOR_TOLERANCE_M = 5;

/** The line a saved route had between two waypoints, kept until that stretch is edited. */
export interface FixedLeg {
  points: RoutePoint[];
  /** Cue `index` counts from the first point of `points`. */
  cues: RouteCue[];
}

/** The stretch between waypoint `i` and `i + 1`. */
export interface EditorLeg {
  /** Draw a plain straight line even when roads are followed. */
  straight: boolean;
  fixed: FixedLeg | null;
}

export interface EditorState {
  points: RoutePoint[];
  /** Always `max(points.length - 1, 0)` long. */
  legs: EditorLeg[];
}

export const EMPTY_EDITOR_STATE: EditorState = { points: [], legs: [] };

const newLeg = (straight: boolean): EditorLeg => ({ straight, fixed: null });

/** Appends a point; the new stretch keeps the previous stretch's straight/snapped choice. */
export function addPoint(state: EditorState, point: RoutePoint): EditorState {
  if (state.points.length >= ROUTE_EDITOR_MAX_POINTS) return state;
  const previous = state.legs[state.legs.length - 1];
  return {
    points: [...state.points, point],
    legs:
      state.points.length === 0
        ? []
        : [...state.legs, newLeg(previous?.straight ?? false)],
  };
}

/**
 * Splits a kept line at the spot nearest to `point`. Both halves share that
 * spot; cues stay with the half they were on.
 */
function splitFixedLeg(
  fixed: FixedLeg,
  point: RoutePoint
): [FixedLeg, FixedLeg] | null {
  const origin = fixed.points[0];
  if (!origin || fixed.points.length < 2) return null;
  const project = localProjector(origin);
  const target = project(point);
  let segment = 0;
  let nearest = Infinity;
  for (let i = 0; i < fixed.points.length - 1; i++) {
    const { distance } = distanceToSegment(
      target,
      project(fixed.points[i] as RoutePoint),
      project(fixed.points[i + 1] as RoutePoint)
    );
    if (distance < nearest) {
      nearest = distance;
      segment = i;
    }
  }
  // A tap on a saved vertex splits there; anywhere else the new point joins
  // both halves. Cues at or before the cut stay, later ones move to the
  // second half and are renumbered from its first point.
  const vertex = [segment, segment + 1].find(
    (i) => haversineMeters(fixed.points[i] as RoutePoint, point) <= 0.5
  );
  const cut = vertex ?? segment;
  const keep = (cue: RouteCue) => cue.index <= cut;
  const shift = vertex === undefined ? segment : cut;
  return [
    {
      points:
        vertex === undefined
          ? [...fixed.points.slice(0, segment + 1), point]
          : fixed.points.slice(0, cut + 1),
      cues: fixed.cues.filter(keep),
    },
    {
      points:
        vertex === undefined
          ? [point, ...fixed.points.slice(segment + 1)]
          : fixed.points.slice(cut),
      cues: fixed.cues
        .filter((cue) => !keep(cue))
        .map((cue) => ({ ...cue, index: cue.index - shift })),
    },
  ];
}

/**
 * Splits stretch `leg` in two at `point`; both halves keep its straight/snapped
 * choice. A stretch that still has its saved line is cut there, so inserting a
 * point does not flatten a curve that was not edited.
 */
export function insertPoint(
  state: EditorState,
  leg: number,
  point: RoutePoint
): EditorState {
  const old = state.legs[leg];
  if (!old || state.points.length >= ROUTE_EDITOR_MAX_POINTS) return state;
  const points = [...state.points];
  points.splice(leg + 1, 0, point);
  const halves = old.fixed ? splitFixedLeg(old.fixed, point) : null;
  const legs = [...state.legs];
  legs.splice(
    leg,
    1,
    { straight: old.straight, fixed: halves?.[0] ?? null },
    { straight: old.straight, fixed: halves?.[1] ?? null }
  );
  return { points, legs };
}

/** Moves a point; the stretches on either side lose their kept line and are routed again. */
export function movePoint(
  state: EditorState,
  index: number,
  point: RoutePoint
): EditorState {
  if (!state.points[index]) return state;
  return {
    points: state.points.map((p, i) => (i === index ? point : p)),
    legs: state.legs.map((leg, i) =>
      i === index - 1 || i === index ? newLeg(leg.straight) : leg
    ),
  };
}

/**
 * Removes a point and joins its neighbours. The joined stretch is straight
 * only when both stretches it replaces were.
 */
export function deletePoint(state: EditorState, index: number): EditorState {
  if (!state.points[index]) return state;
  const points = state.points.filter((_, i) => i !== index);
  const legs = [...state.legs];
  if (index === 0) {
    legs.shift();
  } else if (index === state.points.length - 1) {
    legs.pop();
  } else {
    const before = legs[index - 1];
    const after = legs[index];
    legs.splice(
      index - 1,
      2,
      newLeg((before?.straight ?? false) && (after?.straight ?? false))
    );
  }
  return { points, legs };
}

export function setLegStraight(
  state: EditorState,
  leg: number,
  straight: boolean
): EditorState {
  const old = state.legs[leg];
  if (!old || (old.straight === straight && old.fixed === null)) return state;
  return {
    ...state,
    legs: state.legs.map((l, i) => (i === leg ? newLeg(straight) : l)),
  };
}

/**
 * Opens a saved route for editing: the line is thinned to draggable waypoints
 * and each stretch keeps its saved line (and cues) until it is edited, so an
 * untouched part of the route comes back exactly as it was.
 */
export function stateFromRoute(
  route: Pick<Route, 'points' | 'cues'>
): EditorState {
  if (route.points.length < 2) return { points: [...route.points], legs: [] };
  const { points, sourceIndexes } = simplifyRoute(
    route.points,
    EDIT_ANCHOR_COUNT,
    EDIT_ANCHOR_TOLERANCE_M
  );
  const lastLeg = sourceIndexes.length - 2;
  const legs = sourceIndexes.slice(0, -1).map((from, k): EditorLeg => {
    const to = sourceIndexes[k + 1] as number;
    return {
      straight: false,
      fixed: {
        points: route.points.slice(from, to + 1),
        cues: route.cues
          .filter(
            (cue) =>
              cue.index >= from &&
              (cue.index < to || (k === lastLeg && cue.index === to))
          )
          .map((cue) => ({ ...cue, index: cue.index - from })),
      },
    };
  });
  return { points, legs };
}

/** One piece of the line: a kept or straight stretch, or a run of stretches to snap together. */
export type EditorSegment =
  | { kind: 'fixed' | 'straight'; leg: number }
  | { kind: 'snap'; from: number; to: number };

/**
 * Splits the route into pieces. With `snapEnabled`, consecutive snapped
 * stretches become one routing request (up to what the generate endpoint
 * takes), so a long route costs a few requests, and moving one point only
 * re-routes the pieces beside it.
 */
export function planSegments(
  state: EditorState,
  snapEnabled: boolean
): EditorSegment[] {
  const segments: EditorSegment[] = [];
  const maxLegs = ROUTE_FOLLOW_ROADS_MAX_POINTS - 1;
  let run: { from: number; to: number } | null = null;
  const flush = () => {
    if (!run) return;
    for (let from = run.from; from < run.to; from += maxLegs) {
      segments.push({
        kind: 'snap',
        from,
        to: Math.min(from + maxLegs, run.to),
      });
    }
    run = null;
  };
  state.legs.forEach((leg, i) => {
    if (!leg.fixed && snapEnabled && !leg.straight) {
      run = run ? { from: run.from, to: i + 1 } : { from: i, to: i + 1 };
      return;
    }
    flush();
    segments.push({ kind: leg.fixed ? 'fixed' : 'straight', leg: i });
  });
  flush();
  return segments;
}

/** The waypoints a snap piece routes through. */
export function segmentPoints(
  state: EditorState,
  segment: Extract<EditorSegment, { kind: 'snap' }>
): RoutePoint[] {
  return state.points.slice(segment.from, segment.to + 1);
}

export interface EditorLine {
  points: RoutePoint[];
  cues: RouteCue[];
  distanceM: number;
  elevationGainM: number | null;
  /** Where each waypoint sits in `points`. */
  waypointIndexes: number[];
  /** Each stretch's drawn line, for showing straight stretches differently. */
  legLines: RoutePoint[][];
}

/**
 * Joins the pieces into one line. A snap piece with no routed answer yet is
 * drawn straight, so the line never has a hole. Cues from joined pieces are
 * kept, except the inner "depart" and "arrive" ones, and their distances are
 * recomputed along the joined line.
 */
export function assembleLine(
  state: EditorState,
  segments: readonly EditorSegment[],
  routed: (
    segment: Extract<EditorSegment, { kind: 'snap' }>
  ) => Pick<GeneratedRoutePreview, 'points' | 'cues'> | null
): EditorLine {
  const first = state.points[0];
  if (!first) {
    return {
      points: [],
      cues: [],
      distanceM: 0,
      elevationGainM: null,
      waypointIndexes: [],
      legLines: [],
    };
  }
  const points: RoutePoint[] = [first];
  const waypointIndexes: number[] = [0];
  let cues: RouteCue[] = [];

  // Appends a piece's line. Its first point is the end of the line so far
  // unless the two are more than a metre apart (then both are kept).
  const append = (
    piece: readonly RoutePoint[],
    pieceCues: readonly RouteCue[]
  ) => {
    const last = points[points.length - 1] as RoutePoint;
    const head = piece[0];
    const dropFirst = !head || haversineMeters(last, head) <= 1;
    const base = dropFirst ? points.length - 1 : points.length;
    for (let i = dropFirst ? 1 : 0; i < piece.length; i++) {
      points.push(piece[i] as RoutePoint);
    }
    cues = cues.concat(
      pieceCues.map((cue) => ({ ...cue, index: cue.index + base }))
    );
  };

  for (const segment of segments) {
    if (segment.kind === 'snap') {
      const result = routed(segment);
      if (result && result.points.length >= 2) {
        append(result.points, result.cues);
      } else {
        append(segmentPoints(state, segment), []);
      }
      // Waypoints inside the piece sit at the routed point nearest to them.
      for (let leg = segment.from + 1; leg < segment.to; leg++) {
        waypointIndexes.push(
          nearestIndex(
            points,
            state.points[leg] as RoutePoint,
            waypointIndexes[waypointIndexes.length - 1] as number
          )
        );
      }
    } else {
      const leg = state.legs[segment.leg];
      if (segment.kind === 'fixed' && leg?.fixed) {
        append(leg.fixed.points, leg.fixed.cues);
      } else {
        append([state.points[segment.leg + 1] as RoutePoint], []);
      }
    }
    waypointIndexes.push(points.length - 1);
  }
  const legLines = state.legs.map((_, leg) =>
    points.slice(
      waypointIndexes[leg] as number,
      (waypointIndexes[leg + 1] as number) + 1
    )
  );

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(
      (cumulative[i - 1] as number) +
        haversineMeters(points[i - 1] as RoutePoint, points[i] as RoutePoint)
    );
  }
  const lastIndex = points.length - 1;
  cues = cues
    .filter(
      (cue) =>
        cue.index <= lastIndex &&
        !(cue.kind === 'depart' && cue.index > 0) &&
        !(cue.kind === 'arrive' && cue.index < lastIndex)
    )
    .sort((a, b) => a.index - b.index)
    .map((cue) => ({ ...cue, distanceM: cumulative[cue.index] ?? 0 }));

  return {
    points,
    cues,
    distanceM: cumulative[lastIndex] ?? 0,
    elevationGainM: routeElevationGainMeters(points),
    waypointIndexes,
    legLines,
  };
}

function nearestIndex(
  points: readonly RoutePoint[],
  target: RoutePoint,
  fromIndex: number
): number {
  let best = fromIndex;
  let bestDistance = Infinity;
  for (let i = fromIndex; i < points.length; i++) {
    const d = haversineMeters(points[i] as RoutePoint, target);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

export interface LineHit {
  /** Stretch (between waypoint `leg` and `leg + 1`) the point is on. */
  leg: number;
  /** The nearest spot on the line. */
  point: RoutePoint;
  distanceM: number;
}

/** The stretch of the drawn line nearest to `target`, if it is within `maxDistanceM`. */
export function hitTestLine(
  line: Pick<EditorLine, 'points' | 'waypointIndexes'>,
  target: RoutePoint,
  maxDistanceM: number
): LineHit | null {
  const origin = line.points[0];
  if (!origin || line.points.length < 2) return null;
  const project = localProjector(origin);
  const t = project(target);
  let best: { segment: number; distance: number; frac: number } | null = null;
  for (let i = 0; i < line.points.length - 1; i++) {
    const { distance, t: frac } = distanceToSegment(
      t,
      project(line.points[i] as RoutePoint),
      project(line.points[i + 1] as RoutePoint)
    );
    if (!best || distance < best.distance)
      best = { segment: i, distance, frac };
  }
  if (!best || best.distance > maxDistanceM) return null;
  const a = line.points[best.segment] as RoutePoint;
  const b = line.points[best.segment + 1] as RoutePoint;
  let leg = 0;
  for (let k = 0; k < line.waypointIndexes.length - 1; k++) {
    if ((line.waypointIndexes[k] as number) <= best.segment) leg = k;
  }
  return {
    leg,
    point: {
      lat: a.lat + (b.lat - a.lat) * best.frac,
      lon: a.lon + (b.lon - a.lon) * best.frac,
    },
    distanceM: best.distance,
  };
}

/** Linear undo/redo over editor states. */
export interface EditorHistory {
  past: EditorState[];
  present: EditorState;
  future: EditorState[];
}

const HISTORY_LIMIT = 100;

export const emptyHistory = (present: EditorState): EditorHistory => ({
  past: [],
  present,
  future: [],
});

/** Makes `next` the present state; a change that returns the same state is not recorded. */
export function pushHistory(
  history: EditorHistory,
  next: EditorState
): EditorHistory {
  if (next === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

export function undoHistory(history: EditorHistory): EditorHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history: EditorHistory): EditorHistory {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
}
