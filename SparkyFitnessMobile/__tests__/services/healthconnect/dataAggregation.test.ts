import {
  aggregateHeartRateByDate,
  aggregateStepsByDate,
  aggregateTotalCaloriesByDate,
  aggregateActiveCaloriesByDate,
} from '../../../src/services/healthconnect/dataAggregation';

import type { HCHeartRateRecord, HCStepsRecord, HCEnergyRecord } from '../../../src/types/healthRecords';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

describe('aggregateHeartRateByDate', () => {
  describe('input validation', () => {
    test('returns empty array for empty input', () => {
      expect(aggregateHeartRateByDate([])).toEqual([]);
    });

  });

  describe('happy path', () => {
    test('returns single record with averaged BPM', () => {
      const records: HCHeartRateRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', samples: [{ beatsPerMinute: 72 }] },
      ];
      const result = aggregateHeartRateByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ date: '2024-01-15', value: 72, type: 'heart_rate' });
    });

    test('averages multiple samples within a single record', () => {
      const records: HCHeartRateRecord[] = [
        {
          startTime: '2024-01-15T10:00:00Z',
          samples: [
            { beatsPerMinute: 60 },
            { beatsPerMinute: 80 },
            { beatsPerMinute: 70 },
          ],
        },
      ];
      const result = aggregateHeartRateByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(70); // (60+80+70)/3 = 70
    });

    test('averages multiple records on the same day (rounded)', () => {
      const records: HCHeartRateRecord[] = [
        { startTime: '2024-01-15T08:00:00Z', samples: [{ beatsPerMinute: 60 }] },
        { startTime: '2024-01-15T12:00:00Z', samples: [{ beatsPerMinute: 80 }] },
        { startTime: '2024-01-15T18:00:00Z', samples: [{ beatsPerMinute: 70 }] },
      ];
      const result = aggregateHeartRateByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(70); // (60+80+70)/3 = 70
    });

    test('rounds average to nearest integer', () => {
      const records: HCHeartRateRecord[] = [
        { startTime: '2024-01-15T08:00:00Z', samples: [{ beatsPerMinute: 71 }] },
        { startTime: '2024-01-15T12:00:00Z', samples: [{ beatsPerMinute: 72 }] },
      ];
      const result = aggregateHeartRateByDate(records);
      expect(result[0].value).toBe(72); // (71+72)/2 = 71.5 -> 72
    });

    test('aggregates records across multiple days', () => {
      const records: HCHeartRateRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', samples: [{ beatsPerMinute: 70 }] },
        { startTime: '2024-01-16T10:00:00Z', samples: [{ beatsPerMinute: 75 }] },
        { startTime: '2024-01-17T10:00:00Z', samples: [{ beatsPerMinute: 80 }] },
      ];
      const result = aggregateHeartRateByDate(records);
      expect(result).toHaveLength(3);
      expect(result.find(r => r.date === '2024-01-15')?.value).toBe(70);
      expect(result.find(r => r.date === '2024-01-16')?.value).toBe(75);
      expect(result.find(r => r.date === '2024-01-17')?.value).toBe(80);
    });
  });

  describe('edge cases', () => {
    test('skips records with missing startTime', () => {
      const records = [
        { samples: [{ beatsPerMinute: 72 }] },
        { startTime: '2024-01-15T12:00:00Z', samples: [{ beatsPerMinute: 75 }] },
      ] as unknown as HCHeartRateRecord[];
      const result = aggregateHeartRateByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(75);
    });

    test('skips records with missing samples array', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z' },
        { startTime: '2024-01-15T12:00:00Z', samples: [{ beatsPerMinute: 75 }] },
      ] as unknown as HCHeartRateRecord[];
      const result = aggregateHeartRateByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(75);
    });

    test('skips records with non-array samples', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', samples: 'not an array' },
        { startTime: '2024-01-15T12:00:00Z', samples: [{ beatsPerMinute: 75 }] },
      ] as unknown as HCHeartRateRecord[];
      const result = aggregateHeartRateByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(75);
    });

    test('includes records with missing beatsPerMinute as 0 in average', () => {
      // A record with samples that lack beatsPerMinute still counts as a valid record
      // The beatsPerMinute defaults to 0, affecting the average
      const records = [
        { startTime: '2024-01-15T08:00:00Z', samples: [{}] },
        { startTime: '2024-01-16T10:00:00Z', samples: [{ beatsPerMinute: 80 }] },
      ] as unknown as HCHeartRateRecord[];
      const result = aggregateHeartRateByDate(records);
      expect(result).toHaveLength(2);
      expect(result.find(r => r.date === '2024-01-15')?.value).toBe(0); // No BPM -> 0
      expect(result.find(r => r.date === '2024-01-16')?.value).toBe(80);
    });

    test('handles samples with beatsPerMinute: 0', () => {
      // Zero BPM is a valid value and gets included in the average
      const records: HCHeartRateRecord[] = [
        { startTime: '2024-01-15T08:00:00Z', samples: [{ beatsPerMinute: 0 }] },
        { startTime: '2024-01-16T10:00:00Z', samples: [{ beatsPerMinute: 80 }] },
      ];
      const result = aggregateHeartRateByDate(records);
      expect(result).toHaveLength(2);
      expect(result.find(r => r.date === '2024-01-15')?.value).toBe(0);
      expect(result.find(r => r.date === '2024-01-16')?.value).toBe(80);
    });

    test('produces correct output structure with date, value, and type', () => {
      const records: HCHeartRateRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', samples: [{ beatsPerMinute: 72 }] },
      ];
      const result = aggregateHeartRateByDate(records);
      expect(result[0]).toEqual({ date: '2024-01-15', value: 72, type: 'heart_rate' });
    });
  });

  describe('error recovery', () => {
    test('continues processing after one record causes an error', () => {
      // Create a record that will cause an error when split is called
      const badRecord = {
        startTime: { toString: () => { throw new Error('boom'); } },
        samples: [{ beatsPerMinute: 72 }],
      };
      const goodRecord: HCHeartRateRecord = {
        startTime: '2024-01-16T10:00:00Z',
        samples: [{ beatsPerMinute: 75 }],
      };
      const result = aggregateHeartRateByDate([badRecord as unknown as HCHeartRateRecord, goodRecord]);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-16');
    });
  });
});

