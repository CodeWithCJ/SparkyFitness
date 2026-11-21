import { getActiveServerConfigId } from '../services/storage';
import type { FoodEntry } from '../types/foodEntries';
import type { WaterContainer } from '../types/measurements';
import { getServingVolume } from '../utils/unitConversions';
import { savedCopyReadable } from './accountGeneration';
import { CACHE_COLLECTIONS } from './collections';
import { getOfflineDb } from './db';
import { previewFromQueuedRow } from './foodEntryPreview';
import { readSavedSingle } from './foodLibrary';
import { listUnconfirmedOutbox } from './outbox';
import { signedInUserId } from './syncEngine';
import { FOOD_ENTRY_DELETE } from './foodEntryDeleteHandOver';
import { WATER_ADD, type WaterAddPayload } from './waterHandOver';

/** What is waiting to upload for one day, ready to add to the day's totals. */
export interface WaitingForDay {
  /** Entries as they will read once uploaded. */
  foodEntries: FoodEntry[];
  /** Millilitres of drinks, where the phone can tell how much each press adds. */
  waterMl: number;
  /** Entries the server has whose removal is waiting to upload. */
  deletedFoodEntryIds: string[];
}

const NOTHING_WAITING: WaitingForDay = {
  foodEntries: [],
  waterMl: 0,
  deletedFoodEntryIds: [],
};

/**
 * The food entries and drinks of one day that the server has not confirmed.
 * A summary from the server (or the phone's copy of one) does not include
 * them, so they are added on top; once uploaded they are in the server's
 * numbers and no longer listed here. Work made under another account is left
 * out. Never throws: a phone that cannot read its own file shows the day as
 * it is.
 */
export async function readWaitingForDay(date: string): Promise<WaitingForDay> {
  try {
    if (!(await savedCopyReadable())) return NOTHING_WAITING;
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return NOTHING_WAITING;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    const rows = (await listUnconfirmedOutbox(db, serverConfigId)).filter(
      (row) =>
        row.entryDate === date && (row.userId == null || row.userId === userId)
    );
    if (rows.length === 0) return NOTHING_WAITING;

    const foodEntries: FoodEntry[] = [];
    const deletedFoodEntryIds: string[] = [];
    let waterMl = 0;
    const containers =
      (await readSavedSingle<WaterContainer[]>(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.waterContainers
      )) ?? [];
    for (const row of rows) {
      if (row.kind === FOOD_ENTRY_DELETE) {
        deletedFoodEntryIds.push(row.entityId);
        continue;
      }
      if (row.kind === WATER_ADD) {
        const { containerId } = row.payload as WaterAddPayload;
        const container = containers.find((item) => item.id === containerId);
        // A linked container's credit is worked out by the server from its
        // food, so it cannot be counted here.
        const perPress = container ? getServingVolume(container) : null;
        if (perPress != null) waterMl += perPress;
        continue;
      }
      const preview = await previewFromQueuedRow(db, serverConfigId, row);
      if (preview) foodEntries.push(preview);
    }
    return { foodEntries, waterMl, deletedFoodEntryIds };
  } catch {
    return NOTHING_WAITING;
  }
}
