import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseDb from '../models/exercise.js';
import freeExerciseDBService from '../integrations/freeexercisedb/FreeExerciseDBService.js';
import wgerService from '../integrations/wger/wgerService.js';
import calorieCalculationService from '../services/CalorieCalculationService.js';
import exerciseService from '../services/exerciseService.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../models/exerciseRepository', () => ({}));
vi.mock('../models/exercise', () => ({
  default: {
    getExerciseBySourceAndSourceId: vi.fn(),
    createExercise: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry', () => ({ default: {} }));
vi.mock('../models/activityDetailsRepository', () => ({}));
vi.mock('../models/exercisePresetEntryRepository.js', () => ({ default: {} }));
vi.mock('../models/preferenceRepository', () => ({}));
vi.mock('../models/workoutPresetRepository', () => ({ default: {} }));
vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../integrations/wger/wgerService', () => ({
  default: {
    getWgerExerciseDetails: vi.fn(),
    extractWgerText: vi.fn(),
  },
}));
vi.mock('../integrations/nutritionix/nutritionixService', () => ({}));
vi.mock('../integrations/freeexercisedb/FreeExerciseDBService', () => ({
  default: {
    getExerciseById: vi.fn(),
    getExerciseImageUrl: vi.fn(),
  },
}));
vi.mock('../models/measurementRepository', () => ({}));
vi.mock('../utils/imageDownloader', () => ({ downloadImage: vi.fn() }));
vi.mock('../services/CalorieCalculationService', () => ({
  default: {
    estimateCaloriesBurnedPerHour: vi.fn(),
  },
}));
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

describe('external exercise import dedup', () => {
  const userId = 'user-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addFreeExerciseDBExerciseToUserExercises', () => {
    it('returns the existing exercise without re-importing when the user already has a copy', async () => {
      const existing = {
        id: 'existing-uuid',
        source: 'free-exercise-db',
        source_id: 'Barbell_Bench_Press',
        user_id: userId,
      };
      // @ts-expect-error TS(2339): mock method not on typed function.
      exerciseDb.getExerciseBySourceAndSourceId.mockResolvedValueOnce(existing);

      const result =
        await exerciseService.addFreeExerciseDBExerciseToUserExercises(
          userId,
          'Barbell_Bench_Press'
        );

      expect(result).toBe(existing);
      expect(exerciseDb.getExerciseBySourceAndSourceId).toHaveBeenCalledWith(
        'free-exercise-db',
        'Barbell_Bench_Press',
        userId
      );
      expect(freeExerciseDBService.getExerciseById).not.toHaveBeenCalled();
      expect(exerciseDb.createExercise).not.toHaveBeenCalled();
    });

    it('imports the exercise when the user has no copy yet', async () => {
      // @ts-expect-error TS(2339): mock method not on typed function.
      exerciseDb.getExerciseBySourceAndSourceId.mockResolvedValueOnce(
        undefined
      );
      // @ts-expect-error TS(2339): mock method not on typed function.
      freeExerciseDBService.getExerciseById.mockResolvedValueOnce({
        id: 'Barbell_Bench_Press',
        name: 'Barbell Bench Press',
        force: 'push',
        level: 'intermediate',
        mechanic: 'compound',
        equipment: 'barbell',
        primaryMuscles: ['chest'],
        secondaryMuscles: ['triceps'],
        instructions: ['Lie on the bench.'],
        category: 'strength',
        images: [],
      });
      // @ts-expect-error TS(2339): mock method not on typed function.
      calorieCalculationService.estimateCaloriesBurnedPerHour.mockResolvedValueOnce(
        300
      );
      const created = { id: 'created-uuid' };
      // @ts-expect-error TS(2339): mock method not on typed function.
      exerciseDb.createExercise.mockResolvedValueOnce(created);

      const result =
        await exerciseService.addFreeExerciseDBExerciseToUserExercises(
          userId,
          'Barbell_Bench_Press'
        );

      expect(result).toBe(created);
      expect(exerciseDb.createExercise).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'free-exercise-db',
          source_id: 'Barbell_Bench_Press',
          user_id: userId,
        })
      );
    });
  });

  describe('addExternalExerciseToUserExercises (wger)', () => {
    it('returns the existing exercise without re-importing when the user already has a copy', async () => {
      const existing = {
        id: 'existing-uuid',
        source: 'wger',
        source_id: '345',
        user_id: userId,
      };
      // @ts-expect-error TS(2339): mock method not on typed function.
      exerciseDb.getExerciseBySourceAndSourceId.mockResolvedValueOnce(existing);

      const result = await exerciseService.addExternalExerciseToUserExercises(
        userId,
        345
      );

      expect(result).toBe(existing);
      expect(exerciseDb.getExerciseBySourceAndSourceId).toHaveBeenCalledWith(
        'wger',
        '345',
        userId
      );
      expect(wgerService.getWgerExerciseDetails).not.toHaveBeenCalled();
      expect(exerciseDb.createExercise).not.toHaveBeenCalled();
    });

    it('persists the wger id as source_id when importing a new exercise', async () => {
      // @ts-expect-error TS(2339): mock method not on typed function.
      exerciseDb.getExerciseBySourceAndSourceId.mockResolvedValueOnce(
        undefined
      );
      // @ts-expect-error TS(2339): mock method not on typed function.
      wgerService.getWgerExerciseDetails.mockResolvedValueOnce({
        id: 345,
        translations: [],
        category: { name: 'Chest' },
        equipment: [],
        muscles: [],
        muscles_secondary: [],
        images: [],
        force: null,
        mechanic: null,
      });
      // @ts-expect-error TS(2339): mock method not on typed function.
      wgerService.extractWgerText.mockReturnValueOnce({
        exerciseName: 'Bench Press',
        description: '<p>Lie on the bench.</p>',
      });
      // @ts-expect-error TS(2339): mock method not on typed function.
      calorieCalculationService.estimateCaloriesBurnedPerHour.mockResolvedValueOnce(
        300
      );
      const created = { id: 'created-uuid' };
      // @ts-expect-error TS(2339): mock method not on typed function.
      exerciseDb.createExercise.mockResolvedValueOnce(created);

      const result = await exerciseService.addExternalExerciseToUserExercises(
        userId,
        345
      );

      expect(result).toBe(created);
      expect(exerciseDb.createExercise).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'wger',
          source_id: '345',
          user_id: userId,
        })
      );
    });
  });
});
