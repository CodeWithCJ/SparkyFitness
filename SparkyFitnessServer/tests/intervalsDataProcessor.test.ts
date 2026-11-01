import { vi, beforeEach, describe, it, expect } from 'vitest';

vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    createExerciseEntry: vi.fn().mockResolvedValue({ id: 'entry-1' }),
    getExistingSourceIds: vi.fn().mockResolvedValue(new Set<string>()),
    deleteExerciseEntry: vi.fn().mockResolvedValue(true),
    getExerciseDiaryRange: vi.fn().mockResolvedValue({ entries: [], sets: [] }),
  },
}));
vi.mock('../models/exercise.js', () => ({
  default: {
    findExerciseByNameAndUserId: vi.fn().mockResolvedValue(null),
    createExercise: vi.fn().mockResolvedValue({ id: 'exercise-new' }),
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
vi.mock('../models/workoutTelemetryRepository.js', () => ({
  replaceExerciseEntryHrZones: vi.fn().mockResolvedValue([]),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import {
  processIntervalsActivities,
  processIntervalsWellness,
  type IntervalsActivity,
} from '../integrations/intervals/intervalsDataProcessor.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import exerciseRepository from '../models/exercise.js';
import * as genericHealthRepo from '../models/genericHealthRepository.js';
import measurementService from '../services/measurementService.js';
import { upsertSamplesByDay } from '../services/healthMetricSampleWriter.js';
import { replaceExerciseEntryHrZones } from '../models/workoutTelemetryRepository.js';

const UID = 'user-1';

function run(overrides: Partial<IntervalsActivity> = {}): IntervalsActivity {
  return {
    id: 'i123',
    start_date_local: '2026-10-12T07:30:00',
    name: 'Morning Run',
    type: 'Run',
    moving_time: 1830,
    distance: 5234.6,
    calories: 410,
    average_heartrate: 148,
    total_elevation_gain: 42,
    source: 'UPLOAD',
    ...overrides,
  };
}

describe('processIntervalsActivities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exerciseEntryRepository.getExistingSourceIds).mockResolvedValue(
      new Set()
    );
    vi.mocked(exerciseEntryRepository.getExerciseDiaryRange).mockResolvedValue({
      entries: [],
      sets: [],
    });
  });

  it('maps an activity to an exercise entry keyed by the Intervals id', async () => {
    const result = await processIntervalsActivities(UID, UID, [run()], false);

    expect(result).toEqual({ imported: 1, skipped: 0, failed: 0, removed: 0 });
    expect(exerciseRepository.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Morning Run', category: 'Cardio' })
    );
    const [, entry, , source, , options] = vi.mocked(
      exerciseEntryRepository.createExerciseEntry
    ).mock.calls[0]!;
    expect(source).toBe('Intervals.icu');
    expect(entry).toMatchObject({
      exercise_id: 'exercise-new',
      entry_date: '2026-10-12',
      duration_minutes: 31,
      calories_burned: 410,
      distance: 5.23,
      avg_heart_rate: 148,
      source_id: 'i123',
      notes: 'Synced from Intervals.icu. Type: Run.',
      entry_time: '07:30',
      elevation_gain_meters: 42,
      sets: [],
    });
    expect(options).toMatchObject({
      activityDetail: { provider_name: 'Intervals.icu' },
    });
  });

  // Trimmed from real Intervals.icu responses (an outdoor run and a Zwift ride).
  const outdoorRun = run({
    id: 'r1',
    start_date_local: '2026-10-25T07:33:46',
    timezone: 'America/New_York',
    moving_time: 4868,
    elapsed_time: 4880,
    calories: 1231,
    max_heartrate: 172,
    average_speed: 3.323,
    max_speed: 4.861,
    pace: 3.3305733,
    average_cadence: 94.34909,
    icu_average_watts: 385,
    icu_weighted_avg_watts: 393,
    icu_intensity: 90.97222,
    icu_training_load: 114,
    total_elevation_gain: 191,
    total_elevation_loss: 193,
    min_altitude: 247.6,
    max_altitude: 300,
    average_temp: 17.95042,
    max_temp: 24,
    has_weather: true,
    average_weather_temp: 11.050464,
    average_stance_time: 234.6336,
    average_vertical_oscillation: 77.0969,
    average_stride: 1.059016,
    icu_rpe: 6,
    icu_hr_zones: [130, 149, 166, 176, 183],
    icu_hr_zone_times: [50, 943, 3551, 324, 0],
  });
  const zwiftRide = run({
    id: 'z1',
    type: 'VirtualRide',
    source: 'ZWIFT',
    start_date_local: '2026-10-23T14:00:42',
    average_cadence: 87.66534,
    average_stride: 2.459526,
    average_stance_time: 100,
    icu_intensity: 64.39024,
    total_elevation_gain: 613,
    total_elevation_loss: 0,
    icu_rpe: 0,
    max_heartrate: 99999,
  });
  const entryFor = (i = 0) =>
    vi.mocked(exerciseEntryRepository.createExerciseEntry).mock.calls[i]![1];

  it('stores the run telemetry, doubling cadence to steps per minute', async () => {
    await processIntervalsActivities(UID, UID, [outdoorRun], false);

    expect(entryFor()).toMatchObject({
      entry_date: '2026-10-25',
      entry_time: '07:33',
      record_timezone: 'America/New_York',
      max_heart_rate: 172,
      avg_speed_mps: 3.323,
      max_speed_mps: 4.861,
      avg_moving_speed_mps: 3.3305733,
      avg_cadence: 189,
      avg_power_watts: 385,
      normalized_power_watts: 393,
      intensity_factor: 0.91,
      training_load: 114,
      elevation_gain_meters: 191,
      elevation_loss_meters: 193,
      min_elevation_meters: 247.6,
      max_elevation_meters: 300,
      moving_time_seconds: 4868,
      elapsed_time_seconds: 4880,
      avg_temperature_celsius: 17.95042,
      max_temperature_celsius: 24,
      weather_temp_celsius: 11.050464,
      ground_contact_time_ms: 234.6,
      vertical_oscillation_mm: 77.1,
      stride_length_cm: 105.9,
      workout_effort: 6,
      active_calories: 1231,
    });
    expect(entryFor()).not.toHaveProperty('heart_rate_recovery_1min');
  });

  it('keeps ride cadence as is and leaves running-only and invalid values out', async () => {
    await processIntervalsActivities(UID, UID, [zwiftRide], false);

    expect(entryFor()).toMatchObject({
      avg_cadence: 88,
      intensity_factor: 0.644,
      elevation_gain_meters: 613,
      // A virtual course reports 0 loss; stored as unknown.
      elevation_loss_meters: null,
      ground_contact_time_ms: null,
      vertical_oscillation_mm: null,
      stride_length_cm: null,
      weather_temp_celsius: null,
      workout_effort: null,
      max_heart_rate: null,
    });
  });

  it('doubles cadence for walks and hikes too', async () => {
    await processIntervalsActivities(
      UID,
      UID,
      [
        run({ id: 'w', type: 'Walk', average_cadence: 55 }),
        run({ id: 'h', type: 'Hike', average_cadence: 50 }),
        run({ id: 'v', type: 'VirtualRun', average_cadence: 90 }),
      ],
      false
    );

    expect(entryFor(0)).toMatchObject({ avg_cadence: 110 });
    expect(entryFor(1)).toMatchObject({ avg_cadence: 100 });
    expect(entryFor(2)).toMatchObject({ avg_cadence: 180 });
  });

  it('stores five HR zones with Garmin-style bounds', async () => {
    await processIntervalsActivities(UID, UID, [outdoorRun], false);

    expect(replaceExerciseEntryHrZones).toHaveBeenCalledWith(
      UID,
      UID,
      'entry-1',
      [
        expect.objectContaining({
          zone_index: 1,
          zone_lower_bpm: null,
          zone_upper_bpm: 130,
          seconds_in_zone: 50,
          zone_method: 'device',
          entry_date: '2026-10-25',
          exercise_entry_id: 'entry-1',
        }),
        expect.objectContaining({
          zone_index: 2,
          zone_lower_bpm: 131,
          zone_upper_bpm: 149,
          seconds_in_zone: 943,
        }),
        expect.objectContaining({
          zone_index: 3,
          zone_lower_bpm: 150,
          zone_upper_bpm: 166,
          seconds_in_zone: 3551,
        }),
        expect.objectContaining({
          zone_index: 4,
          zone_lower_bpm: 167,
          zone_upper_bpm: 176,
          seconds_in_zone: 324,
        }),
        expect.objectContaining({
          zone_index: 5,
          zone_lower_bpm: 177,
          zone_upper_bpm: 183,
          seconds_in_zone: 0,
        }),
      ]
    );
  });

  it('skips HR zones unless there are exactly five', async () => {
    await processIntervalsActivities(
      UID,
      UID,
      [
        run({
          id: 'a',
          icu_hr_zones: [120, 140, 155, 165, 175, 185, 195],
          icu_hr_zone_times: [1, 2, 3, 4, 5, 6, 7],
        }),
        run({
          id: 'b',
          icu_hr_zones: [130, 149, 166, 176, 183],
          icu_hr_zone_times: [1, 2, 3],
        }),
        run({ id: 'c' }),
      ],
      false
    );

    expect(replaceExerciseEntryHrZones).not.toHaveBeenCalled();
    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledTimes(
      3
    );
  });

  it('skips Strava stubs and activities without a start date', async () => {
    const result = await processIntervalsActivities(
      UID,
      UID,
      [run({ source: 'STRAVA' }), run({ id: 'i2', start_date_local: '' })],
      false
    );

    expect(result).toEqual({ imported: 0, skipped: 2, failed: 0, removed: 0 });
    expect(exerciseEntryRepository.createExerciseEntry).not.toHaveBeenCalled();
  });

  it('skips every Garmin Connect activity while Garmin is connected', async () => {
    const result = await processIntervalsActivities(
      UID,
      UID,
      [
        run({ source: 'GARMIN_CONNECT', external_id: '999' }),
        run({ id: 'i2' }),
      ],
      true
    );

    expect(result).toEqual({ imported: 1, skipped: 1, failed: 0, removed: 0 });
    // Skipped on the "Garmin is active" rule alone: nothing stored to heal against.
    expect(exerciseEntryRepository.deleteExerciseEntry).not.toHaveBeenCalled();
  });

  it('removes an earlier Intervals copy once Garmin has imported the activity', async () => {
    vi.mocked(exerciseEntryRepository.getExerciseDiaryRange).mockResolvedValue({
      entries: [
        {
          id: 'g1',
          source: 'garmin',
          source_id: '24808958836',
          entry_date: '2026-10-21',
          entry_time: '18:27:00',
        },
        {
          id: 'old',
          source: 'Intervals.icu',
          source_id: 'z1',
          entry_date: '2026-10-21',
          entry_time: null,
        },
        {
          id: 'keep',
          source: 'Intervals.icu',
          source_id: 'r1',
          entry_date: '2026-10-21',
          entry_time: null,
        },
      ],
      sets: [],
    });

    const result = await processIntervalsActivities(
      UID,
      UID,
      [
        run({
          id: 'z1',
          source: 'ZWIFT',
          start_date_local: '2026-10-21T18:27:26',
        }),
        run({
          id: 'r1',
          source: 'UPLOAD',
          start_date_local: '2026-10-21T07:00:00',
        }),
      ],
      false
    );

    expect(result).toEqual({ imported: 1, skipped: 1, failed: 0, removed: 1 });
    expect(exerciseEntryRepository.deleteExerciseEntry).toHaveBeenCalledTimes(
      1
    );
    expect(exerciseEntryRepository.deleteExerciseEntry).toHaveBeenCalledWith(
      'old',
      UID
    );
  });

  it('skips Garmin Connect activities the Garmin import already holds', async () => {
    vi.mocked(exerciseEntryRepository.getExistingSourceIds).mockResolvedValue(
      new Set(['111', '222_0'])
    );

    const result = await processIntervalsActivities(
      UID,
      UID,
      [
        run({ id: 'a', source: 'GARMIN_CONNECT', external_id: '111' }),
        run({ id: 'b', source: 'GARMIN_CONNECT', external_id: '222' }),
        run({ id: 'c', source: 'GARMIN_CONNECT', external_id: '333' }),
      ],
      false
    );

    expect(exerciseEntryRepository.getExistingSourceIds).toHaveBeenCalledWith(
      UID,
      'garmin',
      ['111', '111_0', '222', '222_0', '333', '333_0']
    );
    expect(result).toEqual({ imported: 1, skipped: 2, failed: 0, removed: 0 });
    expect(
      vi.mocked(exerciseEntryRepository.createExerciseEntry).mock.calls[0]![1]
    ).toMatchObject({ source_id: 'c' });
  });

  it('treats an uploaded Garmin file like a Garmin Connect activity', async () => {
    vi.mocked(exerciseEntryRepository.getExistingSourceIds).mockResolvedValue(
      new Set(['444'])
    );
    const uploads = [
      run({ id: 'a', source: 'UPLOAD', external_id: '444_ACTIVITY.fit' }),
      run({ id: 'b', source: 'UPLOAD', external_id: 'my_ride.fit' }),
      run({ id: 'c', source: 'ZWIFT', external_id: '2255443102783324176' }),
    ];

    const result = await processIntervalsActivities(UID, UID, uploads, false);

    expect(exerciseEntryRepository.getExistingSourceIds).toHaveBeenCalledWith(
      UID,
      'garmin',
      ['444', '444_0']
    );
    expect(result).toEqual({ imported: 2, skipped: 1, failed: 0, removed: 0 });

    vi.clearAllMocks();
    await expect(
      processIntervalsActivities(UID, UID, uploads, true)
    ).resolves.toEqual({ imported: 2, skipped: 1, failed: 0, removed: 0 });
  });

  it('skips an activity that starts in the same minute as a Garmin entry', async () => {
    // Zwift sends one ride to Garmin and Intervals under different ids.
    vi.mocked(exerciseEntryRepository.getExerciseDiaryRange).mockResolvedValue({
      entries: [
        { source: 'garmin', entry_date: '2026-10-14', entry_time: '13:12:00' },
        { source: 'garmin', entry_date: '2026-10-14', entry_time: null },
        { source: 'manual', entry_date: '2026-10-14', entry_time: '14:02:00' },
      ],
      sets: [],
    });

    const result = await processIntervalsActivities(
      UID,
      UID,
      [
        run({
          id: 'a',
          source: 'ZWIFT',
          start_date_local: '2026-10-14T13:12:42',
        }),
        run({
          id: 'b',
          source: 'ZWIFT',
          start_date_local: '2026-10-14T14:02:06',
        }),
      ],
      false
    );

    expect(exerciseEntryRepository.getExerciseDiaryRange).toHaveBeenCalledWith(
      UID,
      '2026-10-14',
      '2026-10-14'
    );
    expect(result).toEqual({ imported: 1, skipped: 1, failed: 0, removed: 0 });
    expect(
      vi.mocked(exerciseEntryRepository.createExerciseEntry).mock.calls[0]![1]
    ).toMatchObject({ source_id: 'b' });
  });

  it('keeps going when one activity fails to save', async () => {
    vi.mocked(
      exerciseEntryRepository.createExerciseEntry
    ).mockRejectedValueOnce(new Error('boom'));

    const result = await processIntervalsActivities(
      UID,
      UID,
      [run(), run({ id: 'i2' })],
      false
    );

    expect(result).toEqual({ imported: 1, skipped: 0, failed: 1, removed: 0 });
  });
});

describe('processIntervalsWellness', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores floors, rounded CTL/ATL with their ratio, and the extra samples', async () => {
    await processIntervalsWellness(UID, UID, [
      {
        id: '2026-10-23',
        floorsClimbed: 6,
        ctl: 64.57959,
        atl: 77.61655,
        hrvSDNN: 70,
        spO2: 96.5,
        respiration: 14.2,
      },
    ]);

    expect(genericHealthRepo.upsertDailyHealthMetrics).toHaveBeenCalledWith(
      UID,
      UID,
      expect.objectContaining({
        entry_date: '2026-10-23',
        source_provider: 'intervals',
        floors_ascended: 6,
        chronic_training_load: 65,
        acute_training_load: 78,
        acwr_ratio: 1.2,
        resting_heart_rate: null,
        vo2_max: null,
      })
    );
    const sample = { entry_date: '2026-10-23', device_name: 'Intervals.icu' };
    expect(upsertSamplesByDay).toHaveBeenCalledWith(
      UID,
      UID,
      'hrv',
      'intervals',
      [expect.objectContaining({ ...sample, sdnn_ms: 70 })]
    );
    expect(
      vi
        .mocked(upsertSamplesByDay)
        .mock.calls.find((c) => c[2] === 'hrv')![4][0]
    ).not.toHaveProperty('rmssd_ms');
    expect(upsertSamplesByDay).toHaveBeenCalledWith(
      UID,
      UID,
      'spo2',
      'intervals',
      [expect.objectContaining({ ...sample, percentage: 96.5 })]
    );
    expect(upsertSamplesByDay).toHaveBeenCalledWith(
      UID,
      UID,
      'respiration',
      'intervals',
      [expect.objectContaining({ ...sample, brpm: 14.2 })]
    );
  });

  it('leaves the ratio empty without a fitness value', async () => {
    await processIntervalsWellness(UID, UID, [
      { id: '2026-10-23', atl: 50, ctl: 0 },
    ]);

    expect(genericHealthRepo.upsertDailyHealthMetrics).toHaveBeenCalledWith(
      UID,
      UID,
      expect.objectContaining({ acute_training_load: 50, acwr_ratio: null })
    );
  });

  it('routes each wellness field to its destination', async () => {
    const days = await processIntervalsWellness(UID, UID, [
      {
        id: '2026-10-12',
        weight: 72.4,
        bodyFat: 14.2,
        steps: 9000,
        restingHR: 48,
        vo2max: 55.1,
        hrv: 62,
      },
      { id: '2026-10-13', weight: 72.1 },
    ]);

    expect(days).toBe(2);
    expect(measurementService.processHealthData).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: 'weight',
          value: 72.4,
          date: '2026-10-12',
        }),
        expect.objectContaining({ type: 'body_fat_percentage', value: 14.2 }),
        expect.objectContaining({ type: 'steps', value: 9000 }),
        expect.objectContaining({
          type: 'weight',
          value: 72.1,
          date: '2026-10-13',
        }),
      ],
      UID,
      UID
    );
    expect(genericHealthRepo.upsertDailyHealthMetrics).toHaveBeenCalledTimes(1);
    expect(genericHealthRepo.upsertDailyHealthMetrics).toHaveBeenCalledWith(
      UID,
      UID,
      expect.objectContaining({
        entry_date: '2026-10-12',
        source_provider: 'intervals',
        resting_heart_rate: 48,
        vo2_max: 55.1,
      })
    );
    expect(upsertSamplesByDay).toHaveBeenCalledWith(
      UID,
      UID,
      'hrv',
      'intervals',
      [expect.objectContaining({ entry_date: '2026-10-12', rmssd_ms: 62 })]
    );
  });

  it('skips records with a malformed date and keeps the rest', async () => {
    const days = await processIntervalsWellness(UID, UID, [
      { id: 'not-a-day', hrv: 50, weight: 70 },
      { id: '2026-13-01', restingHR: 40 },
      { id: '2026-10-12', hrv: 62 },
    ]);

    expect(days).toBe(1);
    expect(measurementService.processHealthData).not.toHaveBeenCalled();
    expect(genericHealthRepo.upsertDailyHealthMetrics).not.toHaveBeenCalled();
    expect(upsertSamplesByDay).toHaveBeenCalledWith(
      UID,
      UID,
      'hrv',
      'intervals',
      [expect.objectContaining({ entry_date: '2026-10-12', rmssd_ms: 62 })]
    );
  });

  it('writes nothing for days with no values', async () => {
    await processIntervalsWellness(UID, UID, [{ id: '2026-10-12' }]);

    expect(measurementService.processHealthData).not.toHaveBeenCalled();
    expect(genericHealthRepo.upsertDailyHealthMetrics).not.toHaveBeenCalled();
    expect(upsertSamplesByDay).toHaveBeenCalledWith(
      UID,
      UID,
      'hrv',
      'intervals',
      []
    );
  });
});
