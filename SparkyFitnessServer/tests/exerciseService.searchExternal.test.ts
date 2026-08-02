import { vi, beforeEach, describe, expect, it } from 'vitest';
import {
  externalExerciseSearchItemSchema,
  paginatedExternalExerciseSearchResultSchema,
} from '@workspace/shared';
import wgerService from '../integrations/wger/wgerService.js';
import freeExerciseDBService from '../integrations/freeexercisedb/FreeExerciseDBService.js';
import exerciseService from '../services/exerciseService.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../models/exerciseRepository', () => ({}));
vi.mock('../models/exercise', () => ({ default: {} }));
vi.mock('../models/exerciseEntry', () => ({ default: {} }));
vi.mock('../models/activityDetailsRepository', () => ({}));
vi.mock('../models/exercisePresetEntryRepository.js', () => ({ default: {} }));
vi.mock('../models/preferenceRepository', () => ({}));
vi.mock('../models/workoutPresetRepository', () => ({ default: {} }));
vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../integrations/wger/wgerService', () => ({
  default: {
    searchWgerExercises: vi.fn(),
    getWgerMuscleIdMap: vi.fn(),
    getWgerEquipmentIdMap: vi.fn(),
  },
}));
vi.mock('../integrations/nutritionix/nutritionixService', () => ({
  default: {},
}));
vi.mock('../integrations/freeexercisedb/FreeExerciseDBService', () => ({
  default: {
    searchExercises: vi.fn(),
    getExerciseImageUrl: vi.fn(),
  },
}));
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

const userId = 'user-1';

describe('exerciseService.searchExternalExercises', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('wger projection', () => {
    beforeEach(() => {
      // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
      wgerService.getWgerMuscleIdMap.mockResolvedValue({});
      // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
      wgerService.getWgerEquipmentIdMap.mockResolvedValue({});
    });

    it('normalizes HTML instructions and maps equipment/muscles like the import path', async () => {
      // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
      wgerService.searchWgerExercises.mockResolvedValue({
        totalCount: 1,
        exercises: [
          {
            id: '42',
            name: 'Barbell Squat',
            category: { name: 'Legs' },
            force: 'push',
            mechanic: 'compound',
            // searchWgerExercises passes the raw HTML description through as
            // `instructions`.
            instructions:
              '<p>Intro</p><ol><li>Step one</li><li>Step two</li></ol>',
            images: ['https://wger.de/media/squat.png'],
            equipment: [{ name: 'Barbell' }, { name: 'Mystery Thing' }],
            muscles: [{ name: 'Quadriceps femoris' }],
            muscles_secondary: [{ name: 'Gluteus maximus' }],
          },
        ],
      });

      const result = await exerciseService.searchExternalExercises(
        userId,
        'squat',
        'provider-1',
        'wger',
        [],
        [],
        'en',
        1,
        20
      );

      const parsed = paginatedExternalExerciseSearchResultSchema.parse(result);
      expect(parsed.items).toEqual([
        {
          id: '42',
          name: 'Barbell Squat',
          category: 'Legs',
          modality: 'weight_reps',
          calories_per_hour: 0,
          source: 'wger',
          description: 'Intro',
          force: 'push',
          mechanic: 'compound',
          equipment: ['barbell', 'Mystery Thing'],
          primary_muscles: ['quadriceps'],
          secondary_muscles: ['glutes'],
          instructions: ['Intro', '- Step one', '- Step two'],
          images: ['https://wger.de/media/squat.png'],
        },
      ]);
      expect(parsed.pagination).toEqual({
        page: 1,
        pageSize: 20,
        totalCount: 1,
        hasMore: false,
      });
    });

    it('falls back to the exercise name as description when there are no instructions', async () => {
      // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
      wgerService.searchWgerExercises.mockResolvedValue({
        totalCount: 1,
        exercises: [
          {
            id: '7',
            name: 'Plank',
            category: null,
            force: null,
            mechanic: null,
            instructions: '',
            images: [],
            equipment: [],
            muscles: [],
            muscles_secondary: [],
          },
        ],
      });

      const result = await exerciseService.searchExternalExercises(
        userId,
        'plank',
        'provider-1',
        'wger',
        [],
        [],
        'en',
        1,
        20
      );

      const [item] = result.items.map((raw: unknown) =>
        externalExerciseSearchItemSchema.parse(raw)
      );
      expect(item.description).toBe('Plank');
      expect(item.instructions).toEqual([]);
      expect(item.category).toBe('Uncategorized');
    });
  });

  describe('free-exercise-db projection', () => {
    it('coerces scalar fields to arrays and resolves image urls', async () => {
      // @ts-expect-error TS(2339): mockResolvedValue not on typed function.
      freeExerciseDBService.searchExercises.mockResolvedValue({
        totalCount: 1,
        exercises: [
          {
            id: 'Air_Bike',
            name: 'Air Bike',
            category: 'strength',
            description: 'Lie on the floor.',
            force: 'pull',
            level: 'beginner',
            mechanic: 'compound',
            equipment: 'body only',
            primaryMuscles: 'abdominals',
            secondaryMuscles: [],
            instructions: ['Lie on the floor.', 'Pedal in the air.'],
            images: ['Air_Bike/0.jpg'],
          },
        ],
      });
      // @ts-expect-error TS(2339): mockImplementation not on typed function.
      freeExerciseDBService.getExerciseImageUrl.mockImplementation(
        (img: string) => `/uploads/free-exercise-db/${img}`
      );

      const result = await exerciseService.searchExternalExercises(
        userId,
        'air bike',
        'provider-2',
        'free-exercise-db',
        [],
        [],
        'en',
        1,
        20
      );

      const parsed = paginatedExternalExerciseSearchResultSchema.parse(result);
      expect(parsed.items).toEqual([
        {
          id: 'Air_Bike',
          name: 'Air Bike',
          category: 'strength',
          modality: 'weight_reps',
          calories_per_hour: 0,
          source: 'free-exercise-db',
          description: 'Lie on the floor.',
          force: 'pull',
          level: 'beginner',
          mechanic: 'compound',
          equipment: ['body only'],
          primary_muscles: ['abdominals'],
          secondary_muscles: [],
          instructions: ['Lie on the floor.', 'Pedal in the air.'],
          images: ['/uploads/free-exercise-db/Air_Bike/0.jpg'],
        },
      ]);
    });
  });
});
