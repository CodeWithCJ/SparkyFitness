/**
 * Saved routes — integration test.
 *
 * WHY THIS EXISTS
 * ---------------
 * The route routes are tested with a mocked repository, which cannot prove what
 * lives in Postgres: the owner-only RLS policy, the per-person cap and its lock,
 * the cascade and SET NULL rules, or that the app role has grants on the table.
 * This drives `routeRepository` against a real database through the RLS-enforced
 * `getClient` path, with two people and a delegated context, and checks that what
 * it returns matches the shared response schemas.
 *
 * It seeds and deletes only its own synthetic `@example.test` users. Like the
 * other integration tests it SKIPS when no database is reachable.
 */
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  ROUTE_MAX_PER_USER,
  routeSchema,
  routeSummarySchema,
  type RoutePoint,
} from '@workspace/shared';
import { endPool, getSystemClient } from '../db/poolManager.js';
import {
  ActivityHasNoRouteError,
  createRoute,
  deleteRoute,
  getActivityTrack,
  getRoute,
  InvalidRouteError,
  listRoutes,
  RouteLimitError,
  updateRoute,
} from '../models/routeRepository.js';

async function dbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (
    !process.env.SPARKY_FITNESS_APP_DB_USER ||
    !process.env.SPARKY_FITNESS_DB_HOST
  ) {
    return false;
  }
  const probe = new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_APP_DB_USER,
    password: process.env.SPARKY_FITNESS_APP_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await dbReachable();

const ALICE = '00000000-0000-4000-c000-0000000000a1';
const BOB = '00000000-0000-4000-c000-0000000000b2';
const ENTRY = '00000000-0000-4000-c000-0000000000e1';
const BOB_ENTRY = '00000000-0000-4000-c000-0000000000e2';

const points: RoutePoint[] = Array.from({ length: 30 }, (_, i) => ({
  lat: 40 + i * 0.001,
  lon: -74,
  alt: 10 + i,
}));
const draft = { name: 'Loop', activity: 'run' as const, points };