describe('aggregateStepsByDate', () => {
  describe('input validation', () => {
    test('returns empty array for empty input', () => {
      expect(aggregateStepsByDate([])).toEqual([]);
    });

  });

  describe('happy path', () => {
    test('returns single record with step count', () => {
      const records: HCStepsRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T10:30:00Z', count: 5000 },
      ];
      const result = aggregateStepsByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ date: '2024-01-15', value: 5000, type: 'step' });
    });

    test('sums multiple records on the same day', () => {
      const records: HCStepsRecord[] = [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', count: 1000 },
        { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', count: 2000 },
        { startTime: '2024-01-15T18:00:00Z', endTime: '2024-01-15T19:00:00Z', count: 3000 },
      ];
      const result = aggregateStepsByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(6000);
    });

    test('aggregates records across multiple days', () => {
      const records: HCStepsRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', endTime: '2024-01-15T11:00:00Z', count: 5000 },
        { startTime: '2024-01-16T10:00:00Z', endTime: '2024-01-16T11:00:00Z', count: 6000 },
        { startTime: '2024-01-17T10:00:00Z', endTime: '2024-01-17T11:00:00Z', count: 7000 },
      ];
      const result = aggregateStepsByDate(records);
      expect(result).toHaveLength(3);
      expect(result.find(r => r.date === '2024-01-15')?.value).toBe(5000);
      expect(result.find(r => r.date === '2024-01-16')?.value).toBe(6000);
      expect(result.find(r => r.date === '2024-01-17')?.value).toBe(7000);
    });
  });

  describe('date extraction', () => {
    test('uses endTime for date extraction when available', () => {
      const records: HCStepsRecord[] = [
        { startTime: '2024-01-14T23:00:00Z', endTime: '2024-01-15T00:30:00Z', count: 500 },
      ];
      const result = aggregateStepsByDate(records);
      expect(result).toHaveLength(1);
      // Should use endTime (Jan 15), not startTime (Jan 14)
      expect(result[0].date).toBe('2024-01-15');
    });

    test('falls back to startTime when endTime is missing', () => {
      const records: HCStepsRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', count: 5000 },
      ];
      const result = aggregateStepsByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-15');
    });
  });

  describe('edge cases', () => {
    test('skips records with missing startTime', () => {
      const records = [
        { count: 5000 },
        { startTime: '2024-01-15T12:00:00Z', count: 6000 },
      ] as unknown as HCStepsRecord[];
      const result = aggregateStepsByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(6000);
    });

    test('skips records with non-numeric count', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', count: 'not a number' },
        { startTime: '2024-01-15T12:00:00Z', count: 6000 },
      ] as unknown as HCStepsRecord[];
      const result = aggregateStepsByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(6000);
    });

    test('handles record.count = 0 correctly', () => {
      const records: HCStepsRecord[] = [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', count: 0 },
        { startTime: '2024-01-15T12:00:00Z', endTime: '2024-01-15T13:00:00Z', count: 5000 },
      ];
      const result = aggregateStepsByDate(records);
      expect(result).toHaveLength(1);
      // Both records are valid, 0 + 5000 = 5000
      expect(result[0].value).toBe(5000);
    });

    test('handles day with only 0 steps', () => {
      const records: HCStepsRecord[] = [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', count: 0 },
      ];
      const result = aggregateStepsByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(0);
    });
  });

  describe('error recovery', () => {
    test('continues processing after one record causes an error', () => {
      const badRecord = {
        startTime: { toString: () => { throw new Error('boom'); } },
        count: 5000,
      };
      const goodRecord: HCStepsRecord = {
        startTime: '2024-01-16T10:00:00Z',
        count: 6000,
      };
      const result = aggregateStepsByDate([badRecord as unknown as HCStepsRecord, goodRecord]);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-16');
    });
  });
});

