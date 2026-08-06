import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { HealthEntryContext } from '../services/healthDataHandlers.js';

vi.mock('../models/exercise.js', () => ({
  default: {
    findExerciseByNameAndUserId: vi.fn(),
    createExercise: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: { createExerciseEntry: vi.fn() },
  // The handler imports the real column list to build its allowlist; a trimmed
  // but representative set keeps the mock honest without restating all 41.
  EXERCISE_ENTRY_TELEMETRY_COLUMNS: [
    'max_heart_rate',
    'avg_speed_mps',
    'max_speed_mps',
    'avg_cadence',
    'elevation_gain_meters',
    'elevation_loss_meters',
    'elapsed_time_seconds',
    'active_calories',
    'gear_name',
  ],
}));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: { createActivityDetail: vi.fn() },
}));
vi.mock('../models/workoutTelemetryRepository.js', () => ({
  bulkInsertExerciseEntryGpsPoints: vi.fn(),
  bulkInsertExerciseEntryLaps: vi.fn(),
  bulkInsertExerciseEntryHrZones: vi.fn(),
}));
vi.mock('../services/healthMetricSampleWriter.js', () => ({
  upsertSamplesByDay: vi.fn(),
}));
vi.mock('../models/measurementRepository.js', () => ({ default: {} }));
vi.mock('../models/waterContainerRepository.js', () => ({ default: {} }));

const { HEALTH_TYPE_HANDLERS } =
  await import('../services/healthDataHandlers.js');
const exerciseDb = (await import('../models/exercise.js')).default;
const exerciseEntryDb = (await import('../models/exerciseEntry.js')).default;
const telemetryRepo = await import('../models/workoutTelemetryRepository.js');
const { upsertSamplesByDay } =
  await import('../services/healthMetricSampleWriter.js');

const workoutHandler = HEALTH_TYPE_HANDLERS['Workout'];

const ENTRY_ID = 'entry-uuid-1';

function makeCtx(
  overrides: Partial<HealthEntryContext> = {}
): HealthEntryContext {
  return {
    userId: 'user-1',
    actingUserId: 'user-1',
    parsedDate: '2026-08-04',
    entryTimestamp: '2026-08-04T09:00:00.000Z',
    entryHour: 9,
    legacyWorkoutSetMinutes: false,
    getSleepContext: vi.fn().mockResolvedValue({
      tz: 'UTC',
      userProfile: { date_of_birth: '1990-08-04' },
    }),
    processSleepEntry: vi.fn(),
    resolveCategory: vi.fn(),
    ...overrides,
  } as unknown as HealthEntryContext;
}

const at = (seconds: number): string =>
  new Date(
    Date.parse('2026-08-04T09:00:00.000Z') + seconds * 1000
  ).toISOString();

function baseEntry(extra: Record<string, unknown> = {}) {
  return {
    type: 'ExerciseSession',
    source: 'HealthKit',
    source_id: 'hk-workout-1',
    activityType: 'Outdoor Walk',
    caloriesBurned: 150,
    distance: 2.4,
    duration: 1800,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (exerciseDb.findExerciseByNameAndUserId as Mock).mockResolvedValue(null);
  (exerciseDb.createExercise as Mock).mockResolvedValue({ id: 'exercise-1' });
  (exerciseEntryDb.createExerciseEntry as Mock).mockResolvedValue({
    id: ENTRY_ID,
  });
});

