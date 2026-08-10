import { getClient, getSystemClient } from '../db/poolManager.js';
import type { FoodEntrySnapshot } from '../types/nutrition.js';

const DEFAULT_VARIANT_JSON_SQL = `
  json_build_object(
    'id', fv.id,
    'serving_size', fv.serving_size,
    'serving_unit', fv.serving_unit,
    'calories', fv.calories,
    'protein', fv.protein,
    'carbs', fv.carbs,
    'fat', fv.fat,
    'saturated_fat', fv.saturated_fat,
    'polyunsaturated_fat', fv.polyunsaturated_fat,
    'monounsaturated_fat', fv.monounsaturated_fat,
    'trans_fat', fv.trans_fat,
    'cholesterol', fv.cholesterol,
    'sodium', fv.sodium,
    'potassium', fv.potassium,
    'dietary_fiber', fv.dietary_fiber,
    'sugars', fv.sugars,
    'vitamin_a', fv.vitamin_a,
    'vitamin_c', fv.vitamin_c,
    'calcium', fv.calcium,
    'iron', fv.iron,
    'is_default', fv.is_default,
    'glycemic_index', fv.glycemic_index,
    'custom_nutrients', fv.custom_nutrients,
    'user_id', f.user_id,
    'source', fv.source,
    'ai_confidence', fv.ai_confidence
  ) AS default_variant
`;