describe('aggregateTotalCaloriesByDate', () => {
  describe('input validation', () => {
    test('returns empty array for empty input', async () => {
      const result = await aggregateTotalCaloriesByDate([]);
      expect(result).toEqual([]);
    });

  });

  describe('happy path', () => {
    test('returns single record with calorie value using inKilocalories', async () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inKilocalories: 500 } },
      ];
      const result = await aggregateTotalCaloriesByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ date: '2024-01-15', value: 500, type: 'total_calories' });
    });

    test('sums multiple records on the same day', async () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T08:00:00Z', energy: { inKilocalories: 500 } },
        { startTime: '2024-01-15T12:00:00Z', energy: { inKilocalories: 700 } },
        { startTime: '2024-01-15T18:00:00Z', energy: { inKilocalories: 300 } },
      ];
      const result = await aggregateTotalCaloriesByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(1500);
    });

    test('aggregates records across multiple days', async () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inKilocalories: 1500 } },
        { startTime: '2024-01-16T10:00:00Z', energy: { inKilocalories: 1800 } },
        { startTime: '2024-01-17T10:00:00Z', energy: { inKilocalories: 2000 } },
      ];
      const result = await aggregateTotalCaloriesByDate(records);
      expect(result).toHaveLength(3);
      expect(result.find(r => r.date === '2024-01-15')?.value).toBe(1500);
      expect(result.find(r => r.date === '2024-01-16')?.value).toBe(1800);
      expect(result.find(r => r.date === '2024-01-17')?.value).toBe(2000);
    });
  });

  describe('calorie normalization heuristic', () => {
    test('uses inKilocalories directly when available', async () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inKilocalories: 500 } },
      ];
      const result = await aggregateTotalCaloriesByDate(records);
      expect(result[0].value).toBe(500);
    });

    test('uses inCalories as-is when value < 10000 (assumes it is kcal)', async () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inCalories: 500 } },
      ];
      const result = await aggregateTotalCaloriesByDate(records);
      expect(result[0].value).toBe(500);
    });

    test('divides inCalories by 1000 when value > 10000 (assumes raw calories)', async () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inCalories: 500000 } },
      ];
      const result = await aggregateTotalCaloriesByDate(records);
      expect(result[0].value).toBe(500); // 500000 / 1000 = 500
    });

    test('value exactly at 10000 boundary is NOT divided (uses <= 10000)', async () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inCalories: 10000 } },
      ];
      const result = await aggregateTotalCaloriesByDate(records);
      expect(result[0].value).toBe(10000); // Not divided because it's not > 10000
    });

    test('value just above 10000 boundary IS divided', async () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inCalories: 10001 } },
      ];
      const result = await aggregateTotalCaloriesByDate(records);
      expect(result[0].value).toBe(10.001); // 10001 / 1000 = 10.001
    });

    test('prefers inKilocalories over inCalories when both present', async () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inKilocalories: 500, inCalories: 500000 } },
      ];
      const result = await aggregateTotalCaloriesByDate(records);
      expect(result[0].value).toBe(500); // Uses inKilocalories, ignores inCalories
    });
  });

  describe('date extraction', () => {
    test('uses endTime for date extraction when available', async () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-14T23:00:00Z', endTime: '2024-01-15T00:30:00Z', energy: { inKilocalories: 50 } },
      ];
      const result = await aggregateTotalCaloriesByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-15');
    });

    test('falls back to startTime when endTime is missing', async () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inKilocalories: 500 } },
      ];
      const result = await aggregateTotalCaloriesByDate(records);
      expect(result[0].date).toBe('2024-01-15');
    });
  });

  describe('edge cases', () => {
    test('skips records with missing energy object', async () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z' },
        { startTime: '2024-01-15T12:00:00Z', energy: { inKilocalories: 500 } },
      ] as unknown as HCEnergyRecord[];
      const result = await aggregateTotalCaloriesByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(500);
    });

    test('skips records with energy but no valid calorie fields', async () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', energy: {} },
        { startTime: '2024-01-15T12:00:00Z', energy: { inKilocalories: 500 } },
      ] as unknown as HCEnergyRecord[];
      const result = await aggregateTotalCaloriesByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(500);
    });

    test('skips records with missing startTime', async () => {
      const records = [
        { energy: { inKilocalories: 500 } },
        { startTime: '2024-01-15T12:00:00Z', energy: { inKilocalories: 600 } },
      ] as unknown as HCEnergyRecord[];
      const result = await aggregateTotalCaloriesByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(600);
    });
  });

  describe('error recovery', () => {
    test('continues processing after one record causes an error', async () => {
      const badRecord = {
        startTime: { toString: () => { throw new Error('boom'); } },
        energy: { inKilocalories: 500 },
      };
      const goodRecord: HCEnergyRecord = {
        startTime: '2024-01-16T10:00:00Z',
        energy: { inKilocalories: 600 },
      };
      const result = await aggregateTotalCaloriesByDate([badRecord as unknown as HCEnergyRecord, goodRecord]);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-16');
    });
  });
});

