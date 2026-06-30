import { addLog } from '../LogService';
import {
  MetricConfig,
  TransformOutput,
  TransformedRecord,
  TransformedExerciseSession,
  TransformedNutritionEntry,
  SparkyMealType,
  AggregatedSleepSession,
  RecordTimezoneMetadata,
  SleepStageType,
  HEALTH_CONNECT_SOURCE,
} from '../../types/healthRecords';
import { toLocalDateString } from '../../utils/dateUtils';

// ============================================================================
// Own-app exclusion (read/write feedback-loop guard)
// ============================================================================

// Health Connect returns records written by *this* app too. If writeback is on,
// re-importing them would duplicate diary entries (and compound every sync). Per
// Google's guidance we skip records whose dataOrigin is our own package. The
// package name is injected from the service layer (setOwnPackageName) so this
// pure module needs no expo-application import.
let ownPackageName: string | null = null;
export const setOwnPackageName = (pkg: string | null): void => {
  ownPackageName = pkg;
};

const isOwnRecord = (rec: Record<string, unknown>): boolean => {
  if (!ownPackageName) return false;
  const dataOrigin = (rec.metadata as { dataOrigin?: string } | undefined)?.dataOrigin;
  return dataOrigin === ownPackageName;
};

// ============================================================================
// Transformer Infrastructure
// ============================================================================

// Wrapper for toLocalDateString that handles unknown input and errors
const getDateString = (date: unknown): string | null => {
  if (!date) return null;
  try {
    return toLocalDateString(new Date(date as string | number | Date));
  } catch (e) {
    addLog(`[HealthConnectService] Could not convert date: ${date}. ${e}`, 'WARNING');
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
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    // Handle comma decimal separator (European locales e.g. "49,51")
    const parsed = parseFloat(val.replace(',', '.'));
    return isNaN(parsed) ? null : parsed;
  }
  return null;
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
// Timezone Metadata Extraction
// ============================================================================

/**
 * Extract UTC offset from Health Connect zone offset fields.
 * Most Health Connect records carry startZoneOffset/endZoneOffset as { totalSeconds: number }.
 * Defaults to startZoneOffset; direct transformers (e.g., SleepSession) can override
 * to use endZoneOffset for wake-based day derivation.
 */
export const extractTimezoneMetadata = (
  rec: Record<string, unknown>,
  preferEnd = false,
): RecordTimezoneMetadata => {
  const preferred = preferEnd ? 'endZoneOffset' : 'startZoneOffset';
  const fallback = preferEnd ? 'startZoneOffset' : 'endZoneOffset';

  const offset = rec[preferred] as { totalSeconds?: number } | undefined;
  if (offset?.totalSeconds != null) {
    return { record_utc_offset_minutes: Math.round(offset.totalSeconds / 60) };
  }

  const fallbackOffset = rec[fallback] as { totalSeconds?: number } | undefined;
  if (fallbackOffset?.totalSeconds != null) {
    return { record_utc_offset_minutes: Math.round(fallbackOffset.totalSeconds / 60) };
  }

  return {};
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
      addLog(`[Transform] ${config.logLabel} sample keys: ${Object.keys(rec).join(', ')}`, 'DEBUG');
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
        addLog(`[Transform] ${config.logLabel} SUCCESS on ${date}`, 'INFO');
      }
      return { value: value!, date };
    }

    if (index === 0) {
      const issues: string[] = [];
      if (!isValidValue) issues.push('invalid value');
      if (!isValidDate) issues.push('invalid date');
      addLog(`[Transform] ${config.logLabel} FAILED: ${issues.join(', ')}`, 'WARNING');
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
    if (isOwnRecord(rec)) return null; // don't re-import water Sparky wrote
    const liters = extractNestedValue(rec, 'volume', 'inLiters');
    const date = getDateString(rec.startTime);
    // Convert L -> integer ml: synced as water intake (type 'water') which the server stores in ml.
    return liters !== null && date ? { value: Math.round(liters * 1000), date } : null;
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

  HeartRateVariabilityRmssd: (rec) => {
    const value = extractDirectValue(rec, 'heartRateVariabilityMillis');
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
    (rec) => extractDirectValue(rec, 'vo2MillilitersPerMinuteKilogram'),
    (rec) => extractDirectValue(rec, 'vo2Max'),
    (rec) => extractDirectValue(rec, 'vo2'),
    (rec) => extractDirectValue(rec, 'value'),
  ],
});

// ============================================================================
// Direct Transformers - handle complex records that push directly to output
// ============================================================================

