/**
 * Building the create-entry payload that logs a diary food again on another
 * day, meal or time. Used by the web diary and the mobile food entry screen.
 *
 * Diary entries are snapshots, so the copy carries the entry's own nutrition,
 * custom nutrients, note and time of day rather than the library food's
 * current values: the server lets these fields override the food it links.
 * An entry whose food was deleted from the library is copied as a standalone
 * entry from the same snapshot.
 */

export const FOOD_ENTRY_COPY_NUTRIENTS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'sodium',
  'dietary_fiber',
  'sugars',
  'trans_fat',
  'potassium',
  'calcium',
  'iron',
  'caffeine_mg',
  'water_ml',
  'alcohol_g',
  'cholesterol',
  'vitamin_a',
  'vitamin_c',
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
  food_name?: string | null;
  brand_name?: string | null;
  serving_size?: NumericLike;
  serving_unit?: string | null;
  glycemic_index?: string | null;
  custom_nutrients?: Record<string, string | number> | null;
} & { [K in FoodEntryCopyNutrient]?: NumericLike };

export type FoodEntryCopyPayload = {
  meal_type_id: string;
  quantity: number;
  unit: string;
  entry_date: string;
  entry_time: string | null;
  notes: string | null;
  food_id?: string;
  variant_id?: string;
  food_name?: string;
  brand_name?: string;
  serving_size?: number;
  serving_unit?: string;
  glycemic_index?: string;
  custom_nutrients?: Record<string, string | number>;
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
  return payload;
}

/** `{ hour, minute }` as the 'HH:MM' an entry_time takes. */
export function hourMinuteToEntryTime({
  hour,
  minute,
}: {
  hour: number;
  minute: number;
}): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
