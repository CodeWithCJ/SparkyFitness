import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { normalizeDate } from '../utils/dateUtils';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import {
  deleteUnconfirmedUnlessSending,
  isOwnedBy,
  enqueueOutbox,
} from './outbox';
import { signedInUserId } from './syncEngine';

/** The removal of a food entry the server already has, waiting to upload. */
export const FOOD_ENTRY_DELETE = 'food_entry.delete';

/** The payload shape of `food_entry.delete`, as this build writes it. */
export const FOOD_ENTRY_DELETE_PAYLOAD_VERSION = 1;

/**
 * Queues the removal of an entry the server has. Deleting is safe to send
 * again (an entry already gone counts as done), so it is kept after any
 * failure to reach the server, a timeout included. True once the row is
 * written.
 */
export async function queueFoodEntryDelete(
  entryId: string,
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
      kind: FOOD_ENTRY_DELETE,
      entityId: entryId,
      entryDate: normalizeDate(entryDate),
      payload: {},
      payloadVersion: FOOD_ENTRY_DELETE_PAYLOAD_VERSION,
    });
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not queue the delete: ${error}`, 'ERROR');
    return false;
  }
}

/**
 * What cancelling a waiting entry came to.
 * - `cancelled`: it never reached the server and now never will.
 * - `uploading`: it is being sent this moment; cancelling now could leave it
 *   on the server, so it is left to finish and can then be deleted.
 * - `gone`: nothing waits under that key any more (it uploaded meanwhile).
 */
export type CancelResult = 'cancelled' | 'uploading' | 'gone';

/** Removes a food entry, drink or meal that is still waiting to upload. */
export async function cancelWaitingEntry(
  entityId: string
): Promise<CancelResult> {
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return 'gone';
  const db = await getOfflineDb();
  const userId = await signedInUserId(db, serverConfigId);
  const outcome = await deleteUnconfirmedUnlessSending(
    db,
    serverConfigId,
    entityId,
    (row) => isOwnedBy(row, userId)
  );
  if (outcome === 'none') return 'gone';
  if (outcome === 'uploading') return 'uploading';
  notifyOutboxChanged();
  return 'cancelled';
}
