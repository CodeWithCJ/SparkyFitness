import { log } from '../config/logging.js';
import measurementRepository from '../models/measurementRepository.js';
import exerciseDb from '../models/exercise.js';
import exerciseEntryDb, {
  EXERCISE_ENTRY_TELEMETRY_COLUMNS,
} from '../models/exerciseEntry.js';
import foodRepository from '../models/foodRepository.js';
import moodRepository from '../models/moodRepository.js';
import waterContainerRepository from '../models/waterContainerRepository.js';
import * as workoutTelemetryRepo from '../models/workoutTelemetryRepository.js';
import * as mindfulnessRepository from '../models/mindfulnessRepository.js';
import { resolveActivityMapping } from './workoutActivityMapping.js';
import {
  computeHrZones,
  resolveMaxHr,
  type HrSample,
} from './hrZoneCalculator.js';
import {
  deriveLaps,
  deriveWorkoutTelemetry,
  type LapWindow,
  type TelemetryGpsPoint,
} from './workoutTelemetryDerivation.js';
import { upsertSamplesByDay } from './healthMetricSampleWriter.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import * as genericHealthRepository from '../models/genericHealthRepository.js';
import {
  BUILT_IN_MOODS,
  instantHourMinute,
  instantToDay,
  MAX_HEALTH_TOTAL_CALORIES_PER_DAY,
  MIN_MEASURED_BMR_KCAL,
  MAX_MEASURED_BMR_KCAL,
  todayInZone,
} from '@workspace/shared';

/**
 * Per-type handlers for processHealthData. Each handler owns the validation
 * and persistence of one health record type; measurementService owns the
 * batch orchestration (timezone/date resolution, pre-cleanup, result
 * assembly) and injects its per-request dependencies via HealthEntryContext,
 * which keeps this module free of import cycles.
 */

/**
 * Default units for health metric types when not provided by client (e.g. HealthConnect sync).
 * Ensures graphs and UI show a unit instead of "N/A". Aligned with mobile HealthMetrics and API usage.
 */
const DEFAULT_UNITS_BY_HEALTH_TYPE = {
  step: 'steps',
  steps: 'steps',
  heart_rate: 'bpm',
  HeartRate: 'bpm',
  'Active Calories': 'kcal',
  ActiveCaloriesBurned: 'kcal',
  total_calories: 'kcal',
  TotalCaloriesBurned: 'kcal',
  distance: 'm',
  Distance: 'm',
  floors_climbed: 'count',
  FloorsClimbed: 'count',
  weight: 'kg',
  Weight: 'kg',
  sleep_session: 'min',
  SleepSession: 'min',
  stress: 'level',
  Stress: 'level',
  blood_pressure: 'mmHg',
  BloodPressure: 'mmHg',
  basal_metabolic_rate: 'kcal',
  BasalMetabolicRate: 'kcal',
  blood_glucose: 'mmol/L',
  BloodGlucose: 'mmol/L',
  body_fat: '%',
  BodyFat: '%',
  body_temperature: 'celsius',
  BodyTemperature: 'celsius',
  resting_heart_rate: 'bpm',
  RestingHeartRate: 'bpm',
  HRV: 'ms',
  HRV_SDNN: 'ms',
  respiratory_rate: 'breaths/min',
  RespiratoryRate: 'breaths/min',
  oxygen_saturation: '%',
  OxygenSaturation: '%',
  BloodOxygenSaturation: '%',
  vo2_max: 'ml/min/kg',
  Vo2Max: 'ml/min/kg',
  height: 'm',
  Height: 'm',
  neck: 'cm',
  waist: 'cm',
  hips: 'cm',
  hydration: 'L',
  Hydration: 'L',
  lean_body_mass: 'kg',
  LeanBodyMass: 'kg',
  basal_body_temperature: 'celsius',
  BasalBodyTemperature: 'celsius',
  elevation_gained: 'm',
  ElevationGained: 'm',
  bone_mass: 'kg',
  BoneMass: 'kg',
  speed: 'm/s',
  Speed: 'm/s',
  power: 'watts',
  Power: 'watts',
  steps_cadence: 'steps/min',
  StepsCadence: 'steps/min',
  cycling_pedaling_cadence: 'rpm',
  CyclingPedalingCadence: 'rpm',
  blood_alcohol_content: '%',
  BloodAlcoholContent: '%',
  nutrition: 'kcal',
  Nutrition: 'kcal',
  // Aggregated min/max/avg types from mobile health data
  // Chunk 1: Heart rate + vitals
  heart_rate_min: 'bpm',
  heart_rate_max: 'bpm',
  heart_rate_avg: 'bpm',
  blood_glucose_min: 'mmol/L',
  blood_glucose_max: 'mmol/L',
  blood_glucose_avg: 'mmol/L',
  blood_oxygen_saturation_min: 'percent',
  blood_oxygen_saturation_max: 'percent',
  blood_oxygen_saturation_avg: 'percent',
  respiratory_rate_min: 'breaths/min',
  respiratory_rate_max: 'breaths/min',
  respiratory_rate_avg: 'breaths/min',
  HRV_min: 'ms',
  HRV_max: 'ms',
  HRV_avg: 'ms',
  HRV_SDNN_min: 'ms',
  HRV_SDNN_max: 'ms',
  HRV_SDNN_avg: 'ms',
  // Chunk 2: Running metrics
  running_speed_min: 'm/s',
  running_speed_max: 'm/s',
  running_speed_avg: 'm/s',
  running_power_min: 'W',
  running_power_max: 'W',
  running_power_avg: 'W',
  running_stride_length_min: 'cm',
  running_stride_length_max: 'cm',
  running_stride_length_avg: 'cm',
  running_ground_contact_min: 'ms',
  running_ground_contact_max: 'ms',
  running_ground_contact_avg: 'ms',
  running_vertical_oscillation_min: 'cm',
  running_vertical_oscillation_max: 'cm',
  running_vertical_oscillation_avg: 'cm',
  // Chunk 3: Cycling metrics
  cycling_speed_min: 'm/s',
  cycling_speed_max: 'm/s',
  cycling_speed_avg: 'm/s',
  cycling_power_min: 'W',
  cycling_power_max: 'W',
  cycling_power_avg: 'W',
  cycling_cadence_min: 'rpm',
  cycling_cadence_max: 'rpm',
  cycling_cadence_avg: 'rpm',
  // Chunk 4: Walking / mobility metrics
  walking_speed_min: 'm/s',
  walking_speed_max: 'm/s',
  walking_speed_avg: 'm/s',
  walking_step_length_min: 'cm',
  walking_step_length_max: 'cm',
  walking_step_length_avg: 'cm',
  walking_asymmetry_min: 'percent',
  walking_asymmetry_max: 'percent',
  walking_asymmetry_avg: 'percent',
  walking_double_support_min: 'percent',
  walking_double_support_max: 'percent',
  walking_double_support_avg: 'percent',
  steps_cadence_min: 'steps/min',
  steps_cadence_max: 'steps/min',
  steps_cadence_avg: 'steps/min',
  // Chunk 5: Apple ring times + dietary (sum types)
  apple_move_time: 'seconds',
  apple_exercise_time: 'seconds',
  apple_stand_time: 'seconds',
  dietary_fat_total: 'g',
  dietary_protein: 'g',
  dietary_sodium: 'mg',
  // Chunk 6: Audio exposure
  environmental_audio_exposure_min: 'dB',
  environmental_audio_exposure_max: 'dB',
  environmental_audio_exposure_avg: 'dB',
  headphone_audio_exposure_min: 'dB',
  headphone_audio_exposure_max: 'dB',
  headphone_audio_exposure_avg: 'dB',
  // Last types
  cycling_ftp: 'W',
};
const METER_HEIGHT_UNITS = new Set(['m', 'meter', 'meters', 'metre', 'metres']);
const CENTIMETER_HEIGHT_UNITS = new Set([
  'cm',
  'centimeter',
  'centimeters',
  'centimetre',
  'centimetres',
]);

function normalizeHeightForCheckIn(value: unknown, unit: unknown) {
  const numericValue =
    typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(numericValue) || numericValue <= 0) {
    return null;
  }

  const normalizedUnit =
    typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  if (METER_HEIGHT_UNITS.has(normalizedUnit)) {
    return parseFloat((numericValue * 100).toFixed(2));
  }
  if (CENTIMETER_HEIGHT_UNITS.has(normalizedUnit)) {
    return numericValue;
  }

  return null;
}
const HEALTH_CONNECT_SLEEP_SOURCES = new Set([
  'Health Connect',
  'HealthConnect',
]);
const VALID_SLEEP_STAGE_TYPES = new Set([
  'awake',
  'rem',
  'light',
  'deep',
  'in_bed',
  'unknown',
]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isHealthConnectSleepSource(source: any) {
  return typeof source === 'string' && HEALTH_CONNECT_SLEEP_SOURCES.has(source);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeHealthConnectSleepStageEvents(stageEvents: any) {
  if (!Array.isArray(stageEvents)) {
    return [];
  }
  return stageEvents.reduce((sanitized, stageEvent) => {
    if (!stageEvent || typeof stageEvent !== 'object') {
      return sanitized;
    }
    const stageType =
      typeof stageEvent.stage_type === 'string'
        ? stageEvent.stage_type.toLowerCase()
        : null;
    if (!stageType || !VALID_SLEEP_STAGE_TYPES.has(stageType)) {
      return sanitized;
    }
    const startTime = new Date(stageEvent.start_time);
    const endTime = new Date(stageEvent.end_time);
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return sanitized;
    }
    let durationInSeconds = Number(stageEvent.duration_in_seconds);
    if (!Number.isFinite(durationInSeconds) || durationInSeconds <= 0) {
      durationInSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
    }
    durationInSeconds = Math.round(durationInSeconds);
    if (durationInSeconds <= 0) {
      return sanitized;
    }
    sanitized.push({
      stage_type: stageType,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_in_seconds: durationInSeconds,
    });
    return sanitized;
  }, []);
}

// Health Connect nutrient fields that map to dedicated food_entry columns.
// (Vitamins/minerals without a column arrive already grouped in custom_nutrients.)
const NUTRITION_DIRECT_COLUMNS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'potassium',
  'dietary_fiber',
  'sugars',
  'vitamin_a',
  'vitamin_c',
  'calcium',
  'iron',
  'caffeine_mg',
] as const;

