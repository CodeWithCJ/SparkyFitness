import { addLog } from '../LogService';
import {
  MetricConfig,
  TransformOutput,
  TransformedRecord,
  RecordTimezoneMetadata,
} from '../../types/healthRecords';
import { toLocalDateString } from '../../utils/dateUtils';

// Platform-neutral transformer infrastructure. Both the HealthKit and Health Connect
// dataTransformation modules keep their own VALUE/DIRECT transformer tables and
// timezone extractors, and build their `transformHealthRecords` export from the
// driver factory below.

// ============================================================================
// Shared constants
// ============================================================================

// mg/dL per mmol/L for blood glucose (molar mass of glucose ≈ 180.18 g/mol). Shared by
// both platforms' glucose transformers and the HealthKit day-statistics read so every
// path converts identically.
export const BLOOD_GLUCOSE_MG_DL_PER_MMOL_L = 18.018;

// HC stores every nutrient as Mass (grams), but Sparky's food columns expect a
// specific unit per nutrient — matching how OpenFoodFacts/Garmin populate them:
// macros in grams, most minerals/vitamins in mg, a few trace nutrients in mcg.
// We convert from grams accordingly; otherwise e.g. sodium lands 1000x too low.
export const G_TO_MG = 1_000;
export const G_TO_MCG = 1_000_000;

// HC NutritionRecord Mass field → { Sparky column, grams→column-unit factor }.
// Exported so the writeback mappers (both platforms) reuse the exact same field/unit
// mapping (read multiplies grams→column-unit; writeback writes the column value back
// in that same unit via factor→HC-unit, so the two directions never drift).
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

// Strip float noise (4.949999999999999 -> 4.95). Significant figures (not fixed
// decimals) so small post-conversion values aren't truncated. Shared with the
// writeback mappers so read and write rounding can never drift.
export const tidyNumber = (value: number): number => Number(value.toPrecision(6));

// ============================================================================
// Transformer types
// ============================================================================

// Result from a value transformer - either value/date pair or null to skip
export interface ValueTransformResult {
  value: number;
  date: string;
  type?: string; // Optional override for output type
}

// Transformer that extracts value and date for standard record output
export type ValueTransformer = (
  rec: Record<string, unknown>,
  metricConfig: MetricConfig,
  index: number
) => ValueTransformResult | null;

// Transformer that directly pushes to output array (for complex records)
export type DirectTransformer = (
  rec: Record<string, unknown>,
  record: unknown,
  metricConfig: MetricConfig,
  output: TransformOutput[]
) => void;

// ============================================================================
// Value Extractors - reusable functions for nested property extraction
// ============================================================================

export const extractNestedValue = (rec: Record<string, unknown>, key: string, nestedKey: string): number | null => {
  const nested = rec[key] as Record<string, number> | undefined;
  return nested?.[nestedKey] ?? null;
};

export const extractDirectValue = (rec: Record<string, unknown>, key: string): number | null => {
  const val = rec[key];
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    // Handle comma decimal separator (European locales e.g. "49,51")
    const parsed = parseFloat(val.replace(',', '.'));
    return isNaN(parsed) ? null : parsed;
  }
  return null;
};

// Wrapper for toLocalDateString that handles unknown input and errors. Factory so
// each platform's conversion warnings keep their own log tag.
export const createGetDateString = (logTag: string) => (date: unknown): string | null => {
  if (!date) return null;
  try {
    return toLocalDateString(new Date(date as string | number | Date));
  } catch (e) {
    addLog(`${logTag} Could not convert date: ${date}. ${e}`, 'WARNING');
    return null;
  }
};

// ============================================================================
// Shared transformer factories (bodies identical across platforms; only the
// injected ownership predicate / date wrapper / source label differ)
// ============================================================================

