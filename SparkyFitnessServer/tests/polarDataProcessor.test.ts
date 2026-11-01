import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import sleepRepository from '../models/sleepRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import * as genericHealthRepository from '../models/genericHealthRepository.js';
import { upsertSamplesByDay } from '../services/healthMetricSampleWriter.js';
import {
  hypnogramStageStartMs,
  processPolarActivity,
  processPolarExercises,
  processPolarNightlyRecharge,
  processPolarPhysicalInfo,
  processPolarSleep,
  processPolarCardioLoad,
  processPolarContinuousHeartRate,
  processPolarSpO2,
  processPolarBodyTemperature,
  processPolarSkinTemperature,
  resolvePolarActivityDate,
  resolvePolarActivitySteps,
} from '../integrations/polar/polarDataProcessor.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('America/New_York'),
}));
vi.mock('../services/healthMetricSampleWriter.js', () => ({
  upsertSamplesByDay: vi.fn().mockResolvedValue(1),
}));
vi.mock('../models/measurementRepository.js', () => ({
  default: {
    upsertStepData: vi.fn(),
    upsertCheckInMeasurements: vi.fn(),
    getCustomCategories: vi.fn().mockResolvedValue([]),
    createCustomCategory: vi.fn().mockResolvedValue({ id: 'cat-new' }),
    upsertCustomMeasurement: vi.fn(),
  },
}));
vi.mock('../models/genericHealthRepository.js', () => ({
  upsertDailyHealthMetrics: vi.fn().mockResolvedValue({}),
  bulkUpsertVitals: vi.fn().mockResolvedValue([]),
}));
vi.mock('../models/exercise.js', () => ({
  default: {
    getExerciseBySourceAndSourceId: vi.fn(),
    searchExercises: vi.fn(),
    createExercise: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    deleteExerciseEntriesByEntrySourceAndDate: vi.fn(),
    createExerciseEntry: vi.fn(),
  },
}));
vi.mock('../models/sleepRepository.js', () => ({
  default: {
    upsertSleepEntry: vi.fn(),
    deleteSleepStageEventsByEntryId: vi.fn(),
    upsertSleepStageEvent: vi.fn(),
  },
}));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: { createActivityDetail: vi.fn() },
}));

const UID = 'user-1';
const CID = 'user-1';

describe('processPolarExercises duration units', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      exerciseRepository.getExerciseBySourceAndSourceId
    ).mockResolvedValue({ id: 'exercise-1', name: 'Running' });
    vi.mocked(exerciseEntryRepository.createExerciseEntry).mockResolvedValue({
      id: 'entry-1',
    });
  });

  it('stores entry duration in minutes and set duration in integer seconds (issue #1903)', async () => {
    await processPolarExercises(UID, CID, [
      {
        id: 42,
        'start-time': '2026-07-15T10:00:00',
        duration: 'PT30M',
        calories: 300,
        distance: 5000,
        sport: 'RUNNING',
        'detailed-sport-info': 'Running',
      },
    ] as Parameters<typeof processPolarExercises>[2]);

    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({
        duration_minutes: 30,
        sets: [expect.objectContaining({ duration: 1800 })],
      }),
      CID,
      'Polar'
    );
  });
});

describe('processPolarSleep recording-zone stamp (issue #2033)', () => {
  // processPolarSleep's untyped `sleepData = []` default infers never[].
  const night = (startTime: string) =>
    ({
      date: '2026-07-15',
      'sleep-start-time': startTime,
      'sleep-end-time': '2026-07-15T07:00:00+03:00',
      'light-sleep': 15000,
      'deep-sleep': 6000,
      'rem-sleep': 6000,
      'total-interruption-duration': 1800,
      'sleep-score': 80,
    }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sleepRepository.upsertSleepEntry).mockResolvedValue({
      id: 'sleep-1',
      created: true,
    });
  });

  it('stamps the offset from the raw offset-suffixed sleep-start-time', async () => {
    await processPolarSleep(UID, CID, [night('2026-07-14T23:39:07+03:00')]);
    const entry = vi.mocked(sleepRepository.upsertSleepEntry).mock.calls[0][2];
    expect(entry.record_utc_offset_minutes).toBe(180);
  });

  it('omits the stamp for a naive sleep-start-time (no zone claim)', async () => {
    await processPolarSleep(UID, CID, [night('2026-07-14T23:39:07')]);
    const entry = vi.mocked(sleepRepository.upsertSleepEntry).mock.calls[0][2];
    expect(entry.record_utc_offset_minutes).toBeUndefined();
  });
});

