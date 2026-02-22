import { addLog } from '../LogService';
import {
  MetricConfig,
  TransformOutput,
  TransformedRecord,
  TransformedExerciseSession,
  AggregatedSleepSession,
} from '../../types/healthRecords';
import { toLocalDateString } from './dataAggregation';

// ============================================================================
// Transformer Infrastructure
// ============================================================================

// Wrapper for toLocalDateString that handles unknown input and errors
const getDateString = (date: unknown): string | null => {
  if (!date) return null;
  try {
    return toLocalDateString(new Date(date as string | number | Date));
  } catch (e) {
    addLog(`[HealthKitService] Could not convert date: ${date}. ${e}`, 'WARNING');
    return null;
  }
};

// Result from a value transformer - either value/date pair or null to skip
interface ValueTransformResult {
  value: number;
  date: string;
  type?: string;  // Optional override for output type
}

// Transformer that extracts value and date for standard record output
type ValueTransformer = (
  rec: Record<string, unknown>,
  metricConfig: MetricConfig
) => ValueTransformResult | null;

// Transformer that directly pushes to output array (for complex records)
type DirectTransformer = (
  rec: Record<string, unknown>,
  record: unknown,
  metricConfig: MetricConfig,
  output: TransformOutput[]
) => void;

// ============================================================================
// Value Extractors - reusable functions for nested property extraction
// ============================================================================

const extractNestedValue = (rec: Record<string, unknown>, key: string, nestedKey: string): number | null => {
  const nested = rec[key] as Record<string, number> | undefined;
  return nested?.[nestedKey] ?? null;
};

const extractDirectValue = (rec: Record<string, unknown>, key: string): number | null => {
  const val = rec[key];
  return typeof val === 'number' ? val : null;
};

const extractPercentAsDecimal = (rec: Record<string, unknown>): number | null => {
  const val = rec.value;
  return typeof val === 'number' ? val * 100 : null;
};

// ============================================================================
// Value Transformers - extract value and date from raw records
// ============================================================================

