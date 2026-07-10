import { log } from '../config/logging.js';
import measurementRepository from '../models/measurementRepository.js';
import exerciseDb from '../models/exercise.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';
import foodRepository from '../models/foodRepository.js';

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
    // To return the full category object including the id and the default data_type
    const created = { id: newCategory.id, ...newCategoryData };
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
): // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    case 'hips': {
      const numericValue = parseFloat(entry.value);
      if (isNaN(numericValue) || numericValue <= 0) {
        return {
          error: `Invalid value for ${entry.type}. Must be a positive number.`,
        };
      }
      return { measurements: { [canonical]: numericValue } };
    }
    default:
      // Unreachable: only the four check-in handlers route here.
      return { error: `Unsupported check-in measurement type: ${entry.type}` };
  }
}

// Shared batched write for the check-in family (steps/weight/body_fat/height):
// all valid records go through one bulkUpsertCheckInMeasurements call (one
// client + one transaction), with same-date records merged server-side
// (later record wins per column, matching the old sequential upserts).
const checkInHandleBatch: HandleBatchFn = async (entries, ctx) => {
  const outcomes: HandlerOutcome[] = new Array(entries.length);
  const writes: Array<{
    index: number;
    entryDate: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    measurements: Record<string, any>;
  }> = [];
  for (let i = 0; i < entries.length; i++) {
    const prepared = prepareCheckInMeasurement(entries[i].entry);
    if ('error' in prepared) {
      outcomes[i] = { status: 'error', error: prepared.error };
      continue;
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
    const waterValue = parseInt(entry.value, 10);
    if (isNaN(waterValue) || !Number.isInteger(waterValue)) {
      return {
        status: 'error',
        error: 'Invalid value for water. Must be an integer.',
      };
    }
    const result = await measurementRepository.upsertWaterData(
      ctx.userId,
      ctx.actingUserId,
      waterValue,
      ctx.parsedDate,
      source // Use the provided source (e.g., 'fitbit', 'garmin', 'apple_health')
    );
    return { status: 'success', data: result };
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

const workoutHandler: HealthTypeHandler = {
  async handle(entry, ctx) {
    const { type, source = 'manual' } = entry;
    try {
      const {
        activityType,
        caloriesBurned,
        distance,
        duration,
        raw_data,
        source_id,
      } = entry;
      const exerciseName = activityType || `${source} Exercise`;
      let exercise = await exerciseDb.findExerciseByNameAndUserId(
        exerciseName,
        ctx.userId
      );
      if (!exercise) {
        exercise = await exerciseDb.createExercise({
          user_id: ctx.userId,
          name: exerciseName,
          is_custom: true,
          shared_with_public: false,
          source: source,
          category: 'Cardio',
          calories_per_hour: caloriesBurned
            ? caloriesBurned / (duration / 3600)
            : 0,
        });
      }
      const exerciseEntry = await exerciseEntryDb.createExerciseEntry(
        ctx.userId,
        {
          exercise_id: exercise.id,
          duration_minutes: duration ? duration / 60 : 0,
          calories_burned: caloriesBurned,
          entry_date: ctx.parsedDate,
          notes: `Source: ${source}, Activity Type: ${activityType}`,
          distance: distance,
          sets: entry.sets || null, // Pass sets if present for mobile workout sync
          source_id: source_id || null,
        },
        ctx.actingUserId,
        source
      );
      if (raw_data) {
        await activityDetailsRepository.createActivityDetail(ctx.userId, {
          exercise_entry_id: exerciseEntry.id,
          provider_name: source,
          detail_type: `${type}_raw_data`,
          detail_data: JSON.stringify(raw_data),
          created_by_user_id: ctx.actingUserId,
          updated_by_user_id: ctx.actingUserId,
        });
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

// ── Registry ────────────────────────────────────────────────────────────────

// Handlers keyed by canonical type name.
export const HEALTH_TYPE_HANDLERS: Record<string, HealthTypeHandler> = {
  steps: stepsHandler,
  water: waterHandler,
  active_calories: activeCaloriesHandler,
  weight: weightHandler,
  body_fat: bodyFatHandler,
  height: heightHandler,
  neck: neckHandler,
  waist: waistHandler,
  hips: hipsHandler,
  SleepSession: sleepSessionHandler,
  Stress: stressHandler,
  Workout: workoutHandler,
  Nutrition: nutritionHandler,
  sleep_entry: sleepEntryHandler,
};

// Lookup-only normalization of incoming type spellings to canonical handler
// keys. Handlers still receive and echo the raw incoming type (e.g. in
// detail_type), so this must never rewrite the entry itself.
export const TYPE_ALIASES: Record<string, string> = {
  step: 'steps',
  'Active Calories': 'active_calories',
  ActiveCaloriesBurned: 'active_calories',
  body_fat_percentage: 'body_fat',
  Height: 'height',
  ExerciseSession: 'Workout',
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
