import { vi, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
      type: 'preset',
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
      (getGroupedExerciseSessionByIdWithClient as any).mockReset();
      (getGroupedExerciseSessionByIdWithClient as any)
        .mockResolvedValueOnce(existingSession)
        .mockResolvedValueOnce(existingSession);
      // @ts-expect-error TS(2339): mockResolvedValue on mocked fn
      exercisePresetEntryRepository.updateExercisePresetEntryWithClient.mockResolvedValue(
        { id: 'preset-entry-1' }
      );
      // @ts-expect-error TS(2339): mockImplementation on mocked fn
      resolveExerciseIdToUuid.mockImplementation(async (id: any) => id);
      // @ts-expect-error TS(2339): mockImplementation on mocked fn
      exerciseDb.getExerciseById.mockImplementation(async (id: any) => ({
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
      (
        calorieCalculationService.estimateCaloriesBurnedPerHour as any
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

      const [firstCall, secondCall] = (
        // @ts-expect-error TS(2339): .mock on mocked fn
        exerciseEntryDb._updateExerciseEntryWithClient.mock.calls
      ) as any[];
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

      const updateCalls = (
        // @ts-expect-error TS(2339): .mock on mocked fn
        exerciseEntryDb._updateExerciseEntryWithClient.mock.calls
      ) as any[];
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
  let reconcile: any;

  beforeAll(async () => {
    const mod: any = await vi.importActual('../models/exerciseEntry.js');
    reconcile = (mod.default ?? mod)._reconcileExerciseEntrySetsWithClient;
  });

  function makeClient(existingSetIds: number[]) {
    const calls: { sql: string; params: any[] }[] = [];
    return {
      calls,
      query: vi.fn((sql: string, params: any[]) => {
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
    expect(deleteCall!.params[0].sort()).toEqual([1, 2]);
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
});