describe.runIf(RUN)('routeRepository against Postgres', () => {
  const clean = async () => {
    const sys = await getSystemClient();
    try {
      await sys.query('DELETE FROM public.routes WHERE user_id = ANY($1)', [
        [ALICE, BOB],
      ]);
      await sys.query(
        'DELETE FROM public.exercise_entries WHERE user_id = ANY($1)',
        [[ALICE, BOB]]
      );
      await sys.query('DELETE FROM public."user" WHERE id = ANY($1)', [
        [ALICE, BOB],
      ]);
    } finally {
      sys.release();
    }
  };

  beforeAll(async () => {
    await clean();
    const sys = await getSystemClient();
    try {
      for (const id of [ALICE, BOB]) {
        await sys.query(
          'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
          [id, `routes-${id}@example.test`]
        );
      }
      for (const [entry, user] of [
        [ENTRY, ALICE],
        [BOB_ENTRY, BOB],
      ] as const) {
        await sys.query(
          `INSERT INTO public.exercise_entries
             (id, user_id, exercise_name, entry_date, duration_minutes, calories_burned)
           VALUES ($1, $2, 'Morning run', '2026-10-01', 30, 300)`,
          [entry, user]
        );
        await sys.query(
          `INSERT INTO public.exercise_entry_gps_points
             (user_id, exercise_entry_id, entry_date, points)
           VALUES ($1, $2, '2026-10-01', $3::jsonb)`,
          [
            user,
            entry,
            JSON.stringify([
              { t: '2026-10-01T07:00:00Z', lat: 40, lon: -74, alt: 5 },
              { t: '2026-10-01T07:01:00Z', lat: 40.01, lon: -74, alt: -99999 },
              { t: '2026-10-01T07:02:00Z', lat: 400, lon: -74 },
              { t: '2026-10-01T07:03:00Z', lat: 40.02, lon: -74 },
            ]),
          ]
        );
      }
    } finally {
      sys.release();
    }
  });

  afterAll(async () => {
    await clean();
    await endPool();
  });

  it('creates, lists and reads a route in the shape the contract promises', async () => {
    const created = await createRoute(ALICE, { ...draft, source: 'drawn' });
    expect(routeSchema.parse(created)).toEqual(created);
    expect(created.distanceM).toBeGreaterThan(3000);
    // Climbs count in steps of at least 2 m from the last counted height, so the
    // final 1 m of this 29 m rise is not yet a step.
    expect(created.elevationGainM).toBe(28);

    const [summary] = await listRoutes(ALICE);
    expect(summary).toBeDefined();
    expect(routeSummarySchema.parse(summary)).toEqual(summary);
    expect(summary?.pointCount).toBe(created.points.length);
    expect(summary?.start).toEqual(created.points[0]);
    expect(summary).not.toHaveProperty('points');

    expect(await getRoute(ALICE, created.id)).toEqual(created);
  });

  it('keeps one person’s routes from another, including through a delegate', async () => {
    const mine = await createRoute(ALICE, { ...draft, source: 'drawn' });

    expect((await listRoutes(BOB)).map((r) => r.id)).not.toContain(mine.id);
    expect(await getRoute(BOB, mine.id)).toBeNull();
    expect(await updateRoute(BOB, mine.id, { name: 'Mine now' })).toBeNull();
    expect(await deleteRoute(BOB, mine.id)).toBe(false);

    // Acting for Alice as Bob (a switched context) is refused by the policy
    // even when the query asks for Alice's rows by id.
    expect(await getRoute(ALICE, mine.id, BOB)).toBeNull();
    expect(await listRoutes(ALICE, BOB)).toEqual([]);
    expect(await deleteRoute(ALICE, mine.id, BOB)).toBe(false);
    await expect(
      createRoute(ALICE, { ...draft, source: 'drawn' }, BOB)
    ).rejects.toThrow();

    expect((await getRoute(ALICE, mine.id))?.name).toBe('Loop');
  });

  it('stores a generated route and reads it back with its cues', async () => {
    const created = await createRoute(ALICE, {
      ...draft,
      source: 'generated',
      cues: [
        { index: 0, kind: 'depart' },
        { index: 29, kind: 'arrive' },
      ],
    });
    expect(created.source).toBe('generated');
    expect(routeSchema.parse(created)).toEqual(created);
    expect(created.cues.map((cue) => cue.kind)).toEqual(['depart', 'arrive']);
  });

  it('renames, changes the activity and deletes', async () => {
    const created = await createRoute(ALICE, { ...draft, source: 'drawn' });
    const renamed = await updateRoute(ALICE, created.id, {
      name: 'Hill',
      activity: 'hike',
    });
    expect(renamed).toMatchObject({ name: 'Hill', activity: 'hike' });
    expect(renamed?.points).toEqual(created.points);
    expect(await deleteRoute(ALICE, created.id)).toBe(true);
    expect(await getRoute(ALICE, created.id)).toBeNull();
    expect(await deleteRoute(ALICE, created.id)).toBe(false);
  });

  it('replaces the line, recomputing distance and climb and keeping the rest', async () => {
    const created = await createRoute(ALICE, {
      ...draft,
      source: 'generated',
      cues: [{ index: 0, kind: 'depart' }],
    });
    const longer: RoutePoint[] = Array.from({ length: 60 }, (_, i) => ({
      lat: 40 + i * 0.001,
      // A zigzag, so thinning keeps the corners.
      lon: -74.01 + (i % 2) * 0.002,
      alt: 5 + i * 2,
    }));
    const updated = await updateRoute(ALICE, created.id, {
      points: longer,
      cues: [
        { index: 0, kind: 'depart' },
        { index: 59, kind: 'arrive' },
      ],
    });
    expect(updated).not.toBeNull();
    expect(routeSchema.parse(updated)).toEqual(updated);
    expect(updated?.points.length).toBeGreaterThan(30);
    expect(updated?.distanceM).toBeGreaterThan(created.distanceM);
    expect(updated?.elevationGainM).not.toBe(created.elevationGainM);
    expect(updated?.cues.map((cue) => cue.kind)).toEqual(['depart', 'arrive']);
    // Name, activity, source and creation time are not touched.
    expect(updated).toMatchObject({
      name: created.name,
      activity: created.activity,
      source: 'generated',
      sourceExerciseEntryId: created.sourceExerciseEntryId,
      createdAt: created.createdAt,
    });
    expect(Date.parse(updated?.updatedAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse(created.updatedAt)
    );
    expect(await getRoute(ALICE, created.id)).toEqual(updated);

    // Points without cues clear the old cues; a rename keeps the new line.
    const cleared = await updateRoute(ALICE, created.id, { points: longer });
    expect(cleared?.cues).toEqual([]);
    const renamed = await updateRoute(ALICE, created.id, { name: 'Again' });
    expect(renamed?.points).toEqual(cleared?.points);
    expect(renamed?.distanceM).toBe(cleared?.distanceM);
  });

  it('keeps a route a person edits to something too short, and another person’s route', async () => {
    const created = await createRoute(ALICE, { ...draft, source: 'drawn' });
    await expect(
      updateRoute(ALICE, created.id, {
        points: [
          { lat: 40, lon: -74 },
          { lat: 40.00001, lon: -74 },
        ],
      })
    ).rejects.toBeInstanceOf(InvalidRouteError);
    expect(await getRoute(ALICE, created.id)).toEqual(created);

    expect(
      await updateRoute(BOB, created.id, { points: [...points].reverse() })
    ).toBeNull();
    expect(await getRoute(ALICE, created.id)).toEqual(created);
  });

  it('refuses a route under 10 m and stores nothing', async () => {
    const before = (await listRoutes(ALICE)).length;
    await expect(
      createRoute(ALICE, {
        ...draft,
        source: 'drawn',
        points: [
          { lat: 40, lon: -74 },
          { lat: 40.00001, lon: -74 },
        ],
      })
    ).rejects.toBeInstanceOf(InvalidRouteError);
    expect((await listRoutes(ALICE)).length).toBe(before);
  });

  it('reads a recorded activity track, dropping only what is unusable', async () => {
    const track = await getActivityTrack(ALICE, ENTRY);
    expect(track?.name).toBe('Morning run');
    expect(track?.points).toEqual([
      { lat: 40, lon: -74, alt: 5 },
      { lat: 40.01, lon: -74 },
      { lat: 40.02, lon: -74 },
    ]);
  });

  it('does not reveal another person’s activity track', async () => {
    expect(await getActivityTrack(ALICE, BOB_ENTRY)).toBeNull();
    expect(await getActivityTrack(BOB, ENTRY)).toBeNull();
  });

  it('keeps the route when its source activity is deleted', async () => {
    const created = await createRoute(ALICE, {
      ...draft,
      source: 'activity',
      sourceExerciseEntryId: ENTRY,
    });
    expect(created.sourceExerciseEntryId).toBe(ENTRY);
    const sys = await getSystemClient();
    try {
      await sys.query('DELETE FROM public.exercise_entries WHERE id = $1', [
        ENTRY,
      ]);
    } finally {
      sys.release();
    }
    const after = await getRoute(ALICE, created.id);
    expect(after).not.toBeNull();
    expect(after?.sourceExerciseEntryId).toBeNull();
    expect(new ActivityHasNoRouteError()).toBeInstanceOf(Error);
  });

  it('removes a person’s routes with the person', async () => {
    const carol = '00000000-0000-4000-c000-0000000000c3';
    const sys = await getSystemClient();
    try {
      await sys.query(
        'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true) ON CONFLICT DO NOTHING',
        [carol, `routes-${carol}@example.test`]
      );
      const route = await createRoute(carol, { ...draft, source: 'drawn' });
      await sys.query('DELETE FROM public."user" WHERE id = $1', [carol]);
      const left = await sys.query(
        'SELECT 1 FROM public.routes WHERE id = $1',
        [route.id]
      );
      expect(left.rowCount).toBe(0);
    } finally {
      sys.release();
    }
  });

  it('stops at the per-person cap even when creates race', async () => {
    const sys = await getSystemClient();
    try {
      await sys.query('DELETE FROM public.routes WHERE user_id = $1', [BOB]);
      // Fill all but two slots directly, then race five creates for them.
      await sys.query(
        `INSERT INTO public.routes (user_id, name, distance_m, points)
         SELECT $1, 'filler ' || g, 100, '[]'::jsonb
           FROM generate_series(1, $2::int) g`,
        [BOB, ROUTE_MAX_PER_USER - 2]
      );
    } finally {
      sys.release();
    }
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        createRoute(BOB, { ...draft, source: 'drawn' })
      )
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    const failures = results.filter((r) => r.status === 'rejected');
    expect(failures).toHaveLength(3);
    for (const failure of failures) {
      expect((failure as PromiseRejectedResult).reason).toBeInstanceOf(
        RouteLimitError
      );
    }
    const sys2 = await getSystemClient();
    try {
      const count = await sys2.query(
        'SELECT COUNT(*)::int AS n FROM public.routes WHERE user_id = $1',
        [BOB]
      );
      expect(count.rows[0].n).toBe(ROUTE_MAX_PER_USER);
    } finally {
      sys2.release();
    }
  });

  it('enforces the table’s own checks', async () => {
    const sys = await getSystemClient();
    try {
      for (const bad of [
        `INSERT INTO public.routes (user_id, name, distance_m) VALUES ('${ALICE}', 'x', -1)`,
        `INSERT INTO public.routes (user_id, name, points) VALUES ('${ALICE}', 'x', '{}'::jsonb)`,
        `INSERT INTO public.routes (user_id, name, cues) VALUES ('${ALICE}', 'x', '"a"'::jsonb)`,
        `INSERT INTO public.routes (user_id, name, activity) VALUES ('${ALICE}', 'x', 'swim')`,
        `INSERT INTO public.routes (user_id, name, source) VALUES ('${ALICE}', 'x', 'magic')`,
        `INSERT INTO public.routes (user_id, name, elevation_gain_m) VALUES ('${ALICE}', 'x', -5)`,
      ]) {
        await expect(sys.query(bad)).rejects.toThrow();
      }
    } finally {
      sys.release();
    }
  });
});
