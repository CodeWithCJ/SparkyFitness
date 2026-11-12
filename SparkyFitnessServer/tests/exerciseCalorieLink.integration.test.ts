/**
 * Linking a logged workout to the same strength session synced from a watch
 * (#2353) treats the synced session, several exercise entries under one
 * exercise_preset_entry_id as Garmin writes them, as one workout. These tests
 * run the service as the app role, so the real SQL, grants and row-level
 * security apply, and check what is persisted on every entry of both sides.
 *
 * Skipped unless a test database is reachable.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { CalorieLinkResolution } from '@workspace/shared';
import { endPool } from '../db/poolManager.js';
import {
  clearCalorieLink,
  getCalorieLinkSuggestions,
  setCalorieLink,
} from '../services/exerciseCalorieLinkService.js';

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

const DAY = '2026-10-23';

interface Seeded {
  manualId: string;
  syncedIds: [string, string];
  syncedPresetId: string;
}

describe.runIf(RUN)('linking a synced strength session', () => {
  let db: pg.Client;
  const userId = randomUUID();

  const insertPreset = async (name: string, source: string) =>
    (
      await db.query(
        `INSERT INTO public.exercise_preset_entries
           (user_id, name, entry_date, source, created_by_user_id)
         VALUES ($1, $2, $3, $4, $1)
         RETURNING id`,
        [userId, name, DAY, source]
      )
    ).rows[0].id as string;

  const insertEntry = async (
    name: string,
    calories: number,
    source: string,
    sourceId: string | null,
    presetId: string | null,
    sortOrder: number,
    time: string
  ) =>
    (
      await db.query(
        `INSERT INTO public.exercise_entries
           (user_id, entry_date, entry_time, exercise_name, duration_minutes,
            calories_burned, sort_order, source, source_id,
            exercise_preset_entry_id)
         VALUES ($1, $2, $3, $4, 30, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          userId,
          DAY,
          time,
          name,
          calories,
          sortOrder,
          source,
          sourceId,
          presetId,
        ]
      )
    ).rows[0].id as string;

  // A logged workout of 475, and a synced Garmin session of two entries
  // (300 + 275 = 575) that overlaps it.
  const seed = async (): Promise<Seeded> => {
    const manualId = await insertEntry(
      'Bench Press',
      475,
      'manual',
      null,
      null,
      0,
      '10:00'
    );
    const syncedPresetId = await insertPreset('Strength', 'garmin');
    const a = await insertEntry(
      'Squat',
      300,
      'garmin',
      '9001_0',
      syncedPresetId,
      0,
      '10:05'
    );
    const b = await insertEntry(
      'Row',
      275,
      'garmin',
      '9001_1',
      syncedPresetId,
      1,
      '10:20'
    );
    return { manualId, syncedIds: [a, b], syncedPresetId };
  };

  const rows = async (ids: string[]) =>
    (
      await db.query(
        `SELECT id, calories_burned::float8 AS calories_burned,
                calories_applied::float8 AS calories_applied,
                calorie_link_id, calorie_link_resolution
         FROM public.exercise_entries
         WHERE id = ANY($1::uuid[])`,
        [ids]
      )
    ).rows as Array<{
      id: string;
      calories_burned: number;
      calories_applied: number | null;
      calorie_link_id: string | null;
      calorie_link_resolution: string | null;
    }>;

  const clean = async () => {
    await db.query('DELETE FROM public.exercise_entries WHERE user_id = $1', [
      userId,
    ]);
    await db.query(
      'DELETE FROM public.exercise_preset_entries WHERE user_id = $1',
      [userId]
    );
  };

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `calorie-link-${userId}@example.test`]
    );
    await db.query(
      'INSERT INTO public.user_preferences (user_id) VALUES ($1)',
      [userId]
    );
  });

  beforeEach(clean);

  afterAll(async () => {
    await clean();
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await endPool();
  });

  it('offers the session once, with its calories summed, whichever entry anchors it', async () => {
    const { manualId, syncedIds } = await seed();

    const result = await getCalorieLinkSuggestions(userId, userId, manualId);

    expect(result.manual_total_calories).toBe(475);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      id: syncedIds[0],
      name: 'Strength',
      source: 'garmin',
      start_time: '10:05',
      duration_minutes: 60,
      calories_burned: 575,
      match: 'overlap',
    });
  });

  // Manual 475 against synced 575: `higher` keeps the synced side only when the
  // whole session's total is compared, `average` is (475 + 575) / 2.
  it.each<
    [CalorieLinkResolution, number | undefined, number | null, number | null]
  >([
    ['sparkyfitness', undefined, null, 0],
    ['synced', undefined, 0, null],
    ['higher', undefined, 0, null],
    ['lower', undefined, null, 0],
    ['average', undefined, 525, 0],
    ['custom', 430.26, 430.3, 0],
  ])(
    '%s counts the right side and leaves the estimates alone',
    async (resolution, custom, manualApplied, syncedApplied) => {
      const { manualId, syncedIds } = await seed();

      await setCalorieLink(userId, userId, manualId, {
        synced_entry_id: syncedIds[0],
        resolution,
        ...(custom === undefined ? {} : { custom_calories: custom }),
      });

      const saved = await rows([manualId, ...syncedIds]);
      const byId = new Map(saved.map((row) => [row.id, row]));
      expect(byId.get(manualId)).toMatchObject({
        calories_burned: 475,
        calories_applied: manualApplied,
        calorie_link_resolution: resolution,
      });
      for (const [id, burned] of [
        [syncedIds[0], 300],
        [syncedIds[1], 275],
      ] as const) {
        expect(byId.get(id)).toMatchObject({
          calories_burned: burned,
          calories_applied: syncedApplied,
          calorie_link_resolution: resolution,
        });
      }
      expect(new Set(saved.map((row) => row.calorie_link_id)).size).toBe(1);
      expect(saved[0]!.calorie_link_id).not.toBeNull();
    }
  );

  it('reads the link back by the id the sheet was offered, then unlinks every entry', async () => {
    const { manualId, syncedIds } = await seed();
    await setCalorieLink(userId, userId, manualId, {
      synced_entry_id: syncedIds[0],
      resolution: 'average',
    });

    const linked = await getCalorieLinkSuggestions(userId, userId, manualId);
    expect(linked.link).toEqual({
      resolution: 'average',
      synced_entry_id: syncedIds[0],
    });
    expect(linked.candidates.map((c) => c.id)).toEqual([syncedIds[0]]);

    await clearCalorieLink(userId, userId, manualId);

    const cleared = await rows([manualId, ...syncedIds]);
    expect(cleared).toHaveLength(3);
    for (const row of cleared) {
      expect(row).toMatchObject({
        calories_applied: null,
        calorie_link_id: null,
        calorie_link_resolution: null,
      });
    }
    expect(
      cleared.map((row) => row.calories_burned).sort((x, y) => x - y)
    ).toEqual([275, 300, 475]);
  });

  it('refuses a session when one of its entries is already linked elsewhere', async () => {
    const { manualId, syncedIds } = await seed();
    await db.query(
      `UPDATE public.exercise_entries
       SET calorie_link_id = $2, calorie_link_resolution = 'synced',
           calories_applied = 0
       WHERE id = $1`,
      [syncedIds[1], randomUUID()]
    );

    await expect(
      setCalorieLink(userId, userId, manualId, {
        synced_entry_id: syncedIds[0],
        resolution: 'synced',
      })
    ).rejects.toMatchObject({ status: 409 });

    const [first] = await rows([manualId]);
    expect(first).toMatchObject({
      calories_applied: null,
      calorie_link_id: null,
    });
    const [partner] = await rows([syncedIds[0]]);
    expect(partner).toMatchObject({
      calories_applied: null,
      calorie_link_id: null,
    });
  });
});
