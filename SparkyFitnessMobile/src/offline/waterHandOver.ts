import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import { enqueueOutbox } from './outbox';
import { signedInUserId } from './syncEngine';

/** One "+" press of a water container, waiting for the server. */
export const WATER_ADD = 'water.add';

/** The payload shape of `water.add`, as this build writes it. */
export const WATER_PAYLOAD_VERSION = 1;

export interface WaterAddPayload {
  /** The calendar day (YYYY-MM-DD) the drink was logged for. */
  entryDate: string;
  containerId: number;
}

/**
 * Queues one drink for upload. The row's id doubles as the replay key sent to
 * the server (`client_id`), so a drink whose first upload reached the server
 * but whose answer was lost is never logged twice. `clientId` is minted by
 * the caller before the first request, so a press that is queued after a
 * failed request keeps the key that request carried.
 *
 * True once the row is written.
 */
export async function queueWaterDrink(
  clientId: string,
  payload: WaterAddPayload
): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    await enqueueOutbox(db, {
      // A press is its own entity: two presses are two rows, never merged.
      id: newUuid(),
      serverConfigId,
      userId,
      kind: WATER_ADD,
      entityId: clientId,
      entryDate: payload.entryDate,
      payload,
      payloadVersion: WATER_PAYLOAD_VERSION,
    });
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not queue the drink: ${error}`, 'ERROR');
    return false;
  }
}
