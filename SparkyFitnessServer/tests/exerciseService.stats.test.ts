import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseEntryDb from '../models/exerciseEntry.js';
import exerciseService from '../services/exerciseService.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../models/exerciseRepository', () => ({}));
vi.mock('../models/exercise', () => ({ default: {} }));
vi.mock('../models/exerciseEntry', () => ({
  default: {
    getBestSetForExercise: vi.fn(),
    getLastSetForExercise: vi.fn(),
  },
}));
vi.mock('../models/activityDetailsRepository', () => ({}));
vi.mock('../models/exercisePresetEntryRepository.js', () => ({ default: {} }));
vi.mock('../models/preferenceRepository', () => ({}));
vi.mock('../models/workoutPresetRepository', () => ({ default: {} }));
vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../integrations/wger/wgerService', () => ({}));
vi.mock('../integrations/nutritionix/nutritionixService', () => ({}));
vi.mock('../integrations/freeexercisedb/FreeExerciseDBService', () => ({}));
vi.mock('../models/measurementRepository', () => ({}));
vi.mock('../utils/imageDownloader', () => ({ downloadImage: vi.fn() }));
vi.mock('../services/CalorieCalculationService', () => ({ default: {} }));
vi.mock('../utils/uuidUtils', () => ({
  isValidUuid: vi.fn(),
  resolveExerciseIdToUuid: vi.fn(),
}));
vi.mock('../models/familyAccessRepository', () => ({
  checkFamilyAccessPermission: vi.fn(),
}));
vi.mock('../services/exerciseEntryHistoryService', () => ({
  getGroupedExerciseSessionById: vi.fn(),
  getGroupedExerciseSessionByIdWithClient: vi.fn(),
}));

describe('exerciseService.getExerciseStats', () => {
  const userId = 'user-1';
  const exerciseId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns mapped best and last sets and runs both queries in parallel', async () => {
    let resolveBest: (value: unknown) => void = () => {};
    let resolveLast: (value: unknown) => void = () => {};
    const bestPromise = new Promise((resolve) => {
      resolveBest = resolve;
    });
    const lastPromise = new Promise((resolve) => {
      resolveLast = resolve;
    });
    // @ts-expect-error TS(2339): mockImplementation not on typed function.
    exerciseEntryDb.getBestSetForExercise.mockImplementation(() => bestPromise);
    // @ts-expect-error TS(2339): mockImplementation not on typed function.
    exerciseEntryDb.getLastSetForExercise.mockImplementation(() => lastPromise);

    const statsPromise = exerciseService.getExerciseStats(userId, exerciseId);

    // Both DB calls must have been issued before either resolves -> parallel.
    expect(exerciseEntryDb.getBestSetForExercise).toHaveBeenCalledWith(
      userId,
      exerciseId,
      null
    );
    expect(exerciseEntryDb.getLastSetForExercise).toHaveBeenCalledWith(
      userId,
      exerciseId,
      null
    );

    resolveBest({
      entry_date: '2026-05-20',
      weight: 100,
      reps: 5,
      set_number: 3,
    });
    resolveLast({
      entry_date: '2026-05-19',
      weight: 80,
      reps: 8,
      set_number: 1,
    });

    const result = await statsPromise;

    expect(result).toEqual({
      bestSet: {
        entryDate: '2026-05-20',
        weight: 100,
        reps: 5,
        setNumber: 3,
      },
      lastSet: {
        entryDate: '2026-05-19',
        weight: 80,
        reps: 8,
        setNumber: 1,
      },
    });
  });

  it('returns null bestSet when there are no weighted sets', async () => {
    // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
    exerciseEntryDb.getBestSetForExercise.mockResolvedValue(null);
    // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
    exerciseEntryDb.getLastSetForExercise.mockResolvedValue({
      entry_date: '2026-05-19',
      weight: null,
      reps: 10,
      set_number: 2,
    });

    const result = await exerciseService.getExerciseStats(userId, exerciseId);

    expect(result).toEqual({
      bestSet: null,
      lastSet: {
        entryDate: '2026-05-19',
        weight: null,
        reps: 10,
        setNumber: 2,
      },
    });
  });

  it('returns both nulls when the user has no history for the exercise', async () => {
    // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
    exerciseEntryDb.getBestSetForExercise.mockResolvedValue(null);
    // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
    exerciseEntryDb.getLastSetForExercise.mockResolvedValue(null);

    const result = await exerciseService.getExerciseStats(userId, exerciseId);

    expect(result).toEqual({ bestSet: null, lastSet: null });
  });

  it('forwards excludePresetEntryId to both model queries', async () => {
    const excludePresetEntryId = '22222222-2222-4222-8222-222222222222';
    // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
    exerciseEntryDb.getBestSetForExercise.mockResolvedValue(null);
    // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
    exerciseEntryDb.getLastSetForExercise.mockResolvedValue(null);

    await exerciseService.getExerciseStats(
      userId,
      exerciseId,
      excludePresetEntryId
    );

    expect(exerciseEntryDb.getBestSetForExercise).toHaveBeenCalledWith(
      userId,
      exerciseId,
      excludePresetEntryId
    );
    expect(exerciseEntryDb.getLastSetForExercise).toHaveBeenCalledWith(
      userId,
      exerciseId,
      excludePresetEntryId
    );
  });

  it('passes entry_date through untouched (already day-string from ::TEXT)', async () => {
    // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
    exerciseEntryDb.getBestSetForExercise.mockResolvedValue({
      entry_date: '2025-12-31',
      weight: 50,
      reps: 12,
      set_number: 1,
    });
    // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
    exerciseEntryDb.getLastSetForExercise.mockResolvedValue(null);

    const result = await exerciseService.getExerciseStats(userId, exerciseId);

    expect(result.bestSet?.entryDate).toBe('2025-12-31');
  });
});
