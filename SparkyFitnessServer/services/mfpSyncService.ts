import { log } from '../config/logging';
import {
  pushNutritionToMFP,
  pushWaterToMFP,
  MFPCategoryData,
} from '../integrations/myfitnesspal/myFitnessPalService';
import * as measurementRepository from '../models/measurementRepository';

// In-memory lock to prevent multiple concurrent syncs for the same user and date.
const activeSyncs = new Set<string>();

interface SyncResult {
  status: 'success' | 'skipped' | 'error';
  date: string;
  reason?: string;
  message?: string;
  responses?: any[];
  waterSynced?: boolean;
}

/**
 * Syncs the daily nutrition totals and water intake for a user to MyFitnessPal.
 *
 * @param userId - The user whose data to sync.
 * @param date - The date to sync (YYYY-MM-DD).
 * @returns The result of the sync operation.
 */
export async function syncDailyNutritionToMFP(
  userId: string,
  date: string
): Promise<SyncResult> {
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

    // 1. Sync Food/Nutrition
    const categories = await getDailyNutritionByCategory(userId, date);
    let nutritionResult = null;

    if (categories && Object.keys(categories).length > 0) {
      const mfpData = {
        date: date,
        categories: {} as Record<string, MFPCategoryData>,
      };

      const categoriesData = categories as Record<
        string,
        {
          calories: number;
          protein: number;
          fat: number;
          carbohydrate: number;
        }
      >;
      for (const name in categoriesData) {
        const row = categoriesData[name];
        mfpData.categories[name] = {
          calories: row.calories,
          protein: row.protein,
          fat: row.fat,
          carbohydrate: row.carbohydrate,
        };
      }

      nutritionResult = await pushNutritionToMFP(userId, mfpData);
    }

    // 2. Sync Water
    let waterSynced = false;
    try {
      const waterData = await measurementRepository.getWaterIntakeByDate(
        userId,
        date
      );
      const waterMl = waterData ? parseFloat(waterData.water_ml) : 0;

      if (waterMl > 0) {
        await pushWaterToMFP(userId, date, waterMl);
        waterSynced = true;
        log(
          'info',
          `mfpSyncService: Successfully synced ${waterMl}ml water to MFP for ${userId}`
        );
      }
    } catch (waterError: any) {
      log(
        'warn',
        `mfpSyncService: Water sync failed for ${userId}: ${waterError.message}`
      );
    }

    if (!nutritionResult && !waterSynced) {
      return { status: 'skipped', date, reason: 'no_data_or_no_creds' };
    }

    return {
      status: 'success',
      date,
      responses: nutritionResult?.responses || [],
      waterSynced,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      'error',
      `mfpSyncService: Failed to sync for user ${userId} on ${date}:`,
      message
    );
    return { status: 'error', date, message };
  } finally {
    activeSyncs.delete(lockKey);
  }
}
