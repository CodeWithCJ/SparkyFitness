import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import errorHandler from '../middleware/errorHandler.js';
import routeRoutes from '../routes/v2/routeRoutes.js';
import {
  createRoute,
  deleteRoute,
  getActivityTrack,
  getRoute,
  InvalidRouteError,
  listRoutes,
  RouteLimitError,
  updateRoute,
} from '../models/routeRepository.js';

vi.mock('../models/routeRepository.js', () => {
  class InvalidRouteError extends Error {}
  return {
    listRoutes: vi.fn(),
    getRoute: vi.fn(),
    createRoute: vi.fn(),
    updateRoute: vi.fn(),
    deleteRoute: vi.fn(),
    getActivityTrack: vi.fn(),
    InvalidRouteError,
    RouteLimitError: class RouteLimitError extends Error {},
    ActivityHasNoRouteError: class ActivityHasNoRouteError extends Error {},
  };
});

let actingAs = 'test-user-id';
const app = express();
// The same body limit as the real app, so the endpoints' own limits are reached.
app.use(express.json({ limit: '50mb' }));
app.use(
  (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = actingAs;
    req.originalUserId = actingAs;
    next();
  }
);
app.use('/api/v2/routes', routeRoutes);
app.use(errorHandler);

const ID = '3f2b8c1e-1d4a-4b6e-9c1a-0a1b2c3d4e5f';
const points = [
  { lat: 40, lon: -74 },
  { lat: 40.01, lon: -74 },
];
const route = { id: ID, name: 'Loop', points, cues: [] };

beforeEach(() => {
  vi.clearAllMocks();
  actingAs = 'test-user-id';
});