// Exercise Type Mapping — matches ExerciseType constants from react-native-health-connect
const EXERCISE_MAP: Record<number, string> = {
  0: 'Other Workout',
  1: 'Back Extension',
  2: 'Badminton',
  3: 'Barbell Shoulder Press',
  4: 'Baseball',
  5: 'Basketball',
  6: 'Bench Press',
  7: 'Bench Sit-Up',
  8: 'Biking',
  9: 'Biking (Stationary)',
  10: 'Boot Camp',
  11: 'Boxing',
  12: 'Burpee',
  13: 'Calisthenics',
  14: 'Cricket',
  15: 'Crunch',
  16: 'Dancing',
  17: 'Deadlift',
  18: 'Dumbbell Curl (Left Arm)',
  19: 'Dumbbell Curl (Right Arm)',
  20: 'Dumbbell Front Raise',
  21: 'Dumbbell Lateral Raise',
  22: 'Dumbbell Triceps Extension (Left Arm)',
  23: 'Dumbbell Triceps Extension (Right Arm)',
  24: 'Dumbbell Triceps Extension (Two Arm)',
  25: 'Elliptical',
  26: 'Exercise Class',
  27: 'Fencing',
  28: 'Football (American)',
  29: 'Football (Australian)',
  30: 'Forward Twist',
  31: 'Frisbee Disc',
  32: 'Golf',
  33: 'Guided Breathing',
  34: 'Gymnastics',
  35: 'Handball',
  36: 'High Intensity Interval Training',
  37: 'Hiking',
  38: 'Ice Hockey',
  39: 'Ice Skating',
  40: 'Jumping Jack',
  41: 'Jump Rope',
  42: 'Lat Pull-Down',
  43: 'Lunge',
  44: 'Martial Arts',
  46: 'Paddling',
  47: 'Paragliding',
  48: 'Pilates',
  49: 'Plank',
  50: 'Racquetball',
  51: 'Rock Climbing',
  52: 'Roller Hockey',
  53: 'Rowing',
  54: 'Rowing Machine',
  55: 'Rugby',
  56: 'Running',
  57: 'Running (Treadmill)',
  58: 'Sailing',
  59: 'Scuba Diving',
  60: 'Skating',
  61: 'Skiing',
  62: 'Snowboarding',
  63: 'Snowshoeing',
  64: 'Soccer',
  65: 'Softball',
  66: 'Squash',
  67: 'Squat',
  68: 'Stair Climbing',
  69: 'Stair Climbing Machine',
  70: 'Strength Training',
  71: 'Stretching',
  72: 'Surfing',
  73: 'Swimming (Open Water)',
  74: 'Swimming (Pool)',
  75: 'Table Tennis',
  76: 'Tennis',
  77: 'Upper Twist',
  78: 'Volleyball',
  79: 'Walking',
  80: 'Water Polo',
  81: 'Weightlifting',
  82: 'Wheelchair',
  83: 'Yoga',
} as const;

// Health Connect SleepStageType constants from react-native-health-connect.
// We skip UNKNOWN values so they do not distort asleep-time totals downstream.
const mapHealthConnectSleepStage = (stage: number): SleepStageType | null => {
  switch (stage) {
    case 1: return 'awake';
    case 2: return 'light';   // SLEEPING (generic) → light
    case 3: return 'awake';   // OUT_OF_BED → awake
    case 4: return 'light';
    case 5: return 'deep';
    case 6: return 'rem';
    case 0:
      addLog('[HealthConnect] Skipping UNKNOWN sleep stage value', 'WARNING');
      return null;
    default:
      addLog(`[HealthConnect] Skipping unsupported sleep stage value: ${stage}`, 'WARNING');
      return null;
  }
};

// Health Connect MealType constants → Sparky meal_type slug.
// HC: BREAKFAST=1, LUNCH=2, DINNER=3, SNACK=4, UNKNOWN=0.
const mapHealthConnectMealType = (mealType: unknown): SparkyMealType => {
  switch (mealType) {
    case 1: return 'breakfast';
    case 2: return 'lunch';
    case 3: return 'dinner';
    case 4: return 'snacks';
    default: return 'snacks'; // UNKNOWN/0 → snacks (no neutral bucket in Sparky)
  }
};

// HC stores every nutrient as Mass (grams), but Sparky's food columns expect a
// specific unit per nutrient — matching how OpenFoodFacts/Garmin populate them:
// macros in grams, most minerals/vitamins in mg, a few trace nutrients in mcg.
// We convert from grams accordingly; otherwise e.g. sodium lands 1000x too low.
export const G_TO_MG = 1_000;
export const G_TO_MCG = 1_000_000;

