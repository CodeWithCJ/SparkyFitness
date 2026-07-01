import { transformHealthRecords, extractTimezoneMetadata, setOwnBundleId, mapDietarySample } from '../../../src/services/healthkit/dataTransformation';

import type { TransformOutput, TransformedRecord, TransformedExerciseSession, AggregatedSleepSession, TransformedNutritionEntry } from '../../../src/types/healthRecords';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

describe('transformHealthRecords', () => {
  describe('basic validation', () => {
    test('returns empty array for empty array input', () => {
      expect(transformHealthRecords([], { recordType: 'Steps', unit: 'count', type: 'step' })).toEqual([]);
    });
  });

  describe('pre-aggregated records', () => {
    test('passes through aggregated records unchanged', () => {
      const records = [
        { date: '2024-01-15', value: 5000, type: 'step' },
        { date: '2024-01-16', value: 6000, type: 'step' },
      ];
      const result = transformHealthRecords(records, { recordType: 'Steps', unit: 'count', type: 'step' });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ date: '2024-01-15', value: 5000, type: 'step' });
      expect(result[1]).toMatchObject({ date: '2024-01-16', value: 6000, type: 'step' });
    });

    test('preserves the record type if present', () => {
      const records = [{ date: '2024-01-15', value: 500, type: 'active_calories' }];
      const result = transformHealthRecords(records, { recordType: 'ActiveCalories', unit: 'kcal', type: 'calories' });

      expect((result[0] as TransformOutput & { type: string }).type).toBe('active_calories');
    });
  });

  describe('Weight records', () => {
    test('extracts value from record.weight.inKilograms', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', weight: { inKilograms: 75.5 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect(result).toHaveLength(1);
      expect((result[0] as TransformOutput & { value: number }).value).toBe(75.5);
      expect((result[0] as TransformOutput & { date: string }).date).toBe('2024-01-15');
    });

    test('skips record when weight data is missing', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', weight: null },
        { time: '2024-01-15T08:00:00Z' },
      ];
      const result = transformHealthRecords(records, { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect(result).toHaveLength(0);
    });

    test('rounds value to 2 decimal places', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', weight: { inKilograms: 75.5678 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect((result[0] as TransformOutput & { value: number }).value).toBe(75.57);
    });
  });

  describe('BloodPressure records', () => {
    test('splits into separate systolic and diastolic records', () => {
      const records = [
        {
          time: '2024-01-15T08:00:00Z',
          systolic: { inMillimetersOfMercury: 120.5 },
          diastolic: { inMillimetersOfMercury: 80.3 },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'BloodPressure', unit: 'mmHg', type: 'blood_pressure' });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ value: 120.5, type: 'blood_pressure_systolic', date: '2024-01-15' });
      expect(result[1]).toMatchObject({ value: 80.3, type: 'blood_pressure_diastolic', date: '2024-01-15' });
    });

    test('creates only systolic when diastolic missing', () => {
      const records = [
        {
          time: '2024-01-15T08:00:00Z',
          systolic: { inMillimetersOfMercury: 120 },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'BloodPressure', unit: 'mmHg', type: 'blood_pressure' });

      expect(result).toHaveLength(1);
      expect((result[0] as TransformOutput & { type: string }).type).toBe('blood_pressure_systolic');
    });

    test('creates only diastolic when systolic missing', () => {
      const records = [
        {
          time: '2024-01-15T08:00:00Z',
          diastolic: { inMillimetersOfMercury: 80 },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'BloodPressure', unit: 'mmHg', type: 'blood_pressure' });

      expect(result).toHaveLength(1);
      expect((result[0] as TransformOutput & { type: string }).type).toBe('blood_pressure_diastolic');
    });
  });

  describe('SleepSession records', () => {
    test('passes full rich object through with all fields preserved', () => {
      const records = [
        {
          type: 'SleepSession',
          source: 'HealthKit',
          timestamp: '2024-01-15T22:00:00Z',
          entry_date: '2024-01-16',
          bedtime: '2024-01-15T22:00:00Z',
          wake_time: '2024-01-16T06:00:00Z',
          duration_in_seconds: 28800,
          time_asleep_in_seconds: 27000,
          deep_sleep_seconds: 7200,
          light_sleep_seconds: 14400,
          rem_sleep_seconds: 5400,
          awake_sleep_seconds: 1800,
          stage_events: [{ stage_type: 'deep', start_time: '2024-01-15T22:00:00Z', end_time: '2024-01-16T00:00:00Z' }],
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'SleepSession', unit: '', type: 'sleep' });

      expect(result).toHaveLength(1);
      const sleepResult = result[0] as AggregatedSleepSession;
      expect(sleepResult.type).toBe('SleepSession');
      expect(sleepResult.source).toBe('HealthKit');
      expect(sleepResult.bedtime).toBe('2024-01-15T22:00:00Z');
      expect(sleepResult.wake_time).toBe('2024-01-16T06:00:00Z');
      expect(sleepResult.stage_events).toHaveLength(1);
    });
  });

  describe('BodyFat/OxygenSaturation (reads percentage directly)', () => {
    test('reads value from record.percentage.inPercent for BodyFat', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', percentage: { inPercent: 15.5 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'BodyFat', unit: '%', type: 'body_fat' });

      expect(result).toHaveLength(1);
      expect((result[0] as TransformOutput & { value: number }).value).toBe(15.5);
    });

    test('reads value from record.percentage.inPercent for OxygenSaturation', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', percentage: { inPercent: 98.5 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'OxygenSaturation', unit: '%', type: 'oxygen_saturation' });

      expect(result).toHaveLength(1);
      expect((result[0] as TransformOutput & { value: number }).value).toBe(98.5);
    });

    test('reads value from record.percentage.inPercent for BloodOxygenSaturation', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', percentage: { inPercent: 97.2 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'BloodOxygenSaturation', unit: '%', type: 'blood_oxygen_saturation' });

      expect(result).toHaveLength(1);
      expect((result[0] as TransformOutput & { value: number }).value).toBe(97.2);
    });

    test('converts decimal BloodOxygenSaturation values to percent', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', value: 0.972 },
      ];
      const result = transformHealthRecords(records, { recordType: 'BloodOxygenSaturation', unit: '%', type: 'blood_oxygen_saturation' });

      expect(result).toHaveLength(1);
      expect((result[0] as TransformOutput & { value: number }).value).toBe(97.2);
    });

    test('skips when percentage data missing', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', percentage: null },
        { time: '2024-01-15T08:00:00Z' },
      ];
      const result = transformHealthRecords(records, { recordType: 'BodyFat', unit: '%', type: 'body_fat' });

      expect(result).toHaveLength(0);
    });
  });

  describe('HeartRateVariabilitySDNN records', () => {
    test('extracts SDNN value from record.value with record.time date', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', value: 42 },
      ];
      const result = transformHealthRecords(records, { recordType: 'HeartRateVariabilitySDNN', unit: 'ms', type: 'HRV_SDNN' });

      expect(result).toHaveLength(1);
      expect((result[0] as TransformOutput & { value: number }).value).toBe(42);
      expect((result[0] as TransformOutput & { date: string }).date).toBe('2024-01-15');
      expect((result[0] as TransformOutput & { type: string }).type).toBe('HRV_SDNN');
    });

    test('skips record when value is missing', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z' },
      ];
      const result = transformHealthRecords(records, { recordType: 'HeartRateVariabilitySDNN', unit: 'ms', type: 'HRV_SDNN' });

      expect(result).toHaveLength(0);
    });
  });

  describe('percentage conversions (decimal to percentage)', () => {
    test('BloodAlcoholContent multiplies decimal by 100', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', value: 0.08 },
      ];
      const result = transformHealthRecords(records, { recordType: 'BloodAlcoholContent', unit: '%', type: 'blood_alcohol' });

      expect(result).toHaveLength(1);
      expect((result[0] as TransformOutput & { value: number }).value).toBe(8);
    });

    test('WalkingAsymmetryPercentage multiplies decimal by 100', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', value: 0.05 },
      ];
      const result = transformHealthRecords(records, { recordType: 'WalkingAsymmetryPercentage', unit: '%', type: 'walking_asymmetry' });

      expect(result).toHaveLength(1);
      expect((result[0] as TransformOutput & { value: number }).value).toBe(5);
    });

    test('WalkingDoubleSupportPercentage multiplies decimal by 100', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', value: 0.25 },
      ];
      const result = transformHealthRecords(records, { recordType: 'WalkingDoubleSupportPercentage', unit: '%', type: 'walking_double_support' });

      expect(result).toHaveLength(1);
      expect((result[0] as TransformOutput & { value: number }).value).toBe(25);
    });

    test('returns null when record.value is undefined', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z' },
      ];
      const result = transformHealthRecords(records, { recordType: 'BloodAlcoholContent', unit: '%', type: 'blood_alcohol' });

      expect(result).toHaveLength(0);
    });
  });

  describe('qualitative record types', () => {
    test('CervicalMucus passes numeric enum values through', () => {
      // HealthKit often uses numeric enums for qualitative types
      const records = [
        { startTime: '2024-01-15T08:00:00Z', value: 3 },
      ];
      const result = transformHealthRecords(records, { recordType: 'CervicalMucus', unit: '', type: 'cervical_mucus' });

      expect(result).toHaveLength(1);
      expect((result[0] as TransformOutput & { value: number }).value).toBe(3);
    });

    test('MenstruationFlow passes numeric enum values through', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', value: 2 },
      ];
      const result = transformHealthRecords(records, { recordType: 'MenstruationFlow', unit: '', type: 'menstruation_flow' });

      expect(result).toHaveLength(1);
      expect((result[0] as TransformOutput & { value: number }).value).toBe(2);
    });

    test('string values are filtered out by isNaN check', () => {
      // BUG: Code comments say it passes raw string values, but they get filtered by isNaN check
      const records = [
        { startTime: '2024-01-15T08:00:00Z', value: 'dry' },
      ];
      const result = transformHealthRecords(records, { recordType: 'CervicalMucus', unit: '', type: 'cervical_mucus' });

      expect(result).toHaveLength(0);
    });
  });

  describe('ExerciseSession/Workout records', () => {
    test('maps known activity code to name (37 -> Running)', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          activityType: 37,
          duration: 3600,
          totalEnergyBurned: 500,
          totalDistance: 5000,
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'Workout', unit: '', type: 'workout' });

      expect(result).toHaveLength(1);
      const workoutResult = result[0] as TransformedExerciseSession;
      expect(workoutResult.activityType).toBe('Running');
      expect(workoutResult.title).toBe('Running');
    });

    test('falls back to "Workout type {code}" for unknown codes', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          activityType: 999,
          duration: 3600,
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'Workout', unit: '', type: 'workout' });

      expect((result[0] as TransformedExerciseSession).activityType).toBe('Workout type 999');
    });

    test('falls back to "Workout Session" when no activityType field', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          duration: 3600,
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'Workout', unit: '', type: 'workout' });

      expect((result[0] as TransformedExerciseSession).activityType).toBe('Workout Session');
    });

    test('handles duration as object { quantity: 3600 }', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          activityType: 37,
          duration: { unit: 's', quantity: 3600 },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'Workout', unit: '', type: 'workout' });

      expect((result[0] as TransformedExerciseSession).duration).toBe(3600);
    });

    test('handles duration as raw number', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          activityType: 37,
          duration: 1800,
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'Workout', unit: '', type: 'workout' });

      expect((result[0] as TransformedExerciseSession).duration).toBe(1800);
    });

    test('extracts calories and converts distance to kilometers from record', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          activityType: 37,
          duration: 3600,
          totalEnergyBurned: 500,
          totalDistance: 5000,
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' });

      const exerciseResult = result[0] as TransformedExerciseSession;
      expect(exerciseResult.caloriesBurned).toBe(500);
      expect(exerciseResult.distance).toBe(5);
      expect(exerciseResult.type).toBe('ExerciseSession');
      expect(exerciseResult.source).toBe('HealthKit');
    });

    test('includes sets array with duration in minutes', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          activityType: 37,
          duration: 3600,
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'Workout', unit: '', type: 'workout' });

      expect((result[0] as TransformedExerciseSession).sets).toEqual([{ set_number: 1, set_type: 'Working Set', duration: 60 }]);
    });

    test('rounds non-even duration to nearest minute in sets', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T08:01:30Z',
          activityType: 37,
          duration: 90,
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'Workout', unit: '', type: 'workout' });

      expect((result[0] as TransformedExerciseSession).sets).toEqual([{ set_number: 1, set_type: 'Working Set', duration: 2 }]);
    });

    test('sends set with duration 0 when duration is missing', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          activityType: 37,
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'Workout', unit: '', type: 'workout' });

      expect((result[0] as TransformedExerciseSession).sets).toEqual([{ set_number: 1, set_type: 'Working Set', duration: 0 }]);
    });
  });

  describe('date extraction', () => {
    test('uses record.time for raw quantity samples (Weight)', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', weight: { inKilograms: 75 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect((result[0] as TransformOutput & { date: string }).date).toBe('2024-01-15');
    });

    test('uses record.startTime for session-type records (Distance)', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', distance: { inMeters: 1000 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'Distance', unit: 'm', type: 'distance' });

      expect((result[0] as TransformOutput & { date: string }).date).toBe('2024-01-15');
    });

    test('skips record when date extraction returns null', () => {
      const records = [
        { weight: { inKilograms: 75 } }, // No time field
      ];
      const result = transformHealthRecords(records, { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect(result).toHaveLength(0);
    });
  });

  describe('value filtering', () => {
    test('skips records with null value', () => {
      const records = [{ date: '2024-01-15', value: null, type: 'step' }];
      const result = transformHealthRecords(records, { recordType: 'Steps', unit: 'count', type: 'step' });

      expect(result).toHaveLength(0);
    });

    test('skips records with undefined value', () => {
      const records = [{ date: '2024-01-15', value: undefined, type: 'step' }];
      const result = transformHealthRecords(records, { recordType: 'Steps', unit: 'count', type: 'step' });

      expect(result).toHaveLength(0);
    });

    test('skips records with NaN value', () => {
      const records = [{ date: '2024-01-15', value: NaN, type: 'step' }];
      const result = transformHealthRecords(records, { recordType: 'Steps', unit: 'count', type: 'step' });

      expect(result).toHaveLength(0);
    });
  });

  describe('error resilience', () => {
    test('continues processing when one record throws', () => {
      // Create a record that will cause an error when toFixed is called on it
      const badRecord = {
        date: '2024-01-15',
        value: { toString: () => { throw new Error('boom'); } },
        type: 'step',
      };
      const goodRecord = { date: '2024-01-16', value: 5000, type: 'step' };

      const result = transformHealthRecords([badRecord, goodRecord], { recordType: 'Steps', unit: 'count', type: 'step' });

      // Should still return the good record
      expect(result).toHaveLength(1);
      expect((result[0] as TransformOutput & { date: string }).date).toBe('2024-01-16');
    });
  });

  describe('timezone metadata', () => {
    test('value transformer includes record_timezone when metadata.HKTimeZone present', () => {
      const records = [
        {
          time: '2024-01-15T08:00:00Z',
          weight: { inKilograms: 75.5 },
          metadata: { HKTimeZone: 'America/New_York' },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'Weight', unit: 'kg', type: 'weight' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].record_timezone).toBe('America/New_York');
      expect(result[0].record_utc_offset_minutes).toBeUndefined();
    });

    test('value transformer omits timezone metadata when metadata absent', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', weight: { inKilograms: 75.5 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'Weight', unit: 'kg', type: 'weight' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].record_timezone).toBeUndefined();
      expect(result[0].record_utc_offset_minutes).toBeUndefined();
    });

    test('value transformer omits timezone when metadata exists but HKTimeZone absent', () => {
      const records = [
        {
          time: '2024-01-15T08:00:00Z',
          weight: { inKilograms: 75.5 },
          metadata: { someOtherKey: 'value' },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'Weight', unit: 'kg', type: 'weight' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].record_timezone).toBeUndefined();
    });

    test('pre-aggregated records do not extract timezone from HKTimeZone metadata', () => {
      const records = [
        { date: '2024-01-15', value: 5000, type: 'step', metadata: { HKTimeZone: 'Asia/Tokyo' } },
      ];
      const result = transformHealthRecords(records, { recordType: 'Steps', unit: 'count', type: 'step' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].record_timezone).toBeUndefined();
    });

    test('pre-aggregated records forward record_timezone when present', () => {
      const records = [
        { value: 5000, date: '2024-01-15', type: 'step', record_timezone: 'America/New_York' },
        { value: 2500, date: '2024-01-16', type: 'step', record_utc_offset_minutes: 540 },
        { value: 1000, date: '2024-01-17', type: 'step' },
      ];
      const result = transformHealthRecords(records, { recordType: 'Steps', unit: 'count', type: 'step' }) as TransformedRecord[];

      expect(result).toHaveLength(3);
      expect(result[0].record_timezone).toBe('America/New_York');
      expect(result[0].record_utc_offset_minutes).toBeUndefined();
      expect(result[1].record_utc_offset_minutes).toBe(540);
      expect(result[1].record_timezone).toBeUndefined();
      expect(result[2].record_timezone).toBeUndefined();
      expect(result[2].record_utc_offset_minutes).toBeUndefined();
    });

    test('Workout includes record_timezone from metadata.HKTimeZone', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          activityType: 37,
          duration: 3600,
          totalEnergyBurned: 500,
          totalDistance: 5000,
          metadata: { HKTimeZone: 'Asia/Tokyo' },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'Workout', unit: '', type: 'workout' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0].record_timezone).toBe('Asia/Tokyo');
    });

    test('Workout falls back to device timezone when metadata.HKTimeZone absent', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          activityType: 37,
          duration: 3600,
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'Workout', unit: '', type: 'workout' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      // Should fall back to device timezone (an IANA string)
      expect(result[0].record_timezone).toBeDefined();
      expect(typeof result[0].record_timezone).toBe('string');
    });

    test('ExerciseSession includes record_timezone (uses same transformer as Workout)', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          activityType: 37,
          duration: 3600,
          metadata: { HKTimeZone: 'America/Chicago' },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0].record_timezone).toBe('America/Chicago');
    });

    test('SleepSession preserves record_timezone from aggregated input', () => {
      const records = [
        {
          type: 'SleepSession',
          source: 'HealthKit',
          timestamp: '2024-01-15T22:00:00Z',
          entry_date: '2024-01-16',
          bedtime: '2024-01-15T22:00:00Z',
          wake_time: '2024-01-16T06:00:00Z',
          duration_in_seconds: 28800,
          time_asleep_in_seconds: 27000,
          deep_sleep_seconds: 7200,
          light_sleep_seconds: 14400,
          rem_sleep_seconds: 5400,
          awake_sleep_seconds: 1800,
          stage_events: [],
          record_timezone: 'America/New_York',
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'SleepSession', unit: '', type: 'sleep' }) as AggregatedSleepSession[];

      expect(result).toHaveLength(1);
      expect(result[0].record_timezone).toBe('America/New_York');
    });

    test('SleepSession preserves record_utc_offset_minutes from aggregated input', () => {
      const records = [
        {
          type: 'SleepSession',
          source: 'HealthKit',
          timestamp: '2024-01-15T22:00:00Z',
          entry_date: '2024-01-16',
          bedtime: '2024-01-15T22:00:00Z',
          wake_time: '2024-01-16T06:00:00Z',
          duration_in_seconds: 28800,
          time_asleep_in_seconds: 27000,
          deep_sleep_seconds: 7200,
          light_sleep_seconds: 14400,
          rem_sleep_seconds: 5400,
          awake_sleep_seconds: 1800,
          stage_events: [],
          record_utc_offset_minutes: -300,
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'SleepSession', unit: '', type: 'sleep' }) as AggregatedSleepSession[];

      expect(result).toHaveLength(1);
      expect(result[0].record_utc_offset_minutes).toBe(-300);
    });

    test('SleepSession omits timezone when not present on aggregated input', () => {
      const records = [
        {
          type: 'SleepSession',
          source: 'HealthKit',
          timestamp: '2024-01-15T22:00:00Z',
          entry_date: '2024-01-16',
          bedtime: '2024-01-15T22:00:00Z',
          wake_time: '2024-01-16T06:00:00Z',
          duration_in_seconds: 28800,
          time_asleep_in_seconds: 27000,
          deep_sleep_seconds: 7200,
          light_sleep_seconds: 14400,
          rem_sleep_seconds: 5400,
          awake_sleep_seconds: 1800,
          stage_events: [],
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'SleepSession', unit: '', type: 'sleep' }) as AggregatedSleepSession[];

      expect(result).toHaveLength(1);
      expect(result[0].record_timezone).toBeUndefined();
      expect(result[0].record_utc_offset_minutes).toBeUndefined();
    });
  });
});

