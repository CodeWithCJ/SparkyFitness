import { FOOD_VARIANT_NUTRIENT_FIELDS } from '../constants/foodVariantNutrients.ts';
import { isCookedWeightUnit } from './cookedWeight.ts';

/**
 * Building the create-entry payload that logs a diary food again on another
 * day, meal or time. Used by the web diary and the mobile food entry screen.
 *
 * Diary entries are snapshots, so the copy carries the entry's own nutrition,
 * custom nutrients, allergens, traces, photos, note and time of day rather
 * than the library food's current values: the server lets these fields
 * override the food it links.
 * An entry whose food was deleted from the library is copied as a standalone
 * entry from the same snapshot.
 */

export const FOOD_ENTRY_COPY_NUTRIENTS = [
  ...FOOD_VARIANT_NUTRIENT_FIELDS,
  'water_ml',
] as const;

export type FoodEntryCopyNutrient = (typeof FOOD_ENTRY_COPY_NUTRIENTS)[number];

type NumericLike = number | string | null | undefined;

/** The fields of a logged diary food that a copy reads. */
export type FoodEntryCopySource = {
  food_id?: string | null;
  variant_id?: string | null;
  quantity?: NumericLike;
  unit: string;
  entry_time?: string | null;
  notes?: string | null;
  /** Cooked weight eaten, in `unit` (#3534). */
  cooked_quantity?: NumericLike;
  food_name?: string | null;
  brand_name?: string | null;
  serving_size?: NumericLike;
  serving_unit?: string | null;
  glycemic_index?: string | null;
  custom_nutrients?: Record<string, string | number> | null;
  allergens?: string[] | null;
  traces?: string[] | null;
  /** The entry's own photos; empty means it shows its food's photos. */
  images?: string[] | null;
} & { [K in FoodEntryCopyNutrient]?: NumericLike };

export type FoodEntryCopyPayload = {
  /** The diary to log into; the server defaults to the signed-in user's. */
  user_id?: string;
  meal_type_id: string;
  quantity: number;
  unit: string;
  entry_date: string;
  entry_time: string | null;
  notes: string | null;
  cooked_quantity?: number;
  food_id?: string;
  variant_id?: string;
  food_name?: string;
  brand_name?: string;
  serving_size?: number;
  serving_unit?: string;
  glycemic_index?: string;
  custom_nutrients?: Record<string, string | number>;
  allergens?: string[];
  traces?: string[];
  images?: string[];
} & { [K in FoodEntryCopyNutrient]?: number };

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * A create-entry payload that logs `entry` again on `targetDate` in the meal
 * type `targetMealTypeId`. `entryTime` ('HH:MM') replaces the original's time,
 * for example when copying to "Now".
 */
export function buildFoodEntryCopyPayload(
  entry: FoodEntryCopySource,
  targetDate: string,
  targetMealTypeId: string,
  entryTime?: string
): FoodEntryCopyPayload {
  const payload: FoodEntryCopyPayload = {
    meal_type_id: targetMealTypeId,
    quantity: toNumber(entry.quantity) ?? 1,
    unit: entry.unit,
    entry_date: targetDate,
    entry_time: entryTime ?? entry.entry_time ?? null,
    notes: entry.notes ?? null,
    food_name: entry.food_name ?? undefined,
    brand_name: entry.brand_name ?? undefined,
    serving_size: toNumber(entry.serving_size),
    serving_unit: entry.serving_unit ?? undefined,
  };
  // The cooked weight belongs to the copied quantity, as when copying a day.
  const cookedQuantity = toNumber(entry.cooked_quantity);
  if (
    cookedQuantity !== undefined &&
    cookedQuantity > 0 &&
    isCookedWeightUnit(entry.unit)
  ) {
    payload.cooked_quantity = cookedQuantity;
  }
  if (entry.food_id && entry.variant_id) {
    payload.food_id = entry.food_id;
    payload.variant_id = entry.variant_id;
  }
  for (const field of FOOD_ENTRY_COPY_NUTRIENTS) {
    const value = toNumber(entry[field]);
    if (value !== undefined) payload[field] = value;
  }
  if (entry.glycemic_index) payload.glycemic_index = entry.glycemic_index;
  // Send even an empty set, so the copy keeps the entry's snapshot instead of
  // taking the linked food's current custom nutrients.
  if (entry.custom_nutrients) {
    payload.custom_nutrients = entry.custom_nutrients;
  }
  // Likewise an empty list keeps the snapshot's "none" over the food's own.
  if (entry.allergens) payload.allergens = entry.allergens;
  if (entry.traces) payload.traces = entry.traces;
  // Only the entry's own photos: without them the server falls back to the
  // linked food's, just as the original entry shows them.
  if (entry.images && entry.images.length > 0) payload.images = entry.images;
  return payload;
}
