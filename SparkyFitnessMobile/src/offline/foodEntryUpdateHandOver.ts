import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { normalizeDate } from '../utils/dateUtils';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import { FOOD_CREATE, type FoodCreatePayload } from './foodCreateHandOver';
import {
  FOOD_ENTRY_CREATE,
  type FoodEntryCreatePayload,
} from './foodEntryHandOver';
import {
  FOOD_ENTRY_MEAL_CREATE,
  type FoodEntryMealPayload,
} from './foodEntryMealHandOver';
import { enqueueOutbox, listUnconfirmedOutbox } from './outbox';
import { signedInUserId } from './syncEngine';

/** A new amount for a food entry the server has, waiting to upload. */
export const FOOD_ENTRY_UPDATE = 'food_entry.update';

/** The payload shape of `food_entry.update`, as this build writes it. */
export const FOOD_ENTRY_UPDATE_PAYLOAD_VERSION = 1;

/** The only change that can be kept on the phone: how much was eaten. */
export interface FoodEntryUpdatePayload {
  quantity: number;
}

/**
 * Queues a new amount for an entry the server has. Setting an amount is safe
 * to send again, so it is kept after any failure to reach the server, a
 * timeout included. Editing again before it uploads replaces the amount (one
 * row per entry). True once the row is written.
 */
export async function queueFoodEntryQuantity(
  entryId: string,
  entryDate: string,
  quantity: number
): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    const payload: FoodEntryUpdatePayload = { quantity };
    await enqueueOutbox(db, {
      id: newUuid(),
      serverConfigId,
      userId,
      kind: FOOD_ENTRY_UPDATE,
      entityId: entryId,
      entryDate: normalizeDate(entryDate),
      payload,
      payloadVersion: FOOD_ENTRY_UPDATE_PAYLOAD_VERSION,
    });
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not queue the change: ${error}`, 'ERROR');
    return false;
  }
}

/**
 * What changing a waiting entry came to.
 * - `edited`: the entry that waits to upload now carries the new amount.
 * - `uploading`: it is being sent this moment, so it is left as it is.
 * - `gone`: nothing waits under that key any more (it uploaded meanwhile).
 */
export type EditWaitingResult = 'edited' | 'uploading' | 'gone';

/**
 * Changes the amount of an entry that is still waiting to upload by
 * rewriting the waiting request itself, so the server only ever sees the
 * final amount. A cooked weight no longer matches a changed amount, as on
 * the server, so it is dropped.
 */
export async function editWaitingEntryQuantity(
  entityId: string,
  quantity: number
): Promise<EditWaitingResult> {
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return 'gone';
  const db = await getOfflineDb();
  const row = (await listUnconfirmedOutbox(db, serverConfigId)).find(
    (item) =>
      item.entityId === entityId &&
      (item.kind === FOOD_ENTRY_CREATE ||
        item.kind === FOOD_CREATE ||
        item.kind === FOOD_ENTRY_MEAL_CREATE)
  );
  if (!row) return 'gone';
  if (row.status === 'sending') return 'uploading';

  let payload: unknown;
  if (row.kind === FOOD_ENTRY_CREATE) {
    payload = {
      ...(row.payload as FoodEntryCreatePayload),
      quantity,
      cooked_quantity: null,
    };
  } else if (row.kind === FOOD_CREATE) {
    const current = row.payload as FoodCreatePayload;
    payload = {
      ...current,
      entry: { ...current.entry, quantity, cooked_quantity: null },
    };
  } else {
    payload = {
      ...(row.payload as FoodEntryMealPayload),
      quantity,
    };
  }
  await enqueueOutbox(db, {
    id: row.id,
    serverConfigId,
    userId: row.userId,
    kind: row.kind,
    entityId: row.entityId,
    entryDate: row.entryDate,
    payload,
    payloadVersion: row.payloadVersion,
  });
  notifyOutboxChanged();
  return 'edited';
}