describe('workoutHandler — backward compatibility', () => {
  // The regression guard that makes the server safe to deploy ahead of any app
  // release: a client that sends no telemetry must take exactly the old path.
  it('writes no telemetry tables for a payload without telemetry', async () => {
    const result = await workoutHandler.handle(baseEntry(), makeCtx());

    expect(result.status).toBe('success');
    expect(
      telemetryRepo.bulkInsertExerciseEntryGpsPoints
    ).not.toHaveBeenCalled();
    expect(telemetryRepo.bulkInsertExerciseEntryLaps).not.toHaveBeenCalled();
    expect(telemetryRepo.bulkInsertExerciseEntryHrZones).not.toHaveBeenCalled();
    expect(upsertSamplesByDay).not.toHaveBeenCalled();
  });

  it('does not invent telemetry columns when none were sent', async () => {
    await workoutHandler.handle(baseEntry(), makeCtx());

    const payload = (exerciseEntryDb.createExerciseEntry as Mock).mock
      .calls[0][1];
    expect(payload.avg_heart_rate).toBeUndefined();
    expect(payload.max_speed_mps).toBeUndefined();
  });

  it('passes the payload source_id through to the entry', async () => {
    // source_id is the dedup key: dropping it turns every re-sync of the same
    // session into a duplicate entry.
    await workoutHandler.handle(
      baseEntry({ telemetry: { max_heart_rate: 138 } }),
      makeCtx()
    );

    const payload = (exerciseEntryDb.createExerciseEntry as Mock).mock
      .calls[0][1];
    expect(payload.source_id).toBe('hk-workout-1');
  });
});

describe('workoutHandler — exercise modality', () => {
  it('creates an outdoor walk as a distance activity', async () => {
    await workoutHandler.handle(baseEntry(), makeCtx());

    expect(exerciseDb.createExercise as Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'Cardio',
        modality: 'duration_distance',
      })
    );
  });

  it('creates a stationary bike as duration-only', async () => {
    await workoutHandler.handle(
      baseEntry({ activityType: 'Indoor Cycle' }),
      makeCtx()
    );

    expect(exerciseDb.createExercise as Mock).toHaveBeenCalledWith(
      expect.objectContaining({ modality: 'duration' })
    );
  });
});

describe('workoutHandler — telemetry columns', () => {
  it('passes allowlisted telemetry through to the entry', async () => {
    await workoutHandler.handle(
      baseEntry({
        telemetry: {
          avg_heart_rate: 112,
          max_heart_rate: 138,
          elevation_gain_meters: 24,
          gear_name: 'Trail shoes',
        },
      }),
      makeCtx()
    );

    const payload = (exerciseEntryDb.createExerciseEntry as Mock).mock
      .calls[0][1];
    expect(payload).toMatchObject({
      avg_heart_rate: 112,
      max_heart_rate: 138,
      elevation_gain_meters: 24,
      gear_name: 'Trail shoes',
    });
  });

  it('drops unknown keys so the payload cannot write arbitrary columns', async () => {
    await workoutHandler.handle(
      baseEntry({
        telemetry: {
          avg_heart_rate: 112,
          user_id: 'attacker',
          notes: 'injected',
          id: 'forced-id',
        },
      }),
      makeCtx()
    );

    const payload = (exerciseEntryDb.createExerciseEntry as Mock).mock
      .calls[0][1];
    expect(payload.user_id).toBeUndefined();
    expect(payload.notes).not.toBe('injected');
    expect(payload.id).toBeUndefined();
  });

  it('rejects non-finite numbers', async () => {
    await workoutHandler.handle(
      baseEntry({
        telemetry: { max_heart_rate: Number.NaN, avg_cadence: Infinity },
      }),
      makeCtx()
    );

    const payload = (exerciseEntryDb.createExerciseEntry as Mock).mock
      .calls[0][1];
    expect(payload.max_heart_rate).toBeUndefined();
    expect(payload.avg_cadence).toBeUndefined();
  });

  it('lets a device-reported value win over one derived from the series', async () => {
    await workoutHandler.handle(
      baseEntry({
        telemetry: { avg_heart_rate: 999 },
        hr_samples: [
          { t: at(0), bpm: 100 },
          { t: at(10), bpm: 120 },
        ],
      }),
      makeCtx()
    );

    const payload = (exerciseEntryDb.createExerciseEntry as Mock).mock
      .calls[0][1];
    expect(payload.avg_heart_rate).toBe(999);
  });

  it('backfills summary values the device omitted', async () => {
    await workoutHandler.handle(
      baseEntry({
        hr_samples: [
          { t: at(0), bpm: 100 },
          { t: at(10), bpm: 120 },
        ],
      }),
      makeCtx()
    );

    const payload = (exerciseEntryDb.createExerciseEntry as Mock).mock
      .calls[0][1];
    expect(payload.avg_heart_rate).toBe(110);
    expect(payload.max_heart_rate).toBe(120);
  });
});

