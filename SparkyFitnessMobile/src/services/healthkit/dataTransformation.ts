import { addLog } from '../LogService';
import {
  TransformedExerciseSession,
  TransformedNutritionEntry,
  SparkyMealType,
  AggregatedSleepSession,
  RecordTimezoneMetadata,
  HEALTHKIT_SOURCE,
} from '../../types/healthRecords';
import {
  createBloodPressureTransformer,
  createGetDateString,
  createHydrationTransformer,
  createTransformHealthRecords,
  extractDirectValue,
  extractNestedValue,
  BLOOD_GLUCOSE_MG_DL_PER_MMOL_L,
  G_TO_MG,
  G_TO_MCG,
  tidyNumber,
  type DirectTransformer,
  type ValueTransformer,
} from '../shared/dataTransformation';
import { DIETARY_HK_MAP, DIETARY_ENERGY_IDENTIFIER } from './writebackMappers';

// ============================================================================
// Own-app exclusion (read/write feedback-loop guard)
// ============================================================================

// HealthKit returns DietaryWater samples written by *this* app too. If hydration
// writeback is on, re-importing them would duplicate diary water (and compound every
// sync). We skip records whose source bundle id is our own. The bundle id is injected
// from the service layer (setOwnBundleId) so this pure module needs no
// expo-application / healthkit import. Mirrors Android's setOwnPackageName guard.
let ownBundleId: string | null = null;
export const setOwnBundleId = (id: string | null): void => {
  ownBundleId = id;
};

const isOwnRecord = (rec: Record<string, unknown>): boolean => {
  if (!ownBundleId) return false;
  return (rec.sourceBundleId as string | undefined) === ownBundleId;
};

// ============================================================================
// Transformer Infrastructure
// ============================================================================

// Wrapper for toLocalDateString that handles unknown input and errors
const getDateString = createGetDateString('[HealthKitService]');

// ============================================================================
// Value Extractors - reusable functions for nested property extraction
// ============================================================================

const extractPercentAsDecimal = (rec: Record<string, unknown>): number | null => {
  const val = rec.value;
  return typeof val === 'number' ? val * 100 : null;
};

const extractPercentValue = (rec: Record<string, unknown>): number | null =>
  extractNestedValue(rec, 'percentage', 'inPercent') ?? extractPercentAsDecimal(rec);

// ============================================================================
// Timezone Metadata Extraction
// ============================================================================

/**
 * Extract IANA timezone from HealthKit record metadata.
 * HealthKit records may carry metadata.HKTimeZone as an IANA timezone string.
 * Only returns metadata when a valid timezone is found.
 */
export const extractTimezoneMetadata = (rec: Record<string, unknown>): RecordTimezoneMetadata => {
  const metadata = rec.metadata as Record<string, unknown> | undefined;
  const tz = metadata?.HKTimeZone as string | undefined;
  if (tz) {
    return { record_timezone: tz };
  }
  return {};
};

// ============================================================================
// Dietary nutrient reverse mapping (HealthKit Food correlation → Sparky columns)
// ============================================================================

// Read inverse of the writeback's DIETARY_HK_MAP. Reversing the same map the write
// side builds guarantees read and write agree on every column's storage unit (they can
// never drift). Energy maps to the `calories` column; each mapped nutrient maps to its
// Sparky column in that column's storage unit (g for macros, mg/mcg for micros).
// `trans_fat` stays absent — it has no HealthKit identifier, consistent with writeback.
interface NutrientColumn {
  column: string;
  /** Unit Sparky stores this column in — 'kcal' for energy, else 'g' | 'mg' | 'mcg'. */
  unit: string;
}

const NUTRIENT_BY_IDENTIFIER: Record<string, NutrientColumn> = {
  [DIETARY_ENERGY_IDENTIFIER]: { column: 'calories', unit: 'kcal' },
};
for (const [column, { identifier, unit }] of Object.entries(DIETARY_HK_MAP)) {
  NUTRIENT_BY_IDENTIFIER[identifier] = { column, unit };
}

// HealthKit returns each correlation sample in the source app's *preferred* unit
// (correlation queries take no unit param), so the read mapper must be unit-aware.
// Mass nutrients normalize through grams; energy through kilocalories.
const MASS_TO_GRAMS: Record<string, number> = {
  g: 1,
  mg: 1e-3,
  mcg: 1e-6,
  'µg': 1e-6,
  ug: 1e-6,
  kg: 1e3,
  oz: 28.349523125,
  lb: 453.59237,
};

// HealthKit energy unit symbols: 'kcal' (kilocalorie) and 'Cal' (large/food Calorie) are
// both 1 kcal — 'Cal' is what MyFitnessPal/Cronometer samples come back as. 'cal' is the
// small calorie (1/1000 kcal), same convention HC's extractEnergyKcal uses for inCalories.
const ENERGY_TO_KCAL: Record<string, number> = {
  kcal: 1,
  Cal: 1,
  cal: 1e-3,
  kJ: 1 / 4.184,
  J: 1 / 4184,
};