const VALUE_TRANSFORMERS: Record<string, ValueTransformer> = {
  // Weight-like records with nested objects
  Weight: (rec) => {
    const value = extractNestedValue(rec, 'weight', 'inKilograms');
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  Height: (rec) => {
    const value = extractNestedValue(rec, 'height', 'inMeters');
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  LeanBodyMass: (rec) => {
    const value = extractNestedValue(rec, 'mass', 'inKilograms');
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  Distance: (rec) => {
    const value = extractNestedValue(rec, 'distance', 'inMeters');
    const date = getDateString(rec.startTime);
    return value !== null && date ? { value, date } : null;
  },

  Hydration: (rec) => {
    const value = extractNestedValue(rec, 'volume', 'inLiters');
    const date = getDateString(rec.startTime);
    return value !== null && date ? { value, date } : null;
  },

  BodyTemperature: (rec) => {
    const value = extractNestedValue(rec, 'temperature', 'inCelsius');
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  // Percentage records
  BodyFat: (rec) => {
    const value = extractNestedValue(rec, 'percentage', 'inPercent');
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  OxygenSaturation: (rec) => {
    const value = extractNestedValue(rec, 'percentage', 'inPercent');
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  // Blood glucose with unit conversion
  BloodGlucose: (rec) => {
    const level = rec.level as Record<string, number> | undefined;
    let value: number | null = null;
    if (level?.inMillimolesPerLiter != null) {
      value = level.inMillimolesPerLiter;
    } else if (level?.inMilligramsPerDeciliter != null) {
      value = level.inMilligramsPerDeciliter / 18.018;
    }
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  // Direct value records with rec.time
  Vo2Max: (rec) => {
    const value = extractDirectValue(rec, 'vo2Max');
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  RestingHeartRate: (rec) => {
    const value = extractDirectValue(rec, 'beatsPerMinute');
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  RespiratoryRate: (rec) => {
    const value = extractDirectValue(rec, 'rate');
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  FloorsClimbed: (rec) => {
    const value = extractDirectValue(rec, 'floors');
    const date = getDateString(rec.startTime);
    return value !== null && date ? { value, date } : null;
  },

  // Percentage values stored as decimals (need *100)
  BloodAlcoholContent: (rec) => {
    const value = extractPercentAsDecimal(rec);
    const date = getDateString(rec.startTime || rec.time);
    return value !== null && date ? { value, date } : null;
  },

  WalkingAsymmetryPercentage: (rec) => {
    const value = extractPercentAsDecimal(rec);
    const date = getDateString(rec.startTime || rec.time);
    return value !== null && date ? { value, date } : null;
  },

  WalkingDoubleSupportPercentage: (rec) => {
    const value = extractPercentAsDecimal(rec);
    const date = getDateString(rec.startTime || rec.time);
    return value !== null && date ? { value, date } : null;
  },
};

// Simple value transformers that just extract rec.value with startTime or time
const createSimpleValueTransformer = (useStartTime = true): ValueTransformer => (rec) => {
  const value = rec.value as number | undefined;
  const date = getDateString(useStartTime ? (rec.startTime || rec.time) : rec.time);
  return value !== undefined && date ? { value, date } : null;
};

// Register simple value transformers for multiple record types
const SIMPLE_VALUE_TYPES_START_TIME = [
  'StepsCadence', 'WalkingSpeed', 'WalkingStepLength',
  'RunningGroundContactTime', 'RunningStrideLength', 'RunningPower',
  'RunningVerticalOscillation', 'RunningSpeed',
  'CyclingSpeed', 'CyclingPower', 'CyclingCadence', 'CyclingFunctionalThresholdPower',
  'EnvironmentalAudioExposure', 'HeadphoneAudioExposure',
  'AppleMoveTime', 'AppleExerciseTime', 'AppleStandTime',
  'DietaryFatTotal', 'DietaryProtein', 'DietarySodium',
];

SIMPLE_VALUE_TYPES_START_TIME.forEach(type => {
  VALUE_TRANSFORMERS[type] = createSimpleValueTransformer(true);
});

// Qualitative record types - pass raw value with warning
const QUALITATIVE_TYPES = ['CervicalMucus', 'MenstruationFlow', 'OvulationTest', 'IntermenstrualBleeding'];

QUALITATIVE_TYPES.forEach(type => {
  VALUE_TRANSFORMERS[type] = (rec, metricConfig) => {
    addLog(`[HealthKitService] Qualitative record type '${metricConfig.recordType}' is not fully transformed. Passing raw value.`, 'WARNING');
    const value = rec.value as number;
    const date = getDateString(rec.startTime);
    return value !== undefined && date ? { value, date } : null;
  };
});

// ============================================================================
// Direct Transformers - handle complex records that push directly to output
// ============================================================================

// HKWorkoutActivityType Mapping
// Source: https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype
const ACTIVITY_MAP: Record<number, string> = {
  1: 'American Football', 2: 'Archery', 3: 'Australian Football', 4: 'Badminton',
  5: 'Baseball', 6: 'Basketball', 7: 'Bowling', 8: 'Boxing', 9: 'Climbing',
  10: 'Cricket', 11: 'Cross Training', 12: 'Curling', 13: 'Cycling',
  14: 'Dance', 16: 'Elliptical', 17: 'Equestrian Sports', 18: 'Fencing',
  19: 'Fishing', 20: 'Functional Strength Training', 21: 'Golf', 22: 'Gymnastics',
  23: 'Handball', 24: 'Hiking', 25: 'Hockey', 26: 'Hunting', 27: 'Lacrosse',
  28: 'Martial Arts', 29: 'Mind and Body', 30: 'Mixed Cardio', 31: 'Paddle Sports',
  32: 'Play', 33: 'Preparation and Recovery', 34: 'Racquetball', 35: 'Rowing',
  36: 'Rugby', 37: 'Running', 38: 'Sailing',
  39: 'Skating Sports', 40: 'Snow Sports', 41: 'Soccer', 42: 'Softball',
  43: 'Squash', 44: 'Stair Climbing', 45: 'Surfing Sports', 46: 'Swimming',
  47: 'Table Tennis', 48: 'Tennis', 49: 'Track and Field', 50: 'Traditional Strength Training',
  51: 'Volleyball', 52: 'Walking', 53: 'Water Fitness', 54: 'Water Polo',
  55: 'Water Sports', 56: 'Wrestling', 57: 'Yoga', 58: 'Barre', 59: 'Core Training',
  60: 'Cross Country Skiing', 61: 'Downhill Skiing', 62: 'Flexibility',
  63: 'High Intensity Interval Training', 64: 'Jump Rope', 65: 'Kickboxing',
  66: 'Pilates', 67: 'Snowboarding', 68: 'Stairs', 69: 'Step Training',
  70: 'Wheelchair Walk Pace', 71: 'Wheelchair Run Pace', 72: 'Tai Chi',
  73: 'Mixed Metabolic Cardio Training', 74: 'Hand Cycling'
} as const;

const DIRECT_TRANSFORMERS: Record<string, DirectTransformer> = {
  BloodPressure: (rec, _record, metricConfig, output) => {
    const { unit, type } = metricConfig;
    if (!rec.time) return;

    const date = getDateString(rec.time);
    if (!date) return;

    const systolic = rec.systolic as Record<string, number> | undefined;
    const diastolic = rec.diastolic as Record<string, number> | undefined;

    if (systolic?.inMillimetersOfMercury) {
      output.push({
        value: parseFloat(systolic.inMillimetersOfMercury.toFixed(2)),
        unit,
        date,
        type: `${type}_systolic`,
      });
    }
    if (diastolic?.inMillimetersOfMercury) {
      output.push({
        value: parseFloat(diastolic.inMillimetersOfMercury.toFixed(2)),
        unit,
        date,
        type: `${type}_diastolic`,
      });
    }
  },

  SleepSession: (rec, _record, _metricConfig, output) => {
    const sleepRec = rec as unknown as AggregatedSleepSession;
    output.push({
      type: 'SleepSession',
      source: sleepRec.source || 'HealthKit',
      timestamp: sleepRec.timestamp,
      entry_date: sleepRec.entry_date,
      bedtime: sleepRec.bedtime,
      wake_time: sleepRec.wake_time,
      duration_in_seconds: sleepRec.duration_in_seconds,
      time_asleep_in_seconds: sleepRec.time_asleep_in_seconds,
      deep_sleep_seconds: sleepRec.deep_sleep_seconds,
      light_sleep_seconds: sleepRec.light_sleep_seconds,
      rem_sleep_seconds: sleepRec.rem_sleep_seconds,
      awake_sleep_seconds: sleepRec.awake_sleep_seconds,
      stage_events: sleepRec.stage_events,
    });
  },

  Workout: (rec, record, _metricConfig, output) => {
    if (!rec.startTime || !rec.endTime) return;

    const activityType = rec.activityType as number | undefined;
    const activityTypeName = activityType
      ? (ACTIVITY_MAP[activityType] || `Workout type ${activityType}`)
      : 'Workout Session';

    // Handle duration which might be an object { unit: 's', quantity: 123 }
    let durationInSeconds = 0;
    const duration = rec.duration as { unit?: string; quantity?: number } | number | undefined;
    if (duration && typeof duration === 'object' && duration.quantity !== undefined) {
      durationInSeconds = duration.quantity;
    } else if (typeof duration === 'number') {
      durationInSeconds = duration;
    }

    const exerciseSession: TransformedExerciseSession = {
      type: 'ExerciseSession',
      source: 'HealthKit',
      date: getDateString(rec.startTime) || '',
      entry_date: getDateString(rec.startTime) || '',
      timestamp: rec.startTime as string,
      startTime: rec.startTime as string,
      endTime: rec.endTime as string,
      duration: durationInSeconds,
      activityType: activityTypeName,
      title: activityTypeName,
      caloriesBurned: rec.totalEnergyBurned as number || 0,
      distance: rec.totalDistance as number || 0,
      notes: 'Source: HealthKit',
      raw_data: record,
      sets: [{ set_number: 1, set_type: 'Working Set', duration: Math.round(durationInSeconds / 60) }]
    };
    output.push(exerciseSession);
  },
};

// ExerciseSession uses same transformer as Workout
DIRECT_TRANSFORMERS['ExerciseSession'] = DIRECT_TRANSFORMERS['Workout'];

export const transformHealthRecords = (records: unknown[], metricConfig: MetricConfig): TransformOutput[] => {
  if (!Array.isArray(records) || records.length === 0) return [];

  const transformedData: TransformOutput[] = [];
  const { recordType, unit, type } = metricConfig;
  let successCount = 0;
  let skipCount = 0;

  // Check if this record type has a direct transformer (handles its own output)
  const directTransformer = DIRECT_TRANSFORMERS[recordType];

  // Check if this record type has a value transformer
  const valueTransformer = VALUE_TRANSFORMERS[recordType];

  records.forEach((record: unknown) => {
    try {
      const rec = record as Record<string, unknown>;

      // Handle aggregated records first (they have date and value at top level)
      if (rec.date && rec.value !== undefined) {
        const value = rec.value as number;
        const recordDate = rec.date as string;
        const outputType = (rec.type as string) || type;

        if (value !== null && !isNaN(value)) {
          const transformedRecord: TransformedRecord = {
            value: parseFloat(value.toFixed(2)),
            type: outputType,
            date: recordDate,
            unit,
          };
          transformedData.push(transformedRecord);
          successCount++;
        } else {
          skipCount++;
        }
        return;
      }

      // Use direct transformer if available (handles complex records)
      if (directTransformer) {
        directTransformer(rec, record, metricConfig, transformedData);
        return;
      }

      // Use value transformer if available
      if (valueTransformer) {
        const result = valueTransformer(rec, metricConfig);
        if (result && !isNaN(result.value)) {
          const transformedRecord: TransformedRecord = {
            value: parseFloat(result.value.toFixed(2)),
            type: result.type || type,
            date: result.date,
            unit,
          };
          transformedData.push(transformedRecord);
          successCount++;
        } else {
          skipCount++;
        }
        return;
      }

      // Fallback: try to handle as simple aggregated record
      if (rec.value !== undefined && rec.date) {
        const value = rec.value as number;
        const recordDate = rec.date as string;
        const outputType = (rec.type as string) || type;

        if (value !== null && !isNaN(value)) {
          const transformedRecord: TransformedRecord = {
            value: parseFloat(value.toFixed(2)),
            type: outputType,
            date: recordDate,
            unit,
          };
          transformedData.push(transformedRecord);
          successCount++;
        } else {
          skipCount++;
        }
      } else {
        skipCount++;
      }
    } catch (error) {
      skipCount++;
      addLog(`[HealthKitService] Error transforming record: ${(error as Error).message}`, 'WARNING');
    }
  });

  // Log transformation summary for debugging
  if (skipCount > 0) {
    addLog(`[HealthKitService] ${recordType} transformation: ${successCount} succeeded, ${skipCount} skipped (of ${records.length} total)`, 'DEBUG');
  }

  return transformedData;
};
