/**
 * Daily and Hourly custom measurements hold one reading per slot (day, or
 * hour, and source). Two writes for one slot that overlap must leave one
 * reading.
 *
 * Skipped unless a test database is reachable, since the tests briefly lock
 * the whole custom_measurements table.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { endPool } from '../db/poolManager.js';
import habitRepository from '../models/habitRepository.js';
import measurementRepository from '../models/measurementRepository.js';
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

describe.runIf(RUN)('one custom measurement reading per slot', () => {
  let db: pg.Client;
  let gate: pg.Client;
  const userId = randomUUID();

  const createCategory = async (name: string, frequency: string) =>
    (
      await db.query(
        `INSERT INTO public.custom_categories
           (user_id, name, measurement_type, frequency, data_type)
         VALUES ($1, $2, 'cm', $3, 'numeric')
         RETURNING id`,
        [userId, name, frequency]
      )
    ).rows[0].id as string;

  const readings = async (categoryId: string) =>
    (
      await db.query(
        `SELECT entry_date::text AS entry_date, entry_hour, source, value
         FROM public.custom_measurements
         WHERE category_id = $1
         ORDER BY entry_date, entry_hour, source, value`,
        [categoryId]
      )
    ).rows;

  const upsert = (
    categoryId: string,
    frequency: string,
    value: string,
    entryHour: number | null = null
  ) =>
    measurementRepository.upsertCustomMeasurement(
      userId,
      userId,
      categoryId,
      value,
      '2026-09-20',
      entryHour,
      null,
      null,
      frequency,
      'Withings'
    );

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    gate = ownerClient();
    await gate.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `custom-measurement-race-${userId}@example.test`]
    );
  });

  afterAll(async () => {
    await db.query(
      'DELETE FROM public.custom_measurements WHERE user_id = $1',
      [userId]
    );
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await gate.end();
    await endPool();
  });

  it('keeps one Daily reading when two writes for the day overlap', async () => {
    const waist = await createCategory('Waist', 'Daily');

    await raceWrites(gate, db, 'custom_measurements', [
      () => upsert(waist, 'Daily', '80'),
      () => upsert(waist, 'Daily', '81'),
    ]);

    const rows = await readings(waist);
    expect(rows).toHaveLength(1);
    expect(['80', '81']).toContain(rows[0].value);
  });

  it('keeps one Hourly reading when two writes for the hour overlap', async () => {
    const pulse = await createCategory('Pulse', 'Hourly');

    await raceWrites(gate, db, 'custom_measurements', [
      () => upsert(pulse, 'Hourly', '61', 8),
      () => upsert(pulse, 'Hourly', '62', 8),
    ]);

    const rows = await readings(pulse);
    expect(rows).toHaveLength(1);
    expect(rows[0].entry_hour).toBe(8);
  });

  it('keeps one reading per slot when two batches overlap', async () => {
    const neck = await createCategory('Neck', 'Daily');
    const batch = (value: string) => () =>
      measurementRepository.bulkUpsertCustomMeasurements(userId, userId, [
        {
          categoryId: neck,
          value,
          entryDate: '2026-09-20',
          frequency: 'Daily',
          source: 'Health Connect',
        },
        {
          categoryId: neck,
          value,
          entryDate: '2026-09-21',
          frequency: 'Daily',
          source: 'Health Connect',
        },
      ]);

    await raceWrites(gate, db, 'custom_measurements', [
      batch('30'),
      batch('31'),
    ]);

    const rows = await readings(neck);
    expect(rows.map((r) => r.entry_date)).toEqual(['2026-09-20', '2026-09-21']);
    // Each batch writes both days together, so both days hold its value.
    expect(rows[0].value).toBe(rows[1].value);
  });

  it('keeps one habit log when two logs for the day overlap', async () => {
    const habit = await createCategory('Stretch', 'Daily');

    await raceWrites(gate, db, 'custom_measurements', [
      () => habitRepository.upsertHabitLog(userId, habit, '2026-09-20', 'true'),
      () =>
        habitRepository.upsertHabitLog(userId, habit, '2026-09-20', 'false'),
    ]);

    expect(await readings(habit)).toHaveLength(1);
  });

  it('still records every reading of an All category', async () => {
    const mood = await createCategory('Mood', 'All');

    await Promise.all([upsert(mood, 'All', '3'), upsert(mood, 'All', '4')]);

    expect((await readings(mood)).map((r) => r.value)).toEqual(['3', '4']);
  });
});
