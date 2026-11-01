import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import type { HealthEntryContext } from '../services/healthDataHandlers.js';
import type { WorkoutSummary } from '../services/workoutDuplicateDetection.js';

// The workout handler's use of the duplicate check (#2839): opt-in, skips or
// replaces only synced entries, and never costs an import when it fails.

vi.mock('../models/exerciseEntry.js', () => ({
  default: { createExerciseEntry: vi.fn() },
  EXERCISE_ENTRY_TELEMETRY_COLUMNS: ['max_heart_rate', 'avg_heart_rate'],
}));
vi.mock('../models/exercise.js', () => ({
  default: {
    findExerciseByNameAndUserId: vi.fn(),
    createExercise: vi.fn(),
    getExerciseBySourceAndSourceId: vi.fn(),
    updateExercise: vi.fn(),
  },
}));
vi.mock('../models/workoutTelemetryRepository.js', () => ({
  bulkInsertExerciseEntryGpsPoints: vi.fn(),
  bulkInsertExerciseEntryLaps: vi.fn(),
  bulkInsertExerciseEntryHrZones: vi.fn(),
}));
vi.mock('../services/healthMetricSampleWriter.js', () => ({
  upsertSamplesByDay: vi.fn(),
}));
vi.mock('../models/workoutDuplicateRepository.js', () => ({
  default: {
    findWorkoutDedupeCandidates: vi.fn(),
    findMergedDuplicateOwner: vi.fn(),
    recordMergedDuplicate: vi.fn(),
    replaceWithMergedDuplicate: vi.fn(),
  },
}));

const { resolveHandler } = await import('../services/healthDataHandlers.js');
const exerciseEntryDb = (await import('../models/exerciseEntry.js')).default;
const exerciseDb = (await import('../models/exercise.js')).default;
const dupRepo = (await import('../models/workoutDuplicateRepository.js'))
  .default;

const handler = resolveHandler('ExerciseSession')!;
const ctx = {
  userId: 'user-1',
  actingUserId: 'user-1',
  parsedDate: '2026-10-18',
  entryTimestamp: '2026-10-18T10:49:00.000Z',
  entryHour: 11,
  legacyWorkoutSetMinutes: false,
  getSleepContext: vi
    .fn()
    .mockResolvedValue({ tz: 'Europe/Lisbon', userProfile: {} }),
} as unknown as HealthEntryContext;

// Walk B from #2839, as the phone sends it: no heart rate.
const walkB = {
  type: 'ExerciseSession',
  source: 'Health Connect',
  source_id: '50cd4679-b',
  activityType: 'Walking',
  duration: 84 * 60,
  distance: 7.14,
  steps: 9294,
  record_timezone: 'Europe/Lisbon',
};
const storedA: WorkoutSummary = {
  id: 'entry-a',
  source: 'Health Connect',
  sourceId: 'f2069027-a',
  activity: 'Walking',
  startMs: Date.parse('2026-10-18T10:47:00Z'),
  durationMinutes: 86.1,
  distanceKm: 7.29,
  steps: 9522,
  avgHeartRate: 107,
  maxHeartRate: 146,
  completeness: 5,
  isManual: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPARKY_FITNESS_HEALTH_WORKOUT_DEDUPE = 'true';
  (exerciseDb.findExerciseByNameAndUserId as Mock).mockResolvedValue({
    id: 'ex-walk',
  });
  (exerciseEntryDb.createExerciseEntry as Mock).mockResolvedValue({
    id: 'entry-new',
  });
  (dupRepo.findMergedDuplicateOwner as Mock).mockResolvedValue(null);
  (dupRepo.findWorkoutDedupeCandidates as Mock).mockResolvedValue([]);
});
afterEach(() => {
  delete process.env.SPARKY_FITNESS_HEALTH_WORKOUT_DEDUPE;
});