const PREFERRED_DEFAULT_VARIANT_JOIN_SQL = `
  LEFT JOIN LATERAL (
    SELECT candidate_fv.*
    FROM food_variants candidate_fv
    WHERE candidate_fv.food_id = f.id
      AND candidate_fv.is_default = TRUE
    ORDER BY
      candidate_fv.updated_at DESC,
      candidate_fv.id
    LIMIT 1
  ) fv ON TRUE
`;
async function getFoodDataProviderById(providerId: string) {
  const client = await getSystemClient(); // System-level operation
  try {
    const result = await client.query(
      'SELECT * FROM external_data_providers WHERE id = $1',
      [providerId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
async function getRecentFoods(
  userId: string,
  limit: number,
  mealType?: string | null
) {
  const client = await getClient(userId); // User-specific operation
  const queryParams: (string | number)[] = [userId];
  let mealTypeCondition = '';
  if (mealType) {
    queryParams.push(mealType);
    mealTypeCondition = `AND (LOWER(mt.name) = LOWER($${queryParams.length}) OR fe.meal_type_id::text = $${queryParams.length})`;
  }
  queryParams.push(limit);
  try {
    const result = await client.query(
      `WITH RecentFoodEntries AS (
        SELECT
          fe.food_id,
          MAX(fe.entry_date) AS last_used_date
        FROM food_entries fe
        LEFT JOIN meal_types mt ON fe.meal_type_id = mt.id 
        WHERE fe.user_id = $1 ${mealTypeCondition}
        GROUP BY fe.food_id
        ORDER BY last_used_date DESC
        LIMIT $${queryParams.length}
      )
      SELECT
        f.id,
        f.name,
        f.brand,
        f.barcode,
        f.is_custom,
        f.user_id,
        f.shared_with_public,
        f.provider_external_id,
        f.provider_type,
        f.provider_verified,
        f.images,
        rfe.last_used_date,
        ${DEFAULT_VARIANT_JSON_SQL}
      FROM foods f
      JOIN RecentFoodEntries rfe ON f.id = rfe.food_id
      ${PREFERRED_DEFAULT_VARIANT_JOIN_SQL}
      WHERE f.is_quick_food = FALSE
      ORDER BY rfe.last_used_date DESC`,
      queryParams
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function getTopFoods(
  userId: string,
  limit: number,
  mealType?: string | null
) {
  const client = await getClient(userId); // User-specific operation
  const queryParams: (string | number)[] = [userId];
  let mealTypeCondition = '';
  if (mealType) {
    queryParams.push(mealType);
    mealTypeCondition = `AND (LOWER(mt.name) = LOWER($${queryParams.length}) OR fe.meal_type_id::text = $${queryParams.length})`;
  }
  queryParams.push(limit);
  try {
    const result = await client.query(
      `WITH TopFoodEntries AS (
        SELECT
          fe.food_id,
          COUNT(fe.food_id) AS usage_count
        FROM food_entries fe
        LEFT JOIN meal_types mt ON fe.meal_type_id = mt.id
        WHERE fe.user_id = $1 ${mealTypeCondition}
        GROUP BY fe.food_id
        ORDER BY usage_count DESC
        LIMIT $${queryParams.length}
      )
      SELECT
        f.id,
        f.name,
        f.brand,
        f.barcode,
        f.is_custom,
        f.user_id,
        f.shared_with_public,
        f.provider_external_id,
        f.provider_type,
        f.provider_verified,
        f.images,
        tfe.usage_count,
        ${DEFAULT_VARIANT_JSON_SQL}
      FROM foods f
      JOIN TopFoodEntries tfe ON f.id = tfe.food_id
      ${PREFERRED_DEFAULT_VARIANT_JOIN_SQL}
      WHERE f.is_quick_food = FALSE
      ORDER BY tfe.usage_count DESC`,
      queryParams
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function getFavoriteFoods(userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
        f.id,
        f.name,
        f.brand,
        f.barcode,
        f.is_custom,
        f.user_id,
        f.shared_with_public,
        f.provider_external_id,
        f.provider_type,
        f.provider_verified,
        f.images,
        ff.created_at AS favorited_at,
        ${DEFAULT_VARIANT_JSON_SQL}
      FROM food_favorites ff
      JOIN foods f ON f.id = ff.food_id
      ${PREFERRED_DEFAULT_VARIANT_JOIN_SQL}
      WHERE ff.user_id = $1
        AND ff.food_id IS NOT NULL
        AND f.is_quick_food = FALSE
      ORDER BY ff.created_at DESC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function addFoodFavorite(userId: string, foodId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query(
      `INSERT INTO food_favorites (user_id, food_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, food_id) DO NOTHING`,
      [userId, foodId]
    );
  } finally {
    client.release();
  }
}
async function removeFoodFavorite(userId: string, foodId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `DELETE FROM food_favorites
       WHERE user_id = $1 AND food_id = $2`,
      [userId, foodId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}
// A logged supplement contributes its per-dose snapshot, scaled by the dose count taken
// (GREATEST-clamped so a non-positive value can't subtract). These fragments let the diary
// daily-summary aggregations count supplements exactly the way the report already does, so
// they show against goals. userExpr/dateExpr are the SQL expressions to correlate on: bind
// params ($1/$2) for the single-date query, or the grouped columns (fe.user_id/fe.entry_date)
// for the per-date query.
function supplementFixed(
  key: string,
  userExpr: string,
  dateExpr: string
): string {
  return `COALESCE((SELECT SUM(public.sf_try_numeric(me.nutrients_snapshot->>'${key}') * GREATEST(COALESCE(me.dose_amount_snapshot, 1), 0)) FROM medication_entries me WHERE me.user_id = ${userExpr} AND me.entry_date = ${dateExpr} AND me.status IN ('taken', 'prn_taken') AND me.nutrients_snapshot IS NOT NULL), 0)`;
}
function supplementCustomUnion(userExpr: string, dateExpr: string): string {
  return `
                UNION ALL
                SELECT key, public.sf_try_numeric(value) * GREATEST(COALESCE(me2.dose_amount_snapshot, 1), 0) AS scaled
                FROM medication_entries me2
                CROSS JOIN LATERAL jsonb_each_text(me2.nutrients_snapshot->'custom_nutrients')
                WHERE me2.user_id = ${userExpr} AND me2.entry_date = ${dateExpr} AND me2.status IN ('taken', 'prn_taken') AND me2.nutrients_snapshot IS NOT NULL`;
}

/**
 * The supplement arm of a day's intake, on its own.
 *
 * `getDailyNutritionSummary` already folds these into its food totals, but the Diary
 * computes eaten calories and its macro totals separately (in JS, from food entries), so
 * it needs the supplement contribution as a distinct number: once to add into the totals,
 * and once to show as its own line, so what is displayed still reconciles against the
 * food rows the user can see.
 *
 * Fields are exactly the set `supplementFixed` is applied to elsewhere. Returns zeros
 * rather than nulls on a day with no supplements, so callers can add unconditionally.
 */
async function getDailySupplementTotals(userId: string, date: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
        ${supplementFixed('calories', '$1', '$2')} AS calories,
        ${supplementFixed('protein', '$1', '$2')} AS protein,
        ${supplementFixed('carbs', '$1', '$2')} AS carbs,
        ${supplementFixed('fat', '$1', '$2')} AS fat,
        ${supplementFixed('dietary_fiber', '$1', '$2')} AS dietary_fiber`,
      [userId, date]
    );
    const row = result.rows[0] ?? {};
    return {
      calories: Number(row.calories) || 0,
      protein: Number(row.protein) || 0,
      carbs: Number(row.carbs) || 0,
      fat: Number(row.fat) || 0,
      dietary_fiber: Number(row.dietary_fiber) || 0,
    };
  } finally {
    client.release();
  }
}

async function getDailyNutritionSummary(userId: string, date: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
        COALESCE(SUM(fe.calories * fe.quantity / NULLIF(fe.serving_size, 0)), 0) + ${supplementFixed('calories', '$1', '$2')} AS total_calories,
        COALESCE(SUM(fe.protein * fe.quantity / NULLIF(fe.serving_size, 0)), 0) + ${supplementFixed('protein', '$1', '$2')} AS total_protein,
        COALESCE(SUM(fe.carbs * fe.quantity / NULLIF(fe.serving_size, 0)), 0) + ${supplementFixed('carbs', '$1', '$2')} AS total_carbs,
        COALESCE(SUM(fe.fat * fe.quantity / NULLIF(fe.serving_size, 0)), 0) + ${supplementFixed('fat', '$1', '$2')} AS total_fat,
        COALESCE(SUM(fe.dietary_fiber * fe.quantity / NULLIF(fe.serving_size, 0)), 0) + ${supplementFixed('dietary_fiber', '$1', '$2')} AS total_dietary_fiber,
        COALESCE(
          (
            SELECT jsonb_object_agg(key, value)
            FROM (
              SELECT key, SUM(scaled) as value
              FROM (
                SELECT key, (NULLIF(TRIM(value), '')::numeric) * fe2.quantity / NULLIF(fe2.serving_size, 0) AS scaled
                FROM food_entries fe2
                CROSS JOIN LATERAL jsonb_each_text(fe2.custom_nutrients)
                WHERE fe2.user_id = $1 AND fe2.entry_date = $2${supplementCustomUnion('$1', '$2')}
              ) combined
              GROUP BY key
            ) custom_agg
          ),
          '{}'::jsonb
        ) AS total_custom_nutrients
       FROM food_entries fe
       WHERE fe.user_id = $1 AND fe.entry_date = $2`,
      [userId, date]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// The driving date set is the UNION of days with food and days with taken supplement
// entries, so a day on which the user logged only supplements still returns a row. The
// food aggregates LEFT JOIN onto that set and COALESCE to zero, which is the honest
// answer for a day with no food logged.
async function getDailyNutritionSummariesByDates(
  userId: string,
  dates: string[]
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
        d.entry_date,
        COALESCE(SUM(fe.calories * fe.quantity / NULLIF(fe.serving_size, 0)), 0) + ${supplementFixed('calories', 'd.user_id', 'd.entry_date')} AS total_calories,
        COALESCE(SUM(fe.protein * fe.quantity / NULLIF(fe.serving_size, 0)), 0) + ${supplementFixed('protein', 'd.user_id', 'd.entry_date')} AS total_protein,
        COALESCE(SUM(fe.carbs * fe.quantity / NULLIF(fe.serving_size, 0)), 0) + ${supplementFixed('carbs', 'd.user_id', 'd.entry_date')} AS total_carbs,
        COALESCE(SUM(fe.fat * fe.quantity / NULLIF(fe.serving_size, 0)), 0) + ${supplementFixed('fat', 'd.user_id', 'd.entry_date')} AS total_fat,
        COALESCE(SUM(fe.dietary_fiber * fe.quantity / NULLIF(fe.serving_size, 0)), 0) + ${supplementFixed('dietary_fiber', 'd.user_id', 'd.entry_date')} AS total_dietary_fiber,
        COALESCE(
          (
            SELECT jsonb_object_agg(key, value)
            FROM (
              SELECT key, SUM(scaled) as value
              FROM (
                SELECT key, (NULLIF(TRIM(value), '')::numeric) * fe2.quantity / NULLIF(fe2.serving_size, 0) AS scaled
                FROM food_entries fe2
                CROSS JOIN LATERAL jsonb_each_text(fe2.custom_nutrients)
                WHERE fe2.user_id = d.user_id AND fe2.entry_date = d.entry_date${supplementCustomUnion('d.user_id', 'd.entry_date')}
              ) combined
              GROUP BY key
            ) custom_agg
          ),
          '{}'::jsonb
        ) AS total_custom_nutrients
       FROM (
         SELECT DISTINCT user_id, entry_date
           FROM food_entries
          WHERE user_id = $1 AND entry_date = ANY($2::date[])
         UNION
         SELECT DISTINCT user_id, entry_date
           FROM medication_entries
          WHERE user_id = $1 AND entry_date = ANY($2::date[])
            AND status IN ('taken', 'prn_taken')
            AND nutrients_snapshot IS NOT NULL
       ) d
       LEFT JOIN food_entries fe
              ON fe.user_id = d.user_id AND fe.entry_date = d.entry_date
       GROUP BY d.user_id, d.entry_date`,
      [userId, dates]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getFoodsNeedingReview(userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT DISTINCT ON (fe.food_id, fe.variant_id)
          fe.food_id,
          fe.variant_id,
          fe.food_name,
          fe.brand_name,
          fe.updated_at AS entry_updated_at,
          fe.created_at AS entry_created_at,
          fe.user_id AS food_owner_id
       FROM food_entries fe
       WHERE fe.user_id = $1
         AND fe.updated_at > fe.created_at -- Food entry has been updated since it was created
         AND NOT EXISTS (
             SELECT 1 FROM user_ignored_updates uiu
             WHERE uiu.user_id = $1
               AND uiu.variant_id = fe.variant_id
               AND uiu.ignored_at_timestamp = fe.updated_at
         )
       ORDER BY fe.food_id, fe.variant_id, fe.created_at DESC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function updateFoodEntriesSnapshot(
  userId: string,
  foodId: string,
  variantId: string,
  newSnapshotData: FoodEntrySnapshot
) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE food_entries
       SET
          food_name = $1,
          brand_name = $2,
          serving_size = $3,
          serving_unit = $4,
          calories = $5,
          protein = $6,
          carbs = $7,
          fat = $8,
          saturated_fat = $9,
          polyunsaturated_fat = $10,
          monounsaturated_fat = $11,
          trans_fat = $12,
          cholesterol = $13,
          sodium = $14,
          potassium = $15,
          dietary_fiber = $16,
          sugars = $17,
          vitamin_a = $18,
          vitamin_c = $19,
          calcium = $20,
          iron = $21,
          glycemic_index = $22,
          custom_nutrients = $23
       WHERE user_id = $24 AND food_id = $25 AND variant_id = $26
       RETURNING id`,
      [
        newSnapshotData.food_name,
        newSnapshotData.brand_name,
        newSnapshotData.serving_size,
        newSnapshotData.serving_unit,
        newSnapshotData.calories,
        newSnapshotData.protein,
        newSnapshotData.carbs,
        newSnapshotData.fat,
        newSnapshotData.saturated_fat,
        newSnapshotData.polyunsaturated_fat,
        newSnapshotData.monounsaturated_fat,
        newSnapshotData.trans_fat,
        newSnapshotData.cholesterol,
        newSnapshotData.sodium,
        newSnapshotData.potassium,
        newSnapshotData.dietary_fiber,
        newSnapshotData.sugars,
        newSnapshotData.vitamin_a,
        newSnapshotData.vitamin_c,
        newSnapshotData.calcium,
        newSnapshotData.iron,
        newSnapshotData.glycemic_index,
        newSnapshotData.custom_nutrients || {},
        userId,
        foodId,
        variantId,
      ]
    );
    return result.rowCount;
  } finally {
    client.release();
  }
}
async function clearUserIgnoredUpdate(userId: string, variantId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query(
      `DELETE FROM user_ignored_updates
       WHERE user_id = $1 AND variant_id = $2`,
      [userId, variantId]
    );
  } finally {
    client.release();
  }
}
export { getFoodDataProviderById };
export { getRecentFoods };
export { getTopFoods };
export { getFavoriteFoods, addFoodFavorite, removeFoodFavorite };
export { getDailyNutritionSummary, getDailyNutritionSummariesByDates };
export { getDailySupplementTotals };
export { getFoodsNeedingReview };
export { updateFoodEntriesSnapshot };
export { clearUserIgnoredUpdate };
export default {
  getFoodDataProviderById,
  getRecentFoods,
  getTopFoods,
  getFavoriteFoods,
  addFoodFavorite,
  removeFoodFavorite,
  getDailyNutritionSummary,
  getDailySupplementTotals,
  getDailyNutritionSummariesByDates,
  getFoodsNeedingReview,
  updateFoodEntriesSnapshot,
  clearUserIgnoredUpdate,
};
