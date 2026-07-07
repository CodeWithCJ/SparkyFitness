import {
  vi,
  type Mock,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
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
    _updateExerciseEntryWithClient: vi.fn(),
    _deleteExerciseEntryWithClient: vi.fn(),
    _reconcileExerciseEntrySetsWithClient: vi.fn(),
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
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    getClient.mockResolvedValue(client);
    client.query.mockResolvedValue({});
  });
  it('rolls back grouped workout creation when a child insert fails', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
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
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    exercisePresetEntryRepository.createExercisePresetEntryWithClient.mockResolvedValue(
      { id: 'preset-entry-1' }
    );
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    resolveExerciseIdToUuid.mockResolvedValue(
      '11111111-1111-4111-8111-111111111111'
    );
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    exerciseDb.getExerciseById.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Bench Press',
      calories_per_hour: 300,
    });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    calorieCalculationService.estimateCaloriesBurnedPerHour.mockResolvedValue(
      300
    );
    // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
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
  it('persists superset_group on freeform grouped workout creation', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    exercisePresetEntryRepository.createExercisePresetEntryWithClient.mockResolvedValue(
      { id: 'preset-entry-1' }
    );
    // @ts-expect-error TS(2339): Property 'mockImplementation' does not exist on ty... Remove this comment to see the full error message
    resolveExerciseIdToUuid.mockImplementation(async (id: string) => id);
    // @ts-expect-error TS(2339): Property 'mockImplementation' does not exist on ty... Remove this comment to see the full error message
    exerciseDb.getExerciseById.mockImplementation(async (id: string) => ({
      id,
      name: 'Test Exercise',
      calories_per_hour: 300,
    }));
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    calorieCalculationService.estimateCaloriesBurnedPerHour.mockResolvedValue(
      300
    );
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    exerciseEntryDb._createExerciseEntryWithClient.mockResolvedValue({
      id: 'new-entry',
    });

    await exerciseService.createGroupedWorkoutSession('user-1', 'actor-1', {
      name: 'Superset Day',
      entry_date: '2026-03-12',
      source: 'manual',
      exercises: [
        {
          exercise_id: '11111111-1111-4111-8111-111111111111',
          sort_order: 0,
          duration_minutes: 0,
          superset_group: 1,
          sets: [],
        },
        {
          exercise_id: '22222222-2222-4222-8222-222222222222',
          sort_order: 1,
          duration_minutes: 0,
          sets: [],
        },
      ],
    });

    const createCalls = vi.mocked(
      exerciseEntryDb._createExerciseEntryWithClient
    ).mock.calls;
    expect(createCalls[0][2]).toMatchObject({ superset_group: 1 });
    expect(createCalls[1][2]).toMatchObject({ superset_group: null });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
  it('copies superset_group from preset exercises when starting from a preset', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    workoutPresetRepository.getWorkoutPresetById.mockResolvedValue({
      id: 42,
      name: 'Push Day',
      description: 'Preset',
      exercises: [
        {
          exercise_id: '11111111-1111-4111-8111-111111111111',
          sort_order: 0,
          superset_group: 1,
          sets: [],
        },
        {
          exercise_id: '22222222-2222-4222-8222-222222222222',
          sort_order: 1,
          superset_group: null,
          sets: [],
        },
      ],
    });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    exercisePresetEntryRepository.createExercisePresetEntryWithClient.mockResolvedValue(
      { id: 'preset-entry-1' }
    );
    // @ts-expect-error TS(2339): Property 'mockImplementation' does not exist on ty... Remove this comment to see the full error message
    resolveExerciseIdToUuid.mockImplementation(async (id: string) => id);
    // @ts-expect-error TS(2339): Property 'mockImplementation' does not exist on ty... Remove this comment to see the full error message
    exerciseDb.getExerciseById.mockImplementation(async (id: string) => ({
      id,
      name: 'Test Exercise',
      calories_per_hour: 300,
    }));
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    calorieCalculationService.estimateCaloriesBurnedPerHour.mockResolvedValue(
      300
    );
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    exerciseEntryDb._createExerciseEntryWithClient.mockResolvedValue({
      id: 'new-entry',
    });

    await exerciseService.createGroupedWorkoutSession('user-1', 'actor-1', {
      workout_preset_id: 42,
      entry_date: '2026-03-12',
      source: 'manual',
    });

    const createCalls = vi.mocked(
      exerciseEntryDb._createExerciseEntryWithClient
    ).mock.calls;
    expect(createCalls[0][2]).toMatchObject({ superset_group: 1 });
    expect(createCalls[1][2]).toMatchObject({ superset_group: null });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
  it('propagates entry_date changes to existing child entries on header-only updates', async () => {
    getGroupedExerciseSessionByIdWithClient
      // @ts-expect-error TS(2339): Property 'mockResolvedValueOnce' does not exist on... Remove this comment to see the full error message
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
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
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
    // @ts-expect-error
    expect(result.entry_date).toBe('2026-03-13');
  });
  it('rejects nested child edits for synced grouped workouts and rolls back', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
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
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
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

  describe('stable-id reconcile path', () => {
    const exerciseAId = '22222222-2222-4222-8222-222222222222';
    const exerciseBId = '33333333-3333-4333-8333-333333333333';
    const existingSession = {
      type: 'preset' as const,
      id: 'preset-entry-1',
      entry_date: '2026-03-12',
      workout_preset_id: null,
      name: 'Leg Day',
      description: null,
      notes: null,
      source: 'manual',
      total_duration_minutes: 0,
      exercises: [
        {
          id: 'entry-a',
          exercise_id: exerciseAId,
          sort_order: 0,
          sets: [{ id: 1, set_number: 1, reps: 10, weight: 100 }],
        },
        {
          id: 'entry-b',
          exercise_id: exerciseBId,
          sort_order: 1,
          sets: [{ id: 2, set_number: 1, reps: 5, weight: 200 }],
        },
      ],
      activity_details: [],
    };

    const setupExistingSession = () => {
      (getGroupedExerciseSessionByIdWithClient as unknown as Mock).mockReset();
      (getGroupedExerciseSessionByIdWithClient as unknown as Mock)
        .mockResolvedValueOnce(existingSession)
        .mockResolvedValueOnce(existingSession);
      // @ts-expect-error TS(2339): mockResolvedValue on mocked fn
      exercisePresetEntryRepository.updateExercisePresetEntryWithClient.mockResolvedValue(
        { id: 'preset-entry-1' }
      );
      // @ts-expect-error TS(2339): mockImplementation on mocked fn
      resolveExerciseIdToUuid.mockImplementation(async (id: string) => id);
      // @ts-expect-error TS(2339): mockImplementation on mocked fn
      exerciseDb.getExerciseById.mockImplementation(async (id: string) => ({
        id,
        name: 'Test Exercise',
        calories_per_hour: 600,
      }));
      // @ts-expect-error TS(2339): mockResolvedValue on mocked fn
      calorieCalculationService.estimateCaloriesBurnedPerHour.mockResolvedValue(
        600
      );
    };

    it('updates values via reconcile without deleting existing rows', async () => {
      setupExistingSession();

      await exerciseService.updateGroupedWorkoutSession(
        'user-1',
        'actor-1',
        'preset-entry-1',
        {
          exercises: [
            {
              id: 'entry-a',
              exercise_id: exerciseAId,
              sort_order: 0,
              duration_minutes: 0,
              sets: [{ id: 1, set_number: 1, reps: 10, weight: 110 }],
            },
            {
              id: 'entry-b',
              exercise_id: exerciseBId,
              sort_order: 1,
              duration_minutes: 0,
              sets: [{ id: 2, set_number: 1, reps: 5, weight: 200 }],
            },
          ],
        }
      );

      expect(
        exerciseEntryDb.deleteExerciseEntriesByPresetEntryIdWithClient
      ).not.toHaveBeenCalled();
      expect(
        exerciseEntryDb._deleteExerciseEntryWithClient
      ).not.toHaveBeenCalled();
      expect(
        exerciseEntryDb._updateExerciseEntryWithClient
      ).toHaveBeenCalledTimes(2);
      expect(
        exerciseEntryDb._updateExerciseEntryWithClient
      ).toHaveBeenNthCalledWith(
        1,
        client,
        'entry-a',
        'user-1',
        expect.objectContaining({
          exercise_id: exerciseAId,
          entry_date: '2026-03-12',
        }),
        'actor-1',
        'manual'
      );
      expect(
        exerciseEntryDb._reconcileExerciseEntrySetsWithClient
      ).toHaveBeenCalledWith(client, 'entry-a', [
        { id: 1, set_number: 1, reps: 10, weight: 110 },
      ]);
      expect(
        exerciseEntryDb._reconcileExerciseEntrySetsWithClient
      ).toHaveBeenCalledWith(client, 'entry-b', [
        { id: 2, set_number: 1, reps: 5, weight: 200 },
      ]);
      expect(client.query).toHaveBeenCalledWith('COMMIT');
    });

    it('recomputes calories_burned when duration_minutes changes', async () => {
      setupExistingSession();
      vi.mocked(
        calorieCalculationService.estimateCaloriesBurnedPerHour
      ).mockResolvedValue(600); // 10 cal/min

      await exerciseService.updateGroupedWorkoutSession(
        'user-1',
        'actor-1',
        'preset-entry-1',
        {
          exercises: [
            {
              id: 'entry-a',
              exercise_id: exerciseAId,
              sort_order: 0,
              duration_minutes: 30,
              sets: [],
            },
            {
              id: 'entry-b',
              exercise_id: exerciseBId,
              sort_order: 1,
              duration_minutes: 15,
              sets: [],
            },
          ],
        }
      );

      const [firstCall, secondCall] = vi.mocked(
        exerciseEntryDb._updateExerciseEntryWithClient
      ).mock.calls;
      expect(firstCall[3]).toMatchObject({
        duration_minutes: 30,
        calories_burned: 300,
      });
      expect(secondCall[3]).toMatchObject({
        duration_minutes: 15,
        calories_burned: 150,
      });
    });

    it('omits sets from the update payload so the model skips its internal sets branch', async () => {
      setupExistingSession();

      await exerciseService.updateGroupedWorkoutSession(
        'user-1',
        'actor-1',
        'preset-entry-1',
        {
          exercises: [
            {
              id: 'entry-a',
              exercise_id: exerciseAId,
              sort_order: 0,
              duration_minutes: 0,
              sets: [],
            },
            {
              id: 'entry-b',
              exercise_id: exerciseBId,
              sort_order: 1,
              duration_minutes: 0,
              sets: [{ id: 2, set_number: 1, reps: 5, weight: 200 }],
            },
          ],
        }
      );

      const updateCalls = vi.mocked(
        exerciseEntryDb._updateExerciseEntryWithClient
      ).mock.calls;
      for (const [, , , updateData] of updateCalls) {
        expect(updateData).not.toHaveProperty('sets');
      }
      expect(
        exerciseEntryDb._reconcileExerciseEntrySetsWithClient
      ).toHaveBeenCalledWith(client, 'entry-a', []);
    });

    it('deletes exercise entries that are omitted from the reconcile payload', async () => {
      setupExistingSession();

      await exerciseService.updateGroupedWorkoutSession(
        'user-1',
        'actor-1',
        'preset-entry-1',
        {
          exercises: [
            {
              id: 'entry-a',
              exercise_id: exerciseAId,
              sort_order: 0,
              duration_minutes: 0,
              sets: [{ id: 1, set_number: 1, reps: 10, weight: 100 }],
            },
          ],
        }
      );

      expect(
        exerciseEntryDb._deleteExerciseEntryWithClient
      ).toHaveBeenCalledWith(client, 'user-1', 'entry-b');
      expect(
        exerciseEntryDb._updateExerciseEntryWithClient
      ).toHaveBeenCalledTimes(1);
      expect(client.query).toHaveBeenCalledWith('COMMIT');
    });

    it('rejects an unknown exercise id with 400', async () => {
      setupExistingSession();

      await expect(
        exerciseService.updateGroupedWorkoutSession(
          'user-1',
          'actor-1',
          'preset-entry-1',
          {
            exercises: [
              {
                id: '99999999-9999-4999-8999-999999999999',
                exercise_id: exerciseAId,
                sort_order: 0,
                duration_minutes: 0,
                sets: [],
              },
            ],
          }
        )
      ).rejects.toMatchObject({
        status: 400,
        message: 'Exercise entry does not belong to this session.',
      });

      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(
        exerciseEntryDb._updateExerciseEntryWithClient
      ).not.toHaveBeenCalled();
    });

    it('rejects mixed id presence with 400', async () => {
      setupExistingSession();

      await expect(
        exerciseService.updateGroupedWorkoutSession(
          'user-1',
          'actor-1',
          'preset-entry-1',
          {
            exercises: [
              {
                id: 'entry-a',
                exercise_id: exerciseAId,
                sort_order: 0,
                duration_minutes: 0,
                sets: [],
              },
              {
                exercise_id: exerciseBId,
                sort_order: 1,
                duration_minutes: 0,
                sets: [],
              },
            ],
          }
        )
      ).rejects.toMatchObject({
        status: 400,
        message: 'exercises[].id must be provided for all entries or none.',
      });

      expect(
        exerciseEntryDb._updateExerciseEntryWithClient
      ).not.toHaveBeenCalled();
      expect(
        exerciseEntryDb.deleteExerciseEntriesByPresetEntryIdWithClient
      ).not.toHaveBeenCalled();
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('round-trips superset_group through the reconcile path', async () => {
      setupExistingSession();

      await exerciseService.updateGroupedWorkoutSession(
        'user-1',
        'actor-1',
        'preset-entry-1',
        {
          exercises: [
            {
              id: 'entry-a',
              exercise_id: exerciseAId,
              sort_order: 0,
              duration_minutes: 0,
              superset_group: 1,
              sets: [],
            },
            {
              id: 'entry-b',
              exercise_id: exerciseBId,
              sort_order: 1,
              duration_minutes: 0,
              superset_group: 1,
              sets: [],
            },
          ],
        }
      );

      const updateCalls = vi.mocked(
        exerciseEntryDb._updateExerciseEntryWithClient
      ).mock.calls;
      expect(updateCalls[0][3]).toMatchObject({ superset_group: 1 });
      expect(updateCalls[1][3]).toMatchObject({ superset_group: 1 });
    });

    it('clears superset_group when the reconcile payload omits it', async () => {
      setupExistingSession();

      await exerciseService.updateGroupedWorkoutSession(
        'user-1',
        'actor-1',
        'preset-entry-1',
        {
          exercises: [
            {
              id: 'entry-a',
              exercise_id: exerciseAId,
              sort_order: 0,
              duration_minutes: 0,
              sets: [],
            },
            {
              id: 'entry-b',
              exercise_id: exerciseBId,
              sort_order: 1,
              duration_minutes: 0,
              superset_group: null,
              sets: [],
            },
          ],
        }
      );

      const updateCalls = vi.mocked(
        exerciseEntryDb._updateExerciseEntryWithClient
      ).mock.calls;
      expect(updateCalls[0][3]).toMatchObject({ superset_group: null });
      expect(updateCalls[1][3]).toMatchObject({ superset_group: null });
    });

    it('carries superset_group through the delete-and-recreate path', async () => {
      setupExistingSession();
      // @ts-expect-error TS(2339): mockResolvedValue on mocked fn
      exerciseEntryDb._createExerciseEntryWithClient.mockResolvedValue({
        id: 'new-entry',
      });

      await exerciseService.updateGroupedWorkoutSession(
        'user-1',
        'actor-1',
        'preset-entry-1',
        {
          exercises: [
            {
              exercise_id: exerciseAId,
              sort_order: 0,
              duration_minutes: 0,
              superset_group: 3,
              sets: [],
            },
            {
              exercise_id: exerciseBId,
              sort_order: 1,
              duration_minutes: 0,
              sets: [],
            },
          ],
        }
      );

      const createCalls = vi.mocked(
        exerciseEntryDb._createExerciseEntryWithClient
      ).mock.calls;
      expect(createCalls[0][2]).toMatchObject({ superset_group: 3 });
      expect(createCalls[1][2]).toMatchObject({ superset_group: null });
    });

    it('forwards set completed_at through the reconcile path', async () => {
      setupExistingSession();

      const completedAt = '2026-07-06T15:04:05.123Z';
      await exerciseService.updateGroupedWorkoutSession(
        'user-1',
        'actor-1',
        'preset-entry-1',
        {
          exercises: [
            {
              id: 'entry-a',
              exercise_id: exerciseAId,
              sort_order: 0,
              duration_minutes: 0,
              sets: [
                {
                  id: 1,
                  set_number: 1,
                  reps: 10,
                  weight: 110,
                  completed_at: completedAt,
                },
              ],
            },
            {
              id: 'entry-b',
              exercise_id: exerciseBId,
              sort_order: 1,
              duration_minutes: 0,
              sets: [
                {
                  id: 2,
                  set_number: 1,
                  reps: 5,
                  weight: 200,
                  completed_at: null,
                },
              ],
            },
          ],
        }
      );

      expect(
        exerciseEntryDb._reconcileExerciseEntrySetsWithClient
      ).toHaveBeenCalledWith(client, 'entry-a', [
        expect.objectContaining({ id: 1, completed_at: completedAt }),
      ]);
      expect(
        exerciseEntryDb._reconcileExerciseEntrySetsWithClient
      ).toHaveBeenCalledWith(client, 'entry-b', [
        expect.objectContaining({ id: 2, completed_at: null }),
      ]);
    });

    it('carries set completed_at through the delete-and-recreate path', async () => {
      setupExistingSession();
      // @ts-expect-error TS(2339): mockResolvedValue on mocked fn
      exerciseEntryDb._createExerciseEntryWithClient.mockResolvedValue({
        id: 'new-entry',
      });

      const completedAt = '2026-07-06T15:04:05.123Z';
      await exerciseService.updateGroupedWorkoutSession(
        'user-1',
        'actor-1',
        'preset-entry-1',
        {
          exercises: [
            {
              exercise_id: exerciseAId,
              sort_order: 0,
              duration_minutes: 0,
              sets: [
                { set_number: 1, reps: 10, completed_at: completedAt },
                { set_number: 2, reps: 8, completed_at: null },
              ],
            },
          ],
        }
      );

      const createCalls = vi.mocked(
        exerciseEntryDb._createExerciseEntryWithClient
      ).mock.calls;
      expect(createCalls[0][2].sets).toEqual([
        expect.objectContaining({ completed_at: completedAt }),
        expect.objectContaining({ completed_at: null }),
      ]);
    });

    it('falls through to the legacy delete-and-recreate path when no ids are provided', async () => {
      setupExistingSession();
      // @ts-expect-error TS(2339): mockResolvedValue on mocked fn
      exerciseEntryDb._createExerciseEntryWithClient.mockResolvedValue({
        id: 'new-entry',
      });

      await exerciseService.updateGroupedWorkoutSession(
        'user-1',
        'actor-1',
        'preset-entry-1',
        {
          exercises: [
            {
              exercise_id: exerciseAId,
              sort_order: 0,
              duration_minutes: 0,
              sets: [],
            },
          ],
        }
      );

      expect(
        exerciseEntryDb.deleteExerciseEntriesByPresetEntryIdWithClient
      ).toHaveBeenCalledWith(client, 'user-1', 'preset-entry-1');
      expect(
        exerciseEntryDb._updateExerciseEntryWithClient
      ).not.toHaveBeenCalled();
      expect(
        exerciseEntryDb._reconcileExerciseEntrySetsWithClient
      ).not.toHaveBeenCalled();
    });
  });
});

describe('_reconcileExerciseEntrySetsWithClient', () => {
  let reconcile: (
    client: unknown,
    entryId: string,
    sets: unknown[]
  ) => Promise<unknown>;

  beforeAll(async () => {
    const mod = (await vi.importActual('../models/exerciseEntry.js')) as {
      default?: Record<string, unknown>;
    } & Record<string, unknown>;
    const exports = (mod.default ?? mod) as Record<string, unknown>;
    reconcile =
      exports._reconcileExerciseEntrySetsWithClient as typeof reconcile;
  });

  function makeClient(existingSetIds: number[]) {
    const calls: { sql: string; params: unknown[] }[] = [];
    return {
      calls,
      query: vi.fn((sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        if (/^SELECT id FROM exercise_entry_sets/.test(sql)) {
          return Promise.resolve({
            rows: existingSetIds.map((id) => ({ id })),
          });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
    };
  }

  it('rejects a set id that is not on the exercise entry', async () => {
    const client = makeClient([1, 2]);
    await expect(
      reconcile(client, 'entry-a', [{ id: 99, set_number: 1, reps: 10 }])
    ).rejects.toMatchObject({
      status: 400,
      message: 'Set does not belong to this exercise entry.',
    });
  });

  it('deletes all sets when passed an empty array', async () => {
    const client = makeClient([1, 2]);
    await reconcile(client, 'entry-a', []);
    const deleteCall = client.calls.find(({ sql }) =>
      /DELETE FROM exercise_entry_sets WHERE id = ANY/.test(sql)
    );
    expect(deleteCall).toBeDefined();
    expect((deleteCall!.params[0] as number[]).sort()).toEqual([1, 2]);
    expect(deleteCall!.params[1]).toBe('entry-a');
  });

  it('updates existing sets, inserts new ones, and leaves untouched siblings alone', async () => {
    const client = makeClient([1, 2]);
    await reconcile(client, 'entry-a', [
      { id: 1, set_number: 1, reps: 10, weight: 100 },
      { id: 2, set_number: 2, reps: 8, weight: 110 },
      { set_number: 3, reps: 6, weight: 120 },
    ]);

    const deletes = client.calls.filter(({ sql }) =>
      /DELETE FROM exercise_entry_sets/.test(sql)
    );
    expect(deletes).toHaveLength(0);

    const updates = client.calls.filter(({ sql }) =>
      /UPDATE exercise_entry_sets/.test(sql)
    );
    expect(updates).toHaveLength(2);

    const inserts = client.calls.filter(({ sql }) =>
      /INSERT INTO exercise_entry_sets/.test(sql)
    );
    expect(inserts).toHaveLength(1);
  });

  it('removes existing sets that are not referenced', async () => {
    const client = makeClient([1, 2, 3]);
    await reconcile(client, 'entry-a', [
      { id: 1, set_number: 1, reps: 10 },
      { id: 3, set_number: 2, reps: 8 },
    ]);

    const deleteCall = client.calls.find(({ sql }) =>
      /DELETE FROM exercise_entry_sets WHERE id = ANY/.test(sql)
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall!.params[0]).toEqual([2]);
  });

  it('writes completed_at on updates and inserts, clearing it when omitted', async () => {
    const client = makeClient([1, 2]);
    const completedAt = '2026-07-06T15:04:05.123Z';
    await reconcile(client, 'entry-a', [
      { id: 1, set_number: 1, reps: 10, completed_at: completedAt },
      { id: 2, set_number: 2, reps: 8 },
      { set_number: 3, reps: 6, completed_at: completedAt },
    ]);

    const updates = client.calls.filter(({ sql }) =>
      /UPDATE exercise_entry_sets/.test(sql)
    );
    expect(updates).toHaveLength(2);
    expect(updates[0].sql).toMatch(/completed_at = \$9/);
    expect(updates[0].params[8]).toBe(completedAt);
    // Omitted completed_at means "not completed" and must clear the column.
    expect(updates[1].params[8]).toBeNull();

    const insert = client.calls.find(({ sql }) =>
      /INSERT INTO exercise_entry_sets/.test(sql)
    );
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain('completed_at');
    expect(insert!.sql).toContain(completedAt);
  });

  it('writes is_pr on updates and inserts, clearing it when omitted', async () => {
    const client = makeClient([1, 2]);
    await reconcile(client, 'entry-a', [
      { id: 1, set_number: 1, reps: 10, is_pr: true },
      { id: 2, set_number: 2, reps: 8 },
      { set_number: 3, reps: 6, is_pr: true },
    ]);

    const updates = client.calls.filter(({ sql }) =>
      /UPDATE exercise_entry_sets/.test(sql)
    );
    expect(updates).toHaveLength(2);
    expect(updates[0].sql).toMatch(/is_pr = \$10/);
    expect(updates[0].params[9]).toBe(true);
    // Omitted is_pr means "not a PR" and must clear the column.
    expect(updates[1].params[9]).toBe(false);

    const insert = client.calls.find(({ sql }) =>
      /INSERT INTO exercise_entry_sets/.test(sql)
    );
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain('is_pr');
  });
});

describe('_updateExerciseEntryWithClient snapshot round-trip', () => {
  let updateEntry: (
    client: unknown,
    id: string,
    userId: string,
    updateData: Record<string, unknown>,
    updatedByUserId: string,
    entrySource: string
  ) => Promise<unknown>;

  beforeAll(async () => {
    const mod = (await vi.importActual('../models/exerciseEntry.js')) as {
      default?: Record<string, unknown>;
    } & Record<string, unknown>;
    const exports = (mod.default ?? mod) as Record<string, unknown>;
    updateEntry = exports._updateExerciseEntryWithClient as typeof updateEntry;
  });

  // Snapshot list columns come back from `SELECT *` as raw JSON text.
  const currentEntry = {
    id: 'entry-a',
    exercise_id: 'ex-1',
    duration_minutes: 10,
    calories_burned: 100,
    entry_date: '2026-07-06',
    equipment: '["barbell"]',
    primary_muscles: '["quadriceps"]',
    secondary_muscles: null,
    instructions: '["Keep your back straight."]',
    images: '["Leg_Press/0.jpg"]',
  };

  function makeClient() {
    const calls: { sql: string; params: unknown[] }[] = [];
    return {
      calls,
      query: vi.fn((sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        if (/^SELECT \* FROM exercise_entries/.test(sql)) {
          return Promise.resolve({ rows: [{ ...currentEntry }] });
        }
        if (/^UPDATE exercise_entries/.test(sql)) {
          return Promise.resolve({ rows: [{ id: 'entry-a' }], rowCount: 1 });
        }
        // Trailing refetch via _getExerciseEntryByIdWithClient.
        return Promise.resolve({ rows: [{ id: 'entry-a' }], rowCount: 1 });
      }),
    };
  }

  // Regression for the snapshot-doubling bug: value-only updates (the live
  // autosave shape) carry no snapshot fields, so the merge falls back to the
  // raw text — re-encoding it added an escaping layer per save, roughly
  // doubling the stored columns every autosave.
  it('writes merged raw-text snapshot columns back byte-identical', async () => {
    const client = makeClient();
    await updateEntry(
      client,
      'entry-a',
      'user-1',
      { duration_minutes: 12 },
      'actor-1',
      'manual'
    );

    const update = client.calls.find(({ sql }) =>
      /^UPDATE exercise_entries/.test(sql)
    );
    expect(update).toBeDefined();
    // $19–$23: equipment, primary_muscles, secondary_muscles, instructions, images
    expect(update!.params[18]).toBe('["barbell"]');
    expect(update!.params[19]).toBe('["quadriceps"]');
    expect(update!.params[20]).toBeNull();
    expect(update!.params[21]).toBe('["Keep your back straight."]');
    expect(update!.params[22]).toBe('["Leg_Press/0.jpg"]');
  });

  it('encodes array snapshot values from updateData exactly once', async () => {
    const client = makeClient();
    await updateEntry(
      client,
      'entry-a',
      'user-1',
      { images: ['new.jpg'], equipment: ['dumbbell'] },
      'actor-1',
      'manual'
    );

    const update = client.calls.find(({ sql }) =>
      /^UPDATE exercise_entries/.test(sql)
    );
    expect(update!.params[18]).toBe('["dumbbell"]');
    expect(update!.params[22]).toBe('["new.jpg"]');
  });
});