describe('workout handler duplicate check', () => {
  it('is off unless the flag is set: no lookups, a normal import', async () => {
    delete process.env.SPARKY_FITNESS_HEALTH_WORKOUT_DEDUPE;
    (dupRepo.findWorkoutDedupeCandidates as Mock).mockResolvedValue([storedA]);

    const outcome = await handler.handle(walkB, ctx);

    expect(outcome.status).toBe('success');
    expect(dupRepo.findMergedDuplicateOwner).not.toHaveBeenCalled();
    expect(dupRepo.findWorkoutDedupeCandidates).not.toHaveBeenCalled();
    expect(exerciseEntryDb.createExerciseEntry).toHaveBeenCalledTimes(1);
  });

  it('skips the example walk B and records its source_id on A', async () => {
    (dupRepo.findWorkoutDedupeCandidates as Mock).mockResolvedValue([storedA]);

    const outcome = await handler.handle(walkB, ctx);

    expect(outcome.status).toBe('skipped');
    expect(exerciseEntryDb.createExerciseEntry).not.toHaveBeenCalled();
    expect(dupRepo.findWorkoutDedupeCandidates).toHaveBeenCalledWith(
      'user-1',
      '2026-10-17',
      '2026-10-19',
      'Europe/Lisbon'
    );
    const [, keptId, source, data] = (dupRepo.recordMergedDuplicate as Mock)
      .mock.calls[0];
    expect({ keptId, source, sourceId: data.source_id }).toEqual({
      keptId: 'entry-a',
      source: 'Health Connect',
      sourceId: '50cd4679-b',
    });
  });

  it('skips a Walking copy of a stored Running session (25/10) and records it', async () => {
    const storedRun: WorkoutSummary = {
      id: 'entry-run-25',
      source: 'Health Connect',
      sourceId: 'ddde2682',
      activity: 'Running',
      startMs: Date.parse('2026-10-25T11:47:00Z'),
      durationMinutes: 78.93,
      distanceKm: 7.25,
      steps: 9601,
      avgHeartRate: 137,
      maxHeartRate: 174,
      completeness: 8,
      isManual: false,
    };
    (dupRepo.findWorkoutDedupeCandidates as Mock).mockResolvedValue([
      storedRun,
    ]);
    const walk25 = {
      ...walkB,
      source_id: 'walk-25',
      duration: 80.8 * 60,
      distance: 7.35,
      steps: 9840,
      telemetry: { avg_heart_rate: 137, max_heart_rate: 174 },
    };

    const outcome = await handler.handle(walk25, {
      ...ctx,
      parsedDate: '2026-10-25',
      entryTimestamp: '2026-10-25T11:47:00.000Z',
    } as HealthEntryContext);

    expect(outcome.status).toBe('skipped');
    expect(exerciseEntryDb.createExerciseEntry).not.toHaveBeenCalled();
    const [, keptId, , data] = (dupRepo.recordMergedDuplicate as Mock).mock
      .calls[0];
    expect({ keptId, sourceId: data.source_id }).toEqual({
      keptId: 'entry-run-25',
      sourceId: 'walk-25',
    });
    expect(data.agreeing).toContain('heart rate');
  });

  it('skips a re-sent record already recorded as merged, without comparing again', async () => {
    (dupRepo.findMergedDuplicateOwner as Mock).mockResolvedValue('entry-a');

    const outcome = await handler.handle(walkB, ctx);

    expect(outcome.status).toBe('skipped');
    expect(dupRepo.findWorkoutDedupeCandidates).not.toHaveBeenCalled();
    expect(exerciseEntryDb.createExerciseEntry).not.toHaveBeenCalled();
  });

  it('imports the more complete copy and replaces the stored one', async () => {
    const storedB: WorkoutSummary = {
      ...storedA,
      id: 'entry-b',
      sourceId: '50cd4679-b',
      startMs: Date.parse('2026-10-18T10:49:00Z'),
      durationMinutes: 84,
      avgHeartRate: null,
      maxHeartRate: null,
      completeness: 2,
    };
    (dupRepo.findWorkoutDedupeCandidates as Mock).mockResolvedValue([storedB]);
    const walkA = {
      ...walkB,
      source_id: 'f2069027-a',
      duration: 86.1 * 60,
      distance: 7.29,
      steps: 9522,
      telemetry: { avg_heart_rate: 107, max_heart_rate: 146 },
    };

    const outcome = await handler.handle(walkA, {
      ...ctx,
      entryTimestamp: '2026-10-18T10:47:00.000Z',
    } as HealthEntryContext);

    expect(outcome.status).toBe('success');
    expect(exerciseEntryDb.createExerciseEntry).toHaveBeenCalledTimes(1);
    const [, replacedId, keptId, source, data] = (
      dupRepo.replaceWithMergedDuplicate as Mock
    ).mock.calls[0];
    expect({ replacedId, keptId, source, sourceId: data.source_id }).toEqual({
      replacedId: 'entry-b',
      keptId: 'entry-new',
      source: 'Health Connect',
      sourceId: '50cd4679-b',
    });
  });

  it('imports a workout that only overlaps a manual entry, touching nothing', async () => {
    (dupRepo.findWorkoutDedupeCandidates as Mock).mockResolvedValue([
      {
        ...storedA,
        id: 'manual-1',
        source: 'manual',
        sourceId: null,
        isManual: true,
      },
    ]);

    const outcome = await handler.handle(walkB, ctx);

    expect(outcome.status).toBe('success');
    expect(dupRepo.recordMergedDuplicate).not.toHaveBeenCalled();
    expect(dupRepo.replaceWithMergedDuplicate).not.toHaveBeenCalled();
  });

  it('updates a re-synced record in place and merges nothing', async () => {
    (dupRepo.findWorkoutDedupeCandidates as Mock).mockResolvedValue([
      storedA,
      { ...storedA, id: 'entry-b', sourceId: '50cd4679-b', completeness: 2 },
    ]);

    const outcome = await handler.handle(walkB, ctx);

    expect(outcome.status).toBe('success');
    expect(exerciseEntryDb.createExerciseEntry).toHaveBeenCalledTimes(1);
    expect(dupRepo.recordMergedDuplicate).not.toHaveBeenCalled();
    expect(dupRepo.replaceWithMergedDuplicate).not.toHaveBeenCalled();
  });

  it('imports normally when the check itself fails', async () => {
    (dupRepo.findMergedDuplicateOwner as Mock).mockRejectedValue(
      new Error('db down')
    );
    (dupRepo.findWorkoutDedupeCandidates as Mock).mockRejectedValue(
      new Error('db down')
    );

    const outcome = await handler.handle(walkB, ctx);

    expect(outcome.status).toBe('success');
    expect(exerciseEntryDb.createExerciseEntry).toHaveBeenCalledTimes(1);
  });
});
