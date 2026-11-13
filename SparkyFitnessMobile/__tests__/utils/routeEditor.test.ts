import type { Route, RoutePoint } from '@workspace/shared';
import {
  EMPTY_EDITOR_STATE,
  ROUTE_EDITOR_MAX_POINTS,
  addPoint,
  assembleLine,
  deletePoint,
  emptyHistory,
  hitTestLine,
  insertPoint,
  movePoint,
  planSegments,
  pushHistory,
  redoHistory,
  setLegStraight,
  stateFromRoute,
  undoHistory,
  type EditorState,
} from '../../src/utils/routeEditor';

const pt = (i: number): RoutePoint => ({ lat: 40 + i * 0.001, lon: -100 });
const stateOf = (...indexes: number[]): EditorState =>
  indexes.reduce(
    (state, i) => addPoint(state, pt(i)),
    EMPTY_EDITOR_STATE as EditorState
  );

/** A loop about 300 m across, so thinning keeps plenty of corners. */
const circlePoints: RoutePoint[] = Array.from({ length: 200 }, (_, i) => ({
  lat: 40 + 0.003 * Math.sin((i / 199) * 2 * Math.PI),
  lon: -100 + 0.003 * Math.cos((i / 199) * 2 * Math.PI),
}));
const circle = { points: circlePoints, cues: [] } as unknown as Pick<
  Route,
  'points' | 'cues'
>;

describe('editing points', () => {
  it('keeps one stretch fewer than points', () => {
    const state = stateOf(0, 1, 2);
    expect(state.points).toHaveLength(3);
    expect(state.legs).toHaveLength(2);
    expect(stateOf(0).legs).toHaveLength(0);
  });

  it('lets a new stretch continue the previous straight choice', () => {
    const state = addPoint(setLegStraight(stateOf(0, 1), 0, true), pt(2));
    expect(state.legs.map((l) => l.straight)).toEqual([true, true]);
  });

  it('stops at the point limit', () => {
    let state = EMPTY_EDITOR_STATE;
    for (let i = 0; i < ROUTE_EDITOR_MAX_POINTS + 5; i++) {
      state = addPoint(state, pt(i));
    }
    expect(state.points).toHaveLength(ROUTE_EDITOR_MAX_POINTS);
  });

  it('inserts inside a stretch and keeps its straight choice', () => {
    const base = setLegStraight(stateOf(0, 2), 0, true);
    const state = insertPoint(base, 0, pt(1));
    expect(state.points).toEqual([pt(0), pt(1), pt(2)]);
    expect(state.legs.map((l) => l.straight)).toEqual([true, true]);
  });

  it('moves a point and drops the kept line of the stretches beside it', () => {
    const state = movePoint(stateFromRoute(circle), 1, pt(9));
    expect(state.legs.length).toBeGreaterThan(2);
    expect(state.points[1]).toEqual(pt(9));
    expect(state.legs[0]?.fixed).toBeNull();
    expect(state.legs[1]?.fixed).toBeNull();
  });

  it('deletes the start, the end and a middle point', () => {
    const state = stateOf(0, 1, 2, 3);
    expect(deletePoint(state, 0).points).toEqual([pt(1), pt(2), pt(3)]);
    expect(deletePoint(state, 3).points).toEqual([pt(0), pt(1), pt(2)]);
    const middle = deletePoint(state, 1);
    expect(middle.points).toEqual([pt(0), pt(2), pt(3)]);
    expect(middle.legs).toHaveLength(2);
    expect(deletePoint(stateOf(0, 1), 0).legs).toHaveLength(0);
  });

  it('joins two stretches as straight only when both were', () => {
    const a = setLegStraight(
      setLegStraight(stateOf(0, 1, 2), 0, true),
      1,
      true
    );
    expect(deletePoint(a, 1).legs[0]?.straight).toBe(true);
    const b = setLegStraight(stateOf(0, 1, 2), 0, true);
    expect(deletePoint(b, 1).legs[0]?.straight).toBe(false);
  });
});

