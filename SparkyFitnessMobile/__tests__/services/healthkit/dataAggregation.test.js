import {
  aggregateStepsByDate,
  aggregateHeartRateByDate,
  aggregateActiveCaloriesByDate,
  aggregateTotalCaloriesByDate,
  aggregateSleepSessions,
} from '../../../src/services/healthkit/dataAggregation';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

describe('aggregateStepsByDate', () => {
  test('returns empty array for empty input', () => {
    const result = aggregateStepsByDate([]);
    expect(result).toEqual([]);
  });

  test('returns empty array for non-array input', () => {
    expect(aggregateStepsByDate(null)).toEqual([]);
    expect(aggregateStepsByDate(undefined)).toEqual([]);
  });

  test('aggregates single record correctly', () => {
    const records = [
      { startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T10:30:00Z', value: 500 },
    ];
    const result = aggregateStepsByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ date: '2024-01-15', value: 500, type: 'step' });
  });

  test('sums multiple records on the same day', () => {
    const records = [
      { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T08:30:00Z', value: 200 },
      { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T12:30:00Z', value: 300 },
      { startTime: '2024-01-15T18:00:00Z', endTime: '2024-01-15T18:30:00Z', value: 500 },
    ];
    const result = aggregateStepsByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(1000);
  });

  test('produces separate entries for different days', () => {
    const records = [
      { startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T10:30:00Z', value: 500 },
      { startTime: '2024-01-16T10:00:00Z', endTime: '2024-01-16T10:30:00Z', value: 600 },
      { startTime: '2024-01-17T10:00:00Z', endTime: '2024-01-17T10:30:00Z', value: 700 },
    ];
    const result = aggregateStepsByDate(records);
    expect(result).toHaveLength(3);
    expect(result.find(r => r.date === '2024-01-15').value).toBe(500);
    expect(result.find(r => r.date === '2024-01-16').value).toBe(600);
    expect(result.find(r => r.date === '2024-01-17').value).toBe(700);
  });

  test('skips records with invalid dates, processes valid ones', () => {
    const records = [
      { startTime: 'invalid-date', endTime: null, value: 100 },
      { startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T10:30:00Z', value: 500 },
    ];
    const result = aggregateStepsByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(500);
  });

  test('skips records with missing value field', () => {
    const records = [
      { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T08:30:00Z', value: 200 }, // valid
      { startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T10:30:00Z' }, // missing value
      { startTime: '2024-01-15T11:00:00Z', endTime: '2024-01-15T11:30:00Z', value: 500 }, // valid
    ];
    const result = aggregateStepsByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(700); // Should be 200 + 500, skipping invalid record
  });

  test('uses endTime for date when available', () => {
    const records = [
      { startTime: '2024-01-15T23:30:00Z', endTime: '2024-01-16T00:30:00Z', value: 100 },
    ];
    const result = aggregateStepsByDate(records);
    // Code uses endTime || startTime, so this should be dated 2024-01-16
    expect(result[0].date).toBe('2024-01-16');
  });
});

describe('aggregateHeartRateByDate', () => {
  test('returns empty array for empty input', () => {
    const result = aggregateHeartRateByDate([]);
    expect(result).toEqual([]);
  });

  test('returns empty array for non-array input', () => {
    expect(aggregateHeartRateByDate(null)).toEqual([]);
    expect(aggregateHeartRateByDate(undefined)).toEqual([]);
  });

  test('returns single record value', () => {
    const records = [
      { startTime: '2024-01-15T10:00:00Z', samples: [{ beatsPerMinute: 72 }] },
    ];
    const result = aggregateHeartRateByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ date: '2024-01-15', value: 72, type: 'heart_rate' });
  });

  test('averages multiple records on the same day (rounded)', () => {
    const records = [
      { startTime: '2024-01-15T08:00:00Z', samples: [{ beatsPerMinute: 60 }] },
      { startTime: '2024-01-15T12:00:00Z', samples: [{ beatsPerMinute: 80 }] },
      { startTime: '2024-01-15T18:00:00Z', samples: [{ beatsPerMinute: 70 }] },
    ];
    const result = aggregateHeartRateByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(70); // (60+80+70)/3 = 70
  });

  test('rounds average to nearest integer', () => {
    const records = [
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
    ];
    const result = aggregateHeartRateByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(75);
  });

  test('skips records with missing samples array', () => {
    const records = [
      { startTime: '2024-01-15T08:00:00Z' },
      { startTime: '2024-01-15T12:00:00Z', samples: [{ beatsPerMinute: 75 }] },
    ];
    const result = aggregateHeartRateByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(75);
  });
});

describe('aggregateActiveCaloriesByDate', () => {
  test('returns empty array for empty input', () => {
    const result = aggregateActiveCaloriesByDate([]);
    expect(result).toEqual([]);
  });

  test('returns empty array for non-array input', () => {
    expect(aggregateActiveCaloriesByDate(null)).toEqual([]);
    expect(aggregateActiveCaloriesByDate(undefined)).toEqual([]);
  });

  test('aggregates records with energy.inCalories by date', () => {
    const records = [
      { startTime: '2024-01-15T08:00:00Z', energy: { inCalories: 100 } },
      { startTime: '2024-01-15T12:00:00Z', energy: { inCalories: 150 } },
    ];
    const result = aggregateActiveCaloriesByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(250);
    expect(result[0].type).toBe('Active Calories');
  });

  test('skips records missing energy field', () => {
    const records = [
      { startTime: '2024-01-15T08:00:00Z', energy: { inCalories: 100 } },
      { startTime: '2024-01-15T12:00:00Z' },
      { startTime: '2024-01-15T16:00:00Z', energy: { inCalories: 50 } },
    ];
    const result = aggregateActiveCaloriesByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(150); // Only valid records summed
  });

  test('skips records with energy but missing inCalories', () => {
    const records = [
      { startTime: '2024-01-15T08:00:00Z', energy: {} },
      { startTime: '2024-01-15T12:00:00Z', energy: { inCalories: 100 } },
    ];
    const result = aggregateActiveCaloriesByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(100);
  });
});

describe('aggregateTotalCaloriesByDate', () => {
  test('returns empty array for empty input', () => {
    const result = aggregateTotalCaloriesByDate([]);
    expect(result).toEqual([]);
  });

  test('aggregates records by date with type total_calories', () => {
    const records = [
      { startTime: '2024-01-15T08:00:00Z', energy: { inCalories: 1500 } },
      { startTime: '2024-01-15T12:00:00Z', energy: { inCalories: 500 } },
    ];
    const result = aggregateTotalCaloriesByDate(records);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(2000);
    expect(result[0].type).toBe('total_calories');
  });
});

describe('aggregateSleepSessions', () => {
  test('returns empty array for empty input', () => {
    const result = aggregateSleepSessions([]);
    expect(result).toEqual([]);
  });

  test('returns empty array for non-array input', () => {
    expect(aggregateSleepSessions(null)).toEqual([]);
    expect(aggregateSleepSessions(undefined)).toEqual([]);
  });

  test('creates single session from one record', () => {
    const records = [
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
    const records = [
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
    const records = [
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

    const records = [
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
    const records = [
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
    const records = [
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
    const records = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-15T23:00:00Z', value: 999 },
      { startTime: '2024-01-15T23:00:00Z', endTime: '2024-01-16T00:00:00Z', value: 'UnknownStageValue' },
    ];
    const result = aggregateSleepSessions(records);
    const stages = result[0].stage_events.map(e => e.stage_type);
    expect(stages).toEqual(['unknown', 'unknown']);
  });

  test('calculates duration for each sleep stage correctly', () => {
    const records = [
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
    const records = [
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
    const records = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-16T06:00:00Z', value: 3 },
    ];
    const result = aggregateSleepSessions(records);

    // 8 hours from 22:00 to 06:00
    expect(result[0].duration_in_seconds).toBe(8 * 60 * 60);
  });

  test('sets entry_date to the bedtime date', () => {
    const records = [
      { startTime: '2024-01-15T22:00:00Z', endTime: '2024-01-16T06:00:00Z', value: 3 },
    ];
    const result = aggregateSleepSessions(records);
    expect(result[0].entry_date).toBe('2024-01-15');
  });
});
