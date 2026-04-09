import { vi, beforeEach, describe, expect, it } from 'vitest';
import { getClient } from '../db/poolManager.js';
import exerciseDb from '../models/exercise.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import exercisePresetEntryRepository from '../models/exercisePresetEntryRepository.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import calorieCalculationService from '../services/CalorieCalculationService.js';
import { resolveExerciseIdToUuid } from '../utils/uuidUtils.js';
import { getGroupedExerciseSessionByIdWithClient } from '../services/exerciseEntryHistoryService.js';
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
    _createExerciseEntryWithClient: vi.fn(),
    deleteExerciseEntriesByPresetEntryIdWithClient: vi.fn(),
    updateExerciseEntriesDateByPresetEntryIdWithClient: vi.fn(),
  },
}));
vi.mock('../models/activityDetailsRepository', () => ({}));
vi.mock('../models/exercisePresetEntryRepository.js', () => ({
  default: {
    createExercisePresetEntryWithClient: vi.fn(),
    updateExercisePresetEntryWithClient: vi.fn(),
    getExercisePresetEntryById: vi.fn(),
  },
}));
vi.mock('../models/userRepository', () => ({}));
vi.mock('../models/preferenceRepository', () => ({}));
vi.mock('../models/workoutPresetRepository', () => ({
  default: {
    getWorkoutPresetById: vi.fn(),
  },
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
describe('exerciseService grouped workouts', () => {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };
  beforeEach(() => {
    vi.clearAllMocks();
    getClient.mockResolvedValue(client);
    client.query.mockResolvedValue({});
  });
  it('rolls back grouped workout creation when a child insert fails', async () => {
    workoutPresetRepository.getWorkoutPresetById.mockResolvedValue({
      id: 42,
      name: 'Push Day',
      description: 'Preset',
      exercises: [
        {
          exercise_id: 'exercise-1',
          sort_order: 0,
          sets: [],
        },
      ],
    });
    exercisePresetEntryRepository.createExercisePresetEntryWithClient.mockResolvedValue(
      { id: 'preset-entry-1' }
    );
    resolveExerciseIdToUuid.mockResolvedValue(
      '11111111-1111-4111-8111-111111111111'
    );
    exerciseDb.getExerciseById.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Bench Press',
      calories_per_hour: 300,
    });
    calorieCalculationService.estimateCaloriesBurnedPerHour.mockResolvedValue(
      300
    );
    exerciseEntryDb._createExerciseEntryWithClient.mockRejectedValue(
      new Error('child insert failed')
    );
    await expect(
      exerciseService.createGroupedWorkoutSession('user-1', 'actor-1', {
        workout_preset_id: 42,
        entry_date: '2026-03-12',
        source: 'manual',
      })
    ).rejects.toThrow('child insert failed');
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
  it('propagates entry_date changes to existing child entries on header-only updates', async () => {
    getGroupedExerciseSessionByIdWithClient
      .mockResolvedValueOnce({
        type: 'preset',
        id: 'preset-entry-1',
        entry_date: '2026-03-12',
        workout_preset_id: null,
        name: 'Morning Workout',
        description: null,
        notes: null,
        source: 'manual',
        total_duration_minutes: 0,
        exercises: [],
        activity_details: [],
      })
      .mockResolvedValueOnce({
        type: 'preset',
        id: 'preset-entry-1',
        entry_date: '2026-03-13',
        workout_preset_id: null,
        name: 'Morning Workout',
        description: null,
        notes: null,
        source: 'manual',
        total_duration_minutes: 0,
        exercises: [],
        activity_details: [],
      });
    exercisePresetEntryRepository.updateExercisePresetEntryWithClient.mockResolvedValue(
      { id: 'preset-entry-1' }
    );
    const result = await exerciseService.updateGroupedWorkoutSession(
      'user-1',
      'actor-1',
      'preset-entry-1',
      { entry_date: '2026-03-13' }
    );
    expect(
      exerciseEntryDb.updateExerciseEntriesDateByPresetEntryIdWithClient
    ).toHaveBeenCalledWith(
      client,
      'user-1',
      'preset-entry-1',
      '2026-03-13',
      'actor-1'
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(result.entry_date).toBe('2026-03-13');
  });
  it('rejects nested child edits for synced grouped workouts and rolls back', async () => {
    getGroupedExerciseSessionByIdWithClient.mockResolvedValue({
      type: 'preset',
      id: 'preset-entry-1',
      entry_date: '2026-03-12',
      workout_preset_id: null,
      name: 'Imported Workout',
      description: null,
      notes: null,
      source: 'garmin',
      total_duration_minutes: 0,
      exercises: [],
      activity_details: [],
    });
    exercisePresetEntryRepository.updateExercisePresetEntryWithClient.mockResolvedValue(
      { id: 'preset-entry-1' }
    );
    await expect(
      exerciseService.updateGroupedWorkoutSession(
        'user-1',
        'actor-1',
        'preset-entry-1',
        {
          exercises: [
            {
              exercise_id: '11111111-1111-4111-8111-111111111111',
              sort_order: 0,
              duration_minutes: 0,
              sets: [],
            },
          ],
        }
      )
    ).rejects.toMatchObject({
      status: 409,
      message:
        'Nested exercise editing is only supported for manual or sparky workouts.',
    });
    expect(
      exerciseEntryDb.deleteExerciseEntriesByPresetEntryIdWithClient
    ).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
