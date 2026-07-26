import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import exerciseDb from '../models/exercise.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// Bind positions of `modality` in the two writer statements.
const CREATE_MODALITY_PARAM = 17;
const UPDATE_MODALITY_PARAM = 15;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lastQuery(mockClient: any): [string, unknown[]] {
  return mockClient.query.mock.calls[mockClient.query.mock.calls.length - 1];
}

describe('exercise modality writers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = { query: vi.fn(), release: vi.fn() };
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createExercise', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function captureCreateBind(exerciseData: any) {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: uuidv4() }] });
      await exerciseDb.createExercise({
        user_id: uuidv4(),
        name: 'Test Exercise',
        ...exerciseData,
      });
      return lastQuery(mockClient)[1][CREATE_MODALITY_PARAM];
    }

    it('derives modality from the category when none is supplied', async () => {
      expect(await captureCreateBind({ category: 'Cardio' })).toBe(
        'duration_distance'
      );
      expect(await captureCreateBind({ category: 'Isometrics' })).toBe(
        'duration'
      );
      expect(await captureCreateBind({ category: 'strength' })).toBe(
        'weight_reps'
      );
    });

    it('derives weight_reps when the category is absent', async () => {
      expect(await captureCreateBind({})).toBe('weight_reps');
    });

    it('stores an explicit valid modality instead of the derived one', async () => {
      expect(
        await captureCreateBind({ category: 'Cardio', modality: 'reps_only' })
      ).toBe('reps_only');
    });

    it('sanitizes an unrecognized modality to the derived value', async () => {
      expect(
        await captureCreateBind({ category: 'Cardio', modality: 'time_only' })
      ).toBe('duration_distance');
      expect(
        await captureCreateBind({ category: 'strength', modality: 42 })
      ).toBe('weight_reps');
    });

    it('writes modality into the INSERT column list', async () => {
      await captureCreateBind({ category: 'strength' });
      expect(lastQuery(mockClient)[0]).toContain('modality');
    });
  });

  describe('updateExercise', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function captureUpdateBind(updateData: any) {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: uuidv4() }] });
      await exerciseDb.updateExercise(uuidv4(), uuidv4(), updateData);
      return lastQuery(mockClient)[1][UPDATE_MODALITY_PARAM];
    }

    it('passes a valid modality through', async () => {
      expect(await captureUpdateBind({ modality: 'duration' })).toBe(
        'duration'
      );
    });

    // COALESCE($16, modality) keeps the stored value when the bind is null.
    it('binds null when modality is omitted', async () => {
      expect(await captureUpdateBind({ name: 'Renamed' })).toBeNull();
    });

    it('binds null for an unrecognized modality rather than failing the CHECK', async () => {
      expect(await captureUpdateBind({ modality: 'time_only' })).toBeNull();
    });

    it('does not re-derive modality when only the category changes', async () => {
      expect(await captureUpdateBind({ category: 'Cardio' })).toBeNull();
    });

    it('keeps the exercise id as the last bind after the modality param', async () => {
      const id = uuidv4();
      mockClient.query.mockResolvedValueOnce({ rows: [{ id }] });
      await exerciseDb.updateExercise(id, uuidv4(), { modality: 'duration' });
      const params = lastQuery(mockClient)[1];
      expect(params[UPDATE_MODALITY_PARAM + 1]).toBe(id);
      expect(params).toHaveLength(UPDATE_MODALITY_PARAM + 2);
    });
  });

  describe('getOrCreateActiveCaloriesExercise', () => {
    it('labels the bootstrapped Cardio exercise duration_distance', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: uuidv4() }] });

      await exerciseDb.getOrCreateActiveCaloriesExercise(uuidv4());

      const insertParams = lastQuery(mockClient)[1];
      expect(insertParams[insertParams.length - 1]).toBe('duration_distance');
    });
  });
});
