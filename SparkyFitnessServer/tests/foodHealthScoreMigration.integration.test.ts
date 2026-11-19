import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { loadSecrets } from '../utils/secretLoader.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });
loadSecrets();
const { endPool, getSystemClient } = await import('../db/poolManager.js');

async function dbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (
    !process.env.SPARKY_FITNESS_DB_HOST ||
    !process.env.SPARKY_FITNESS_DB_NAME
  ) {
    return false;
  }
  const probe = new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
  try {
    await probe.connect();
    const result = await probe.query(
      "SELECT to_regclass('public.foods') IS NOT NULL AS available"
    );
    return result.rows[0]?.available === true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await dbReachable();

describe.skipIf(!RUN)('20261117120000_add_food_health_score_fields', () => {
  let client: pg.PoolClient;

  beforeEach(async () => {
    client = await getSystemClient();
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
    client.release();
  });

  afterAll(async () => {
    await endPool();
  });

  async function insertFood(values: Record<string, unknown>) {
    const columns = Object.keys(values);
    await client.query(
      `INSERT INTO foods (name, ${columns.join(', ')})
       VALUES ('health score probe', ${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(values)
    );
  }

  it('leaves the new food columns NULL ("unknown") by default', async () => {
    const { rows } = await client.query(
      `INSERT INTO foods (name) VALUES ('health score probe')
       RETURNING fruit_veg_legume_percent, provider_nutriscore_grade, nutri_score_category`
    );
    expect(rows[0]).toEqual({
      fruit_veg_legume_percent: null,
      provider_nutriscore_grade: null,
      nutri_score_category: null,
    });
  });

  it('keeps added_sugars off foods: it is a per-serving variant nutrient', async () => {
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.columns
        WHERE column_name = 'added_sugars' AND table_schema = 'public'
          AND table_name IN ('foods', 'food_variants', 'food_entries', 'meal_foods')
        ORDER BY table_name`
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'food_entries',
      'food_variants',
      'meal_foods',
    ]);
  });

  it.each([
    [{ fruit_veg_legume_percent: 101 }],
    [{ fruit_veg_legume_percent: -0.5 }],
    [{ provider_nutriscore_grade: 'A' }],
    [{ provider_nutriscore_grade: 'unknown' }],
    [{ nutri_score_category: 'water' }],
  ])('rejects %o', async (values) => {
    await expect(insertFood(values)).rejects.toMatchObject({ code: '23514' });
  });

  it('accepts the documented ranges', async () => {
    await expect(
      insertFood({
        fruit_veg_legume_percent: 100,
        provider_nutriscore_grade: 'e',
        nutri_score_category: 'fat_oil_nut',
      })
    ).resolves.toBeUndefined();
  });

  it('defaults nutri_score_enabled to false', async () => {
    const { rows } = await client.query(
      `SELECT column_default, is_nullable FROM information_schema.columns
        WHERE table_name = 'user_preferences' AND column_name = 'nutri_score_enabled'`
    );
    expect(rows[0]).toEqual({ column_default: 'false', is_nullable: 'NO' });
  });

  it('defaults front_of_pack_region to none and rejects unknown regions', async () => {
    const { rows } = await client.query(
      `SELECT column_default, is_nullable FROM information_schema.columns
        WHERE table_name = 'user_preferences' AND column_name = 'front_of_pack_region'`
    );
    expect(rows[0]).toEqual({
      column_default: "'none'::text",
      is_nullable: 'NO',
    });
    const { rows: constraints } = await client.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'public.user_preferences'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%front_of_pack_region%'`
    );
    expect(constraints[0].def).toMatch(/'none'.*'brazil'.*'chile'.*'mexico'/);
  });
});
