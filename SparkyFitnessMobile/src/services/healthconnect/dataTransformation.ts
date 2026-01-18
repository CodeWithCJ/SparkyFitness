import { addLog } from '../LogService';
import {
  MetricConfig,
  TransformOutput,
  TransformedRecord,
  TransformedExerciseSession,
  AggregatedSleepSession,
} from '../../types/healthRecords';
import { toLocalDateString } from '../../utils/dateUtils';

// ============================================================================
// Transformer Infrastructure
// ============================================================================

// Wrapper for toLocalDateString that handles unknown input and errors
const getDateString = (date: unknown): string | null => {
  if (!date) return null;
  try {
    return toLocalDateString(new Date(date as string | number | Date));
  } catch (e) {
    addLog(`[HealthConnectService] Could not convert date: ${date}. ${e}`, 'warn', 'WARNING');
    return null;
  }
};

// Result from a value transformer - either value/date pair or null to skip
interface ValueTransformResult {
  value: number;
  date: string;
  type?: string; // Optional override for output type
}

// Transformer that extracts value and date for standard record output
type ValueTransformer = (
  rec: Record<string, unknown>,
  metricConfig: MetricConfig,
  index: number
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

// Try multiple date fields in order of preference
const extractDate = (rec: Record<string, unknown>, ...fields: string[]): string | null => {
  for (const field of fields) {
    const date = getDateString(rec[field]);
    if (date) return date;
  }
  return null;
};

// ============================================================================
// Robust Value Extractor - for records with multiple possible field formats
// ============================================================================

interface RobustExtractorConfig {
  // Array of extraction strategies to try in order
  valueStrategies: ((rec: Record<string, unknown>) => number | null)[];
  // Date fields to try in order
  dateFields: string[];
  // Validation function for the extracted value
  validateValue?: (value: number) => boolean;
  // Log label for debugging
  logLabel: string;
}

const createRobustTransformer = (config: RobustExtractorConfig): ValueTransformer => {
  return (rec, _metricConfig, index) => {
    // Log sample record for debugging on first record
    if (index === 0) {
      addLog(`[Transform] ${config.logLabel} sample keys: ${Object.keys(rec).join(', ')}`, 'debug');
    }

    // Try value extraction strategies in order
    let value: number | null = null;
    for (const strategy of config.valueStrategies) {
      value = strategy(rec);
      if (value !== null) break;
    }

    // Extract date
    const date = extractDate(rec, ...config.dateFields);

    // Validate
    const isValidValue = value !== null && !isNaN(value) && (!config.validateValue || config.validateValue(value));
    const isValidDate = date !== null && date.length > 0;

    if (isValidValue && isValidDate) {
      if (index === 0) {
        addLog(`[Transform] ${config.logLabel} SUCCESS: ${value} on ${date}`, 'info', 'SUCCESS');
      }
      return { value: value!, date };
    }

    if (index === 0) {
      const issues: string[] = [];
      if (!isValidValue) issues.push(`invalid value (${value})`);
      if (!isValidDate) issues.push(`invalid date (${date})`);
      addLog(`[Transform] ${config.logLabel} FAILED: ${issues.join(', ')}`, 'warn', 'WARNING');
    }
    return null;
  };
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

  BasalBodyTemperature: (rec) => {
    const value = extractNestedValue(rec, 'temperature', 'inCelsius');
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  LeanBodyMass: (rec) => {
    const value = extractNestedValue(rec, 'mass', 'inKilograms');
    const date = extractDate(rec, 'time', 'startTime');
    return value !== null && date ? { value, date } : null;
  },

  BoneMass: (rec) => {
    const value = extractNestedValue(rec, 'mass', 'inKilograms');
    const date = extractDate(rec, 'time', 'startTime');
    return value !== null && date ? { value, date } : null;
  },

  ElevationGained: (rec) => {
    const value = extractNestedValue(rec, 'elevation', 'inMeters');
    const date = getDateString(rec.startTime);
    return value !== null && date ? { value, date } : null;
  },

  Power: (rec) => {
    const value = extractNestedValue(rec, 'power', 'inWatts');
    const date = getDateString(rec.startTime);
    return value !== null && date ? { value, date } : null;
  },

  Speed: (rec) => {
    const value = extractNestedValue(rec, 'speed', 'inMetersPerSecond');
    const date = getDateString(rec.startTime);
    return value !== null && date ? { value, date } : null;
  },

  Nutrition: (rec) => {
    const energy = rec.energy as Record<string, number> | undefined;
    if (!energy?.inCalories) return null;
    const value = energy.inCalories / 1000;
    const date = getDateString(rec.startTime);
    return date ? { value, date } : null;
  },

  // Direct value records
  FloorsClimbed: (rec) => {
    const value = extractDirectValue(rec, 'floors');
    const date = getDateString(rec.startTime);
    return value !== null && date ? { value, date } : null;
  },

  RespiratoryRate: (rec) => {
    const value = extractDirectValue(rec, 'rate');
    const date = extractDate(rec, 'time', 'startTime');
    return value !== null && date ? { value, date } : null;
  },

  RestingHeartRate: (rec) => {
    const value = extractDirectValue(rec, 'beatsPerMinute');
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  WheelchairPushes: (rec) => {
    const value = extractDirectValue(rec, 'count');
    const date = getDateString(rec.startTime);
    return value !== null && date ? { value, date } : null;
  },

  IntermenstrualBleeding: (rec) => {
    const date = getDateString(rec.time);
    return date ? { value: 1, date } : null;
  },

  // Percentage records
  BloodAlcoholContent: (rec) => {
    const value = extractNestedValue(rec, 'percentage', 'inPercent');
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  BloodOxygenSaturation: (rec) => {
    const value = extractNestedValue(rec, 'percentage', 'inPercent');
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },
};

// ============================================================================
// Robust Transformers - for records with multiple possible field formats
// ============================================================================

VALUE_TRANSFORMERS['BasalMetabolicRate'] = createRobustTransformer({
  logLabel: 'BMR',
  dateFields: ['time', 'startTime', 'timestamp', 'date'],
  validateValue: (v) => v > 0 && v < 10000,
  valueStrategies: [
    (rec) => extractNestedValue(rec, 'basalMetabolicRate', 'inKilocaloriesPerDay'),
    (rec) => extractNestedValue(rec, 'basalMetabolicRate', 'inCalories'),
    (rec) => extractNestedValue(rec, 'basalMetabolicRate', 'inKilocalories'),
    (rec) => {
      const bmr = rec.basalMetabolicRate;
      return typeof bmr === 'number' ? bmr : null;
    },
    (rec) => extractDirectValue(rec, 'bmr'),
    (rec) => extractDirectValue(rec, 'value'),
  ],
});

VALUE_TRANSFORMERS['BloodGlucose'] = createRobustTransformer({
  logLabel: 'BloodGlucose',
  dateFields: ['time', 'startTime', 'timestamp', 'date'],
  validateValue: (v) => v > 0,
  valueStrategies: [
    (rec) => extractNestedValue(rec, 'level', 'inMillimolesPerLiter'),
    (rec) => extractNestedValue(rec, 'bloodGlucose', 'inMillimolesPerLiter'),
    (rec) => {
      const mgDl = extractNestedValue(rec, 'level', 'inMilligramsPerDeciliter');
      return mgDl !== null ? mgDl / 18.018 : null;
    },
    (rec) => {
      const mgDl = extractNestedValue(rec, 'bloodGlucose', 'inMilligramsPerDeciliter');
      return mgDl !== null ? mgDl / 18.018 : null;
    },
    (rec) => {
      const level = rec.level;
      return typeof level === 'number' ? level : null;
    },
    (rec) => extractDirectValue(rec, 'value'),
  ],
});

VALUE_TRANSFORMERS['BodyFat'] = createRobustTransformer({
  logLabel: 'BodyFat',
  dateFields: ['time', 'startTime', 'timestamp', 'date'],
  validateValue: (v) => v >= 0 && v <= 100,
  valueStrategies: [
    (rec) => extractNestedValue(rec, 'percentage', 'inPercent'),
    (rec) => {
      const pct = rec.percentage;
      return typeof pct === 'number' ? pct : null;
    },
    (rec) => extractDirectValue(rec, 'value'),
    (rec) => extractDirectValue(rec, 'bodyFat'),
    (rec) => extractNestedValue(rec, 'bodyFatPercentage', 'inPercent'),
  ],
});

VALUE_TRANSFORMERS['OxygenSaturation'] = createRobustTransformer({
  logLabel: 'OxygenSaturation',
  dateFields: ['time', 'startTime', 'timestamp', 'date'],
  validateValue: (v) => v > 0 && v <= 100,
  valueStrategies: [
    (rec) => extractNestedValue(rec, 'percentage', 'inPercent'),
    (rec) => {
      const pct = rec.percentage;
      return typeof pct === 'number' ? pct : null;
    },
    (rec) => extractDirectValue(rec, 'value'),
    (rec) => extractDirectValue(rec, 'oxygenSaturation'),
    (rec) => extractDirectValue(rec, 'spo2'),
  ],
});

VALUE_TRANSFORMERS['Vo2Max'] = createRobustTransformer({
  logLabel: 'Vo2Max',
  dateFields: ['time', 'startTime', 'timestamp', 'date'],
  validateValue: (v) => v > 0 && v < 100,
  valueStrategies: [
    (rec) => extractDirectValue(rec, 'vo2Max'),
    (rec) => extractDirectValue(rec, 'vo2'),
    (rec) => extractDirectValue(rec, 'value'),
    (rec) => extractDirectValue(rec, 'vo2MaxMillilitersPerMinuteKilogram'),
  ],
});

// ============================================================================
// Direct Transformers - handle complex records that push directly to output
// ============================================================================

// Exercise Type Mapping (Common Android Health Connect IDs)
const EXERCISE_MAP: Record<number, string> = {
  1: 'Biking', 2: 'Biking (Stationary)', 8: 'Running', 56: 'Running (Treadmill)',
  79: 'Walking', 37: 'Hiking', 72: 'Swimming (Pool)', 71: 'Swimming (Open Water)',
  84: 'Strength Training', 85: 'Weightlifting', 31: 'High Intensity Interval Training',
  80: 'Walking (Fitness)', 87: 'Yoga', 55: 'Rowing Machine', 27: 'Elliptical',
  69: 'Stair Climbing', 23: 'Dancing'
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
    if (!rec.startTime || !rec.endTime) return;

    const start = new Date(rec.startTime as string).getTime();
    const end = new Date(rec.endTime as string).getTime();
    if (isNaN(start) || isNaN(end)) return;

    const durationInSeconds = (end - start) / 1000;
    const recordDate = toLocalDateString(rec.startTime as string);

    const sleepSession: AggregatedSleepSession = {
      type: 'SleepSession',
      source: 'Health Connect',
      timestamp: rec.startTime as string,
      entry_date: recordDate,
      bedtime: rec.startTime as string,
      wake_time: rec.endTime as string,
      duration_in_seconds: durationInSeconds,
      time_asleep_in_seconds: durationInSeconds,
      stage_events: [],
      sleep_score: 0,
      deep_sleep_seconds: 0,
      light_sleep_seconds: durationInSeconds,
      rem_sleep_seconds: 0,
      awake_sleep_seconds: 0
    };
    output.push(sleepSession);
  },

  ExerciseSession: (rec, record, _metricConfig, output) => {
    if (!rec.startTime || !rec.endTime) return;

    const start = new Date(rec.startTime as string).getTime();
    const end = new Date(rec.endTime as string).getTime();
    if (isNaN(start) || isNaN(end)) return;

    const durationInSeconds = (end - start) / 1000;
    const recordDate = toLocalDateString(rec.startTime as string);
    const exerciseType = rec.exerciseType as number | undefined;
    const activityTypeName = exerciseType
      ? (EXERCISE_MAP[exerciseType] || `Exercise Type ${exerciseType}`)
      : 'Exercise Session';
    const title = (rec.title as string) || activityTypeName;

    // Extract calories burned
    let caloriesBurned = 0;
    const energy = rec.energy as Record<string, number> | undefined;
    if (energy?.inKilocalories != null && !isNaN(energy.inKilocalories)) {
      caloriesBurned = energy.inKilocalories;
    } else if (energy?.inCalories != null && !isNaN(energy.inCalories)) {
      caloriesBurned = energy.inCalories / 1000;
    }

    // Extract distance
    let distance = 0;
    const distanceObj = rec.distance as Record<string, number> | undefined;
    if (distanceObj?.inMeters != null && !isNaN(distanceObj.inMeters)) {
      distance = distanceObj.inMeters;
    }

    const exerciseSession: TransformedExerciseSession = {
      type: 'ExerciseSession',
      source: 'Health Connect',
      date: recordDate,
      entry_date: recordDate,
      timestamp: rec.startTime as string,
      startTime: rec.startTime as string,
      endTime: rec.endTime as string,
      duration: durationInSeconds,
      activityType: activityTypeName,
      title: title,
      caloriesBurned: parseFloat(caloriesBurned.toFixed(2)),
      distance: parseFloat(distance.toFixed(2)),
      notes: rec.notes as string | undefined,
      raw_data: record
    };
    output.push(exerciseSession);
  },

  MenstruationPeriod: (rec, _record, metricConfig, output) => {
    if (!rec.startTime || !rec.endTime) return;

    const { unit, type } = metricConfig;
    const start = new Date(rec.startTime as string);
    const end = new Date(rec.endTime as string);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      output.push({
        value: 1,
        type,
        date: toLocalDateString(d),
        unit,
      });
    }
  },

  CyclingPedalingCadence: (rec, _record, metricConfig, output) => {
    const samples = rec.samples as { revolutionsPerMinute: number }[] | undefined;
    if (!rec.startTime || !samples) return;

    const { unit, type } = metricConfig;
    const date = toLocalDateString(rec.startTime as string);

    samples.forEach(sample => {
      output.push({
        value: sample.revolutionsPerMinute,
        type,
        date,
        unit,
      });
    });
  },

  StepsCadence: (rec, _record, metricConfig, output) => {
    const samples = rec.samples as { rate: number }[] | undefined;
    if (!rec.startTime || !samples) return;

    const { unit, type } = metricConfig;
    const date = toLocalDateString(rec.startTime as string);

    samples.forEach(sample => {
      output.push({
        value: sample.rate,
        type,
        date,
        unit,
      });
    });
  },
};

// ============================================================================
// Calorie Transformers - special handling for aggregated vs raw records
// ============================================================================

const createCalorieTransformer = (aggregatedType: string, logLabel: string): ValueTransformer => {
  return (rec, _metricConfig, index) => {
    // Check if this is an aggregated record (handles both naming conventions from different aggregation functions)
    const isAggregatedCalories = rec.type === aggregatedType ||
      rec.type === 'total_calories' ||
      rec.type === 'Active Calories' ||
      rec.type === 'active_calories';
    if (rec.value !== undefined && rec.date && isAggregatedCalories) {
      const value = rec.value as number;
      const recordDate = rec.date as string;
      if (index === 0) {
        addLog(`[Transform] ${logLabel} (aggregated as ${rec.type}): ${value} kcal on ${recordDate}`, 'debug');
      }
      // Preserve the original type from aggregated records
      return { value, date: recordDate, type: rec.type as string };
    }

    // Handle raw record
    const energy = rec.energy as Record<string, number> | undefined;
    let value: number | null = null;

    if (energy?.inKilocalories != null) {
      value = energy.inKilocalories;
    } else if (energy?.inCalories != null) {
      value = energy.inCalories / 1000;
    }

    const date = extractDate(rec, 'startTime', 'time', 'date');

    if (value !== null && date) {
      if (index === 0) {
        addLog(`[Transform] ${logLabel} (raw): ${value} kcal on ${date}`, 'debug');
      }
      return { value, date };
    }

    if (index === 0) {
      addLog(`[Transform] ${logLabel} FAILED: value=${value}, date=${date}`, 'warn', 'WARNING');
    }
    return null;
  };
};

VALUE_TRANSFORMERS['ActiveCaloriesBurned'] = createCalorieTransformer('Active Calories', 'ActiveCalories');
VALUE_TRANSFORMERS['TotalCaloriesBurned'] = createCalorieTransformer('total_calories', 'TotalCalories');

// ============================================================================
// Skip Types - qualitative records that should be skipped
// ============================================================================

const SKIP_TYPES = new Set(['CervicalMucus', 'MenstruationFlow', 'OvulationTest', 'SexualActivity']);

// ============================================================================
// Main Transform Function
// ============================================================================

export const transformHealthRecords = (records: unknown[], metricConfig: MetricConfig): TransformOutput[] => {
  if (!Array.isArray(records)) {
    addLog(`[HealthConnectService] transformHealthRecords received non-array records for ${metricConfig.recordType}: ${JSON.stringify(records)}`, 'warn', 'WARNING');
    return [];
  }

  if (records.length === 0) {
    return [];
  }

  const transformedData: TransformOutput[] = [];
  const { recordType, unit, type } = metricConfig;
  let successCount = 0;
  let skipCount = 0;

  // Check if this is a skip type
  if (SKIP_TYPES.has(recordType)) {
    addLog(`[HealthConnectService] Skipping qualitative ${recordType} records`);
    return [];
  }

  // Check if this record type has a direct transformer
  const directTransformer = DIRECT_TRANSFORMERS[recordType];

  // Check if this record type has a value transformer
  const valueTransformer = VALUE_TRANSFORMERS[recordType];

  records.forEach((record: unknown, index: number) => {
    try {
      const rec = record as Record<string, unknown>;

      // Handle pre-aggregated records (from aggregation functions like aggregateStepsByDate)
      // These have value and date at top level
      if (['Steps', 'HeartRate'].includes(recordType) && rec.value !== undefined && rec.date) {
        const value = rec.value as number;
        const recordDate = rec.date as string;
        const outputType = (rec.type as string) || type;

        if (value !== null && !isNaN(value)) {
          transformedData.push({
            value: parseFloat(value.toFixed(2)),
            type: outputType,
            date: recordDate,
            unit,
          });
          successCount++;
        } else {
          skipCount++;
        }
        return;
      }

      // Use direct transformer if available (handles complex records)
      if (directTransformer) {
        const beforeLength = transformedData.length;
        directTransformer(rec, record, metricConfig, transformedData);
        if (transformedData.length > beforeLength) {
          successCount += transformedData.length - beforeLength;
        }
        return;
      }

      // Use value transformer if available
      if (valueTransformer) {
        const result = valueTransformer(rec, metricConfig, index);
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

      // Fallback: try to handle as simple record with value/date at top level
      if (rec.value !== undefined && rec.date) {
        const value = rec.value as number;
        const recordDate = rec.date as string;
        const outputType = (rec.type as string) || type;

        if (!isNaN(value)) {
          transformedData.push({
            value: parseFloat(value.toFixed(2)),
            type: outputType,
            date: recordDate,
            unit,
          });
          successCount++;
        } else {
          skipCount++;
        }
        return;
      }

      // Unhandled record type
      if (index === 0) {
        addLog(`[HealthConnectService] No transformer found for record type: ${recordType}`, 'warn', 'WARNING');
      }
      skipCount++;
    } catch (error) {
      skipCount++;
      addLog(`[HealthConnectService] Error transforming ${recordType} record at index ${index}: ${(error as Error).message}`, 'warn', 'WARNING');
    }
  });

  // Log transformation summary for debugging
  if (skipCount > 0) {
    addLog(`[HealthConnectService] ${recordType} transformation: ${successCount} succeeded, ${skipCount} skipped (of ${records.length} total)`, 'debug');
  }

  return transformedData;
};
