import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import type { WaterIntakeLogEntry } from '@workspace/shared';
import { accountGeneration, savedCopyReadable } from './accountGeneration';
import { getCacheRow } from './cacheStore';
import { CACHE_COLLECTIONS } from './collections';
import {
  deleteUnconfirmedUnlessSending,
  enqueueOutbox,
  isOwnedBy,
  listUnconfirmedOutbox,
} from './outbox';
import { signedInUserId } from './syncEngine';

/**
 * True while the signed-in account is still the one that started the
 * request (`startedUnder`, its `accountGeneration()` at that time). Checked
 * right before a queue function writes a new row: the `userId` it resolved
 * is whoever was signed in when it called `signedInUserId`, which an account
 * switch during the awaits before that can already have moved past the
 * account the request began under -- `queueAfterConnectionFailure`'s own
 * check, made before any of those awaits, does not cover this window.
 */
function stillStartedAccount(startedUnder: number | undefined): boolean {
  return startedUnder === undefined || accountGeneration() === startedUnder;
}

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
 * True once the row is written. `startedUnder` is the caller's
 * `accountGeneration()` from before its first request; passing it refuses
 * the write if the signed-in account has moved on by the time this runs.
 */
export async function queueWaterDrink(
  clientId: string,
  payload: WaterAddPayload,
  startedUnder?: number
): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    // Whose it is must be known: a row nobody owns would be shown to, and
    // uploaded under, whichever account signs in next.
    if (userId == null) return false;
    // The same press sent again (a redelivered tap) is the row already kept.
    const kept = (await listUnconfirmedOutbox(db, serverConfigId)).find(
      (row) =>
        row.kind === WATER_ADD &&
        row.entityId === clientId &&
        isOwnedBy(row, userId)
    );
    if (kept) return true;
    if (!stillStartedAccount(startedUnder)) return false;
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

/**
 * A one-off amount with no container (#3734), waiting for the server. Its
 * own kind rather than `water.add`'s payload: that shape names a container
 * press, not an arbitrary millilitre amount.
 */
export const WATER_ADD_CUSTOM = 'water.addCustom';

/** The payload shape of `water.addCustom`, as this build writes it. */
export const WATER_ADD_CUSTOM_PAYLOAD_VERSION = 1;

export interface WaterAddCustomPayload {
  entryDate: string;
  waterMl: number;
}

/**
 * Queues one custom-amount entry for upload. Mirrors `queueWaterDrink`'s
 * replay-key contract: the row's id is the key sent to the server, so a
 * request whose upload reached the server but whose answer was lost is
 * never logged twice. `startedUnder` follows `queueWaterDrink`'s contract.
 */
export async function queueWaterCustomAmount(
  clientId: string,
  payload: WaterAddCustomPayload,
  startedUnder?: number
): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    if (userId == null) return false;
    const kept = (await listUnconfirmedOutbox(db, serverConfigId)).find(
      (row) =>
        row.kind === WATER_ADD_CUSTOM &&
        row.entityId === clientId &&
        isOwnedBy(row, userId)
    );
    if (kept) return true;
    if (!stillStartedAccount(startedUnder)) return false;
    await enqueueOutbox(db, {
      id: newUuid(),
      serverConfigId,
      userId,
      kind: WATER_ADD_CUSTOM,
      entityId: clientId,
      entryDate: payload.entryDate,
      payload,
      payloadVersion: WATER_ADD_CUSTOM_PAYLOAD_VERSION,
    });
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not queue the custom amount: ${error}`, 'ERROR');
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
 * `startedUnder` follows `queueWaterDrink`'s contract and only guards the
 * removal-queued path below (the cancel path deletes by this account's own
 * row id, which carries no new attribution to get wrong).
 */
export async function removeLatestDrinkOffline(
  entryDate: string,
  startedUnder?: number
): Promise<'cancelled' | 'queued' | 'none' | 'busy'> {
  // The saved drink list belongs to whoever it was made for: it is not read
  // while that is in doubt (just after an account switch), like every other
  // offline reader.
  if (!(await savedCopyReadable())) return 'none';
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return 'none';
  const db = await getOfflineDb();
  const userId = await signedInUserId(db, serverConfigId);
  // Only this account's waiting work: the queue is shared by everyone who
  // signs in on the phone. The saved water log is the signed-in person's too.
  if (userId == null) return 'none';
  const rows = (await listUnconfirmedOutbox(db, serverConfigId)).filter((row) =>
    isOwnedBy(row, userId)
  );

  const waiting = rows
    .filter(
      (row) =>
        (row.kind === WATER_ADD || row.kind === WATER_ADD_CUSTOM) &&
        row.entryDate === entryDate &&
        row.status !== 'sending'
    )
    // `createdAt` alone cannot break a tie between two drinks queued in the
    // same millisecond; `rowid` is SQLite's own insertion-order sequence, so
    // it always resolves to the one queued more recently.
    .sort((a, b) => b.createdAt - a.createdAt || b.rowid - a.rowid)[0];
  if (waiting) {
    // A drink whose upload was already tried may be on the server (the answer
    // can be lost), and cancelling it would drop the only record of it, so it
    // has to finish uploading first. The checks and the delete are one
    // transaction: a row the upload claims, or retries, in between is never
    // removed under it.
    const outcome = await deleteUnconfirmedUnlessSending(
      db,
      serverConfigId,
      waiting.entityId,
      (row) => isOwnedBy(row, userId),
      (row) => row.attempts > 0
    );
    if (outcome === 'deleted') {
      notifyOutboxChanged();
      return 'cancelled';
    }
    // 'uploading', or gone because it has just been confirmed: either way the
    // saved drinks do not show it yet.
    return 'busy';
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
  if (!stillStartedAccount(startedUnder)) return 'none';

  try {
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
