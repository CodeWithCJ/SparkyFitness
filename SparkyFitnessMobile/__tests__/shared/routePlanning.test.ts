import {
  DEFAULT_ROUTE_STYLE,
  buildFollowRoadsRequest,
  buildLoopRequest,
  followRoadsKey,
  generateRouteBodySchema,
  generateRouteResponseSchema,
  hasRouteStyleControls,
  isDefaultRouteStyle,
  labelRouteOptions,
  resolveRouteGenerateCapabilities,
  restrictRouteStyle,
  routeOverlapFraction,
  routesAreDistinct,
  type RoutePoint,
} from '@workspace/shared';

const line = (
  from: [number, number],
  to: [number, number],
  steps = 20
): RoutePoint[] =>
  Array.from({ length: steps + 1 }, (_, i) => ({
    lat: from[0] + ((to[0] - from[0]) * i) / steps,
    lon: from[1] + ((to[1] - from[1]) * i) / steps,
  }));

describe('route overlap', () => {
  const north = line([40, -74], [40.02, -74]);

  it('is 1 for the same line even when one is sampled more densely', () => {
    expect(routeOverlapFraction(north, line([40, -74], [40.02, -74], 3))).toBe(
      1
    );
  });

  it('is 0 for lines far apart and partial for a partly shared line', () => {
    expect(routeOverlapFraction(north, line([40, -73.9], [40.02, -73.9]))).toBe(
      0
    );
    const half = routeOverlapFraction(north, line([40, -74], [40.01, -74]));
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
  });

  it('is 0 for degenerate input', () => {
    expect(routeOverlapFraction([], north)).toBe(0);
    expect(routeOverlapFraction(north, [north[0] as RoutePoint])).toBe(0);
  });

  it('treats a route and its reverse as the same shape', () => {
    expect(routesAreDistinct(north, [...north].reverse())).toBe(false);
  });

  it('treats a route that only starts the same way as distinct', () => {
    const turnEast = [
      ...line([40, -74], [40.003, -74]),
      ...line([40.003, -74], [40.003, -73.98]),
    ];
    expect(routesAreDistinct(north, turnEast)).toBe(true);
  });

  it('does not treat a short out-and-back inside a long route as the same', () => {
    const shortBit = line([40, -74], [40.002, -74]);
    // All of the short one is on the long one, but not the other way round.
    expect(routesAreDistinct(north, shortBit)).toBe(true);
  });
});

describe('labelRouteOptions', () => {
  const o = (
    distanceM: number,
    gain: number | null,
    trail: number | null = null
  ) => ({
    distanceM,
    elevationGainM: gain,
    trailShare: trail,
  });

  it('labels nothing for a single route', () => {
    expect(labelRouteOptions([o(5000, 40)])).toEqual([null]);
  });

  it('labels the clearly flatter, the clearly shorter and the trailiest', () => {
    expect(
      labelRouteOptions([
        o(5000, 120, 0.1),
        o(5100, 40, 0.1),
        o(4500, 110, 0.6),
      ])
    ).toEqual([null, 'flatter', 'moreTrail']);
  });

  it('gives the shortest label when nothing else stands out', () => {
    expect(
      labelRouteOptions([o(5000, null), o(4400, null), o(5050, null)])
    ).toEqual([null, 'shorter', null]);
  });

  it('does not label differences too small to matter', () => {
    expect(
      labelRouteOptions([
        o(5000, 100, 0.3),
        o(4950, 95, 0.32),
        o(5020, 98, 0.31),
      ])
    ).toEqual([null, null, null]);
  });

  it('does not label climb unless every option reports it', () => {
    expect(labelRouteOptions([o(5000, 300), o(5000, null)])).toEqual([
      null,
      null,
    ]);
  });

  it('needs a real amount of trail for "moreTrail"', () => {
    expect(
      labelRouteOptions([o(5000, null, 0.02), o(5000, null, 0.12)])
    ).toEqual([null, null]);
  });

  it('gives one label per option and each label once', () => {
    const labels = labelRouteOptions([
      o(4000, 20, 0.9),
      o(5200, 150, 0.1),
      o(5300, 160, 0.1),
    ]);
    // The first is flatter, trailier and shorter at once but gets one label.
    expect(labels[0]).toBe('flatter');
    expect(labels.filter((l) => l === 'flatter')).toHaveLength(1);
    expect(labels[1]).toBeNull();
  });
});

