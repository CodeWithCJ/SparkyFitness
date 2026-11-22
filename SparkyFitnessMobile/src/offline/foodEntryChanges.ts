import type { FoodEntry } from '../types/foodEntries';
import { normalizeDate } from '../utils/dateUtils';
import { getCacheRow } from './cacheStore';
import { CACHE_COLLECTIONS } from './collections';
import {
  FOOD_ENTRY_UPDATE,
  type FoodEntryUpdatePayload,
} from './foodEntryUpdateHandOver';
import {
  FOOD_ENTRY_MEAL_UPDATE,
  mealEntryFromChange,
  type FoodEntryMealUpdatePayload,
} from './foodEntryMealUpdateHandOver';
import type { OfflineDb, OutboxRow } from './types';

/** What changes made on the phone do to one day's food entries. */
export interface FoodEntryChanges {
  /** Entries of this day the server has, changed on the phone, by id. */
  inPlace: Record<string, Partial<FoodEntry>>;
  /** Entries moved off this day to another one: hidden here. */
  movedOut: string[];
  /** Entries moved onto this day from another, as they will read. */
  movedIn: FoodEntry[];
  /**
   * Logged meals saved on the phone and not yet uploaded: their components
   * are hidden on the day they were on, and the meal shows as one entry on
   * the day it now belongs to (in `movedIn`).
   */
  replacedMeals: string[];
}

export const NO_ENTRY_CHANGES: FoodEntryChanges = {
  inPlace: {},
  movedOut: [],
  movedIn: [],
  replacedMeals: [],
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
  deletedEntryIds: readonly string[] = [],
  deletedMealIds: readonly string[] = []
): Promise<FoodEntryChanges> {
  const inPlace: Record<string, Partial<FoodEntry>> = {};
  const movedOut: string[] = [];
  const movedIn: FoodEntry[] = [];
  const replacedMeals: string[] = [];
  const gone = new Set(deletedEntryIds);
  const goneMeals = new Set(deletedMealIds);
  for (const row of rows) {
    if (row.kind === FOOD_ENTRY_MEAL_UPDATE && row.entryDate) {
      const { display } = row.payload as FoodEntryMealUpdatePayload;
      const from = normalizeDate(row.entryDate);
      const to = display.entry_date ? normalizeDate(display.entry_date) : from;
      if (from === date) replacedMeals.push(row.entityId);
      if (to === date && !goneMeals.has(row.entityId)) {
        movedIn.push(
          mealEntryFromChange(row.entityId, { ...display, entry_date: to })
        );
      }
      continue;
    }
    if (row.kind !== FOOD_ENTRY_UPDATE || !row.entryDate) continue;
    const { display, original: kept } = row.payload as FoodEntryUpdatePayload;
    const from = normalizeDate(row.entryDate);
    const to = display.entry_date ? normalizeDate(display.entry_date) : from;
    if (from === date && to === date) {
      inPlace[row.entityId] = display;
    } else if (from === date) {
      movedOut.push(row.entityId);
    } else if (to === date && !gone.has(row.entityId)) {
      // The copy kept with the change; older rows fall back to the day it
      // came from, if that is still saved.
      const source = kept
        ? null
        : await getCacheRow(
            db,
            serverConfigId,
            CACHE_COLLECTIONS.diaryFoodDay,
            from
          );
      const original =
        kept ??
        (source?.payload as FoodEntry[] | undefined)?.find(
          (entry) => entry.id === row.entityId
        );
      if (original) movedIn.push({ ...original, ...display });
    }
  }
  return { inPlace, movedOut, movedIn, replacedMeals };
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