describe('processPolarSleep hypnogram stages (issue #2431)', () => {
  // A night recorded at UTC+03:00: bedtime 23:39:07, wake 07:00 local, with the
  // hypnogram keyed by wall-clock HH:MM in that zone. Expected instants are in
  // UTC and must not depend on the zone this test process runs in.
  const night = {
    date: '2026-07-15',
    'sleep-start-time': '2026-07-14T23:39:07+03:00',
    'sleep-end-time': '2026-07-15T07:00:00+03:00',
    'light-sleep': 15000,
    'deep-sleep': 6000,
    'rem-sleep': 6000,
    'total-interruption-duration': 1800,
    'sleep-score': 80,
    hypnogram: { '23:39': 0, '23:50': 4, '02:10': 1, '06:40': 0 },
  } as never;

  const stageCalls = () =>
    vi.mocked(sleepRepository.upsertSleepStageEvent).mock.calls.map(
      (call) =>
        call[2] as {
          stage_type: string;
          start_time: string;
          end_time: string;
          duration_in_seconds: number;
        }
    );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sleepRepository.upsertSleepEntry).mockResolvedValue({
      id: 'sleep-1',
      created: true,
    });
  });

  it('anchors every stage in the recording zone and ends the last one at wake time', async () => {
    await processPolarSleep(UID, CID, [night]);
    expect(stageCalls()).toEqual([
      {
        stage_type: 'awake',
        start_time: '2026-07-14T20:39:07.000Z',
        end_time: '2026-07-14T20:50:00.000Z',
        duration_in_seconds: 653,
      },
      {
        stage_type: 'deep',
        start_time: '2026-07-14T20:50:00.000Z',
        end_time: '2026-07-14T23:10:00.000Z',
        duration_in_seconds: 8400,
      },
      {
        stage_type: 'rem',
        start_time: '2026-07-14T23:10:00.000Z',
        end_time: '2026-07-15T03:40:00.000Z',
        duration_in_seconds: 16200,
      },
      {
        stage_type: 'awake',
        start_time: '2026-07-15T03:40:00.000Z',
        end_time: '2026-07-15T04:00:00.000Z',
        duration_in_seconds: 1200,
      },
    ]);
  });

  it('keeps the stage total inside the recorded night', async () => {
    await processPolarSleep(UID, CID, [night]);
    const stages = stageCalls();
    const total = stages.reduce((sum, s) => sum + s.duration_in_seconds, 0);
    const nightSeconds =
      (Date.parse('2026-07-15T07:00:00+03:00') -
        Date.parse('2026-07-14T23:39:07+03:00')) /
      1000;
    expect(total).toBe(nightSeconds);
    expect(stages.at(-1)?.end_time).toBe('2026-07-15T04:00:00.000Z');
  });

  it('clamps stages to the wake time and drops one that starts after it', async () => {
    await processPolarSleep(UID, CID, [
      { ...(night as object), hypnogram: { '23:39': 4, '07:30': 0 } } as never,
    ]);
    const stages = stageCalls();
    expect(stages.map((s) => s.stage_type)).toEqual(['deep']);
    expect(stages[0].end_time).toBe('2026-07-15T04:00:00.000Z');
  });

  it('orders stages by instant, not by clock string, across midnight', async () => {
    // Keys handed over in a scrambled order: the night is 23:39 → 23:50 → 02:10 → 06:40.
    await processPolarSleep(UID, CID, [
      {
        ...(night as object),
        hypnogram: [
          { time: '06:40', value: 0 },
          { time: '23:50', value: 4 },
          { time: '02:10', value: 1 },
          { time: '23:39', value: 0 },
        ],
      } as never,
    ]);
    expect(stageCalls().map((s) => [s.stage_type, s.start_time])).toEqual([
      ['awake', '2026-07-14T20:39:07.000Z'],
      ['deep', '2026-07-14T20:50:00.000Z'],
      ['rem', '2026-07-14T23:10:00.000Z'],
      ['awake', '2026-07-15T03:40:00.000Z'],
    ]);
  });
});

