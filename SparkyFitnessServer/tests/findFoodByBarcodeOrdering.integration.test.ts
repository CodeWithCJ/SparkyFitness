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
    const ownerId = '22222222-2222-4222-8222-222222222222';
    const family = { includeFamily: true };
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
      CREATE TEMP TABLE family_access (LIKE public.family_access INCLUDING DEFAULTS);
    `);
      vi.mocked(getClient).mockResolvedValue(client);
    });

    beforeEach(async () => {
      await client.query('TRUNCATE pg_temp.foods, pg_temp.family_access');
    });

    afterAll(async () => {
      await client?.end();
    });

    async function insertFood(
      id: string,
      custom: boolean | null,
      updatedAt: string | null,
      ownerId: string = userId
    ) {
      await client.query(
        `INSERT INTO pg_temp.foods
         (id, user_id, name, barcode, is_custom, updated_at, is_quick_food)
       VALUES ($1, $2, 'Barcode fixture', $3, $4, $5, FALSE)`,
        [id, ownerId, barcode, custom, updatedAt]
      );
    }

    async function shareLibrary(
      permissions: Record<string, boolean>,
      overrides: { isActive?: boolean; endDate?: string | null } = {}
    ) {
      await client.query(
        `INSERT INTO pg_temp.family_access
         (owner_user_id, family_user_id, family_email, access_permissions, is_active, access_end_date)
       VALUES ($1, $2, 'family@example.com', $3, $4, $5)`,
        [
          ownerId,
          userId,
          JSON.stringify(permissions),
          overrides.isActive ?? true,
          overrides.endDate ?? null,
        ]
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

    it('matches a food shared through View Food Library when asked to', async () => {
      await insertFood(firstId, true, '2026-10-24T12:00:00Z', ownerId);
      await shareLibrary({ can_view_food_library: true });

      expect(await findFoodByBarcode(barcode, userId)).toBeNull();
      expect((await findFoodByBarcode(barcode, userId, family))?.id).toBe(
        firstId
      );
    });

    it("keeps the user's own food ahead of a shared one", async () => {
      await insertFood(firstId, true, '2026-10-25T12:00:00Z', ownerId);
      await insertFood(secondId, false, '2026-10-20T12:00:00Z');
      await shareLibrary({ can_view_food_library: true });

      expect((await findFoodByBarcode(barcode, userId, family))?.id).toBe(
        secondId
      );
    });

    it("ignores another user's food without an active library share", async () => {
      await insertFood(firstId, true, '2026-10-24T12:00:00Z', ownerId);
      expect(await findFoodByBarcode(barcode, userId, family)).toBeNull();

      await shareLibrary({ can_manage_diary: true });
      expect(await findFoodByBarcode(barcode, userId, family)).toBeNull();

      await client.query('TRUNCATE pg_temp.family_access');
      await shareLibrary({ can_view_food_library: true }, { isActive: false });
      expect(await findFoodByBarcode(barcode, userId, family)).toBeNull();

      await client.query('TRUNCATE pg_temp.family_access');
      await shareLibrary(
        { can_view_food_library: true },
        { endDate: '2020-01-01T00:00:00Z' }
      );
      expect(await findFoodByBarcode(barcode, userId, family)).toBeNull();
    });
  }
);
