import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { normalizeDate } from '../utils/dateUtils';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import { enqueueOutbox } from './outbox';
import { signedInUserId } from './syncEngine';

/** The removal of a logged meal the server already has, waiting to upload. */
export const FOOD_ENTRY_MEAL_DELETE = 'food_entry_meal.delete';

/** The payload shape of `food_entry_meal.delete`, as this build writes it. */
export const FOOD_ENTRY_MEAL_DELETE_PAYLOAD_VERSION = 1;

/**
 * Queues the removal of a logged meal (with its component entries) the server
 * has. Deleting is safe to send again, so it is kept after any failure to
 * reach the server, a timeout included. True once the row is written.
 */
export async function queueFoodEntryMealDelete(
  mealId: string,
  entryDate: string
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
      kind: FOOD_ENTRY_MEAL_DELETE,
      entityId: mealId,
      entryDate: normalizeDate(entryDate),
      payload: {},
      payloadVersion: FOOD_ENTRY_MEAL_DELETE_PAYLOAD_VERSION,
    });
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not queue the meal delete: ${error}`, 'ERROR');
    return false;
  }
}
