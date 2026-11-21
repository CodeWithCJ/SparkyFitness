import type { CreateFoodEntryPayload } from '../services/api/foodEntriesApi';
import type { SaveFoodPayload } from '../services/api/foodsApi';
import type { FoodItem } from '../types/foods';
import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import { enqueueOutbox, listUnconfirmedOutbox } from './outbox';
import { signedInUserId } from './syncEngine';
import type { OfflineDb } from './types';

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
  /** The entry that logs the food; absent for a food made for the library. */
  entry?: FoodCreateEntry;
}

const PENDING_FOOD_PREFIX = 'pendingfood-';
const PENDING_VARIANT_PREFIX = 'pendingvariant-';

/** The id a food that waits on the phone is shown under. */
export function pendingFoodId(foodClientId: string): string {
  return `${PENDING_FOOD_PREFIX}${foodClientId}`;
}

/** The id of the serving of a food that waits on the phone. */
function pendingVariantId(foodClientId: string): string {
  return `${PENDING_VARIANT_PREFIX}${foodClientId}`;
}

/** True for a food that is waiting on the phone, not yet on the server. */
export function isPendingFoodId(id: string): boolean {
  return id.startsWith(PENDING_FOOD_PREFIX);
}

/** The key a waiting food's id was made from. */
export function pendingFoodClientId(id: string): string {
  return id.startsWith(PENDING_FOOD_PREFIX)
    ? id.slice(PENDING_FOOD_PREFIX.length)
    : id;
}

/** A waiting food as the food screens read it, with one serving. */
export function foodFromWaiting(
  foodClientId: string,
  food: Omit<SaveFoodPayload, 'client_id'>
): FoodItem {
  return {
    id: pendingFoodId(foodClientId),
    name: food.name,
    brand: food.brand ?? null,
    barcode: food.barcode ?? null,
    is_custom: true,
    is_quick_food: food.is_quick_food,
    notes: food.notes ?? null,
    default_variant: {
      id: pendingVariantId(foodClientId),
      serving_size: food.serving_size,
      serving_unit: food.serving_unit,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      dietary_fiber: food.dietary_fiber,
      saturated_fat: food.saturated_fat,
      sodium: food.sodium,
      sugars: food.sugars,
      trans_fat: food.trans_fat,
      potassium: food.potassium,
      calcium: food.calcium,
      iron: food.iron,
      cholesterol: food.cholesterol,
      vitamin_a: food.vitamin_a,
      vitamin_c: food.vitamin_c,
      caffeine_mg: food.caffeine_mg,
      water_ml: food.water_ml,
      alcohol_g: food.alcohol_g,
      is_default: true,
      custom_nutrients: food.custom_nutrients,
    },
  };
}

/** A new food waiting to upload, with the request it will be sent as. */
export interface WaitingFood {
  foodClientId: string;
  food: Omit<SaveFoodPayload, 'client_id'>;
  item: FoodItem;
}

/**
 * The new foods waiting to upload, one per key (a food and the entries that
 * log it carry the same key and the same food). Quick foods, which exist only
 * for their entry, are left out: they are not part of the library.
 */
export async function listWaitingFoods(
  db: OfflineDb,
  serverConfigId: string
): Promise<WaitingFood[]> {
  const userId = await signedInUserId(db, serverConfigId);
  const byKey = new Map<string, WaitingFood>();
  for (const row of await listUnconfirmedOutbox(db, serverConfigId)) {
    if (row.kind !== FOOD_CREATE) continue;
    if (row.userId != null && row.userId !== userId) continue;
    const payload = row.payload as FoodCreatePayload;
    if (payload.food.is_quick_food) continue;
    if (byKey.has(payload.foodClientId)) continue;
    byKey.set(payload.foodClientId, {
      foodClientId: payload.foodClientId,
      food: payload.food,
      item: foodFromWaiting(payload.foodClientId, payload.food),
    });
  }
  return [...byKey.values()];
}

/** The waiting food under a key, or null once it has uploaded. */
export async function findWaitingFood(
  foodClientId: string
): Promise<WaitingFood | null> {
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return null;
  const db = await getOfflineDb();
  const waiting = await listWaitingFoods(db, serverConfigId);
  return waiting.find((item) => item.foodClientId === foodClientId) ?? null;
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
 * minted by the caller before the first request and sent with it. Without an
 * entry the food is only made for the library. True once the row is written.
 */
export async function queueFoodCreate(
  foodClientId: string,
  entryClientId: string | null,
  food: Omit<SaveFoodPayload, 'client_id'> | SaveFoodPayload,
  entry: FoodCreateEntry | null
): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    const plainFood: Omit<SaveFoodPayload, 'client_id'> & {
      client_id?: string;
    } = { ...food };
    delete plainFood.client_id;
    const payload: FoodCreatePayload = {
      food: plainFood,
      foodClientId,
      ...(entry ? { entry } : {}),
    };
    await enqueueOutbox(db, {
      id: newUuid(),
      serverConfigId,
      userId,
      kind: FOOD_CREATE,
      // The entry's key, so the waiting entry (shown as `pending-<key>`) is
      // cancelled or replaced through the same id as any other entry. A food
      // made for the library alone is keyed by the food itself.
      entityId: entryClientId ?? foodClientId,
      entryDate: entry?.entry_date ?? null,
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