// HC NutritionRecord Mass field → { Sparky column, grams→column-unit factor }.
// Exported so the writeback mapper reuses the exact same field/unit mapping
// (read multiplies grams→column-unit; writeback writes the column value back in
// that same unit via factor→HC-unit, so the two directions never drift).
export const HC_NUTRIENT_COLUMNS: { hcField: string; column: string; factor: number }[] = [
  { hcField: 'protein', column: 'protein', factor: 1 },
  { hcField: 'totalCarbohydrate', column: 'carbs', factor: 1 },
  { hcField: 'totalFat', column: 'fat', factor: 1 },
  { hcField: 'saturatedFat', column: 'saturated_fat', factor: 1 },
  { hcField: 'polyunsaturatedFat', column: 'polyunsaturated_fat', factor: 1 },
  { hcField: 'monounsaturatedFat', column: 'monounsaturated_fat', factor: 1 },
  { hcField: 'transFat', column: 'trans_fat', factor: 1 },
  { hcField: 'dietaryFiber', column: 'dietary_fiber', factor: 1 },
  { hcField: 'sugar', column: 'sugars', factor: 1 },
  { hcField: 'cholesterol', column: 'cholesterol', factor: G_TO_MG },
  { hcField: 'sodium', column: 'sodium', factor: G_TO_MG },
  { hcField: 'potassium', column: 'potassium', factor: G_TO_MG },
  { hcField: 'calcium', column: 'calcium', factor: G_TO_MG },
  { hcField: 'iron', column: 'iron', factor: G_TO_MG },
  { hcField: 'vitaminC', column: 'vitamin_c', factor: G_TO_MG },
  { hcField: 'vitaminA', column: 'vitamin_a', factor: G_TO_MCG },
];

// HC's other Mass nutrients (biotin, magnesium, vitaminB12, …) are intentionally
// dropped: Sparky has no column for them, and its custom_nutrients are matched by
// name to *user-defined* nutrients with *user-chosen* units — so there's no unit
// we could store them in that would display correctly. Forwarding them would be
// fabricating both the value's unit and a name that nothing renders.

// Strip float noise (4.949999999999999 -> 4.95). Significant figures (not fixed
// decimals) so small post-conversion values aren't truncated. Shared with the
// writeback mappers so read and write rounding can never drift.
export const tidyNumber = (value: number): number => Number(value.toPrecision(6));

// HC's native bridge emits `{ inGrams: 0 }` / `{ inKilocalories: 0 }` for every
// nutrient a source did NOT set — it cannot distinguish "0" from "absent". So we
// treat 0 (and NaN) as "not provided" and omit it, rather than writing a wall of
// phantom zeros to the food entry. A genuinely-zero nutrient is reported as
// "unknown" rather than a misleading 0, which is the honest representation.
const extractMassGrams = (rec: Record<string, unknown>, field: string): number | undefined => {
  const grams = (rec[field] as { inGrams?: number } | undefined)?.inGrams;
  return grams != null && !isNaN(grams) && grams > 0 ? grams : undefined;
};

// Convert grams to the target unit and strip float noise.
const convertMass = (grams: number | undefined, factor: number): number | undefined =>
  grams != null ? tidyNumber(grams * factor) : undefined;

// Energy carries inKilocalories; some sources only populate inCalories.
const extractEnergyKcal = (rec: Record<string, unknown>, field: string): number | undefined => {
  const energy = rec[field] as { inKilocalories?: number; inCalories?: number } | undefined;
  const kcal =
    energy?.inKilocalories != null && !isNaN(energy.inKilocalories)
      ? energy.inKilocalories
      : energy?.inCalories != null && !isNaN(energy.inCalories)
        ? energy.inCalories / 1000
        : undefined;
  return kcal != null && kcal > 0 ? tidyNumber(kcal) : undefined;
};

