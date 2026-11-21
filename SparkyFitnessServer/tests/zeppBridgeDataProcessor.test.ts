import fs from 'fs';
import { vi, beforeEach, describe, it, expect } from 'vitest';

vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    createExerciseEntry: vi.fn().mockResolvedValue({ id: 'entry-1' }),
  },
}));
vi.mock('../models/exercise.js', () => ({
  default: {
    findExerciseByNameAndUserId: vi.fn().mockResolvedValue(null),
    createExercise: vi.fn().mockResolvedValue({ id: 'exercise-new' }),
  },
}));
vi.mock('../models/sleepRepository.js', () => ({
  default: {
    upsertSleepEntry: vi.fn().mockResolvedValue({ id: 'sleep-1' }),
    mergeSleepStageEvents: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../models/genericHealthRepository.js', () => ({
  upsertDailyHealthMetrics: vi.fn().mockResolvedValue({}),
}));
vi.mock('../services/measurementService.js', () => ({
  default: { processHealthData: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../services/healthMetricSampleWriter.js', () => ({
  upsertSamplesByDay: vi.fn().mockResolvedValue(1),
}));
vi.mock('../integrations/zeppbridge/zeppBridgeWorkoutDetail.js', () => ({
  needsWorkoutDetail: vi.fn().mockResolvedValue(false),
  applySummaryLaps: vi.fn().mockResolvedValue(true),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { processZeppBridgeRecords } from '../integrations/zeppbridge/zeppBridgeDataProcessor.js';
import {
  addRecords,
  emptyRecordSet,
} from '../integrations/zeppbridge/zeppBridgeTypes.js';
import {
  applySummaryLaps,
  needsWorkoutDetail,
} from '../integrations/zeppbridge/zeppBridgeWorkoutDetail.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import exerciseRepository from '../models/exercise.js';
import sleepRepository from '../models/sleepRepository.js';
import * as genericHealthRepo from '../models/genericHealthRepository.js';
import measurementService from '../services/measurementService.js';
import { upsertSamplesByDay } from '../services/healthMetricSampleWriter.js';

const UID = 'user-1';
const TZ = 'America/New_York';

function recordsOf(...records: unknown[]) {
  const set = emptyRecordSet();
  addRecords(set, records);
  return set;
}

const sleep = {
  record_type: 'sleep_session',
  source: 'official',
  sleep_id: 'sl-1',
  start_time: '2026-11-01T23:10:00+02:00',
  end_time: '2026-11-02T06:50:00+02:00',
  score: 82,
  duration_minutes: 440,
  deep_minutes: 90,
  light_minutes: 250,
  rem_minutes: 100,
  awake_minutes: 20,
  wake_count: 2,
  stages: [
    {
      stage: 'light',
      start_time: '2026-11-01T23:10:00+02:00',
      end_time: '2026-11-01T23:40:00+02:00',
    },
    {
      stage: 'DEEP',
      start_time: '2026-11-01T23:40:00+02:00',
      end_time: '2026-11-02T00:30:00+02:00',
    },
    {
      stage: 'mystery',
      start_time: '2026-11-02T00:30:00+02:00',
      end_time: '2026-11-02T00:40:00+02:00',
    },
  ],
};

const run = {
  record_type: 'workout',
  source: 'official',
  workout_id: 'w-77',
  effective_type: 'outdoor_running',
  start_time: '2026-11-03T07:30:00+02:00',
  end_time: '2026-11-03T08:05:00+02:00',
  distance_meters: 5234.6,
  calories: 410,
  avg_hr: 148.4,
  max_hr: 176,
  moving_seconds: 1830,
  elevation_gain_m: 42,
  avg_cadence_spm: 168,
  avg_stride_cm: 101.26,
};

describe('processZeppBridgeRecords', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps a sleep session to the wake day with known stages only', async () => {
    const result = await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf(sleep),
      TZ
    );

    expect(result.sleepImported).toBe(1);
    const [, , entry] = vi.mocked(sleepRepository.upsertSleepEntry).mock
      .calls[0]!;
    expect(entry).toMatchObject({
      // The wake time's own offset decides the day, not the server's zone.
      entry_date: '2026-11-02',
      source: 'ZeppBridge',
      record_utc_offset_minutes: 120,
      duration_in_seconds: 7 * 3600 + 40 * 60,
      time_asleep_in_seconds: (90 + 250 + 100) * 60,
      deep_sleep_seconds: 90 * 60,
      awake_sleep_seconds: 20 * 60,
      awake_count: 2,
      sleep_score: 82,
    });
    // The night's stages go in as one atomic set, so a re-sync that splits the
    // night differently replaces the old rows instead of adding to them.
    // 'mystery' is not a stage we know, so it is skipped.
    expect(sleepRepository.mergeSleepStageEvents).toHaveBeenCalledTimes(1);
    const [, entryId, stages] = vi.mocked(sleepRepository.mergeSleepStageEvents)
      .mock.calls[0]!;
    expect(entryId).toBe('sleep-1');
    expect(stages).toHaveLength(2);
    expect(stages[1]).toMatchObject({
      stage_type: 'deep',
      duration_in_seconds: 3000,
    });
  });

  it('skips a sleep session that ends before it starts', async () => {
    const result = await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf({ ...sleep, end_time: sleep.start_time }),
      TZ
    );

    expect(result).toMatchObject({ sleepImported: 0, sleepFailed: 1 });
    expect(sleepRepository.upsertSleepEntry).not.toHaveBeenCalled();
  });

  it('maps a workout to an exercise entry keyed by the ZeppBridge id', async () => {
    const result = await processZeppBridgeRecords(UID, UID, recordsOf(run), TZ);

    expect(result.workoutsImported).toBe(1);
    expect(exerciseRepository.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Running',
        category: 'Cardio',
      })
    );
    const [, entry, , source, , options] = vi.mocked(
      exerciseEntryRepository.createExerciseEntry
    ).mock.calls[0]!;
    expect(source).toBe('ZeppBridge');
    expect(entry).toMatchObject({
      exercise_id: 'exercise-new',
      entry_date: '2026-11-03',
      entry_time: '07:30',
      duration_minutes: 31,
      calories_burned: 410,
      distance: 5.23,
      avg_heart_rate: 148,
      max_heart_rate: 176,
      avg_cadence: 168,
      stride_length_cm: 101.3,
      elapsed_time_seconds: 2100,
      source_id: 'w-77',
      sets: [],
      notes: 'Synced from ZeppBridge. Type: outdoor_running.',
    });
    expect(options?.activityDetail).toMatchObject({
      provider_name: 'ZeppBridge',
      detail_data: expect.objectContaining({
        effective_type: 'outdoor_running',
      }),
    });
  });

  it('queues a workout for detail only when it still needs its route or series', async () => {
    vi.mocked(needsWorkoutDetail).mockResolvedValueOnce(true);
    const withRoute = { ...run, route_point_count: 900, sample_count: 900 };
    const withoutNeed = {
      ...run,
      workout_id: 'w-78',
      route_point_count: 900,
      sample_count: 900,
    };
    const result = await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf(withRoute, withoutNeed),
      TZ
    );

    expect(result.workoutsImported).toBe(2);
    expect(result.detailCandidates).toEqual([
      // ZeppBridge's own day for the workout, from its start time.
      { entryId: 'entry-1', workoutId: 'w-77', day: '2026-11-03' },
    ]);
  });

  it.each([
    ['outdoor_running', 'Running', 'Cardio'],
    ['strength', 'Strength Training', 'Strength'],
    ['trail_zumba', 'Trail Zumba', 'Other'],
  ])(
    'names a %s workout %s without a provider prefix',
    async (type, name, category) => {
      await processZeppBridgeRecords(
        UID,
        UID,
        recordsOf({ ...run, effective_type: type }),
        TZ
      );
      expect(exerciseRepository.createExercise).toHaveBeenCalledWith(
        expect.objectContaining({ name, category })
      );
      // The raw type stays in the notes, which is where the sport is read back.
      expect(
        vi.mocked(exerciseEntryRepository.createExerciseEntry).mock.calls[0]![1]
          .notes
      ).toBe(`Synced from ZeppBridge. Type: ${type}.`);
    }
  );

  it('stores the extra workout measurements, within the columns’ limits', async () => {
    await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf({
        ...run,
        training_effect: 3.46,
        anaerobic_training_effect: 7,
        vo2max: 48.26,
        rpe: 7,
        max_cadence_spm: 181.4,
        total_steps: 5120.4,
      }),
      TZ
    );
    const [, entry] = vi.mocked(exerciseEntryRepository.createExerciseEntry)
      .mock.calls[0]!;
    expect(entry).toMatchObject({
      aerobic_training_effect: 3.5,
      vo2_max_estimate: 48.3,
      workout_effort: 7,
      max_cadence: 181,
      steps: 5120,
    });
    // 7 is not a 0-5 training effect, so it is left out rather than rejected.
    expect(entry).not.toHaveProperty('anaerobic_training_effect');
  });

  it('leaves out an effort rating outside 1-10', async () => {
    await processZeppBridgeRecords(UID, UID, recordsOf({ ...run, rpe: 0 }), TZ);
    const [, entry] = vi.mocked(exerciseEntryRepository.createExerciseEntry)
      .mock.calls[0]!;
    expect(entry).not.toHaveProperty('workout_effort');
  });

  it('stores summary laps for a workout with no route, and not for one with a route', async () => {
    await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf(
        { ...run, workout_id: 'indoor', route_point_count: 0 },
        { ...run, workout_id: 'outdoor', route_point_count: 900 }
      ),
      TZ
    );
    expect(applySummaryLaps).toHaveBeenCalledTimes(1);
    expect(vi.mocked(applySummaryLaps).mock.calls[0]![3].workout_id).toBe(
      'indoor'
    );
  });

  it('keeps the workout when its laps cannot be stored', async () => {
    vi.mocked(applySummaryLaps).mockRejectedValueOnce(new Error('db down'));
    const result = await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf({ ...run, route_point_count: 0 }),
      TZ
    );
    expect(result).toMatchObject({ workoutsImported: 1, workoutsFailed: 0 });
  });

  it('keeps a max heart rate outside 100-250 out of the entry', async () => {
    await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf({ ...run, max_hr: 40 }),
      TZ
    );
    const [, entry] = vi.mocked(exerciseEntryRepository.createExerciseEntry)
      .mock.calls[0]!;
    expect(entry).not.toHaveProperty('max_heart_rate');
  });

  it('counts a failing workout without stopping the rest', async () => {
    vi.mocked(
      exerciseEntryRepository.createExerciseEntry
    ).mockRejectedValueOnce(new Error('db down'));
    const result = await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf(run, { ...run, workout_id: 'w-78' }),
      TZ
    );
    expect(result).toMatchObject({ workoutsImported: 1, workoutsFailed: 1 });
  });

  it('writes check-ins, one daily row per day and day-bucketed samples', async () => {
    const result = await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf(
        {
          record_type: 'daily_metric',
          date: '2026-11-02',
          metric: 'weight',
          value: 72.4,
          unit: 'kg',
        },
        {
          record_type: 'daily_metric',
          date: '2026-11-02',
          metric: 'steps',
          value: 9120,
          unit: 'count',
        },
        {
          record_type: 'daily_metric',
          date: '2026-11-02',
          metric: 'resting_hr',
          value: 52,
          unit: 'bpm',
        },
        {
          record_type: 'daily_metric',
          date: '2026-11-02',
          metric: 'bmr',
          value: 1680,
          unit: 'kcal/day',
        },
        {
          record_type: 'daily_metric',
          date: '2026-11-02',
          metric: 'hrv_rmssd',
          value: 48,
          unit: 'ms',
        },
        {
          record_type: 'daily_metric',
          date: 'not-a-day',
          metric: 'steps',
          value: 1,
        },
        {
          record_type: 'metric_sample',
          metric: 'heart_rate',
          // 01:30 UTC is still the evening of 11-01 in New York.
          timestamp: '2026-11-02T01:30:00+00:00',
          value: 61,
          unit: 'bpm',
        }
      ),
      TZ
    );

    expect(measurementService.processHealthData).toHaveBeenCalledTimes(1);
    const [checkIns] = vi.mocked(measurementService.processHealthData).mock
      .calls[0]!;
    expect(checkIns).toEqual([
      expect.objectContaining({
        type: 'weight',
        value: 72.4,
        date: '2026-11-02',
      }),
      expect.objectContaining({
        type: 'steps',
        value: 9120,
        date: '2026-11-02',
      }),
    ]);

    // Resting HR and BMR share one row, so neither write blanks the other.
    expect(genericHealthRepo.upsertDailyHealthMetrics).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(genericHealthRepo.upsertDailyHealthMetrics).mock.calls[0]![2]
    ).toMatchObject({
      entry_date: '2026-11-02',
      source_provider: 'zeppbridge',
      resting_heart_rate: 52,
      bmr_calories: 1680,
    });

    const writes = vi.mocked(upsertSamplesByDay).mock.calls;
    const hrv = writes.find((c) => c[2] === 'hrv')!;
    expect(hrv[3]).toBe('zeppbridge');
    expect(hrv[4]).toEqual([
      expect.objectContaining({ entry_date: '2026-11-02', rmssd_ms: 48 }),
    ]);
    const hr = writes.find((c) => c[2] === 'heart_rate')!;
    expect(hr[4]).toEqual([
      expect.objectContaining({ entry_date: '2026-11-01', bpm: 61 }),
    ]);
    // Merged inside this call's own window, so a neighbouring span's readings
    // for the same day are not erased.
    expect(hr[5]).toEqual({
      mode: 'merge',
      window: {
        startMs: Date.parse('2026-11-02T01:30:00Z'),
        endMs: Date.parse('2026-11-02T01:30:00Z'),
      },
      keepLinked: true,
    });
    expect(result.metricDays).toBe(2);
  });

  it('anchors a daily sample at local noon, so it stays on its own day in any zone', async () => {
    await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf({
        record_type: 'daily_metric',
        date: '2026-11-02',
        metric: 'hrv_rmssd',
        value: 48,
      }),
      'Pacific/Honolulu'
    );
    const hrv = vi
      .mocked(upsertSamplesByDay)
      .mock.calls.find((c) => c[2] === 'hrv')!;
    // 05:00 UTC would be 19:00 on the 1st in Honolulu; noon on the 2nd is
    // 22:00 UTC, plus the half second that keeps it off a whole-minute reading.
    expect(
      (hrv[4] as Array<{ timestamp: Date }>)[0]!.timestamp.toISOString()
    ).toBe('2026-11-02T22:00:00.500Z');
  });

  it('lets a metric’s readings replace its daily value for the same day', async () => {
    // One stored row holds a metric's samples for a day, and a merge replaces
    // what lies inside its window, so the two forms would delete each other.
    // When both arrive, the readings are written and the daily value is not.
    await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf(
        {
          record_type: 'daily_metric',
          date: '2026-11-02',
          metric: 'hrv_rmssd',
          value: 48,
        },
        {
          record_type: 'metric_sample',
          metric: 'hrv_rmssd',
          timestamp: '2026-11-02T16:00:00+00:00',
          value: 51,
        },
        {
          record_type: 'metric_sample',
          metric: 'hrv_rmssd',
          timestamp: '2026-11-02T18:00:00+00:00',
          value: 53,
        }
      ),
      TZ
    );
    const writes = vi
      .mocked(upsertSamplesByDay)
      .mock.calls.filter((c) => c[2] === 'hrv');
    expect(writes).toHaveLength(1);
    expect(writes[0]![4]).toEqual([
      expect.objectContaining({ rmssd_ms: 51 }),
      expect.objectContaining({ rmssd_ms: 53 }),
    ]);
  });

  it('still writes a daily value when no readings of that metric arrive for the day', async () => {
    await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf(
        {
          record_type: 'daily_metric',
          date: '2026-11-02',
          metric: 'hrv_rmssd',
          value: 48,
        },
        {
          record_type: 'metric_sample',
          metric: 'hrv_rmssd',
          timestamp: '2026-11-03T16:00:00+00:00',
          value: 51,
        }
      ),
      TZ
    );
    const writes = vi
      .mocked(upsertSamplesByDay)
      .mock.calls.filter((c) => c[2] === 'hrv');
    expect(writes).toHaveLength(2);
    const daily = writes.find(
      (c) =>
        (c[4] as Array<{ entry_date: string }>)[0]!.entry_date === '2026-11-02'
    )!;
    const anchor = (daily[4] as Array<{ timestamp: Date }>)[0]!.timestamp;
    // 12:00 in New York is 17:00 UTC; half a second later, never a whole minute.
    expect(anchor.toISOString()).toBe('2026-11-02T17:00:00.500Z');
    expect(daily[5]!.window).toEqual({
      startMs: anchor.getTime(),
      endMs: anchor.getTime(),
    });
  });

  it('writes each day’s readings separately, each in its own window', async () => {
    await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf(
        {
          record_type: 'metric_sample',
          metric: 'heart_rate',
          timestamp: '2026-11-02T15:00:00+00:00',
          value: 60,
        },
        {
          record_type: 'metric_sample',
          metric: 'heart_rate',
          timestamp: '2026-11-02T15:05:00+00:00',
          value: 62,
        },
        {
          record_type: 'metric_sample',
          metric: 'heart_rate',
          timestamp: '2026-11-03T15:00:00+00:00',
          value: 64,
        }
      ),
      TZ
    );
    const writes = vi
      .mocked(upsertSamplesByDay)
      .mock.calls.filter((c) => c[2] === 'heart_rate');
    expect(writes).toHaveLength(2);
    expect(writes[0]![5]!.window).toEqual({
      startMs: Date.parse('2026-11-02T15:00:00Z'),
      endMs: Date.parse('2026-11-02T15:05:00Z'),
    });
    expect(writes[1]![5]!.window).toEqual({
      startMs: Date.parse('2026-11-03T15:00:00Z'),
      endMs: Date.parse('2026-11-03T15:00:00Z'),
    });
  });

  it('reads distance in kilometres as metres', async () => {
    await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf({
        record_type: 'daily_metric',
        date: '2026-11-02',
        metric: 'distance',
        value: 6.4,
        unit: 'km',
      }),
      TZ
    );
    expect(
      vi.mocked(genericHealthRepo.upsertDailyHealthMetrics).mock.calls[0]![2]
    ).toMatchObject({ total_distance_meters: 6400 });
  });
});

