import {
  aggregateHeartRateByDate,
  aggregateSleepSessions,
  aggregateByDay,
  toLocalDateString,
} from '../../../src/services/healthkit/dataAggregation';

import type { HKHeartRateRecord, HKSleepRecord, TransformedRecord } from '../../../src/types/healthRecords';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

describe('toLocalDateString', () => {
  test('returns YYYY-MM-DD format', () => {
    const result = toLocalDateString('2024-01-15T12:00:00Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('handles Date objects', () => {
    // Create a date at local noon on Jan 15, 2024
    const date = new Date(2024, 0, 15, 12, 0, 0); // Month is 0-indexed
    const result = toLocalDateString(date);
    expect(result).toBe('2024-01-15');
  });

  test('uses local timezone components', () => {
    // Create a date at local midnight
    const localMidnight = new Date();
    localMidnight.setHours(0, 0, 0, 0);

    const result = toLocalDateString(localMidnight);
    const expected = `${localMidnight.getFullYear()}-${String(localMidnight.getMonth() + 1).padStart(2, '0')}-${String(localMidnight.getDate()).padStart(2, '0')}`;

    expect(result).toBe(expected);
  });

  test('pads single-digit months and days with zeros', () => {
    // January 5th
    const date = new Date(2024, 0, 5, 12, 0, 0);
    const result = toLocalDateString(date);
    expect(result).toBe('2024-01-05');
  });
});

describe('aggregateHeartRateByDate', () => {
  test('returns empty array for empty input', () => {
    const result = aggregateHeartRateByDate([]);
    expect(result).toEqual([]);
  });

  test('returns single record value', () => {
    const records: HKHeartRateRecord[] = [
      { startTime: '2024-01-15T10:00:00Z', samples: [{ beatsPerMinute: 72 }] },
    ];
    const result = aggregateHeartRateByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ date: '2024-01-15', value: 72, type: 'heart_rate' });
  });

  test('averages multiple records on the same day (rounded)', () => {
    const records: HKHeartRateRecord[] = [
      { startTime: '2024-01-15T08:00:00Z', samples: [{ beatsPerMinute: 60 }] },
      { startTime: '2024-01-15T12:00:00Z', samples: [{ beatsPerMinute: 80 }] },
      { startTime: '2024-01-15T18:00:00Z', samples: [{ beatsPerMinute: 70 }] },
    ];
    const result = aggregateHeartRateByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(70); // (60+80+70)/3 = 70
  });

  test('rounds average to nearest integer', () => {
    const records: HKHeartRateRecord[] = [
      { startTime: '2024-01-15T08:00:00Z', samples: [{ beatsPerMinute: 71 }] },
      { startTime: '2024-01-15T12:00:00Z', samples: [{ beatsPerMinute: 72 }] },
    ];
    const result = aggregateHeartRateByDate(records);
    expect(result[0].value).toBe(72); // (71+72)/2 = 71.5 -> 72
  });

  test('skips records with missing beatsPerMinute', () => {
    const records = [
      { startTime: '2024-01-15T08:00:00Z', samples: [{}] },
      { startTime: '2024-01-15T12:00:00Z', samples: [{ beatsPerMinute: 75 }] },
    ] as HKHeartRateRecord[];
    const result = aggregateHeartRateByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(75);
  });

  test('skips records with missing samples array', () => {
    const records = [
      { startTime: '2024-01-15T08:00:00Z' },
      { startTime: '2024-01-15T12:00:00Z', samples: [{ beatsPerMinute: 75 }] },
    ] as HKHeartRateRecord[];
    const result = aggregateHeartRateByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(75);
  });
});

