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
       RETURNING added_sugars, fruit_veg_legume_percent, provider_nutriscore_grade`
    );
    expect(rows[0]).toEqual({
      added_sugars: null,
      fruit_veg_legume_percent: null,
      provider_nutriscore_grade: null,
    });
  });

  it.each([
    [{ added_sugars: -1 }],
    [{ fruit_veg_legume_percent: 101 }],
    [{ fruit_veg_legume_percent: -0.5 }],
    [{ provider_nutriscore_grade: 'A' }],
    [{ provider_nutriscore_grade: 'unknown' }],
  ])('rejects %o', async (values) => {
    await expect(insertFood(values)).rejects.toMatchObject({ code: '23514' });
  });

  it('accepts the documented ranges', async () => {
    await expect(
      insertFood({
        added_sugars: 0,
        fruit_veg_legume_percent: 100,
        provider_nutriscore_grade: 'e',
      })
    ).resolves.toBeUndefined();
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
