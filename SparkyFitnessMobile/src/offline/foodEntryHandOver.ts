import type { CreateFoodEntryPayload } from '../services/api/foodEntriesApi';
import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import { enqueueOutbox } from './outbox';
import { signedInUserId } from './syncEngine';

/** A diary food entry waiting for the server. */
export const FOOD_ENTRY_CREATE = 'food_entry.create';

/** The payload shape of `food_entry.create`, as this build writes it. */
export const FOOD_ENTRY_PAYLOAD_VERSION = 1;

const PENDING_ENTRY_PREFIX = 'pending-';

/** The id a waiting entry is shown under until the server has given it one. */
export function pendingEntryId(clientId: string): string {
  return `${PENDING_ENTRY_PREFIX}${clientId}`;
}

/** The replay key a waiting entry's id was made from. */
export function pendingEntryClientId(id: string): string {
  return id.startsWith(PENDING_ENTRY_PREFIX)
    ? id.slice(PENDING_ENTRY_PREFIX.length)
    : id;
}

/** True for an entry that is waiting on the phone, not yet on the server. */
export function isPendingEntryId(id: string): boolean {
  return id.startsWith(PENDING_ENTRY_PREFIX);
}

/** The request a food entry is sent with; its key travels as `client_id`. */
export type FoodEntryCreatePayload = Omit<CreateFoodEntryPayload, 'client_id'>;

/**
 * Whether an entry can wait on the phone. Only a request that is complete in
 * itself qualifies: a food and serving the server already has (both ids), or
 * a quick-add that carries its own name and calories. A food that is still to
 * be created, a meal, or anything the server has to work out first needs the
 * server, because an id it would hand back is not known here.
 */
export function isQueueableFoodEntry(payload: CreateFoodEntryPayload): boolean {
  if (payload.meal_id) return false;
  if (payload.food_id || payload.variant_id) {
    return Boolean(payload.food_id && payload.variant_id);
  }
  return Boolean(payload.food_name) && typeof payload.calories === 'number';
}

/**
 * Queues one diary entry for upload. `clientId` is minted by the caller before
 * the first request and sent with it, so an entry that is queued after a
 * failed request keeps the key that request carried. One entry is its own
 * row: two entries are never merged. True once the row is written.
 */
export async function queueFoodEntry(
  clientId: string,
  payload: FoodEntryCreatePayload
): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    // Whose it is must be known: a row nobody owns would be shown to, and
    // uploaded under, whichever account signs in next.
    if (userId == null) return false;
    await enqueueOutbox(db, {
      id: newUuid(),
      serverConfigId,
      userId,
      kind: FOOD_ENTRY_CREATE,
      entityId: clientId,
      entryDate: payload.entry_date,
      payload,
      payloadVersion: FOOD_ENTRY_PAYLOAD_VERSION,
    });
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not queue the food entry: ${error}`, 'ERROR');
    return false;
  }
}