// Maps the client's display label (dataEntry.source) to a stable provider tag
// used for food deduplication and diary entry source. Unknown/missing values
// fall back to 'health_connect' so existing Android data is byte-for-byte
// unchanged (Android sends 'Health Connect').
const PROVIDER_TYPE_BY_SOURCE: Record<string, string> = {
  'Health Connect': 'health_connect',
  HealthKit: 'healthkit',
};

function resolveProvider(source: string | undefined): {
  providerType: string;
  fallbackName: string;
} {
  const providerType =
    PROVIDER_TYPE_BY_SOURCE[source ?? ''] ?? 'health_connect';
  const fallbackName =
    providerType === 'healthkit' ? 'Apple Health food' : 'Health Connect food';
  return { providerType, fallbackName };
}

// Ingest a single health-platform NutritionRecord (Health Connect or HealthKit)
// as a food entry.
//
// A NutritionRecord is a *consumed amount*, not a per-serving food definition, so
// the food/variant is just a labelled container: we reuse one food per name
// (provider_external_id = name) and refresh its variant to the latest values,
// mirroring the Garmin nutrition path (findFoodByProviderExternalId /
// updateFoodVariantNutrition). The consumed nutrients are written onto the diary
// entry itself, so two different amounts of the same food keep their own values
// instead of collapsing to one variant's. The entry upserts by (source,
// source_id), so re-syncing the same record updates in place — which lets the
// client chunk freely without a destructive range-delete.
async function ingestNutritionFoodEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dataEntry: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  parsedDate: string
) {
  const { providerType, fallbackName } = resolveProvider(dataEntry.source);
  const trimmedName =
    typeof dataEntry.food_name === 'string' ? dataEntry.food_name.trim() : '';
  const foodName = trimmedName || fallbackName;
  // Named records reuse one food per name; nameless ones key off the record id so
  // each gets its own (hidden) food instead of collapsing onto a single shared
  // 'Health Connect food' row whose variant would churn on every sync.
  const providerExternalId = trimmedName || dataEntry.source_id || foodName;

  // Consumed nutrients (serving_size = 1, so one serving = the consumed amount).
  // Fields the provider omitted are stored as null, never a phantom 0.
  const nutrients: Record<string, number | null> = {};
  for (const field of NUTRITION_DIRECT_COLUMNS) {
    nutrients[field] = dataEntry[field] ?? null;
  }

  // Reuse this provider's food for the same external id if present (refreshing its
  // variant to the latest values), else create it. The provider_type scoping
  // keeps user-authored library foods untouched.
  let food = await foodRepository.findFoodByProviderExternalId(
    userId,
    providerExternalId,
    providerType
  );
  let variantId = food?.default_variant_id ?? food?.default_variant?.id;
  if (food && variantId) {
    await foodRepository.updateFoodVariantNutrition(variantId, userId, {
      serving_size: 1,
      serving_unit: 'serving',
      ...nutrients,
    });
  } else {
    food = await foodRepository.createFood({
      name: foodName,
      user_id: userId,
      is_custom: false,
      // Hidden from food search (these are diary-only provider entries, and the
      // generic fallback food name would otherwise clutter results).
      is_quick_food: true,
      provider_type: providerType,
      provider_external_id: providerExternalId,
      shared_with_public: false,
      // food_variants.source is constrained to manual|ai_estimate|imported.
      source: 'imported',
      serving_size: 1,
      serving_unit: 'serving',
      ...nutrients,
    });
    variantId = food.default_variant_id ?? food.default_variant?.id;
  }

  // The consumed nutrients are passed through as snapshot overrides so the entry
  // keeps its own values; createFoodEntry upserts on (user, source, source_id).
  return foodRepository.createFoodEntry(
    {
      user_id: userId,
      food_id: food.id,
      variant_id: variantId,
      quantity: 1,
      unit: 'serving',
      entry_date: parsedDate,
      meal_type: dataEntry.meal_type || 'snacks',
      serving_size: 1,
      serving_unit: 'serving',
      food_name: foodName,
      ...nutrients,
      // Idempotency key. Tagged with the provider tag (not the client's display
      // label) so it stays consistent with the food's provider_type.
      source: providerType,
      source_id: dataEntry.source_id || null,
    },
    actingUserId
  );
}

// ── Registry types ─────────────────────────────────────────────────────────

/**
 * Per-request dependencies injected by processHealthData. processSleepEntry
 * and resolveCategory live in measurementService and are passed in rather
 * than imported so this module stays cycle-free (and so the orchestrator can
 * swap in a request-scoped category resolver without touching handlers).
 */
export interface HealthBatchContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSleepContext: () => Promise<{ tz: string; userProfile: any }>;
  processSleepEntry: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    userId: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    actingUserId: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sleepEntryData: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sleepContext: { tz: string; userProfile: any }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;
  resolveCategory: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    userId: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    actingUserId: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    categoryName: any,
    dataType?: string,
    measurementType?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;
  /**
   * True when the client predates the seconds-based workout set model
   * (no X-Workout-Model-Version header) and sends per-set duration in minutes.
   */
  legacyWorkoutSetMinutes?: boolean;
}

/** HealthBatchContext plus the per-entry resolved date values. */
export interface HealthEntryContext extends HealthBatchContext {
  parsedDate: string;
  entryTimestamp: string;
  entryHour: number;
}

/** An entry with its resolved date values, as queued for a handleBatch call. */
export interface PreparedHealthEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entry: any;
  parsedDate: string;
  entryTimestamp: string;
  entryHour: number;
}

export type HandlerOutcome =
  | { status: 'success'; data: unknown }
  | { status: 'error'; error: string }
  | { status: 'skipped'; reason: string };

export type HandleBatchFn = (
  entries: PreparedHealthEntry[],
  ctx: HealthBatchContext
) => Promise<HandlerOutcome[]>;

export interface HealthTypeHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle(entry: any, ctx: HealthEntryContext): Promise<HandlerOutcome>;
  /**
   * Optional batched write path. The orchestrator groups entries by
   * handleBatch function identity (handlers sharing one fn share a write
   * group), preserving payload order within the group, and expects one
   * outcome per prepared entry, aligned by index. Per-record validation stays
   * per-record inside the batch so a bad value errors only its own record; a
   * failed batch write attributes the error to every record in that write.
   */
  handleBatch?: HandleBatchFn;
}

// ── Category resolution ─────────────────────────────────────────────────────

// Friendly display names for health-derived categories whose `type` key is technical.
// Surfaced via custom_categories.display_name, which the web renders as
// `display_name || name` across check-in, reports, and CSV export.
export const HEALTH_TYPE_DISPLAY_NAMES: Record<string, string> = {
  HRV: 'HRV (RMSSD)',
  HRV_SDNN: 'HRV (SDNN)',
};

/**
 * Request-scoped category resolver: fetches the user's categories once per
 * request and answers subsequent lookups (and remembers creations) from a
 * name-keyed map, instead of getOrCreateCustomCategory's
 * fetch-all-then-find per record. The get-or-create semantics (display-name
 * backfill, creation defaults) replicate getOrCreateCustomCategory exactly.
 */
export function createCategoryResolver(): HealthBatchContext['resolveCategory'] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let categoriesByName: Map<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadCategories = async (userId: any) => {
    if (!categoriesByName) {
      const existingCategories =
        await measurementRepository.getCustomCategories(userId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categoriesByName = new Map<string, any>();
      for (const category of existingCategories) {
        // Keep the first category per name, matching the .find() the
        // per-record lookup uses.
        if (!categoriesByName.has(category.name)) {
          categoriesByName.set(category.name, category);
        }
      }
    }
    return categoriesByName;
  };
  return async (
    userId,
    actingUserId,
    categoryName,
    dataType = 'numeric',
    measurementType = 'N/A'
  ) => {
    const byName = await loadCategories(userId);
    const displayName = HEALTH_TYPE_DISPLAY_NAMES[categoryName as string];
    const category = byName.get(categoryName);
    if (category) {
      // Backfill a friendly display_name for health-derived categories created
      // before labels existed (e.g. the HRV category first added by Fitbit/Google).
      if (displayName && !category.display_name) {
        await measurementRepository.updateCustomCategory(
          category.id,
          userId,
          actingUserId,
          { display_name: displayName }
        );
        const updated = { ...category, display_name: displayName };
        byName.set(categoryName, updated);
        return updated;
      }
      return category;
    }
    // Create new category if it doesn't exist
    const newCategoryData = {
      user_id: userId,
      created_by_user_id: actingUserId, // Use actingUserId for audit
      name: categoryName,
      display_name: displayName ?? null,
      measurement_type: measurementType, // Default to numeric for Health Connect data
      frequency: 'Daily', // Default frequency, can be refined later if needed
      data_type: dataType, // Default to numeric for new categories from health data
    };
    const newCategory =
      await measurementRepository.createCustomCategory(newCategoryData);
    // The stored settings win: a concurrent create may have made the category first.
    const created = { ...newCategoryData, ...newCategory.category };
    byName.set(categoryName, created);
    return created;
  };
}