describe('hypnogramStageStartMs', () => {
  const bedtime = Date.parse('2026-07-14T23:39:07+03:00');

  it('places a key on the anchor day in the recording zone', () => {
    expect(hypnogramStageStartMs('23:39', bedtime, 180)).toBe(
      Date.parse('2026-07-14T23:39:00+03:00')
    );
  });

  it('rolls a key that reads earlier than the anchor onto the next day', () => {
    expect(hypnogramStageStartMs('00:05', bedtime, 180)).toBe(
      Date.parse('2026-07-15T00:05:00+03:00')
    );
    expect(hypnogramStageStartMs('06:40', bedtime, 180)).toBe(
      Date.parse('2026-07-15T06:40:00+03:00')
    );
  });

  it('works for a negative offset and for a naive (UTC) record', () => {
    const west = Date.parse('2026-07-14T22:30:00-05:00');
    expect(hypnogramStageStartMs('22:30', west, -300)).toBe(west);
    expect(hypnogramStageStartMs('06:10', west, -300)).toBe(
      Date.parse('2026-07-15T06:10:00-05:00')
    );
    const naive = Date.parse('2026-07-14T21:00:00Z');
    expect(hypnogramStageStartMs('03:15', naive, 0)).toBe(
      Date.parse('2026-07-15T03:15:00Z')
    );
  });
});

describe('processPolarActivity daily metrics (issue #2471)', () => {
  // The real payload shape from /users/activities: start_time/end_time, no `date`.
  // processPolarActivity's untyped `activities = []` default infers never[].
  const activity = (overrides: Record<string, unknown> = {}) =>
    ({
      start_time: '2026-09-13T00:00',
      end_time: '2026-09-13T23:56',
      calories: 2635,
      active_calories: 964,
      steps: 8154,
      distance_from_steps: 4682.88,
      ...overrides,
    }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue([
      { id: 'cat-active', name: 'Active Calories' },
      { id: 'cat-daily', name: 'Daily Calories' },
    ]);
  });

  it('writes steps to check_in_measurements, not a custom category', async () => {
    await processPolarActivity(UID, CID, [activity()]);

    expect(measurementRepository.upsertStepData).toHaveBeenCalledWith(
      UID,
      CID,
      8154,
      '2026-09-13'
    );
    // The old "Steps" custom category must no longer be created or written.
    expect(measurementRepository.createCustomCategory).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Steps' })
    );
  });

  it('writes a polar daily_health_metrics summary with distance in metres', async () => {
    await processPolarActivity(UID, CID, [activity()]);

    expect(
      genericHealthRepository.upsertDailyHealthMetrics
    ).toHaveBeenCalledWith(
      UID,
      CID,
      expect.objectContaining({
        user_id: UID,
        entry_date: '2026-09-13',
        source_provider: 'polar',
        total_steps: 8154,
        // Polar already reports metres; it must not be scaled like Garmin's km.
        total_distance_meters: 4682.88,
        active_calories: 964,
        total_calories: 2635,
        // total_calories is only advanced when its capture time comes with it.
        total_calories_captured_at: expect.any(Date),
      })
    );
  });

  it('keeps logging calories as custom measurements', async () => {
    await processPolarActivity(UID, CID, [activity()]);

    const categoryIds = vi
      .mocked(measurementRepository.upsertCustomMeasurement)
      .mock.calls.map((call) => call[2]);
    expect(categoryIds).toEqual(['cat-active', 'cat-daily']);
  });

  it("orders total_calories by Polar's end_time, not local processing time", async () => {
    // The upsert only advances total_calories on a strictly newer stamp. Polar's
    // end_time advances as the current day accumulates, so re-syncs progress;
    // local processing time would not be safe because the hourly cron and the
    // manual route run concurrently with no serialization, so a slow older
    // response can land last and would clobber fresher calories.
    await processPolarActivity(UID, CID, [
      activity({ end_time: '2026-09-13T17:43:30' }),
    ]);

    const stamp = vi.mocked(genericHealthRepository.upsertDailyHealthMetrics)
      .mock.calls[0][2].total_calories_captured_at as Date;

    expect(stamp.toISOString()).toBe('2026-09-13T17:43:30.000Z');
  });

  it('advances the calorie stamp as the day accumulates', async () => {
    await processPolarActivity(UID, CID, [
      activity({ end_time: '2026-09-13T12:00:00' }),
    ]);
    await processPolarActivity(UID, CID, [
      activity({ end_time: '2026-09-13T18:00:00' }),
    ]);

    const calls = vi.mocked(genericHealthRepository.upsertDailyHealthMetrics)
      .mock.calls;
    const first = calls[0][2].total_calories_captured_at as Date;
    const second = calls[1][2].total_calories_captured_at as Date;

    expect(second.getTime()).toBeGreaterThan(first.getTime());
  });

  it('records a zero-step day rather than skipping it', async () => {
    await processPolarActivity(UID, CID, [
      activity({ steps: 0, calories: 0, active_calories: 0 }),
    ]);

    expect(measurementRepository.upsertStepData).toHaveBeenCalledWith(
      UID,
      CID,
      0,
      '2026-09-13'
    );
  });

  it('processes every day it is given, one row per date', async () => {
    await processPolarActivity(UID, CID, [
      activity({ start_time: '2026-09-13T00:00', steps: 8154 }),
      activity({ start_time: '2026-09-14T00:00', steps: 4762 }),
      activity({ start_time: '2026-09-15T00:00', steps: 3445 }),
    ]);

    expect(
      vi
        .mocked(measurementRepository.upsertStepData)
        .mock.calls.map((call) => [call[3], call[2]])
    ).toEqual([
      ['2026-09-13', 8154],
      ['2026-09-14', 4762],
      ['2026-09-15', 3445],
    ]);
  });
});