describe('aggregateSleepSessions', () => {
  test('returns empty array for empty input', () => {
    const result = aggregateSleepSessions([]);
    expect(result).toEqual([]);
  });

  test('creates single session from one record', () => {
    const records: HKSleepRecord[] = [
      {
        startTime: '2024-01-15T22:00:00Z',
        endTime: '2024-01-16T06:00:00Z',
        value: 'HKCategoryValueSleepAnalysisAsleep',
      },
    ];
    const result = aggregateSleepSessions(records);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('SleepSession');
    expect(result[0].source).toBe('HealthKit');
    expect(result[0].bedtime).toBe('2024-01-15T22:00:00.000Z');
    expect(result[0].wake_time).toBe('2024-01-16T06:00:00.000Z');
  });

  test('merges records within 4hr gap into one session', () => {
    const records: HKSleepRecord[] = [
      {
        startTime: '2024-01-15T22:00:00Z',
        endTime: '2024-01-16T01:00:00Z',
        value: 'HKCategoryValueSleepAnalysisAsleepDeep',
      },
      {
        startTime: '2024-01-16T01:00:00Z',
        endTime: '2024-01-16T03:00:00Z',
        value: 'HKCategoryValueSleepAnalysisAsleepREM',
      },
      {
        startTime: '2024-01-16T03:00:00Z',
        endTime: '2024-01-16T06:00:00Z',
        value: 'HKCategoryValueSleepAnalysisAsleepCore',
      },
    ];
    const result = aggregateSleepSessions(records);
    expect(result).toHaveLength(1);
    expect(result[0].stage_events).toHaveLength(3);
  });

  test('creates separate sessions for records more than 4hr apart', () => {
    const records: HKSleepRecord[] = [
      {
        startTime: '2024-01-15T22:00:00Z',
        endTime: '2024-01-16T02:00:00Z',
        value: 'HKCategoryValueSleepAnalysisAsleep',
      },
      {
        startTime: '2024-01-16T10:00:00Z', // 8 hours after previous ended
        endTime: '2024-01-16T11:00:00Z',
        value: 'HKCategoryValueSleepAnalysisAsleep',
      },
    ];
    const result = aggregateSleepSessions(records);
    expect(result).toHaveLength(2);
  });

  test('records exactly 4hr apart stay in same session (uses > not >=)', () => {
    const baseEnd = new Date('2024-01-16T02:00:00Z');
    const exactlyFourHoursLater = new Date(baseEnd.getTime() + 4 * 60 * 60 * 1000);

    const records: HKSleepRecord[] = [
      {
        startTime: '2024-01-15T22:00:00Z',
        endTime: baseEnd.toISOString(),
        value: 'HKCategoryValueSleepAnalysisAsleep',
      },
      {
        startTime: exactlyFourHoursLater.toISOString(),
        endTime: new Date(exactlyFourHoursLater.getTime() + 60 * 60 * 1000).toISOString(),
        value: 'HKCategoryValueSleepAnalysisAsleep',
      },
    ];
    const result = aggregateSleepSessions(records);
    expect(result).toHaveLength(1); // Same session because gap is exactly 4hr, not > 4hr
  });

  test('maps string stage values correctly', () => {
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-15T23:00:00Z', value: 'HKCategoryValueSleepAnalysisAsleepREM' },
      { startTime: '2024-01-15T23:00:00Z', endTime: '2024-01-16T00:00:00Z', value: 'HKCategoryValueSleepAnalysisAsleepDeep' },
      { startTime: '2024-01-16T00:00:00Z', endTime: '2024-01-16T01:00:00Z', value: 'HKCategoryValueSleepAnalysisAsleepCore' },
      { startTime: '2024-01-16T01:00:00Z', endTime: '2024-01-16T02:00:00Z', value: 'HKCategoryValueSleepAnalysisAwake' },
      { startTime: '2024-01-16T02:00:00Z', endTime: '2024-01-16T03:00:00Z', value: 'HKCategoryValueSleepAnalysisInBed' },
    ];
    const result = aggregateSleepSessions(records);
    const stages = result[0].stage_events.map(e => e.stage_type);
    expect(stages).toEqual(['rem', 'deep', 'light', 'awake', 'in_bed']);
  });

  test('maps numeric stage values correctly', () => {
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-15T23:00:00Z', value: 5 }, // REM
      { startTime: '2024-01-15T23:00:00Z', endTime: '2024-01-16T00:00:00Z', value: 4 }, // Deep
      { startTime: '2024-01-16T00:00:00Z', endTime: '2024-01-16T01:00:00Z', value: 3 }, // Light (Core)
      { startTime: '2024-01-16T01:00:00Z', endTime: '2024-01-16T02:00:00Z', value: 2 }, // Awake
      { startTime: '2024-01-16T02:00:00Z', endTime: '2024-01-16T03:00:00Z', value: 0 }, // InBed
    ];
    const result = aggregateSleepSessions(records);
    const stages = result[0].stage_events.map(e => e.stage_type);
    expect(stages).toEqual(['rem', 'deep', 'light', 'awake', 'in_bed']);
  });

  test('maps unknown stage values to unknown', () => {
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-15T23:00:00Z', value: 999 },
      { startTime: '2024-01-15T23:00:00Z', endTime: '2024-01-16T00:00:00Z', value: 'UnknownStageValue' },
    ];
    const result = aggregateSleepSessions(records);
    const stages = result[0].stage_events.map(e => e.stage_type);
    expect(stages).toEqual(['unknown', 'unknown']);
  });

  test('calculates duration for each sleep stage correctly', () => {
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-16T00:00:00Z', value: 4 }, // Deep - 2hr
      { startTime: '2024-01-16T00:00:00Z', endTime: '2024-01-16T03:00:00Z', value: 3 }, // Light - 3hr
      { startTime: '2024-01-16T03:00:00Z', endTime: '2024-01-16T04:00:00Z', value: 5 }, // REM - 1hr
      { startTime: '2024-01-16T04:00:00Z', endTime: '2024-01-16T04:30:00Z', value: 2 }, // Awake - 30min
    ];
    const result = aggregateSleepSessions(records);

    expect(result[0].deep_sleep_seconds).toBe(2 * 60 * 60); // 7200
    expect(result[0].light_sleep_seconds).toBe(3 * 60 * 60); // 10800
    expect(result[0].rem_sleep_seconds).toBe(1 * 60 * 60); // 3600
    expect(result[0].awake_sleep_seconds).toBe(30 * 60); // 1800
  });

  test('total_time_asleep_in_seconds excludes awake and in_bed stages', () => {
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-16T00:00:00Z', value: 4 }, // Deep - 2hr
      { startTime: '2024-01-16T00:00:00Z', endTime: '2024-01-16T02:00:00Z', value: 3 }, // Light - 2hr
      { startTime: '2024-01-16T02:00:00Z', endTime: '2024-01-16T02:30:00Z', value: 2 }, // Awake - 30min (excluded)
      { startTime: '2024-01-16T02:30:00Z', endTime: '2024-01-16T03:00:00Z', value: 0 }, // InBed - 30min (excluded)
    ];
    const result = aggregateSleepSessions(records);

    // Only deep (2hr) + light (2hr) = 4hr = 14400 seconds
    expect(result[0].time_asleep_in_seconds).toBe(4 * 60 * 60);
  });

  test('calculates total_duration_in_seconds from bedtime to wake_time', () => {
    const records: HKSleepRecord[] = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-16T06:00:00Z', value: 3 },
    ];
    const result = aggregateSleepSessions(records);

    // 8 hours from 22:00 to 06:00
    expect(result[0].duration_in_seconds).toBe(8 * 60 * 60);
  });

  test('sets entry_date to the local wake time date', () => {
    // Use a local time by creating a Date at 10pm local time
    const bedtime = new Date();
    bedtime.setHours(22, 0, 0, 0);
    const wakeTime = new Date(bedtime.getTime() + 8 * 60 * 60 * 1000); // 8 hours later

    const records: HKSleepRecord[] = [
      { startTime: bedtime.toISOString(), endTime: wakeTime.toISOString(), value: 3 },
    ];
    const result = aggregateSleepSessions(records);

    // entry_date should match the local date of wake time
    const expectedDate = toLocalDateString(wakeTime);
    expect(result[0].entry_date).toBe(expectedDate);
  });
});