// ── Handlers ────────────────────────────────────────────────────────────────

// Validates a check-in-family entry (steps/weight/body_fat/height) and maps it
// to its check_in_measurements column. One source of truth for both the
// per-entry and batched paths.
function prepareCheckInMeasurement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entry: any
):
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { measurements: Record<string, any> } | { error: string } {
  const canonical = TYPE_ALIASES[entry.type] ?? entry.type;
  switch (canonical) {
    case 'steps': {
      const stepValue = parseInt(entry.value, 10);
      if (isNaN(stepValue) || !Number.isInteger(stepValue)) {
        return { error: 'Invalid value for step. Must be an integer.' };
      }
      return { measurements: { steps: stepValue } };
    }
    case 'weight': {
      const numericValue = parseFloat(entry.value);
      if (isNaN(numericValue) || numericValue <= 0) {
        return {
          error: `Invalid value for ${entry.type}. Must be a positive number.`,
        };
      }
      return { measurements: { weight: numericValue } };
    }
    case 'body_fat': {
      const numericValue = parseFloat(entry.value);
      if (isNaN(numericValue) || numericValue <= 0 || numericValue > 100) {
        return {
          error: `Invalid value for ${entry.type}. Must be greater than 0 and at most 100.`,
        };
      }
      return { measurements: { body_fat_percentage: numericValue } };
    }
    case 'height': {
      const heightCm = normalizeHeightForCheckIn(
        entry.value,
        entry.unit ?? entry.measurementType
      );
      if (heightCm === null) {
        return {
          error: `Invalid value for ${entry.type}. Must be a positive number in meters or centimeters.`,
        };
      }
      return { measurements: { height: heightCm } };
    }
    case 'neck':
    case 'waist':
    case 'hips':
    case 'muscle_mass_kg':
    case 'bone_mass_kg': {
      // The smart-scale masses (muscle/bone) are stored in check_in_measurements;
      // providers normalize before dispatch — Garmin via grams_to_kg in the
      // Python service, Withings via its kg-denominated measure types.
      const numericValue = parseFloat(entry.value);
      if (isNaN(numericValue) || numericValue <= 0) {
        return {
          error: `Invalid value for ${entry.type}. Must be a positive number.`,
        };
      }
      return { measurements: { [canonical]: numericValue } };
    }
    case 'bmr': {
      const trimmed = String(entry.value).trim();
      const numericValue = Number(trimmed);
      if (
        trimmed === '' ||
        !Number.isFinite(numericValue) ||
        numericValue < MIN_MEASURED_BMR_KCAL ||
        numericValue > MAX_MEASURED_BMR_KCAL
      ) {
        return {
          error: `Invalid value for ${entry.type}. Must be between ${MIN_MEASURED_BMR_KCAL} and ${MAX_MEASURED_BMR_KCAL} kcal.`,
        };
      }
      return { measurements: { [canonical]: numericValue } };
    }
    case 'body_water_percentage': {
      const numericValue = parseFloat(entry.value);
      if (isNaN(numericValue) || numericValue <= 0 || numericValue > 100) {
        return {
          error: `Invalid value for ${entry.type}. Must be greater than 0 and at most 100.`,
        };
      }
      return { measurements: { body_water_percentage: numericValue } };
    }
    default:
      // Unreachable: only the check-in handlers route here.
      return { error: `Unsupported check-in measurement type: ${entry.type}` };
  }
}

// Health Connect only exposes body water as a mass (BodyWaterMassRecord, kg),
// while check_in_measurements stores it as body_water_percentage. Convert each
// body_water_mass record with the same day's weight: from this batch first
// (later record wins, matching the merge below), otherwise from the stored
// check-in. Without a weight for that day the record is skipped rather than
// estimated from another day.
async function resolveBodyWaterPercentages(
  entries: PreparedHealthEntry[],
  ctx: HealthBatchContext
): Promise<
  Map<
    number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | { measurements: Record<string, any> }
    | { error: string }
    | { skipped: string }
  >
> {
  const resolved = new Map<
    number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | { measurements: Record<string, any> }
    | { error: string }
    | { skipped: string }
  >();
  const pending: Array<{ index: number; entryDate: string; massKg: number }> =
    [];
  const batchWeights = new Map<string, number>();
  entries.forEach(({ entry, parsedDate }, index) => {
    const canonical = TYPE_ALIASES[entry?.type] ?? entry?.type;
    if (canonical === 'weight') {
      const prepared = prepareCheckInMeasurement(entry);
      if (!('error' in prepared)) {
        batchWeights.set(parsedDate, prepared.measurements.weight);
      }
    } else if (canonical === 'body_water_mass') {
      const massKg = parseFloat(entry.value);
      if (isNaN(massKg) || massKg <= 0) {
        resolved.set(index, {
          error: `Invalid value for ${entry.type}. Must be a positive number.`,
        });
      } else {
        pending.push({ index, entryDate: parsedDate, massKg });
      }
    }
  });
  if (pending.length === 0) {
    return resolved;
  }

  const datesWithoutBatchWeight = [
    ...new Set(
      pending
        .filter(({ entryDate }) => !batchWeights.has(entryDate))
        .map(({ entryDate }) => entryDate)
    ),
  ].sort();
  const storedWeights = new Map<string, number>();
  let lookupError: string | null = null;
  if (datesWithoutBatchWeight.length > 0) {
    try {
      const rows =
        await measurementRepository.getCheckInMeasurementsByDateRange(
          ctx.userId,
          datesWithoutBatchWeight[0],
          datesWithoutBatchWeight[datesWithoutBatchWeight.length - 1]
        );
      for (const row of rows ?? []) {
        const weight = Number(row.weight);
        // Number(null) is 0 and Number(undefined) is NaN, so both are excluded.
        if (weight > 0 && !storedWeights.has(row.entry_date)) {
          storedWeights.set(row.entry_date, weight);
        }
      }
    } catch (error) {
      lookupError = error instanceof Error ? error.message : String(error);
    }
  }

  for (const { index, entryDate, massKg } of pending) {
    const weight = batchWeights.get(entryDate) ?? storedWeights.get(entryDate);
    if (weight === undefined) {
      resolved.set(
        index,
        lookupError !== null
          ? { error: `Failed to process entry: ${lookupError}` }
          : {
              skipped:
                'Body water mass needs a weight on the same day to be stored as a percentage.',
            }
      );
      continue;
    }
    const percentage = Math.round((massKg / weight) * 10000) / 100;
    resolved.set(
      index,
      percentage > 100
        ? {
            error: `Invalid value for ${entries[index].entry.type}. Body water mass cannot exceed the weight of the same day.`,
          }
        : { measurements: { body_water_percentage: percentage } }
    );
  }
  return resolved;
}

// Shared batched write for the check-in family (steps/weight/body_fat/height):
// all valid records go through one bulkUpsertCheckInMeasurements call (one
// client + one transaction), with same-date records merged server-side
// (later record wins per column, matching the old sequential upserts).
/**
 * Sources whose BMR is a running daily total rather than a rate, so a value read
 * before the day ends is only part of it.
 */
const ACCUMULATING_BMR_SOURCES = new Set(['garmin']);

