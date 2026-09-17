import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Proves the pre-cleanup no longer destroys telemetry a re-sync does not carry.
//
// The enriched-session reuse cache (#2191) makes every sync after the first
// re-send an already-collected workout summary-only. The pre-cleanup used to
// delete that workout's row before re-inserting it, and the route, laps and
// heart-rate zones cascade off exercise_entry_id — so the second sync of any
// range silently dropped the heart rate the first one had stored (#2300).

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    createExerciseEntry: vi.fn(),
    deleteExerciseEntriesByEntrySourceAndDate: vi.fn(),
  },
  EXERCISE_ENTRY_TELEMETRY_COLUMNS: [
    'max_heart_rate',
    'avg_speed_mps',
    'elapsed_time_seconds',
    'active_calories',
  ],
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
  type: 'ExerciseSession',
  source: 'HealthKit',
  source_id: 'hk-1',
  activityType: 'Outdoor Walk',
  caloriesBurned: 150,
  distance: 2.4,
  duration: 1800,
  timestamp: '2026-08-04T09:00:00.000Z',
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

describe('processHealthData pre-cleanup', () => {
  it('holds back the re-sent workout so its stored telemetry is not cascaded away (#2300)', async () => {
    await measurementService.processHealthData([workout()], 'user-1', 'user-1');

    const [, startDate, endDate, source, , keepSourceIds] =
      deleteMock().mock.calls[0];
    expect({ startDate, endDate, source, keepSourceIds }).toEqual({
      startDate: '2026-08-04',
      endDate: '2026-08-04',
      source: 'HealthKit',
      keepSourceIds: ['hk-1'],
    });
  });

  it('still deletes everything else in the span, so an upstream deletion propagates', async () => {
    // Two workouts on the day, only one re-sent: the other is not held back and
    // is therefore removed, which is what the pre-cleanup exists for.
    await measurementService.processHealthData(
      [workout({ source_id: 'hk-1' }), workout({ source_id: 'hk-2' })],
      'user-1',
      'user-1'
    );

    expect(deleteMock().mock.calls[0][5]).toEqual(['hk-1', 'hk-2']);
  });

  it('keeps the unconditional span delete for records with no source_id', async () => {
    // Nothing to dedupe on, so the old delete-then-insert behaviour is the only
    // way to stay idempotent.
    await measurementService.processHealthData(
      [workout({ source_id: undefined })],
      'user-1',
      'user-1'
    );

    expect(deleteMock().mock.calls[0][5]).toEqual([]);
  });
});
