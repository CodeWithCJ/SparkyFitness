import { transformHealthRecords, extractTimezoneMetadata } from '../../../src/services/healthkit/dataTransformation';

import type { TransformOutput, TransformedRecord, TransformedExerciseSession, AggregatedSleepSession } from '../../../src/types/healthRecords';

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
