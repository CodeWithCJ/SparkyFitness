import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import mealDb from '../models/mealRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('meal model search query builder', () => {
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

  it('splits multi-word search queries and prioritizes exact matches', async () => {
    await mealDb.searchMeals('chicken rice bowl', 'user-1', 10);

    expect(mockClient.query).toHaveBeenCalled();
    const [sql, params] = mockClient.query.mock.calls[0];

    // Split terms should be first for WHERE clause
    expect(params[0]).toBe('%chicken%');
    expect(params[1]).toBe('%rice%');
    expect(params[2]).toBe('%bowl%');
    // Exact match term should follow
    expect(params[3]).toBe('%chicken rice bowl%');
    // Limit should be last
    expect(params[4]).toBe(10);

    expect(sql).toContain('name ILIKE $1');
    expect(sql).toContain('name ILIKE $2');
    expect(sql).toContain('name ILIKE $3');
    expect(sql).toContain(
      'ORDER BY (CASE WHEN name ILIKE $4::text THEN 0 ELSE 1 END), name ASC'
    );
    expect(sql).toContain('LIMIT $5');
  });
});
