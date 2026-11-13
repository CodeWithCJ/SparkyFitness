import type { Route, RoutePoint } from '@workspace/shared';
import {
  WATCH_ROUTE_MAX_POINTS,
  deriveRouteCues,
  toWatchRoutePayload,
} from '../../src/utils/watchRoute';

const ORIGIN = { lat: 51.5, lon: -0.12 };
const M_PER_DEG_LAT = 111_195;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180);

/** A point `north`/`east` metres from the origin. */
const at = (east: number, north: number): RoutePoint => ({
  lat: ORIGIN.lat + north / M_PER_DEG_LAT,
  lon: ORIGIN.lon + east / M_PER_DEG_LON,
});

/** Walks `legs` as [heading in degrees, metres], a point every 10 m. */
function walk(legs: [number, number][]): RoutePoint[] {
  const points = [at(0, 0)];
  let east = 0;
  let north = 0;
  for (const [heading, metres] of legs) {
    const steps = Math.round(metres / 10);
    for (let i = 0; i < steps; i++) {
      east += 10 * Math.sin((heading * Math.PI) / 180);
      north += 10 * Math.cos((heading * Math.PI) / 180);
      points.push(at(east, north));
    }
  }
  return points;
}

describe('deriveRouteCues', () => {
  it('returns nothing for fewer than two points', () => {
    expect(deriveRouteCues([])).toEqual([]);
    expect(deriveRouteCues([at(0, 0)])).toEqual([]);
  });

  it('gives a straight line only depart and arrive', () => {
    const points = walk([[0, 300]]);
    const cues = deriveRouteCues(points);
    expect(cues.map((c) => c.kind)).toEqual(['depart', 'arrive']);
    expect(cues[1].index).toBe(points.length - 1);
    expect(cues[1].distanceM).toBeCloseTo(300, -1);
  });

  it('finds a right turn and a left turn', () => {
    // north, east (right), north again (left)
    const cues = deriveRouteCues(
      walk([
        [0, 200],
        [90, 200],
        [0, 200],
      ])
    );
    expect(cues.map((c) => c.kind)).toEqual([
      'depart',
      'right',
      'left',
      'arrive',
    ]);
    expect(cues[1].distanceM).toBeCloseTo(200, -1);
    expect(cues[2].distanceM).toBeCloseTo(400, -1);
  });

  it('sizes turns by how sharp they are', () => {
    const kind = (heading: number) =>
      deriveRouteCues(
        walk([
          [0, 200],
          [heading, 200],
        ])
      )[1].kind;
    expect(kind(45)).toBe('slight_right');
    expect(kind(90)).toBe('right');
    expect(kind(135)).toBe('sharp_right');
    expect(kind(180)).toBe('uturn');
    expect(kind(315)).toBe('slight_left');
    expect(kind(270)).toBe('left');
    expect(kind(225)).toBe('sharp_left');
  });

  it('ignores a gentle curve', () => {
    const cues = deriveRouteCues(
      walk([
        [0, 200],
        [15, 200],
      ])
    );
    expect(cues.map((c) => c.kind)).toEqual(['depart', 'arrive']);
  });

  it('reports a rounded corner once, as its sharpest bend', () => {
    // 0 -> 45 -> 90 over two 10 m legs is one right turn, not two.
    const cues = deriveRouteCues(
      walk([
        [0, 200],
        [45, 10],
        [90, 200],
      ])
    );
    expect(
      cues.filter((c) => c.kind !== 'depart' && c.kind !== 'arrive')
    ).toHaveLength(1);
  });
});

describe('toWatchRoutePayload', () => {
  const route = (
    points: RoutePoint[],
    cues: Route['cues'] = []
  ): Pick<Route, 'id' | 'name' | 'points' | 'cues'> => ({
    id: 'r1',
    name: 'Loop',
    points,
    cues,
  });

  it('is null for a route with no line', () => {
    expect(toWatchRoutePayload(route([at(0, 0)]))).toBeNull();
  });

  it('packs coordinates as flat whole millionths of a degree', () => {
    const payload = toWatchRoutePayload(
      route([
        { lat: 51.5, lon: -0.12, alt: 30 },
        { lat: 51.5009, lon: -0.1189 },
      ])
    );
    expect(payload?.points).toEqual([
      51_500_000, -120_000, 51_500_900, -118_900,
    ]);
    expect(payload?.points.every(Number.isInteger)).toBe(true);
  });

  it('keeps the route’s own cues, in point order, dropping empty text', () => {
    const points = walk([[0, 100]]);
    const payload = toWatchRoutePayload(
      route(points, [
        { index: 5, kind: 'left', text: 'Turn left onto Mill Lane' },
        { index: 0, kind: 'depart', text: '' },
        { index: points.length - 1, kind: 'arrive' },
      ])
    );
    expect(payload?.cues).toEqual([
      { index: 0, kind: 'depart' },
      { index: 5, kind: 'left', text: 'Turn left onto Mill Lane' },
      { index: points.length - 1, kind: 'arrive' },
    ]);
  });

  it('derives cues when the route has none', () => {
    const payload = toWatchRoutePayload(
      route(
        walk([
          [0, 200],
          [90, 200],
        ])
      )
    );
    expect(payload?.cues.map((c) => c.kind)).toEqual([
      'depart',
      'right',
      'arrive',
    ]);
  });

  it('thins a route over the point cap and re-points its cues', () => {
    // 3000 points on a gentle zigzag so simplification has something to do.
    const points = Array.from({ length: 3000 }, (_, i) =>
      at(i * 5, Math.sin(i / 40) * 80)
    );
    const payload = toWatchRoutePayload(
      route(points, [
        { index: 0, kind: 'depart' },
        { index: 1500, kind: 'left' },
        { index: 2999, kind: 'arrive' },
      ])
    );
    const count = (payload?.points.length ?? 0) / 2;
    expect(count).toBeLessThanOrEqual(WATCH_ROUTE_MAX_POINTS);
    expect(payload?.cues.map((c) => c.kind)).toEqual([
      'depart',
      'left',
      'arrive',
    ]);
    expect(payload?.cues[2].index).toBe(count - 1);
    for (const cue of payload?.cues ?? []) {
      expect(cue.index).toBeLessThan(count);
    }
  });

  it('keeps a full-size route well inside the transfer budget', () => {
    const points = Array.from({ length: WATCH_ROUTE_MAX_POINTS }, (_, i) =>
      at(i * 5, Math.sin(i / 40) * 80)
    );
    const payload = toWatchRoutePayload(route(points));
    // ~5 bytes a number in a binary property list.
    expect((payload?.points.length ?? 0) * 5).toBeLessThan(25_000);
  });
});
