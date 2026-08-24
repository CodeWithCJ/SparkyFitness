import { vi, beforeEach, describe, it, expect } from 'vitest';
import { getGarminDateChunks } from '../integrations/garminconnect/garminConnectService.js';

const { fakeClient } = vi.hoisted(() => {
  const clientQuery = vi.fn().mockResolvedValue({ rows: [] });
  const clientRelease = vi.fn();
  return {
    clientQuery,
    clientRelease,
    fakeClient: { query: clientQuery, release: clientRelease },
  };
});

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn().mockResolvedValue(fakeClient),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    deleteExerciseEntriesByEntrySourceAndDateWithClient: vi.fn(),
    _createExerciseEntryWithClient: vi.fn().mockResolvedValue({
      entry: { id: 'created-exercise-entry-id' },
    }),
  },
}));
vi.mock('../models/exercisePresetEntryRepository.js', () => ({
  default: {
    deleteExercisePresetEntriesByEntrySourceAndDateWithClient: vi.fn(),
    createExercisePresetEntryWithClient: vi
      .fn()
      .mockResolvedValue({ id: 'preset-entry-id' }),
  },
}));
vi.mock('../models/workoutPresetRepository.js', () => ({
  default: {
    getWorkoutPresetByName: vi.fn().mockResolvedValue(null),
    createWorkoutPreset: vi.fn().mockResolvedValue({ id: 'workout-preset-id' }),
    addExerciseToWorkoutPreset: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: {
    _createActivityDetailWithClient: vi
      .fn()
      .mockResolvedValue({ id: 'detail-id' }),
  },
}));
vi.mock('../models/workoutTelemetryRepository.js', () => ({
  _bulkInsertExerciseEntryLapsWithClient: vi.fn(),
  _bulkInsertExerciseEntryGpsPointsWithClient: vi.fn(),
  _bulkInsertExerciseEntryHrZonesWithClient: vi.fn(),
}));
vi.mock('../services/garmin/garminExerciseMapper.js', () => ({
  getOrCreateGarminExercise: vi
    .fn()
    .mockImplementation((_userId, name, _category) =>
      Promise.resolve({ id: `ex-${name}`, name })
    ),
}));

import type { PoolClient } from 'pg';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import {
  processGarminWorkoutSession,
  type GarminSessionData,
} from '../services/garmin/garminActivityProcessor.js';

describe('Garmin Date Chunking', () => {
  it('splits single day range into one chunk', () => {
    const chunks = getGarminDateChunks('2026-08-01', '2026-08-01', 7);
    expect(chunks).toEqual([{ start: '2026-08-01', end: '2026-08-01' }]);
  });

  it('splits 7-day range into one chunk', () => {
    const chunks = getGarminDateChunks('2026-08-01', '2026-08-07', 7);
    expect(chunks).toEqual([{ start: '2026-08-01', end: '2026-08-07' }]);
  });

  it('splits 15-day range into 3 chunks of max 7 days', () => {
    const chunks = getGarminDateChunks('2026-08-01', '2026-08-15', 7);
    expect(chunks).toEqual([
      { start: '2026-08-01', end: '2026-08-07' },
      { start: '2026-08-08', end: '2026-08-14' },
      { start: '2026-08-15', end: '2026-08-15' },
    ]);
  });
});

describe('Garmin Strength Activity Processor - summarizedExerciseSets Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('synthesizes exercise entries from summarizedExerciseSets when exerciseSets is empty', async () => {
    const sessionData: GarminSessionData = {
      activity: {
        activityId: 10001,
        activityType: { typeKey: 'strength_training' },
        activityName: 'Morning Strength',
        startTimeLocal: '2026-08-10 08:00:00',
        duration: 3600,
        summarizedExerciseSets: [
          {
            category: 'BENCH_PRESS',
            subCategory: 'BARBELL_BENCH_PRESS',
            sets: 3,
            reps: 30,
            volume: 180000, // 180 kg total volume -> 60 kg per rep
            duration: 900,
          },
          {
            category: 'SQUAT',
            subCategory: 'BARBELL_SQUAT',
            sets: 4,
            reps: 32,
            volume: 320000, // 320 kg total volume -> 100 kg per rep
            duration: 1200,
          },
        ],
      },
      exercise_sets: {
        exerciseSets: [], // Empty exercise sets
      },
    };

    await processGarminWorkoutSession(
      'user-1',
      sessionData,
      fakeClient as unknown as PoolClient,
      'UTC'
    );

    expect(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).toHaveBeenCalledTimes(2);

    const firstCallArgs = vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mock.calls[0][2];
    expect(firstCallArgs.sets).toHaveLength(3);
    expect(firstCallArgs.sets[0].reps).toBe(10);
    expect(firstCallArgs.sets[0].weight).toBe(6); // 180000 / 30 * 0.001 = 6 kg

    const secondCallArgs = vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mock.calls[1][2];
    expect(secondCallArgs.sets).toHaveLength(4);
    expect(secondCallArgs.sets[0].reps).toBe(8);
    expect(secondCallArgs.sets[0].weight).toBe(10); // 320000 / 32 * 0.001 = 10 kg
  });

  it('falls back to summarizedExerciseSets when individual exercise sets lack exercise names', async () => {
    const sessionData: GarminSessionData = {
      activity: {
        activityId: 10002,
        activityType: { typeKey: 'strength_training' },
        activityName: 'Upper Body Workout',
        startTimeLocal: '2026-08-10 09:00:00',
        duration: 1800,
        summarizedExerciseSets: [
          {
            category: 'CHEST',
            subCategory: 'INCLINE_DUMBBELL_PRESS',
            sets: 2,
            reps: 20,
            volume: 80000,
          },
        ],
      },
      exercise_sets: {
        exerciseSets: [
          {
            setType: 'ACTIVE',
            duration: 45,
            repetitionCount: 10,
            weight: 20000, // 20 kg
            exercises: [], // empty exercises
            stepIndex: 0,
          },
          {
            setType: 'REST',
            duration: 60,
          },
          {
            setType: 'ACTIVE',
            duration: 45,
            repetitionCount: 10,
            weight: 20000,
            exercises: [], // empty exercises
            stepIndex: 0,
          },
        ],
      },
    };

    await processGarminWorkoutSession(
      'user-1',
      sessionData,
      fakeClient as unknown as PoolClient,
      'UTC'
    );

    expect(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mock.calls[0][2];
    expect(callArgs.sets).toHaveLength(2);
    expect(callArgs.notes).toContain('INCLINE_DUMBBELL_PRESS');
  });

  it('matches matching category from multiple summarizedExerciseSets entries', async () => {
    const sessionData: GarminSessionData = {
      activity: {
        activityId: 10003,
        activityType: { typeKey: 'strength_training' },
        activityName: 'Mixed Strength Workout',
        startTimeLocal: '2026-08-10 10:00:00',
        duration: 2400,
        summarizedExerciseSets: [
          {
            category: 'SQUAT',
            subCategory: 'BARBELL_SQUAT',
            sets: 2,
            reps: 16,
            volume: 160000,
          },
          {
            category: 'BENCH_PRESS',
            subCategory: 'BARBELL_BENCH_PRESS',
            sets: 2,
            reps: 20,
            volume: 120000,
          },
        ],
      },
      exercise_sets: {
        exerciseSets: [
          {
            setType: 'ACTIVE',
            duration: 40,
            repetitionCount: 10,
            weight: 60000,
            exercises: [{ category: 'BENCH_PRESS' }], // matches 2nd summary
            stepIndex: 5, // arbitrary stepIndex
          },
        ],
      },
    };

    await processGarminWorkoutSession(
      'user-1',
      sessionData,
      fakeClient as unknown as PoolClient,
      'UTC'
    );

    expect(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(
      exerciseEntryRepository._createExerciseEntryWithClient
    ).mock.calls[0][2];
    expect(callArgs.notes).toContain('BARBELL_BENCH_PRESS');
  });
});
