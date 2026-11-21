import type { FoodEntry } from '../types/foodEntries';
import type { FoodDefaultVariant } from '../types/foods';
import {
  pendingEntryId,
  type FoodEntryCreatePayload,
} from './foodEntryHandOver';
import { readSavedFood, readSavedVariants } from './foodLibrary';
import type { OfflineDb, OutboxRow } from './types';

/** The nutrients a diary entry snapshots, copied from a serving or a quick-add. */
const NUTRIENT_FIELDS = [
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
  'water_ml',
  'alcohol_g',
] as const;

function nutrientsOf(
  source: Partial<Record<(typeof NUTRIENT_FIELDS)[number], number>>
): Partial<Record<(typeof NUTRIENT_FIELDS)[number], number>> {
  const picked: Partial<Record<(typeof NUTRIENT_FIELDS)[number], number>> = {};
  for (const field of NUTRIENT_FIELDS) {
    const value = source[field];
    if (typeof value === 'number') picked[field] = value;
  }
  return picked;
}

/**
 * A waiting food entry as the Diary will show it once it is uploaded, built
 * from what the phone holds: a quick-add carries its own nutrients, a library
 * food takes them from the serving kept for it. Its amounts are the
 * serving's per its own size, the way the server snapshots them, so the
 * Diary's usual "value x quantity / serving size" gives the same figure. Null
 * when the food or serving is no longer kept (the entry is still uploaded;
 * it just cannot be previewed). The real entry replaces this one after the
 * upload, so a difference in a rounding or an unusual unit never persists.
 */
export async function previewFromQueuedFoodEntry(
  db: OfflineDb,
  serverConfigId: string,
  row: OutboxRow
): Promise<FoodEntry | null> {
  const payload = row.payload as FoodEntryCreatePayload;
  const base = {
    id: pendingEntryId(row.entityId),
    meal_type: '',
    meal_type_id: payload.meal_type_id,
    quantity: payload.quantity,
    unit: payload.unit,
    notes: payload.notes,
    entry_date: payload.entry_date,
    entry_time: payload.entry_time,
  };

  if (!payload.food_id) {
    return {
      ...base,
      ...nutrientsOf(payload),
      calories: payload.calories ?? 0,
      food_name: payload.food_name,
      brand_name: payload.brand_name,
      serving_size: payload.serving_size ?? payload.quantity,
      serving_unit: payload.serving_unit ?? payload.unit,
    };
  }

  const food = await readSavedFood(db, serverConfigId, payload.food_id);
  const variants = await readSavedVariants(db, serverConfigId, payload.food_id);
  const serving: FoodDefaultVariant | undefined =
    variants?.find((variant) => variant.id === payload.variant_id) ??
    (food?.default_variant?.id === payload.variant_id
      ? food?.default_variant
      : undefined);
  if (!food || !serving) return null;
  return {
    ...base,
    ...nutrientsOf(serving),
    calories: serving.calories,
    food_id: food.id,
    variant_id: payload.variant_id,
    food_name: food.name,
    brand_name: food.brand ?? undefined,
    serving_size: serving.serving_size,
    serving_unit: serving.serving_unit,
  };
}