export const createHydrationTransformer = (
  isOwnRecord: (rec: Record<string, unknown>) => boolean,
  getDateString: (date: unknown) => string | null,
): ValueTransformer => (rec) => {
  if (isOwnRecord(rec)) return null; // don't re-import water Sparky wrote
  const liters = extractNestedValue(rec, 'volume', 'inLiters');
  const date = getDateString(rec.startTime);
  // Convert L -> integer ml: synced as water intake (type 'water') which the server stores in ml.
  return liters !== null && date ? { value: Math.round(liters * 1000), date } : null;
};

export const createBloodPressureTransformer = (
  source: string,
  getDateString: (date: unknown) => string | null,
): DirectTransformer => (rec, _record, metricConfig, output) => {
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
      source,
    });
  }
  if (diastolic?.inMillimetersOfMercury) {
    output.push({
      value: parseFloat(diastolic.inMillimetersOfMercury.toFixed(2)),
      unit,
      date,
      type: `${type}_diastolic`,
      source,
    });
  }
};

// ============================================================================
// Transform driver
// ============================================================================

export interface TransformHealthRecordsConfig {
  /** Source label stamped on every standard record ('HealthKit' / 'Health Connect'). */
  source: string;
  /** Log prefix, e.g. '[HealthKitService]'. */
  logTag: string;
  /** Qualitative record types dropped wholesale. Only checked when provided. */
  skipTypes?: Set<string>;
  valueTransformers: Record<string, ValueTransformer>;
  directTransformers: Record<string, DirectTransformer>;
  /** Platform timezone extractor (HKTimeZone vs zoneOffset) applied to value-transformed records. */
  extractTimezoneMetadata: (rec: Record<string, unknown>) => RecordTimezoneMetadata;
}

export const createTransformHealthRecords = (config: TransformHealthRecordsConfig) =>
  (records: unknown[], metricConfig: MetricConfig): TransformOutput[] => {
    const { source, logTag, skipTypes, valueTransformers, directTransformers, extractTimezoneMetadata } = config;

    if (!Array.isArray(records)) {
      addLog(`${logTag} transformHealthRecords received non-array records for ${metricConfig.recordType}`, 'WARNING');
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
    if (skipTypes?.has(recordType)) {
      addLog(`${logTag} Skipping qualitative ${recordType} records`);
      return [];
    }

    // Check if this record type has a direct transformer (handles its own output)
    const directTransformer = directTransformers[recordType];

    // Check if this record type has a value transformer
    const valueTransformer = valueTransformers[recordType];

    records.forEach((record: unknown, index: number) => {
      try {
        const rec = record as Record<string, unknown>;

        // Handle pre-aggregated records (from deduplicating aggregation functions)
        // These have value and date at top level — raw platform records never do
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
              source,
            };
            // Forward timezone metadata from aggregation layer
            if (rec.record_timezone != null) {
              transformedRecord.record_timezone = rec.record_timezone as string;
            }
            if (rec.record_utc_offset_minutes != null) {
              transformedRecord.record_utc_offset_minutes = rec.record_utc_offset_minutes as number;
            }
            transformedData.push(transformedRecord);
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
              source,
              ...extractTimezoneMetadata(rec),
            };
            transformedData.push(transformedRecord);
            successCount++;
          } else {
            skipCount++;
          }
          return;
        }

        // Unhandled record type (a top-level value/date record without a transformer
        // was already consumed by the pre-aggregated branch above)
        if (index === 0) {
          addLog(`${logTag} No transformer found for record type: ${recordType}`, 'WARNING');
        }
        skipCount++;
      } catch (error) {
        skipCount++;
        addLog(`${logTag} Error transforming ${recordType} record at index ${index}: ${(error as Error).message}`, 'WARNING');
      }
    });

    // Log transformation summary for debugging
    if (skipCount > 0) {
      addLog(`${logTag} ${recordType} transformation: ${successCount} succeeded, ${skipCount} skipped (of ${records.length} total)`, 'DEBUG');
    }

    return transformedData;
  };
