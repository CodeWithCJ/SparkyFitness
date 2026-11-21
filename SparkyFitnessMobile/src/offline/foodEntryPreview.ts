import type { FoodEntry } from '../types/foodEntries';
import type { FoodDefaultVariant } from '../types/foods';
import { buildMealDisplayValuesFromFoods } from '../utils/mealNutrition';
import {
  FOOD_ENTRY_CREATE,
  pendingEntryId,
  type FoodEntryCreatePayload,
} from './foodEntryHandOver';
import { FOOD_CREATE, type FoodCreatePayload } from './foodCreateHandOver';
import {
  FOOD_ENTRY_MEAL_CREATE,
  type FoodEntryMealPayload,
} from './foodEntryMealHandOver';
import { readSavedFood, readSavedMeal, readSavedVariants } from './foodLibrary';
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

/**
 * A waiting logged meal as the Diary will show it once uploaded: one entry
 * for the whole meal (the way a logged meal collapses), with the nutrition of
 * the number of servings logged, from the meal as kept on the phone. Only a
 * plain serving count of a saved meal can be worked out here: other units
 * and customised ingredients are resolved by the server, so those are left
 * out of the preview (they still upload).
 */
export async function previewFromQueuedMeal(
  db: OfflineDb,
  serverConfigId: string,
  row: OutboxRow
): Promise<FoodEntry | null> {
  const payload = row.payload as FoodEntryMealPayload;
  if (!payload.meal_template_id) return null;
  if ((payload.foods ?? []).length > 0) return null;
  if ((payload.unit || 'serving') !== 'serving') return null;
  const meal = await readSavedMeal(
    db,
    serverConfigId,
    payload.meal_template_id
  );
  if (!meal) return null;
  const quantity = Number(payload.quantity) > 0 ? Number(payload.quantity) : 1;
  const perServing = buildMealDisplayValuesFromFoods(
    meal.foods,
    meal,
    'perServing'
  );
  const scaled = (value: number | undefined) =>
    value === undefined ? undefined : value * quantity;
  return {
    id: pendingEntryId(row.entityId),
    meal_id: meal.id,
    meal_type: '',
    meal_type_id: payload.meal_type_id,
    quantity,
    unit: payload.unit,
    notes: payload.notes,
    entry_date: payload.entry_date,
    entry_time: payload.entry_time,
    food_name: payload.name || meal.name,
    // The whole portion is one entry, so its serving size is its quantity and
    // the Diary's "value x quantity / serving size" gives the portion itself.
    serving_size: quantity,
    serving_unit: payload.unit,
    calories: perServing.calories * quantity,
    protein: scaled(perServing.protein),
    carbs: scaled(perServing.carbs),
    fat: scaled(perServing.fat),
    dietary_fiber: scaled(perServing.fiber),
    saturated_fat: scaled(perServing.saturatedFat),
    sodium: scaled(perServing.sodium),
    sugars: scaled(perServing.sugars),
    trans_fat: scaled(perServing.transFat),
    potassium: scaled(perServing.potassium),
    calcium: scaled(perServing.calcium),
    iron: scaled(perServing.iron),
    caffeine_mg: scaled(perServing.caffeineMg),
    water_ml: scaled(perServing.waterMl),
    alcohol_g: scaled(perServing.alcoholG),
    cholesterol: scaled(perServing.cholesterol),
  };
}

/**
 * A waiting new food and its entry as the Diary will show it: the food's own
 * serving and nutrients, which the entry snapshots as they are.
 */
export function previewFromQueuedFoodCreate(row: OutboxRow): FoodEntry {
  const { food, entry } = row.payload as FoodCreatePayload;
  return {
    id: pendingEntryId(row.entityId),
    meal_type: '',
    meal_type_id: entry.meal_type_id,
    quantity: entry.quantity,
    unit: entry.unit,
    notes: entry.notes,
    entry_date: entry.entry_date,
    entry_time: entry.entry_time,
    ...nutrientsOf(food),
    calories: food.calories,
    food_name: food.name,
    brand_name: food.brand ?? undefined,
    serving_size: food.serving_size,
    serving_unit: food.serving_unit,
  };
}

/** The entry a waiting food or meal row will become, or null for any other row. */
export async function previewFromQueuedRow(
  db: OfflineDb,
  serverConfigId: string,
  row: OutboxRow
): Promise<FoodEntry | null> {
  if (row.kind === FOOD_ENTRY_CREATE) {
    return previewFromQueuedFoodEntry(db, serverConfigId, row);
  }
  if (row.kind === FOOD_CREATE) return previewFromQueuedFoodCreate(row);
  if (row.kind === FOOD_ENTRY_MEAL_CREATE) {
    return previewFromQueuedMeal(db, serverConfigId, row);
  }
  return null;
}
