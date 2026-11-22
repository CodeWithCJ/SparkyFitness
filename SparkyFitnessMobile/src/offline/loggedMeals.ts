import { apiFetch } from '../services/api/apiClient';
import type { FoodEntry } from '../types/foodEntries';
import type { FoodEntryMeal } from '../types/foodEntryMeals';
import { accountGeneration } from './accountGeneration';
import { getCacheRow, listCacheRows, putCacheRows } from './cacheStore';
import { CACHE_COLLECTIONS } from './collections';
import {
  applyMealChange,
  findWaitingMealChange,
} from './foodEntryMealUpdateHandOver';
import type { OfflineDb } from './types';

/**
 * A logged meal with its components as the server last gave it, with a change
 * made on the phone and not yet uploaded applied on top, so editing again
 * starts from what was saved last. Null when the phone never held it.
 */
export async function readSavedLoggedMeal(
  db: OfflineDb,
  serverConfigId: string,
  mealId: string
): Promise<FoodEntryMeal | null> {
  const row = await getCacheRow(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.loggedMeal,
    mealId
  );
  if (!row) return null;
  const meal = row.payload as FoodEntryMeal;
  const change = await findWaitingMealChange(db, serverConfigId, mealId);
  return change ? applyMealChange(meal, change) : meal;
}

/**
 * Keeps the logged meals of the days the Diary is kept for, with their
 * components, so one can be opened and edited with no connection. A meal that
 * cannot be loaded keeps the copy it had; meals no longer in those days go.
 */
export async function refreshLoggedMeals(
  db: OfflineDb,
  serverConfigId: string,
  entries: readonly FoodEntry[],
  startedUnder: number = accountGeneration()
): Promise<void> {
  const ids = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.food_entry_meal_id ? [entry.food_entry_meal_id] : []
      )
    ),
  ];
  let failed: unknown = null;
  for (const id of ids) {
    if (accountGeneration() !== startedUnder) return;
    try {
      const meal = await apiFetch<FoodEntryMeal>({
        endpoint: `/api/food-entry-meals/${id}`,
        serviceName: 'Offline pack',
        operation: 'fetch a logged meal',
      });
      if (accountGeneration() !== startedUnder) return;
      await putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.loggedMeal, [
        { key: id, name: meal.name, payload: meal },
      ]);
    } catch (error) {
      // Keeps the copy it had and goes on with the other meals; the failure
      // is reported below so the refresh is not marked complete.
      failed = error;
    }
  }
  const keep = new Set(ids);
  for (const doc of await listCacheRows(
    db,
    serverConfigId,
    CACHE_COLLECTIONS.loggedMeal
  )) {
    if (!keep.has(doc.key)) {
      await db.run(
        `DELETE FROM cache WHERE server_config_id = ? AND collection = ? AND key = ?`,
        [serverConfigId, CACHE_COLLECTIONS.loggedMeal, doc.key]
      );
    }
  }
  // Told to the caller once every meal has had its turn, so the pack tries
  // again instead of recording a refresh that left a meal missing.
  if (failed) throw failed;
}