describe('routes API', () => {
  it('refuses a delegated context', async () => {
    actingAs = 'someone-else';
    const res = await request(app).get('/api/v2/routes');
    expect(res.status).toBe(403);
    expect(listRoutes).not.toHaveBeenCalled();
  });

  it('lists routes', async () => {
    vi.mocked(listRoutes).mockResolvedValue([]);
    const res = await request(app).get('/api/v2/routes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ routes: [] });
  });

  it('creates a drawn route and rejects a bad body', async () => {
    vi.mocked(createRoute).mockResolvedValue(route as never);
    const ok = await request(app)
      .post('/api/v2/routes')
      .send({ name: 'Loop', points });
    expect(ok.status).toBe(201);
    expect(createRoute).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({ source: 'drawn', activity: 'run' }),
      actingAs
    );
    const bad = await request(app)
      .post('/api/v2/routes')
      .send({ name: 'x', points: [points[0]] });
    expect(bad.status).toBe(400);
  });

  it('saves a generated route but never lets a client claim gpx or activity', async () => {
    vi.mocked(createRoute).mockResolvedValue(route as never);
    const generated = await request(app)
      .post('/api/v2/routes')
      .send({ name: 'Loop', points, source: 'generated' });
    expect(generated.status).toBe(201);
    expect(createRoute).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({ source: 'generated' }),
      actingAs
    );
    for (const source of ['gpx', 'activity']) {
      const res = await request(app)
        .post('/api/v2/routes')
        .send({ name: 'Loop', points, source });
      expect(res.status).toBe(400);
    }
  });

  it('maps repository errors to statuses', async () => {
    vi.mocked(createRoute).mockRejectedValueOnce(
      new InvalidRouteError('short')
    );
    const short = await request(app)
      .post('/api/v2/routes')
      .send({ name: 'Loop', points });
    expect(short.status).toBe(400);
    vi.mocked(createRoute).mockRejectedValueOnce(new RouteLimitError());
    const limit = await request(app)
      .post('/api/v2/routes')
      .send({ name: 'Loop', points });
    expect(limit.status).toBe(409);
  });

  it('imports GPX and rejects a file without a track', async () => {
    vi.mocked(createRoute).mockResolvedValue(route as never);
    const gpx =
      '<gpx><trk><name>Trail</name><trkseg><trkpt lat="40" lon="-74"/><trkpt lat="40.01" lon="-74"/></trkseg></trk></gpx>';
    const ok = await request(app)
      .post('/api/v2/routes/import-gpx')
      .send({ gpx });
    expect(ok.status).toBe(201);
    expect(createRoute).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({ name: 'Trail', source: 'gpx' }),
      actingAs
    );
    const empty = await request(app)
      .post('/api/v2/routes/import-gpx')
      .send({ gpx: '<gpx></gpx>' });
    expect(empty.status).toBe(400);
  });

  it('saves a recorded activity as a route', async () => {
    vi.mocked(getActivityTrack).mockResolvedValueOnce({
      name: 'Morning run',
      points,
    });
    vi.mocked(createRoute).mockResolvedValue(route as never);
    const ok = await request(app).post(`/api/v2/routes/from-activity/${ID}`);
    expect(ok.status).toBe(201);
    expect(createRoute).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({
        name: 'Morning run',
        source: 'activity',
        sourceExerciseEntryId: ID,
      }),
      actingAs
    );
    vi.mocked(getActivityTrack).mockResolvedValueOnce(null);
    const none = await request(app).post(`/api/v2/routes/from-activity/${ID}`);
    expect(none.status).toBe(404);
    const badId = await request(app).post('/api/v2/routes/from-activity/nope');
    expect(badId.status).toBe(400);
  });

  it('gets, renames, deletes and exports', async () => {
    vi.mocked(getRoute).mockResolvedValue(route as never);
    expect((await request(app).get(`/api/v2/routes/${ID}`)).status).toBe(200);
    expect((await request(app).get('/api/v2/routes/not-a-uuid')).status).toBe(
      404
    );

    vi.mocked(updateRoute).mockResolvedValue(route as never);
    const patched = await request(app)
      .patch(`/api/v2/routes/${ID}`)
      .send({ name: 'New' });
    expect(patched.status).toBe(200);
    expect(
      (await request(app).patch(`/api/v2/routes/${ID}`).send({})).status
    ).toBe(400);

    const replaced = await request(app)
      .patch(`/api/v2/routes/${ID}`)
      .send({ points, cues: [] });
    expect(replaced.status).toBe(200);
    expect(vi.mocked(updateRoute).mock.calls.at(-1)?.[2]).toMatchObject({
      points,
    });
    expect(
      (await request(app).patch(`/api/v2/routes/${ID}`).send({ cues: [] }))
        .status
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch(`/api/v2/routes/${ID}`)
          .send({ points: [points[0]] })
      ).status
    ).toBe(400);

    // A cue has to point at one of the new points.
    const strayCue = await request(app)
      .patch(`/api/v2/routes/${ID}`)
      .send({ points, cues: [{ index: 2, kind: 'left' }] });
    expect(strayCue.status).toBe(400);
    expect(
      (
        await request(app)
          .patch(`/api/v2/routes/${ID}`)
          .send({ points, cues: [{ index: 1, kind: 'left' }] })
      ).status
    ).toBe(200);

    // A line that is too short is the caller's mistake, not a server error.
    vi.mocked(updateRoute).mockRejectedValueOnce(
      new InvalidRouteError('A route needs to be at least 10 m long')
    );
    const tooShort = await request(app)
      .patch(`/api/v2/routes/${ID}`)
      .send({ points });
    expect(tooShort.status).toBe(400);

    vi.mocked(updateRoute).mockResolvedValueOnce(null);
    expect(
      (await request(app).patch(`/api/v2/routes/${ID}`).send({ points })).status
    ).toBe(404);

    vi.mocked(deleteRoute).mockResolvedValueOnce(true);
    expect((await request(app).delete(`/api/v2/routes/${ID}`)).status).toBe(
      204
    );
    vi.mocked(deleteRoute).mockResolvedValueOnce(false);
    expect((await request(app).delete(`/api/v2/routes/${ID}`)).status).toBe(
      404
    );

    const gpx = await request(app).get(`/api/v2/routes/${ID}/gpx`);
    expect(gpx.status).toBe(200);
    expect(gpx.headers['content-type']).toContain('application/gpx+xml');
    expect(gpx.text).toContain('<trkpt lat="40" lon="-74">');
    expect(gpx.headers['content-disposition']).toMatch(
      /^attachment; filename="?[^";]+\.gpx"?/
    );
  });

  it('downloads a route whose name is not Latin-1', async () => {
    vi.mocked(getRoute).mockResolvedValueOnce({
      ...route,
      name: '朝のラン Утро',
    } as never);
    const res = await request(app).get(`/api/v2/routes/${ID}/gpx`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/gpx+xml');
    expect(res.headers['content-disposition']).toMatch(/^attachment;/);
    expect(res.headers['content-disposition']).toContain('filename*=UTF-8');
  });
});

