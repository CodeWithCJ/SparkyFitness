import { describe, expect, it } from 'vitest';
import { generateRoute } from '../services/routeGenerationService.js';
import {
  RoutingProviderError,
  type RoutingCapabilities,
  type RoutingProvider,
  type RoutingRequest,
} from '../services/routing/routingProvider.js';
import { routeDistanceMeters } from '@workspace/shared';

const START = { lat: 40, lon: -74 };

const FULL_SUPPORT: RoutingCapabilities = {
  style: {
    surface: true,
    hilliness: true,
    avoidSteps: true,
    avoidBusyRoads: true,
  },
  maxAlternatives: 3,
};

interface FakeOptions {
  capabilities?: RoutingCapabilities;
  calls?: RoutingRequest[];
  /** Replaces the straight-line answer for a request. */
  shape?: (req: RoutingRequest) => { lat: number; lon: number; alt?: number }[];
  failWhen?: (req: RoutingRequest) => boolean;
  trailShare?: (req: RoutingRequest) => number | null;
}

function fakeProvider(options: FakeOptions = {}): RoutingProvider {
  return {
    kind: 'fake',
    capabilities: options.capabilities ?? FULL_SUPPORT,
    async route(req) {
      options.calls?.push(req);
      if (options.failWhen?.(req)) {
        throw new RoutingProviderError('unreachable', 'down');
      }
      const points = options.shape
        ? options.shape(req)
        : req.locations.map((l) => ({ ...l }));
      return {
        points,
        cues: [
          { index: 0, kind: 'depart' as const },
          { index: points.length - 1, kind: 'arrive' as const },
        ],
        distanceM: routeDistanceMeters(points),
        trailShare: options.trailShare?.(req),
      };
    },
  };
}

const loop = (extra: Record<string, unknown> = {}) => ({
  mode: 'loop' as const,
  start: START,
  distanceM: 6000,
  shape: 'loop' as const,
  activity: 'run' as const,
  alternatives: 3,
  ...extra,
});

describe('route alternatives', () => {
  it('returns up to three genuinely different loops, the first as `route`', async () => {
    const response = await generateRoute(fakeProvider(), loop());
    expect(response.options).toHaveLength(3);
    expect(response.route).toEqual(response.options[0].route);
    const [a, b, c] = response.options.map((o) => o.route.points);
    // Different shapes: each pair's far point is in a different place.
    const far = (points: typeof a) =>
      points.reduce((best, p) =>
        Math.hypot(p.lat - START.lat, p.lon - START.lon) >
        Math.hypot(best.lat - START.lat, best.lon - START.lon)
          ? p
          : best
      );
    expect(far(a)).not.toEqual(far(b));
    expect(far(b)).not.toEqual(far(c));
  });

  it('asks for one route when alternatives is 1, as before', async () => {
    const calls: RoutingRequest[] = [];
    const response = await generateRoute(
      fakeProvider({ calls }),
      loop({ alternatives: 1, bearingDeg: 90 })
    );
    expect(response.options).toHaveLength(1);
    expect(response.options[0].label).toBeNull();
    // Surface is only measured when there is something to compare.
    expect(calls.every((c) => !c.measureSurface)).toBe(true);
  });

  it('never asks for more candidates than the engine supports', async () => {
    const response = await generateRoute(
      fakeProvider({ capabilities: { ...FULL_SUPPORT, maxAlternatives: 2 } }),
      loop()
    );
    expect(response.options).toHaveLength(2);
  });

  it('drops a candidate that repeats an earlier one and tries another heading', async () => {
    const calls: RoutingRequest[] = [];
    let n = 0;
    const response = await generateRoute(
      fakeProvider({
        calls,
        // The engine ignores the heading for the first three answers (same
        // line) and then returns straight lines again.
        shape: (req) =>
          n++ < 3
            ? [START, { lat: 40.02, lon: -74 }, START]
            : req.locations.map((l) => ({ ...l })),
      }),
      loop({ bearingDeg: 0 })
    );
    // The three identical answers collapse to one, and the extra headings
    // made up some of the number.
    expect(calls.length).toBeGreaterThan(3);
    expect(response.options.length).toBeGreaterThan(1);
    const [first, second] = response.options;
    expect(first.route.points).not.toEqual(second.route.points);
  });

  it('keeps the candidates that worked when one heading fails', async () => {
    let n = 0;
    const response = await generateRoute(
      fakeProvider({ failWhen: () => n++ === 1 }),
      loop()
    );
    expect(response.options.length).toBeGreaterThanOrEqual(2);
  });

  it('stops asking for surface data once a measurement comes back empty', async () => {
    const calls: RoutingRequest[] = [];
    await generateRoute(
      fakeProvider({
        calls,
        trailShare: () => null,
        // Always too short, so every heading resizes.
        shape: (req) => req.locations.slice(0, 2).map((l) => ({ ...l })),
      }),
      loop({ bearingDeg: 0 })
    );
    const measured = calls.filter((c) => c.measureSurface);
    // Only the parallel first attempts ask; the resizes and fallbacks do not.
    expect(measured.length).toBeLessThanOrEqual(3);
    expect(calls.length).toBeGreaterThan(measured.length);
  });

  it('does not try further headings once the engine is failing', async () => {
    const calls: RoutingRequest[] = [];
    await expect(
      generateRoute(fakeProvider({ calls, failWhen: () => true }), loop())
    ).rejects.toMatchObject({ kind: 'unreachable' });
    expect(calls).toHaveLength(3);
  });

  it('fails with the engine error when every heading fails', async () => {
    await expect(
      generateRoute(fakeProvider({ failWhen: () => true }), loop())
    ).rejects.toMatchObject({ kind: 'unreachable' });
  });

  it('labels a candidate only when its numbers stand out', async () => {
    const response = await generateRoute(
      fakeProvider({
        // Heading north-east climbs; the others are flat.
        shape: (req) =>
          req.locations.map((l, i) => ({
            ...l,
            alt: l.lon > START.lon + 1e-4 ? (i % 2) * 60 : 0,
          })),
        trailShare: () => null,
      }),
      loop({ bearingDeg: 0 })
    );
    const labels = response.options.map((o) => o.label);
    expect(labels).toContain('flatter');
    const climbs = response.options.map((o) => o.route.elevationGainM);
    const flatterIndex = labels.indexOf('flatter');
    expect(climbs[flatterIndex]).toBe(Math.min(...(climbs as number[])));
  });

  it('measures the surface of several candidates and labels the trailiest', async () => {
    let n = 0;
    const shares = [0.1, 0.8, 0.15];
    const calls: RoutingRequest[] = [];
    const response = await generateRoute(
      fakeProvider({ calls, trailShare: () => shares[n++ % 3] }),
      loop({ bearingDeg: 0 })
    );
    expect(calls.every((c) => c.measureSurface)).toBe(true);
    const trailiest = response.options.find((o) => o.label === 'moreTrail');
    expect(trailiest?.trailShare).toBe(0.8);
  });
});

