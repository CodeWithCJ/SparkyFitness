/**
 * Editing a workout fills the fields the request left out from the stored
 * entry. A watch telemetry flush, a distance correction or another edit that
 * commits while the edit is running must survive it rather than be
 * overwritten with an older read.
 *
 * Skipped unless a test database is reachable, since the tests briefly lock
 * the whole exercise_entries table.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { endPool } from '../db/poolManager.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import exerciseEntryService from '../services/exerciseEntryService.js';
import exerciseService from '../services/exerciseService.js';
import { countBehind, raceWrites } from './helpers/raceGate.js';

function ownerClient() {
  return new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
}

async function isDbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  // These tests briefly lock whole tables, so only run against a test database.
  if (!/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
    return false;
  const probe = ownerClient();
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

const RUN = await isDbReachable();

describe.runIf(RUN)('overlapping writes to one workout', () => {
  let db: pg.Client;
  let gate: pg.Client;
  const userId = randomUUID();

  const insertWorkout = async () =>
    (
      await db.query(
        `INSERT INTO public.exercise_entries
           (user_id, entry_date, exercise_name, duration_minutes,
            calories_burned, notes, source)
         VALUES ($1, '2026-09-20', 'Run', 30, 300, 'before', 'manual')
         RETURNING id`,
        [userId]
      )
    ).rows[0].id as string;

  const workout = async (id: string) =>
    (
      await db.query(
        `SELECT notes, distance::float AS distance,
                avg_heart_rate::float AS avg_heart_rate,
                max_heart_rate::float AS max_heart_rate
         FROM public.exercise_entries WHERE id = $1`,
        [id]
      )
    ).rows[0];

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    gate = ownerClient();
    await gate.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `workout-race-${userId}@example.test`]
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM public.exercise_entries WHERE user_id = $1', [
      userId,
    ]);
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await gate.end();
    await endPool();
  });

  it('keeps watch heart rate committed while an edit was writing', async () => {
    const id = await insertWorkout();

    await raceWrites(gate, db, 'exercise_entries', [
      () =>
        exerciseEntryDb.applyWatchTelemetryAtomically(
          id,
          userId,
          userId,
          { avg_heart_rate: 150, max_heart_rate: 172 },
          null
        ),
      () =>
        exerciseService.updateExerciseEntry(userId, userId, id, {
          notes: 'edited',
        }),
    ]);

    expect(await workout(id)).toEqual({
      notes: 'edited',
      distance: null,
      avg_heart_rate: 150,
      max_heart_rate: 172,
    });
  });

  it('keeps both of two overlapping edits to different fields', async () => {
    const id = await insertWorkout();

    await raceWrites(gate, db, 'exercise_entries', [
      () =>
        exerciseService.updateExerciseEntry(userId, userId, id, {
          notes: 'edited',
        }),
      () =>
        exerciseService.updateExerciseEntry(userId, userId, id, {
          distance: 5,
        }),
    ]);

    expect(await workout(id)).toMatchObject({ notes: 'edited', distance: 5 });
  });

  it('keeps a distance set while an edit was waiting for the workout', async () => {
    const id = await insertWorkout();
    const gatePid: number = (await gate.query('SELECT pg_backend_pid() AS pid'))
      .rows[0].pid;

    // Holding the sets table stops the distance write after it has updated
    // the workout row and before it commits, so the edit starts while that
    // row is changed but not yet committed.
    await gate.query('BEGIN');
    await gate.query('LOCK TABLE public.exercise_entry_sets IN SHARE MODE');
    // Settled at once so a write that fails while the gate is closed is
    // reported below instead of as an unhandled rejection.
    const writes: Promise<PromiseSettledResult<unknown>>[] = [];
    const start = (write: () => Promise<unknown>) =>
      writes.push(Promise.allSettled([write()]).then(([result]) => result));
    const waitBehindGate = (n: number) =>
      vi.waitFor(async () => expect(await countBehind(db, gatePid)).toBe(n), {
        timeout: 10000,
        interval: 50,
      });
    try {
      start(() =>
        exerciseEntryService.setExerciseEntryDistance(userId, userId, id, {
          distance_km: 7,
        })
      );
      await waitBehindGate(1);
      start(() =>
        exerciseService.updateExerciseEntry(userId, userId, id, {
          notes: 'edited',
        })
      );
      await waitBehindGate(2);
    } finally {
      await gate.query('COMMIT');
    }
    for (const result of await Promise.all(writes)) {
      if (result.status === 'rejected') throw result.reason;
    }

    expect(await workout(id)).toMatchObject({ notes: 'edited', distance: 7 });
  });

  it('scales laps from the distance the last correction replaced', async () => {
    const id = await insertWorkout();
    await db.query(
      'UPDATE public.exercise_entries SET distance = 10 WHERE id = $1',
      [id]
    );
    await db.query(
      `INSERT INTO public.exercise_entry_laps
         (user_id, exercise_entry_id, entry_date, lap_index, start_time,
          end_time, duration_seconds, distance_meters)
       VALUES ($1, $2, '2026-09-20', 0, '2026-09-20T06:00:00Z',
               '2026-09-20T06:30:00Z', 1800, 10000)`,
      [userId, id]
    );

    await raceWrites(gate, db, 'exercise_entries', [
      () =>
        exerciseEntryService.setExerciseEntryDistance(userId, userId, id, {
          distance_km: 5,
        }),
      () =>
        exerciseEntryService.setExerciseEntryDistance(userId, userId, id, {
          distance_km: 8,
        }),
    ]);

    const { distance } = await workout(id);
    const lap = (
      await db.query(
        `SELECT distance_meters::float AS distance_meters
         FROM public.exercise_entry_laps WHERE exercise_entry_id = $1`,
        [id]
      )
    ).rows[0];
    expect([5, 8]).toContain(distance);
    expect(lap.distance_meters).toBe(distance * 1000);
  });

  it('keeps every field of overlapping edits through the service', async () => {
    const id = await insertWorkout();
    // Each edit sends one field, as the diary and the chatbot do; the service
    // fills the rest in. One more write is a watch telemetry flush.
    const edits: Record<string, unknown>[] = [
      { notes: 'edited' },
      { duration_minutes: 41 },
      { calories_burned: 333 },
      { entry_time: '06:45' },
      { distance: 5.5 },
      { steps: 7000 },
      { sort_order: 3 },
      { superset_group: 2 },
      { exercise_name: 'Tempo run' },
      { entry_date: '2026-09-21' },
      { image_url: '/uploads/exercise_entries/race/none.jpg' },
      { record_timezone: 'Europe/Berlin' },
      { heart_rate_recovery_1min: 31 },
      { avg_respiration_brpm: 22 },
      { avg_speed_mps: 3.1 },
      { avg_cadence: 172 },
      { avg_power_watts: 240 },
      { elevation_gain_meters: 85 },
      { floors_climbed: 4 },
      { training_load: 120 },
    ];

    await raceWrites(
      gate,
      db,
      'exercise_entries',
      [
        ...edits.map(
          (edit) => () =>
            exerciseService.updateExerciseEntry(userId, userId, id, edit)
        ),
        () =>
          exerciseEntryDb.applyWatchTelemetryAtomically(
            id,
            userId,
            userId,
            { avg_heart_rate: 150, max_heart_rate: 172 },
            null
          ),
      ],
      // The application pool has 10 connections; the other writes queue for one.
      { waiters: 10 }
    );

    const row = (
      await db.query(
        `SELECT notes, duration_minutes::float AS duration_minutes,
                calories_burned::float AS calories_burned,
                entry_time::text AS entry_time, distance::float AS distance,
                steps, sort_order, superset_group, exercise_name,
                entry_date::text AS entry_date, image_url, record_timezone,
                heart_rate_recovery_1min,
                avg_respiration_brpm::float AS avg_respiration_brpm,
                avg_speed_mps::float AS avg_speed_mps,
                avg_cadence::float AS avg_cadence,
                avg_power_watts::float AS avg_power_watts,
                elevation_gain_meters::float AS elevation_gain_meters,
                floors_climbed::float AS floors_climbed,
                training_load::float AS training_load,
                avg_heart_rate::float AS avg_heart_rate,
                max_heart_rate::float AS max_heart_rate
         FROM public.exercise_entries WHERE id = $1`,
        [id]
      )
    ).rows[0];
    expect(row).toEqual({
      ...Object.assign({}, ...edits),
      entry_time: '06:45:00',
      avg_heart_rate: 150,
      max_heart_rate: 172,
    });
  });
});