describe('extractTimezoneMetadata', () => {
  test('extracts IANA timezone from metadata.HKTimeZone', () => {
    const rec = { metadata: { HKTimeZone: 'America/Chicago' } };
    expect(extractTimezoneMetadata(rec)).toEqual({ record_timezone: 'America/Chicago' });
  });

  test('returns empty object when no metadata', () => {
    expect(extractTimezoneMetadata({})).toEqual({});
  });

  test('returns empty object when metadata has no HKTimeZone', () => {
    const rec = { metadata: { otherKey: 'value' } };
    expect(extractTimezoneMetadata(rec)).toEqual({});
  });

  test('returns empty object when metadata is null', () => {
    const rec = { metadata: null };
    expect(extractTimezoneMetadata(rec as unknown as Record<string, unknown>)).toEqual({});
  });
});

describe('own-app exclusion (writeback feedback-loop guard)', () => {
  // ownBundleId is module-level state; reset it so it doesn't leak into other tests.
  afterEach(() => setOwnBundleId(null));

  test('skips dietary nutrient samples this app wrote, keeps external ones', () => {
    setOwnBundleId('com.sparky.app');
    const records = [
      { startTime: '2024-01-15T08:00:00Z', value: 12, sourceBundleId: 'com.sparky.app' }, // ours
      { startTime: '2024-01-15T12:00:00Z', value: 20, sourceBundleId: 'com.other.app' }, // external
    ];
    const result = transformHealthRecords(records, { recordType: 'DietaryProtein', unit: 'g', type: 'protein' });
    expect(result).toHaveLength(1);
    expect((result[0] as TransformOutput & { value: number }).value).toBe(20);
  });

  test('applies the guard to every dietary read type', () => {
    setOwnBundleId('com.sparky.app');
    const own = [{ startTime: '2024-01-15T08:00:00Z', value: 5, sourceBundleId: 'com.sparky.app' }];
    for (const recordType of ['DietaryFatTotal', 'DietaryProtein', 'DietarySodium']) {
      const result = transformHealthRecords(own, { recordType, unit: 'g', type: 'nutrient' });
      expect(result).toHaveLength(0);
    }
  });

  test('skips own Hydration samples but keeps external ones', () => {
    setOwnBundleId('com.sparky.app');
    const records = [
      { startTime: '2024-01-15T08:00:00Z', volume: { inLiters: 0.5 }, sourceBundleId: 'com.sparky.app' },
      { startTime: '2024-01-15T12:00:00Z', volume: { inLiters: 0.25 }, sourceBundleId: 'com.other.app' },
    ];
    const result = transformHealthRecords(records, { recordType: 'Hydration', unit: 'ml', type: 'water' });
    expect(result).toHaveLength(1);
    expect((result[0] as TransformOutput & { value: number }).value).toBe(250);
  });

  test('keeps own dietary samples when no own bundle id is set', () => {
    const records = [{ startTime: '2024-01-15T08:00:00Z', value: 12, sourceBundleId: 'com.sparky.app' }];
    const result = transformHealthRecords(records, { recordType: 'DietaryProtein', unit: 'g', type: 'protein' });
    expect(result).toHaveLength(1);
  });
});

