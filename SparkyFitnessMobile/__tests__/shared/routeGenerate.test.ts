import {
  ROUTE_FOLLOW_ROADS_MAX_POINTS,
  ROUTE_GENERATE_MAX_WAYPOINTS,
  buildFollowRoadsRequest,
  buildLoopRequest,
  canAddFollowRoadsPoint,
  countRouteTurns,
  followRoadsKey,
  generateDistanceRange,
  limitWaypoints,
  nextBearingDeg,
  routeDistanceToMeters,
  routeGenerateErrorKind,
  type RouteCue,
} from '@workspace/shared';

const tap = (i: number) => ({ lat: 40 + i * 0.001, lon: -100 + i * 0.001 });

describe('follow-roads waypoint building', () => {
  it('needs two taps', () => {
    expect(buildFollowRoadsRequest([])).toBeNull();
    expect(buildFollowRoadsRequest([tap(0)])).toBeNull();
  });

  it('uses the first tap as the start and the rest as ordered waypoints', () => {
    const request = buildFollowRoadsRequest([tap(0), tap(1), tap(2)]);
    expect(request).toEqual({
      mode: 'waypoints',
      start: tap(0),
      activity: 'run',
      waypoints: [tap(1), tap(2)],
      returnToStart: false,
    });
  });

  it('drops altitude and never sends more waypoints than the server takes', () => {
    const taps = Array.from({ length: 60 }, (_, i) => ({ ...tap(i), alt: 5 }));
    const request = buildFollowRoadsRequest(taps);
    expect(request?.waypoints).toHaveLength(ROUTE_GENERATE_MAX_WAYPOINTS);
    expect(request?.waypoints[0]).toEqual(tap(1));
    expect(request?.waypoints.at(-1)).toEqual(tap(59));
    expect(request?.start).toEqual(tap(0));
  });

  it('keeps first and last when thinning, in order', () => {
    const list = Array.from({ length: 30 }, (_, i) => i);
    const thinned = limitWaypoints(list, 5);
    expect(thinned).toHaveLength(5);
    expect(thinned[0]).toBe(0);
    expect(thinned.at(-1)).toBe(29);
    expect([...thinned].sort((a, b) => a - b)).toEqual(thinned);
    expect(limitWaypoints([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it('stops accepting taps at the limit', () => {
    expect(canAddFollowRoadsPoint(ROUTE_FOLLOW_ROADS_MAX_POINTS - 1)).toBe(
      true
    );
    expect(canAddFollowRoadsPoint(ROUTE_FOLLOW_ROADS_MAX_POINTS)).toBe(false);
  });

  it('gives different keys for different taps', () => {
    expect(followRoadsKey([tap(0), tap(1)])).toBe(
      followRoadsKey([tap(0), tap(1)])
    );
    expect(followRoadsKey([tap(0), tap(1)])).not.toBe(
      followRoadsKey([tap(0), tap(2)])
    );
  });
});

describe('routeGenerateErrorKind', () => {
  it.each([
    [422, 'noRoute'],
    [429, 'rateLimited'],
    [502, 'engineError'],
    [504, 'timeout'],
    [503, 'notConfigured'],
    [400, 'invalid'],
    [500, 'unknown'],
    [undefined, 'unknown'],
  ])('maps %s to %s', (status, kind) => {
    expect(routeGenerateErrorKind(status)).toBe(kind);
  });
});

describe('loop requests', () => {
  const base = {
    start: { lat: 1, lon: 2 },
    activity: 'run' as const,
    shape: 'loop' as const,
    unit: 'km' as const,
    bearingDeg: 90,
  };

  it('converts the distance from the person unit', () => {
    expect(buildLoopRequest({ ...base, distance: 5 })?.distanceM).toBe(5000);
    expect(
      buildLoopRequest({ ...base, unit: 'miles', distance: 3 })?.distanceM
    ).toBe(4828);
    expect(routeDistanceToMeters(1, 'miles')).toBeCloseTo(1609.344);
  });

  it('refuses distances the server would reject', () => {
    expect(buildLoopRequest({ ...base, distance: 0.1 })).toBeNull();
    expect(buildLoopRequest({ ...base, distance: 500 })).toBeNull();
    expect(buildLoopRequest({ ...base, distance: Number.NaN })).toBeNull();
  });

  it('reports the range in the person unit', () => {
    expect(generateDistanceRange('km')).toEqual({ min: 0.5, max: 100 });
    expect(generateDistanceRange('miles').max).toBeCloseTo(62.1, 1);
  });
});

describe('nextBearingDeg', () => {
  it('starts anywhere and then turns at least a quarter away', () => {
    expect(nextBearingDeg(null, () => 0.5)).toBe(180);
    expect(nextBearingDeg(0, () => 0)).toBe(90);
    expect(nextBearingDeg(300, () => 0.5)).toBe(120);
    for (const r of [0, 0.3, 0.99]) {
      const next = nextBearingDeg(45, () => r);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(360);
    }
  });
});

describe('countRouteTurns', () => {
  it('counts turns, not depart, arrive or straight', () => {
    const cues: RouteCue[] = [
      { index: 0, kind: 'depart' },
      { index: 3, kind: 'straight' },
      { index: 5, kind: 'left' },
      { index: 9, kind: 'uturn' },
      { index: 12, kind: 'arrive' },
    ];
    expect(countRouteTurns(cues)).toBe(2);
  });
});