describe('workoutHandler — GPS, laps and zones', () => {
  const gpsEntry = () =>
    baseEntry({
      // Two points inside each lap window, so per-lap deltas (elevation,
      // distance) have something to measure against.
      gps_points: [
        {
          t: at(0),
          lat: 37.7749,
          lon: -122.4194,
          alt: 10,
          speed: 1.3,
          hr: 105,
        },
        {
          t: at(15),
          lat: 37.7754,
          lon: -122.4188,
          alt: 16,
          speed: 1.35,
          hr: 112,
        },
        { t: at(30), lat: 37.776, lon: -122.418, alt: 22, speed: 1.4, hr: 120 },
        {
          t: at(45),
          lat: 37.7765,
          lon: -122.4175,
          alt: 26,
          speed: 1.3,
          hr: 135,
        },
        { t: at(60), lat: 37.777, lon: -122.417, alt: 18, speed: 1.2, hr: 150 },
      ],
      hr_samples: [
        { t: at(0), bpm: 105 },
        { t: at(15), bpm: 112 },
        { t: at(30), bpm: 120 },
        { t: at(45), bpm: 135 },
        { t: at(60), bpm: 150 },
      ],
      laps: [
        { lap_index: 1, start_time: at(0), end_time: at(30) },
        { lap_index: 2, start_time: at(30), end_time: at(60) },
      ],
    });

  it('writes flat trackpoint rows for the repository to pack', async () => {
    await workoutHandler.handle(gpsEntry(), makeCtx());

    expect(
      telemetryRepo.bulkInsertExerciseEntryGpsPoints
    ).toHaveBeenCalledTimes(1);
    const [userId, actingUserId, rows] = (
      telemetryRepo.bulkInsertExerciseEntryGpsPoints as Mock
    ).mock.calls[0];
    expect(userId).toBe('user-1');
    expect(actingUserId).toBe('user-1');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      exercise_entry_id: ENTRY_ID,
      entry_date: '2026-08-04',
      latitude: 37.7749,
      longitude: -122.4194,
      heart_rate_bpm: 105,
    });
    expect(rows[0].timestamp).toBeInstanceOf(Date);
  });

  it('writes laps with server-derived aggregates and Date bounds', async () => {
    await workoutHandler.handle(gpsEntry(), makeCtx());

    const rows = (telemetryRepo.bulkInsertExerciseEntryLaps as Mock).mock
      .calls[0][2];
    expect(rows).toHaveLength(2);
    expect(rows[0].start_time).toBeInstanceOf(Date);
    expect(rows[0].duration_seconds).toBe(30);
    expect(rows[0].avg_heart_rate).toBeGreaterThan(0);
    expect(rows[0].elevation_gain_meters).toBeGreaterThan(0);
  });

  it('writes heart-rate zones', async () => {
    await workoutHandler.handle(gpsEntry(), makeCtx());

    const rows = (telemetryRepo.bulkInsertExerciseEntryHrZones as Mock).mock
      .calls[0][2];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      exercise_entry_id: ENTRY_ID,
      entry_date: '2026-08-04',
    });
  });

  it('derives zones from trackpoint heart rate when no series was sent', async () => {
    const entry = gpsEntry();
    delete (entry as Record<string, unknown>).hr_samples;

    await workoutHandler.handle(entry, makeCtx());

    expect(telemetryRepo.bulkInsertExerciseEntryHrZones).toHaveBeenCalled();
  });

  it('still writes zones for an indoor workout with no GPS', async () => {
    await workoutHandler.handle(
      baseEntry({
        activityType: 'Indoor Cycle',
        hr_samples: [
          { t: at(0), bpm: 140 },
          { t: at(30), bpm: 150 },
          { t: at(60), bpm: 155 },
        ],
      }),
      makeCtx()
    );

    expect(
      telemetryRepo.bulkInsertExerciseEntryGpsPoints
    ).not.toHaveBeenCalled();
    expect(telemetryRepo.bulkInsertExerciseEntryHrZones).toHaveBeenCalled();
  });

  it('ignores malformed trackpoints instead of failing the workout', async () => {
    await workoutHandler.handle(
      baseEntry({
        gps_points: [
          { t: at(0), lat: 37.7749, lon: -122.4194 },
          { t: 'not-a-date', lat: 1, lon: 1 },
          { t: at(30), lat: null, lon: -122.418 },
          { t: at(60), lat: 37.777, lon: -122.417 },
        ],
      }),
      makeCtx()
    );

    const rows = (telemetryRepo.bulkInsertExerciseEntryGpsPoints as Mock).mock
      .calls[0][2];
    expect(rows).toHaveLength(2);
  });

  it('nulls unusable sensor readings without discarding the fix', async () => {
    await workoutHandler.handle(
      baseEntry({
        gps_points: [
          {
            t: at(0),
            lat: 37.7749,
            lon: -122.4194,
            alt: Number.NaN,
            speed: '1.3',
            hr: Infinity,
            hacc: 4.2,
            vacc: null,
            course: 271.5,
          },
        ],
      }),
      makeCtx()
    );

    const rows = (telemetryRepo.bulkInsertExerciseEntryGpsPoints as Mock).mock
      .calls[0][2];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      latitude: 37.7749,
      altitude_meters: null,
      speed_mps: null,
      heart_rate_bpm: null,
      horizontal_accuracy_meters: 4.2,
      vertical_accuracy_meters: null,
      course_degrees: 271.5,
    });
  });
});