describe('aggregateActiveCaloriesByDate', () => {
  describe('input validation', () => {
    test('returns empty array for empty input', () => {
      expect(aggregateActiveCaloriesByDate([])).toEqual([]);
    });

  });

  describe('happy path', () => {
    test('returns single record with calorie value', () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inCalories: 500 } },
      ];
      const result = aggregateActiveCaloriesByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ date: '2024-01-15', value: 500, type: 'Active Calories' });
    });

    test('sums multiple records on the same day', () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T08:00:00Z', energy: { inCalories: 100 } },
        { startTime: '2024-01-15T12:00:00Z', energy: { inCalories: 200 } },
        { startTime: '2024-01-15T18:00:00Z', energy: { inCalories: 300 } },
      ];
      const result = aggregateActiveCaloriesByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(600);
    });

    test('aggregates records across multiple days', () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inCalories: 500 } },
        { startTime: '2024-01-16T10:00:00Z', energy: { inCalories: 600 } },
        { startTime: '2024-01-17T10:00:00Z', energy: { inCalories: 700 } },
      ];
      const result = aggregateActiveCaloriesByDate(records);
      expect(result).toHaveLength(3);
      expect(result.find(r => r.date === '2024-01-15')?.value).toBe(500);
      expect(result.find(r => r.date === '2024-01-16')?.value).toBe(600);
      expect(result.find(r => r.date === '2024-01-17')?.value).toBe(700);
    });
  });

  describe('calorie normalization heuristic', () => {
    test('uses inKilocalories directly when available', () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inCalories: 999, inKilocalories: 500 } },
      ];
      const result = aggregateActiveCaloriesByDate(records);
      expect(result[0].value).toBe(500); // Uses inKilocalories
    });

    test('uses inCalories as-is when value < 10000 (assumes it is kcal)', () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inCalories: 500 } },
      ];
      const result = aggregateActiveCaloriesByDate(records);
      expect(result[0].value).toBe(500);
    });

    test('divides inCalories by 1000 when value > 10000 (assumes raw calories)', () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inCalories: 500000 } },
      ];
      const result = aggregateActiveCaloriesByDate(records);
      expect(result[0].value).toBe(500); // 500000 / 1000 = 500
    });

    test('value exactly at 10000 boundary is NOT divided', () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inCalories: 10000 } },
      ];
      const result = aggregateActiveCaloriesByDate(records);
      expect(result[0].value).toBe(10000);
    });

    test('value just above 10000 boundary IS divided', () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T10:00:00Z', energy: { inCalories: 10001 } },
      ];
      const result = aggregateActiveCaloriesByDate(records);
      expect(result[0].value).toBe(10.001);
    });
  });

  describe('edge cases', () => {
    test('skips records with missing energy object', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z' },
        { startTime: '2024-01-15T12:00:00Z', energy: { inCalories: 500 } },
      ] as unknown as HCEnergyRecord[];
      const result = aggregateActiveCaloriesByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(500);
    });

    test('includes records with inKilocalories but no inCalories', () => {
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-15T08:00:00Z', energy: { inKilocalories: 500 } },
        { startTime: '2024-01-15T12:00:00Z', energy: { inCalories: 600 } },
      ];
      const result = aggregateActiveCaloriesByDate(records);
      // Both records should be included - filter accepts either inCalories or inKilocalories
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(1100); // 500 + 600
    });

    test('skips records with missing startTime', () => {
      const records = [
        { energy: { inCalories: 500 } },
        { startTime: '2024-01-15T12:00:00Z', energy: { inCalories: 600 } },
      ] as unknown as HCEnergyRecord[];
      const result = aggregateActiveCaloriesByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(600);
    });

    test('uses startTime for date (not endTime like steps/total calories)', () => {
      // Note: aggregateActiveCaloriesByDate uses startTime, not endTime
      const records: HCEnergyRecord[] = [
        { startTime: '2024-01-14T23:00:00Z', endTime: '2024-01-15T00:30:00Z', energy: { inCalories: 50 } },
      ];
      const result = aggregateActiveCaloriesByDate(records);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-14'); // Uses startTime
    });
  });

  describe('error recovery', () => {
    test('continues processing after one record causes an error', () => {
      const badRecord = {
        startTime: { toString: () => { throw new Error('boom'); } },
        energy: { inCalories: 500 },
      };
      const goodRecord: HCEnergyRecord = {
        startTime: '2024-01-16T10:00:00Z',
        energy: { inCalories: 600 },
      };
      const result = aggregateActiveCaloriesByDate([badRecord as unknown as HCEnergyRecord, goodRecord]);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-16');
    });
  });
});