describe('history', () => {
  it('undoes, redoes and drops redo after a new change', () => {
    let h = emptyHistory(EMPTY_EDITOR_STATE);
    h = pushHistory(h, stateOf(0));
    h = pushHistory(h, stateOf(0, 1));
    h = undoHistory(h);
    expect(h.present.points).toHaveLength(1);
    expect(redoHistory(h).present.points).toHaveLength(2);
    h = pushHistory(h, stateOf(5));
    expect(h.future).toHaveLength(0);
    expect(
      undoHistory(undoHistory(undoHistory(h))).present.points
    ).toHaveLength(0);
  });

  it('does not record a change that changed nothing', () => {
    const h = emptyHistory(stateOf(0, 1));
    expect(pushHistory(h, h.present)).toBe(h);
  });
});

describe('planSegments', () => {
  it('groups snapped stretches and splits around straight ones', () => {
    const state = setLegStraight(stateOf(0, 1, 2, 3, 4), 1, true);
    expect(planSegments(state, true)).toEqual([
      { kind: 'snap', from: 0, to: 1 },
      { kind: 'straight', leg: 1 },
      { kind: 'snap', from: 2, to: 4 },
    ]);
  });

  it('makes everything straight with snapping off', () => {
    expect(planSegments(stateOf(0, 1, 2), false)).toEqual([
      { kind: 'straight', leg: 0 },
      { kind: 'straight', leg: 1 },
    ]);
  });

  it('splits a long run into pieces the engine accepts, sharing the joins', () => {
    const state = stateOf(...Array.from({ length: 45 }, (_, i) => i));
    const segments = planSegments(state, true);
    expect(segments).toEqual([
      { kind: 'snap', from: 0, to: 20 },
      { kind: 'snap', from: 20, to: 40 },
      { kind: 'snap', from: 40, to: 44 },
    ]);
  });
});

describe('stateFromRoute and assembleLine', () => {
  const dense = circlePoints;
  const route = {
    points: dense,
    cues: [
      { index: 0, kind: 'depart' as const },
      { index: 100, kind: 'left' as const },
      { index: 199, kind: 'arrive' as const },
    ],
  } as unknown as Pick<Route, 'points' | 'cues'>;

  it('thins a saved route but gives the untouched line back exactly', () => {
    const state = stateFromRoute(route);
    expect(state.points.length).toBeGreaterThan(4);
    expect(state.points.length).toBeLessThan(dense.length);
    const line = assembleLine(state, planSegments(state, false), () => null);
    expect(line.points).toEqual(dense);
    expect(line.cues.map((c) => c.kind)).toEqual(['depart', 'left', 'arrive']);
    expect(line.cues[1]?.index).toBe(100);
    expect(line.cues[1]?.distanceM).toBeGreaterThan(0);
  });

  it('keeps the first waypoint and last waypoint of the saved route', () => {
    const state = stateFromRoute(route);
    expect(state.points[0]).toEqual(dense[0]);
    expect(state.points.at(-1)).toEqual(dense.at(-1));
  });

  it('re-draws only the stretch that was moved', () => {
    const base = stateFromRoute(route);
    const moved = movePoint(base, 1, { lat: 40.5, lon: -100 });
    const line = assembleLine(moved, planSegments(moved, false), () => null);
    expect(line.points).toContainEqual({ lat: 40.5, lon: -100 });
    // The far end of the route is unchanged.
    expect(line.points.at(-1)).toEqual(dense.at(-1));
    expect(line.waypointIndexes).toHaveLength(moved.points.length);
  });

  it('drops inner depart and arrive cues when pieces are joined', () => {
    const state = stateOf(0, 1, 2);
    const piece = (a: number, b: number) => ({
      points: [pt(a), pt(b)],
      cues: [
        { index: 0, kind: 'depart' as const },
        { index: 1, kind: 'arrive' as const },
      ],
    });
    const state2 = setLegStraight(state, 1, true);
    const segments = planSegments(state2, true);
    const line = assembleLine(state2, segments, () => piece(0, 1));
    expect(line.cues.map((c) => c.kind)).toEqual(['depart']);
  });
});