describe('polar daily_health_metrics merge sources (issue #2471)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue([]);
    vi.mocked(measurementRepository.createCustomCategory).mockResolvedValue({
      id: 'cat-new',
      created: true,
      category: {
        id: 'cat-new',
        name: 'Resting Heart Rate',
        display_name: null,
        frequency: 'Daily',
        measurement_type: 'N/A',
        data_type: 'numeric',
      },
    });
  });

  it('records overnight average HR as the daily resting heart rate', async () => {
    await processPolarNightlyRecharge(UID, CID, [
      { date: '2026-09-09', 'heart-rate-avg': 53 },
    ] as never[]);

    expect(
      genericHealthRepository.upsertDailyHealthMetrics
    ).toHaveBeenCalledWith(
      UID,
      CID,
      expect.objectContaining({
        entry_date: '2026-09-09',
        source_provider: 'polar',
        resting_heart_rate: 53,
      })
    );
  });

  it('records VO2 max from physical information', async () => {
    await processPolarPhysicalInfo(UID, CID, [
      { created: '2026-09-09T10:00:00', 'vo2-max': 47 },
    ] as never[]);

    expect(
      genericHealthRepository.upsertDailyHealthMetrics
    ).toHaveBeenCalledWith(
      UID,
      CID,
      expect.objectContaining({
        entry_date: '2026-09-09',
        source_provider: 'polar',
        vo2_max: 47,
      })
    );
  });
});

describe('resolvePolarActivityDate / resolvePolarActivitySteps', () => {
  it('falls back to start_time when the record carries no date', () => {
    expect(resolvePolarActivityDate({ start_time: '2026-09-08T13:20' })).toBe(
      '2026-09-08'
    );
    expect(resolvePolarActivityDate({ date: '2026-09-08' })).toBe('2026-09-08');
    expect(
      resolvePolarActivityDate({ end_time: '2026-09-08T23:57' })
    ).toBeNull();
  });

  it('reads steps from either field and preserves zero', () => {
    expect(resolvePolarActivitySteps({ steps: 3445 })).toBe(3445);
    expect(resolvePolarActivitySteps({ 'active-steps': 12 })).toBe(12);
    expect(resolvePolarActivitySteps({ steps: 0 })).toBe(0);
    expect(resolvePolarActivitySteps({})).toBeNull();
  });
});

describe('processPolarCardioLoad', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes partial daily health metrics for acute and chronic load', async () => {
    await processPolarCardioLoad(UID, CID, [
      {
        date: '2026-09-18',
        strain: 45.2,
        tolerance: 38.5,
        'cardio-load-ratio': 1.17,
      },
    ]);

    expect(
      genericHealthRepository.upsertDailyHealthMetrics
    ).toHaveBeenCalledWith(
      UID,
      CID,
      expect.objectContaining({
        user_id: UID,
        entry_date: '2026-09-18',
        source_provider: 'polar',
        acute_training_load: 45.2,
        chronic_training_load: 38.5,
        acwr_ratio: 1.17,
      })
    );
  });
});

