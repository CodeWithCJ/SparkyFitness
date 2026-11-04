import Papa from 'papaparse';
import { getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import type { PoolClient } from 'pg';
import { parseZipArchive } from '../utils/zipUtils.js';
import { beginBulkImport, readBulkImport } from './bulkImports.js';
import {
  cnfFetch,
  mapCanadianNutrientFood,
  type CnfNutrientItem,
  type CnfServingSizeItem,
  type CnfFoodDetail,
  type CnfFoodVariant,
} from '../integrations/cnf/cnfService.js';
import customNutrientService from './customNutrientService.js';
import {
  buildAliasIndex,
  applyCustomNutrientMatches,
} from '../utils/foodUtils.js';

export interface CnfSyncOptions {
  syncPastEntries?: boolean;
  language?: 'en' | 'fr';
  maxFoods?: number;
}

export interface CnfJobStatus {
  userId: string;
  isRunning: boolean;
  status: 'idle' | 'running' | 'completed' | 'failed';
  progress: number;
  total: number;
  processed: number;
  imported: number;
  updated: number;
  error?: string;
  lastRunAt?: string;
}

const KIND = 'canadian-nutrient-file';

function idleStatus(userId: string): CnfJobStatus {
  return {
    userId,
    isRunning: false,
    status: 'idle',
    progress: 0,
    total: 0,
    processed: 0,
    imported: 0,
    updated: 0,
  };
}

export async function getCnfImportStatus(
  userId: string
): Promise<CnfJobStatus> {
  return (
    (await readBulkImport<CnfJobStatus>(KIND, userId)) ?? idleStatus(userId)
  );
}

type UpdateStatus = (patch: Partial<CnfJobStatus>) => Promise<void>;

interface RawFoodNameRow {
  FoodID?: string | number;
  FoodCode?: string | number;
  Food_Code?: string | number;
  FoodDescription?: string;
  FoodDescriptionF?: string;
  Food_Description_EN?: string;
  Food_Description_FR?: string;
}

interface RawNutrientAmountRow {
  FoodID?: string | number;
  FoodCode?: string | number;
  Food_Code?: string | number;
  NutrientID?: string | number;
  NutrientCode?: string | number;
  Nutrient_Code?: string | number;
  NutrientValue?: string | number;
  Nutrient_Amount?: string | number;
}

interface RawNutrientNameRow {
  NutrientID?: string | number;
  NutrientCode?: string | number;
  Nutrient_Code?: string | number;
  NutrientName?: string;
  NutrientNameF?: string;
  Nutrient_Name_EN?: string;
  Nutrient_Name_FR?: string;
}

interface RawConversionFactorRow {
  FoodID?: string | number;
  Food_Code?: string | number;
  MeasureID?: string | number;
  MeasureCode?: string | number;
  Measure_Code?: string | number;
  ConversionFactorValue?: string | number;
  Measure_Weight_Conversion?: string | number;
}

interface RawMeasureNameRow {
  MeasureID?: string | number;
  MeasureCode?: string | number;
  Measure_Code?: string | number;
  MeasureDescription?: string;
  MeasureDescriptionF?: string;
  Measure_Description_and_Unit_EN?: string;
  Measure_Description_and_Unit_FR?: string;
}

function findZipEntry(
  entries: ReturnType<typeof parseZipArchive>,
  ...patterns: string[]
) {
  return entries.find((e) => {
    const norm = e.path.toLowerCase().replace(/[\s_-]+/g, '');
    return patterns.some((p) =>
      norm.includes(p.toLowerCase().replace(/[\s_-]+/g, ''))
    );
  });
}

function parseCsv<T>(buffer: Buffer): T[] {
  const text = buffer.toString('utf8');
  const result = Papa.parse<T>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  return result.data;
}

async function executeCnfImport(
  userId: string,
  zipBuffer: Buffer,
  options: CnfSyncOptions,
  updateJobStatus: UpdateStatus,
  client: PoolClient
): Promise<{ imported: number; updated: number; total: number }> {
  try {
    const entries = parseZipArchive(zipBuffer);

    const foodNameEntry = findZipEntry(entries, 'foodname', 'food_name');
    const nutrientAmountEntry = findZipEntry(
      entries,
      'nutrientamount',
      'nutrient_amount'
    );
    const nutrientNameEntry = findZipEntry(
      entries,
      'nutrientname',
      'nutrient_name'
    );
    const conversionFactorEntry = findZipEntry(
      entries,
      'conversionfactor',
      'measureweightconversion',
      'measure_weight_conversion'
    );
    const measureNameEntry = findZipEntry(
      entries,
      'measurename',
      'measure_name'
    );

    if (!foodNameEntry || !nutrientAmountEntry || !nutrientNameEntry) {
      throw new Error(
        'Invalid CNF ZIP archive: Required CSV files (FOOD NAME, NUTRIENT AMOUNT, NUTRIENT NAME) not found.'
      );
    }

    const foodNameRows = parseCsv<RawFoodNameRow>(foodNameEntry.getData());
    const nutrientAmountRows = parseCsv<RawNutrientAmountRow>(
      nutrientAmountEntry.getData()
    );
    const nutrientNameRows = parseCsv<RawNutrientNameRow>(
      nutrientNameEntry.getData()
    );
    const conversionRows = conversionFactorEntry
      ? parseCsv<RawConversionFactorRow>(conversionFactorEntry.getData())
      : [];
    const measureRows = measureNameEntry
      ? parseCsv<RawMeasureNameRow>(measureNameEntry.getData())
      : [];

    const isFrench = options.language === 'fr';

    // Index nutrient names
    const nutrientMetaById = new Map<number, { webName: string }>();
    for (const r of nutrientNameRows) {
      const nId = Number(r.Nutrient_Code ?? r.NutrientCode ?? r.NutrientID);
      if (Number.isFinite(nId)) {
        const name = isFrench
          ? r.Nutrient_Name_FR ||
            r.NutrientNameF ||
            r.NutrientName ||
            r.Nutrient_Name_EN
          : r.Nutrient_Name_EN ||
            r.NutrientName ||
            r.NutrientNameF ||
            r.Nutrient_Name_FR;
        nutrientMetaById.set(nId, { webName: name || `Nutrient ${nId}` });
      }
    }

    // Index measures
    const measureById = new Map<number, string>();
    for (const r of measureRows) {
      const mId = Number(r.Measure_Code ?? r.MeasureCode ?? r.MeasureID);
      if (Number.isFinite(mId)) {
        const desc = isFrench
          ? r.Measure_Description_and_Unit_FR ||
            r.MeasureDescriptionF ||
            r.MeasureDescription ||
            r.Measure_Description_and_Unit_EN
          : r.Measure_Description_and_Unit_EN ||
            r.MeasureDescription ||
            r.MeasureDescriptionF ||
            r.Measure_Description_and_Unit_FR;
        measureById.set(mId, desc || `Measure ${mId}`);
      }
    }

    // Group nutrients by FoodID / Food_Code
    const nutrientsByFoodId = new Map<number, CnfNutrientItem[]>();
    for (const r of nutrientAmountRows) {
      const fId = Number(r.FoodID ?? r.Food_Code ?? r.FoodCode);
      const nId = Number(r.Nutrient_Code ?? r.NutrientCode ?? r.NutrientID);
      const rawVal = r.Nutrient_Amount ?? r.NutrientValue;
      const val = typeof rawVal === 'number' ? rawVal : Number(rawVal);
      if (Number.isFinite(fId) && Number.isFinite(nId)) {
        let list = nutrientsByFoodId.get(fId);
        if (!list) {
          list = [];
          nutrientsByFoodId.set(fId, list);
        }
        const meta = nutrientMetaById.get(nId);
        list.push({
          food_code: fId,
          nutrient_name_id: nId,
          nutrient_value: Number.isFinite(val) ? val : 0,
          nutrient_web_name: meta?.webName || `Nutrient ${nId}`,
        });
      }
    }

    // Group conversions by FoodID / Food_Code
    const servingsByFoodId = new Map<number, CnfServingSizeItem[]>();
    for (const r of conversionRows) {
      const fId = Number(r.FoodID ?? r.Food_Code);
      const mId = Number(r.Measure_Code ?? r.MeasureCode ?? r.MeasureID);
      // In 2026 format, Measure_Weight_Conversion is grams (e.g. 40.152g for 100ml) -> factor = grams / 100.
      // In 2015 format, ConversionFactorValue is already divided (e.g. 0.40152).
      let factor: number;
      if (
        r.Measure_Weight_Conversion !== undefined &&
        r.Measure_Weight_Conversion !== null
      ) {
        const raw = Number(r.Measure_Weight_Conversion);
        factor = Number.isFinite(raw) ? raw / 100 : 0;
      } else {
        const raw = Number(r.ConversionFactorValue);
        factor = Number.isFinite(raw) ? raw : 0;
      }

      if (
        Number.isFinite(fId) &&
        Number.isFinite(mId) &&
        Number.isFinite(factor) &&
        factor > 0
      ) {
        let list = servingsByFoodId.get(fId);
        if (!list) {
          list = [];
          servingsByFoodId.set(fId, list);
        }
        const measureDesc = measureById.get(mId) || `Measure ${mId}`;
        list.push({
          food_code: fId,
          conversion_factor_value: factor,
          measure_name: measureDesc,
        });
      }
    }

    const activeFoodRows =
      typeof options.maxFoods === 'number' && options.maxFoods > 0
        ? foodNameRows.slice(0, options.maxFoods)
        : foodNameRows;
    const totalFoods = activeFoodRows.length;
    await updateJobStatus({ total: totalFoods });

    // Fetch user's custom nutrients to map
    const customDefs = await customNutrientService
      .getCustomNutrients(userId)
      .catch(() => []);
    const aliasIndex = buildAliasIndex(customDefs);

    let importedCount = 0;
    let updatedCount = 0;
    const batchSize = 100;

    interface PreparedFood {
      foodCode: number;
      externalId: string;
      foodDescription: string;
      mappedFood: CnfFoodDetail;
      allVariants: CnfFoodVariant[];
    }

    for (let i = 0; i < totalFoods; i += batchSize) {
      const batchRows = activeFoodRows.slice(i, i + batchSize);
      const preparedFoods: PreparedFood[] = [];

      for (const row of batchRows) {
        const fId = Number(row.FoodID ?? row.Food_Code ?? row.FoodCode);
        const foodCode = Number(row.Food_Code ?? row.FoodCode ?? row.FoodID);
        if (!Number.isFinite(fId) || !Number.isFinite(foodCode)) continue;

        const desc = isFrench
          ? row.Food_Description_FR ||
            row.FoodDescriptionF ||
            row.FoodDescription ||
            row.Food_Description_EN
          : row.Food_Description_EN ||
            row.FoodDescription ||
            row.FoodDescriptionF ||
            row.Food_Description_FR;
        const foodDescription = (desc || `Canadian Food #${foodCode}`).trim();

        const nutrientItems = nutrientsByFoodId.get(fId) || [];
        const servingItems = servingsByFoodId.get(fId) || [];

        for (const item of nutrientItems) item.food_code = foodCode;
        for (const item of servingItems) item.food_code = foodCode;

        const mappedFood = mapCanadianNutrientFood(
          foodCode,
          foodDescription,
          nutrientItems,
          servingItems
        );

        // Enrich variants with custom nutrients
        if (aliasIndex.size > 0) {
          applyCustomNutrientMatches([mappedFood], aliasIndex);
        }

        const allVariants = [
          mappedFood.default_variant,
          ...(mappedFood.variants || []).filter((v) => !v.is_default),
        ];

        preparedFoods.push({
          foodCode,
          externalId: String(foodCode),
          foodDescription,
          mappedFood,
          allVariants,
        });
      }

      if (preparedFoods.length === 0) continue;

      try {
        await client.query('BEGIN');

        // Batch lookup existing foods for this batch (scoped strictly to this user)
        const externalIds = preparedFoods.map((f) => f.externalId);
        const existing = (await client.query(
          "SELECT id, provider_external_id FROM foods WHERE provider_type = 'canadian-nutrient-file' AND provider_external_id = ANY($1) AND user_id = $2",
          [externalIds, userId]
        )) as { rows: Array<{ id: string; provider_external_id: string }> };

        const existingMap = new Map<string, string>();
        for (const row of existing.rows) {
          existingMap.set(row.provider_external_id, row.id);
        }

        const toInsert = preparedFoods.filter(
          (f) => !existingMap.has(f.externalId)
        );
        const toUpdate = preparedFoods.filter((f) =>
          existingMap.has(f.externalId)
        );

        // Multi-row INSERT for new foods
        if (toInsert.length > 0) {
          const insertValues: (string | boolean | null)[] = [userId];
          const valueClauses: string[] = [];
          let paramIdx = 2;

          for (const item of toInsert) {
            valueClauses.push(
              `($${paramIdx}, FALSE, $1, 'Canadian Nutrient File', $${paramIdx + 1}, TRUE, 'canadian-nutrient-file', TRUE, FALSE, '[]'::jsonb, NULL, now(), now())`
            );
            insertValues.push(item.foodDescription, item.externalId);
            paramIdx += 2;
          }

          const inserted = (await client.query(
            `INSERT INTO foods (
              name, is_custom, user_id, brand, provider_external_id, shared_with_public,
              provider_type, provider_verified, is_quick_food, images, notes, created_at, updated_at
            ) VALUES ${valueClauses.join(', ')}
            RETURNING id, provider_external_id`,
            insertValues
          )) as { rows: Array<{ id: string; provider_external_id: string }> };

          for (const row of inserted.rows) {
            existingMap.set(row.provider_external_id, row.id);
          }
          importedCount += toInsert.length;
        }

        // Batch UPDATE for existing foods (scoped strictly to this user's records)
        if (toUpdate.length > 0) {
          const updateValues: (string | null)[] = [userId];
          const updateClauses: string[] = [];
          let updateParamIdx = 2;

          for (const item of toUpdate) {
            const foodId = existingMap.get(item.externalId)!;
            updateClauses.push(
              `($${updateParamIdx}::text, $${updateParamIdx + 1}::uuid)`
            );
            updateValues.push(item.foodDescription, foodId);
            updateParamIdx += 2;
          }

          await client.query(
            `UPDATE foods AS f
             SET name = v.name,
                 brand = 'Canadian Nutrient File',
                 updated_at = now()
             FROM (VALUES ${updateClauses.join(', ')}) AS v(name, id)
             WHERE f.id = v.id AND f.user_id = $1`,
            updateValues
          );

          const updatedFoodIds = toUpdate.map((item) =>
            existingMap.get(item.externalId)!
          );
          await client.query(
            'DELETE FROM food_variants WHERE food_id = ANY($1)',
            [updatedFoodIds]
          );
          updatedCount += toUpdate.length;
        }

        // Batch multi-row INSERT for all variants across the batch
        interface FlatVariant {
          foodId: string;
          variant: CnfFoodVariant;
        }

        const allBatchVariants: FlatVariant[] = [];
        for (const item of preparedFoods) {
          const foodId = existingMap.get(item.externalId);
          if (!foodId) continue;
          for (const variant of item.allVariants) {
            allBatchVariants.push({ foodId, variant });
          }
        }

        const VARIANT_CHUNK_SIZE = 50;
        for (
          let vIdx = 0;
          vIdx < allBatchVariants.length;
          vIdx += VARIANT_CHUNK_SIZE
        ) {
          const chunk = allBatchVariants.slice(vIdx, vIdx + VARIANT_CHUNK_SIZE);
          const variantValues: (string | number | boolean | null)[] = [];
          const variantRowClauses: string[] = [];
          let p = 1;

          for (const { foodId, variant } of chunk) {
            variantRowClauses.push(
              `($${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, ` +
                `$${p + 7}, $${p + 8}, $${p + 9}, $${p + 10}, ` +
                `$${p + 11}, $${p + 12}, $${p + 13}, $${p + 14}, $${p + 15}, ` +
                `$${p + 16}, $${p + 17}, $${p + 18}, $${p + 19}, $${p + 20}, $${p + 21}, $${p + 22}, ` +
                `$${p + 23}, $${p + 24}::jsonb, 'imported', now(), now())`
            );
            variantValues.push(
              foodId,
              variant.serving_size,
              variant.serving_unit,
              variant.calories,
              variant.protein,
              variant.carbs,
              variant.fat,
              variant.saturated_fat ?? null,
              variant.polyunsaturated_fat ?? null,
              variant.monounsaturated_fat ?? null,
              variant.trans_fat ?? null,
              variant.cholesterol ?? null,
              variant.sodium ?? null,
              variant.potassium ?? null,
              variant.dietary_fiber ?? null,
              variant.sugars ?? null,
              variant.vitamin_a ?? null,
              variant.vitamin_c ?? null,
              variant.calcium ?? null,
              variant.iron ?? null,
              variant.caffeine_mg ?? null,
              variant.water_ml ?? null,
              variant.alcohol_g ?? null,
              variant.is_default,
              JSON.stringify(variant.custom_nutrients || {})
            );
            p += 25;
          }

          await client.query(
            `INSERT INTO food_variants (
              food_id, serving_size, serving_unit, calories, protein, carbs, fat,
              saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
              cholesterol, sodium, potassium, dietary_fiber, sugars,
              vitamin_a, vitamin_c, calcium, iron, caffeine_mg, water_ml, alcohol_g,
              is_default, custom_nutrients, source, created_at, updated_at
            ) VALUES ${variantRowClauses.join(', ')}`,
            variantValues
          );
        }

        // Recalculate linked meal_foods and food_entries for updated foods
        if (toUpdate.length > 0) {
          const mealValues: (string | number | null)[] = [];
          const mealClauses: string[] = [];
          let mP = 1;
          for (const item of toUpdate) {
            const foodId = existingMap.get(item.externalId)!;
            const defVariant = item.mappedFood.default_variant;
            mealClauses.push(
              `($${mP}::numeric, $${mP + 1}::numeric, $${mP + 2}::numeric, $${mP + 3}::numeric, $${mP + 4}::numeric, $${mP + 5}::jsonb, $${mP + 6}::uuid)`
            );
            mealValues.push(
              defVariant.calories,
              defVariant.serving_size || 100,
              defVariant.protein,
              defVariant.carbs,
              defVariant.fat,
              JSON.stringify(defVariant.custom_nutrients || {}),
              foodId
            );
            mP += 7;
          }

          await client.query(
            `UPDATE meal_foods AS mf
             SET calories = ROUND(v.calories * mf.quantity / NULLIF(v.serving_size, 0), 1),
                 protein = ROUND(v.protein * mf.quantity / NULLIF(v.serving_size, 0), 1),
                 carbs = ROUND(v.carbs * mf.quantity / NULLIF(v.serving_size, 0), 1),
                 fat = ROUND(v.fat * mf.quantity / NULLIF(v.serving_size, 0), 1),
                 custom_nutrients = v.custom_nutrients,
                 updated_at = now()
             FROM (VALUES ${mealClauses.join(', ')}) AS v(calories, serving_size, protein, carbs, fat, custom_nutrients, food_id)
             WHERE mf.food_id = v.food_id`,
            mealValues
          );

          if (options.syncPastEntries) {
            const entryValues: (string | number | null)[] = [userId];
            const entryClauses: string[] = [];
            let eP = 2;
            for (const item of toUpdate) {
              const foodId = existingMap.get(item.externalId)!;
              const defVariant = item.mappedFood.default_variant;
              entryClauses.push(
                `($${eP}::numeric, $${eP + 1}::numeric, $${eP + 2}::numeric, $${eP + 3}::numeric, $${eP + 4}::numeric, ` +
                  `$${eP + 5}::numeric, $${eP + 6}::numeric, $${eP + 7}::numeric, $${eP + 8}::numeric, $${eP + 9}::numeric, ` +
                  `$${eP + 10}::numeric, $${eP + 11}::numeric, $${eP + 12}::numeric, $${eP + 13}::numeric, $${eP + 14}::numeric, ` +
                  `$${eP + 15}::numeric, $${eP + 16}::numeric, $${eP + 17}::numeric, $${eP + 18}::numeric, $${eP + 19}::numeric, ` +
                  `$${eP + 20}::numeric, $${eP + 21}::jsonb, $${eP + 22}::uuid)`
              );
              entryValues.push(
                defVariant.calories,
                defVariant.serving_size || 100,
                defVariant.protein,
                defVariant.carbs,
                defVariant.fat,
                defVariant.saturated_fat ?? null,
                defVariant.polyunsaturated_fat ?? null,
                defVariant.monounsaturated_fat ?? null,
                defVariant.trans_fat ?? null,
                defVariant.cholesterol ?? null,
                defVariant.sodium ?? null,
                defVariant.potassium ?? null,
                defVariant.dietary_fiber ?? null,
                defVariant.sugars ?? null,
                defVariant.vitamin_a ?? null,
                defVariant.vitamin_c ?? null,
                defVariant.calcium ?? null,
                defVariant.iron ?? null,
                defVariant.caffeine_mg ?? null,
                defVariant.water_ml ?? null,
                defVariant.alcohol_g ?? null,
                JSON.stringify(defVariant.custom_nutrients || {}),
                foodId
              );
              eP += 23;
            }

            await client.query(
              `UPDATE food_entries AS fe
               SET calories = ROUND(v.calories * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   protein = ROUND(v.protein * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   carbs = ROUND(v.carbs * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   fat = ROUND(v.fat * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   saturated_fat = ROUND(v.saturated_fat * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   polyunsaturated_fat = ROUND(v.polyunsaturated_fat * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   monounsaturated_fat = ROUND(v.monounsaturated_fat * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   trans_fat = ROUND(v.trans_fat * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   cholesterol = ROUND(v.cholesterol * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   sodium = ROUND(v.sodium * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   potassium = ROUND(v.potassium * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   dietary_fiber = ROUND(v.dietary_fiber * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   sugars = ROUND(v.sugars * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   vitamin_a = ROUND(v.vitamin_a * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   vitamin_c = ROUND(v.vitamin_c * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   calcium = ROUND(v.calcium * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   iron = ROUND(v.iron * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   caffeine_mg = ROUND(v.caffeine_mg * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   water_ml = ROUND(v.water_ml * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   alcohol_g = ROUND(v.alcohol_g * fe.quantity / NULLIF(v.serving_size, 0), 1),
                   custom_nutrients = v.custom_nutrients
               FROM (VALUES ${entryClauses.join(', ')}) AS v(
                 calories, serving_size, protein, carbs, fat,
                 saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
                 cholesterol, sodium, potassium, dietary_fiber, sugars,
                 vitamin_a, vitamin_c, calcium, iron, caffeine_mg, water_ml, alcohol_g,
                 custom_nutrients, food_id
               )
               WHERE fe.food_id = v.food_id AND fe.user_id = $1`,
              entryValues
            );
          }
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }

      const processed = Math.min(i + batchSize, totalFoods);
      const progress = Math.round((processed / totalFoods) * 100);
      await updateJobStatus({
        progress,
        processed,
        imported: importedCount,
        updated: updatedCount,
      });

      if (processed % 500 === 0 || processed === totalFoods) {
        log(
          'info',
          `[CNF Bulk Import] Progress: ${processed} / ${totalFoods} foods (${progress}%) - ${importedCount} imported, ${updatedCount} updated`
        );
      }
    }

    await updateJobStatus({
      isRunning: false,
      status: 'completed',
      progress: 100,
      processed: totalFoods,
      imported: importedCount,
      updated: updatedCount,
    });

    return {
      imported: importedCount,
      updated: updatedCount,
      total: totalFoods,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log('error', `CNF bulk import failed for user ${userId}: ${msg}`);
    throw error;
  }
}

async function downloadCnfArchive(
  userId: string,
  archiveUrl: string
): Promise<Buffer> {
  log('info', `Downloading CNF archive from ${archiveUrl} for user ${userId}`);
  const res = await cnfFetch(archiveUrl, {
    headers: {
      'User-Agent': 'SparkyFitness/1.0',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to download CNF archive: HTTP ${res.status}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Starts a Canadian Nutrient File import from an uploaded ZIP archive or a
 * URL to download one. Returns null while the user's import runs on any
 * instance; otherwise once the import is marked running, with its outcome.
 */
export async function startCnfImport(
  userId: string,
  source: { zip: Buffer } | { url: string },
  options: CnfSyncOptions = {}
): Promise<{
  done: Promise<{ imported: number; updated: number; total: number }>;
} | null> {
  const status: CnfJobStatus = {
    ...idleStatus(userId),
    isRunning: true,
    status: 'running',
    lastRunAt: new Date().toISOString(),
  };
  const job = await beginBulkImport(KIND, userId, status);
  if (!job) return null;

  const done = (async () => {
    try {
      const zip =
        'zip' in source
          ? source.zip
          : await downloadCnfArchive(userId, source.url);
      return await executeCnfImport(
        userId,
        zip,
        options,
        (patch) => job.save(Object.assign(status, patch)),
        job.client
      );
    } catch (error) {
      Object.assign(status, {
        isRunning: false,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await job
        .finish(status)
        .catch((error) =>
          log('error', 'Could not save the CNF import status:', error)
        );
    }
  })();
  return { done };
}

/**
 * Deletes all Canadian Nutrient File library items for a given user.
 * Preserves past diary history (food_entries.food_id is ON DELETE SET NULL).
 */
export async function deleteCnfLibraryFoods(
  userId?: string
): Promise<{ deletedCount: number }> {
  if (!userId) {
    return { deletedCount: 0 };
  }
  const client = await getSystemClient();
  try {
    const res = await client.query(
      "DELETE FROM foods WHERE provider_type = 'canadian-nutrient-file' AND user_id = $1",
      [userId]
    );
    return { deletedCount: res.rowCount ?? 0 };
  } finally {
    client.release();
  }
}

export default {
  getCnfImportStatus,
  startCnfImport,
  deleteCnfLibraryFoods,
};