describe('hitTestLine', () => {
  const state = stateOf(0, 2, 4);
  const line = assembleLine(state, planSegments(state, false), () => null);

  it('finds the stretch under a tap and the spot on it', () => {
    const hit = hitTestLine(line, { lat: 40.003, lon: -100.00001 }, 20);
    expect(hit?.leg).toBe(1);
    expect(hit?.point.lat).toBeCloseTo(40.003, 5);
  });

  it('ignores taps far from the line', () => {
    expect(hitTestLine(line, { lat: 40.003, lon: -99.9 }, 20)).toBeNull();
  });

  it('has nothing to hit with fewer than two points', () => {
    const one = stateOf(0);
    const l = assembleLine(one, planSegments(one, false), () => null);
    expect(hitTestLine(l, pt(0), 100)).toBeNull();
  });
});

describe('editing a saved route', () => {
  const saved = {
    points: circlePoints,
    cues: [
      { index: 0, kind: 'depart' as const },
      { index: 100, kind: 'left' as const },
      { index: 199, kind: 'arrive' as const },
    ],
  } as unknown as Pick<Route, 'points' | 'cues'>;

  it('inserting on an untouched stretch keeps its curve and reindexes its cues', () => {
    const base = stateFromRoute(saved);
    const before = assembleLine(base, planSegments(base, false), () => null);
    // Insert on the leg that holds the left-turn cue, on the saved line.
    const leg = before.waypointIndexes.findIndex((w) => w > 100) - 1;
    const onLine = circlePoints[100] as RoutePoint;
    const next = insertPoint(base, leg, onLine);
    expect(next.points).toHaveLength(base.points.length + 1);
    const after = assembleLine(next, planSegments(next, false), () => null);
    // Every saved point is still drawn, in order, with the new spot among them.
    expect(after.points).toEqual(before.points);
    expect(after.cues.map((c) => c.kind)).toEqual(['depart', 'left', 'arrive']);
    expect(after.cues[1]?.index).toBe(100);
    expect(after.cues.every((c) => c.index < after.points.length)).toBe(true);
  });

  it('thins a dense route to at most 60 points and keeps its shape', () => {
    const dense: RoutePoint[] = Array.from({ length: 2000 }, (_, i) => ({
      lat: 40 + 0.01 * Math.sin((i / 1999) * 4 * Math.PI),
      lon: -100 + 0.01 * Math.cos((i / 1999) * 4 * Math.PI),
    }));
    const started = Date.now();
    const state = stateFromRoute({ points: dense, cues: [] });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(state.points.length).toBeLessThanOrEqual(60);
    expect(state.legs).toHaveLength(state.points.length - 1);
    const line = assembleLine(state, planSegments(state, false), () => null);
    expect(line.points).toEqual(dense);
    // Each kept waypoint is a point of the original line.
    for (const waypoint of state.points) expect(dense).toContainEqual(waypoint);
  });

  it('handles a few thousand points in the line without slowing down', () => {
    const state = stateOf(0, 1, 2, 3);
    const long: RoutePoint[] = Array.from({ length: 5000 }, (_, i) => ({
      lat: 40 + i * 0.00001,
      lon: -100,
    }));
    const started = Date.now();
    const line = assembleLine(state, planSegments(state, true), () => ({
      points: long,
      cues: [],
    }));
    hitTestLine(line, pt(1), 50);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('keeps a cue on the last point after deleting and inserting', () => {
    const base = stateFromRoute(saved);
    const next = insertPoint(
      deletePoint(base, 1),
      0,
      circlePoints[10] as RoutePoint
    );
    const line = assembleLine(next, planSegments(next, false), () => null);
    expect(line.cues.every((c) => c.index < line.points.length)).toBe(true);
  });

  it('numbers the history limit', () => {
    let history = emptyHistory(EMPTY_EDITOR_STATE);
    for (let i = 0; i < 150; i++) {
      history = pushHistory(history, addPoint(history.present, pt(i % 50)));
    }
    expect(history.past.length).toBeLessThanOrEqual(100);
  });
});
