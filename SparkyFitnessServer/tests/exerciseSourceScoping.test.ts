import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import exerciseDb from '../models/exercise.js';
import { getSystemClient } from '../db/poolManager.js';
import { resolveExerciseIdToUuid } from '../utils/uuidUtils.js';
import exerciseRepository from '../models/exerciseRepository.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

vi.mock('../models/exerciseRepository', () => ({
  default: {
    getExerciseBySourceAndSourceId: vi.fn(),
  },
}));

describe('exercise source/source_id scoping', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = { query: vi.fn(), release: vi.fn() };
    // @ts-expect-error mock typing
    getSystemClient.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('exerciseDb.getExerciseBySourceAndSourceId', () => {
    it('filters on user_id when userId is provided', async () => {
      const userId = uuidv4();
      const rowId = uuidv4();
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: rowId,
            source: 'free-exercise-db',
            source_id: 'Barbell_Bench_Press',
            user_id: userId,
            images: null,
          },
        ],
      });

      const result = await exerciseDb.getExerciseBySourceAndSourceId(
        'free-exercise-db',
        'Barbell_Bench_Press',
        userId
      );

      expect(result.id).toBe(rowId);
      expect(mockClient.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).toContain('AND user_id = $3');
      expect(params).toEqual([
        'free-exercise-db',
        'Barbell_Bench_Press',
        userId,
      ]);
    });

    it('returns undefined when the requested user has no copy even if another user does', async () => {
      const userId = uuidv4();
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await exerciseDb.getExerciseBySourceAndSourceId(
        'free-exercise-db',
        'Barbell_Bench_Press',
        userId
      );

      expect(result).toBeUndefined();
      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).toContain('AND user_id = $3');
      expect(params[2]).toBe(userId);
    });
  });

  describe('resolveExerciseIdToUuid', () => {
    it('returns the input unchanged when it is already a UUID', async () => {
      const existingUuid = uuidv4();

      const result = await resolveExerciseIdToUuid(existingUuid, uuidv4());

      expect(result).toBe(existingUuid);
      expect(
        exerciseRepository.getExerciseBySourceAndSourceId
      ).not.toHaveBeenCalled();
    });

    it('forwards the userId to getExerciseBySourceAndSourceId so each user resolves to their own copy', async () => {
      const userId = uuidv4();
      const resolved = uuidv4();
      exerciseRepository.getExerciseBySourceAndSourceId.mockResolvedValueOnce({
        id: resolved,
      });

      const result = await resolveExerciseIdToUuid(
        'Barbell_Bench_Press',
        userId
      );

      expect(result).toBe(resolved);
      expect(
        exerciseRepository.getExerciseBySourceAndSourceId
      ).toHaveBeenCalledWith('free-exercise-db', 'Barbell_Bench_Press', userId);
    });

    it('throws when no exercise is found for the caller', async () => {
      exerciseRepository.getExerciseBySourceAndSourceId.mockResolvedValueOnce(
        undefined
      );

      await expect(
        resolveExerciseIdToUuid('Barbell_Bench_Press', uuidv4())
      ).rejects.toThrow(/not found or is not a valid UUID/);
    });
  });
});