// A real answer from ZeppBridge 3.2.1 (`GET /v1/records`): every time is
// written in UTC (+00:00), and weight, BMI and height arrive as timestamped
// samples rather than daily metrics.
describe('processZeppBridgeRecords with a real ZeppBridge answer', () => {
  beforeEach(() => vi.clearAllMocks());

  const real = JSON.parse(
    fs.readFileSync(
      new URL('./fixtures/zeppbridgeRecords.real.json', import.meta.url),
      'utf8'
    )
  ) as { records: unknown[] };
  const KOLKATA = 'Asia/Kolkata';

  it('files weight as one check-in per day of the person, latest reading wins', async () => {
    await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf(...real.records),
      KOLKATA
    );

    const [checkIns] = vi.mocked(measurementService.processHealthData).mock
      .calls[0]!;
    expect(checkIns).toEqual([
      expect.objectContaining({
        type: 'weight',
        value: 74.25,
        date: '2026-11-03',
      }),
      // 20:37Z and 21:05Z are both the next morning in India; the later wins.
      expect.objectContaining({
        type: 'weight',
        value: 73.9,
        date: '2026-11-22',
      }),
    ]);
    // BMI and height are derived or static and are not stored.
    expect(checkIns.some((c: { type: string }) => c.type === 'height')).toBe(
      false
    );
    expect(upsertSamplesByDay).not.toHaveBeenCalled();
  });

  it('reads a UTC time in the person’s own zone, not as the place it was recorded', async () => {
    await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf(...real.records),
      KOLKATA
    );

    const [, entry] = vi.mocked(exerciseEntryRepository.createExerciseEntry)
      .mock.calls[0]!;
    // 20:38 UTC is 02:08 the next day in India.
    expect(entry).toMatchObject({
      entry_date: '2026-11-22',
      entry_time: '02:08',
      duration_minutes: 3,
      distance: 2,
      source_id: '1795293480',
      notes: 'Synced from ZeppBridge. Type: run.',
    });
    // ZeppBridge has no calories or heart rate for this run. They must be left
    // out, not sent as null: calories_burned is NOT NULL, and on a re-sync an
    // update writes whatever it is given over the stored row.
    for (const field of [
      'calories_burned',
      'avg_heart_rate',
      'max_heart_rate',
      'avg_cadence',
      'elevation_gain_meters',
    ]) {
      expect(entry).not.toHaveProperty(field);
    }
    expect(exerciseRepository.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Running', category: 'Cardio' })
    );
  });

  it('dates a night of sleep by the wake time in the person’s zone', async () => {
    await processZeppBridgeRecords(
      UID,
      UID,
      recordsOf({
        ...sleep,
        start_time: '2026-11-21T18:00:00+00:00',
        end_time: '2026-11-22T01:30:00+00:00',
        stages: [],
      }),
      KOLKATA
    );
    const [, , entry] = vi.mocked(sleepRepository.upsertSleepEntry).mock
      .calls[0]!;
    // 01:30 UTC is 07:00 on the 22nd in India; +00:00 is not a recording zone.
    expect(entry).toMatchObject({
      entry_date: '2026-11-22',
      record_utc_offset_minutes: null,
    });
  });
});
