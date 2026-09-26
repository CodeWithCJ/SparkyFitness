import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import foodDb from '../models/food.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('food model search query builder', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getFoodsWithPagination', () => {
    it('splits multi-word search queries and prioritizes exact match of brand + name', async () => {
      await foodDb.getFoodsWithPagination(
        'whey protein gold',
        null,
        'user-1',
        10,
        0,
        null
      );

      expect(mockClient.query).toHaveBeenCalled();
      const [sql, params] = mockClient.query.mock.calls[0];

      // Split terms
      expect(params[0]).toBe('%whey%');
      expect(params[1]).toBe('%protein%');
      expect(params[2]).toBe('%gold%');
      // Exact match brand + name
      expect(params[3]).toBe('%whey protein gold%');
      // Limit, offset
      expect(params[4]).toBe(10);
      expect(params[5]).toBe(0);

      expect(sql).toContain("CONCAT(f.brand, ' ', f.name) ILIKE $1");
      expect(sql).toContain("CONCAT(f.brand, ' ', f.name) ILIKE $2");
      expect(sql).toContain("CONCAT(f.brand, ' ', f.name) ILIKE $3");
      expect(sql).toContain(
        "ORDER BY (CASE WHEN CONCAT(f.brand, ' ', f.name) ILIKE $4::text THEN 0 ELSE 1 END), f.name ASC, f.id ASC"
      );
      expect(sql).toContain('LIMIT $5 OFFSET $6');
    });

    describe('provider (data source) filtering', () => {
      it('binds a valid provider type as a parameter after limit/offset ordering is intact', async () => {
        await foodDb.getFoodsWithPagination(
          'whey protein',
          null,
          'user-1',
          10,
          0,
          null,
          'usda'
        );

        const [sql, params] = mockClient.query.mock.calls[0];

        expect(params).toEqual([
          '%whey%',
          '%protein%',
          'usda',
          '%whey protein%',
          10,
          0,
        ]);
        expect(sql).toContain('f.provider_type = $3');
        expect(sql).toContain(
          "ORDER BY (CASE WHEN CONCAT(f.brand, ' ', f.name) ILIKE $4::text THEN 0 ELSE 1 END)"
        );
        expect(sql).toContain('LIMIT $5 OFFSET $6');
      });

      it('filters manual foods with IS NULL and adds no parameter', async () => {
        await foodDb.getFoodsWithPagination(
          null,
          null,
          'user-1',
          10,
          0,
          null,
          'manual'
        );

        const [sql, params] = mockClient.query.mock.calls[0];

        expect(params).toEqual([10, 0]);
        expect(sql).toContain('f.provider_type IS NULL');
        expect(sql).toContain('LIMIT $1 OFFSET $2');
      });

      it('ignores unknown provider values and applies no filter', async () => {
        await foodDb.getFoodsWithPagination(
          null,
          null,
          'user-1',
          10,
          0,
          null,
          'mystery'
        );

        const [sql, params] = mockClient.query.mock.calls[0];

        expect(params).toEqual([10, 0]);
        expect(sql).not.toContain('provider_type =');
        expect(sql).not.toContain('provider_type IS NULL');
      });

      it('applies no provider filter for "all" or omitted values', async () => {
        for (const providerType of ['all', undefined]) {
          mockClient.query.mockClear();
          await foodDb.getFoodsWithPagination(
            null,
            null,
            'user-1',
            10,
            0,
            null,
            providerType
          );

          const [sql, params] = mockClient.query.mock.calls[0];
          expect(params).toEqual([10, 0]);
          expect(sql).not.toContain('provider_type =');
          expect(sql).not.toContain('provider_type IS NULL');
        }
      });

      it('re-syncs param indices when the mine filter and provider filter combine', async () => {
        await foodDb.getFoodsWithPagination(
          null,
          'mine',
          'user-1',
          10,
          0,
          null,
          'fatsecret'
        );

        const [sql, params] = mockClient.query.mock.calls[0];

        expect(params).toEqual(['user-1', 'fatsecret', 10, 0]);
        expect(sql).toContain('f.user_id = $1');
        expect(sql).toContain('f.provider_type = $2');
        expect(sql).toContain('LIMIT $3 OFFSET $4');
      });
    });
  });

  describe('countFoods', () => {
    it('uses split terms but does not push exact match parameter for counting', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '15' }] });

      const count = await foodDb.countFoods(
        'whey protein gold',
        null,
        'user-1'
      );

      expect(mockClient.query).toHaveBeenCalled();
      const [sql, params] = mockClient.query.mock.calls[0];

      expect(params).toEqual(['%whey%', '%protein%', '%gold%']);
      expect(sql).toContain('SELECT COUNT(*)');
      expect(sql).toContain("CONCAT(brand, ' ', name) ILIKE $1");
      expect(sql).toContain("CONCAT(brand, ' ', name) ILIKE $2");
      expect(sql).toContain("CONCAT(brand, ' ', name) ILIKE $3");
      expect(count).toBe(15);
    });

    it('appends the provider filter last for a valid provider type', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '3' }] });

      const count = await foodDb.countFoods('whey', null, 'user-1', 'usda');

      const [sql, params] = mockClient.query.mock.calls[0];
      expect(params).toEqual(['%whey%', 'usda']);
      expect(sql).toContain('provider_type = $2');
      expect(count).toBe(3);
    });

    it('uses IS NULL for manual foods without adding a parameter', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const count = await foodDb.countFoods(null, null, 'user-1', 'manual');

      const [sql, params] = mockClient.query.mock.calls[0];
      expect(params).toEqual([]);
      expect(sql).toContain('provider_type IS NULL');
      expect(count).toBe(2);
    });

    it('ignores unknown provider values in the count', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ count: '7' }] });

      const count = await foodDb.countFoods(null, null, 'user-1', 'mystery');

      const [sql, params] = mockClient.query.mock.calls[0];
      expect(params).toEqual([]);
      expect(sql).not.toContain('provider_type');
      expect(count).toBe(7);
    });
  });
});