describe('route style helpers', () => {
  const style = {
    surface: 'trails' as const,
    hilliness: 'flat' as const,
    avoidSteps: true,
    avoidBusyRoads: true,
  };

  it('knows a default style', () => {
    expect(isDefaultRouteStyle(undefined)).toBe(true);
    expect(isDefaultRouteStyle(DEFAULT_ROUTE_STYLE)).toBe(true);
    expect(isDefaultRouteStyle(style)).toBe(false);
  });

  it('keeps only what the engine supports', () => {
    expect(
      restrictRouteStyle(style, {
        surface: true,
        hilliness: false,
        avoidSteps: false,
        avoidBusyRoads: false,
      })
    ).toEqual({ ...DEFAULT_ROUTE_STYLE, surface: 'trails' });
    expect(
      restrictRouteStyle(style, {
        surface: false,
        hilliness: false,
        avoidSteps: false,
        avoidBusyRoads: false,
      })
    ).toBeUndefined();
    expect(
      restrictRouteStyle(undefined, {
        surface: true,
        hilliness: true,
        avoidSteps: true,
        avoidBusyRoads: true,
      })
    ).toBeUndefined();
  });

  it('shows style controls only when one is supported', () => {
    const none = {
      surface: false,
      hilliness: false,
      avoidSteps: false,
      avoidBusyRoads: false,
    };
    expect(hasRouteStyleControls(none)).toBe(false);
    expect(hasRouteStyleControls({ ...none, avoidSteps: true })).toBe(true);
  });

  it('carries a style into the requests and the follow-roads key', () => {
    const loop = buildLoopRequest({
      start: { lat: 40, lon: -74 },
      activity: 'run',
      shape: 'loop',
      distance: 5,
      unit: 'km',
      bearingDeg: 10,
      style,
      alternatives: 3,
    });
    expect(loop?.style).toEqual(style);
    expect(loop?.alternatives).toBe(3);
    expect(generateRouteBodySchema.safeParse(loop).success).toBe(true);

    const taps = [
      { lat: 40, lon: -74 },
      { lat: 40.01, lon: -74 },
    ];
    expect(buildFollowRoadsRequest(taps, 'run', style)?.style).toEqual(style);
    expect(buildFollowRoadsRequest(taps)?.style).toBeUndefined();
    expect(followRoadsKey(taps, 'run', style)).not.toBe(
      followRoadsKey(taps, 'run')
    );
    expect(followRoadsKey(taps, 'run')).toBe(
      followRoadsKey(taps, 'run', DEFAULT_ROUTE_STYLE)
    );
  });

  it('defaults to one alternative and no style', () => {
    const loop = buildLoopRequest({
      start: { lat: 40, lon: -74 },
      activity: 'run',
      shape: 'loop',
      distance: 5,
      unit: 'km',
      bearingDeg: 10,
    });
    expect(loop?.alternatives).toBe(1);
    expect(loop && 'style' in loop).toBe(false);
  });
});

describe('route generate contract', () => {
  it('reads an older server’s capabilities as nothing extra', () => {
    expect(resolveRouteGenerateCapabilities({ available: true })).toEqual({
      available: true,
      maxAlternatives: 1,
      style: {
        surface: false,
        hilliness: false,
        avoidSteps: false,
        avoidBusyRoads: false,
      },
      stops: false,
      source: null,
    });
    expect(resolveRouteGenerateCapabilities('nonsense').available).toBe(false);
    expect(resolveRouteGenerateCapabilities(null).available).toBe(false);
  });

  it('bounds alternatives and validates style values', () => {
    const base = {
      mode: 'loop',
      start: { lat: 40, lon: -74 },
      distanceM: 5000,
    };
    expect(
      generateRouteBodySchema.safeParse({ ...base, alternatives: 4 }).success
    ).toBe(false);
    expect(
      generateRouteBodySchema.safeParse({ ...base, alternatives: 0 }).success
    ).toBe(false);
    expect(
      generateRouteBodySchema.safeParse({ ...base, style: { surface: 'mud' } })
        .success
    ).toBe(false);
    const ok = generateRouteBodySchema.parse({
      ...base,
      style: { surface: 'trails' },
    });
    expect(ok).toMatchObject({
      alternatives: 1,
      style: {
        surface: 'trails',
        hilliness: 'any',
        avoidSteps: false,
        avoidBusyRoads: false,
      },
    });
  });

  it('accepts a body without the new fields (older clients)', () => {
    const parsed = generateRouteBodySchema.parse({
      mode: 'waypoints',
      start: { lat: 40, lon: -74 },
      waypoints: [{ lat: 40.01, lon: -74 }],
    });
    expect(parsed).not.toHaveProperty('style');
  });

  it('describes the response with `route` and `options`', () => {
    const route = {
      name: 'x',
      activity: 'run',
      source: 'generated',
      points: [],
      cues: [],
      distanceM: 1,
      elevationGainM: null,
    };
    expect(
      generateRouteResponseSchema.safeParse({
        route,
        options: [{ route, label: 'flatter', trailShare: 0.4 }],
      }).success
    ).toBe(true);
    expect(
      generateRouteResponseSchema.safeParse({ route, options: [] }).success
    ).toBe(false);
  });
});