describe('route style', () => {
  it('passes the preferences the engine supports and drops the rest', async () => {
    const calls: RoutingRequest[] = [];
    await generateRoute(
      fakeProvider({
        calls,
        capabilities: {
          maxAlternatives: 1,
          style: {
            surface: true,
            hilliness: false,
            avoidSteps: false,
            avoidBusyRoads: true,
          },
        },
      }),
      {
        mode: 'waypoints',
        start: START,
        waypoints: [{ lat: 40.01, lon: -74 }],
        returnToStart: false,
        activity: 'run',
        style: {
          surface: 'trails',
          hilliness: 'flat',
          avoidSteps: true,
          avoidBusyRoads: true,
        },
      }
    );
    expect(calls[0].style).toEqual({
      surface: 'trails',
      hilliness: 'any',
      avoidSteps: false,
      avoidBusyRoads: true,
    });
  });

  it('sends no style at all when nothing is supported or asked for', async () => {
    const calls: RoutingRequest[] = [];
    await generateRoute(
      fakeProvider({
        calls,
        capabilities: {
          ...FULL_SUPPORT,
          style: {
            surface: false,
            hilliness: false,
            avoidSteps: false,
            avoidBusyRoads: false,
          },
        },
      }),
      {
        mode: 'waypoints',
        start: START,
        waypoints: [{ lat: 40.01, lon: -74 }],
        returnToStart: false,
        activity: 'run',
        style: {
          surface: 'trails',
          hilliness: 'flat',
          avoidSteps: true,
          avoidBusyRoads: true,
        },
      }
    );
    expect(calls[0].style).toBeUndefined();
  });

  it('applies the style to every loop attempt', async () => {
    const calls: RoutingRequest[] = [];
    await generateRoute(
      fakeProvider({ calls }),
      loop({
        style: {
          surface: 'roads',
          hilliness: 'any',
          avoidSteps: false,
          avoidBusyRoads: false,
        },
      })
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.style?.surface === 'roads')).toBe(true);
  });
});

describe('route alternatives on large engine answers', () => {
  it('handles three candidates of 50,000 points each in bounded time', async () => {
    // The bound is generous for slow CI runners; the work is a few hundred ms.
    const big = (req: RoutingRequest) => {
      const [from, ...rest] = req.locations;
      const to = rest[Math.floor(rest.length / 2)] ?? from;
      return Array.from({ length: 50_000 }, (_, i) => ({
        lat: from.lat + ((to.lat - from.lat) * i) / 50_000,
        lon: from.lon + ((to.lon - from.lon) * i) / 50_000,
      }));
    };
    const started = performance.now();
    const response = await generateRoute(
      fakeProvider({ shape: big }),
      loop({ distanceM: 8000 })
    );
    expect(performance.now() - started).toBeLessThan(15_000);
    expect(response.options.length).toBeGreaterThanOrEqual(1);
    for (const option of response.options) {
      expect(option.route.points.length).toBeLessThanOrEqual(2000);
    }
  });
});
