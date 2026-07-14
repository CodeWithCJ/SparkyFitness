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
  });
});