describe('processPolarNightlyRecharge HRV samples series', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The shape Polar actually returns: an object keyed by wall-clock "HH:MM" in
  // the recording zone. An earlier fixture used a synthetic
  // { '5min-intervals': [...] } object, which no Polar endpoint produces, so the
  // test passed while real payloads silently wrote nothing.
  it('extracts the clock-keyed overnight HRV series', async () => {
    await processPolarNightlyRecharge(UID, CID, [
      {
        date: '2026-09-09',
        'heart-rate-variability-avg': 68,
        hrv_samples: { '23:01': 71, '23:06': 55, '00:01': 66, '04:02': 60 },
      },
    ] as never[]);

    expect(upsertSamplesByDay).toHaveBeenCalledTimes(1);
    const [, , metric, provider, samples] =
      vi.mocked(upsertSamplesByDay).mock.calls[0];
    expect(metric).toBe('hrv');
    expect(provider).toBe('polar');
    expect(samples).toHaveLength(4);
    expect(
      (samples as unknown as Array<{ rmssd_ms: number }>).map((s) => s.rmssd_ms)
    ).toEqual([71, 55, 66, 60]);
  });

  it('places evening readings on the night before the wake date', async () => {
    // `recharge.date` is the wake date, so 23:01 belongs to the previous
    // evening and 00:01 to the date itself. Getting this wrong buries a night's
    // readings on one calendar day (issue #2431 for the sleep hypnogram).
    await processPolarNightlyRecharge(UID, CID, [
      {
        date: '2026-09-09',
        hrv_samples: { '00:01': 66, '23:01': 71 },
      },
    ] as never[]);

    const samples = vi.mocked(upsertSamplesByDay).mock
      .calls[0][4] as unknown as Array<{
      entry_date: string;
      timestamp: Date;
    }>;

    // Sorted chronologically regardless of key order in the payload.
    expect(samples.map((s) => s.entry_date)).toEqual([
      '2026-09-08',
      '2026-09-09',
    ]);
    expect(samples[1].timestamp.getTime()).toBeGreaterThan(
      samples[0].timestamp.getTime()
    );
  });

  it('skips malformed keys and negative values', async () => {
    await processPolarNightlyRecharge(UID, CID, [
      {
        date: '2026-09-09',
        hrv_samples: {
          '01:00': 60,
          'not-a-time': 55,
          '02:00': -1,
          '99:99': 40,
        },
      },
    ] as never[]);

    const samples = vi.mocked(upsertSamplesByDay).mock.calls[0][4] as unknown[];
    expect(samples).toHaveLength(1);
  });
});

describe('processPolarContinuousHeartRate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('converts local sample times to timestamps and writes heart_rate samples', async () => {
    await processPolarContinuousHeartRate(
      UID,
      CID,
      {
        polar_user: 'p-1',
        date: '2026-09-18',
        'heart-rate-samples': [
          { 'sample-time': '08:00:00', 'heart-rate': 62 },
          { 'sample-time': '08:05:00', 'heart-rate': 68 },
        ],
      },
      'America/New_York'
    );

    expect(upsertSamplesByDay).toHaveBeenCalledWith(
      UID,
      CID,
      'heart_rate',
      'polar',
      expect.arrayContaining([
        expect.objectContaining({
          entry_date: '2026-09-18',
          bpm: 62,
          device_name: 'Polar Device',
        }),
        expect.objectContaining({
          entry_date: '2026-09-18',
          bpm: 68,
          device_name: 'Polar Device',
        }),
      ])
    );
  });
});

describe('processPolarSpO2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes passed SpO2 spot test readings and skips invalid ones', async () => {
    await processPolarSpO2(UID, CID, [
      {
        'test-status': 'SPO2_TEST_PASSED',
        'blood-oxygen-percent': 98,
        'test-time': 1726660000,
        date: '2026-09-18',
      },
      {
        'test-status': 'SPO2_TEST_FAILED',
        'blood-oxygen-percent': 85,
        'test-time': 1726661000,
        date: '2026-09-18',
      },
    ]);

    expect(upsertSamplesByDay).toHaveBeenCalledWith(UID, CID, 'spo2', 'polar', [
      expect.objectContaining({
        entry_date: '2026-09-18',
        percentage: 98,
        device_name: 'Polar Device',
      }),
    ]);
  });
});