describe('mapDietarySample (dietary reverse mapper)', () => {
  test('maps protein in grams to the protein column unchanged', () => {
    expect(mapDietarySample({ quantityType: 'HKQuantityTypeIdentifierDietaryProtein', quantity: 12, unit: 'g' }))
      .toEqual({ column: 'protein', value: 12 });
  });

  test('maps energy in kcal to the calories column', () => {
    expect(mapDietarySample({ quantityType: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', quantity: 200, unit: 'kcal' }))
      .toEqual({ column: 'calories', value: 200 });
  });

  test('treats Cal (food Calorie) as kcal — the unit MFP/Cronometer return', () => {
    expect(mapDietarySample({ quantityType: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', quantity: 500, unit: 'Cal' }))
      .toEqual({ column: 'calories', value: 500 });
  });

  test('treats lowercase cal as the small calorie (1/1000 kcal)', () => {
    expect(mapDietarySample({ quantityType: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', quantity: 1000, unit: 'cal' }))
      .toEqual({ column: 'calories', value: 1 });
  });

  test('converts kJ energy to kcal', () => {
    const result = mapDietarySample({ quantityType: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', quantity: 1000, unit: 'kJ' });
    expect(result?.column).toBe('calories');
    expect(result?.value).toBeCloseTo(239.006, 2);
  });

  test('converts ounces of a macro to grams', () => {
    const result = mapDietarySample({ quantityType: 'HKQuantityTypeIdentifierDietaryProtein', quantity: 1, unit: 'oz' });
    expect(result?.column).toBe('protein');
    expect(result?.value).toBeCloseTo(28.3495, 3);
  });

  test('keeps mg-stored micros in mg when returned in mg', () => {
    expect(mapDietarySample({ quantityType: 'HKQuantityTypeIdentifierDietarySodium', quantity: 500, unit: 'mg' }))
      .toEqual({ column: 'sodium', value: 500 });
  });

  test('converts grams of a mg-stored micro to mg', () => {
    expect(mapDietarySample({ quantityType: 'HKQuantityTypeIdentifierDietarySodium', quantity: 0.5, unit: 'g' }))
      .toEqual({ column: 'sodium', value: 500 });
  });

  test('maps vitamin A in mcg to the mcg-stored column unchanged', () => {
    expect(mapDietarySample({ quantityType: 'HKQuantityTypeIdentifierDietaryVitaminA', quantity: 120, unit: 'mcg' }))
      .toEqual({ column: 'vitamin_a', value: 120 });
  });

  test('returns null for an unknown unit (never guesses a conversion)', () => {
    expect(mapDietarySample({ quantityType: 'HKQuantityTypeIdentifierDietaryProtein', quantity: 10, unit: 'banana' })).toBeNull();
  });

  test('omits non-positive values', () => {
    expect(mapDietarySample({ quantityType: 'HKQuantityTypeIdentifierDietaryProtein', quantity: 0, unit: 'g' })).toBeNull();
    expect(mapDietarySample({ quantityType: 'HKQuantityTypeIdentifierDietaryProtein', quantity: -5, unit: 'g' })).toBeNull();
  });

  test('returns null for identifiers Sparky does not store (trans fat, water)', () => {
    expect(mapDietarySample({ quantityType: 'HKQuantityTypeIdentifierDietaryFatTrans', quantity: 5, unit: 'g' })).toBeNull();
    expect(mapDietarySample({ quantityType: 'HKQuantityTypeIdentifierDietaryWater', quantity: 250, unit: 'mL' })).toBeNull();
  });
});

describe('Nutrition correlation transformer', () => {
  afterEach(() => setOwnBundleId(null));

  const NUTRITION_CONFIG = { recordType: 'Nutrition', unit: 'kcal', type: 'nutrition' };

  // Mirrors the normalized record the index.ts correlation handler emits. Local-time
  // startDate (no 'Z') keeps the meal-of-day heuristic deterministic across timezones.
  const normalizedCorrelation = (overrides: Record<string, unknown> = {}) => ({
    uuid: 'corr-1',
    startDate: '2024-01-15T08:00:00',
    metadataFoodType: 'Greek Yogurt',
    sourceBundleId: 'com.other.app',
    metadata: { HKTimeZone: 'America/New_York' },
    objects: [
      { quantityType: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', quantity: 150, unit: 'kcal' },
      { quantityType: 'HKQuantityTypeIdentifierDietaryProtein', quantity: 12, unit: 'g' },
      { quantityType: 'HKQuantityTypeIdentifierDietarySodium', quantity: 200, unit: 'mg' },
    ],
    ...overrides,
  });

  test('folds a correlation into a HealthKit nutrition entry', () => {
    const result = transformHealthRecords([normalizedCorrelation()], NUTRITION_CONFIG) as TransformedNutritionEntry[];
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'Nutrition',
      source: 'HealthKit',
      source_id: 'corr-1',
      timestamp: '2024-01-15T08:00:00',
      food_name: 'Greek Yogurt',
      calories: 150,
      protein: 12,
      sodium: 200,
      record_timezone: 'America/New_York',
    });
  });

  test('infers meal type from the local hour', () => {
    const mealAt = (time: string) =>
      (transformHealthRecords([normalizedCorrelation({ startDate: `2024-01-15T${time}` })], NUTRITION_CONFIG)[0] as TransformedNutritionEntry).meal_type;
    expect(mealAt('08:00:00')).toBe('breakfast');
    expect(mealAt('12:30:00')).toBe('lunch');
    expect(mealAt('19:00:00')).toBe('dinner');
    expect(mealAt('23:00:00')).toBe('snacks');
    expect(mealAt('15:30:00')).toBe('snacks');
  });

  test('falls back to "Apple Health food" when the correlation has no food type', () => {
    const result = transformHealthRecords([normalizedCorrelation({ metadataFoodType: undefined })], NUTRITION_CONFIG) as TransformedNutritionEntry[];
    expect(result[0].food_name).toBe('Apple Health food');
  });

  test('skips correlations this app wrote (own-record guard)', () => {
    setOwnBundleId('com.sparky.app');
    const result = transformHealthRecords([normalizedCorrelation({ sourceBundleId: 'com.sparky.app' })], NUTRITION_CONFIG);
    expect(result).toHaveLength(0);
  });

  test('skips correlations without a uuid (no idempotency key)', () => {
    const result = transformHealthRecords([normalizedCorrelation({ uuid: undefined })], NUTRITION_CONFIG);
    expect(result).toHaveLength(0);
  });

  test('skips category objects but keeps quantity nutrients', () => {
    const result = transformHealthRecords([normalizedCorrelation({
      objects: [
        { value: 1 }, // CategorySample — no quantityType
        { quantityType: 'HKQuantityTypeIdentifierDietaryProtein', quantity: 8, unit: 'g' },
      ],
    })], NUTRITION_CONFIG) as TransformedNutritionEntry[];
    expect(result).toHaveLength(1);
    expect(result[0].protein).toBe(8);
    expect(result[0].calories).toBeUndefined();
  });

  test('drops a correlation with no objects', () => {
    const result = transformHealthRecords([normalizedCorrelation({ objects: [] })], NUTRITION_CONFIG);
    expect(result).toHaveLength(0);
  });

  test('drops a correlation whose objects yield no recognized nutrients', () => {
    const result = transformHealthRecords([normalizedCorrelation({
      objects: [{ quantityType: 'HKQuantityTypeIdentifierDietaryWater', quantity: 250, unit: 'mL' }],
    })], NUTRITION_CONFIG);
    expect(result).toHaveLength(0);
  });

  test('omits timezone metadata when the correlation carries none', () => {
    const result = transformHealthRecords([normalizedCorrelation({ metadata: undefined })], NUTRITION_CONFIG) as TransformedNutritionEntry[];
    expect(result).toHaveLength(1);
    expect(result[0].record_timezone).toBeUndefined();
  });
});
