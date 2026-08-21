import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseDb from '../models/exercise.js';
import freeExerciseDBService from '../integrations/freeexercisedb/FreeExerciseDBService.js';
import wgerService from '../integrations/wger/wgerService.js';
import calorieCalculationService from '../services/CalorieCalculationService.js';
import exerciseService from '../services/exerciseService.js';
import { downloadImage } from '../utils/imageDownloader.js';

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
          // free-exercise-db's raw equipment is a bare string, not a
          // one-item array; passing it through unwrapped means createExercise
          // JSON.stringify's it into a JSON-encoded string that every later
          // reader's `.join()`/`.map()` then crashes on (#reports export).
          equipment: ['barbell'],
          // Fields free-exercise-db already returns as arrays must round-trip
          // unchanged, not get double-wrapped.
          primary_muscles: ['chest'],
          secondary_muscles: ['triceps'],
          instructions: ['Lie on the bench.'],
        })
      );
    });

    it('wraps a bare instructions string into a one-item array', async () => {
      // @ts-expect-error TS(2339): mock method not on typed function.
      exerciseDb.getExerciseBySourceAndSourceId.mockResolvedValueOnce(
        undefined
      );
      // @ts-expect-error TS(2339): mock method not on typed function.
      freeExerciseDBService.getExerciseById.mockResolvedValueOnce({
        id: 'Air_Bike',
        name: 'Air Bike',
        force: null,
        level: 'beginner',
        mechanic: null,
        equipment: null,
        primaryMuscles: ['abdominals'],
        secondaryMuscles: [],
        // A single-step exercise from the raw source: a bare string, not
        // a one-item array.
        instructions: 'Lie flat on the floor.',
        category: 'strength',
        images: [],
      });
      // @ts-expect-error TS(2339): mock method not on typed function.
      calorieCalculationService.estimateCaloriesBurnedPerHour.mockResolvedValueOnce(
        200
      );
      // @ts-expect-error TS(2339): mock method not on typed function.
      exerciseDb.createExercise.mockResolvedValueOnce({ id: 'created-uuid-2' });

      await exerciseService.addFreeExerciseDBExerciseToUserExercises(
        userId,
        'Air_Bike'
      );

      expect(exerciseDb.createExercise).toHaveBeenCalledWith(
        expect.objectContaining({
          equipment: [],
          secondary_muscles: [],
          instructions: ['Lie flat on the floor.'],
          // Must be the whole first instruction, not
          // exerciseDetails.instructions[0] indexing the raw bare string
          // (which would silently give just its first character, 'L').
          description: 'Lie flat on the floor.',
        })
      );
    });

    it('persists the downloaded image paths, not the upstream ones', async () => {
      // downloadImage appends a URL hash to the file name, so the upstream
      // `Name/0.jpg` never exists on disk; storing it 404s every thumbnail.
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
        images: ['Barbell_Bench_Press/0.jpg', 'Barbell_Bench_Press/1.jpg'],
      });
      // @ts-expect-error TS(2339): mock method not on typed function.
      freeExerciseDBService.getExerciseImageUrl.mockImplementation(
        (imagePath: string) => `https://cdn.example.com/${imagePath}`
      );
      vi.mocked(downloadImage).mockImplementation(async (imageUrl: string) => {
        const index = imageUrl.endsWith('0.jpg') ? '0' : '1';
        return `/uploads/exercises/Barbell_Bench_Press/${index}_ab12cd34.jpg`;
      });
      // @ts-expect-error TS(2339): mock method not on typed function.
      calorieCalculationService.estimateCaloriesBurnedPerHour.mockResolvedValueOnce(
        300
      );
      // @ts-expect-error TS(2339): mock method not on typed function.
      exerciseDb.createExercise.mockResolvedValueOnce({ id: 'created-uuid' });

      await exerciseService.addFreeExerciseDBExerciseToUserExercises(
        userId,
        'Barbell_Bench_Press'
      );

      expect(exerciseDb.createExercise).toHaveBeenCalledWith(
        expect.objectContaining({
          images: [
            'Barbell_Bench_Press/0_ab12cd34.jpg',
            'Barbell_Bench_Press/1_ab12cd34.jpg',
          ],
        })
      );
    });

    it('sanitizes the upload directory derived from the upstream path', async () => {
      // downloadImage path.join()s this value into the uploads dir unchecked,
      // so a `..` first segment would escape /uploads/exercises.
      // @ts-expect-error TS(2339): mock method not on typed function.
      exerciseDb.getExerciseBySourceAndSourceId.mockResolvedValueOnce(
        undefined
      );
      // @ts-expect-error TS(2339): mock method not on typed function.
      freeExerciseDBService.getExerciseById.mockResolvedValueOnce({
        id: 'evil',
        name: 'Evil',
        primaryMuscles: [],
        secondaryMuscles: [],
        instructions: ['x'],
        category: 'strength',
        images: ['../../../etc/0.jpg', '3_4_Sit-Up/0.jpg'],
      });
      // @ts-expect-error TS(2339): mock method not on typed function.
      freeExerciseDBService.getExerciseImageUrl.mockImplementation(
        (imagePath: string) => `https://cdn.example.com/${imagePath}`
      );
      vi.mocked(downloadImage).mockResolvedValue('/uploads/exercises/x/0.jpg');
      // @ts-expect-error TS(2339): mock method not on typed function.
      calorieCalculationService.estimateCaloriesBurnedPerHour.mockResolvedValueOnce(
        1
      );
      // @ts-expect-error TS(2339): mock method not on typed function.
      exerciseDb.createExercise.mockResolvedValueOnce({ id: 'created-uuid' });

      await exerciseService.addFreeExerciseDBExerciseToUserExercises(
        userId,
        'evil'
      );

      const dirs = vi.mocked(downloadImage).mock.calls.map((call) => call[1]);
      expect(dirs).not.toContain('..');
      expect(dirs[0]).toBe('__');
      // A legitimate id keeps its underscores and hyphens, so the
      // re-download-on-miss route can still resolve it upstream.
      expect(dirs[1]).toBe('3_4_Sit-Up');
    });

    it('skips an image whose download fails instead of failing the import', async () => {
      // @ts-expect-error TS(2339): mock method not on typed function.
      exerciseDb.getExerciseBySourceAndSourceId.mockResolvedValueOnce(
        undefined
      );
      // @ts-expect-error TS(2339): mock method not on typed function.
      freeExerciseDBService.getExerciseById.mockResolvedValueOnce({
        id: 'Barbell_Bench_Press',
        name: 'Barbell Bench Press',
        primaryMuscles: [],
        secondaryMuscles: [],
        instructions: ['Lie on the bench.'],
        category: 'strength',
        images: ['Barbell_Bench_Press/0.jpg', 'Barbell_Bench_Press/1.jpg'],
      });
      // @ts-expect-error TS(2339): mock method not on typed function.
      freeExerciseDBService.getExerciseImageUrl.mockImplementation(
        (imagePath: string) => `https://cdn.example.com/${imagePath}`
      );
      vi.mocked(downloadImage).mockImplementation(async (imageUrl: string) => {
        if (imageUrl.endsWith('0.jpg')) throw new Error('upstream 404');
        return '/uploads/exercises/Barbell_Bench_Press/1_ab12cd34.jpg';
      });
      // @ts-expect-error TS(2339): mock method not on typed function.
      calorieCalculationService.estimateCaloriesBurnedPerHour.mockResolvedValueOnce(
        300
      );
      // @ts-expect-error TS(2339): mock method not on typed function.
      exerciseDb.createExercise.mockResolvedValueOnce({ id: 'created-uuid' });

      await exerciseService.addFreeExerciseDBExerciseToUserExercises(
        userId,
        'Barbell_Bench_Press'
      );

      expect(exerciseDb.createExercise).toHaveBeenCalledWith(
        expect.objectContaining({
          images: ['Barbell_Bench_Press/1_ab12cd34.jpg'],
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