describe('routes API input limits', () => {
  const post = (body: unknown) =>
    request(app).post('/api/v2/routes').send(body);

  it('rejects names that are blank, too long, or not text', async () => {
    for (const name of ['', '   ', 'x'.repeat(101), 5, null]) {
      expect((await post({ name, points })).status).toBe(400);
    }
    expect(createRoute).not.toHaveBeenCalled();
  });

  it('rejects points that are missing, out of range or not numbers', async () => {
    const bad = [
      undefined,
      [],
      [points[0]],
      [points[0], { lat: 91, lon: 0 }],
      [points[0], { lat: 0, lon: -181 }],
      [points[0], { lat: '40', lon: 0 }],
      [points[0], { lat: null, lon: 0 }],
      [points[0], { lat: 0, lon: 0, alt: 20000 }],
      [points[0], {}],
    ];
    for (const list of bad) {
      expect((await post({ name: 'x', points: list })).status).toBe(400);
    }
    expect(createRoute).not.toHaveBeenCalled();
  });

  it('rejects more than the most points a client may send', async () => {
    const many = Array.from({ length: 50001 }, (_, i) => ({
      lat: 40 + (i % 100) / 1000,
      lon: -74,
    }));
    expect((await post({ name: 'x', points: many })).status).toBe(400);
  });

  it('rejects an unknown activity and a field that is not the owner’s to set', async () => {
    expect((await post({ name: 'x', points, activity: 'swim' })).status).toBe(
      400
    );
    vi.mocked(createRoute).mockResolvedValue(route as never);
    await post({ name: 'x', points, user_id: 'other' });
    expect(vi.mocked(createRoute).mock.calls[0]?.[1]).not.toHaveProperty(
      'user_id'
    );
  });

  it('lets a client choose drawn or generated as the source, nothing else', async () => {
    vi.mocked(createRoute).mockResolvedValue(route as never);
    for (const source of ['gpx', 'activity', 'magic']) {
      expect((await post({ name: 'x', points, source })).status).toBe(400);
    }
    expect(createRoute).not.toHaveBeenCalled();
    expect((await post({ name: 'x', points })).status).toBe(201);
    expect(
      (await post({ name: 'x', points, source: 'generated' })).status
    ).toBe(201);
    expect(
      vi.mocked(createRoute).mock.calls.map((call) => call[1].source)
    ).toEqual(['drawn', 'generated']);
  });

  it('cuts an imported name to 100 characters without splitting an emoji', async () => {
    vi.mocked(createRoute).mockResolvedValue(route as never);
    const gpx = `<gpx><trk><name>${'a'.repeat(99)}🏃🏃</name><trkseg>
      <trkpt lat="40" lon="-74"/><trkpt lat="40.01" lon="-74"/></trkseg></trk></gpx>`;
    await request(app).post('/api/v2/routes/import-gpx').send({ gpx });
    const name = vi.mocked(createRoute).mock.calls[0]?.[1].name as string;
    expect(Array.from(name)).toHaveLength(100);
    expect(name.endsWith('🏃')).toBe(true);
    expect(name).not.toMatch(/[\ud800-\udbff]$/);
  });

  it('prefers a name sent with the file over the one inside it', async () => {
    vi.mocked(createRoute).mockResolvedValue(route as never);
    const gpx =
      '<gpx><trk><name>In file</name><trkpt lat="40" lon="-74"/><trkpt lat="40.01" lon="-74"/></trk></gpx>';
    await request(app)
      .post('/api/v2/routes/import-gpx')
      .send({ gpx, name: 'Mine', activity: 'ride' });
    expect(createRoute).toHaveBeenCalledWith(
      'test-user-id',
      expect.objectContaining({ name: 'Mine', activity: 'ride' }),
      actingAs
    );
  });

  it('rejects a missing, empty or oversized GPX body', async () => {
    const send = (body: unknown) =>
      request(app).post('/api/v2/routes/import-gpx').send(body);
    expect((await send({})).status).toBe(400);
    expect((await send({ gpx: '' })).status).toBe(400);
    expect((await send({ gpx: 5 })).status).toBe(400);
    expect((await send({ gpx: 'x'.repeat(10_000_001) })).status).toBe(400);
    expect(createRoute).not.toHaveBeenCalled();
  });

  it('rejects an unknown activity when renaming', async () => {
    const res = await request(app)
      .patch(`/api/v2/routes/${ID}`)
      .send({ activity: 'swim' });
    expect(res.status).toBe(400);
    expect(updateRoute).not.toHaveBeenCalled();
  });

  it('answers 404 for a route id that is not a UUID on every verb', async () => {
    for (const verb of ['get', 'patch', 'delete'] as const) {
      const res = await request(app)[verb]('/api/v2/routes/1%27%3BDROP');
      expect(res.status).toBe(404);
    }
    expect((await request(app).get('/api/v2/routes/x/gpx')).status).toBe(404);
  });

  it('does not hand a stack trace to the client on an unexpected failure', async () => {
    vi.mocked(listRoutes).mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/v2/routes');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('routeRoutes.ts');
  });
});
