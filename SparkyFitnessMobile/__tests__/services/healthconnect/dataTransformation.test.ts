import { transformHealthRecords } from '../../../src/services/healthconnect/dataTransformation';
import { toLocalDateString } from '../../../src/services/healthconnect/dataAggregation';
import type {
  TransformedRecord,
  AggregatedSleepSession,
  TransformedExerciseSession,
} from '../../../src/types/healthRecords';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

describe('transformHealthRecords', () => {
  describe('basic validation', () => {
    test('returns empty array for empty array input', () => {
      expect(transformHealthRecords([], { recordType: 'Steps', unit: 'count', type: 'step' })).toEqual([]);
    });
  });

  describe('pre-aggregated records passthrough', () => {
    test('passes through Steps records with {date, value, type} unchanged', () => {
      const records = [
        { date: '2024-01-15', value: 5000, type: 'step' },
        { date: '2024-01-16', value: 6000, type: 'step' },
      ];
      const result = transformHealthRecords(records, { recordType: 'Steps', unit: 'count', type: 'step' });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ date: '2024-01-15', value: 5000, type: 'step' });
      expect(result[1]).toMatchObject({ date: '2024-01-16', value: 6000, type: 'step' });
    });

    test('passes through HeartRate aggregated records', () => {
      const records = [
        { date: '2024-01-15', value: 72, type: 'heart_rate' },
      ];
      const result = transformHealthRecords(records, { recordType: 'HeartRate', unit: 'bpm', type: 'heart_rate' });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ date: '2024-01-15', value: 72, type: 'heart_rate' });
    });

    test('passes through ActiveCaloriesBurned aggregated records', () => {
      const records = [
        { date: '2024-01-15', value: 500, type: 'Active Calories' },
      ];
      const result = transformHealthRecords(records, { recordType: 'ActiveCaloriesBurned', unit: 'kcal', type: 'active_calories' });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('Active Calories'); // Preserves original type
    });

    test('passes through TotalCaloriesBurned aggregated records', () => {
      const records = [
        { date: '2024-01-15', value: 2000, type: 'total_calories' },
      ];
      const result = transformHealthRecords(records, { recordType: 'TotalCaloriesBurned', unit: 'kcal', type: 'total_calories' });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('total_calories');
    });

    test('preserves the original type field from aggregated records', () => {
      const records = [{ date: '2024-01-15', value: 500, type: 'custom_type' }];
      const result = transformHealthRecords(records, { recordType: 'Steps', unit: 'count', type: 'step' });

      expect(result[0].type).toBe('custom_type');
    });
  });

  describe('Weight records', () => {
    test('extracts value from record.weight.inKilograms', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', weight: { inKilograms: 75.5 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'Weight', unit: 'kg', type: 'weight' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(75.5);
      expect(result[0].date).toBe('2024-01-15');
      expect(result[0].type).toBe('weight');
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
      const result = transformHealthRecords(records, { recordType: 'Weight', unit: 'kg', type: 'weight' }) as TransformedRecord[];

      expect(result[0].value).toBe(75.57);
    });
  });

  describe('Height records', () => {
    test('extracts value from record.height.inMeters', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', height: { inMeters: 1.75 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'Height', unit: 'm', type: 'height' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(1.75);
      expect(result[0].date).toBe('2024-01-15');
    });

    test('skips when height data is missing', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z' },
      ];
      const result = transformHealthRecords(records, { recordType: 'Height', unit: 'm', type: 'height' });

      expect(result).toHaveLength(0);
    });
  });

  describe('Distance records', () => {
    test('extracts value from record.distance.inMeters', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', distance: { inMeters: 5000 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'Distance', unit: 'm', type: 'distance' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(5000);
      expect(result[0].date).toBe('2024-01-15');
    });

    test('skips when distance data is missing', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z' },
      ];
      const result = transformHealthRecords(records, { recordType: 'Distance', unit: 'm', type: 'distance' });

      expect(result).toHaveLength(0);
    });
  });

  describe('FloorsClimbed records', () => {
    test('extracts value from record.floors', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', floors: 10 },
      ];
      const result = transformHealthRecords(records, { recordType: 'FloorsClimbed', unit: 'floors', type: 'floors' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(10);
      expect(result[0].date).toBe('2024-01-15');
    });

    test('skips when floors is not a number', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', floors: 'not a number' },
      ];
      const result = transformHealthRecords(records, { recordType: 'FloorsClimbed', unit: 'floors', type: 'floors' });

      expect(result).toHaveLength(0);
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
      expect(result[0].type).toBe('blood_pressure_systolic');
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
      expect(result[0].type).toBe('blood_pressure_diastolic');
    });

    test('skips when no time field present', () => {
      const records = [
        {
          systolic: { inMillimetersOfMercury: 120 },
          diastolic: { inMillimetersOfMercury: 80 },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'BloodPressure', unit: 'mmHg', type: 'blood_pressure' });

      expect(result).toHaveLength(0);
    });
  });

  describe('SleepSession records', () => {
    test('creates rich sleep object with all required fields', () => {
      const records = [
        {
          startTime: '2024-01-15T22:00:00Z',
          endTime: '2024-01-16T06:00:00Z',
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'SleepSession', unit: '', type: 'sleep' }) as AggregatedSleepSession[];

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'SleepSession',
        source: 'Health Connect',
        bedtime: '2024-01-15T22:00:00Z',
        wake_time: '2024-01-16T06:00:00Z',
        duration_in_seconds: 28800, // 8 hours
        time_asleep_in_seconds: 28800,
      });
    });

    test('calculates duration correctly', () => {
      const records = [
        {
          startTime: '2024-01-15T22:00:00Z',
          endTime: '2024-01-15T23:30:00Z', // 1.5 hours
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'SleepSession', unit: '', type: 'sleep' }) as AggregatedSleepSession[];

      expect(result[0].duration_in_seconds).toBe(5400); // 1.5 hours in seconds
    });

    test('skips when startTime or endTime is missing', () => {
      const records = [
        { startTime: '2024-01-15T22:00:00Z' },
        { endTime: '2024-01-16T06:00:00Z' },
      ];
      const result = transformHealthRecords(records, { recordType: 'SleepSession', unit: '', type: 'sleep' });

      expect(result).toHaveLength(0);
    });

    test('skips when dates are invalid', () => {
      const records = [
        { startTime: 'invalid', endTime: '2024-01-16T06:00:00Z' },
      ];
      const result = transformHealthRecords(records, { recordType: 'SleepSession', unit: '', type: 'sleep' });

      expect(result).toHaveLength(0);
    });
  });

  describe('ExerciseSession records', () => {
    test('creates rich exercise object with mapped activity type', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8, // Running
          title: 'Morning Run',
          notes: 'Felt great!',
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'ExerciseSession',
        source: 'Health Connect',
        activityType: 'Running',
        title: 'Morning Run',
        duration: 3600,
        notes: 'Felt great!',
      });
    });

    test('maps known exercise type codes to names', () => {
      const exerciseTypes = [
        { code: 1, name: 'Biking' },
        { code: 8, name: 'Running' },
        { code: 79, name: 'Walking' },
        { code: 37, name: 'Hiking' },
        { code: 84, name: 'Strength Training' },
        { code: 87, name: 'Yoga' },
      ];

      exerciseTypes.forEach(({ code, name }) => {
        const records = [
          { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', exerciseType: code },
        ];
        const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];
        expect(result[0].activityType).toBe(name);
      });
    });

    test('falls back to "Exercise Type {code}" for unknown codes', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', exerciseType: 999 },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result[0].activityType).toBe('Exercise Type 999');
    });

    test('falls back to "Exercise Session" when no exerciseType field', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z' },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result[0].activityType).toBe('Exercise Session');
    });

    test('uses activityType as title when no explicit title', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', endTime: '2024-01-15T09:00:00Z', exerciseType: 8 },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result[0].title).toBe('Running');
    });

    test('skips when startTime or endTime is missing', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', exerciseType: 8 },
        { endTime: '2024-01-15T09:00:00Z', exerciseType: 8 },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' });

      expect(result).toHaveLength(0);
    });

    test('extracts caloriesBurned from energy.inKilocalories', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8,
          energy: { inKilocalories: 350.5 },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0].caloriesBurned).toBe(350.5);
    });

    test('extracts caloriesBurned from energy.inCalories and converts to kcal', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8,
          energy: { inCalories: 250000 }, // 250 kcal
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0].caloriesBurned).toBe(250);
    });

    test('defaults caloriesBurned to 0 when energy is missing', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8,
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0].caloriesBurned).toBe(0);
    });

    test('defaults caloriesBurned to 0 when energy values are null', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8,
          energy: { inKilocalories: null, inCalories: null },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0].caloriesBurned).toBe(0);
    });

    test('defaults caloriesBurned to 0 when energy value is NaN', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8,
          energy: { inKilocalories: NaN },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0].caloriesBurned).toBe(0);
    });

    test('extracts distance from distance.inMeters', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8,
          distance: { inMeters: 5000.75 },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0].distance).toBe(5000.75);
    });

    test('defaults distance to 0 when distance is missing', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8,
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0].distance).toBe(0);
    });

    test('defaults distance to 0 when distance.inMeters is null', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8,
          distance: { inMeters: null },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0].distance).toBe(0);
    });

    test('defaults distance to 0 when distance.inMeters is NaN', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8,
          distance: { inMeters: NaN },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0].distance).toBe(0);
    });

    test('rounds caloriesBurned and distance to 2 decimal places', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8,
          energy: { inKilocalories: 350.5678 },
          distance: { inMeters: 5000.1234 },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0].caloriesBurned).toBe(350.57);
      expect(result[0].distance).toBe(5000.12);
    });

    test('extracts both caloriesBurned and distance from complete wearable record', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8,
          title: 'Morning Run',
          energy: { inKilocalories: 450 },
          distance: { inMeters: 7500 },
          notes: 'Great pace today',
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'ExerciseSession',
        activityType: 'Running',
        title: 'Morning Run',
        duration: 3600,
        caloriesBurned: 450,
        distance: 7500,
        notes: 'Great pace today',
      });
    });

    test('prefers inKilocalories over inCalories when both are present', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8,
          energy: { inKilocalories: 300, inCalories: 500000 },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0].caloriesBurned).toBe(300);
    });

    test('passes through negative energy and distance values', () => {
      // Documents current behavior: negative values are not rejected or clamped
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8,
          energy: { inKilocalories: -50 },
          distance: { inMeters: -100 },
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result).toHaveLength(1);
      expect(result[0].caloriesBurned).toBe(-50);
      expect(result[0].distance).toBe(-100);
    });

    test('includes sets array with duration in minutes', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T09:00:00Z',
          exerciseType: 8,
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result[0].sets).toEqual([{ set_number: 1, set_type: 'Working Set', duration: 60 }]);
    });

    test('rounds non-even duration to nearest minute in sets', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          endTime: '2024-01-15T08:01:30Z',
          exerciseType: 8,
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'ExerciseSession', unit: '', type: 'exercise' }) as TransformedExerciseSession[];

      expect(result[0].sets).toEqual([{ set_number: 1, set_type: 'Working Set', duration: 2 }]);
    });
  });

  describe('BasalMetabolicRate records (complex extraction)', () => {
    test('extracts from basalMetabolicRate.inKilocaloriesPerDay', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', basalMetabolicRate: { inKilocaloriesPerDay: 1800 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'BasalMetabolicRate', unit: 'kcal', type: 'bmr' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(1800);
    });

    test('extracts from basalMetabolicRate.inCalories', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', basalMetabolicRate: { inCalories: 1700 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'BasalMetabolicRate', unit: 'kcal', type: 'bmr' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(1700);
    });

    test('extracts from basalMetabolicRate.inKilocalories', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', basalMetabolicRate: { inKilocalories: 1600 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'BasalMetabolicRate', unit: 'kcal', type: 'bmr' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(1600);
    });

    test('extracts from basalMetabolicRate as direct number', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', basalMetabolicRate: 1500 },
      ];
      const result = transformHealthRecords(records, { recordType: 'BasalMetabolicRate', unit: 'kcal', type: 'bmr' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(1500);
    });

    test('extracts from record.bmr field', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', bmr: 1400 },
      ];
      const result = transformHealthRecords(records, { recordType: 'BasalMetabolicRate', unit: 'kcal', type: 'bmr' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(1400);
    });

    test('extracts from record.value field', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', value: 1300 },
      ];
      const result = transformHealthRecords(records, { recordType: 'BasalMetabolicRate', unit: 'kcal', type: 'bmr' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(1300);
    });

    test('validates BMR is within reasonable range (0-10000)', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', basalMetabolicRate: { inKilocaloriesPerDay: 0 } },
        { time: '2024-01-16T08:00:00Z', basalMetabolicRate: { inKilocaloriesPerDay: 15000 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'BasalMetabolicRate', unit: 'kcal', type: 'bmr' });

      expect(result).toHaveLength(0); // Both invalid (0 is not > 0, 15000 is not < 10000)
    });

    test('tries multiple date fields (time, startTime, timestamp, date)', () => {
      // Use noon timestamps to avoid timezone boundary issues (toLocalDateString uses local time)
      // For the date-only field, use a timestamp format since toLocalDateString converts
      // date-only strings as UTC midnight which shifts in negative UTC offset timezones
      const testCases = [
        { time: '2024-01-15T12:00:00Z', basalMetabolicRate: 1500 },
        { startTime: '2024-01-16T12:00:00Z', basalMetabolicRate: 1500 },
        { timestamp: '2024-01-17T12:00:00Z', basalMetabolicRate: 1500 },
        { date: '2024-01-18T12:00:00Z', basalMetabolicRate: 1500 },
      ];

      testCases.forEach((record, index) => {
        const result = transformHealthRecords([record], { recordType: 'BasalMetabolicRate', unit: 'kcal', type: 'bmr' }) as TransformedRecord[];
        expect(result).toHaveLength(1);
        expect(result[0].date).toBe(`2024-01-${15 + index}`);
      });
    });
  });

  describe('BloodGlucose records', () => {
    test('extracts from level.inMillimolesPerLiter', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', level: { inMillimolesPerLiter: 5.5 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'BloodGlucose', unit: 'mmol/L', type: 'blood_glucose' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(5.5);
    });

    test('converts mg/dL to mmol/L (divides by 18.018)', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', level: { inMilligramsPerDeciliter: 100 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'BloodGlucose', unit: 'mmol/L', type: 'blood_glucose' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBeCloseTo(5.55, 1); // 100 / 18.018 ≈ 5.55
    });

    test('extracts from bloodGlucose.inMillimolesPerLiter', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', bloodGlucose: { inMillimolesPerLiter: 6.0 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'BloodGlucose', unit: 'mmol/L', type: 'blood_glucose' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(6.0);
    });

    test('extracts from numeric level field', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', level: 5.0 },
      ];
      const result = transformHealthRecords(records, { recordType: 'BloodGlucose', unit: 'mmol/L', type: 'blood_glucose' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(5.0);
    });
  });

  describe('Vo2Max records (multiple extraction strategies)', () => {
    test('extracts from record.vo2Max', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', vo2Max: 45.5 },
      ];
      const result = transformHealthRecords(records, { recordType: 'Vo2Max', unit: 'ml/min/kg', type: 'vo2max' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(45.5);
    });

    test('extracts from record.vo2', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', vo2: 42.0 },
      ];
      const result = transformHealthRecords(records, { recordType: 'Vo2Max', unit: 'ml/min/kg', type: 'vo2max' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(42.0);
    });

    test('extracts from record.value', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', value: 40.0 },
      ];
      const result = transformHealthRecords(records, { recordType: 'Vo2Max', unit: 'ml/min/kg', type: 'vo2max' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(40.0);
    });

    test('extracts from record.vo2MaxMillilitersPerMinuteKilogram', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', vo2MaxMillilitersPerMinuteKilogram: 38.0 },
      ];
      const result = transformHealthRecords(records, { recordType: 'Vo2Max', unit: 'ml/min/kg', type: 'vo2max' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(38.0);
    });

    test('validates Vo2Max is within reasonable range (0-100)', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', vo2Max: 0 },
        { time: '2024-01-16T08:00:00Z', vo2Max: 150 },
      ];
      const result = transformHealthRecords(records, { recordType: 'Vo2Max', unit: 'ml/min/kg', type: 'vo2max' });

      expect(result).toHaveLength(0); // Both invalid
    });
  });

  describe('OxygenSaturation records (multiple extraction strategies)', () => {
    test('extracts from percentage.inPercent', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', percentage: { inPercent: 98.5 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'OxygenSaturation', unit: '%', type: 'oxygen_saturation' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(98.5);
    });

    test('extracts from numeric percentage', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', percentage: 97.0 },
      ];
      const result = transformHealthRecords(records, { recordType: 'OxygenSaturation', unit: '%', type: 'oxygen_saturation' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(97.0);
    });

    test('extracts from record.value', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', value: 96.0 },
      ];
      const result = transformHealthRecords(records, { recordType: 'OxygenSaturation', unit: '%', type: 'oxygen_saturation' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(96.0);
    });

    test('extracts from record.oxygenSaturation', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', oxygenSaturation: 95.0 },
      ];
      const result = transformHealthRecords(records, { recordType: 'OxygenSaturation', unit: '%', type: 'oxygen_saturation' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(95.0);
    });

    test('extracts from record.spo2', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', spo2: 94.0 },
      ];
      const result = transformHealthRecords(records, { recordType: 'OxygenSaturation', unit: '%', type: 'oxygen_saturation' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(94.0);
    });

    test('validates O2 saturation is within reasonable range (0-100)', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', percentage: { inPercent: 0 } },
        { time: '2024-01-16T08:00:00Z', percentage: { inPercent: 150 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'OxygenSaturation', unit: '%', type: 'oxygen_saturation' });

      expect(result).toHaveLength(0); // Both invalid
    });
  });

  describe('BodyFat records (multiple extraction strategies)', () => {
    test('extracts from percentage.inPercent', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', percentage: { inPercent: 15.5 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'BodyFat', unit: '%', type: 'body_fat' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(15.5);
    });

    test('extracts from numeric percentage', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', percentage: 18.0 },
      ];
      const result = transformHealthRecords(records, { recordType: 'BodyFat', unit: '%', type: 'body_fat' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(18.0);
    });

    test('extracts from record.value', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', value: 20.0 },
      ];
      const result = transformHealthRecords(records, { recordType: 'BodyFat', unit: '%', type: 'body_fat' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(20.0);
    });

    test('extracts from record.bodyFat', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', bodyFat: 22.0 },
      ];
      const result = transformHealthRecords(records, { recordType: 'BodyFat', unit: '%', type: 'body_fat' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(22.0);
    });

    test('extracts from bodyFatPercentage.inPercent', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', bodyFatPercentage: { inPercent: 25.0 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'BodyFat', unit: '%', type: 'body_fat' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(25.0);
    });

    test('validates body fat is within reasonable range (0-100)', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', percentage: { inPercent: -5 } },
        { time: '2024-01-16T08:00:00Z', percentage: { inPercent: 150 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'BodyFat', unit: '%', type: 'body_fat' });

      expect(result).toHaveLength(0); // Both invalid
    });
  });

  describe('MenstruationPeriod records (period expansion)', () => {
    test('expands single record to multiple days', () => {
      // Use local dates to ensure consistent behavior across timezones
      const startDate = new Date(2024, 0, 15, 12, 0, 0); // Jan 15, noon local
      const endDate = new Date(2024, 0, 17, 12, 0, 0);   // Jan 17, noon local

      const records = [
        {
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'MenstruationPeriod', unit: '', type: 'menstruation' }) as TransformedRecord[];

      expect(result).toHaveLength(3);
      expect(result[0].date).toBe(toLocalDateString(startDate));
      expect(result[1].date).toBe(toLocalDateString(new Date(2024, 0, 16, 12, 0, 0)));
      expect(result[2].date).toBe(toLocalDateString(endDate));
      expect(result.every(r => r.value === 1)).toBe(true);
    });

    test('creates single record for same-day period', () => {
      // Use local dates
      const startDate = new Date(2024, 0, 15, 8, 0, 0);  // Jan 15, 8am local
      const endDate = new Date(2024, 0, 15, 23, 59, 59); // Jan 15, 11:59pm local

      const records = [
        {
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'MenstruationPeriod', unit: '', type: 'menstruation' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe(toLocalDateString(startDate));
    });
  });

  describe('qualitative record types (skip processing)', () => {
    test('CervicalMucus returns empty array', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', value: 3 },
      ];
      const result = transformHealthRecords(records, { recordType: 'CervicalMucus', unit: '', type: 'cervical_mucus' });

      expect(result).toHaveLength(0);
    });

    test('MenstruationFlow returns empty array', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', value: 2 },
      ];
      const result = transformHealthRecords(records, { recordType: 'MenstruationFlow', unit: '', type: 'menstruation_flow' });

      expect(result).toHaveLength(0);
    });

    test('OvulationTest returns empty array', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', value: 1 },
      ];
      const result = transformHealthRecords(records, { recordType: 'OvulationTest', unit: '', type: 'ovulation_test' });

      expect(result).toHaveLength(0);
    });

    test('SexualActivity returns empty array', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', value: 1 },
      ];
      const result = transformHealthRecords(records, { recordType: 'SexualActivity', unit: '', type: 'sexual_activity' });

      expect(result).toHaveLength(0);
    });
  });

  describe('sampled records (CyclingPedalingCadence, StepsCadence)', () => {
    test('CyclingPedalingCadence creates record for each sample', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          samples: [
            { revolutionsPerMinute: 80 },
            { revolutionsPerMinute: 85 },
            { revolutionsPerMinute: 90 },
          ],
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'CyclingPedalingCadence', unit: 'rpm', type: 'cycling_cadence' }) as TransformedRecord[];

      expect(result).toHaveLength(3);
      expect(result[0].value).toBe(80);
      expect(result[1].value).toBe(85);
      expect(result[2].value).toBe(90);
      expect(result.every(r => r.date === '2024-01-15')).toBe(true);
    });

    test('StepsCadence creates record for each sample', () => {
      const records = [
        {
          startTime: '2024-01-15T08:00:00Z',
          samples: [
            { rate: 100 },
            { rate: 110 },
          ],
        },
      ];
      const result = transformHealthRecords(records, { recordType: 'StepsCadence', unit: 'spm', type: 'steps_cadence' }) as TransformedRecord[];

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(100);
      expect(result[1].value).toBe(110);
    });
  });

  describe('other simple records', () => {
    test('Nutrition extracts energy and converts to kcal', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', energy: { inCalories: 500000 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'Nutrition', unit: 'kcal', type: 'nutrition' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(500); // 500000 / 1000
    });

    test('RestingHeartRate extracts beatsPerMinute', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', beatsPerMinute: 62 },
      ];
      const result = transformHealthRecords(records, { recordType: 'RestingHeartRate', unit: 'bpm', type: 'resting_hr' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(62);
    });

    test('RespiratoryRate extracts rate', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', rate: 16 },
      ];
      const result = transformHealthRecords(records, { recordType: 'RespiratoryRate', unit: 'brpm', type: 'respiratory_rate' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(16);
    });

    test('Hydration extracts volume.inLiters', () => {
      const records = [
        { startTime: '2024-01-15T08:00:00Z', volume: { inLiters: 0.5 } },
      ];
      const result = transformHealthRecords(records, { recordType: 'Hydration', unit: 'L', type: 'hydration' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(0.5);
    });

    test('IntermenstrualBleeding returns value 1', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z' },
      ];
      const result = transformHealthRecords(records, { recordType: 'IntermenstrualBleeding', unit: '', type: 'intermenstrual_bleeding' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(1);
      expect(result[0].date).toBe('2024-01-15');
    });
  });

  describe('unhandled record types', () => {
    test('returns empty for completely unknown record type', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', value: 123 },
      ];
      const result = transformHealthRecords(records, { recordType: 'UnknownType', unit: '', type: 'unknown' });

      expect(result).toHaveLength(0);
    });
  });

  describe('value filtering', () => {
    test('skips records with null value', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', weight: { inKilograms: null } },
      ];
      const result = transformHealthRecords(records, { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect(result).toHaveLength(0);
    });

    test('skips records with NaN value', () => {
      const records = [
        { time: '2024-01-15T08:00:00Z', weight: { inKilograms: NaN } },
      ];
      const result = transformHealthRecords(records, { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect(result).toHaveLength(0);
    });

    test('skips records with missing date', () => {
      const records = [
        { weight: { inKilograms: 75 } }, // No time field
      ];
      const result = transformHealthRecords(records, { recordType: 'Weight', unit: 'kg', type: 'weight' });

      expect(result).toHaveLength(0);
    });
  });

  describe('error resilience', () => {
    test('continues processing when one record throws', () => {
      const badRecord = {
        time: '2024-01-15T08:00:00Z',
        weight: { inKilograms: { toFixed: () => { throw new Error('boom'); } } },
      };
      const goodRecord = { time: '2024-01-16T08:00:00Z', weight: { inKilograms: 75 } };

      const result = transformHealthRecords([badRecord, goodRecord], { recordType: 'Weight', unit: 'kg', type: 'weight' }) as TransformedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-16');
    });
  });
});
