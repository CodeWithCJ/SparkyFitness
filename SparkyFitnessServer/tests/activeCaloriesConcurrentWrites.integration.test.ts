/**
 * Active Calories are one exercise entry per user and day. Two imports of the
 * same day that overlap (two devices, or a retry served by another instance)
 * must leave one entry, not one each.
 *
 * Skipped unless a test database is reachable, since the test briefly locks
 * the whole exercise_entries table.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { endPool } from '../db/poolManager.js';
import exerciseDb from '../models/exercise.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import { raceWrites } from './helpers/raceGate.js';

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

describe.runIf(RUN)('overlapping Active Calories imports for one day', () => {
  let db: pg.Client;
  let gate: pg.Client;
  const userId = randomUUID();

  const dayEntries = async (entryDate: string) =>
    (
      await db.query(
        `SELECT id, calories_burned::float AS calories_burned, source
         FROM public.exercise_entries
         WHERE user_id = $1 AND entry_date = $2
         ORDER BY created_at, id`,
        [userId, entryDate]
      )
    ).rows;

  const importDay = async (
    entryDate: string,
    calories: number,
    source: string
  ) => {
    const exerciseId = await exerciseDb.getOrCreateActiveCaloriesExercise(
      userId,
      source
    );
    return exerciseEntryDb.upsertExerciseEntryData(
      userId,
      userId,
      exerciseId,
      calories,
      entryDate,
      source
    );
  };

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    gate = ownerClient();
    await gate.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `active-calories-race-${userId}@example.test`]
    );
    // Created up front so the day races below do not also race to create
    // the exercise; that race has its own test.
    await exerciseDb.getOrCreateActiveCaloriesExercise(userId, 'HealthKit');
  });

  afterAll(async () => {
    await db.query('DELETE FROM public.exercise_entries WHERE user_id = $1', [
      userId,
    ]);
    await db.query('DELETE FROM public.exercises WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await gate.end();
    await endPool();
  });

  it('keeps one entry for the day, holding one of the two totals', async () => {
    const [a, b] = await raceWrites(gate, db, 'exercise_entries', [
      () => importDay('2026-09-20', 400, 'HealthKit'),
      () => importDay('2026-09-20', 450, 'HealthKit'),
    ]);

    const entries = await dayEntries('2026-09-20');
    expect(entries).toHaveLength(1);
    expect(a.id).toBe(entries[0].id);
    expect(b.id).toBe(entries[0].id);
    expect([400, 450]).toContain(entries[0].calories_burned);
  });

  it('keeps one entry when the overlapping import comes from another source', async () => {
    // Both sources resolve to the user's one Active Calories exercise, so the
    // second import updates the first one's entry rather than adding its own.
    await raceWrites(gate, db, 'exercise_entries', [
      () => importDay('2026-09-21', 300, 'HealthKit'),
      () => importDay('2026-09-21', 320, 'Health Connect'),
    ]);

    expect(await dayEntries('2026-09-21')).toHaveLength(1);
  });
  it('creates one Active Calories exercise for two first imports', async () => {
    const newUserId = randomUUID();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [newUserId, `active-calories-first-${newUserId}@example.test`]
    );
    try {
      const [a, b] = await raceWrites(gate, db, 'exercises', [
        () =>
          exerciseDb.getOrCreateActiveCaloriesExercise(newUserId, 'HealthKit'),
        () =>
          exerciseDb.getOrCreateActiveCaloriesExercise(
            newUserId,
            'Health Connect'
          ),
      ]);

      const exercises = (
        await db.query(
          `SELECT id FROM public.exercises
           WHERE user_id = $1 AND name = 'Active Calories'`,
          [newUserId]
        )
      ).rows;
      expect(exercises).toHaveLength(1);
      expect(a).toBe(exercises[0].id);
      expect(b).toBe(exercises[0].id);
    } finally {
      await db.query('DELETE FROM public.exercises WHERE user_id = $1', [
        newUserId,
      ]);
      await db.query('DELETE FROM public."user" WHERE id = $1', [newUserId]);
    }
  });
});
