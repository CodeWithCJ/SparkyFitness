jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

import { aggregateSleepSessions } from '../../../src/services/healthkit/dataAggregation';

describe('aggregateSleepSessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sleep stage mapping', () => {
    it.each([
      [0, 'in_bed', 'numeric 0'],
      [1, 'light', 'numeric 1'],
      [2, 'awake', 'numeric 2'],
      [3, 'light', 'numeric 3 (core)'],
      [4, 'deep', 'numeric 4'],
      [5, 'rem', 'numeric 5'],
      ['HKCategoryValueSleepAnalysisAsleepREM', 'rem', 'string REM'],
      ['HKCategoryValueSleepAnalysisAsleepDeep', 'deep', 'string Deep'],
      ['HKCategoryValueSleepAnalysisAsleepCore', 'light', 'string Core'],
      ['HKCategoryValueSleepAnalysisAwake', 'awake', 'string Awake'],
      ['HKCategoryValueSleepAnalysisInBed', 'in_bed', 'string InBed'],
      ['SomeUnknownValue', 'unknown', 'unknown value'],
    ])('maps %s to %s (%s)', (inputValue, expectedStage) => {
      const records = [
        {
          startTime: '2024-01-15T22:00:00',
          endTime: '2024-01-15T22:30:00',
          value: inputValue,
        },
      ];

      const result = aggregateSleepSessions(records);

      expect(result[0].stage_events[0].stage_type).toBe(expectedStage);
    });
  });

  describe('session gap handling', () => {
    it('merges records within 4-hour gap into same session', () => {
      const records = [
        {
          startTime: '2024-01-15T22:00:00',
          endTime: '2024-01-15T23:00:00',
          value: 3,
        },
        {
          startTime: '2024-01-15T23:30:00',
          endTime: '2024-01-16T01:00:00',
          value: 4,
        },
      ];

      const result = aggregateSleepSessions(records);

      expect(result).toHaveLength(1);
      expect(result[0].stage_events).toHaveLength(2);
    });

    it('splits records with >4-hour gap into separate sessions', () => {
      const records = [
        {
          startTime: '2024-01-15T22:00:00',
          endTime: '2024-01-15T23:00:00',
          value: 3,
        },
        {
          startTime: '2024-01-16T04:00:00',
          endTime: '2024-01-16T05:00:00',
          value: 4,
        },
      ];

      const result = aggregateSleepSessions(records);

      expect(result).toHaveLength(2);
      expect(result[0].stage_events).toHaveLength(1);
      expect(result[1].stage_events).toHaveLength(1);
    });

    it('extends session wake_time when record ends later', () => {
      const records = [
        {
          startTime: '2024-01-15T22:00:00Z',
          endTime: '2024-01-15T23:00:00Z',
          value: 3,
        },
        {
          startTime: '2024-01-15T22:30:00Z',
          endTime: '2024-01-16T02:00:00Z',
          value: 4,
        },
      ];

      const result = aggregateSleepSessions(records);

      expect(result).toHaveLength(1);
      expect(result[0].wake_time).toBe('2024-01-16T02:00:00.000Z');
    });
  });

  describe('sleep time calculation', () => {
    it('excludes awake time from total_time_asleep', () => {
      const records = [
        {
          startTime: '2024-01-15T22:00:00',
          endTime: '2024-01-15T23:00:00',
          value: 3, // light sleep - 1 hour
        },
        {
          startTime: '2024-01-15T23:00:00',
          endTime: '2024-01-15T23:30:00',
          value: 2, // awake - 30 min
        },
        {
          startTime: '2024-01-15T23:30:00',
          endTime: '2024-01-16T00:30:00',
          value: 4, // deep sleep - 1 hour
        },
      ];

      const result = aggregateSleepSessions(records);

      // Total asleep should be 2 hours (light + deep), not including 30 min awake
      expect(result[0].time_asleep_in_seconds).toBe(2 * 60 * 60);
      expect(result[0].awake_sleep_seconds).toBe(30 * 60);
    });

    it('excludes in_bed time from total_time_asleep', () => {
      const records = [
        {
          startTime: '2024-01-15T22:00:00',
          endTime: '2024-01-15T22:30:00',
          value: 0, // in_bed - 30 min
        },
        {
          startTime: '2024-01-15T22:30:00',
          endTime: '2024-01-15T23:30:00',
          value: 3, // light sleep - 1 hour
        },
      ];

      const result = aggregateSleepSessions(records);

      // Total asleep should be 1 hour (light only), not including 30 min in_bed
      expect(result[0].time_asleep_in_seconds).toBe(60 * 60);
    });

    it('sums up sleep stage durations correctly', () => {
      const records = [
        {
          startTime: '2024-01-15T22:00:00',
          endTime: '2024-01-15T23:00:00',
          value: 3, // light - 1 hour
        },
        {
          startTime: '2024-01-15T23:00:00',
          endTime: '2024-01-16T00:30:00',
          value: 4, // deep - 1.5 hours
        },
        {
          startTime: '2024-01-16T00:30:00',
          endTime: '2024-01-16T01:30:00',
          value: 5, // rem - 1 hour
        },
      ];

      const result = aggregateSleepSessions(records);

      expect(result[0].light_sleep_seconds).toBe(60 * 60);
      expect(result[0].deep_sleep_seconds).toBe(90 * 60);
      expect(result[0].rem_sleep_seconds).toBe(60 * 60);
      expect(result[0].time_asleep_in_seconds).toBe(3.5 * 60 * 60);
    });
  });

  describe('basic validation', () => {
    it('returns empty array for empty input', () => {
      const result = aggregateSleepSessions([]);

      expect(result).toEqual([]);
    });

    it('returns empty array for non-array input', () => {
      const result = aggregateSleepSessions(null);

      expect(result).toEqual([]);
    });

    it('returns session with correct structure', () => {
      const records = [
        {
          startTime: '2024-01-15T22:00:00Z',
          endTime: '2024-01-16T06:00:00Z',
          value: 3,
        },
      ];

      const result = aggregateSleepSessions(records);

      expect(result[0]).toMatchObject({
        type: 'SleepSession',
        source: 'HealthKit',
        entry_date: '2024-01-15',
      });
      expect(result[0]).toHaveProperty('bedtime');
      expect(result[0]).toHaveProperty('wake_time');
      expect(result[0]).toHaveProperty('duration_in_seconds');
      expect(result[0]).toHaveProperty('time_asleep_in_seconds');
      expect(result[0]).toHaveProperty('stage_events');
    });
  });
});
