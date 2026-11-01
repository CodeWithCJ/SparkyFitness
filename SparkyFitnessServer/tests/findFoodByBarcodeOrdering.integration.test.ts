import pg from 'pg';
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { getClient } from '../db/poolManager.js';
import { findFoodByBarcode } from '../models/food.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const hasTestDatabase =
  process.env.SKIP_RLS_MATRIX !== '1' &&
  !!process.env.SPARKY_FITNESS_DB_HOST &&
  /(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? '');

describe.runIf(hasTestDatabase)(
  'saved barcode ordering (real PostgreSQL)',
  () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const barcode = '4006381333931';
    const firstId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let client: pg.Client & { release: () => void };

    beforeAll(async () => {
      client = Object.assign(
        new pg.Client({
          host: process.env.SPARKY_FITNESS_DB_HOST,
          port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
          database: process.env.SPARKY_FITNESS_DB_NAME,
          user: process.env.SPARKY_FITNESS_DB_USER,
          password: process.env.SPARKY_FITNESS_DB_PASSWORD,
          connectionTimeoutMillis: 5000,
        }),
        { release: () => {} }
      );
      await client.connect();
      // Session-local copies exercise the actual repository SQL without changing
      // persistent foods, users, variants or row-level security policies.
      await client.query(`
      CREATE TEMP TABLE foods (LIKE public.foods INCLUDING DEFAULTS);
      CREATE TEMP TABLE food_variants (LIKE public.food_variants INCLUDING DEFAULTS);
    `);
      vi.mocked(getClient).mockResolvedValue(client);
    });

    beforeEach(async () => {
      await client.query('TRUNCATE pg_temp.foods');
    });

    afterAll(async () => {
      await client?.end();
    });

    async function insertFood(
      id: string,
      custom: boolean | null,
      updatedAt: string | null
    ) {
      await client.query(
        `INSERT INTO pg_temp.foods
         (id, user_id, name, barcode, is_custom, updated_at, is_quick_food)
       VALUES ($1, $2, 'Barcode fixture', $3, $4, $5, FALSE)`,
        [id, userId, barcode, custom, updatedAt]
      );
    }

    it('keeps a custom food ahead of a newer imported alternative', async () => {
      await insertFood(firstId, false, '2026-10-24T12:00:00Z');
      await insertFood(secondId, true, '2026-10-20T12:00:00Z');

      expect((await findFoodByBarcode(barcode, userId))?.id).toBe(secondId);
    });

    it('chooses the most recently updated food within the same kind', async () => {
      await insertFood(firstId, false, '2026-10-20T12:00:00Z');
      await insertFood(secondId, false, '2026-10-24T12:00:00Z');

      expect((await findFoodByBarcode(barcode, userId))?.id).toBe(secondId);
    });

    it('breaks identical update times by ID instead of insertion order', async () => {
      await insertFood(secondId, true, '2026-10-24T12:00:00Z');
      await insertFood(firstId, true, '2026-10-24T12:00:00Z');

      expect((await findFoodByBarcode(barcode, userId))?.id).toBe(firstId);
    });

    it('does not let a missing custom flag or update time outrank known values', async () => {
      await insertFood(firstId, null, '2026-10-25T12:00:00Z');
      await insertFood(secondId, true, null);

      expect((await findFoodByBarcode(barcode, userId))?.id).toBe(secondId);
      await client.query('UPDATE pg_temp.foods SET is_custom = TRUE');
      expect((await findFoodByBarcode(barcode, userId))?.id).toBe(firstId);
    });
  }
);
