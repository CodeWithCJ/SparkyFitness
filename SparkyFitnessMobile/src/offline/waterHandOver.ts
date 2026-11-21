import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import type { WaterIntakeLogEntry } from '@workspace/shared';
import { getCacheRow } from './cacheStore';
import { CACHE_COLLECTIONS } from './collections';
import {
  deleteUnconfirmedForEntity,
  enqueueOutbox,
  listUnconfirmedOutbox,
} from './outbox';
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

/** The removal of one drink the server already has, waiting to upload. */
export const WATER_REMOVE = 'water.remove';

/** The payload shape of `water.remove`, as this build writes it. */
export const WATER_REMOVE_PAYLOAD_VERSION = 1;

export interface WaterRemovePayload {
  entryDate: string;
  /** The server's id of the drink (a row of the day's water log). */
  logEntryId: string;
  /** What the drink counted, so the day's total can be lowered meanwhile. */
  waterMl: number;
  /** The food entry a linked container's drink made, removed with it. */
  foodEntryId: string | null;
}

/**
 * Takes off the latest drink of a day with no connection, the way the "-"
 * button does online (the most recent manual drink). A drink still waiting
 * to upload is simply cancelled; otherwise the latest drink the phone knows
 * the server has is queued for removal by its id, which is safe to send again
 * (one already gone counts as done). 'none' when there is nothing to take off.
 */
export async function removeLatestDrinkOffline(
  entryDate: string
): Promise<'cancelled' | 'queued' | 'none'> {
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return 'none';
  const db = await getOfflineDb();
  const rows = await listUnconfirmedOutbox(db, serverConfigId);

  const waiting = rows
    .filter(
      (row) =>
        row.kind === WATER_ADD &&
        row.entryDate === entryDate &&
        row.status !== 'sending'
    )
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (waiting) {
    await deleteUnconfirmedForEntity(db, serverConfigId, waiting.entityId);
    notifyOutboxChanged();
    return 'cancelled';
  }

  const alreadyRemoved = new Set(
    rows.filter((row) => row.kind === WATER_REMOVE).map((row) => row.entityId)
  );
  const kept = await getCacheRow(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.waterLog,
    entryDate
  );
  const latest = ((kept?.payload as WaterIntakeLogEntry[] | undefined) ?? [])
    .filter(
      (entry) => entry.source === 'manual' && !alreadyRemoved.has(entry.id)
    )
    .sort((a, b) => b.logged_at.localeCompare(a.logged_at))[0];
  if (!latest) return 'none';

  try {
    const userId = await signedInUserId(db, serverConfigId);
    const payload: WaterRemovePayload = {
      entryDate,
      logEntryId: latest.id,
      waterMl: latest.water_ml,
      foodEntryId: latest.food_entry_id ?? null,
    };
    await enqueueOutbox(db, {
      id: newUuid(),
      serverConfigId,
      userId,
      kind: WATER_REMOVE,
      entityId: latest.id,
      entryDate,
      payload,
      payloadVersion: WATER_REMOVE_PAYLOAD_VERSION,
    });
    notifyOutboxChanged();
    return 'queued';
  } catch (error) {
    addLog(`[Offline] Could not queue the drink removal: ${error}`, 'ERROR');
    return 'none';
  }
}