describe('aggregateByDay', () => {
  test('returns empty array for empty input', () => {
    const result = aggregateByDay([], 'running_speed', 'm/s', 'min-max-avg');
    expect(result).toEqual([]);
  });

  test('min-max-avg with multiple records across 2 days returns 3 records per day', () => {
    const records: TransformedRecord[] = [
      { value: 2.5, type: 'running_speed', date: '2024-01-15', unit: 'm/s' },
      { value: 3.0, type: 'running_speed', date: '2024-01-15', unit: 'm/s' },
      { value: 4.0, type: 'running_speed', date: '2024-01-15', unit: 'm/s' },
      { value: 5.0, type: 'running_speed', date: '2024-01-16', unit: 'm/s' },
      { value: 6.0, type: 'running_speed', date: '2024-01-16', unit: 'm/s' },
    ];

    const result = aggregateByDay(records, 'running_speed', 'm/s', 'min-max-avg');

    expect(result).toHaveLength(6);

    // Day 1: min=2.5, max=4.0, avg=(2.5+3.0+4.0)/3=3.17
    expect(result[0]).toEqual({ value: 2.5, type: 'running_speed_min', date: '2024-01-15', unit: 'm/s' });
    expect(result[1]).toEqual({ value: 4.0, type: 'running_speed_max', date: '2024-01-15', unit: 'm/s' });
    expect(result[2]).toEqual({ value: 3.17, type: 'running_speed_avg', date: '2024-01-15', unit: 'm/s' });

    // Day 2: min=5.0, max=6.0, avg=(5.0+6.0)/2=5.5
    expect(result[3]).toEqual({ value: 5.0, type: 'running_speed_min', date: '2024-01-16', unit: 'm/s' });
    expect(result[4]).toEqual({ value: 6.0, type: 'running_speed_max', date: '2024-01-16', unit: 'm/s' });
    expect(result[5]).toEqual({ value: 5.5, type: 'running_speed_avg', date: '2024-01-16', unit: 'm/s' });
  });

  test('min-max-avg with single record on a day sets min/max/avg all equal', () => {
    const records: TransformedRecord[] = [
      { value: 3.5, type: 'running_speed', date: '2024-01-15', unit: 'm/s' },
    ];

    const result = aggregateByDay(records, 'running_speed', 'm/s', 'min-max-avg');

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ value: 3.5, type: 'running_speed_min', date: '2024-01-15', unit: 'm/s' });
    expect(result[1]).toEqual({ value: 3.5, type: 'running_speed_max', date: '2024-01-15', unit: 'm/s' });
    expect(result[2]).toEqual({ value: 3.5, type: 'running_speed_avg', date: '2024-01-15', unit: 'm/s' });
  });

  test('sum strategy returns 1 record per day with summed value', () => {
    const records: TransformedRecord[] = [
      { value: 100, type: 'step', date: '2024-01-15', unit: 'count' },
      { value: 200, type: 'step', date: '2024-01-15', unit: 'count' },
      { value: 300, type: 'step', date: '2024-01-16', unit: 'count' },
    ];

    const result = aggregateByDay(records, 'step', 'count', 'sum');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ value: 300, type: 'step', date: '2024-01-15', unit: 'count' });
    expect(result[1]).toEqual({ value: 300, type: 'step', date: '2024-01-16', unit: 'count' });
  });

  test('last strategy returns 1 record per day with the newest value (first in newest-first order)', () => {
    // Records arrive newest-first from HealthKit/Health Connect queries
    const records: TransformedRecord[] = [
      { value: 72, type: 'weight', date: '2024-01-15', unit: 'kg' }, // newest
      { value: 71, type: 'weight', date: '2024-01-15', unit: 'kg' },
      { value: 70, type: 'weight', date: '2024-01-15', unit: 'kg' }, // oldest
    ];

    const result = aggregateByDay(records, 'weight', 'kg', 'last');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ value: 72, type: 'weight', date: '2024-01-15', unit: 'kg' });
  });
});
