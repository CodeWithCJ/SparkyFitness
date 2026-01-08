jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

import {
  aggregateHeartRateByDate,
  aggregateStepsByDate,
  aggregateTotalCaloriesByDate,
  aggregateActiveCaloriesByDate,
} from '../../../src/services/healthconnect/dataAggregation';

describe('dataAggregation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calorie unit conversion', () => {
    it.each([
      [{ inKilocalories: 250 }, 250, 'uses inKilocalories when available'],
      [{ inCalories: 250000 }, 250, 'converts large inCalories (>10k) to kcal'],
      [{ inCalories: 500 }, 500, 'keeps small inCalories as-is (assumes already kcal)'],
      [{ inCalories: 10000 }, 10000, 'does not convert exactly 10,000 calories'],
      [{ inCalories: 10001 }, 10.001, 'converts 10,001 calories to ~10 kcal'],
    ])('%j → %s kcal (%s)', async (energy, expectedValue) => {
      const records = [{ startTime: '2024-01-15T12:00:00', energy }];

      const result = await aggregateTotalCaloriesByDate(records);

      expect(result).toEqual([
        { date: '2024-01-15', value: expectedValue, type: 'total_calories' },
      ]);
    });
  });

  describe('aggregateStepsByDate', () => {
    it('sums steps for same date', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00', count: 100 },
        { startTime: '2024-01-15T12:00:00', count: 200 },
      ];

      const result = aggregateStepsByDate(records);

      expect(result).toEqual([
        { date: '2024-01-15', value: 300, type: 'step' },
      ]);
    });

    it('separates steps by date', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00', count: 100 },
        { startTime: '2024-01-16T08:00:00', count: 200 },
      ];

      const result = aggregateStepsByDate(records);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ date: '2024-01-15', value: 100, type: 'step' });
      expect(result).toContainEqual({ date: '2024-01-16', value: 200, type: 'step' });
    });

    it('uses endTime for date when available', () => {
      const records = [
        {
          startTime: '2024-01-15T23:55:00',
          endTime: '2024-01-16T00:05:00',
          count: 150,
        },
      ];

      const result = aggregateStepsByDate(records);

      expect(result).toEqual([
        { date: '2024-01-16', value: 150, type: 'step' },
      ]);
    });

    it('returns empty array for empty input', () => {
      const result = aggregateStepsByDate([]);

      expect(result).toEqual([]);
    });
  });

  describe('aggregateTotalCaloriesByDate', () => {
    it('sums calories for same date', async () => {
      const records = [
        { startTime: '2024-01-15T08:00:00', energy: { inKilocalories: 100 } },
        { startTime: '2024-01-15T12:00:00', energy: { inKilocalories: 150 } },
      ];

      const result = await aggregateTotalCaloriesByDate(records);

      expect(result).toEqual([
        { date: '2024-01-15', value: 250, type: 'total_calories' },
      ]);
    });

    it('applies unit conversion during aggregation', async () => {
      const records = [
        { startTime: '2024-01-15T08:00:00', energy: { inKilocalories: 100 } },
        { startTime: '2024-01-15T12:00:00', energy: { inCalories: 150000 } },
      ];

      const result = await aggregateTotalCaloriesByDate(records);

      expect(result).toEqual([
        { date: '2024-01-15', value: 250, type: 'total_calories' },
      ]);
    });

    it('returns empty array for empty input', async () => {
      const result = await aggregateTotalCaloriesByDate([]);

      expect(result).toEqual([]);
    });
  });

  describe('aggregateActiveCaloriesByDate', () => {
    it('sums active calories for same date', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00', energy: { inCalories: 100 } },
        { startTime: '2024-01-15T12:00:00', energy: { inCalories: 150 } },
      ];

      const result = aggregateActiveCaloriesByDate(records);

      expect(result).toEqual([
        { date: '2024-01-15', value: 250, type: 'Active Calories' },
      ]);
    });

    it('applies unit conversion during aggregation', () => {
      // Note: aggregateActiveCaloriesByDate requires inCalories to be present (filter at line 166)
      // but will use inKilocalories if available inside the reduce
      const records = [
        { startTime: '2024-01-15T08:00:00', energy: { inCalories: 100, inKilocalories: 100 } },
        { startTime: '2024-01-15T12:00:00', energy: { inCalories: 150000 } },
      ];

      const result = aggregateActiveCaloriesByDate(records);

      expect(result).toEqual([
        { date: '2024-01-15', value: 250, type: 'Active Calories' },
      ]);
    });

    it('returns empty array for empty input', () => {
      const result = aggregateActiveCaloriesByDate([]);

      expect(result).toEqual([]);
    });

    it('filters out records with only inKilocalories (no inCalories)', () => {
      // BUG: Records with only inKilocalories are filtered out due to filter at line 166
      // This documents current behavior - these calories are lost
      const records = [
        { startTime: '2024-01-15T08:00:00', energy: { inKilocalories: 500 } },
      ];

      const result = aggregateActiveCaloriesByDate(records);

      expect(result).toEqual([]);
    });
  });

  describe('aggregateHeartRateByDate', () => {
    it('averages samples within a single record', () => {
      const records = [
        {
          startTime: '2024-01-15T10:00:00',
          samples: [
            { beatsPerMinute: 70 },
            { beatsPerMinute: 80 },
            { beatsPerMinute: 90 },
          ],
        },
      ];

      const result = aggregateHeartRateByDate(records);

      expect(result).toEqual([
        { date: '2024-01-15', value: 80, type: 'heart_rate' },
      ]);
    });

    it('averages multiple records for same date', () => {
      const records = [
        {
          startTime: '2024-01-15T10:00:00',
          samples: [{ beatsPerMinute: 70 }],
        },
        {
          startTime: '2024-01-15T14:00:00',
          samples: [{ beatsPerMinute: 80 }],
        },
      ];

      const result = aggregateHeartRateByDate(records);

      expect(result).toEqual([
        { date: '2024-01-15', value: 75, type: 'heart_rate' },
      ]);
    });

    it('rounds the result', () => {
      const records = [
        {
          startTime: '2024-01-15T10:00:00',
          samples: [
            { beatsPerMinute: 71 },
            { beatsPerMinute: 72 },
          ],
        },
      ];

      const result = aggregateHeartRateByDate(records);

      expect(result).toEqual([
        { date: '2024-01-15', value: 72, type: 'heart_rate' },
      ]);
    });

    it('returns empty array for empty input', () => {
      const result = aggregateHeartRateByDate([]);

      expect(result).toEqual([]);
    });

    it('produces NaN for records with empty samples array', () => {
      // BUG: Empty samples array causes division by zero (0 / samples.length)
      // This documents current behavior - result is NaN
      const records = [
        {
          startTime: '2024-01-15T10:00:00',
          samples: [],
        },
      ];

      const result = aggregateHeartRateByDate(records);

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-15');
      expect(result[0].value).toBeNaN();
    });
  });
});
