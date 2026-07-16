import { vi, beforeEach, describe, it, expect } from 'vitest';

vi.mock('../models/measurementRepository.js', () => ({
  default: {
    getCustomCategories: vi.fn().mockResolvedValue([]),
    createCustomCategory: vi.fn().mockResolvedValue({ id: 'cat-1' }),
    upsertCustomMeasurement: vi.fn().mockResolvedValue(undefined),
    upsertStepData: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../models/sleepRepository.js', () => ({
  default: {
    upsertSleepEntry: vi.fn().mockResolvedValue({ id: 'sleep-1' }),
    upsertSleepStageEvent: vi.fn().mockResolvedValue(undefined),
    deleteSleepEntriesByEntrySourceAndDate: vi
      .fn()
      .mockResolvedValue(undefined),
  },
}));
vi.mock('../models/exercise.js', () => ({
  default: {
    getExerciseBySourceAndSourceId: vi.fn().mockResolvedValue(null),
    searchExercises: vi.fn().mockResolvedValue([]),
    createExercise: vi
      .fn()
      .mockResolvedValue({ id: 'exercise-1', name: 'Running' }),
  },
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    createExerciseEntry: vi.fn().mockResolvedValue({ id: 'entry-1' }),
    deleteExerciseEntriesByEntrySourceAndDate: vi
      .fn()
      .mockResolvedValue(undefined),
  },
}));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: { createActivityDetail: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import {
  parseSleepPhases,
  processOuraSleep,
  processOuraDailyActivity,
  processOuraHeartRate,
  processOuraWorkouts,
} from '../integrations/oura/ouraDataProcessor.js';
import type {
  OuraSleepPeriod,
  OuraWorkout,
} from '../integrations/oura/ouraService.js';
import measurementRepository from '../models/measurementRepository.js';
import sleepRepository from '../models/sleepRepository.js';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';

const UID = 'user-1';
const CID = 'user-1';

function sleepPeriod(overrides: Partial<OuraSleepPeriod>): OuraSleepPeriod {
  return {
    id: 'period-1',
    day: '2026-07-15',
    type: 'long_sleep',
    bedtime_start: '2026-07-14T23:00:00+00:00',
    bedtime_end: '2026-07-15T07:00:00+00:00',
    time_in_bed: 28800,
    total_sleep_duration: 27000,
    deep_sleep_duration: 6000,
    light_sleep_duration: 15000,
    rem_sleep_duration: 6000,
    awake_time: 1800,
    latency: 300,
    efficiency: 94,
    average_heart_rate: 55,
    lowest_heart_rate: 48,
    average_hrv: 62,
    average_breath: 14.5,
    sleep_phase_5_min: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── parseSleepPhases ────────────────────────────────────────────────────────

describe('parseSleepPhases', () => {
  it('merges consecutive identical phases into single stages', () => {
    // 4=awake, 2=light, 1=deep, 1=deep, 3=rem
    const stages = parseSleepPhases('42113', '2026-07-14T23:00:00+00:00');
    expect(stages).toEqual([
      {
        stage_type: 'awake',
        start_time: '2026-07-14T23:00:00.000Z',
        end_time: '2026-07-14T23:05:00.000Z',
        duration_in_seconds: 300,
      },
      {
        stage_type: 'light',
        start_time: '2026-07-14T23:05:00.000Z',
        end_time: '2026-07-14T23:10:00.000Z',
        duration_in_seconds: 300,
      },
      {
        stage_type: 'deep',
        start_time: '2026-07-14T23:10:00.000Z',
        end_time: '2026-07-14T23:20:00.000Z',
        duration_in_seconds: 600,
      },
      {
        stage_type: 'rem',
        start_time: '2026-07-14T23:20:00.000Z',
        end_time: '2026-07-14T23:25:00.000Z',
        duration_in_seconds: 300,
      },
    ]);
  });

  it('returns no stages for missing phase strings', () => {
    expect(parseSleepPhases(null, '2026-07-14T23:00:00+00:00')).toEqual([]);
    expect(parseSleepPhases('', '2026-07-14T23:00:00+00:00')).toEqual([]);
  });
});

// ─── processOuraSleep ────────────────────────────────────────────────────────

describe('processOuraSleep', () => {
  it('stores a long_sleep period as an Oura sleep entry with merged daily score', async () => {
    await processOuraSleep(
      UID,
      CID,
      [sleepPeriod({ sleep_phase_5_min: '4211' })],
      [{ id: 'ds-1', day: '2026-07-15', score: 82 }]
    );

    expect(
      sleepRepository.deleteSleepEntriesByEntrySourceAndDate
    ).toHaveBeenCalledWith(UID, 'Oura', '2026-07-15', '2026-07-15');
    expect(
      sleepRepository.deleteSleepEntriesByEntrySourceAndDate
    ).toHaveBeenCalledWith(UID, 'Oura Nap', '2026-07-15', '2026-07-15');

    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(sleepRepository.upsertSleepEntry).mock.calls[0][2];
    expect(entry).toMatchObject({
      entry_date: '2026-07-15',
      source: 'Oura',
      sleep_score: 82,
      duration_in_seconds: 28800,
      time_asleep_in_seconds: 27000,
      deep_sleep_seconds: 6000,
      light_sleep_seconds: 15000,
      rem_sleep_seconds: 6000,
      awake_sleep_seconds: 1800,
      resting_heart_rate: 48,
      avg_overnight_hrv: 62,
      average_respiration_value: 14.5,
    });

    // '4211' - awake, light, deep = 3 stages
    expect(sleepRepository.upsertSleepStageEvent).toHaveBeenCalledTimes(3);
    expect(sleepRepository.upsertSleepStageEvent).toHaveBeenCalledWith(
      UID,
      'sleep-1',
      expect.objectContaining({ stage_type: 'deep', duration_in_seconds: 600 }),
      CID
    );
  });

  it('keeps the longest long_sleep period when several share a day', async () => {
    await processOuraSleep(
      UID,
      CID,
      [
        sleepPeriod({ id: 'short', total_sleep_duration: 10000 }),
        sleepPeriod({ id: 'long', total_sleep_duration: 27000 }),
      ],
      []
    );
    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledTimes(1);
  });

  it('aggregates same-day naps into a single Oura Nap entry', async () => {
    await processOuraSleep(
      UID,
      CID,
      [
        sleepPeriod({
          id: 'nap-1',
          type: 'late_nap',
          bedtime_start: '2026-07-15T13:00:00+00:00',
          bedtime_end: '2026-07-15T13:30:00+00:00',
          time_in_bed: 1800,
          total_sleep_duration: 1500,
          deep_sleep_duration: 0,
          light_sleep_duration: 1500,
          rem_sleep_duration: 0,
          awake_time: 300,
        }),
        sleepPeriod({
          id: 'nap-2',
          type: 'sleep',
          bedtime_start: '2026-07-15T17:00:00+00:00',
          bedtime_end: '2026-07-15T17:20:00+00:00',
          time_in_bed: 1200,
          total_sleep_duration: 1200,
          deep_sleep_duration: 0,
          light_sleep_duration: 1200,
          rem_sleep_duration: 0,
          awake_time: 0,
        }),
      ],
      []
    );

    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(sleepRepository.upsertSleepEntry).mock.calls[0][2];
    expect(entry).toMatchObject({
      entry_date: '2026-07-15',
      source: 'Oura Nap',
      duration_in_seconds: 3000,
      time_asleep_in_seconds: 2700,
      light_sleep_seconds: 2700,
      awake_sleep_seconds: 300,
      bedtime: '2026-07-15T13:00:00.000Z',
      wake_time: '2026-07-15T17:20:00.000Z',
    });
  });

  it('skips rest and deleted sleep periods', async () => {
    await processOuraSleep(
      UID,
      CID,
      [
        sleepPeriod({ id: 'rest-1', type: 'rest' }),
        sleepPeriod({ id: 'deleted-1', type: 'deleted' }),
      ],
      []
    );
    expect(sleepRepository.upsertSleepEntry).not.toHaveBeenCalled();
  });
});

// ─── processOuraDailyActivity ────────────────────────────────────────────────

describe('processOuraDailyActivity', () => {
  it('upserts steps and calorie/score custom measurements per day', async () => {
    await processOuraDailyActivity(UID, CID, [
      {
        id: 'da-1',
        day: '2026-07-15',
        steps: 9000,
        active_calories: 450,
        total_calories: 2600,
        score: 85,
      },
    ]);

    expect(measurementRepository.upsertStepData).toHaveBeenCalledWith(
      UID,
      CID,
      9000,
      '2026-07-15'
    );
    // Metabolism, Active Calories, Activity Score
    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledTimes(
      3
    );
    expect(measurementRepository.createCustomCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Metabolism', frequency: 'Daily' })
    );
  });
});

// ─── processOuraHeartRate ────────────────────────────────────────────────────

describe('processOuraHeartRate', () => {
  it('buckets 5-minute samples into hourly averages in the user timezone', async () => {
    await processOuraHeartRate(
      UID,
      CID,
      [
        { timestamp: '2026-07-15T20:30:00+00:00', bpm: 60, source: 'ppg' },
        { timestamp: '2026-07-15T20:35:00+00:00', bpm: 70, source: 'ppg' },
        { timestamp: '2026-07-16T03:00:00+00:00', bpm: 50, source: 'ppg' },
      ],
      'America/New_York'
    );

    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledTimes(
      2
    );
    const calls = vi.mocked(measurementRepository.upsertCustomMeasurement).mock
      .calls;
    expect(calls[0][3]).toBe(65);
    expect(calls[0][4]).toBe('2026-07-15');
    expect(calls[0][5]).toBe(20);

    expect(calls[1][3]).toBe(50);
    expect(calls[1][4]).toBe('2026-07-15');
    expect(calls[1][5]).toBe(3);
  });
});

// ─── processOuraWorkouts ─────────────────────────────────────────────────────

describe('processOuraWorkouts', () => {
  const workout: OuraWorkout = {
    id: 'w-1',
    activity: 'running',
    calories: 320,
    day: '2026-07-15',
    distance: 5000,
    start_datetime: '2026-07-15T10:00:00+00:00',
    end_datetime: '2026-07-15T10:40:00+00:00',
    intensity: 'moderate',
    label: null,
    source: 'confirmed',
  };

  it('deletes existing Oura entries for the day, then creates exercise + entry', async () => {
    await processOuraWorkouts(UID, CID, [workout], 'UTC');

    expect(
      exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate
    ).toHaveBeenCalledWith(UID, '2026-07-15', '2026-07-15', 'Oura');

    expect(exerciseRepository.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Running',
        source: 'Oura',
        source_id: 'oura-workout-running',
        calories_per_hour: 480, // 320 kcal over 40 min
      })
    );
    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({
        exercise_id: 'exercise-1',
        duration_minutes: 40,
        calories_burned: 320,
        entry_date: '2026-07-15',
      }),
      CID,
      'Oura'
    );
  });

  it('reuses an existing exercise found by source id', async () => {
    vi.mocked(
      exerciseRepository.getExerciseBySourceAndSourceId
    ).mockResolvedValueOnce({ id: 'existing-1', name: 'Running' });
    await processOuraWorkouts(UID, CID, [workout], 'UTC');
    expect(exerciseRepository.createExercise).not.toHaveBeenCalled();
    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({ exercise_id: 'existing-1' }),
      CID,
      'Oura'
    );
  });
});
