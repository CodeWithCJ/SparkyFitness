import type { FoodEntryMealCreateData } from '../types/foodEntryMeals';
import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import { enqueueOutbox } from './outbox';
import { signedInUserId } from './syncEngine';

/** A logged meal waiting for the server. */
export const FOOD_ENTRY_MEAL_CREATE = 'food_entry_meal.create';

/** The payload shape of `food_entry_meal.create`, as this build writes it. */
export const FOOD_ENTRY_MEAL_PAYLOAD_VERSION = 1;

/** The request a logged meal is sent with; its key travels as `client_id`. */
export type FoodEntryMealPayload = Omit<FoodEntryMealCreateData, 'client_id'>;

/**
 * Whether a logged meal can wait on the phone. The server expands the saved
 * meal into its component entries, so the request is complete when it names
 * the meal. Customised ingredients are fine only when each one names a food
 * and serving the server already has; anything else (an ingredient still to
 * be created, a meal made up on the spot) needs the server.
 */
export function isQueueableFoodEntryMeal(
  payload: FoodEntryMealCreateData
): boolean {
  if (!payload.meal_template_id) return false;
  return (payload.foods ?? []).every((food) =>
    food.child_meal_id ? true : Boolean(food.food_id && food.variant_id)
  );
}

/**
 * Queues one logged meal for upload. `clientId` is minted by the caller before
 * the first request and sent with it, so a meal queued after a failed request
 * keeps the key that request carried. One meal is one row: two are never
 * merged. True once the row is written.
 */
export async function queueFoodEntryMeal(
  clientId: string,
  payload: FoodEntryMealPayload
): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    await enqueueOutbox(db, {
      id: newUuid(),
      serverConfigId,
      userId,
      kind: FOOD_ENTRY_MEAL_CREATE,
      entityId: clientId,
      entryDate: payload.entry_date,
      payload,
      payloadVersion: FOOD_ENTRY_MEAL_PAYLOAD_VERSION,
    });
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not queue the meal: ${error}`, 'ERROR');
    return false;
  }
}
