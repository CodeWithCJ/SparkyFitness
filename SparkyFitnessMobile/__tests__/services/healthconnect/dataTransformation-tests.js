jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

import { transformHealthRecords } from '../../../src/services/healthconnect/dataTransformation';
import { addLog } from '../../../src/services/LogService';

describe('transformHealthRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('input validation', () => {
    it('returns empty array for empty input', () => {
      const result = transformHealthRecords([], { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect(result).toEqual([]);
    });

    it('returns empty array for null input', () => {
      const result = transformHealthRecords(null, { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect(result).toEqual([]);
      expect(addLog).toHaveBeenCalledWith(
        expect.stringContaining('non-array'),
        'warn',
        'WARNING'
      );
    });

    it('returns empty array for undefined input', () => {
      const result = transformHealthRecords(undefined, { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect(result).toEqual([]);
      expect(addLog).toHaveBeenCalledWith(
        expect.stringContaining('non-array'),
        'warn',
        'WARNING'
      );
    });

    it('returns empty array for object input', () => {
      const result = transformHealthRecords({}, { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect(result).toEqual([]);
    });

    it('returns empty array for string input', () => {
      const result = transformHealthRecords('test', { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect(result).toEqual([]);
    });
  });

  describe('pre-aggregated records', () => {
    it('passes through Steps records with date and value already set', () => {
      const records = [
        { date: '2024-01-15', value: 5000, type: 'step' },
      ];
      const metricConfig = { recordType: 'Steps', unit: 'count', type: 'steps' };

      const result = transformHealthRecords(records, metricConfig);

      expect(result).toEqual([
        { date: '2024-01-15', value: 5000, type: 'step', unit: 'count' },
      ]);
    });

    it('passes through HeartRate records with date and value already set', () => {
      const records = [
        { date: '2024-01-15', value: 72 },
      ];
      const metricConfig = { recordType: 'HeartRate', unit: 'bpm', type: 'heart_rate' };

      const result = transformHealthRecords(records, metricConfig);

      expect(result).toEqual([
        { date: '2024-01-15', value: 72, type: 'heart_rate', unit: 'bpm' },
      ]);
    });

    it('passes through ActiveCaloriesBurned records preserving type', () => {
      const records = [
        { date: '2024-01-15', value: 350, type: 'Active Calories' },
      ];
      const metricConfig = { recordType: 'ActiveCaloriesBurned', unit: 'kcal', type: 'active_calories' };

      const result = transformHealthRecords(records, metricConfig);

      expect(result).toEqual([
        { date: '2024-01-15', value: 350, type: 'Active Calories', unit: 'kcal' },
      ]);
    });

    it('passes through TotalCaloriesBurned records preserving type', () => {
      const records = [
        { date: '2024-01-15', value: 2000, type: 'total_calories' },
      ];
      const metricConfig = { recordType: 'TotalCaloriesBurned', unit: 'kcal', type: 'total_cal' };

      const result = transformHealthRecords(records, metricConfig);

      expect(result).toEqual([
        { date: '2024-01-15', value: 2000, type: 'total_calories', unit: 'kcal' },
      ]);
    });
  });

  describe('simple extraction types', () => {
    it.each([
      ['Weight', { weight: { inKilograms: 75.5 }, time: '2024-01-15T10:00:00Z' }, 'kg', 'weight', 75.5],
      ['Height', { height: { inMeters: 1.78 }, time: '2024-01-15T10:00:00Z' }, 'm', 'height', 1.78],
      ['Distance', { distance: { inMeters: 5000 }, startTime: '2024-01-15T10:00:00Z' }, 'm', 'distance', 5000],
      ['RestingHeartRate', { beatsPerMinute: 62, time: '2024-01-15T10:00:00Z' }, 'bpm', 'resting_heart_rate', 62],
      ['Speed', { speed: { inMetersPerSecond: 3.5 }, startTime: '2024-01-15T10:00:00Z' }, 'm/s', 'speed', 3.5],
      ['Power', { power: { inWatts: 250 }, startTime: '2024-01-15T10:00:00Z' }, 'W', 'power', 250],
      ['Hydration', { volume: { inLiters: 0.5 }, startTime: '2024-01-15T10:00:00Z' }, 'L', 'hydration', 0.5],
      ['FloorsClimbed', { floors: 10, startTime: '2024-01-15T10:00:00Z' }, 'count', 'floors', 10],
      ['BodyTemperature', { temperature: { inCelsius: 36.8 }, time: '2024-01-15T10:00:00Z' }, 'C', 'body_temp', 36.8],
      ['BasalBodyTemperature', { temperature: { inCelsius: 36.5 }, time: '2024-01-15T10:00:00Z' }, 'C', 'basal_temp', 36.5],
      ['ElevationGained', { elevation: { inMeters: 150 }, startTime: '2024-01-15T10:00:00Z' }, 'm', 'elevation', 150],
      ['WheelchairPushes', { count: 500, startTime: '2024-01-15T10:00:00Z' }, 'count', 'wheelchair', 500],
    ])('%s extracts value correctly', (recordType, record, unit, type, expectedValue) => {
      const result = transformHealthRecords([record], { recordType, unit, type });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        value: expectedValue,
        type,
        date: '2024-01-15',
        unit,
      });
    });

    it('BoneMass extracts value from mass.inKilograms with time', () => {
      const record = { mass: { inKilograms: 3.2 }, time: '2024-01-15T10:00:00Z' };
      const metricConfig = { recordType: 'BoneMass', unit: 'kg', type: 'bone_mass' };

      const result = transformHealthRecords([record], metricConfig);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        value: 3.2,
        type: 'bone_mass',
        date: '2024-01-15',
        unit: 'kg',
      });
    });

    it('LeanBodyMass extracts value from mass.inKilograms with time', () => {
      const record = { mass: { inKilograms: 55.5 }, time: '2024-01-15T10:00:00Z' };
      const metricConfig = { recordType: 'LeanBodyMass', unit: 'kg', type: 'lean_mass' };

      const result = transformHealthRecords([record], metricConfig);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        value: 55.5,
        type: 'lean_mass',
        date: '2024-01-15',
        unit: 'kg',
      });
    });

    it('RespiratoryRate extracts value from rate with time', () => {
      const record = { rate: 16, time: '2024-01-15T10:00:00Z' };
      const metricConfig = { recordType: 'RespiratoryRate', unit: 'breaths/min', type: 'resp_rate' };

      const result = transformHealthRecords([record], metricConfig);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        value: 16,
        type: 'resp_rate',
        date: '2024-01-15',
        unit: 'breaths/min',
      });
    });

    it('IntermenstrualBleeding returns value of 1', () => {
      const record = { time: '2024-01-15T10:00:00Z' };
      const metricConfig = { recordType: 'IntermenstrualBleeding', unit: 'count', type: 'bleeding' };

      const result = transformHealthRecords([record], metricConfig);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        value: 1,
        type: 'bleeding',
        date: '2024-01-15',
        unit: 'count',
      });
    });
  });

  describe('value rounding', () => {
    it('rounds values to 2 decimal places', () => {
      const record = { weight: { inKilograms: 75.5678 }, time: '2024-01-15T10:00:00Z' };
      const metricConfig = { recordType: 'Weight', unit: 'kg', type: 'weight' };

      const result = transformHealthRecords([record], metricConfig);

      expect(result[0].value).toBe(75.57);
    });

    it('handles integer values without modification', () => {
      const record = { weight: { inKilograms: 75 }, time: '2024-01-15T10:00:00Z' };
      const metricConfig = { recordType: 'Weight', unit: 'kg', type: 'weight' };

      const result = transformHealthRecords([record], metricConfig);

      expect(result[0].value).toBe(75);
    });

    it('rounds up when third decimal is 5 or greater', () => {
      const record = { weight: { inKilograms: 75.125 }, time: '2024-01-15T10:00:00Z' };
      const metricConfig = { recordType: 'Weight', unit: 'kg', type: 'weight' };

      const result = transformHealthRecords([record], metricConfig);

      expect(result[0].value).toBe(75.13);
    });
  });

  describe('output format', () => {
    it('includes all required fields in output', () => {
      const record = { weight: { inKilograms: 75 }, time: '2024-01-15T10:00:00Z' };
      const metricConfig = { recordType: 'Weight', unit: 'kg', type: 'weight' };

      const result = transformHealthRecords([record], metricConfig);

      expect(result[0]).toHaveProperty('value');
      expect(result[0]).toHaveProperty('type');
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('unit');
      expect(Object.keys(result[0])).toHaveLength(4);
    });

    it('strips time portion from ISO datetime to get date', () => {
      const record = { weight: { inKilograms: 75 }, time: '2024-01-15T14:30:45.123Z' };
      const metricConfig = { recordType: 'Weight', unit: 'kg', type: 'weight' };

      const result = transformHealthRecords([record], metricConfig);

      expect(result[0].date).toBe('2024-01-15');
    });
  });

  describe('multiple records processing', () => {
    it('transforms multiple records of same type', () => {
      const records = [
        { weight: { inKilograms: 75 }, time: '2024-01-15T10:00:00Z' },
        { weight: { inKilograms: 74.5 }, time: '2024-01-16T10:00:00Z' },
        { weight: { inKilograms: 74 }, time: '2024-01-17T10:00:00Z' },
      ];
      const metricConfig = { recordType: 'Weight', unit: 'kg', type: 'weight' };

      const result = transformHealthRecords(records, metricConfig);

      expect(result).toHaveLength(3);
      expect(result.map(r => r.value)).toEqual([75, 74.5, 74]);
      expect(result.map(r => r.date)).toEqual(['2024-01-15', '2024-01-16', '2024-01-17']);
    });

    it('filters out invalid records while keeping valid ones', () => {
      const records = [
        { weight: { inKilograms: 75 }, time: '2024-01-15T10:00:00Z' },
        { weight: null, time: '2024-01-16T10:00:00Z' }, // Invalid - null weight
        { weight: { inKilograms: 74 }, time: '2024-01-17T10:00:00Z' },
      ];
      const metricConfig = { recordType: 'Weight', unit: 'kg', type: 'weight' };

      const result = transformHealthRecords(records, metricConfig);

      expect(result).toHaveLength(2);
      expect(result.map(r => r.date)).toEqual(['2024-01-15', '2024-01-17']);
    });
  });
});
