import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { searchWorkoutPresets } from '../models/workoutPresetRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('searchWorkoutPresets query builder', () => {
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
    await searchWorkoutPresets('full body push', 'user-1', 10);

    expect(mockClient.query).toHaveBeenCalled();
    const [sql, params] = mockClient.query.mock.calls[0];

    // Split terms should be first for WHERE clause
    expect(params[0]).toBe('%full%');
    expect(params[1]).toBe('%body%');
    expect(params[2]).toBe('%push%');
    expect(params.slice(3, 7)).toEqual([
      'full body push',
      'full body push%',
      '\\mfull body push\\M',
      '%full body push%',
    ]);
    // Limit should be last
    expect(params[7]).toBe(10);

    expect(sql).toContain('wp.name ILIKE $1');
    expect(sql).toContain('wp.name ILIKE $2');
    expect(sql).toContain('wp.name ILIKE $3');
    expect(sql).toContain(
      'ORDER BY (CASE WHEN LOWER(wp.name) = LOWER($4::text) THEN 0 WHEN wp.name ILIKE $5::text THEN 1 WHEN wp.name ~* $6::text THEN 2 WHEN wp.name ILIKE $7::text THEN 3 ELSE 4 END), wp.name ASC'
    );
    expect(sql).toContain('LIMIT $8');
  });
});
