import type { FoodEntry } from '../types/foodEntries';
import { normalizeDate } from '../utils/dateUtils';
import { getCacheRow } from './cacheStore';
import { CACHE_COLLECTIONS } from './collections';
import {
  FOOD_ENTRY_UPDATE,
  type FoodEntryUpdatePayload,
} from './foodEntryUpdateHandOver';
import type { OfflineDb, OutboxRow } from './types';

/** What changes made on the phone do to one day's food entries. */
export interface FoodEntryChanges {
  /** Entries of this day the server has, changed on the phone, by id. */
  inPlace: Record<string, Partial<FoodEntry>>;
  /** Entries moved off this day to another one: hidden here. */
  movedOut: string[];
  /** Entries moved onto this day from another, as they will read. */
  movedIn: FoodEntry[];
}

export const NO_ENTRY_CHANGES: FoodEntryChanges = {
  inPlace: {},
  movedOut: [],
  movedIn: [],
};

/**
 * Sorts the waiting changes to entries the server has by what they do to
 * `date`: change an entry where it is, take it off the day, or bring it in
 * from the day it was on. Change rows are not filtered by day beforehand,
 * since a move touches two days. `deletedEntryIds` are entries whose removal
 * is waiting: a moved entry that is then deleted does not come in.
 */
export async function readFoodEntryChanges(
  db: OfflineDb,
  serverConfigId: string,
  date: string,
  rows: readonly OutboxRow[],
  deletedEntryIds: readonly string[] = []
): Promise<FoodEntryChanges> {
  const inPlace: Record<string, Partial<FoodEntry>> = {};
  const movedOut: string[] = [];
  const movedIn: FoodEntry[] = [];
  const gone = new Set(deletedEntryIds);
  for (const row of rows) {
    if (row.kind !== FOOD_ENTRY_UPDATE || !row.entryDate) continue;
    const { display } = row.payload as FoodEntryUpdatePayload;
    const from = normalizeDate(row.entryDate);
    const to = display.entry_date ? normalizeDate(display.entry_date) : from;
    if (from === date && to === date) {
      inPlace[row.entityId] = display;
    } else if (from === date) {
      movedOut.push(row.entityId);
    } else if (to === date && !gone.has(row.entityId)) {
      const source = await getCacheRow(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.diaryFoodDay,
        from
      );
      const original = (source?.payload as FoodEntry[] | undefined)?.find(
        (entry) => entry.id === row.entityId
      );
      if (original) movedIn.push({ ...original, ...display });
    }
  }
  return { inPlace, movedOut, movedIn };
}

/** Entries with the changes made on the phone applied where they are. */
export function applyEntryChanges(
  entries: readonly FoodEntry[],
  inPlace: Readonly<Record<string, Partial<FoodEntry>>>
): FoodEntry[] {
  return entries.map((entry) =>
    entry.id in inPlace ? { ...entry, ...inPlace[entry.id] } : entry
  );
}
