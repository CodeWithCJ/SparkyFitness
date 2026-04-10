import { log } from '../config/logging';
import { pushNutritionToMFP } from '../integrations/myfitnesspal/myFitnessPalService';

// In-memory lock to prevent multiple concurrent syncs for the same user and date.
const activeSyncs = new Set<string>();

/**
 * Syncs the daily nutrition totals for a user to MyFitnessPal, categorized by meal type.
 * This should be called whenever a food entry is created, updated, or deleted.
 *
 * @param userId - The user whose data to sync.
 * @param date - The date to sync (YYYY-MM-DD).
 * @returns The result of the sync operation.
 */
export async function syncDailyTotals(
  userId: string,
  date: string
): Promise<any> {
  const lockKey = `${userId}:${date}`;
  if (activeSyncs.has(lockKey)) {
    log(
      'info',
      `mfpSyncService: Sync already in progress for user ${userId} on ${date}. Skipping concurrent request.`
    );
    return { status: 'skipped', date, reason: 'concurrent_request' };
  }

  activeSyncs.add(lockKey);

  const { getDailyNutritionByCategory } = require('./foodEntryService');
  try {
    log(
      'info',
      `mfpSyncService: Starting categorized sync for user ${userId} on ${date}`
    );

    // 1. Fetch categorized daily totals from SparkyFitness
    const categories = await getDailyNutritionByCategory(userId, date);

    if (!categories || Object.keys(categories).length === 0) {
      log(
        'info',
        `mfpSyncService: No nutrition data found for ${userId} on ${date}. Sync skipped.`
      );
      return { status: 'skipped', date };
    }

    // 2. Map SparkyFitness categories to MFP expected format
    const mfpData: any = {
      date: date,
      categories: {},
    };

    const categoriesData = categories as Record<string, any>;
    for (const name in categoriesData) {
      const row = categoriesData[name];
      mfpData.categories[name] = {
        calories: row.calories,
        protein: row.protein,
        fat: row.fat,
        carbohydrate: row.carbohydrate || row.carbs,
      };
    }

    // 3. Push to MyFitnessPal
    const result = await pushNutritionToMFP(userId, mfpData);

    log(
      'info',
      `mfpSyncService: Successfully synced categorized totals for user ${userId} on ${date}`
    );
    return { status: 'success', date, ...result };
  } catch (error: any) {
    log(
      'error',
      `mfpSyncService: Failed to sync totals for user ${userId} on ${date}:`,
      error.message
    );
    return { status: 'error', date, message: error.message };
  } finally {
    activeSyncs.delete(lockKey);
  }
}
