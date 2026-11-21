import type { CreateFoodEntryPayload } from '../services/api/foodEntriesApi';
import type { SaveFoodPayload } from '../services/api/foodsApi';
import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import { enqueueOutbox } from './outbox';
import { signedInUserId } from './syncEngine';

/** A new food, made with no connection, and the entry that logs it. */
export const FOOD_CREATE = 'food.create';

/** The payload shape of `food.create`, as this build writes it. */
export const FOOD_CREATE_PAYLOAD_VERSION = 1;

/** The entry logged against the new food; its ids come from the server. */
export type FoodCreateEntry = Omit<
  CreateFoodEntryPayload,
  'client_id' | 'food_id' | 'variant_id'
>;

export interface FoodCreatePayload {
  /** The food, as sent to the server (its key is added when it is sent). */
  food: Omit<SaveFoodPayload, 'client_id'>;
  /** The key the food is created under, so a repeat returns the same food. */
  foodClientId: string;
  entry: FoodCreateEntry;
}

/**
 * Whether a new food and its entry can wait on the phone: a plain food (no
 * picture to upload, no extra servings or provider servings to save with it)
 * with a serving and a calorie figure.
 */
export function isQueueableFoodCreate(input: {
  food: SaveFoodPayload;
  hasImages: boolean;
  hasExtraServings: boolean;
}): boolean {
  if (input.hasImages || input.hasExtraServings) return false;
  const { food } = input;
  return (
    food.name.trim() !== '' &&
    typeof food.calories === 'number' &&
    Number.isFinite(food.serving_size) &&
    food.serving_size > 0 &&
    !food.provider_type &&
    !food.provider_external_id &&
    !(food.images && food.images.length > 0) &&
    !food.image_url &&
    !food.image_source_url
  );
}

/**
 * Queues a new food together with the diary entry that logs it, as one
 * upload: the food is created first and the entry is then logged against the
 * ids the server gives it. `entryClientId` is the entry's own key (also what
 * the waiting entry is shown under); `foodClientId` is the food's. Both are
 * minted by the caller before the first request and sent with it. True once
 * the row is written.
 */
export async function queueFoodCreate(
  foodClientId: string,
  entryClientId: string,
  food: SaveFoodPayload,
  entry: FoodCreateEntry
): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    const plainFood: Omit<SaveFoodPayload, 'client_id'> = { ...food };
    delete (plainFood as SaveFoodPayload).client_id;
    const payload: FoodCreatePayload = {
      food: plainFood,
      foodClientId,
      entry,
    };
    await enqueueOutbox(db, {
      id: newUuid(),
      serverConfigId,
      userId,
      kind: FOOD_CREATE,
      // The entry's key, so the waiting entry (shown as `pending-<key>`) is
      // cancelled or replaced through the same id as any other entry.
      entityId: entryClientId,
      entryDate: entry.entry_date,
      payload,
      payloadVersion: FOOD_CREATE_PAYLOAD_VERSION,
    });
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not queue the new food: ${error}`, 'ERROR');
    return false;
  }
}
