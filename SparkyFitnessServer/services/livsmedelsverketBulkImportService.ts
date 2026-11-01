import { getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { trackBackgroundWork } from '../utils/shutdownHooks.js';
import type {
  LivsmedelsverketBulkImportRequest,
  LivsmedelsverketBulkImportStatus,
} from '@workspace/shared';
import {
  getLivsmedelsverketFoodDirectory,
  getLivsmedelsverketFoodDetails,
  resolveSprakCode,
} from '../integrations/livsmedelsverket/livsmedelsverketService.js';
import { enrichWithCustomNutrients } from './foodProviderDetailService.js';

const activeImports = new Map<string, LivsmedelsverketBulkImportStatus>();

export function getLivsmedelsverketImportStatus(
  userId: string
): LivsmedelsverketBulkImportStatus {
  return (
    activeImports.get(userId) || {
      userId,
      isRunning: false,
      status: 'idle',
      progress: 0,
      total: 0,
      processed: 0,
      imported: 0,
      updated: 0,
    }
  );
}

export async function deleteLivsmedelsverketLibraryFoods(
  userId?: string
): Promise<{ deletedCount: number }> {
  if (!userId) {
    return { deletedCount: 0 };
  }
  const client = await getSystemClient();
  try {
    const res = await client.query(
      "DELETE FROM foods WHERE provider_type = 'livsmedelsverket' AND user_id = $1",
      [userId]
    );
    return { deletedCount: res.rowCount ?? 0 };
  } finally {
    client.release();
  }
}

export async function startLivsmedelsverketBulkImport(
  userId: string,
  options: LivsmedelsverketBulkImportRequest
): Promise<void> {
  const currentStatus = activeImports.get(userId);
  if (currentStatus?.isRunning) {
    throw new Error(
      'A Livsmedelsverket import is already running for this user.'
    );
  }

  const initialStatus: LivsmedelsverketBulkImportStatus = {
    userId,
    isRunning: true,
    status: 'running',
    progress: 0,
    total: 0,
    processed: 0,
    imported: 0,
    updated: 0,
    lastRunAt: new Date().toISOString(),
  };
  activeImports.set(userId, initialStatus);

  // Run in background asynchronously so request returns immediately
  const importRun = (async () => {
    try {
      const language = options.language || 'sv';
      const sprakCode = resolveSprakCode(language);
      const directory = await getLivsmedelsverketFoodDirectory(sprakCode);

      const itemsToProcess =
        options.maxFoods && options.maxFoods > 0
          ? directory.slice(0, options.maxFoods)
          : directory;

      const total = itemsToProcess.length;
      initialStatus.total = total;

      let processedCount = 0;
      let importedCount = 0;
      let updatedCount = 0;
      let failedCount = 0;
      let firstFailureError: string | null = null;

      const BATCH_SIZE = 100;
      for (let i = 0; i < itemsToProcess.length; i += BATCH_SIZE) {
        const batch = itemsToProcess.slice(i, i + BATCH_SIZE);

        const mappedBatch = await Promise.all(
          batch.map(async (item) => {
            try {
              return await getLivsmedelsverketFoodDetails(
                String(item.nummer),
                language
              );
            } catch (err) {
              log(
                'warn',
                `Failed to fetch details for Livsmedelsverket food ${item.nummer} during import: ${err}`
              );
              failedCount++;
              if (!firstFailureError) {
                firstFailureError =
                  err instanceof Error ? err.message : String(err);
              }
              return null;
            }
          })
        );

        const validFoods = mappedBatch.filter(
          (f): f is NonNullable<typeof f> => f !== null
        );

        if (validFoods.length > 0) {
          // Enrich with user's mapped custom nutrients (supports Swedish names and aliases)
          await enrichWithCustomNutrients(userId, validFoods);

          const client = await getSystemClient();
          try {
            await client.query('BEGIN');

            const externalIds = validFoods.map((f) => f.provider_external_id);
            const existingRes = (await client.query(
              "SELECT id, provider_external_id FROM foods WHERE provider_type = 'livsmedelsverket' AND provider_external_id = ANY($1) AND user_id = $2",
              [externalIds, userId]
            )) as { rows: Array<{ id: string; provider_external_id: string }> };

            const existingMap = new Map<string, string>();
            for (const row of existingRes.rows) {
              existingMap.set(row.provider_external_id, row.id);
            }

            const toInsert = validFoods.filter(
              (f) => !existingMap.has(f.provider_external_id)
            );
            const toUpdate = validFoods.filter((f) =>
              existingMap.has(f.provider_external_id)
            );

            // Insert new foods
            if (toInsert.length > 0) {
              const insertValues: (string | boolean | null)[] = [userId];
              const valueClauses: string[] = [];
              let paramIdx = 2;

              for (const item of toInsert) {
                valueClauses.push(
                  `($${paramIdx}, FALSE, $1, 'Swedish Food Agency (Livsmedelsverket)', $${paramIdx + 1}, TRUE, 'livsmedelsverket', TRUE, FALSE, '[]'::jsonb, NULL, now(), now())`
                );
                insertValues.push(item.name, item.provider_external_id);
                paramIdx += 2;
              }

              const inserted = (await client.query(
                `INSERT INTO foods (
                  name, is_custom, user_id, brand, provider_external_id, shared_with_public,
                  provider_type, provider_verified, is_quick_food, images, notes, created_at, updated_at
                ) VALUES ${valueClauses.join(', ')}
                RETURNING id, provider_external_id`,
                insertValues
              )) as {
                rows: Array<{ id: string; provider_external_id: string }>;
              };

              for (const row of inserted.rows) {
                existingMap.set(row.provider_external_id, row.id);
              }
            }

            // Update existing foods
            if (toUpdate.length > 0) {
              const updateValues: (string | null)[] = [userId];
              const updateClauses: string[] = [];
              let updateParamIdx = 2;

              for (const item of toUpdate) {
                const foodId = existingMap.get(item.provider_external_id)!;
                updateClauses.push(
                  `($${updateParamIdx}::text, $${updateParamIdx + 1}::uuid)`
                );
                updateValues.push(item.name, foodId);
                updateParamIdx += 2;
              }

              await client.query(
                `UPDATE foods AS f
                 SET name = v.name,
                     brand = 'Swedish Food Agency (Livsmedelsverket)',
                     provider_verified = TRUE,
                     updated_at = now()
                 FROM (VALUES ${updateClauses.join(', ')}) AS v(name, id)
                 WHERE f.id = v.id AND f.user_id = $1`,
                updateValues
              );
            }

            // Find existing default variants for updated foods so we preserve their IDs and references
            const toUpdateFoodIds = toUpdate
              .map((item) => existingMap.get(item.provider_external_id))
              .filter((id): id is string => Boolean(id));

            const existingVariantMap = new Map<string, string>(); // food_id -> variant_id
            if (toUpdateFoodIds.length > 0) {
              const existingVariantsRes = (await client.query(
                'SELECT id, food_id FROM food_variants WHERE food_id = ANY($1) AND is_default = TRUE',
                [toUpdateFoodIds]
              )) as { rows: Array<{ id: string; food_id: string }> };
              for (const row of existingVariantsRes.rows) {
                existingVariantMap.set(row.food_id, row.id);
              }
            }

            // Update existing default variants in place without deleting them
            for (const item of toUpdate) {
              const foodId = existingMap.get(item.provider_external_id);
              if (!foodId) continue;
              const variantId = existingVariantMap.get(foodId);
              if (!variantId) continue;
              const v = item.default_variant;

              await client.query(
                `UPDATE food_variants
                 SET serving_size = $2,
                     serving_unit = $3,
                     calories = $4,
                     protein = $5,
                     carbs = $6,
                     fat = $7,
                     saturated_fat = $8,
                     polyunsaturated_fat = $9,
                     monounsaturated_fat = $10,
                     cholesterol = $11,
                     sodium = $12,
                     potassium = $13,
                     dietary_fiber = $14,
                     sugars = $15,
                     calcium = $16,
                     iron = $17,
                     vitamin_a = $18,
                     vitamin_c = $19,
                     caffeine_mg = $20,
                     water_ml = $21,
                     alcohol_g = $22,
                     custom_nutrients = $23::jsonb,
                     source = 'imported',
                     updated_at = now()
                 WHERE id = $1`,
                [
                  variantId,
                  v.serving_size,
                  v.serving_unit,
                  v.calories,
                  v.protein,
                  v.carbs,
                  v.fat,
                  v.saturated_fat ?? null,
                  v.polyunsaturated_fat ?? null,
                  v.monounsaturated_fat ?? null,
                  v.cholesterol ?? null,
                  v.sodium ?? null,
                  v.potassium ?? null,
                  v.dietary_fiber ?? null,
                  v.sugars ?? null,
                  v.calcium ?? null,
                  v.iron ?? null,
                  v.vitamin_a ?? null,
                  v.vitamin_c ?? null,
                  v.caffeine_mg ?? null,
                  v.water_ml ?? null,
                  v.alcohol_g ?? null,
                  JSON.stringify(v.custom_nutrients || {}),
                ]
              );
            }

            // Insert new default variants for new foods or updated foods lacking one
            const foodsNeedingVariantInsert = [
              ...toInsert,
              ...toUpdate.filter((item) => {
                const foodId = existingMap.get(item.provider_external_id);
                return foodId && !existingVariantMap.has(foodId);
              }),
            ];

            if (foodsNeedingVariantInsert.length > 0) {
              const variantValues: (string | number | boolean | null)[] = [];
              const variantRowClauses: string[] = [];
              let p = 1;

              for (const item of foodsNeedingVariantInsert) {
                const foodId = existingMap.get(item.provider_external_id);
                if (!foodId) continue;
                const v = item.default_variant;

                variantRowClauses.push(
                  `($${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, ` +
                    `$${p + 7}, $${p + 8}, $${p + 9}, $${p + 10}, ` +
                    `$${p + 11}, $${p + 12}, $${p + 13}, $${p + 14}, $${p + 15}, ` +
                    `$${p + 16}, $${p + 17}, $${p + 18}, $${p + 19}, $${p + 20}, $${p + 21}, TRUE, $${p + 22}::jsonb, 'imported', now(), now())`
                );

                variantValues.push(
                  foodId,
                  v.serving_size,
                  v.serving_unit,
                  v.calories,
                  v.protein,
                  v.carbs,
                  v.fat,
                  v.saturated_fat ?? null,
                  v.polyunsaturated_fat ?? null,
                  v.monounsaturated_fat ?? null,
                  v.cholesterol ?? null,
                  v.sodium ?? null,
                  v.potassium ?? null,
                  v.dietary_fiber ?? null,
                  v.sugars ?? null,
                  v.calcium ?? null,
                  v.iron ?? null,
                  v.vitamin_a ?? null,
                  v.vitamin_c ?? null,
                  v.caffeine_mg ?? null,
                  v.water_ml ?? null,
                  v.alcohol_g ?? null,
                  JSON.stringify(v.custom_nutrients || {})
                );
                p += 23;
              }

              if (variantRowClauses.length > 0) {
                await client.query(
                  `INSERT INTO food_variants (
                    food_id, serving_size, serving_unit,
                    calories, protein, carbs, fat, saturated_fat,
                    polyunsaturated_fat, monounsaturated_fat, cholesterol,
                    sodium, potassium, dietary_fiber, sugars, calcium, iron,
                    vitamin_a, vitamin_c, caffeine_mg, water_ml, alcohol_g,
                    is_default, custom_nutrients, source,
                    created_at, updated_at
                  ) VALUES ${variantRowClauses.join(', ')}`,
                  variantValues
                );
              }
            }

            // Optionally refresh past diary entries matching the default variant
            if (options.syncPastEntries && toUpdate.length > 0) {
              for (const item of toUpdate) {
                const foodId = existingMap.get(item.provider_external_id);
                if (!foodId) continue;
                const variantId = existingVariantMap.get(foodId);
                const v = item.default_variant;
                const servingSize = v.serving_size || 100;
                await client.query(
                  `UPDATE food_entries
                   SET calories = ROUND($2 * quantity / NULLIF($3, 0), 1),
                       protein = ROUND($4 * quantity / NULLIF($3, 0), 1),
                       carbs = ROUND($5 * quantity / NULLIF($3, 0), 1),
                       fat = ROUND($6 * quantity / NULLIF($3, 0), 1),
                       saturated_fat = ROUND($7 * quantity / NULLIF($3, 0), 1),
                       polyunsaturated_fat = ROUND($8 * quantity / NULLIF($3, 0), 1),
                       monounsaturated_fat = ROUND($9 * quantity / NULLIF($3, 0), 1),
                       cholesterol = ROUND($10 * quantity / NULLIF($3, 0), 1),
                       sodium = ROUND($11 * quantity / NULLIF($3, 0), 1),
                       potassium = ROUND($12 * quantity / NULLIF($3, 0), 1),
                       dietary_fiber = ROUND($13 * quantity / NULLIF($3, 0), 1),
                       sugars = ROUND($14 * quantity / NULLIF($3, 0), 1),
                       calcium = ROUND($15 * quantity / NULLIF($3, 0), 1),
                       iron = ROUND($16 * quantity / NULLIF($3, 0), 1),
                       vitamin_a = ROUND($17 * quantity / NULLIF($3, 0), 1),
                       vitamin_c = ROUND($18 * quantity / NULLIF($3, 0), 1),
                       caffeine_mg = ROUND($19 * quantity / NULLIF($3, 0), 1),
                       water_ml = ROUND($20 * quantity / NULLIF($3, 0), 1),
                       alcohol_g = ROUND($21 * quantity / NULLIF($3, 0), 1),
                       custom_nutrients = $23::jsonb
                   WHERE food_id = $1 AND user_id = $22 AND (variant_id IS NULL OR variant_id = $24::uuid)`,
                  [
                    foodId,
                    v.calories,
                    servingSize,
                    v.protein,
                    v.carbs,
                    v.fat,
                    v.saturated_fat ?? null,
                    v.polyunsaturated_fat ?? null,
                    v.monounsaturated_fat ?? null,
                    v.cholesterol ?? null,
                    v.sodium ?? null,
                    v.potassium ?? null,
                    v.dietary_fiber ?? null,
                    v.sugars ?? null,
                    v.calcium ?? null,
                    v.iron ?? null,
                    v.vitamin_a ?? null,
                    v.vitamin_c ?? null,
                    v.caffeine_mg ?? null,
                    v.water_ml ?? null,
                    v.alcohol_g ?? null,
                    userId,
                    JSON.stringify(v.custom_nutrients || {}),
                    variantId ?? null,
                  ]
                );
              }
            }

            await client.query('COMMIT');
            importedCount += toInsert.length;
            updatedCount += toUpdate.length;
          } catch (batchErr) {
            await client.query('ROLLBACK');
            const batchErrMsg =
              batchErr instanceof Error ? batchErr.message : String(batchErr);
            log(
              'error',
              `Error processing Livsmedelsverket batch starting at ${i}: ${batchErrMsg}`
            );
            failedCount += validFoods.length;
            if (!firstFailureError) {
              firstFailureError = batchErrMsg;
            }
          } finally {
            client.release();
          }
        }

        processedCount += batch.length;
        initialStatus.processed = processedCount;
        initialStatus.imported = importedCount;
        initialStatus.updated = updatedCount;
        initialStatus.progress =
          total > 0 ? Math.round((processedCount / total) * 100) : 100;
      }

      initialStatus.isRunning = false;
      initialStatus.progress = 100;
      if (failedCount > 0) {
        if (importedCount === 0 && updatedCount === 0) {
          initialStatus.status = 'failed';
          initialStatus.error = `Import failed: all items failed (${failedCount} errors). First error: ${firstFailureError}`;
        } else {
          initialStatus.status = 'completed';
          initialStatus.error = `${failedCount} food(s) failed during import. First error: ${firstFailureError}`;
        }
      } else {
        initialStatus.status = 'completed';
      }
      log(
        'info',
        `Livsmedelsverket import completed for user ${userId}: ${importedCount} imported, ${updatedCount} updated${failedCount > 0 ? `, ${failedCount} failed` : ''}`
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      initialStatus.isRunning = false;
      initialStatus.status = 'failed';
      initialStatus.error = errMsg;
      log(
        'error',
        `Livsmedelsverket bulk import failed for user ${userId}: ${errMsg}`
      );
    }
  })();
  void trackBackgroundWork(importRun);
}

export default {
  getLivsmedelsverketImportStatus,
  deleteLivsmedelsverketLibraryFoods,
  startLivsmedelsverketBulkImport,
};