describe('processPolarBodyTemperature & processPolarSkinTemperature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes body temperature entries to vitals_entries', async () => {
    await processPolarBodyTemperature(UID, CID, [
      {
        date: '2026-09-18',
        'test-time': 1726660000,
        'temperature-celsius': 36.8,
      },
    ]);

    expect(genericHealthRepository.bulkUpsertVitals).toHaveBeenCalledWith(
      UID,
      CID,
      [
        expect.objectContaining({
          entry_date: '2026-09-18',
          body_temperature_celsius: 36.8,
          source_provider: 'polar',
        }),
      ]
    );
  });

  it('writes skin temperature series to health_metric_samples', async () => {
    await processPolarSkinTemperature(UID, CID, [
      {
        date: '2026-09-18',
        'test-time': 1726660000,
        'skin-temperature-celsius': 34.2,
        'deviation-from-baseline-celsius': 0.3,
      },
    ]);

    expect(upsertSamplesByDay).toHaveBeenCalledWith(
      UID,
      CID,
      'skin_temperature',
      'polar',
      [
        expect.objectContaining({
          entry_date: '2026-09-18',
          celsius: 34.2,
          deviation_celsius: 0.3,
          device_name: 'Polar Device',
        }),
      ]
    );
  });
});

// These fixtures are taken from Polar's published OpenAPI spec
// (https://www.polar.com/accesslink-api/swagger.yaml) rather than invented, so
// they catch the class of bug where a processor parses a shape the API never
// returns and silently writes nothing.
describe('Polar biosensing payloads match the AccessLink spec', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dates SpO2 spot tests from unix seconds, not milliseconds', async () => {
    await processPolarSpO2(UID, CID, [
      {
        test_time: 1697787256,
        test_status: 'SPO2_TEST_PASSED',
        blood_oxygen_percent: 95,
      },
    ] as never[]);

    const samples = vi.mocked(upsertSamplesByDay).mock
      .calls[0][4] as unknown as Array<{ timestamp: Date; percentage: number }>;
    expect(samples[0].percentage).toBe(95);
    expect(samples[0].timestamp.toISOString()).toBe('2023-10-20T07:34:16.000Z');
  });

  it('expands body temperature periods using start_time plus the sample delta', async () => {
    await processPolarBodyTemperature(UID, CID, [
      {
        start_time: '2023-10-20T04:00:00',
        end_time: '2023-10-20T05:00:00',
        samples: [
          { temperature_celsius: 36.5, recording_time_delta_milliseconds: 0 },
          {
            temperature_celsius: 36.7,
            recording_time_delta_milliseconds: 60000,
          },
        ],
      },
    ] as never[]);

    const vitals = vi.mocked(genericHealthRepository.bulkUpsertVitals).mock
      .calls[0][2] as unknown as Array<{
      timestamp: Date;
      body_temperature_celsius: number;
    }>;
    expect(vitals).toHaveLength(2);
    expect(vitals[0].body_temperature_celsius).toBe(36.5);
    expect(vitals[0].timestamp.toISOString()).toBe('2023-10-20T04:00:00.000Z');
    // Second reading is the delta applied to the period start.
    expect(vitals[1].timestamp.toISOString()).toBe('2023-10-20T04:01:00.000Z');
  });

  it('reads skin temperature from sleep_date and the sleep_time field', async () => {
    await processPolarSkinTemperature(UID, CID, [
      {
        sleep_time_skin_temperature_celsius: 36.5,
        deviation_from_baseline_celsius: 0.5,
        sleep_date: '2023-10-20',
      },
    ] as never[]);

    const samples = vi.mocked(upsertSamplesByDay).mock
      .calls[0][4] as unknown as Array<{ entry_date: string }>;
    expect(samples).toHaveLength(1);
    expect(samples[0].entry_date).toBe('2023-10-20');
  });
});

