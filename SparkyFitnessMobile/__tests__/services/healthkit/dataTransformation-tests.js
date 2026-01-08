jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

import { transformHealthRecords } from '../../../src/services/healthkit/dataTransformation';

describe('transformHealthRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('input validation', () => {
    it('returns empty array for empty input', () => {
      const result = transformHealthRecords([], { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect(result).toEqual([]);
    });

    it('returns empty array for non-array input', () => {
      const result = transformHealthRecords(null, { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect(result).toEqual([]);
    });
  });

  describe('pre-aggregated records', () => {
    it('passes through records with date and value already set', () => {
      const records = [
        { date: '2024-01-15', value: 5000, type: 'step' },
      ];
      const metricConfig = { recordType: 'Steps', unit: 'count', type: 'steps' };

      const result = transformHealthRecords(records, metricConfig);

      expect(result).toEqual([
        { date: '2024-01-15', value: 5000, type: 'step', unit: 'count' },
      ]);
    });
  });

  describe('simple value transformations', () => {
    it.each([
      ['Weight', { weight: { inKilograms: 75.5 }, time: '2024-01-15T10:00:00Z' }, 'kg', 'weight', 75.5],
      ['BodyFat', { percentage: { inPercent: 18.3 }, time: '2024-01-15T10:00:00Z' }, '%', 'body_fat', 18.3],
      ['Distance', { distance: { inMeters: 1500.75 }, startTime: '2024-01-15T10:00:00Z' }, 'm', 'distance', 1500.75],
      ['RestingHeartRate', { beatsPerMinute: 62, time: '2024-01-15T10:00:00Z' }, 'bpm', 'resting_heart_rate', 62],
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
  });

  describe('percentage conversion types', () => {
    it.each([
      ['BloodAlcoholContent', 0.08, 8],
      ['WalkingAsymmetryPercentage', 0.05, 5],
      ['WalkingDoubleSupportPercentage', 0.25, 25],
    ])('%s multiplies decimal by 100', (recordType, inputValue, expectedValue) => {
      const record = { value: inputValue, startTime: '2024-01-15T10:00:00Z' };

      const result = transformHealthRecords([record], { recordType, unit: '%', type: recordType.toLowerCase() });

      expect(result[0].value).toBe(expectedValue);
    });
  });

  describe('BloodPressure', () => {
    it('produces separate systolic and diastolic records', () => {
      const record = {
        time: '2024-01-15T10:00:00Z',
        systolic: { inMillimetersOfMercury: 120.456 },
        diastolic: { inMillimetersOfMercury: 80.789 },
      };
      const metricConfig = { recordType: 'BloodPressure', unit: 'mmHg', type: 'blood_pressure' };

      const result = transformHealthRecords([record], metricConfig);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({
        value: 120.46,
        unit: 'mmHg',
        date: '2024-01-15',
        type: 'blood_pressure_systolic',
      });
      expect(result).toContainEqual({
        value: 80.79,
        unit: 'mmHg',
        date: '2024-01-15',
        type: 'blood_pressure_diastolic',
      });
    });
  });

  describe('Workout', () => {
    it('transforms workout with activity type mapping', () => {
      const record = {
        startTime: '2024-01-15T08:00:00Z',
        endTime: '2024-01-15T09:00:00Z',
        activityType: 37, // Running
        duration: 3600,
        totalEnergyBurned: 500,
        totalDistance: 5000,
      };
      const metricConfig = { recordType: 'Workout', unit: 'session', type: 'workout' };

      const result = transformHealthRecords([record], metricConfig);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'ExerciseSession',
        source: 'HealthKit',
        date: '2024-01-15',
        activityType: 'Running',
        title: 'Running',
        duration: 3600,
        caloriesBurned: 500,
        distance: 5000,
      });
    });

    it('handles duration as object with quantity', () => {
      const record = {
        startTime: '2024-01-15T08:00:00Z',
        endTime: '2024-01-15T08:30:00Z',
        activityType: 57, // Yoga
        duration: { unit: 's', quantity: 1800 },
      };
      const metricConfig = { recordType: 'Workout', unit: 'session', type: 'workout' };

      const result = transformHealthRecords([record], metricConfig);

      expect(result[0].duration).toBe(1800);
      expect(result[0].activityType).toBe('Yoga');
    });
  });
});
