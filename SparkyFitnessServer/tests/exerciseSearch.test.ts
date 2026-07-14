import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import exerciseDb from '../models/exercise.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('exercise model search query builder', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{ count: '10' }] }),
      release: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getExercisesWithPagination', () => {
    it('handles empty search terms without building ILIKE clauses or relevance order', async () => {
      await exerciseDb.getExercisesWithPagination(
        'user-1',
        '',
        null,
        null,
        [],
        [],
        10,
        0
      );

      expect(mockClient.query).toHaveBeenCalled();
      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).not.toContain('ILIKE');
      expect(sql).toContain('ORDER BY name ASC');
      // The only queryParams should be limit and offset
      expect(params).toEqual([10, 0]);
    });

    it('splits multi-word search queries and prioritizes exact match in order clause', async () => {
      await exerciseDb.getExercisesWithPagination(
        'user-1',
        'lunge barbell',
        null,
        null,
        [],
        [],
        10,
        0
      );

      expect(mockClient.query).toHaveBeenCalled();
      const [sql, params] = mockClient.query.mock.calls[0];

      // Split terms should be first for WHERE clause
      expect(params[0]).toBe('%lunge%');
      expect(params[1]).toBe('%barbell%');
      // Exact match pattern should follow at the end before pagination
      expect(params[2]).toBe('%lunge barbell%');

      expect(sql).toContain('name ILIKE $1');
      expect(sql).toContain('name ILIKE $2');
      expect(sql).toContain(
        '(CASE WHEN name ILIKE $3::text THEN 0 ELSE 1 END), name ASC'
      );
    });

    it('cleans surrounding punctuation from search terms', async () => {
      await exerciseDb.getExercisesWithPagination(
        'user-1',
        'lunge (barbell), leg!',
        null,
        null,
        [],
        [],
        10,
        0
      );

      expect(mockClient.query).toHaveBeenCalled();
      const [, params] = mockClient.query.mock.calls[0];

      // Should split on whitespace and replace leading/trailing punctuation: ["lunge", "barbell", "leg"]
      expect(params[0]).toBe('%lunge%');
      expect(params[1]).toBe('%barbell%');
      expect(params[2]).toBe('%leg%');
    });
  });

  describe('countExercises', () => {
    it('uses split terms but does not push exact match parameter for counting', async () => {
      await exerciseDb.countExercises(
        'user-1',
        'lunge barbell',
        null,
        null,
        [],
        []
      );

      expect(mockClient.query).toHaveBeenCalled();
      const [sql, params] = mockClient.query.mock.calls[0];

      // Counting doesn't order, so it doesn't need the exact match pattern.
      // It should only have the split term patterns.
      expect(params).toEqual(['%lunge%', '%barbell%']);
      expect(sql).toContain('SELECT COUNT(*)');
      expect(sql).toContain('name ILIKE $1 AND name ILIKE $2');
    });
  });

  describe('searchExercises', () => {
    it('applies split terms and relevance ordering to searchExercises', async () => {
      await exerciseDb.searchExercises('lunge barbell', 'user-1', [], []);

      expect(mockClient.query).toHaveBeenCalled();
      const [sql, params] = mockClient.query.mock.calls[0];

      expect(params[0]).toBe('%lunge%');
      expect(params[1]).toBe('%barbell%');
      expect(params[2]).toBe('%lunge barbell%');
      expect(sql).toContain(
        'WHERE is_quick_exercise = FALSE AND name ILIKE $1 AND name ILIKE $2'
      );
      expect(sql).toContain(
        'ORDER BY (CASE WHEN name ILIKE $3::text THEN 0 ELSE 1 END), name ASC'
      );
      expect(sql).toContain('LIMIT 50');
    });
  });

  describe('searchExercisesPaginated', () => {
    it('combines split search, counting, and paginated queries correctly', async () => {
      // Mock first query (COUNT) and second query (SELECT)
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: 12 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await exerciseDb.searchExercisesPaginated(
        'lunge barbell',
        'user-1',
        [],
        [],
        5,
        10
      );

      expect(mockClient.query).toHaveBeenCalledTimes(2);

      // Check COUNT query
      const [countSql, countParams] = mockClient.query.mock.calls[0];
      expect(countSql).toContain('SELECT COUNT(*)::int AS count');
      // Count query should only receive split terms for the where clauses
      expect(countParams).toEqual(['%lunge%', '%barbell%']);
      expect(countSql).toContain('name ILIKE $1 AND name ILIKE $2');

      // Check SELECT query
      const [selectSql, selectParams] = mockClient.query.mock.calls[1];
      expect(selectSql).toContain(
        'ORDER BY (CASE WHEN name ILIKE $3::text THEN 0 ELSE 1 END), name ASC'
      );
      expect(selectSql).toContain('LIMIT $4 OFFSET $5');
      expect(selectParams).toEqual([
        '%lunge%', // $1
        '%barbell%', // $2
        '%lunge barbell%', // $3
        5, // $4 (limit)
        10, // $5 (offset)
      ]);

      expect(result.totalCount).toBe(12);
    });
  });
});