const DIRECT_TRANSFORMERS: Record<string, DirectTransformer> = {
  Nutrition: (rec, _record, _metricConfig, output) => {
    if (!rec.startTime) return;
    if (isOwnRecord(rec)) return; // don't re-import nutrition Sparky wrote

    const metadata = rec.metadata as { id?: string } | undefined;
    // Skip records without HC's stable id: the server keys idempotent re-sync on
    // it, so an id-less record would create a duplicate entry on every sync.
    if (!metadata?.id) return;

    // Send only the instant (timestamp) plus the offset metadata, never a
    // pre-bucketed day string: the server derives the calendar day from the
    // instant + offset. Sending a day string alongside a timestamp makes the
    // server parse it as UTC midnight and shift negative-offset zones to the
    // previous day.
    const entry: TransformedNutritionEntry = {
      type: 'Nutrition',
      source: HEALTH_CONNECT_SOURCE,
      // metadata.id is HC's own UUID — globally unique. (clientRecordId is set by
      // the writing app and could collide across apps, so it's not used as the key.)
      source_id: metadata?.id,
      timestamp: rec.startTime as string,
      food_name: (rec.name as string) || 'Health Connect food',
      meal_type: mapHealthConnectMealType(rec.mealType),
      ...extractTimezoneMetadata(rec),
    };

    const calories = extractEnergyKcal(rec, 'energy');
    if (calories != null) entry.calories = calories;

    for (const { hcField, column, factor } of HC_NUTRIENT_COLUMNS) {
      const value = convertMass(extractMassGrams(rec, hcField), factor);
      if (value != null) {
        (entry as unknown as Record<string, unknown>)[column] = value;
      }
    }

    output.push(entry);
  },

  HeartRate: (rec, _record, metricConfig, output) => {
    const samples = rec.samples as { beatsPerMinute: number }[] | undefined;
    if (!rec.startTime || !samples) return;

    const { unit, type } = metricConfig;
    const date = getDateString(rec.startTime);
    if (!date) return;

    for (const sample of samples) {
      if (sample.beatsPerMinute != null && !isNaN(sample.beatsPerMinute)) {
        output.push({ value: sample.beatsPerMinute, type, date, unit, source: HEALTH_CONNECT_SOURCE });
      }
    }
  },

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
        source: HEALTH_CONNECT_SOURCE,
      });
    }
    if (diastolic?.inMillimetersOfMercury) {
      output.push({
        value: parseFloat(diastolic.inMillimetersOfMercury.toFixed(2)),
        unit,
        date,
        type: `${type}_diastolic`,
        source: HEALTH_CONNECT_SOURCE,
      });
    }
  },

  SleepSession: (rec, _record, _metricConfig, output) => {
    if (!rec.startTime || !rec.endTime) return;

    const start = new Date(rec.startTime as string).getTime();
    const end = new Date(rec.endTime as string).getTime();
    if (isNaN(start) || isNaN(end)) return;

    const durationInSeconds = (end - start) / 1000;
    if (durationInSeconds <= 0) return;
    const recordDate = toLocalDateString(rec.endTime as string);

    const stages = rec.stages as { startTime: string; endTime: string; stage: number }[] | undefined;

    let deepSeconds = 0;
    let lightSeconds = 0;
    let remSeconds = 0;
    let awakeSeconds = 0;
    let hasRecognizedStages = false;
    const stageEvents: AggregatedSleepSession['stage_events'] = [];

    if (stages && stages.length > 0) {
      for (const stage of stages) {
        const stageStart = new Date(stage.startTime).getTime();
        const stageEnd = new Date(stage.endTime).getTime();
        if (isNaN(stageStart) || isNaN(stageEnd)) continue;

        const stageDuration = (stageEnd - stageStart) / 1000;
        if (stageDuration <= 0) continue;

        const stageType = mapHealthConnectSleepStage(stage.stage);
        if (!stageType) continue;

        hasRecognizedStages = true;
        stageEvents.push({
          stage_type: stageType,
          start_time: new Date(stageStart).toISOString(),
          end_time: new Date(stageEnd).toISOString(),
          duration_in_seconds: stageDuration,
        });

        switch (stageType) {
          case 'deep': deepSeconds += stageDuration; break;
          case 'light': lightSeconds += stageDuration; break;
          case 'rem': remSeconds += stageDuration; break;
          case 'awake': awakeSeconds += stageDuration; break;
        }
      }
    }

    const timeAsleep = hasRecognizedStages
      ? deepSeconds + lightSeconds + remSeconds
      : durationInSeconds;

    const sleepSession: AggregatedSleepSession = {
      type: 'SleepSession',
      source: HEALTH_CONNECT_SOURCE,
      timestamp: rec.startTime as string,
      entry_date: recordDate,
      bedtime: rec.startTime as string,
      wake_time: rec.endTime as string,
      duration_in_seconds: durationInSeconds,
      time_asleep_in_seconds: timeAsleep,
      stage_events: stageEvents,
      sleep_score: 0,
      deep_sleep_seconds: deepSeconds,
      light_sleep_seconds: hasRecognizedStages ? lightSeconds : durationInSeconds,
      rem_sleep_seconds: remSeconds,
      awake_sleep_seconds: awakeSeconds,
      ...extractTimezoneMetadata(rec, true),
    };
    output.push(sleepSession);
  },

  ExerciseSession: (rec, record, _metricConfig, output) => {
    if (!rec.startTime || !rec.endTime) return;

    const start = new Date(rec.startTime as string).getTime();
    const end = new Date(rec.endTime as string).getTime();
    if (isNaN(start) || isNaN(end)) return;

    const durationInSeconds = (end - start) / 1000;
    if (durationInSeconds <= 0) return;
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

    // Exercise entries store distance in kilometers, but Health Connect
    // returns aggregate session distance in meters.
    let distanceKm = 0;
    const distanceObj = rec.distance as Record<string, number> | undefined;
    if (distanceObj?.inMeters != null && !isNaN(distanceObj.inMeters)) {
      distanceKm = distanceObj.inMeters / 1000;
    }

    const metadata = rec.metadata as { id?: string } | undefined;

    const exerciseSession: TransformedExerciseSession = {
      type: 'ExerciseSession',
      source: HEALTH_CONNECT_SOURCE,
      date: recordDate,
      entry_date: recordDate,
      timestamp: rec.startTime as string,
      startTime: rec.startTime as string,
      endTime: rec.endTime as string,
      duration: durationInSeconds,
      activityType: activityTypeName,
      title: title,
      caloriesBurned: parseFloat(caloriesBurned.toFixed(2)),
      distance: parseFloat(distanceKm.toFixed(2)),
      notes: rec.notes as string | undefined,
      raw_data: record,
      sets: [{ set_number: 1, set_type: 'Working Set', duration: Math.round(durationInSeconds / 60) }],
      source_id: metadata?.id,
      ...extractTimezoneMetadata(rec),
    };
    output.push(exerciseSession);
  },

  MenstruationPeriod: (rec, _record, metricConfig, output) => {
    if (!rec.startTime || !rec.endTime) return;

    const { unit, type } = metricConfig;
    const start = new Date(rec.startTime as string);
    const end = new Date(rec.endTime as string);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return;

    // Normalize to local midnight so a record like day1 20:00 → day2 08:00 still
    // emits both calendar days (the loop otherwise terminates after day 1).
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    for (let d = startDay; d <= endDay; d.setDate(d.getDate() + 1)) {
      output.push({
        value: 1,
        type,
        date: toLocalDateString(d),
        unit,
        source: HEALTH_CONNECT_SOURCE,
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
        source: HEALTH_CONNECT_SOURCE,
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
        source: HEALTH_CONNECT_SOURCE,
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
        addLog(`[Transform] ${logLabel} (aggregated as ${rec.type}) on ${recordDate}`, 'DEBUG');
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
        addLog(`[Transform] ${logLabel} (raw) on ${date}`, 'DEBUG');
      }
      return { value, date };
    }

    if (index === 0) {
      addLog(`[Transform] ${logLabel} FAILED: missing ${value === null ? 'value' : 'date'}`, 'WARNING');
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
    addLog(`[HealthConnectService] transformHealthRecords received non-array records for ${metricConfig.recordType}`, 'WARNING');
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

      // Handle pre-aggregated records (from deduplicating aggregation functions)
      // These have value and date at top level — raw Health Connect records never do
      if (rec.value !== undefined && rec.date) {
        const value = rec.value as number;
        const recordDate = rec.date as string;
        const outputType = (rec.type as string) || type;

        if (value !== null && !isNaN(value)) {
          const transformed: TransformedRecord = {
            value: parseFloat(value.toFixed(2)),
            type: outputType,
            date: recordDate,
            unit,
            source: HEALTH_CONNECT_SOURCE,
          };
          // Forward timezone metadata from aggregation layer
          if (rec.record_timezone != null) {
            transformed.record_timezone = rec.record_timezone as string;
          }
          if (rec.record_utc_offset_minutes != null) {
            transformed.record_utc_offset_minutes = rec.record_utc_offset_minutes as number;
          }
          transformedData.push(transformed);
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
            source: HEALTH_CONNECT_SOURCE,
            ...extractTimezoneMetadata(rec),
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
            source: HEALTH_CONNECT_SOURCE,
          });
          successCount++;
        } else {
          skipCount++;
        }
        return;
      }

      // Unhandled record type
      if (index === 0) {
        addLog(`[HealthConnectService] No transformer found for record type: ${recordType}`, 'WARNING');
      }
      skipCount++;
    } catch (error) {
      skipCount++;
      addLog(`[HealthConnectService] Error transforming ${recordType} record at index ${index}: ${(error as Error).message}`, 'WARNING');
    }
  });

  // Log transformation summary for debugging
  if (skipCount > 0) {
    addLog(`[HealthConnectService] ${recordType} transformation: ${successCount} succeeded, ${skipCount} skipped (of ${records.length} total)`, 'DEBUG');
  }

  return transformedData;
};
