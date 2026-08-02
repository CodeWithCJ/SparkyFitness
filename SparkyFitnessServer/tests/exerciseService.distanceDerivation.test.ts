import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseDb from '../models/exercise.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import calorieCalculationService from '../services/CalorieCalculationService.js';
import { resolveExerciseIdToUuid } from '../utils/uuidUtils.js';
import exerciseService from '../services/exerciseService.js';
vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../models/exerciseRepository', () => ({}));
vi.mock('../models/exercise', () => ({
  default: {
    getExerciseById: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry', () => ({
  default: {
    createExerciseEntry: vi.fn(),
    getExerciseEntryById: vi.fn(),
    updateExerciseEntry: vi.fn(),
  },
}));
vi.mock('../models/activityDetailsRepository', () => ({}));
vi.mock('../models/exercisePresetEntryRepository.js', () => ({
  default: {},
}));
vi.mock('../models/userRepository', () => ({}));
vi.mock('../models/preferenceRepository', () => ({}));
vi.mock('../models/workoutPresetRepository', () => ({
  default: {},
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));
vi.mock('../integrations/wger/wgerService', () => ({}));
vi.mock('../integrations/nutritionix/nutritionixService', () => ({}));
vi.mock('../integrations/freeexercisedb/FreeExerciseDBService', () => ({}));
vi.mock('../models/measurementRepository', () => ({}));
vi.mock('../utils/imageDownloader', () => ({
  downloadImage: vi.fn(),
}));
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

const exerciseId = '11111111-1111-4111-8111-111111111111';

describe('entry distance derivation on create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveExerciseIdToUuid).mockResolvedValue(exerciseId);
    // @ts-expect-error TS(2339): mockResolvedValue on mocked fn
    exerciseDb.getExerciseById.mockResolvedValue({
      id: exerciseId,
      name: 'Treadmill Run',
      calories_per_hour: 600,
    });
    // @ts-expect-error TS(2339): mockResolvedValue on mocked fn
    calorieCalculationService.estimateCaloriesBurnedPerHour.mockResolvedValue(
      600
    );
    // @ts-expect-error TS(2339): mockResolvedValue on mocked fn
    exerciseEntryDb.createExerciseEntry.mockResolvedValue({ id: 'entry-1' });
  });

  it('derives the entry total from set distances when no explicit value is sent', async () => {
    await exerciseService.createExerciseEntry('user-1', 'actor-1', {
      exercise_id: exerciseId,
      entry_date: '2026-07-26',
      sets: [
        { set_number: 1, duration: 1800, distance: 5.2 },
        { set_number: 2, duration: 600, distance: 1.3 },
      ],
    });
    const [, snapshotEntryData] = vi.mocked(exerciseEntryDb.createExerciseEntry)
      .mock.calls[0];
    expect(snapshotEntryData.distance).toBe(6.5);
  });

  it('keeps an explicit entry distance when sets carry none (import shape)', async () => {
    // Provider imports send entry-level totals with distance-less sets; a
    // distance-less set must never zero the imported entry distance.
    await exerciseService.createExerciseEntry('user-1', 'actor-1', {
      exercise_id: exerciseId,
      entry_date: '2026-07-26',
      distance: 12,
      sets: [{ set_number: 1, reps: 10 }],
    });
    const [, snapshotEntryData] = vi.mocked(exerciseEntryDb.createExerciseEntry)
      .mock.calls[0];
    expect(snapshotEntryData.distance).toBe(12);
  });

  it('stores null when neither entry nor sets carry a distance', async () => {
    await exerciseService.createExerciseEntry('user-1', 'actor-1', {
      exercise_id: exerciseId,
      entry_date: '2026-07-26',
      sets: [{ set_number: 1, reps: 10, weight: 60 }],
    });
    const [, snapshotEntryData] = vi.mocked(exerciseEntryDb.createExerciseEntry)
      .mock.calls[0];
    expect(snapshotEntryData.distance).toBeNull();
  });
});

describe('entry distance contract on individual update', () => {
  const existingEntry = {
    id: 'entry-1',
    exercise_id: exerciseId,
    entry_date: '2026-07-26',
    duration_minutes: 30,
    calories_burned: 100,
    notes: null,
    image_url: null,
    distance: 7.5,
    avg_heart_rate: null,
    steps: null,
    sort_order: 0,
    exercise_name: 'Treadmill Run',
    superset_group: null,
    entry_time: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error TS(2339): mockResolvedValue on mocked fn
    exerciseEntryDb.getExerciseEntryById.mockResolvedValue(existingEntry);
    // @ts-expect-error TS(2339): mockResolvedValue on mocked fn
    exerciseEntryDb.updateExerciseEntry.mockResolvedValue({ id: 'entry-1' });
  });

  const updatedDistance = () => {
    const [, , , updateData] = vi.mocked(exerciseEntryDb.updateExerciseEntry)
      .mock.calls[0];
    return updateData.distance;
  };

  it('lets an explicit number win over set-derived totals', async () => {
    await exerciseService.updateExerciseEntry('user-1', 'actor-1', 'entry-1', {
      distance: 3.3,
      sets: [{ set_number: 1, duration: 1800, distance: 9 }],
    });
    expect(updatedDistance()).toBe(3.3);
  });

  it('clears the entry distance on explicit null', async () => {
    await exerciseService.updateExerciseEntry('user-1', 'actor-1', 'entry-1', {
      distance: null,
    });
    expect(updatedDistance()).toBeNull();
  });

  it('derives from sets when the entry distance is omitted', async () => {
    await exerciseService.updateExerciseEntry('user-1', 'actor-1', 'entry-1', {
      sets: [
        { set_number: 1, duration: 600, distance: 2.5 },
        { set_number: 2, duration: 600, distance: 2.5 },
      ],
    });
    expect(updatedDistance()).toBe(5);
  });

  it('preserves the existing distance when omitted and sets carry none', async () => {
    await exerciseService.updateExerciseEntry('user-1', 'actor-1', 'entry-1', {
      sets: [{ set_number: 1, reps: 10, weight: 60 }],
    });
    expect(updatedDistance()).toBe(7.5);
  });

  it('preserves the existing distance when both are omitted', async () => {
    await exerciseService.updateExerciseEntry('user-1', 'actor-1', 'entry-1', {
      notes: 'still a run',
    });
    expect(updatedDistance()).toBe(7.5);
  });
});
