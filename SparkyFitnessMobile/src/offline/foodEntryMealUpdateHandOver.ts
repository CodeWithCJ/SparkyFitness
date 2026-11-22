import type { FoodEntry } from '../types/foodEntries';
import type {
  FoodEntryMeal,
  FoodEntryMealFood,
  FoodEntryMealUpdateData,
} from '../types/foodEntryMeals';
import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { normalizeDate } from '../utils/dateUtils';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import { enqueueOutbox, listUnconfirmedOutbox } from './outbox';
import { signedInUserId } from './syncEngine';
import type { OfflineDb } from './types';

/** A new version of a logged meal the server has, waiting to upload. */
export const FOOD_ENTRY_MEAL_UPDATE = 'food_entry_meal.update';

/** The payload shape of `food_entry_meal.update`, as this build writes it. */
export const FOOD_ENTRY_MEAL_UPDATE_PAYLOAD_VERSION = 1;

export interface FoodEntryMealUpdatePayload {
  /** The request, as the server's update takes it: the whole meal as saved. */
  patch: FoodEntryMealUpdateData;
  /**
   * The meal as one Diary entry while it waits: its name, amount, meal, date,
   * time, note and the totals the screen showed when it was saved.
   */
  display: Partial<FoodEntry>;
}

/**
 * Queues the saved version of a logged meal. The request carries the whole
 * meal, so a later save replaces an earlier one that has not uploaded (one
 * row per meal) and setting it twice leaves the same meal, which is why it is
 * kept after any failure to reach the server, a timeout included. The row
 * stays on the day the meal was on. True once the row is written.
 */
export async function queueFoodEntryMealUpdate(
  mealId: string,
  entryDate: string,
  patch: FoodEntryMealUpdateData,
  display: Partial<FoodEntry>
): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    // Whose it is must be known: a row nobody owns would be shown to, and
    // uploaded under, whichever account signs in next.
    if (userId == null) return false;
    const earlier = (await listUnconfirmedOutbox(db, serverConfigId)).find(
      (row) => row.kind === FOOD_ENTRY_MEAL_UPDATE && row.entityId === mealId
    );
    const payload: FoodEntryMealUpdatePayload = { patch, display };
    await enqueueOutbox(db, {
      id: earlier?.id ?? newUuid(),
      serverConfigId,
      userId,
      kind: FOOD_ENTRY_MEAL_UPDATE,
      entityId: mealId,
      entryDate: earlier?.entryDate ?? normalizeDate(entryDate),
      payload,
      payloadVersion: FOOD_ENTRY_MEAL_UPDATE_PAYLOAD_VERSION,
    });
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not queue the meal change: ${error}`, 'ERROR');
    return false;
  }
}

/** The logged meal as one Diary entry, from what a saved change says. */
export function mealEntryFromChange(
  mealId: string,
  display: Partial<FoodEntry>
): FoodEntry {
  const quantity = display.quantity ?? 1;
  return {
    meal_type: '',
    unit: 'serving',
    entry_date: '',
    calories: 0,
    ...display,
    id: mealId,
    food_entry_meal_id: mealId,
    quantity,
    // The whole portion is one entry, so its serving size is its quantity and
    // the Diary's "value x quantity / serving size" gives the portion itself.
    serving_size: quantity,
    serving_unit: display.unit ?? 'serving',
  };
}

/** A logged meal as the screen reads it, with a waiting change applied. */
export function applyMealChange(
  meal: FoodEntryMeal,
  change: FoodEntryMealUpdatePayload
): FoodEntryMeal {
  const { patch, display } = change;
  const foods: FoodEntryMealFood[] = patch.foods.map((food) => ({
    ...food,
    food_id: food.food_id ?? null,
    food_name: food.food_name ?? '',
    variant_id: food.variant_id ?? null,
    serving_size: food.serving_size ?? 0,
    serving_unit: food.serving_unit ?? food.unit,
  }));
  return {
    ...meal,
    name: patch.name ?? meal.name,
    description:
      patch.description !== undefined ? patch.description : meal.description,
    notes: patch.notes !== undefined ? patch.notes : meal.notes,
    meal_type: patch.meal_type ?? meal.meal_type,
    meal_type_id: patch.meal_type_id ?? meal.meal_type_id,
    entry_date: patch.entry_date ?? meal.entry_date,
    entry_time:
      patch.entry_time !== undefined ? patch.entry_time : meal.entry_time,
    quantity: patch.quantity ?? meal.quantity,
    unit: patch.unit ?? meal.unit,
    // An explicit null is applied; a patch that omits it keeps what is kept.
    entry_total_servings:
      patch.entry_total_servings !== undefined
        ? patch.entry_total_servings
        : meal.entry_total_servings,
    foods,
    calories: display.calories ?? meal.calories,
    protein: display.protein ?? meal.protein,
    carbs: display.carbs ?? meal.carbs,
    fat: display.fat ?? meal.fat,
    dietary_fiber: display.dietary_fiber ?? meal.dietary_fiber,
  };
}

/** The waiting change to a logged meal, if there is one. */
export async function findWaitingMealChange(
  db: OfflineDb,
  serverConfigId: string,
  mealId: string
): Promise<FoodEntryMealUpdatePayload | null> {
  const row = (await listUnconfirmedOutbox(db, serverConfigId)).find(
    (item) => item.kind === FOOD_ENTRY_MEAL_UPDATE && item.entityId === mealId
  );
  return row ? (row.payload as FoodEntryMealUpdatePayload) : null;
}
