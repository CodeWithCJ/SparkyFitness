/**
 * Real-DB integration test for db/migrations/20260816192818_normalize_exercise_json_array_fields.sql.
 *
 * WHY THIS EXISTS
 * ----------------
 * The migration wraps a PL/pgSQL function (JSON parsing, casting, exception
 * handling, dynamic SQL fallback) that a mocked pool can't meaningfully
 * exercise. This drives the exact migration file's SQL against a real
 * Postgres instance, seeding malformed rows the way legacy imports actually
 * left them, then asserts the backfilled shape and that a second run of the
 * same file is a true no-op (idempotency the migration comment promises).
 *
 * It seeds and deletes only its own synthetic `@example.test` rows, but the
 * migration SQL itself runs unscoped UPDATEs across every matching row in
 * exercises/exercise_entries (a real backfill, not a test fixture) — so
 * unlike exerciseEntryStats.integration.test.ts, a reachability probe alone
 * isn't a safe enough gate. The database name must also look disposable
 * (contain "test", matching CI's sparky_test) before this runs at all, so a
 * developer's local `.env` pointed at their normal working database can
 * never have this silently rewrite real exercise data via `pnpm test`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSystemClient, endPool } from '../db/poolManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATION_SQL = fs.readFileSync(
  path.join(
    __dirname,
    '../db/migrations/20260816192818_normalize_exercise_json_array_fields.sql'
  ),
  'utf8'
);

async function dbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (
    !process.env.SPARKY_FITNESS_APP_DB_USER ||
    !process.env.SPARKY_FITNESS_DB_HOST
  ) {
    return false;
  }
  // Unlike exerciseEntryStats.integration.test.ts (only ever touches its own
  // synthetic rows, safe regardless of which database it's pointed at), this
  // test executes the real migration SQL, which runs unscoped UPDATEs across
  // every matching row in exercises/exercise_entries — by design, since it's
  // a real backfill, not a test fixture. A reachability probe alone isn't
  // enough of a gate: a developer's local `.env` commonly points `pnpm test`
  // at their normal working database. Require the database to be clearly
  // disposable (CI's is named sparky_test) before ever running it, as an
  // explicit opt-in — a developer has to deliberately point at a database
  // named like a test database for this to run at all.
  const dbName = process.env.SPARKY_FITNESS_DB_NAME ?? '';
  if (!/test/i.test(dbName)) return false;
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

const U = '00000000-0000-4000-b000-0000000000bb';
const EX_MALFORMED = '00000000-0000-4000-b000-0000000000f1';
const ENTRY_MALFORMED = '00000000-0000-4000-b000-000000000601';

describe.runIf(RUN)('normalize_exercise_json_array_fields migration', () => {
  beforeAll(async () => {
    const sys = await getSystemClient();
    try {
      await sys.query(
        'DELETE FROM public.exercise_entries WHERE user_id = $1',
        [U]
      );
      await sys.query('DELETE FROM public.exercises WHERE id = $1', [
        EX_MALFORMED,
      ]);
      await sys.query('DELETE FROM public."user" WHERE id = $1', [U]);
      await sys.query(
        'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true) ON CONFLICT (id) DO NOTHING',
        [U, `normalize-exercise-json-${U}@example.test`]
      );

      // Every malformed shape the application's own read paths have to
      // tolerate today, on both tables the migration must cover.
      await sys.query(
        `INSERT INTO public.exercises
           (id, name, source, user_id, is_custom, modality, equipment, primary_muscles, secondary_muscles, instructions, images)
         VALUES ($1, $2, 'test', $3, true, 'weight_reps', $4, $5, $6, $7, $8)`,
        [
          EX_MALFORMED,
          'Migration Test Exercise',
          U,
          '"Barbell"', // bare JSON string -> should wrap to ["Barbell"]
          '["chest"]', // already correct -> must round-trip unchanged
          'triceps, shoulders', // not valid JSON -> comma-split fallback
          null, // NULL -> must stay NULL
          '[]', // already an empty array -> must round-trip unchanged
        ]
      );
      await sys.query(
        `INSERT INTO public.exercise_entries
           (id, user_id, exercise_id, duration_minutes, calories_burned, entry_date, exercise_name, equipment, primary_muscles, secondary_muscles)
         VALUES ($1, $2, $3, 0, 0, '2026-08-16', 'Migration Test Exercise', $4, $5, $6)`,
        [
          ENTRY_MALFORMED,
          U,
          EX_MALFORMED,
          '"Dumbbell"',
          '', // empty string -> should become '[]', not stay ''
          '   ', // whitespace-only -> should also become '[]'
        ]
      );
    } finally {
      sys.release();
    }
  });

  afterAll(async () => {
    const sys = await getSystemClient();
    try {
      await sys.query(
        'DELETE FROM public.exercise_entries WHERE user_id = $1',
        [U]
      );
      await sys.query('DELETE FROM public.exercises WHERE id = $1', [
        EX_MALFORMED,
      ]);
      await sys.query('DELETE FROM public."user" WHERE id = $1', [U]);
    } finally {
      sys.release();
    }
    await endPool();
  });

  async function readRows() {
    const sys = await getSystemClient();
    try {
      const exercise = (
        await sys.query(
          'SELECT equipment, primary_muscles, secondary_muscles, instructions, images FROM public.exercises WHERE id = $1',
          [EX_MALFORMED]
        )
      ).rows[0];
      const entry = (
        await sys.query(
          'SELECT equipment, primary_muscles, secondary_muscles FROM public.exercise_entries WHERE id = $1',
          [ENTRY_MALFORMED]
        )
      ).rows[0];
      return { exercise, entry };
    } finally {
      sys.release();
    }
  }

  it('normalizes malformed values and leaves correct/NULL values untouched, on both tables', async () => {
    const sys = await getSystemClient();
    try {
      await sys.query(MIGRATION_SQL);
    } finally {
      sys.release();
    }

    const { exercise, entry } = await readRows();

    expect(JSON.parse(exercise.equipment)).toEqual(['Barbell']);
    expect(JSON.parse(exercise.primary_muscles)).toEqual(['chest']);
    expect(JSON.parse(exercise.secondary_muscles)).toEqual([
      'triceps',
      'shoulders',
    ]);
    expect(exercise.instructions).toBeNull();
    expect(JSON.parse(exercise.images)).toEqual([]);
    expect(JSON.parse(entry.equipment)).toEqual(['Dumbbell']);
    // Empty string and whitespace-only are non-NULL but still not valid
    // JSON; both must become the literal '[]', not stay as-is.
    expect(entry.primary_muscles).toBe('[]');
    expect(entry.secondary_muscles).toBe('[]');
  });

  it('is idempotent: a second run changes nothing', async () => {
    const before = await readRows();

    const sys = await getSystemClient();
    try {
      await sys.query(MIGRATION_SQL);
    } finally {
      sys.release();
    }

    const after = await readRows();
    expect(after).toEqual(before);
  });
});
