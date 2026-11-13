import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import axios from 'axios';
import errorHandler from '../middleware/errorHandler.js';
import routeRoutes, { generateRateLimiter } from '../routes/v2/routeRoutes.js';
import { generateRoute } from '../services/routeGenerationService.js';
import {
  ROUTING_REQUEST_TIMEOUT_MS,
  resolveRoutingProvider,
} from '../services/routing/routingConfig.js';
import externalProviderRepository from '../models/externalProviderRepository.js';
import { resolveIsAdminByUserId } from '../utils/adminCheck.js';
import {
  RoutingProviderError,
  type RoutingProvider,
  type RoutingRequest,
} from '../services/routing/routingProvider.js';
import { createValhallaProvider } from '../services/routing/valhallaProvider.js';
import { destinationPoint } from '../services/routing/loopPlanner.js';
import { routeDistanceMeters } from '@workspace/shared';

vi.mock('../models/routeRepository.js', () => ({
  listRoutes: vi.fn(),
  getRoute: vi.fn(),
  createRoute: vi.fn(),
  updateRoute: vi.fn(),
  deleteRoute: vi.fn(),
  getActivityTrack: vi.fn(),
  InvalidRouteError: class InvalidRouteError extends Error {},
  RouteLimitError: class RouteLimitError extends Error {},
  ActivityHasNoRouteError: class ActivityHasNoRouteError extends Error {},
}));
vi.mock('../models/externalProviderRepository.js', () => ({
  default: { getActiveProviderWithKeyByType: vi.fn() },
}));
vi.mock('../utils/adminCheck.js', () => ({
  resolveIsAdminByUserId: vi.fn(),
}));
// The real admin-toggle lookup reads the database; the derived policy is the
// same rule without it.
vi.mock('../utils/outboundUrlPolicy.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/outboundUrlPolicy.js')>();
  return {
    ...actual,
    resolveFoodProviderNetworkPolicy: async (isAdmin: boolean) =>
      actual.deriveFoodProviderNetworkPolicy(isAdmin),
  };
});
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    ...actual,
    default: { ...actual.default, post: vi.fn() },
  };
});

const START = { lat: 40, lon: -74 };

const NO_STYLE_SUPPORT = {
  style: {
    surface: false,
    hilliness: false,
    avoidSteps: false,
    avoidBusyRoads: false,
  },
  maxAlternatives: 1,
};

const providerLookup =
  externalProviderRepository.getActiveProviderWithKeyByType;

/** A provider that follows the given locations in straight lines. */
function straightLineProvider(
  scale = 1,
  calls: RoutingRequest[] = []
): RoutingProvider {
  return {
    kind: 'fake',
    capabilities: NO_STYLE_SUPPORT,
    async route(req) {
      calls.push(req);
      const points = req.locations.map((l) => ({ ...l }));
      return {
        points,
        cues: [
          { index: 0, kind: 'depart' as const },
          { index: points.length - 1, kind: 'arrive' as const },
        ],
        distanceM: routeDistanceMeters(points) * scale,
      };
    },
  };
}