describe('Polar sample day-bucketing (issue #2471 follow-up)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges HRV rather than replacing a day two nights both touch', async () => {
    // A night straddles midnight, so night N's morning samples and night N+1's
    // evening samples share day N. In the default `replace` mode the later
    // night wiped the earlier night's readings for that day.
    await processPolarNightlyRecharge(UID, CID, [
      { date: '2026-09-09', hrv_samples: { '23:01': 71, '00:10': 66 } },
      { date: '2026-09-10', hrv_samples: { '23:05': 70, '00:20': 64 } },
    ] as never[]);

    const calls = vi.mocked(upsertSamplesByDay).mock.calls;
    expect(calls).toHaveLength(2);

    for (const call of calls) {
      const options = call[5] as { mode?: string; window?: unknown };
      expect(options?.mode).toBe('merge');
      expect(options?.window).toBeDefined();
    }

    // Both nights write to 2026-09-09; merge is what stops the second
    // overwriting the first.
    const daysPerCall = calls.map((call) =>
      (call[4] as unknown as Array<{ entry_date: string }>).map(
        (s) => s.entry_date
      )
    );
    expect(daysPerCall[0]).toContain('2026-09-09');
    expect(daysPerCall[1]).toContain('2026-09-09');
  });

  it('buckets SpO2 by the recording zone offset, not the UTC day', async () => {
    // 01:00 in UTC+2 is 23:00 UTC the previous day.
    await processPolarSpO2(UID, CID, [
      {
        test_time: Date.parse('2023-10-19T23:00:00Z') / 1000,
        time_zone_offset: 120,
        test_status: 'SPO2_TEST_PASSED',
        blood_oxygen_percent: 96,
      },
    ] as never[]);

    const samples = vi.mocked(upsertSamplesByDay).mock
      .calls[0][4] as unknown as Array<{ entry_date: string }>;
    expect(samples[0].entry_date).toBe('2023-10-20');
  });
});

describe('malformed Polar timestamps do not abort a sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // syncPolarData's processing phase runs the processors without a
  // per-processor try/catch, so one bad timestamp from a single endpoint used
  // to take down the whole sync: a non-string threw on `.match`, and an
  // unparseable string threw on `.toISOString()`.
  it('skips unparseable SpO2 timestamps instead of throwing', async () => {
    await expect(
      processPolarSpO2(UID, CID, [
        {
          test_time: 'not-a-date',
          test_status: 'SPO2_TEST_PASSED',
          blood_oxygen_percent: 97,
        },
        {
          test_time: { nested: true },
          test_status: 'SPO2_TEST_PASSED',
          blood_oxygen_percent: 98,
        },
        {
          test_time: 1697787256,
          time_zone_offset: 0,
          test_status: 'SPO2_TEST_PASSED',
          blood_oxygen_percent: 95,
        },
      ] as never[])
    ).resolves.not.toThrow();

    // The one valid reading still lands, and neither bad row becomes an
    // epoch-0 date: `new Date(null)` is finite and would have passed the guard.
    const samples = vi.mocked(upsertSamplesByDay).mock
      .calls[0][4] as unknown as Array<{ percentage: number; timestamp: Date }>;
    expect(samples).toHaveLength(1);
    expect(samples[0].percentage).toBe(95);
    expect(samples[0].timestamp.getUTCFullYear()).toBe(2023);
  });

  it('rejects impossible calendar dates rather than rolling them forward', async () => {
    // new Date() silently normalises "2026-02-30" to 2026-03-02, which is
    // finite and would have been stored two days off.
    await processPolarBodyTemperature(UID, CID, [
      {
        start_time: '2026-02-30T04:00:00',
        samples: [
          { temperature_celsius: 36.5, recording_time_delta_milliseconds: 0 },
        ],
      },
      {
        start_time: '2026-02-28T04:00:00',
        samples: [
          { temperature_celsius: 36.6, recording_time_delta_milliseconds: 0 },
        ],
      },
    ] as never[]);

    const vitals = vi.mocked(genericHealthRepository.bulkUpsertVitals).mock
      .calls[0][2] as unknown as Array<{
      timestamp: Date;
      body_temperature_celsius: number;
    }>;
    expect(vitals).toHaveLength(1);
    expect(vitals[0].body_temperature_celsius).toBe(36.6);
    expect(vitals[0].timestamp.toISOString()).toBe('2026-02-28T04:00:00.000Z');
  });

  it('skips unparseable continuous heart rate timestamps', async () => {
    await expect(
      processPolarContinuousHeartRate(UID, CID, [
        {
          date: '2026-09-13',
          heart_rate_samples: [
            { heart_rate: 60, sample_time: '07:00:00' },
            { heart_rate: 61, sample_time: 12345 },
            { heart_rate: 62, sample_time: 'garbage' },
          ],
        },
      ] as never[])
    ).resolves.not.toThrow();

    const samples = vi.mocked(upsertSamplesByDay).mock
      .calls[0][4] as unknown as Array<{ bpm: number }>;
    expect(samples.map((s) => s.bpm)).toEqual([60]);
  });
});