const checkInHandleBatch: HandleBatchFn = async (entries, ctx) => {
  const outcomes: HandlerOutcome[] = new Array(entries.length);
  const writes: Array<{
    index: number;
    entryDate: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    measurements: Record<string, any>;
  }> = [];
  // Garmin reports BMR as a daily *accumulation*, not a rate: `bmrKilocalories`
  // sits in the daily summary beside `totalKilocalories`, so a sync while the day
  // is still running hands back part of it. A 4am sync reported 716 kcal against a
  // ~1800 kcal formula estimate (issue #2395), and a late-afternoon one is worse
  // because it looks plausible enough to clear the ratio band.
  //
  // Scoped to those sources deliberately. HealthKit already keeps only fully
  // elapsed days and stamps each one with D+1 — the day it applies to — so a
  // blanket "refuse today" rejected precisely the value it is designed to send and
  // stopped iOS storing any BMR at all. Health Connect's BasalMetabolicRate is an
  // instantaneous rate and is fine on the current day too.
  const isAccumulatingBmrSource = (entry: { source?: unknown }) =>
    typeof entry?.source === 'string' &&
    ACCUMULATING_BMR_SOURCES.has(entry.source.toLowerCase());
  const hasGuardedBmrWrite = entries.some(
    (e) =>
      (e.entry?.type === 'bmr' || e.entry?.type === 'basal_metabolic_rate') &&
      isAccumulatingBmrSource(e.entry)
  );
  const todayForUser = hasGuardedBmrWrite
    ? todayInZone(await loadUserTimezone(ctx.userId))
    : null;
  const bodyWaterPercentages = await resolveBodyWaterPercentages(entries, ctx);
  for (let i = 0; i < entries.length; i++) {
    const prepared =
      bodyWaterPercentages.get(i) ??
      prepareCheckInMeasurement(entries[i].entry);
    if ('skipped' in prepared) {
      log(
        'info',
        `healthDataHandlers: skipping ${entries[i].entry?.type} for ${entries[i].parsedDate} — no weight on that day to convert it to a percentage.`
      );
      outcomes[i] = { status: 'skipped', reason: prepared.skipped };
      continue;
    }
    if ('error' in prepared) {
      outcomes[i] = { status: 'error', error: prepared.error };
      continue;
    }
    if (
      prepared.measurements.bmr !== undefined &&
      todayForUser !== null &&
      isAccumulatingBmrSource(entries[i].entry) &&
      entries[i].parsedDate >= todayForUser
    ) {
      delete prepared.measurements.bmr;
      log(
        'info',
        `healthDataHandlers: ignoring BMR for ${entries[i].parsedDate} from ${entries[i].entry?.source} — that source reports BMR as a daily total and the day is not complete in the user's timezone.`
      );
      if (Object.keys(prepared.measurements).length === 0) {
        outcomes[i] = {
          status: 'skipped',
          reason:
            'BMR is only accepted for a completed day, since some providers report it as a running daily total.',
        };
        continue;
      }
    }
    writes.push({
      index: i,
      entryDate: entries[i].parsedDate,
      measurements: prepared.measurements,
    });
  }
  if (writes.length > 0) {
    try {
      const written = await measurementRepository.bulkUpsertCheckInMeasurements(
        ctx.userId,
        ctx.actingUserId,
        writes.map(({ entryDate, measurements }) => ({
          entryDate,
          measurements,
        }))
      );
      writes.forEach((write, position) => {
        outcomes[write.index] = {
          status: 'success',
          data: written?.[position],
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A failed batch write fails every record in the write group (mirrors
      // the per-entry catch in processHealthData).
      for (const write of writes) {
        outcomes[write.index] = {
          status: 'error',
          error: `Failed to process entry: ${message}`,
        };
      }
    }
  }
  return outcomes;
};

// Per-entry path delegates to the batch write with a single-entry group so
// both paths share one implementation.
async function handleCheckInEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entry: any,
  ctx: HealthEntryContext
): Promise<HandlerOutcome> {
  const [outcome] = await checkInHandleBatch(
    [
      {
        entry,
        parsedDate: ctx.parsedDate,
        entryTimestamp: ctx.entryTimestamp,
        entryHour: ctx.entryHour,
      },
    ],
    ctx
  );
  return outcome;
}

const stepsHandler: HealthTypeHandler = {
  handle: handleCheckInEntry,
  handleBatch: checkInHandleBatch,
};

const waterHandler: HealthTypeHandler = {
  async handle(entry, ctx) {
    const { source = 'manual' } = entry;
    if (
      entry.value === null ||
      entry.value === undefined ||
      String(entry.value).trim() === ''
    ) {
      return {
        status: 'error',
        error: 'Invalid value for water. Must be a valid number.',
      };
    }
    const waterValue = Number(entry.value);
    if (!Number.isFinite(waterValue) || isNaN(waterValue)) {
      return {
        status: 'error',
        error: 'Invalid value for water. Must be a valid number.',
      };
    }
    if (waterValue <= 0) {
      return { status: 'success', data: null };
    }
    const result = await measurementRepository.upsertWaterData(
      ctx.userId,
      ctx.actingUserId,
      waterValue,
      ctx.parsedDate,
      source
    );
    return { status: 'success', data: result };
  },

  async handleBatch(entries, ctx) {
    const outcomes: HandlerOutcome[] = new Array(entries.length);
    if (entries.length === 0) return outcomes;

    // Group entries by source; each source is upserted independently.
    const entriesBySource = new Map<
      string,
      Array<{
        index: number;
        entry: PreparedHealthEntry['entry'];
        parsedDate: string;
        waterMl: number;
      }>
    >();
    for (let i = 0; i < entries.length; i++) {
      const item = entries[i];
      const source = (item.entry.source as string) || 'manual';
      if (
        item.entry.value === null ||
        item.entry.value === undefined ||
        String(item.entry.value).trim() === ''
      ) {
        outcomes[i] = {
          status: 'error',
          error: 'Invalid value for water. Must be a valid number.',
        };
        continue;
      }
      const waterValue = Number(item.entry.value);
      if (!Number.isFinite(waterValue) || isNaN(waterValue)) {
        outcomes[i] = {
          status: 'error',
          error: 'Invalid value for water. Must be a valid number.',
        };
        continue;
      }
      if (waterValue <= 0) {
        outcomes[i] = {
          status: 'success',
          data: null,
        };
        continue;
      }
      const existing = entriesBySource.get(source) || [];
      existing.push({
        index: i,
        entry: item.entry,
        parsedDate: item.parsedDate,
        waterMl: waterValue,
      });
      entriesBySource.set(source, existing);
    }

    // Synced entries log against the user's default container, same as manual entries.
    const primaryContainer =
      await waterContainerRepository.getPrimaryWaterContainerByUserId(
        ctx.userId
      );
    const primaryContainerId = primaryContainer?.id ?? null;
    const primaryContainerName = primaryContainer?.name || 'Default';

    for (const [source, group] of entriesBySource) {
      if (group.length === 0) continue;

      const samples = group.map((g) => ({
        entryDate: g.parsedDate,
        waterMl: g.waterMl,
        containerId: primaryContainerId,
        containerName: primaryContainerName,
        source,
        sourceId: (g.entry.source_id as string) || null,
        loggedAt:
          (g.entry.timestamp as string) ||
          (g.entry.startTime as string) ||
          null,
      }));

      try {
        // Idempotent per-record upsert keyed on (user, source, sourceId).
        // Keyed samples never delete entries outside this batch, so
        // partial/incremental sync batches can't wipe out earlier same-day
        // entries; unkeyed non-manual samples (older apps, CSV imports)
        // replace their day's unkeyed rows instead so re-sends don't
        // duplicate.
        const written = await measurementRepository.upsertWaterIntakeSamples(
          ctx.userId,
          ctx.actingUserId,
          samples
        );
        group.forEach((g, pos) => {
          const row = written?.[pos];
          outcomes[g.index] = row
            ? { status: 'success', data: row }
            : { status: 'error', error: 'Water sample was not persisted' };
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log(
          'error',
          `[waterHandler.handleBatch] upsertWaterIntakeSamples failed for source '${source}' (${group.length} record(s)): ${msg}`,
          error
        );
        group.forEach((g) => {
          outcomes[g.index] = { status: 'error', error: msg };
        });
      }
    }

    return outcomes;
  },
};

const activeCaloriesHandler: HealthTypeHandler = {
  async handle(entry, ctx) {
    const { source = 'manual' } = entry;
    const activeCaloriesValue = parseFloat(entry.value);
    if (isNaN(activeCaloriesValue) || activeCaloriesValue < 0) {
      return {
        status: 'error',
        error:
          'Invalid value for active_calories. Must be a non-negative number.',
      };
    }
    const exerciseSource = source || 'Health Data';
    const exerciseId = await exerciseDb.getOrCreateActiveCaloriesExercise(
      ctx.userId,
      exerciseSource
    );
    const result = await exerciseEntryDb.upsertExerciseEntryData(
      ctx.userId,
      ctx.actingUserId,
      exerciseId,
      activeCaloriesValue,
      ctx.parsedDate,
      exerciseSource
    );
    return { status: 'success', data: result };
  },
};

const normalizeHealthSourceProvider = (source: unknown): string => {
  if (typeof source !== 'string' || source.trim() === '') {
    return 'health_connect';
  }
  const normalized = source
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return normalized === 'healthconnect' ? 'health_connect' : normalized;
};

const totalCaloriesHandler: HealthTypeHandler = {
  async handle(entry, ctx) {
    const rawValue: unknown = entry.value;
    const totalCaloriesValue =
      typeof rawValue === 'number'
        ? rawValue
        : typeof rawValue === 'string' && rawValue.trim() !== ''
          ? Number(rawValue)
          : Number.NaN;

    if (
      !Number.isFinite(totalCaloriesValue) ||
      totalCaloriesValue < 0 ||
      totalCaloriesValue > MAX_HEALTH_TOTAL_CALORIES_PER_DAY
    ) {
      return {
        status: 'error',
        error: `Invalid value for total_calories. Must be between 0 and ${MAX_HEALTH_TOTAL_CALORIES_PER_DAY}.`,
      };
    }

    const result = await genericHealthRepository.upsertDailyHealthMetrics(
      String(ctx.userId),
      String(ctx.actingUserId),
      {
        user_id: String(ctx.userId),
        entry_date: ctx.parsedDate,
        source_provider: normalizeHealthSourceProvider(entry.source),
        total_calories: totalCaloriesValue,
        total_calories_captured_at: new Date(ctx.entryTimestamp),
      }
    );
    return { status: 'success', data: result };
  },
};

const weightHandler: HealthTypeHandler = {
  handle: handleCheckInEntry,
  handleBatch: checkInHandleBatch,
};

const bodyFatHandler: HealthTypeHandler = {
  handle: handleCheckInEntry,
  handleBatch: checkInHandleBatch,
};

const heightHandler: HealthTypeHandler = {
  handle: handleCheckInEntry,
  handleBatch: checkInHandleBatch,
};

// Body-circumference measurements share the check-in write path so they land in
// their check_in_measurements columns (neck/waist/hips) rather than falling
// through to custom_measurements. Values are stored as-is; callers convert to
// the stored metric unit (cm) before sending.
const neckHandler: HealthTypeHandler = {
  handle: handleCheckInEntry,
  handleBatch: checkInHandleBatch,
};

const waistHandler: HealthTypeHandler = {
  handle: handleCheckInEntry,
  handleBatch: checkInHandleBatch,
};

const hipsHandler: HealthTypeHandler = {
  handle: handleCheckInEntry,
  handleBatch: checkInHandleBatch,
};

// Smart-scale composition. Shares the check-in write path so provider-synced
// values land in check_in_measurements alongside weight and body fat, rather
// than falling through to per-provider custom_measurements categories.
const muscleMassHandler: HealthTypeHandler = {
  handle: handleCheckInEntry,
  handleBatch: checkInHandleBatch,
};

const boneMassHandler: HealthTypeHandler = {
  handle: handleCheckInEntry,
  handleBatch: checkInHandleBatch,
};

const bodyWaterHandler: HealthTypeHandler = {
  handle: handleCheckInEntry,
  handleBatch: checkInHandleBatch,
};

// Health Connect body water arrives as a mass in kg and is converted to
// body_water_percentage in checkInHandleBatch (see resolveBodyWaterPercentages).
const bodyWaterMassHandler: HealthTypeHandler = {
  handle: handleCheckInEntry,
  handleBatch: checkInHandleBatch,
};

const bmrHandler: HealthTypeHandler = {
  handle: handleCheckInEntry,
  handleBatch: checkInHandleBatch,
};

const sleepSessionHandler: HealthTypeHandler = {
  async handle(entry, ctx) {
    const { source = 'manual', timestamp } = entry;
    try {
      const stageEvents = isHealthConnectSleepSource(source)
        ? sanitizeHealthConnectSleepStageEvents(entry.stage_events)
        : entry.stage_events || [];
      // Map the dataEntry fields to what processSleepEntry expects
      const sleepEntryData = {
        entry_date: ctx.parsedDate,
        bedtime: entry.bedtime ? new Date(entry.bedtime) : new Date(timestamp),
        wake_time: entry.wake_time
          ? new Date(entry.wake_time)
          : entry.duration_in_seconds
            ? new Date(
                new Date(timestamp).getTime() + entry.duration_in_seconds * 1000
              )
            : new Date(timestamp),
        duration_in_seconds: Number(entry.duration_in_seconds) || 0,
        time_asleep_in_seconds: Number(entry.time_asleep_in_seconds) || 0,
        sleep_score: Number(entry.sleep_score) || 0,
        source: source,
        stage_events: stageEvents,
        deep_sleep_seconds: Number(entry.deep_sleep_seconds) || 0,
        light_sleep_seconds: Number(entry.light_sleep_seconds) || 0,
        rem_sleep_seconds: Number(entry.rem_sleep_seconds) || 0,
        awake_sleep_seconds: Number(entry.awake_sleep_seconds) || 0,
        record_timezone: entry.record_timezone,
        record_utc_offset_minutes: entry.record_utc_offset_minutes,
      };
      const sleepEntryResult = await ctx.processSleepEntry(
        ctx.userId,
        ctx.actingUserId,
        sleepEntryData,
        await ctx.getSleepContext()
      );
      return { status: 'success', data: sleepEntryResult };
    } catch (sleepError) {
      log(
        'error',
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        `Error processing sleep entry: ${sleepError.message}`,
        entry
      );
      return {
        status: 'error',
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        error: `Failed to process sleep entry: ${sleepError.message}`,
      };
    }
  },
};

// A custom-measurement row queued for one bulkUpsertCustomMeasurements call,
// remembering which prepared entry it came from.
interface CustomMeasurementWrite {
  index: number;
  row: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    categoryId: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
    entryDate: string;
    entryHour: number;
    entryTimestamp: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    notes: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    frequency: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    source: any;
  };
}

// Flushes queued custom-measurement rows through one
// bulkUpsertCustomMeasurements transaction, assigning each source record its
// written row; a failed batch write fails every record in the write group.
async function flushCustomMeasurementWrites(
  writes: CustomMeasurementWrite[],
  outcomes: HandlerOutcome[],
  ctx: HealthBatchContext,
  errorPrefix: string
) {
  if (writes.length === 0) {
    return;
  }
  try {
    const written = await measurementRepository.bulkUpsertCustomMeasurements(
      ctx.userId,
      ctx.actingUserId,
      writes.map((write) => write.row)
    );
    writes.forEach((write, position) => {
      outcomes[write.index] = { status: 'success', data: written?.[position] };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const write of writes) {
      outcomes[write.index] = {
        status: 'error',
        error: `${errorPrefix}${message}`,
      };
    }
  }
}

// Map incoming stress data to the existing custom measurement system
const stressHandleBatch: HandleBatchFn = async (entries, ctx) => {
  const outcomes: HandlerOutcome[] = new Array(entries.length);
  const writes: CustomMeasurementWrite[] = [];
  for (let i = 0; i < entries.length; i++) {
    const { entry, parsedDate, entryTimestamp, entryHour } = entries[i];
    const { value, source = 'manual' } = entry;
    try {
      const stressCategory = await ctx.resolveCategory(
        ctx.userId,
        ctx.actingUserId,
        'Stress',
        'numeric',
        'Daily'
      );
      if (!stressCategory || !stressCategory.id) {
        outcomes[i] = {
          status: 'error',
          error: 'Failed to get or create custom category for Stress',
        };
        continue;
      }
      // Check if 'value' is present, otherwise checks strictly for Stress it might be just presence?
      // Usually Stress has a level/value. If it's just a session token (val=1), use that.
      const stressValue = value !== undefined && value !== null ? value : 1;
      writes.push({
        index: i,
        row: {
          categoryId: stressCategory.id,
          value: stressValue,
          entryDate: parsedDate,
          entryHour,
          entryTimestamp,
          notes: `Source: ${source}`,
          frequency: stressCategory.frequency,
          source,
        },
      });
    } catch (stressError) {
      outcomes[i] = {
        status: 'error',
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        error: `Failed to process Stress entry: ${stressError.message}`,
      };
    }
  }
  await flushCustomMeasurementWrites(
    writes,
    outcomes,
    ctx,
    'Failed to process Stress entry: '
  );
  return outcomes;
};

const stressHandler: HealthTypeHandler = {
  async handle(entry, ctx) {
    const [outcome] = await stressHandleBatch(
      [
        {
          entry,
          parsedDate: ctx.parsedDate,
          entryTimestamp: ctx.entryTimestamp,
          entryHour: ctx.entryHour,
        },
      ],
      ctx
    );
    return outcome;
  },
  handleBatch: stressHandleBatch,
};

// Names (slug or display name) already covered by the app's built-in mood
// chips — an imported tag matching one of these needs no custom mood record.
const BUILT_IN_MOOD_NAMES = new Set(
  BUILT_IN_MOODS.flatMap((m) => [
    m.name.toLowerCase(),
    m.displayName.toLowerCase(),
  ])
);

// Auto-creates a bare custom mood (name only, default icon/color) for any
// imported tag that matches neither a built-in mood nor an existing custom
// one, so it shows up in Settings > Manage Moods afterward. The existing-name
// set is fetched once up front and never re-queried: moodRepository.
// createCustomMood upserts on (user_id, name) and would overwrite an
// existing mood's icon/color with null, so it must only be called for names
// confirmed to be genuinely new.
async function ensureCustomMoodsExist(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  tags: string[]
): Promise<void> {
  const unknownTags = tags.filter(
    (tag) => !BUILT_IN_MOOD_NAMES.has(tag.toLowerCase())
  );
  if (unknownTags.length === 0) return;
  const existing = await moodRepository.listCustomMoods(userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingNames = new Set(existing.map((m: any) => m.name.toLowerCase()));
  for (const tag of unknownTags) {
    const normalized = tag.toLowerCase().trim();
    if (!existingNames.has(normalized)) {
      await moodRepository.createCustomMood(userId, { name: tag });
      existingNames.add(normalized);
    }
  }
}

// Mood has its own dedicated table (mood_entries), upserted on
// (user_id, entry_date) — unlike Stress it does not go through
// custom_measurements. mood_value is a 10-100 scale (see MoodMeter.tsx /
// moodUtils.ts for the band->label mapping); mood_tags is an optional array
// of free-form tag names, auto-creating any unrecognized custom mood.
const moodHandler: HealthTypeHandler = {
  async handle(entry, ctx) {
    const moodValue = parseInt(entry.value, 10);
    if (isNaN(moodValue) || moodValue < 10 || moodValue > 100) {
      return {
        status: 'error',
        error: 'Invalid value for Mood. Must be an integer between 10 and 100.',
      };
    }
    const moodTags = Array.isArray(entry.mood_tags)
      ? entry.mood_tags.filter(
          (tag: unknown) => typeof tag === 'string' && tag.trim() !== ''
        )
      : null;
    try {
      if (moodTags && moodTags.length > 0) {
        await ensureCustomMoodsExist(ctx.userId, moodTags);
      }
      const result = await moodRepository.createOrUpdateMoodEntry(
        ctx.userId,
        moodValue,
        entry.notes ?? null,
        ctx.parsedDate,
        moodTags
      );
      return { status: 'success', data: result };
    } catch (moodError) {
      const message =
        moodError instanceof Error ? moodError.message : String(moodError);
      return {
        status: 'error',
        error: `Failed to process Mood entry: ${message}`,
      };
    }
  },
};

const mindfulnessHandler: HealthTypeHandler = {
  async handle(entry, ctx) {
    const rawDuration =
      entry.duration_seconds ??
      entry.duration ??
      (entry.value !== null && entry.value !== undefined
        ? Number(entry.value) * 60
        : undefined);
    const durationSeconds = Number(rawDuration);
    if (isNaN(durationSeconds) || durationSeconds <= 0) {
      return {
        status: 'error',
        error:
          'Invalid duration for MindfulnessSession. Must be greater than 0 seconds.',
      };
    }
    const sessionType =
      typeof entry.session_type === 'string'
        ? entry.session_type
        : 'meditation';
    const provider =
      typeof entry.source === 'string' ? entry.source : 'apple_health';
    const externalId = entry.source_id
      ? String(entry.source_id)
      : entry.id
        ? String(entry.id)
        : null;
    try {
      const heartRateAvgRaw =
        entry.heart_rate_avg !== null && entry.heart_rate_avg !== undefined
          ? Number(entry.heart_rate_avg)
          : entry.avg_heart_rate !== null && entry.avg_heart_rate !== undefined
            ? Number(entry.avg_heart_rate)
            : null;
      const heartRateStartRaw =
        entry.heart_rate_start !== null && entry.heart_rate_start !== undefined
          ? Number(entry.heart_rate_start)
          : null;
      const heartRateEndRaw =
        entry.heart_rate_end !== null && entry.heart_rate_end !== undefined
          ? Number(entry.heart_rate_end)
          : null;
      const hrvRmssdRaw =
        entry.hrv_rmssd !== null && entry.hrv_rmssd !== undefined
          ? Number(entry.hrv_rmssd)
          : null;

      const result = await mindfulnessRepository.createMindfulnessSession(
        ctx.userId,
        {
          entry_date: ctx.parsedDate,
          start_time: entry.startTime ? String(entry.startTime) : null,
          end_time: entry.endTime ? String(entry.endTime) : null,
          duration_seconds: Math.round(durationSeconds),
          session_type: sessionType,
          provider,
          external_id: externalId,
          heart_rate_avg: heartRateAvgRaw,
          heart_rate_start: heartRateStartRaw,
          heart_rate_end: heartRateEndRaw,
          hrv_rmssd: hrvRmssdRaw,
          notes: entry.notes ? String(entry.notes) : null,
        },
        ctx.actingUserId
      );
      return { status: 'success', data: result };
    } catch (mindfulError) {
      const message =
        mindfulError instanceof Error
          ? mindfulError.message
          : String(mindfulError);
      return {
        status: 'error',
        error: `Failed to process MindfulnessSession entry: ${message}`,
      };
    }
  },
};

/**
 * Columns the client is allowed to set directly via `telemetry`.
 *
 * avg_heart_rate is not part of EXERCISE_ENTRY_TELEMETRY_COLUMNS — it predates
 * that array and is written as its own base column — so it is added explicitly
 * here. Anything outside this set is dropped: the payload is spread into the
 * repository's column list, so an unfiltered spread would be a write primitive
 * for arbitrary columns.
 */
const WORKOUT_TELEMETRY_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  ...EXERCISE_ENTRY_TELEMETRY_COLUMNS,
  'avg_heart_rate',
]);

/** Telemetry columns that hold free text rather than a measurement. */
const TELEMETRY_TEXT_COLUMNS: ReadonlySet<string> = new Set([
  'weather_condition',
  'gear_name',
  'gear_external_id',
]);

/**
 * Narrows a client-supplied telemetry object to known columns with values of the
 * right kind, dropping everything else. NaN/Infinity are rejected along with
 * unknown keys — Number.isFinite covers both, and a non-finite value would
 * otherwise reach the numeric columns as NaN.
 */
function sanitizeTelemetry(
  raw: unknown
): Record<string, number | string | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number | string | null> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!WORKOUT_TELEMETRY_ALLOWLIST.has(key)) continue;
    if (value === null) {
      out[key] = null;
    } else if (TELEMETRY_TEXT_COLUMNS.has(key)) {
      if (typeof value === 'string') out[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Chronological comparator for ISO timestamp strings. Lexicographic order
 * (localeCompare) only agrees with chronological order when every string uses
 * the same UTC offset — a mix of `Z` and `+02:00` instants, or fractional vs
 * whole seconds, sorts wrong even though Date.parse handles both fine.
 */
const byInstant = (a: string, b: string): number =>
  Date.parse(a) - Date.parse(b);

/**
 * Min/max over a possibly-large array of epoch-ms instants without spreading
 * into Math.min/Math.max — a long session at 1s sampling can produce tens of
 * thousands of points, and one argument per element risks
 * "RangeError: Maximum call stack size exceeded".
 */
function minMax(instantsMs: number[]): { startMs: number; endMs: number } {
  let startMs = instantsMs[0];
  let endMs = instantsMs[0];
  for (const ms of instantsMs) {
    if (ms < startMs) startMs = ms;
    if (ms > endMs) endMs = ms;
  }
  return { startMs, endMs };
}

/** A client-supplied sensor reading, or null when it is missing or unusable. */
const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Keeps only well-formed trackpoints; a point without a fix is unusable.
 *
 * Every optional sensor reading is narrowed to a finite number or null, because
 * these land in numeric columns and a JSONB round-trip: a string, NaN, or
 * Infinity from the wire would otherwise be stored verbatim.
 */
function sanitizeGpsPoints(raw: unknown): TelemetryGpsPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is TelemetryGpsPoint =>
        !!p &&
        typeof p === 'object' &&
        typeof (p as TelemetryGpsPoint).t === 'string' &&
        Number.isFinite((p as TelemetryGpsPoint).lat) &&
        Number.isFinite((p as TelemetryGpsPoint).lon) &&
        Number.isFinite(Date.parse((p as TelemetryGpsPoint).t))
    )
    .map((p) => ({
      t: p.t,
      lat: p.lat,
      lon: p.lon,
      alt: finiteOrNull(p.alt),
      speed: finiteOrNull(p.speed),
      hr: finiteOrNull(p.hr),
      cad: finiteOrNull(p.cad),
      power: finiteOrNull(p.power),
      dist: finiteOrNull(p.dist),
      hacc: finiteOrNull(p.hacc),
      vacc: finiteOrNull(p.vacc),
      course: finiteOrNull(p.course),
    }))
    .sort((a, b) => byInstant(a.t, b.t));
}

/** Keeps only well-formed bpm readings. */
function sanitizeHrSamples(raw: unknown): HrSample[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (s): s is HrSample =>
        !!s &&
        typeof s === 'object' &&
        typeof (s as HrSample).t === 'string' &&
        Number.isFinite((s as HrSample).bpm) &&
        Number.isFinite(Date.parse((s as HrSample).t))
    )
    .sort((a, b) => byInstant(a.t, b.t));
}

/** Keeps only laps with a usable window, renumbering to a dense 1-based index. */
function sanitizeLaps(raw: unknown): LapWindow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (l): l is LapWindow =>
        !!l &&
        typeof l === 'object' &&
        typeof (l as LapWindow).start_time === 'string' &&
        typeof (l as LapWindow).end_time === 'string' &&
        Number.isFinite(Date.parse((l as LapWindow).start_time)) &&
        Number.isFinite(Date.parse((l as LapWindow).end_time))
    )
    .sort((a, b) => byInstant(a.start_time, b.start_time))
    .map((lap, index) => ({ ...lap, lap_index: index + 1 }));
}