describe('generateRoute', () => {
  it('routes through waypoints in order and returns a savable preview', async () => {
    const calls: RoutingRequest[] = [];
    const waypoints = [
      { lat: 40.01, lon: -74 },
      { lat: 40.01, lon: -74.01 },
    ];
    const { route } = await generateRoute(straightLineProvider(1, calls), {
      mode: 'waypoints',
      start: START,
      waypoints,
      returnToStart: true,
      activity: 'walk',
    });
    expect(calls[0].locations).toEqual([START, ...waypoints, START]);
    expect(calls[0].activity).toBe('walk');
    expect(route.source).toBe('generated');
    expect(route.name).toMatch(/^Generated .* km walk$/);
    expect(route.cues.map((c) => c.kind)).toEqual(['depart', 'arrive']);
    expect(route.distanceM).toBeGreaterThan(2000);
  });

  it('uses the requested name', async () => {
    const { route } = await generateRoute(straightLineProvider(), {
      mode: 'waypoints',
      start: START,
      waypoints: [{ lat: 40.01, lon: -74 }],
      returnToStart: false,
      activity: 'run',
      name: 'Mine',
    });
    expect(route.name).toBe('Mine');
  });

  it('resizes a loop that comes back too long, then stops within tolerance', async () => {
    const calls: RoutingRequest[] = [];
    // The "engine" returns 1.6x the straight-line distance of what it is asked.
    const { route } = await generateRoute(straightLineProvider(1.6, calls), {
      mode: 'loop',
      start: START,
      distanceM: 5000,
      shape: 'loop',
      bearingDeg: 90,
      activity: 'run',
      alternatives: 1,
    });
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.length).toBeLessThanOrEqual(3);
    // Loops start and end at the start point.
    expect(calls[0].locations[0]).toEqual(START);
    expect(calls[0].locations.at(-1)).toEqual(START);
    // The returned distance is the straight-line track, i.e. engine/1.6; the
    // provider-reported distance is what drives the resize.
    expect(route.distanceM).toBeGreaterThan(0);
    const last = calls.at(-1)!.locations;
    const first = calls[0].locations;
    expect(routeDistanceMeters(last)).toBeLessThan(routeDistanceMeters(first));
  });

  it('plans an out-and-back with the turnaround on the bearing', async () => {
    const calls: RoutingRequest[] = [];
    await generateRoute(straightLineProvider(1.3, calls), {
      mode: 'loop',
      start: START,
      distanceM: 6000,
      shape: 'out_and_back',
      bearingDeg: 0,
      activity: 'ride',
      alternatives: 1,
    });
    const [from, turn, back] = calls[0].locations;
    expect(from).toEqual(START);
    expect(back).toEqual(START);
    expect(turn.lon).toBeCloseTo(START.lon, 5);
    expect(turn.lat).toBeGreaterThan(START.lat);
  });

  it('propagates provider failures', async () => {
    const provider: RoutingProvider = {
      kind: 'fake',
      capabilities: NO_STYLE_SUPPORT,
      route: () =>
        Promise.reject(
          new RoutingProviderError('timeout', 'The routing engine timed out')
        ),
    };
    await expect(
      generateRoute(provider, {
        mode: 'waypoints',
        start: START,
        waypoints: [{ lat: 40.01, lon: -74 }],
        returnToStart: false,
        activity: 'run',
      })
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('destinationPoint', () => {
  it('moves the requested distance', () => {
    const p = destinationPoint(START, 90, 1000);
    expect(routeDistanceMeters([START, p])).toBeCloseTo(1000, 0);
  });
});

describe('Valhalla provider over HTTP (axios mocked)', () => {
  const post = vi.mocked(axios.post);
  beforeEach(() => {
    post.mockReset();
  });
  const engine = () =>
    createValhallaProvider({
      baseUrl: 'http://valhalla:8002/',
      apiKey: 'super-secret-key',
      timeoutMs: ROUTING_REQUEST_TIMEOUT_MS,
    });

  const axiosError = (
    code: string | undefined,
    status?: number,
    data?: unknown
  ) =>
    Object.assign(new Error('boom'), {
      isAxiosError: true,
      code,
      response: status ? { status, data } : undefined,
    });

  const req: RoutingRequest = {
    locations: [START, { lat: 40.01, lon: -74 }],
    activity: 'ride',
  };

  it('sends costing, via types and the key as a param, and maps the answer', async () => {
    post.mockImplementation(async (url: string) => {
      if (url.endsWith('/route')) {
        return {
          data: {
            trip: {
              summary: { length: 1.11 },
              legs: [
                {
                  shape: '_c`|@_gayB_c`|@?',
                  maneuvers: [{ type: 1, length: 1.11, begin_shape_index: 0 }],
                },
              ],
            },
          },
        };
      }
      throw axiosError('ECONNREFUSED'); // no /height: elevation is optional
    });
    const result = await engine().route(req);
    const [url, body, config] = post.mock.calls[0] as [
      string,
      { costing: string },
      { params: unknown },
    ];
    expect(url).toBe('http://valhalla:8002/route');
    expect(body.costing).toBe('bicycle');
    expect(config.params).toEqual({ api_key: 'super-secret-key' });
    expect(result.distanceM).toBeCloseTo(1110);
    expect(result.cues[0].kind).toBe('depart');
    expect(result.points.every((p) => p.alt === undefined)).toBe(true);
  });

  const routeAnswer = {
    data: {
      trip: {
        summary: { length: 1.11 },
        legs: [
          {
            shape: '_c`|@_gayB_c`|@?',
            maneuvers: [{ type: 1, length: 1.11, begin_shape_index: 0 }],
          },
        ],
      },
    },
  };

  it('sends costing options for the style, and none without one', async () => {
    post.mockImplementation(async (url: string) => {
      if (url.endsWith('/route')) return routeAnswer;
      throw axiosError('ECONNREFUSED');
    });
    await engine().route({ ...req, activity: 'run' });
    const plain = post.mock.calls[0][1] as { costing_options?: unknown };
    expect(plain.costing_options).toBeUndefined();

    post.mockClear();
    await engine().route({
      ...req,
      activity: 'run',
      style: {
        surface: 'trails',
        hilliness: 'flat',
        avoidSteps: true,
        avoidBusyRoads: false,
      },
    });
    const styled = post.mock.calls[0][1] as {
      costing_options: { pedestrian: Record<string, number> };
    };
    expect(styled.costing_options.pedestrian).toMatchObject({
      use_hills: 0,
      use_tracks: 1,
      step_penalty: 600,
    });
  });

  it('measures the trail share only when asked, and survives it failing', async () => {
    post.mockImplementation(async (url: string) => {
      if (url.endsWith('/route')) return routeAnswer;
      if (url.endsWith('/trace_attributes')) {
        return {
          data: {
            edges: [
              { length: 0.5, use: 'path' },
              { length: 0.5, use: 'road', surface: 'paved' },
            ],
          },
        };
      }
      throw axiosError('ECONNREFUSED');
    });
    const without = await engine().route(req);
    expect(without.trailShare).toBeUndefined();
    const measured = await engine().route({ ...req, measureSurface: true });
    expect(measured.trailShare).toBeCloseTo(0.5);

    post.mockImplementation(async (url: string) => {
      if (url.endsWith('/route')) return routeAnswer;
      throw axiosError('ECONNREFUSED');
    });
    const failed = await engine().route({ ...req, measureSurface: true });
    expect(failed.trailShare).toBeNull();
    expect(failed.distanceM).toBeCloseTo(1110);
  });

  it.each([
    [axiosError('ECONNABORTED'), 'timeout'],
    [axiosError('ECONNREFUSED'), 'unreachable'],
    [axiosError(undefined, 400, { error_code: 442 }), 'no_route'],
    [axiosError(undefined, 401), 'rejected'],
    [axiosError(undefined, 503), 'unreachable'],
  ])('maps a failure to %#', async (error, kind) => {
    post.mockRejectedValue(error);
    await expect(engine().route(req)).rejects.toMatchObject({
      kind,
    });
  });

  it('never puts the API key in an error message', async () => {
    post.mockRejectedValue(axiosError(undefined, 403));
    const failure = await engine()
      .route(req)
      .catch((e) => e);
    expect(String(failure.message)).not.toContain('super-secret-key');
  });

  it('refuses an answer with an oversized shape or too many legs', async () => {
    const leg = (shape: string) => ({
      shape,
      maneuvers: [{ type: 1, length: 1.11, begin_shape_index: 0 }],
    });
    const answer = (legs: unknown[]) => ({
      data: { trip: { summary: { length: 1 }, legs } },
    });
    post.mockResolvedValue(answer([leg('?'.repeat(400_001))]));
    await expect(engine().route(req)).rejects.toMatchObject({
      kind: 'bad_response',
    });
    post.mockResolvedValue(
      answer(Array.from({ length: 23 }, () => leg('_c`|@_gayB')))
    );
    await expect(engine().route(req)).rejects.toMatchObject({
      kind: 'bad_response',
    });
    // Within the limits but decoding to too many points once joined.
    post.mockResolvedValue(
      answer(Array.from({ length: 22 }, () => leg('??'.repeat(200_000))))
    );
    await expect(engine().route(req)).rejects.toMatchObject({
      kind: 'bad_response',
    });
  });

  // Zod records an issue object for every bad array entry, so validating
  // first costs memory in proportion to the entries, not the bytes. The
  // answer is counted before it is validated. Measured at a few milliseconds
  // here; the bound is far above that for slow CI runners and far below the
  // seconds (and gigabytes at 2.8M entries) the unguarded schema takes.
  it('refuses an answer packed with tiny bad legs without validating them', async () => {
    const tiny = {};
    post.mockResolvedValue({
      data: {
        trip: {
          summary: { length: 1 },
          legs: Array.from({ length: 500_000 }, () => tiny),
        },
      },
    });
    const started = performance.now();
    await expect(engine().route(req)).rejects.toMatchObject({
      kind: 'bad_response',
    });
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('refuses a surface answer with too many edges without validating it', async () => {
    post.mockImplementation(async (url: string) => {
      if (url.endsWith('/route')) return routeAnswer;
      if (url.endsWith('/trace_attributes')) {
        // Bad entries, so the schema would record an issue object for each.
        return {
          data: { edges: Array.from({ length: 2_000_000 }, () => 'x') },
        };
      }
      throw axiosError('ECONNREFUSED');
    });
    const started = performance.now();
    const result = await engine().route({ ...req, measureSurface: true });
    expect(result.trailShare).toBeNull();
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('refuses an elevation answer longer than the route without validating it', async () => {
    post.mockImplementation(async (url: string) => {
      if (url.endsWith('/route')) {
        return {
          data: {
            trip: {
              summary: { length: 1.11 },
              legs: [
                {
                  shape: '_c`|@_gayB_c`|@?',
                  maneuvers: [{ type: 1, length: 1.11, begin_shape_index: 0 }],
                },
              ],
            },
          },
        };
      }
      // Bad entries, so the schema would record an issue object for each.
      return { data: { height: Array.from({ length: 2_000_000 }, () => 'x') } };
    });
    const started = performance.now();
    const result = await engine().route(req);
    expect(result.points.every((p) => p.alt === undefined)).toBe(true);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('rejects an unreadable response', async () => {
    post.mockResolvedValue({ data: { nope: true } });
    await expect(engine().route(req)).rejects.toMatchObject({
      kind: 'bad_response',
    });
  });
});

describe('route generation endpoints', () => {
  const post = vi.mocked(axios.post);
  let actingAs = 'test-user-id';
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res, next: express.NextFunction) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = actingAs;
    req.originalUserId = actingAs;
    next();
  });
  app.use('/api/v2/routes', routeRoutes);
  app.use(errorHandler);

  const body = {
    mode: 'waypoints',
    start: START,
    waypoints: [{ lat: 40.01, lon: -74 }],
  };
  const providerRow = {
    id: 'p1',
    user_id: 'test-user-id',
    provider_name: 'My routing',
    base_url: 'https://valhalla.example.org',
    app_key: null,
  };

  beforeEach(() => {
    post.mockReset();
    vi.mocked(providerLookup)
      .mockReset()
      .mockImplementation(async (_user, type) =>
        type === 'valhalla' ? providerRow : null
      );
    vi.mocked(resolveIsAdminByUserId).mockReset().mockResolvedValue(true);
    generateRateLimiter.reset();
    actingAs = 'test-user-id';
  });

  const engineAnswer = {
    data: {
      trip: {
        summary: { length: 1.1 },
        legs: [
          { shape: '_c`|@_gayB_c`|@?', maneuvers: [{ type: 1, length: 1.1 }] },
        ],
      },
    },
  };

  it('reports availability from config', async () => {
    let res = await request(app).get('/api/v2/routes/generate/capabilities');
    expect(res.body).toEqual({
      available: true,
      maxAlternatives: 3,
      style: {
        surface: true,
        hilliness: true,
        avoidSteps: true,
        avoidBusyRoads: true,
      },
      stops: false,
      source: 'provider',
    });
    vi.mocked(providerLookup).mockResolvedValue(null);
    res = await request(app).get('/api/v2/routes/generate/capabilities');
    expect(res.body).toEqual({
      source: null,
      available: false,
      maxAlternatives: 1,
      style: {
        surface: false,
        hilliness: false,
        avoidSteps: false,
        avoidBusyRoads: false,
      },
      stops: false,
    });
  });

  it('returns 503 when not configured', async () => {
    vi.mocked(providerLookup).mockResolvedValue(null);
    const res = await request(app).post('/api/v2/routes/generate').send(body);
    expect(res.status).toBe(503);
  });

  it('returns 400 for an invalid body', async () => {
    const res = await request(app)
      .post('/api/v2/routes/generate')
      .send({ mode: 'loop', start: START, distanceM: 5 });
    expect(res.status).toBe(400);
  });

  it('returns a preview without saving', async () => {
    post.mockResolvedValue(engineAnswer);
    const res = await request(app).post('/api/v2/routes/generate').send(body);
    expect(res.status).toBe(200);
    expect(res.body.route.source).toBe('generated');
    expect(res.body.route.points.length).toBeGreaterThan(1);
    expect(Object.keys(res.body).sort()).toEqual(['options', 'route']);
  });

  it('refuses a delegated context', async () => {
    actingAs = 'someone-else';
    const res = await request(app).post('/api/v2/routes/generate').send(body);
    expect(res.status).toBe(403);
  });

  it.each([
    ['ECONNABORTED', undefined, 504],
    ['ECONNREFUSED', undefined, 502],
    [undefined, 401, 502],
  ])('maps provider failure %s/%s to %i', async (code, status, expected) => {
    post.mockRejectedValue(
      Object.assign(new Error('x'), {
        isAxiosError: true,
        code,
        response: status ? { status } : undefined,
      })
    );
    const res = await request(app).post('/api/v2/routes/generate').send(body);
    expect(res.status).toBe(expected);
  });

  it('maps "no route" to 422', async () => {
    post.mockRejectedValue(
      Object.assign(new Error('x'), {
        isAxiosError: true,
        response: { status: 400, data: { error_code: 442 } },
      })
    );
    const res = await request(app).post('/api/v2/routes/generate').send(body);
    expect(res.status).toBe(422);
  });

  it('rate limits per user', async () => {
    post.mockResolvedValue(engineAnswer);
    for (let i = 0; i < 10; i++) {
      const ok = await request(app).post('/api/v2/routes/generate').send(body);
      expect(ok.status).toBe(200);
    }
    const res = await request(app).post('/api/v2/routes/generate').send(body);
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('routing provider resolution', () => {
  const post = vi.mocked(axios.post);
  const lookup = vi.mocked(providerLookup);
  const isAdmin = vi.mocked(resolveIsAdminByUserId);
  const row = (
    overrides: Partial<{
      id: string;
      user_id: string;
      base_url: string;
      app_key: string | null;
    }> = {}
  ) => ({
    id: 'p1',
    user_id: 'user-a',
    provider_name: 'My routing',
    base_url: 'https://valhalla.example.org',
    app_key: null,
    ...overrides,
  });
  const answer = {
    data: {
      trip: {
        summary: { length: 1.1 },
        legs: [
          { shape: '_c`|@_gayB_c`|@?', maneuvers: [{ type: 1, length: 1.1 }] },
        ],
      },
    },
  };

  beforeEach(() => {
    post.mockReset();
    lookup.mockReset().mockResolvedValue(null);
    isAdmin.mockReset().mockResolvedValue(true);
  });

  it('is unavailable with no provider and no environment fallback', async () => {
    expect(await resolveRoutingProvider('user-a')).toBeNull();
    expect(lookup).toHaveBeenCalledWith('user-a', 'valhalla');
  });

  it('uses the routing provider the person added, without any environment variable', async () => {
    lookup.mockResolvedValue(row({ app_key: 'stadia-key' }));
    post.mockResolvedValue(answer);
    const resolved = await resolveRoutingProvider('user-a');
    expect(resolved?.source).toBe('provider');
    await resolved!.provider.route({
      locations: [START, { lat: 40.01, lon: -74 }],
      activity: 'run',
    });
    const [url, , config] = post.mock.calls[0] as [
      string,
      unknown,
      { params: unknown },
    ];
    expect(url).toBe('https://valhalla.example.org/route');
    expect(config.params).toEqual({ api_key: 'stadia-key' });
  });

  it('identifies itself to the engine in a User-Agent', async () => {
    lookup.mockResolvedValue(row());
    post.mockResolvedValue(answer);
    const resolved = await resolveRoutingProvider('user-a');
    await resolved!.provider.route({
      locations: [START, { lat: 40.01, lon: -74 }],
      activity: 'run',
    });
    const config = post.mock.calls[0][2] as {
      headers: Record<string, string>;
      params: unknown;
    };
    expect(config.headers['User-Agent']).toMatch(/^SparkyFitness\/\S+ \(/);
    expect(config.params).toBeUndefined();
  });

  it("uses the person's provider", async () => {
    lookup.mockResolvedValue(row());
    const resolved = await resolveRoutingProvider('user-a');
    expect(resolved?.source).toBe('provider');
  });

  it('is unavailable when the person has no provider', async () => {
    expect(await resolveRoutingProvider('user-a')).toBeNull();
  });

  it('is unavailable when the lookup fails', async () => {
    lookup.mockRejectedValue(new Error('db down'));
    expect(await resolveRoutingProvider('user-a')).toBeNull();
  });

  it("resolves per user: one person's provider never serves another", async () => {
    lookup.mockImplementation(async (userId: string) =>
      userId === 'user-a' ? row({ base_url: 'https://a.example.org' }) : null
    );
    post.mockResolvedValue(answer);
    expect(await resolveRoutingProvider('user-b')).toBeNull();
    const a = await resolveRoutingProvider('user-a');
    await a!.provider.route({
      locations: [START, { lat: 40.01, lon: -74 }],
      activity: 'run',
    });
    expect((post.mock.calls[0] as unknown[])[0]).toBe(
      'https://a.example.org/route'
    );
  });

  it('reads a URL without a scheme as https', async () => {
    lookup.mockResolvedValue(row({ base_url: 'valhalla.example.org' }));
    post.mockResolvedValue(answer);
    const resolved = await resolveRoutingProvider('user-a');
    await resolved!.provider.route({
      locations: [START, { lat: 40.01, lon: -74 }],
      activity: 'run',
    });
    expect((post.mock.calls[0] as unknown[])[0]).toBe(
      'https://valhalla.example.org/route'
    );
  });

  it('refuses a stored internal address for a non-admin owner', async () => {
    isAdmin.mockResolvedValue(false);
    lookup.mockResolvedValue(row({ base_url: 'http://10.0.0.5:8002' }));
    expect(await resolveRoutingProvider('user-a')).toBeNull();
  });

  it('allows an internal address for an admin owner', async () => {
    isAdmin.mockResolvedValue(true);
    lookup.mockResolvedValue(row({ base_url: 'http://10.0.0.5:8002' }));
    expect((await resolveRoutingProvider('user-a'))?.source).toBe('provider');
  });

  it('rejects a URL that is not http(s)', async () => {
    lookup.mockResolvedValue(row({ base_url: 'file:///etc/passwd' }));
    expect(await resolveRoutingProvider('user-a')).toBeNull();
  });

  it('never logs or returns the API key in a failure', async () => {
    lookup.mockResolvedValue(row({ app_key: 'stadia-key' }));
    post.mockRejectedValue(
      Object.assign(new Error('boom'), {
        isAxiosError: true,
        response: { status: 403 },
      })
    );
    const resolved = await resolveRoutingProvider('user-a');
    const failure = await resolved!.provider
      .route({
        locations: [START, { lat: 40.01, lon: -74 }],
        activity: 'run',
      })
      .catch((e) => e);
    expect(String(failure.message)).not.toContain('stadia-key');
  });
});

describe('route generation endpoints with a routing provider', () => {
  const post = vi.mocked(axios.post);
  const lookup = vi.mocked(providerLookup);
  let userId = 'user-a';
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res, next: express.NextFunction) => {
    req.userId = userId;
    req.authenticatedUserId = userId;
    req.originalUserId = userId;
    next();
  });
  app.use('/api/v2/routes', routeRoutes);
  app.use(errorHandler);

  beforeEach(() => {
    post.mockReset();
    lookup.mockReset().mockResolvedValue(null);
    vi.mocked(resolveIsAdminByUserId).mockReset().mockResolvedValue(true);
    generateRateLimiter.reset();
    userId = 'user-a';
  });

  it('is available as soon as the provider exists, with no restart', async () => {
    let res = await request(app).get('/api/v2/routes/generate/capabilities');
    expect(res.body).toMatchObject({ available: false, source: null });
    lookup.mockResolvedValue({
      id: 'p1',
      user_id: 'user-a',
      provider_name: 'Valhalla',
      base_url: 'https://valhalla.example.org',
      app_key: null,
    });
    res = await request(app).get('/api/v2/routes/generate/capabilities');
    expect(res.body).toMatchObject({
      available: true,
      maxAlternatives: 3,
      source: 'provider',
    });
  });

  it('answers 503 with a pointer to Settings when the person has no provider', async () => {
    const res = await request(app)
      .post('/api/v2/routes/generate')
      .send({
        mode: 'waypoints',
        start: START,
        waypoints: [{ lat: 40.01, lon: -74 }],
      });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/External Providers/);
  });

  it('keeps the 10-per-10-minutes limit on a provider-backed engine', async () => {
    lookup.mockResolvedValue({
      id: 'p1',
      user_id: 'user-a',
      provider_name: 'Valhalla',
      base_url: 'https://valhalla.example.org',
      app_key: null,
    });
    post.mockResolvedValue({
      data: {
        trip: {
          summary: { length: 1.1 },
          legs: [
            {
              shape: '_c`|@_gayB_c`|@?',
              maneuvers: [{ type: 1, length: 1.1 }],
            },
          ],
        },
      },
    });
    const body = {
      mode: 'waypoints',
      start: START,
      waypoints: [{ lat: 40.01, lon: -74 }],
    };
    for (let i = 0; i < 10; i++) {
      expect(
        (await request(app).post('/api/v2/routes/generate').send(body)).status
      ).toBe(200);
    }
    expect(
      (await request(app).post('/api/v2/routes/generate').send(body)).status
    ).toBe(429);
  });
});