// grams → the column's storage unit, keyed by that storage unit string. Built from the
// same G_TO_MG / G_TO_MCG factors the HC read and HealthKit write directions use.
const GRAMS_TO_STORAGE: Record<string, number> = {
  g: 1,
  mg: G_TO_MG,
  mcg: G_TO_MCG,
};

/** One dietary quantity sample contained in a HealthKit Food correlation. */
export interface DietarySampleInput {
  quantityType: string;
  quantity: number;
  unit: string;
}

/**
 * Map one contained dietary quantity sample to its Sparky column + value, converting
 * from HealthKit's returned unit to the column's storage unit. Returns null when:
 *  - the quantity type isn't a column Sparky stores (water, trans fat, fiber subtypes…),
 *  - the value is non-positive (mirrors HC's "0/absent → unknown" omission), or
 *  - the returned unit is unrecognized — we warn and skip rather than guess a conversion.
 */
export const mapDietarySample = (
  sample: DietarySampleInput,
): { column: string; value: number } | null => {
  const mapping = NUTRIENT_BY_IDENTIFIER[sample.quantityType];
  if (!mapping) return null; // not a column Sparky stores

  const { quantity } = sample;
  if (quantity == null || isNaN(quantity) || quantity <= 0) return null; // omit non-positive

  const unit = (sample.unit ?? '').trim();

  if (mapping.unit === 'kcal') {
    const factor = ENERGY_TO_KCAL[unit];
    if (factor == null) {
      addLog(`[HealthKitService] Unknown dietary energy unit '${sample.unit}' for ${sample.quantityType}; skipping sample`, 'WARNING');
      return null;
    }
    return { column: mapping.column, value: tidyNumber(quantity * factor) };
  }

  const toGrams = MASS_TO_GRAMS[unit];
  if (toGrams == null) {
    addLog(`[HealthKitService] Unknown dietary mass unit '${sample.unit}' for ${sample.quantityType}; skipping sample`, 'WARNING');
    return null;
  }
  const storageFactor = GRAMS_TO_STORAGE[mapping.unit] ?? 1;
  return { column: mapping.column, value: tidyNumber(quantity * toGrams * storageFactor) };
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

  Hydration: createHydrationTransformer(isOwnRecord, getDateString),

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
    const value = extractPercentValue(rec);
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  BloodOxygenSaturation: (rec) => {
    const value = extractPercentValue(rec);
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
      value = level.inMilligramsPerDeciliter / BLOOD_GLUCOSE_MG_DL_PER_MMOL_L;
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
  HeartRateVariabilitySDNN: (rec) => {
    const value = extractDirectValue(rec, 'value');
    const date = getDateString(rec.time);
    return value !== null && date ? { value, date } : null;
  },

  HeartRate: (rec) => {
    const samples = rec.samples as { beatsPerMinute: number }[] | undefined;
    const value = samples?.[0]?.beatsPerMinute ?? null;
    const date = getDateString(rec.startTime);
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
];

SIMPLE_VALUE_TYPES_START_TIME.forEach(type => {
  VALUE_TRANSFORMERS[type] = createSimpleValueTransformer(true);
});

// Dietary nutrient reads share the simple-value shape but must drop the samples Sparky
// itself wrote: with nutrition writeback on, HealthKit returns our own nutrient samples
// and re-importing them would duplicate diary nutrition (and compound every sync). Same
// feedback-loop guard as Hydration. Mirrors Android's setOwnPackageName guard.
const DIETARY_READ_TYPES = ['DietaryFatTotal', 'DietaryProtein', 'DietarySodium'];

DIETARY_READ_TYPES.forEach(type => {
  const base = createSimpleValueTransformer(true);
  VALUE_TRANSFORMERS[type] = (rec, metricConfig, index) => (isOwnRecord(rec) ? null : base(rec, metricConfig, index));
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

// HKWorkoutActivityType Mapping — matches WorkoutActivityType enum from @kingstinct/react-native-healthkit
// Source: https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype
const ACTIVITY_MAP: Record<number, string> = {
  1: 'American Football', 2: 'Archery', 3: 'Australian Football', 4: 'Badminton',
  5: 'Baseball', 6: 'Basketball', 7: 'Bowling', 8: 'Boxing', 9: 'Climbing',
  10: 'Cricket', 11: 'Cross Training', 12: 'Curling', 13: 'Cycling',
  14: 'Dance', 15: 'Dance Inspired Training', 16: 'Elliptical',
  17: 'Equestrian Sports', 18: 'Fencing',
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
  73: 'Mixed Cardio', 74: 'Hand Cycling', 75: 'Disc Sports',
  76: 'Fitness Gaming', 77: 'Cardio Dance', 78: 'Social Dance',
  79: 'Pickleball', 80: 'Cooldown', 82: 'Swim Bike Run',
  83: 'Transition', 84: 'Underwater Diving',
} as const;

// Food correlations carry only an instant, not a meal label, so we infer the meal type
// from the local time of day (fallback 'snacks'; the server also defaults to snacks).
const mealTypeFromInstant = (date: Date): SparkyMealType => {
  const hour = date.getHours();
  if (hour >= 4 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snacks';
};

const DIRECT_TRANSFORMERS: Record<string, DirectTransformer> = {
  // One HealthKit Food correlation → one Sparky food entry. The handler in index.ts
  // has already normalized the correlation to a plain record with `objects`
  // (contained dietary quantity samples), `metadataFoodType`, `uuid`, `startDate`,
  // `sourceBundleId`, and `metadata.HKTimeZone`. Mirrors Android's Nutrition transformer
  // so the upload path is identical.
  Nutrition: (rec, _record, _metricConfig, output) => {
    if (isOwnRecord(rec)) return; // don't re-import nutrition Sparky wrote

    // The server keys idempotent re-sync on source_id; an id-less record would create a
    // duplicate entry on every sync, so skip it.
    const uuid = rec.uuid as string | undefined;
    if (!uuid) return;

    const startDate = rec.startDate as string | undefined;
    if (!startDate) return;

    const objects = rec.objects as { quantityType?: string; quantity?: number; unit?: string }[] | undefined;
    if (!Array.isArray(objects) || objects.length === 0) return;

    // Send only the instant (timestamp) plus tz metadata, never a pre-bucketed day
    // string: the server derives the calendar day from the instant + timezone.
    const entry: TransformedNutritionEntry = {
      type: 'Nutrition',
      source: HEALTHKIT_SOURCE,
      source_id: uuid,
      timestamp: startDate,
      food_name: (rec.metadataFoodType as string) || 'Apple Health food',
      meal_type: mealTypeFromInstant(new Date(startDate)),
      ...extractTimezoneMetadata(rec),
    };

    let hasNutrient = false;
    for (const obj of objects) {
      // A Food correlation may contain CategorySamples too — skip anything that isn't a
      // dietary quantity sample before mapping.
      if (!obj || typeof obj.quantityType !== 'string') continue;
      const mapped = mapDietarySample({
        quantityType: obj.quantityType,
        quantity: obj.quantity as number,
        unit: obj.unit as string,
      });
      if (!mapped) continue;
      (entry as unknown as Record<string, unknown>)[mapped.column] = mapped.value;
      hasNutrient = true;
    }

    if (!hasNutrient) return; // no recognized positive nutrients — drop the entry
    output.push(entry);
  },

  BloodPressure: createBloodPressureTransformer(HEALTHKIT_SOURCE, getDateString),

  SleepSession: (rec, _record, _metricConfig, output) => {
    const sleepRec = rec as unknown as AggregatedSleepSession;
    const session: AggregatedSleepSession = {
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
    };
    if (sleepRec.record_timezone) {
      session.record_timezone = sleepRec.record_timezone;
    }
    if (sleepRec.record_utc_offset_minutes != null) {
      session.record_utc_offset_minutes = sleepRec.record_utc_offset_minutes;
    }
    output.push(session);
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

    // Prefer record-level timezone; fall back to device timezone for HealthKit workouts
    const tzMeta = extractTimezoneMetadata(rec);
    const timezone: RecordTimezoneMetadata = Object.keys(tzMeta).length > 0
      ? tzMeta
      : { record_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    const totalDistanceMeters = typeof rec.totalDistance === 'number' ? rec.totalDistance : 0;

    const exerciseSession: TransformedExerciseSession = {
      type: 'ExerciseSession',
      source: HEALTHKIT_SOURCE,
      date: getDateString(rec.startTime) || '',
      entry_date: getDateString(rec.startTime) || '',
      timestamp: rec.startTime as string,
      startTime: rec.startTime as string,
      endTime: rec.endTime as string,
      duration: durationInSeconds,
      activityType: activityTypeName,
      title: activityTypeName,
      caloriesBurned: rec.totalEnergyBurned as number || 0,
      distance: parseFloat((totalDistanceMeters / 1000).toFixed(2)),
      notes: 'Source: HealthKit',
      raw_data: record,
      sets: [{ set_number: 1, set_type: 'Working Set', duration: Math.round(durationInSeconds / 60) }],
      source_id: rec.uuid as string | undefined,
      ...timezone,
    };
    output.push(exerciseSession);
  },
};

// ExerciseSession uses same transformer as Workout
DIRECT_TRANSFORMERS['ExerciseSession'] = DIRECT_TRANSFORMERS['Workout'];

export const transformHealthRecords = createTransformHealthRecords({
  source: HEALTHKIT_SOURCE,
  logTag: '[HealthKitService]',
  valueTransformers: VALUE_TRANSFORMERS,
  directTransformers: DIRECT_TRANSFORMERS,
  extractTimezoneMetadata,
});