/**
 * Persists the relational telemetry that hangs off an exercise entry: the GPS
 * track, lap splits, time-in-zone, and the intraday heart-rate series.
 *
 * Isolated from the entry write and individually guarded: a workout whose
 * summary saved fine must not be reported as failed because one optional
 * telemetry table rejected a row.
 */
async function persistWorkoutTelemetry(
  entry: Record<string, unknown>,
  ctx: HealthEntryContext,
  exerciseEntryId: string,
  source: string,
  gpsPoints: TelemetryGpsPoint[],
  hrSamples: HrSample[]
): Promise<void> {
  const entryDate = ctx.parsedDate;

  if (gpsPoints.length > 0) {
    await workoutTelemetryRepo.bulkInsertExerciseEntryGpsPoints(
      ctx.userId,
      ctx.actingUserId,
      gpsPoints.map((p) => ({
        user_id: ctx.userId,
        exercise_entry_id: exerciseEntryId,
        entry_date: entryDate,
        timestamp: new Date(p.t),
        latitude: p.lat,
        longitude: p.lon,
        altitude_meters: p.alt ?? null,
        speed_mps: p.speed ?? null,
        heart_rate_bpm: p.hr ?? null,
        cadence: p.cad ?? null,
        power_watts: p.power ?? null,
        distance_meters: p.dist ?? null,
        horizontal_accuracy_meters: p.hacc ?? null,
        vertical_accuracy_meters: p.vacc ?? null,
        course_degrees: p.course ?? null,
      }))
    );
  }

  const laps = deriveLaps(sanitizeLaps(entry.laps), gpsPoints, hrSamples);
  if (laps.length > 0) {
    await workoutTelemetryRepo.bulkInsertExerciseEntryLaps(
      ctx.userId,
      ctx.actingUserId,
      laps.map((lap) => ({
        user_id: ctx.userId,
        exercise_entry_id: exerciseEntryId,
        entry_date: entryDate,
        lap_index: lap.lap_index,
        start_time: new Date(lap.start_time),
        end_time: new Date(lap.end_time),
        duration_seconds: lap.duration_seconds,
        distance_meters: lap.distance_meters,
        calories: lap.calories,
        avg_heart_rate: lap.avg_heart_rate,
        max_heart_rate: lap.max_heart_rate,
        avg_speed_mps: lap.avg_speed_mps,
        max_speed_mps: lap.max_speed_mps,
        avg_cadence: lap.avg_cadence,
        avg_power_watts: lap.avg_power_watts,
        elevation_gain_meters: lap.elevation_gain_meters,
        elevation_loss_meters: lap.elevation_loss_meters,
        moving_time_seconds: lap.moving_time_seconds,
        avg_moving_speed_mps: lap.avg_moving_speed_mps,
      }))
    );
  }

  // Zones need the whole series, so fall back to the HR carried on the
  // trackpoints when no dedicated series was sent.
  const zoneSamples: HrSample[] = hrSamples.length
    ? hrSamples
    : gpsPoints
        .filter((p) => typeof p.hr === 'number' && Number.isFinite(p.hr))
        .map((p) => ({ t: p.t, bpm: p.hr as number }));

  if (zoneSamples.length > 1) {
    const { userProfile } = await ctx.getSleepContext();
    const { maxHr } = resolveMaxHr(userProfile?.date_of_birth, zoneSamples);
    const zones = computeHrZones(zoneSamples, maxHr);
    if (zones.length > 0) {
      await workoutTelemetryRepo.bulkInsertExerciseEntryHrZones(
        ctx.userId,
        ctx.actingUserId,
        zones.map((zone) => ({
          user_id: ctx.userId,
          exercise_entry_id: exerciseEntryId,
          entry_date: entryDate,
          zone_index: zone.zone_index,
          zone_lower_bpm: zone.zone_lower_bpm,
          zone_upper_bpm: zone.zone_upper_bpm,
          seconds_in_zone: zone.seconds_in_zone,
        }))
      );
    }
  }

  if (hrSamples.length > 0) {
    const { tz } = await ctx.getSleepContext();
    const times = hrSamples.map((s) => Date.parse(s.t));
    await upsertSamplesByDay(
      ctx.userId,
      ctx.actingUserId,
      'heart_rate',
      source,
      hrSamples.map((s) => ({
        // Bucket by the user's local day, not UTC, so a workout that runs past
        // midnight splits across the same two days the diary shows.
        entry_date: instantToDay(s.t, tz),
        timestamp: new Date(s.t),
        ex: exerciseEntryId,
        bpm: Math.round(s.bpm),
      })),
      {
        // health_metric_samples holds ONE row per (user, metric, day, provider).
        // Replacing it here would delete the rest of the day's readings, so only
        // the span this workout covers is swapped out.
        mode: 'merge',
        window: minMax(times),
      }
    );
  }
}