describe('workoutHandler — heart-rate samples', () => {
  it('merges rather than replacing the day bucket', async () => {
    // health_metric_samples holds one row per (user, metric, day, provider);
    // replace mode here would delete the rest of the day's readings.
    await workoutHandler.handle(
      baseEntry({
        hr_samples: [
          { t: at(0), bpm: 105 },
          { t: at(60), bpm: 130 },
        ],
      }),
      makeCtx()
    );

    const call = (upsertSamplesByDay as Mock).mock.calls[0];
    expect(call[2]).toBe('heart_rate');
    expect(call[3]).toBe('HealthKit');
    expect(call[5]).toMatchObject({ mode: 'merge' });
    expect(call[5].window.startMs).toBe(Date.parse(at(0)));
    expect(call[5].window.endMs).toBe(Date.parse(at(60)));
  });

  it('links every sample back to its workout', async () => {
    await workoutHandler.handle(
      baseEntry({
        hr_samples: [
          { t: at(0), bpm: 105 },
          { t: at(60), bpm: 130 },
        ],
      }),
      makeCtx()
    );

    const samples = (upsertSamplesByDay as Mock).mock.calls[0][4];
    expect(samples.every((s: { ex: string }) => s.ex === ENTRY_ID)).toBe(true);
  });

  it('buckets a workout crossing midnight onto both local days', async () => {
    await workoutHandler.handle(
      baseEntry({
        hr_samples: [
          { t: '2026-08-04T23:50:00.000Z', bpm: 120 },
          { t: '2026-08-05T00:10:00.000Z', bpm: 125 },
        ],
      }),
      makeCtx()
    );

    const samples = (upsertSamplesByDay as Mock).mock.calls[0][4];
    expect(samples.map((s: { entry_date: string }) => s.entry_date)).toEqual([
      '2026-08-04',
      '2026-08-05',
    ]);
  });
});

describe('workoutHandler — failure isolation', () => {
  it('still reports success when telemetry persistence fails', async () => {
    // The session itself saved; losing the map should not make the client
    // re-send the whole workout.
    (telemetryRepo.bulkInsertExerciseEntryGpsPoints as Mock).mockRejectedValue(
      new Error('gps table unavailable')
    );

    const result = await workoutHandler.handle(
      baseEntry({
        gps_points: [
          { t: at(0), lat: 1, lon: 1 },
          { t: at(30), lat: 1.001, lon: 1 },
        ],
      }),
      makeCtx()
    );

    expect(result.status).toBe('success');
  });

  it('reports an error when the entry itself fails', async () => {
    (exerciseEntryDb.createExerciseEntry as Mock).mockRejectedValue(
      new Error('db down')
    );

    const result = await workoutHandler.handle(baseEntry(), makeCtx());

    expect(result.status).toBe('error');
  });
});
