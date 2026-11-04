import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// The health-data pre-cleanup range-deletes a source's workouts before the
// payload is re-inserted. It must never touch workouts the person logged, and a
// record the handler rejects must not delete anything (#2938).

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    createExerciseEntry: vi.fn(),
    deleteExerciseEntriesByEntrySourceAndDate: vi.fn(),
  },
  EXERCISE_ENTRY_TELEMETRY_COLUMNS: [],
}));
vi.mock('../models/exercise.js', () => ({
  default: {
    findExerciseByNameAndUserId: vi.fn(),
    createExercise: vi.fn(),
  },
}));
vi.mock('../models/workoutTelemetryRepository.js', () => ({
  bulkInsertExerciseEntryGpsPoints: vi.fn(),
  bulkInsertExerciseEntryLaps: vi.fn(),
  bulkInsertExerciseEntryHrZones: vi.fn(),
}));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: { createActivityDetail: vi.fn() },
}));
vi.mock('../services/healthMetricSampleWriter.js', () => ({
  upsertSamplesByDay: vi.fn(),
}));
vi.mock('../models/userRepository.js', () => ({
  default: {
    getUserProfile: vi.fn().mockResolvedValue({ date_of_birth: '1990-01-01' }),
  },
}));

const measurementService = (await import('../services/measurementService.js'))
  .default;
const exerciseEntryDb = (await import('../models/exerciseEntry.js')).default;
const exerciseDb = (await import('../models/exercise.js')).default;

const deleteMock = () =>
  exerciseEntryDb.deleteExerciseEntriesByEntrySourceAndDate as Mock;

const workout = (extra: Record<string, unknown> = {}) => ({
  type: 'Workout',
  activityType: 'Run',
  duration: 1800,
  date: '2026-10-16',
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  (exerciseDb.findExerciseByNameAndUserId as Mock).mockResolvedValue(null);
  (exerciseDb.createExercise as Mock).mockResolvedValue({ id: 'ex-1' });
  (exerciseEntryDb.createExerciseEntry as Mock).mockResolvedValue({
    id: 'entry-1',
  });
});

describe('processHealthData pre-cleanup (#2938)', () => {
  it('does not range-delete when a workout has no source', async () => {
    await measurementService.processHealthData([workout()], 'user-1', 'user-1');

    expect(deleteMock()).not.toHaveBeenCalled();
    expect(exerciseEntryDb.createExerciseEntry).toHaveBeenCalledTimes(1);
  });

  it.each(['manual', 'Manual', ' manual ', 'sparky', 'Workout Preset', ''])(
    'does not range-delete for the user source %j',
    async (source) => {
      await measurementService.processHealthData(
        [workout({ source })],
        'user-1',
        'user-1'
      );

      expect(deleteMock()).not.toHaveBeenCalled();
    }
  );

  it('still range-deletes a provider source over its days', async () => {
    await measurementService.processHealthData(
      [
        workout({ source: 'HealthKit', date: '2026-10-15' }),
        workout({ source: 'HealthKit', date: '2026-10-16' }),
      ],
      'user-1',
      'user-1'
    );

    expect(deleteMock()).toHaveBeenCalledTimes(1);
    const [userId, startDate, endDate, source] = deleteMock().mock.calls[0];
    expect({ userId, startDate, endDate, source }).toEqual({
      userId: 'user-1',
      startDate: '2026-10-15',
      endDate: '2026-10-16',
      source: 'HealthKit',
    });
  });

  it('rejects malformed sets before deleting anything', async () => {
    const bad = workout({ source: 'HealthKit', sets: {} });
    const result = await measurementService.processHealthData(
      [bad],
      'user-1',
      'user-1'
    );

    expect(deleteMock()).not.toHaveBeenCalled();
    expect(exerciseEntryDb.createExerciseEntry).not.toHaveBeenCalled();
    expect(result.errors).toEqual([
      { error: 'Invalid workout: sets must be an array.', entry: bad },
    ]);
  });

  it('rejects a set that is itself an array before deleting anything', async () => {
    const bad = workout({ source: 'HealthKit', sets: [[1, 2]] });
    const result = await measurementService.processHealthData(
      [bad],
      'user-1',
      'user-1'
    );

    expect(deleteMock()).not.toHaveBeenCalled();
    expect(result.errors).toEqual([
      { error: 'Invalid workout: every set must be an object.', entry: bad },
    ]);
  });

  it("keeps a rejected workout's stored copy when a valid one shares its day", async () => {
    await measurementService.processHealthData(
      [
        workout({ source: 'HealthKit', source_id: 'hk-bad', sets: {} }),
        workout({ source: 'HealthKit', source_id: 'hk-good' }),
      ],
      'user-1',
      'user-1'
    );

    expect(deleteMock()).toHaveBeenCalledTimes(1);
    const [, startDate, endDate, , , keepSourceIds] =
      deleteMock().mock.calls[0];
    expect({ startDate, endDate }).toEqual({
      startDate: '2026-10-16',
      endDate: '2026-10-16',
    });
    expect([...keepSourceIds].sort()).toEqual(['hk-bad', 'hk-good']);
  });

  it.each(['constructor', '__proto__', 'toString'])(
    'handles the source name %j without throwing',
    async (source) => {
      await measurementService.processHealthData(
        [workout({ source, source_id: 'id-1' })],
        'user-1',
        'user-1'
      );

      expect(deleteMock()).toHaveBeenCalledTimes(1);
      expect(deleteMock().mock.calls[0][3]).toBe(source);
    }
  );

  it('limits the delete to the days of the valid workouts in a mixed batch', async () => {
    await measurementService.processHealthData(
      [
        workout({ source: 'HealthKit', date: '2026-10-10', sets: [null] }),
        workout({ source: 'HealthKit', date: '2026-10-16' }),
      ],
      'user-1',
      'user-1'
    );

    expect(deleteMock()).toHaveBeenCalledTimes(1);
    const [, startDate, endDate] = deleteMock().mock.calls[0];
    expect({ startDate, endDate }).toEqual({
      startDate: '2026-10-16',
      endDate: '2026-10-16',
    });
  });
});
