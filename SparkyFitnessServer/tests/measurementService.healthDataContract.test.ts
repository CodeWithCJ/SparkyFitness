import { beforeEach, describe, expect, it, vi } from 'vitest';
import measurementRepository from '../models/measurementRepository.js';
import measurementService from '../services/measurementService.js';
import exerciseDb from '../models/exercise.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(),
}));
vi.mock('../models/measurementRepository');
vi.mock('../models/userRepository');
vi.mock('../models/exercise');
vi.mock('../models/exerciseEntry');
vi.mock('../models/sleepRepository');
vi.mock('../models/waterContainerRepository');
vi.mock('../models/activityDetailsRepository');
vi.mock('../models/foodRepository');

// Canonical regression for the per-record error contract: one poison record
// must never fail the whole batch (the pre-contract behavior threw a
// stringified JSON error, the route 400'd, and mobile re-synced the same
// window forever). processHealthData resolves with per-record outcomes.
describe('processHealthData per-record error contract', () => {
  const userId = 'user-123';
  const actingUserId = 'user-123';
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
    measurementRepository.bulkUpsertCheckInMeasurements = vi
      .fn()
      .mockResolvedValue([
        { id: 'check-in-1', steps: 5000, weight: 70.5 },
        { id: 'check-in-1', steps: 5000, weight: 70.5 },
      ]);
  });

  it('resolves with per-record outcomes when a poison record is in the batch', async () => {
    const poisonEntry = {
      type: 'step',
      value: 'not-a-number',
      date: '2025-02-01',
      source: 'HealthKit',
    };
    const result = await measurementService.processHealthData(
      [
        { type: 'step', value: 5000, date: '2025-02-01', source: 'HealthKit' },
        poisonEntry,
        {
          type: 'weight',
          value: 70.5,
          date: '2025-02-01',
          source: 'HealthKit',
        },
      ],
      userId,
      actingUserId
    );

    expect(result.processed).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].entry).toEqual(poisonEntry);
    expect(result.errors[0].error).toBe(
      'Invalid value for step. Must be an integer.'
    );
    expect(result.message).toBe(
      'Some health data entries could not be processed.'
    );
    // The valid records around the poison one were still written, and the
    // poison record was excluded from the write.
    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).toHaveBeenCalledTimes(1);
    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).toHaveBeenCalledWith(userId, actingUserId, [
      { entryDate: '2025-02-01', measurements: { steps: 5000 } },
      { entryDate: '2025-02-01', measurements: { weight: 70.5 } },
    ]);
  });

  it('routes neck/waist/hips body measurements to their check_in_measurements columns', async () => {
    const result = await measurementService.processHealthData(
      [
        { type: 'waist', value: 82, date: '2025-02-01', source: 'CSV_Import' },
        { type: 'neck', value: 38, date: '2025-02-01', source: 'CSV_Import' },
        { type: 'hips', value: 95, date: '2025-02-01', source: 'CSV_Import' },
      ],
      userId,
      actingUserId
    );

    expect(result.errors).toEqual([]);
    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).toHaveBeenCalledWith(userId, actingUserId, [
      { entryDate: '2025-02-01', measurements: { waist: 82 } },
      { entryDate: '2025-02-01', measurements: { neck: 38 } },
      { entryDate: '2025-02-01', measurements: { hips: 95 } },
    ]);
  });

  it('always includes errors and skipped arrays, even on full success', async () => {
    const result = await measurementService.processHealthData(
      [{ type: 'step', value: 5000, date: '2025-02-01', source: 'HealthKit' }],
      userId,
      actingUserId
    );

    expect(result.message).toBe('All health data successfully processed.');
    expect(result.processed).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('converts legacy minute-based workout set durations to seconds (issue #1903)', async () => {
    vi.mocked(exerciseDb.findExerciseByNameAndUserId).mockResolvedValue({
      id: 'exercise-1',
    });
    vi.mocked(exerciseEntryDb.createExerciseEntry).mockResolvedValue({
      id: 'entry-1',
    });

    const result = await measurementService.processHealthData(
      [
        {
          type: 'Workout',
          timestamp: '2025-02-01T10:00:00Z',
          activityType: 'Plank',
          duration: 300,
          caloriesBurned: 50,
          source: 'HealthKit',
          sets: [
            { set_number: 1, set_type: 'Working Set', duration: 5 },
            { set_number: 2, set_type: 'Working Set', duration: null },
          ],
        },
      ],
      userId,
      actingUserId,
      { legacyWorkoutSetMinutes: true }
    );

    expect(result.errors).toEqual([]);
    expect(exerciseEntryDb.createExerciseEntry).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        duration_minutes: 5,
        sets: [
          { set_number: 1, set_type: 'Working Set', duration: 300 },
          { set_number: 2, set_type: 'Working Set', duration: null },
        ],
      }),
      actingUserId,
      'HealthKit',
      null,
      // No raw provider dump on this payload, so no activity detail rides
      // along in the entry's transaction.
      {}
    );
  });

  it('prefers duration_seconds over the legacy duration interpretation', async () => {
    vi.mocked(exerciseDb.findExerciseByNameAndUserId).mockResolvedValue({
      id: 'exercise-1',
    });
    vi.mocked(exerciseEntryDb.createExerciseEntry).mockResolvedValue({
      id: 'entry-1',
    });

    const result = await measurementService.processHealthData(
      [
        {
          type: 'Workout',
          timestamp: '2025-02-01T10:00:00Z',
          activityType: 'Plank',
          duration: 300,
          caloriesBurned: 50,
          source: 'HealthKit',
          sets: [
            { set_number: 1, set_type: 'Working Set', duration_seconds: 300 },
          ],
        },
      ],
      userId,
      actingUserId,
      // Even under the legacy-minutes interpretation, an explicitly named
      // duration_seconds field is always seconds.
      { legacyWorkoutSetMinutes: true }
    );

    expect(result.errors).toEqual([]);
    expect(exerciseEntryDb.createExerciseEntry).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        duration_minutes: 5,
        sets: [{ set_number: 1, set_type: 'Working Set', duration: 300 }],
      }),
      actingUserId,
      'HealthKit',
      null,
      // No raw provider dump on this payload, so no activity detail rides
      // along in the entry's transaction.
      {}
    );
  });

  it('passes seconds-based workout set durations through unchanged', async () => {
    vi.mocked(exerciseDb.findExerciseByNameAndUserId).mockResolvedValue({
      id: 'exercise-1',
    });
    vi.mocked(exerciseEntryDb.createExerciseEntry).mockResolvedValue({
      id: 'entry-1',
    });

    const result = await measurementService.processHealthData(
      [
        {
          type: 'Workout',
          timestamp: '2025-02-01T10:00:00Z',
          activityType: 'Plank',
          duration: 300,
          caloriesBurned: 50,
          source: 'HealthKit',
          sets: [{ set_number: 1, set_type: 'Working Set', duration: 300 }],
        },
      ],
      userId,
      actingUserId,
      { legacyWorkoutSetMinutes: false }
    );

    expect(result.errors).toEqual([]);
    expect(exerciseEntryDb.createExerciseEntry).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        duration_minutes: 5,
        sets: [{ set_number: 1, set_type: 'Working Set', duration: 300 }],
      }),
      actingUserId,
      'HealthKit',
      null,
      // No raw provider dump on this payload, so no activity detail rides
      // along in the entry's transaction.
      {}
    );
  });

  it('reports Nutrition records without source_id in skipped, not errors', async () => {
    const nutritionEntry = {
      type: 'Nutrition',
      food_name: 'Banana',
      calories: 105,
      date: '2025-02-01',
      source: 'Health Connect',
    };
    const result = await measurementService.processHealthData(
      [
        nutritionEntry,
        { type: 'step', value: 5000, date: '2025-02-01', source: 'HealthKit' },
      ],
      userId,
      actingUserId
    );

    expect(result.processed).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].entry).toEqual(nutritionEntry);
    expect(result.skipped[0].reason).toContain('source_id');
    // Skips do not fail the batch.
    expect(result.message).toBe('All health data successfully processed.');
  });
});
