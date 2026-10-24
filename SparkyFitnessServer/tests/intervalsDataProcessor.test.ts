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

    expect(result).toEqual({ imported: 1, skipped: 0, removed: 0 });
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
      notes: 'Synced from Intervals.icu. Type: Run. Elevation: 42m',
      sets: [],
    });
    expect(options).toMatchObject({
      activityDetail: { provider_name: 'Intervals.icu' },
    });
  });

  it('skips Strava stubs and activities without a start date', async () => {
    const result = await processIntervalsActivities(
      UID,
      UID,
      [run({ source: 'STRAVA' }), run({ id: 'i2', start_date_local: '' })],
      false
    );

    expect(result).toEqual({ imported: 0, skipped: 2, removed: 0 });
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

    expect(result).toEqual({ imported: 1, skipped: 1, removed: 0 });
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

    expect(result).toEqual({ imported: 1, skipped: 1, removed: 1 });
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
    expect(result).toEqual({ imported: 1, skipped: 2, removed: 0 });
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
    expect(result).toEqual({ imported: 2, skipped: 1, removed: 0 });

    vi.clearAllMocks();
    await expect(
      processIntervalsActivities(UID, UID, uploads, true)
    ).resolves.toEqual({ imported: 2, skipped: 1, removed: 0 });
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
    expect(result).toEqual({ imported: 1, skipped: 1, removed: 0 });
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

    expect(result).toEqual({ imported: 1, skipped: 0, removed: 0 });
  });
});

describe('processIntervalsWellness', () => {
  beforeEach(() => vi.clearAllMocks());

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
