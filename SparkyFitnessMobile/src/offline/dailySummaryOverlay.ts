import { getActiveServerConfigId } from '../services/storage';
import type { FoodEntry } from '../types/foodEntries';
import type { WaterContainer } from '../types/measurements';
import { getServingVolume } from '../utils/unitConversions';
import { savedCopyReadable } from './accountGeneration';
import { CACHE_COLLECTIONS } from './collections';
import { getOfflineDb } from './db';
import { previewFromQueuedRow } from './foodEntryPreview';
import { readSavedSingle } from './foodLibrary';
import { FOOD_ENTRY_UPDATE } from './foodEntryUpdateHandOver';
import { listUnconfirmedOutbox } from './outbox';
import { signedInUserId } from './syncEngine';
import { FOOD_ENTRY_DELETE } from './foodEntryDeleteHandOver';
import { NO_ENTRY_CHANGES, readFoodEntryChanges } from './foodEntryChanges';
import { FOOD_ENTRY_MEAL_DELETE } from './foodEntryMealDeleteHandOver';
import { WATER_ADD, type WaterAddPayload } from './waterHandOver';

/** What is waiting to upload for one day, ready to add to the day's totals. */
export interface WaitingForDay {
  /** Entries as they will read once uploaded. */
  foodEntries: FoodEntry[];
  /** Millilitres of drinks, where the phone can tell how much each press adds. */
  waterMl: number;
  /** Entries the server has whose removal is waiting to upload. */
  deletedFoodEntryIds: string[];
  /** Logged meals the server has whose removal is waiting to upload. */
  deletedMealIds: string[];
  /** Entries of the day the server has, changed on the phone, by entry id. */
  changedEntries: Record<string, Partial<FoodEntry>>;
}

/**
 * Entries less those whose removal waits to upload: the entries themselves
 * and every component of a logged meal that is waiting to be removed.
 */
export function withoutDeleted(
  entries: readonly FoodEntry[],
  deletedEntryIds: readonly string[],
  deletedMealIds: readonly string[]
): FoodEntry[] {
  const gone = new Set(deletedEntryIds);
  const goneMeals = new Set(deletedMealIds);
  return entries.filter(
    (entry) =>
      !gone.has(entry.id) &&
      !(entry.food_entry_meal_id && goneMeals.has(entry.food_entry_meal_id))
  );
}

const NOTHING_WAITING: WaitingForDay = {
  foodEntries: [],
  waterMl: 0,
  deletedFoodEntryIds: [],
  deletedMealIds: [],
  changedEntries: {},
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
    const mine = (await listUnconfirmedOutbox(db, serverConfigId)).filter(
      (row) => row.userId == null || row.userId === userId
    );
    const rows = mine.filter((row) => row.entryDate === date);
    // A change that moves an entry between days touches both of them.
    const hasChange = mine.some((row) => row.kind === FOOD_ENTRY_UPDATE);
    if (rows.length === 0 && !hasChange) return NOTHING_WAITING;

    const foodEntries: FoodEntry[] = [];
    const deletedFoodEntryIds: string[] = [];
    const deletedMealIds: string[] = [];
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
      if (row.kind === FOOD_ENTRY_MEAL_DELETE) {
        deletedMealIds.push(row.entityId);
        continue;
      }
      if (row.kind === FOOD_ENTRY_UPDATE) continue;
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
    const changes = hasChange
      ? await readFoodEntryChanges(
          db,
          serverConfigId,
          date,
          mine,
          deletedFoodEntryIds
        )
      : NO_ENTRY_CHANGES;
    return {
      foodEntries: [...foodEntries, ...changes.movedIn],
      waterMl,
      // An entry moved to another day is off this one, like a deleted one.
      deletedFoodEntryIds: [...deletedFoodEntryIds, ...changes.movedOut],
      deletedMealIds,
      changedEntries: changes.inPlace,
    };
  } catch {
    return NOTHING_WAITING;
  }
}