function localEntryTime(iso: string, tz: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || !tz) return null;
  try {
    const { hour, minute } = instantHourMinute(ms, tz);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  } catch {
    return null;
  }
}

const workoutHandler: HealthTypeHandler = {
  async handle(entry, ctx) {
    const { type, source = 'manual' } = entry;
    try {
      const {
        activityType,
        caloriesBurned,
        distance,
        duration,
        exercise_source_id,
        raw_data,
        source_id,
        steps,
      } = entry;
      const exerciseName = activityType || `${source} Exercise`;
      const { category, modality } = resolveActivityMapping(
        activityType,
        entry.modality
      );
      let exercise = null;
      if (
        typeof exercise_source_id === 'string' &&
        exercise_source_id.length > 0
      ) {
        exercise = await exerciseDb.getExerciseBySourceAndSourceId(
          source,
          exercise_source_id,
          ctx.userId
        );
      }
      if (!exercise) {
        exercise = await exerciseDb.findExerciseByNameAndUserId(
          exerciseName,
          ctx.userId
        );
        if (
          exercise &&
          typeof exercise_source_id === 'string' &&
          exercise_source_id.length > 0 &&
          (exercise.source !== source ||
            (exercise.source_id && exercise.source_id !== exercise_source_id))
        ) {
          exercise = null;
        }
        // Backfill source_id on existing legacy exercise so future syncs remain linked after rename
        if (
          exercise &&
          !exercise.source_id &&
          typeof exercise_source_id === 'string' &&
          exercise_source_id.length > 0
        ) {
          await exerciseDb.updateExercise(exercise.id, ctx.userId, {
            source_id: exercise_source_id,
          });
          exercise.source_id = exercise_source_id;
        }
      }
      if (!exercise) {
        const newSourceId =
          typeof exercise_source_id === 'string' &&
          exercise_source_id.length > 0
            ? exercise_source_id
            : null;
        try {
          exercise = await exerciseDb.createExercise({
            user_id: ctx.userId,
            name: exerciseName,
            is_custom: true,
            shared_with_public: false,
            source: source,
            source_id: newSourceId,
            // Modality is snapshotted from this row when the entry is created, so
            // it has to be right here; setting it on the entry has no effect.
            category,
            modality,
            calories_per_hour: caloriesBurned
              ? caloriesBurned / (duration / 3600)
              : 0,
          });
        } catch (createError) {
          // If a concurrent sync request inserted the exercise first, fetch the committed row.
          if (newSourceId) {
            exercise = await exerciseDb.getExerciseBySourceAndSourceId(
              source,
              newSourceId,
              ctx.userId
            );
          }
          if (!exercise) {
            throw createError;
          }
        }
      }
      // Per-set duration is stored in integer seconds. Clients send either
      // duration_seconds (always seconds; old servers drop the unknown field
      // instead of misreading it as minutes) or the legacy duration field,
      // whose unit depends on X-Workout-Model-Version (absent ⇒ minutes).
      const rawSets: Array<
        { duration?: number | null; duration_seconds?: number | null } & Record<
          string,
          unknown
        >
      > | null = entry.sets || null;
      const sets = rawSets
        ? rawSets.map(({ duration_seconds, ...set }) => ({
            ...set,
            duration:
              typeof duration_seconds === 'number'
                ? Math.round(duration_seconds)
                : typeof set.duration === 'number' &&
                    ctx.legacyWorkoutSetMinutes
                  ? Math.round(set.duration * 60)
                  : set.duration,
          }))
        : rawSets;
      // Indoor workouts have no route, so the heart-rate graph is the day's
      // samples clipped to this start time. The phone already sends the
      // instant; it just was not stored.
      const { tz } = await ctx.getSleepContext();
      const zone =
        typeof entry.record_timezone === 'string' && entry.record_timezone
          ? entry.record_timezone
          : tz;
      const entryTime = localEntryTime(ctx.entryTimestamp, zone);
      // Wearable telemetry (X-Workout-Model-Version 3+). All optional: a client
      // that sends none of it takes exactly the pre-telemetry path.
      const gpsPoints = sanitizeGpsPoints(entry.gps_points);
      const hrSamples = sanitizeHrSamples(entry.hr_samples);
      const telemetry = {
        // Values the device reported win; the series only backfills what is
        // missing, so a watch's own averages are never overwritten by ours.
        ...deriveWorkoutTelemetry(gpsPoints, hrSamples),
        ...sanitizeTelemetry(entry.telemetry),
      };
      const exerciseEntry = await exerciseEntryDb.createExerciseEntry(
        ctx.userId,
        {
          exercise_id: exercise.id,
          duration_minutes: duration ? duration / 60 : 0,
          calories_burned: caloriesBurned,
          entry_date: ctx.parsedDate,
          // The zone travels with entry_time so a later read converts it
          // back in the zone it was taken in, not the viewer's current one.
          ...(entryTime
            ? { entry_time: entryTime, record_timezone: zone }
            : {}),
          notes: `Source: ${source}, Activity Type: ${activityType}`,
          distance: distance,
          sets, // Pass sets if present for mobile workout sync
          source_id: source_id || null,
          ...(typeof steps === 'number' && Number.isFinite(steps) && steps > 0
            ? { steps: Math.round(steps) }
            : {}),
          ...telemetry,
        },
        ctx.actingUserId,
        source,
        null,
        // Stored inside the entry's own transaction rather than afterwards: a
        // second sync of the same source range-deletes and re-inserts these
        // rows, so a detail written against an already committed parent can hit
        // a parent that is gone, which its RLS policy reports as a row-level
        // security violation and the workout loses its raw data.
        raw_data
          ? {
              activityDetail: {
                provider_name: source,
                detail_type: `${type}_raw_data`,
                detail_data: JSON.stringify(raw_data),
                created_by_user_id: ctx.actingUserId,
                updated_by_user_id: ctx.actingUserId,
              },
            }
          : {}
      );
      if (gpsPoints.length > 0 || hrSamples.length > 0 || entry.laps) {
        try {
          await persistWorkoutTelemetry(
            entry,
            ctx,
            exerciseEntry.id,
            source,
            gpsPoints,
            hrSamples
          );
        } catch (telemetryError) {
          // The workout itself is saved; losing the map or the zone chart is a
          // degraded result, not a failed import, and reporting it as an error
          // would make the client re-send the whole session.
          const message =
            telemetryError instanceof Error
              ? telemetryError.message
              : String(telemetryError);
          log(
            'error',
            `[processHealthData] Saved workout ${exerciseEntry.id} but failed to persist its telemetry: ${message}`
          );
        }
      }
      return { status: 'success', data: exerciseEntry };
    } catch (workoutError) {
      return {
        status: 'error',
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        error: `Failed to process Workout entry: ${workoutError.message}`,
      };
    }
  },
};

// Ingest a Health Connect NutritionRecord as a food entry
// (see ingestNutritionFoodEntry).
const nutritionHandler: HealthTypeHandler = {
  async handle(entry, ctx) {
    // Idempotency depends on source_id (the upsert key). A record without
    // one can't be deduped and would re-insert on every sync, so skip it
    // rather than risk duplicates (guards against client/device variance).
    if (!entry.source_id) {
      log(
        'warn',
        `[processHealthData] Skipping Nutrition record without source_id (cannot dedupe): '${entry.food_name || 'unnamed'}'`
      );
      return {
        status: 'skipped',
        reason:
          'Nutrition record without source_id cannot be deduplicated; skipped.',
      };
    }
    try {
      const foodEntry = await ingestNutritionFoodEntry(
        entry,
        ctx.userId,
        ctx.actingUserId,
        ctx.parsedDate
      );
      return { status: 'success', data: foodEntry };
    } catch (nutritionError) {
      const errMsg =
        nutritionError instanceof Error
          ? nutritionError.message
          : String(nutritionError);
      log('error', `Error processing Nutrition entry: ${errMsg}`, entry);
      return {
        status: 'error',
        error: `Failed to process Nutrition entry: ${errMsg}`,
      };
    }
  },
};

// Handle structured sleep entry data (legacy/web)
const sleepEntryHandler: HealthTypeHandler = {
  async handle(entry, ctx) {
    try {
      const sleepEntryResult = await ctx.processSleepEntry(
        ctx.userId,
        ctx.actingUserId,
        entry,
        await ctx.getSleepContext()
      );
      return { status: 'success', data: sleepEntryResult };
    } catch (sleepError) {
      log(
        'error',
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        `Error processing sleep entry: ${sleepError.message}`,
        entry
      );
      return {
        status: 'error',
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        error: `Failed to process sleep entry: ${sleepError.message}`,
      };
    }
  },
};

// Fallback: any type without a dedicated handler is stored as a custom
// measurement.
const customMeasurementHandleBatch: HandleBatchFn = async (entries, ctx) => {
  const outcomes: HandlerOutcome[] = new Array(entries.length);
  const writes: CustomMeasurementWrite[] = [];
  for (let i = 0; i < entries.length; i++) {
    const { entry, parsedDate, entryTimestamp, entryHour } = entries[i];
    const { value, type, source = 'manual', dataType } = entry;
    // Use unit from payload (e.g. HealthConnect sends "unit") or default so UI does not show "N/A"
    const unitFromPayload = entry.unit ?? entry.measurementType;
    let resolvedMeasurementType;
    if (
      unitFromPayload &&
      typeof unitFromPayload === 'string' &&
      unitFromPayload.trim()
    ) {
      resolvedMeasurementType = unitFromPayload.trim();
    } else {
      resolvedMeasurementType =
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        DEFAULT_UNITS_BY_HEALTH_TYPE[type] || 'N/A';
    }
    const category = await ctx.resolveCategory(
      ctx.userId,
      ctx.actingUserId,
      type,
      dataType,
      resolvedMeasurementType
    );
    if (!category || !category.id) {
      outcomes[i] = {
        status: 'error',
        error: `Failed to get or create custom category for type: ${type}`,
      };
      continue;
    }
    let processedValue = value;
    if (category.data_type === 'numeric') {
      const numericValue = parseFloat(value);
      if (isNaN(numericValue)) {
        outcomes[i] = {
          status: 'error',
          error: `Invalid numeric value for custom measurement type: ${type}. Value: ${value}`,
        };
        continue;
      }
      processedValue = numericValue;
    }
    // If data_type is 'text', we use the value as is.
    writes.push({
      index: i,
      row: {
        categoryId: category.id,
        value: processedValue,
        entryDate: parsedDate,
        entryHour,
        entryTimestamp,
        notes: entry.notes, // Pass notes if available
        frequency: category.frequency, // Pass the frequency from the category
        source, // Pass the source
      },
    });
  }
  await flushCustomMeasurementWrites(
    writes,
    outcomes,
    ctx,
    'Failed to process entry: '
  );
  return outcomes;
};

export const customMeasurementHandler: HealthTypeHandler = {
  handle: async (entry, ctx) => {
    const [outcome] = await customMeasurementHandleBatch(
      [
        {
          entry,
          parsedDate: ctx.parsedDate,
          entryTimestamp: ctx.entryTimestamp,
          entryHour: ctx.entryHour,
        },
      ],
      ctx
    );
    return outcome;
  },
  handleBatch: customMeasurementHandleBatch,
};

// ── Daily wearable summary readings ─────────────────────────────────────────

// The Daily Wearable Health Summary reads resting heart rate and VO2 max from
// daily_health_metrics. Health Connect and HealthKit deliver both as plain
// records, so they only ever reached custom_measurements and the summary stayed
// empty. Each record is still stored as a custom measurement exactly as before;
// the latest valid reading per day and source is also copied onto that day's
// daily_health_metrics row, the same way total_calories is.
type DailySummaryColumn = 'resting_heart_rate' | 'vo2_max';

function parseDailySummaryReading(rawValue: unknown): number | null {
  const value =
    typeof rawValue === 'number'
      ? rawValue
      : typeof rawValue === 'string' && rawValue.trim() !== ''
        ? Number(rawValue)
        : Number.NaN;
  return Number.isFinite(value) ? value : null;
}

function createDailySummaryReadingHandler(
  column: DailySummaryColumn,
  bounds: { min: number; max: number; decimals: number }
): HealthTypeHandler {
  const scale = 10 ** bounds.decimals;
  const handleBatch: HandleBatchFn = async (entries, ctx) => {
    const outcomes = await customMeasurementHandleBatch(entries, ctx);

    // One reading per day and source: the one taken last wins, whatever order
    // the records arrived in.
    const latest = new Map<
      string,
      {
        parsedDate: string;
        sourceProvider: string;
        value: number;
        takenAt: number;
        indexes: number[];
      }
    >();
    entries.forEach(({ entry, parsedDate, entryTimestamp }, i) => {
      if (outcomes[i]?.status !== 'success') {
        return;
      }
      const value = parseDailySummaryReading(entry.value);
      if (value === null || value < bounds.min || value > bounds.max) {
        log(
          'info',
          `healthDataHandlers: not copying ${entry?.type} ${entry?.value} for ${parsedDate} to the daily summary — outside ${bounds.min} to ${bounds.max}.`
        );
        return;
      }
      const sourceProvider = normalizeHealthSourceProvider(entry.source);
      const key = `${parsedDate}|${sourceProvider}`;
      const takenAt = Date.parse(entryTimestamp);
      const current = latest.get(key);
      if (!current) {
        latest.set(key, {
          parsedDate,
          sourceProvider,
          value,
          takenAt,
          indexes: [i],
        });
        return;
      }
      current.indexes.push(i);
      if (!(takenAt < current.takenAt)) {
        current.value = value;
        current.takenAt = takenAt;
      }
    });

    for (const reading of latest.values()) {
      const value = Math.round(reading.value * scale) / scale;
      try {
        await genericHealthRepository.upsertDailyHealthMetrics(
          String(ctx.userId),
          String(ctx.actingUserId),
          {
            user_id: String(ctx.userId),
            entry_date: reading.parsedDate,
            source_provider: reading.sourceProvider,
            ...(column === 'resting_heart_rate'
              ? { resting_heart_rate: value }
              : { vo2_max: value }),
          }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const i of reading.indexes) {
          outcomes[i] = {
            status: 'error',
            error: `Failed to update daily health metrics: ${message}`,
          };
        }
      }
    }
    return outcomes;
  };

  return {
    handle: async (entry, ctx) => {
      const [outcome] = await handleBatch(
        [
          {
            entry,
            parsedDate: ctx.parsedDate,
            entryTimestamp: ctx.entryTimestamp,
            entryHour: ctx.entryHour,
          },
        ],
        ctx
      );
      return outcome;
    },
    handleBatch,
  };
}

const restingHeartRateHandler = createDailySummaryReadingHandler(
  'resting_heart_rate',
  { min: 20, max: 250, decimals: 0 }
);

const vo2MaxHandler = createDailySummaryReadingHandler('vo2_max', {
  min: 10,
  max: 100,
  decimals: 1,
});

// ── Registry ────────────────────────────────────────────────────────────────

// Handlers keyed by canonical type name.
export const HEALTH_TYPE_HANDLERS: Record<string, HealthTypeHandler> = {
  steps: stepsHandler,
  water: waterHandler,
  active_calories: activeCaloriesHandler,
  total_calories: totalCaloriesHandler,
  weight: weightHandler,
  body_fat: bodyFatHandler,
  height: heightHandler,
  neck: neckHandler,
  waist: waistHandler,
  hips: hipsHandler,
  muscle_mass_kg: muscleMassHandler,
  bone_mass_kg: boneMassHandler,
  body_water_percentage: bodyWaterHandler,
  body_water_mass: bodyWaterMassHandler,
  bmr: bmrHandler,
  SleepSession: sleepSessionHandler,
  Stress: stressHandler,
  Workout: workoutHandler,
  Nutrition: nutritionHandler,
  sleep_entry: sleepEntryHandler,
  Mood: moodHandler,
  MindfulnessSession: mindfulnessHandler,
  resting_heart_rate: restingHeartRateHandler,
  vo2_max: vo2MaxHandler,
};

// Lookup-only normalization of incoming type spellings to canonical handler
// keys. Handlers still receive and echo the raw incoming type (e.g. in
// detail_type), so this must never rewrite the entry itself.
export const TYPE_ALIASES: Record<string, string> = {
  step: 'steps',
  'Active Calories': 'active_calories',
  ActiveCaloriesBurned: 'active_calories',
  TotalCaloriesBurned: 'total_calories',
  body_fat_percentage: 'body_fat',
  // Health Connect spellings for bone mass; both already arrive in kg.
  // LeanBodyMass is deliberately absent — it is not muscle mass and stays a
  // custom measurement.
  bone_mass: 'bone_mass_kg',
  BoneMass: 'bone_mass_kg',
  muscle_mass: 'muscle_mass_kg',
  // Health Connect body water is a mass (kg); converted to a percentage.
  BodyWaterMass: 'body_water_mass',
  Height: 'height',
  basal_metabolic_rate: 'bmr',
  BasalMetabolicRate: 'bmr',
  resting_energy: 'bmr',
  ExerciseSession: 'Workout',
  mood: 'Mood',
  MindfulSession: 'MindfulnessSession',
  mindfulness_session: 'MindfulnessSession',
  mindfulness: 'MindfulnessSession',
  mindful: 'MindfulnessSession',
  RestingHeartRate: 'resting_heart_rate',
  Vo2Max: 'vo2_max',
};

/**
 * Returns the handler for a raw incoming type string, or undefined when the
 * type has no dedicated handler (callers fall back to
 * customMeasurementHandler).
 */
export function resolveHandler(type: unknown): HealthTypeHandler | undefined {
  if (typeof type !== 'string') {
    return undefined;
  }
  const canonical = TYPE_ALIASES[type] ?? type;
  return HEALTH_TYPE_HANDLERS[canonical];
}
