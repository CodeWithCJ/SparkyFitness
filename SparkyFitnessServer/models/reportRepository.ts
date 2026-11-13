import { FOOD_VARIANT_NUTRIENT_FIELDS } from '@workspace/shared';
import type { FoodVariantNutrientField } from '@workspace/shared';
import { getClient } from '../db/poolManager.js';
import {
  doseScale,
  supplementCountable,
  supplementFixedSubquery,
} from './supplementSql.js';
async function getNutritionData(
  userId: string,
  startDate: string,
  endDate: string,
  customNutrients: Array<{ name: string }> = []
) {
  const client = await getClient(userId); // User-specific operation
  try {
    const params: (string | number)[] = [userId, startDate, endDate];
    const customNutrientParamIndexes: number[] = [];
    customNutrients.forEach((cn) => {
      params.push(cn.name);
      customNutrientParamIndexes.push(params.length);
    });

    const standardNutrientsSelectOuter = FOOD_VARIANT_NUTRIENT_FIELDS.map(
      (nutrient) =>
        `SUM(${nutrient}) AS ${nutrient},\n         COALESCE(SUM(${nutrient}) FILTER (WHERE nutrient_source = 'food'), 0) AS food_${nutrient},\n         COALESCE(SUM(${nutrient}) FILTER (WHERE nutrient_source = 'supplement'), 0) AS supplement_${nutrient}`
    ).join(',\n         ');
    // Generate dynamic SQL parts for custom nutrients
    const customNutrientsSelectOuter = customNutrients
      .map((cn) => {
        const ident = cn.name.replace(/"/g, '""');
        return `SUM("${ident}") AS "${ident}",\n         COALESCE(SUM("${ident}") FILTER (WHERE nutrient_source = 'food'), 0) AS "food_${ident}",\n         COALESCE(SUM("${ident}") FILTER (WHERE nutrient_source = 'supplement'), 0) AS "supplement_${ident}"`;
      })
      .join(',\n         ');
    const standardNutrientsSelectInner1 = FOOD_VARIANT_NUTRIENT_FIELDS.map(
      (nutrient) =>
        `(COALESCE(fe.${nutrient}, 0) * fe.quantity / fe.serving_size) AS ${nutrient}`
    ).join(',\n           ');
    const customNutrientsSelectInner1 = customNutrients
      .map((cn, idx) => {
        const ident = cn.name.replace(/"/g, '""');
        const paramIdx = customNutrientParamIndexes[idx];
        return `(COALESCE(NULLIF(fe.custom_nutrients->>$${paramIdx}, '')::numeric, 0) * fe.quantity / fe.serving_size) AS "${ident}"`;
      })
      .join(',\n           ');
    // Note: fe_meal.quantity is already scaled, so do NOT multiply by fem.quantity
    const standardNutrientsSelectInner2 = FOOD_VARIANT_NUTRIENT_FIELDS.map(
      (nutrient) =>
        `SUM(COALESCE(fe_meal.${nutrient}, 0) * fe_meal.quantity / fe_meal.serving_size) AS ${nutrient}`
    ).join(',\n           ');
    const customNutrientsSelectInner2 = customNutrients
      .map((cn, idx) => {
        const ident = cn.name.replace(/"/g, '""');
        const paramIdx = customNutrientParamIndexes[idx];
        return `SUM(COALESCE(NULLIF(fe_meal.custom_nutrients->>$${paramIdx}, '')::numeric, 0) * fe_meal.quantity / fe_meal.serving_size) AS "${ident}"`;
      })
      .join(',\n           ');
    // Each snapshot holds ONE dose's payload; multiply by the dose count taken in this
    // entry. For a supplement `dose_amount` is a count (its strength is forced to 1), so
    // `dose_amount_snapshot` — which createEntry derives from the schedule's dose override
    // (COALESCE(ms.dose_amount, m.dose_amount)) — is the number of units this entry logged.
    // Manual/unscheduled entries snapshot 1, so this is a no-op there. NULL-safe to 1, and
    // GREATEST(..., 0) so a non-positive legacy value neutralises instead of subtracting.
    // (This is NOT the previously-rejected scaling by a medication's mg strength.)
    // Values are read from the immutable per-entry snapshot and parsed defensively so one
    // malformed JSONB value can't error the whole query.
    const standardNutrientsSelectSupplement = FOOD_VARIANT_NUTRIENT_FIELDS.map(
      (nutrient) =>
        `(COALESCE(public.sf_try_numeric(me.nutrients_snapshot->>'${nutrient}'), 0) * ${doseScale('me')}) AS ${nutrient}`
    ).join(',\n           ');
    const customNutrientsSelectSupplement = customNutrients
      .map((cn, idx) => {
        const ident = cn.name.replace(/"/g, '""');
        const paramIdx = customNutrientParamIndexes[idx];
        return `(COALESCE(public.sf_try_numeric(me.nutrients_snapshot->'custom_nutrients'->>$${paramIdx}), 0) * ${doseScale('me')}) AS "${ident}"`;
      })
      .join(',\n           ');
    const result = await client.query(
      `SELECT
         TO_CHAR(entry_date, 'YYYY-MM-DD') AS date,
         ${standardNutrientsSelectOuter}${
           customNutrientsSelectOuter
             ? ',\n         ' + customNutrientsSelectOuter
             : ''
         }
       FROM (
         SELECT
           fe.entry_date,
           'food'::text AS nutrient_source,
           ${standardNutrientsSelectInner1}${
             customNutrientsSelectInner1
               ? ',\n           ' + customNutrientsSelectInner1
               : ''
           }
         FROM food_entries fe
         WHERE fe.user_id = $1 AND fe.entry_date BETWEEN $2 AND $3 AND fe.food_entry_meal_id IS NULL
         UNION ALL
         SELECT
           fem.entry_date,
           'food'::text AS nutrient_source,
           -- Note: fe_meal.quantity is already scaled by the meal quantity when created,
           -- so we should NOT multiply by fem.quantity again
           ${standardNutrientsSelectInner2}${
             customNutrientsSelectInner2
               ? ',\n           ' + customNutrientsSelectInner2
               : ''
           }
         FROM food_entry_meals fem
         JOIN food_entries fe_meal ON fem.id = fe_meal.food_entry_meal_id
         WHERE fem.user_id = $1 AND fem.entry_date BETWEEN $2 AND $3
         GROUP BY fem.entry_date
         UNION ALL
         SELECT
           me.entry_date,
           'supplement'::text AS nutrient_source,
           ${standardNutrientsSelectSupplement}${
             customNutrientsSelectSupplement
               ? ',\n           ' + customNutrientsSelectSupplement
               : ''
           }
         FROM medication_entries me
         WHERE me.user_id = $1
           AND me.entry_date BETWEEN $2 AND $3
           AND ${supplementCountable('me')}
       ) AS combined_nutrition
       GROUP BY entry_date
       ORDER BY entry_date`,
      params
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function getTabularFoodData(
  userId: string,
  startDate: string,
  endDate: string,
  customNutrients: Array<{ name: string }> = []
) {
  const client = await getClient(userId); // User-specific operation
  try {
    const params: (string | number)[] = [userId, startDate, endDate];
    // Generate dynamic SQL parts for custom nutrients
    const customNutrientsSelectCTE = customNutrients
      .map((cn) => {
        const ident = cn.name.replace(/"/g, '""');
        params.push(cn.name);
        const paramIdx = params.length;
        return `(COALESCE(NULLIF(fe.custom_nutrients->>$${paramIdx}, '')::numeric, 0) * fe.quantity / fe.serving_size) AS "${ident}"`;
      })
      .join(',\n          ');
    const customNutrientsSelectOuter = customNutrients
      .map((cn) => {
        const ident = cn.name.replace(/"/g, '""');
        return `cfe."${ident}"`;
      })
      .join(',\n        ');
    // Note: cfe_meal values already include scaled quantity, so do NOT multiply by fem.quantity
    const customNutrientsSelectMealAgg = customNutrients
      .map((cn) => {
        const ident = cn.name.replace(/"/g, '""');
        return `SUM(cfe_meal."${ident}") AS "${ident}"`;
      })
      .join(',\n        ');
    const result = await client.query(
      `WITH CalculatedFoodEntries AS (
        SELECT
          fe.id,
          TO_CHAR(fe.entry_date, 'YYYY-MM-DD') AS entry_date,
          mt.name AS meal_type,
          mt.sort_order AS sort_order,
          fe.quantity,
          fe.unit,
          fe.food_id,
          fe.variant_id,
          fe.user_id,
          fe.food_name,
          fe.brand_name,
          (fe.calories * fe.quantity / fe.serving_size) AS calories,
          (fe.protein * fe.quantity / fe.serving_size) AS protein,
          (fe.carbs * fe.quantity / fe.serving_size) AS carbs,
          (fe.fat * fe.quantity / fe.serving_size) AS fat,
          (COALESCE(fe.saturated_fat, 0) * fe.quantity / fe.serving_size) AS saturated_fat,
          (COALESCE(fe.polyunsaturated_fat, 0) * fe.quantity / fe.serving_size) AS polyunsaturated_fat,
          (COALESCE(fe.monounsaturated_fat, 0) * fe.quantity / fe.serving_size) AS monounsaturated_fat,
          (COALESCE(fe.trans_fat, 0) * fe.quantity / fe.serving_size) AS trans_fat,
          (COALESCE(fe.cholesterol, 0) * fe.quantity / fe.serving_size) AS cholesterol,
          (COALESCE(fe.sodium, 0) * fe.quantity / fe.serving_size) AS sodium,
          (COALESCE(fe.potassium, 0) * fe.quantity / fe.serving_size) AS potassium,
          (COALESCE(fe.dietary_fiber, 0) * fe.quantity / fe.serving_size) AS dietary_fiber,
          (COALESCE(fe.sugars, 0) * fe.quantity / fe.serving_size) AS sugars,
          fe.glycemic_index,
          (COALESCE(fe.vitamin_a, 0) * fe.quantity / fe.serving_size) AS vitamin_a,
          (COALESCE(fe.vitamin_c, 0) * fe.quantity / fe.serving_size) AS vitamin_c,
          (COALESCE(fe.calcium, 0) * fe.quantity / fe.serving_size) AS calcium,
          (COALESCE(fe.iron, 0) * fe.quantity / fe.serving_size) AS iron,
          (COALESCE(fe.caffeine_mg, 0) * fe.quantity / fe.serving_size) AS caffeine_mg,
          (COALESCE(fe.water_ml, 0) * fe.quantity / fe.serving_size) AS water_ml,
          (COALESCE(fe.alcohol_g, 0) * fe.quantity / fe.serving_size) AS alcohol_g,
          fe.serving_size,
          fe.serving_unit,
          fe.food_entry_meal_id${
            customNutrientsSelectCTE
              ? ',\n          ' + customNutrientsSelectCTE
              : ''
          }
        FROM food_entries fe
        LEFT JOIN meal_types mt ON fe.meal_type_id = mt.id 
        WHERE fe.user_id = $1 AND fe.entry_date BETWEEN $2 AND $3
      )
      SELECT
        cfe.entry_date,
        cfe.meal_type,
        cfe.sort_order,
        cfe.quantity,
        cfe.unit,
        cfe.food_id,
        cfe.variant_id,
        cfe.user_id,
        cfe.food_name,
        cfe.brand_name,
        cfe.calories,
        cfe.protein,
        cfe.carbs,
        cfe.fat,
        cfe.saturated_fat,
        cfe.polyunsaturated_fat,
        cfe.monounsaturated_fat,
        cfe.trans_fat,
        cfe.cholesterol,
        cfe.sodium,
        cfe.potassium,
        cfe.dietary_fiber,
        cfe.sugars,
        cfe.glycemic_index,
        cfe.vitamin_a,
        cfe.vitamin_c,
        cfe.calcium,
        cfe.iron,
        cfe.caffeine_mg,
        cfe.water_ml,
        cfe.alcohol_g,
        cfe.serving_size,
        cfe.serving_unit,
        cfe.food_entry_meal_id${
          customNutrientsSelectOuter
            ? ',\n        ' + customNutrientsSelectOuter
            : ''
        }
      FROM CalculatedFoodEntries cfe
      WHERE cfe.food_entry_meal_id IS NULL -- Standalone food entries
      UNION ALL
      SELECT
        TO_CHAR(fem.entry_date, 'YYYY-MM-DD') AS entry_date,
        mt.name AS meal_type, 
        mt.sort_order,
        fem.quantity AS quantity, -- Use meal quantity
        'meal' AS unit, -- Indicate it's a meal
        NULL AS food_id,
        NULL AS variant_id,
        fem.user_id,
        fem.name AS food_name, -- Meal name as food_name
        fem.description AS brand_name, -- Meal description as brand_name
        -- Note: cfe_meal values already include scaled quantity (fe.quantity is pre-scaled),
        -- so we should NOT multiply by fem.quantity again
        SUM(cfe_meal.calories) AS calories,
        SUM(cfe_meal.protein) AS protein,
        SUM(cfe_meal.carbs) AS carbs,
        SUM(cfe_meal.fat) AS fat,
        SUM(cfe_meal.saturated_fat) AS saturated_fat,
        SUM(cfe_meal.polyunsaturated_fat) AS polyunsaturated_fat,
        SUM(cfe_meal.monounsaturated_fat) AS monounsaturated_fat,
        SUM(cfe_meal.trans_fat) AS trans_fat,
        SUM(cfe_meal.cholesterol) AS cholesterol,
        SUM(cfe_meal.sodium) AS sodium,
        SUM(cfe_meal.potassium) AS potassium,
        SUM(cfe_meal.dietary_fiber) AS dietary_fiber,
        SUM(cfe_meal.sugars) AS sugars,
        (CASE
            WHEN SUM(cfe_meal.carbs) = 0 THEN 'None'
            ELSE
                (CASE
                    WHEN (SUM(
                        (CASE cfe_meal.glycemic_index
                            WHEN 'Very Low' THEN 10
                            WHEN 'Low' THEN 30
                            WHEN 'Medium' THEN 50
                            WHEN 'High' THEN 70
                            WHEN 'Very High' THEN 90
                            ELSE 0
                        END) * cfe_meal.carbs
                    ) / NULLIF(SUM(cfe_meal.carbs), 0)) <= 20 THEN 'Very Low'
                    WHEN (SUM(
                        (CASE cfe_meal.glycemic_index
                            WHEN 'Very Low' THEN 10
                            WHEN 'Low' THEN 30
                            WHEN 'Medium' THEN 50
                            WHEN 'High' THEN 70
                            WHEN 'Very High' THEN 90
                            ELSE 0
                        END) * cfe_meal.carbs
                    ) / NULLIF(SUM(cfe_meal.carbs), 0)) <= 40 THEN 'Low'
                    WHEN (SUM(
                        (CASE cfe_meal.glycemic_index
                            WHEN 'Very Low' THEN 10
                            WHEN 'Low' THEN 30
                            WHEN 'Medium' THEN 50
                            WHEN 'High' THEN 70
                            WHEN 'Very High' THEN 90
                            ELSE 0
                        END) * cfe_meal.carbs
                    ) / NULLIF(SUM(cfe_meal.carbs), 0)) <= 60 THEN 'Medium'
                    WHEN (SUM(
                        (CASE cfe_meal.glycemic_index
                            WHEN 'Very Low' THEN 10
                            WHEN 'Low' THEN 30
                            WHEN 'Medium' THEN 50
                            WHEN 'High' THEN 70
                            WHEN 'Very High' THEN 90
                            ELSE 0
                        END) * cfe_meal.carbs
                    ) / NULLIF(SUM(cfe_meal.carbs), 0)) <= 80 THEN 'High'
                    ELSE 'Very High'
                END)
        END) AS glycemic_index,
        SUM(cfe_meal.vitamin_a) AS vitamin_a,
        SUM(cfe_meal.vitamin_c) AS vitamin_c,
        SUM(cfe_meal.calcium) AS calcium,
        SUM(cfe_meal.iron) AS iron,
        SUM(cfe_meal.caffeine_mg) AS caffeine_mg,
        SUM(cfe_meal.water_ml) AS water_ml,
        SUM(cfe_meal.alcohol_g) AS alcohol_g,
        1 AS serving_size, -- Treat meal as single serving unit for calculations
        'serving' AS serving_unit,
        fem.id AS food_entry_meal_id${
          customNutrientsSelectMealAgg
            ? ',\n        ' + customNutrientsSelectMealAgg
            : ''
        }
      FROM food_entry_meals fem
      JOIN CalculatedFoodEntries cfe_meal ON fem.id = cfe_meal.food_entry_meal_id
      LEFT JOIN meal_types mt ON fem.meal_type_id = mt.id
      WHERE fem.user_id = $1 AND fem.entry_date BETWEEN $2 AND $3
      GROUP BY 
        fem.id, 
        fem.entry_date, 
        mt.name,
        mt.sort_order,
        fem.name, 
        fem.description, 
        fem.user_id, 
        fem.quantity
      ORDER BY entry_date, sort_order ASC, food_name ASC`,
      params
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function getMeasurementData(
  userId: string,
  startDate: string,
  endDate: string
) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      "SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date, weight, neck, waist, hips, steps, height, body_fat_percentage, muscle_mass_kg, bone_mass_kg, body_water_percentage, bmr, resting_heart_rate FROM check_in_measurements WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 ORDER BY entry_date",
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function getCustomMeasurementsData(
  userId: string,
  categoryId: string,
  startDate: string,
  endDate: string
) {
  const client = await getClient(userId); // User-specific operation
  try {
    // Cap the points returned per category so large datasets (e.g. years of
    // intraday heart-rate samples) do not blow up the call stack or payload.
    // When the range exceeds maxPoints rows, return an evenly-spaced sample
    // (always including the first row) so charts keep the overall trend.
    const maxPoints = 3000;
    const result = await client.query(
      `WITH ranked AS (
           SELECT category_id,
                  TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
                  entry_hour, value, notes, entry_timestamp,
                  row_number() OVER (ORDER BY entry_date, entry_timestamp) AS rn,
                  count(*) OVER () AS total
           FROM custom_measurements
           WHERE user_id = $1 AND category_id = $2 AND entry_date BETWEEN $3 AND $4
         )
         SELECT category_id, entry_date, entry_hour, value, notes, entry_timestamp
         FROM ranked
         WHERE total <= $5 OR (rn - 1) % GREATEST(1, CEIL(total::float / $5)::bigint) = 0
         ORDER BY entry_date, entry_timestamp`,
      [userId, categoryId, startDate, endDate, maxPoints]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function getMiniNutritionTrends(
  userId: string,
  startDate: string,
  endDate: string,
  customNutrients: Array<{ name: string }> = []
) {
  const client = await getClient(userId); // User-specific operation
  try {
    const params: (string | number)[] = [userId, startDate, endDate];
    const customNutrientParamIndexes: number[] = [];
    customNutrients.forEach((cn) => {
      params.push(cn.name);
      customNutrientParamIndexes.push(params.length);
    });

    // Generate dynamic SQL parts for custom nutrients
    // Note: Standard nutrients use "total_" prefix in the outer select of the existing query.
    // For custom nutrients, I will use their name directly to match the service mapping.
    const customNutrientsSelectOuter = customNutrients
      .map((cn) => {
        const ident = cn.name.replace(/"/g, '""');
        return `SUM("${ident}") AS "${ident}"`;
      })
      .join(',\n         ');
    const customNutrientsSelectInner1 = customNutrients
      .map((cn, idx) => {
        const ident = cn.name.replace(/"/g, '""');
        const paramIdx = customNutrientParamIndexes[idx];
        return `(COALESCE(NULLIF(fe.custom_nutrients->>$${paramIdx}, '')::numeric, 0) * fe.quantity / fe.serving_size) AS "${ident}"`;
      })
      .join(',\n           ');
    // Note: fe_meal.quantity is already scaled, so do NOT multiply by fem.quantity
    const customNutrientsSelectInner2 = customNutrients
      .map((cn, idx) => {
        const ident = cn.name.replace(/"/g, '""');
        const paramIdx = customNutrientParamIndexes[idx];
        return `SUM(COALESCE(NULLIF(fe_meal.custom_nutrients->>$${paramIdx}, '')::numeric, 0) * fe_meal.quantity / fe_meal.serving_size) AS "${ident}"`;
      })
      .join(',\n           ');
    const result = await client.query(
      `SELECT
         TO_CHAR(entry_date, 'YYYY-MM-DD') AS entry_date,
         SUM(calories) AS total_calories,
         SUM(protein) AS total_protein,
         SUM(carbs) AS total_carbs,
         SUM(fat) AS total_fat,
         SUM(saturated_fat) AS total_saturated_fat,
         SUM(polyunsaturated_fat) AS total_polyunsaturated_fat,
         SUM(monounsaturated_fat) AS total_monounsaturated_fat,
         SUM(trans_fat) AS total_trans_fat,
         SUM(cholesterol) AS total_cholesterol,
         SUM(sodium) AS total_sodium,
         SUM(potassium) AS total_potassium,
         SUM(dietary_fiber) AS total_dietary_fiber,
         SUM(sugars) AS total_sugars,
         SUM(vitamin_a) AS total_vitamin_a,
         SUM(vitamin_c) AS total_vitamin_c,
         SUM(calcium) AS total_calcium,
         SUM(iron) AS total_iron,
         SUM(caffeine_mg) AS total_caffeine_mg,
         SUM(alcohol_g) AS total_alcohol_g${
           customNutrientsSelectOuter
             ? ',\n         ' + customNutrientsSelectOuter
             : ''
         }
       FROM (
         SELECT
           fe.entry_date,
           (fe.calories * fe.quantity / fe.serving_size) AS calories,
           (fe.protein * fe.quantity / fe.serving_size) AS protein,
           (fe.carbs * fe.quantity / fe.serving_size) AS carbs,
           (fe.fat * fe.quantity / fe.serving_size) AS fat,
           (COALESCE(fe.saturated_fat, 0) * fe.quantity / fe.serving_size) AS saturated_fat,
           (COALESCE(fe.polyunsaturated_fat, 0) * fe.quantity / fe.serving_size) AS polyunsaturated_fat,
           (COALESCE(fe.monounsaturated_fat, 0) * fe.quantity / fe.serving_size) AS monounsaturated_fat,
           (COALESCE(fe.trans_fat, 0) * fe.quantity / fe.serving_size) AS trans_fat,
           (COALESCE(fe.cholesterol, 0) * fe.quantity / fe.serving_size) AS cholesterol,
           (COALESCE(fe.sodium, 0) * fe.quantity / fe.serving_size) AS sodium,
           (COALESCE(fe.potassium, 0) * fe.quantity / fe.serving_size) AS potassium,
           (COALESCE(fe.dietary_fiber, 0) * fe.quantity / fe.serving_size) AS dietary_fiber,
           (COALESCE(fe.sugars, 0) * fe.quantity / fe.serving_size) AS sugars,
           (COALESCE(fe.vitamin_a, 0) * fe.quantity / fe.serving_size) AS vitamin_a,
           (COALESCE(fe.vitamin_c, 0) * fe.quantity / fe.serving_size) AS vitamin_c,
           (COALESCE(fe.calcium, 0) * fe.quantity / fe.serving_size) AS calcium,
           (COALESCE(fe.iron, 0) * fe.quantity / fe.serving_size) AS iron,
           (COALESCE(fe.caffeine_mg, 0) * fe.quantity / fe.serving_size) AS caffeine_mg,
           (COALESCE(fe.alcohol_g, 0) * fe.quantity / fe.serving_size) AS alcohol_g${
             customNutrientsSelectInner1
               ? ',\n           ' + customNutrientsSelectInner1
               : ''
           }
         FROM food_entries fe
         WHERE fe.user_id = $1 AND fe.entry_date BETWEEN $2 AND $3 AND fe.food_entry_meal_id IS NULL
         UNION ALL
         SELECT
           fem.entry_date,
           -- Note: fe_meal.quantity is already scaled by the meal quantity when created,
           -- so we should NOT multiply by fem.quantity again
           SUM(fe_meal.calories * fe_meal.quantity / fe_meal.serving_size) AS calories,
           SUM(fe_meal.protein * fe_meal.quantity / fe_meal.serving_size) AS protein,
           SUM(fe_meal.carbs * fe_meal.quantity / fe_meal.serving_size) AS carbs,
           SUM(fe_meal.fat * fe_meal.quantity / fe_meal.serving_size) AS fat,
           SUM(COALESCE(fe_meal.saturated_fat, 0) * fe_meal.quantity / fe_meal.serving_size) AS saturated_fat,
           SUM(COALESCE(fe_meal.polyunsaturated_fat, 0) * fe_meal.quantity / fe_meal.serving_size) AS polyunsaturated_fat,
           SUM(COALESCE(fe_meal.monounsaturated_fat, 0) * fe_meal.quantity / fe_meal.serving_size) AS monounsaturated_fat,
           SUM(COALESCE(fe_meal.trans_fat, 0) * fe_meal.quantity / fe_meal.serving_size) AS trans_fat,
           SUM(COALESCE(fe_meal.cholesterol, 0) * fe_meal.quantity / fe_meal.serving_size) AS cholesterol,
           SUM(COALESCE(fe_meal.sodium, 0) * fe_meal.quantity / fe_meal.serving_size) AS sodium,
           SUM(COALESCE(fe_meal.potassium, 0) * fe_meal.quantity / fe_meal.serving_size) AS potassium,
           SUM(COALESCE(fe_meal.dietary_fiber, 0) * fe_meal.quantity / fe_meal.serving_size) AS dietary_fiber,
           SUM(COALESCE(fe_meal.sugars, 0) * fe_meal.quantity / fe_meal.serving_size) AS sugars,
           SUM(COALESCE(fe_meal.vitamin_a, 0) * fe_meal.quantity / fe_meal.serving_size) AS vitamin_a,
           SUM(COALESCE(fe_meal.vitamin_c, 0) * fe_meal.quantity / fe_meal.serving_size) AS vitamin_c,
           SUM(COALESCE(fe_meal.calcium, 0) * fe_meal.quantity / fe_meal.serving_size) AS calcium,
           SUM(COALESCE(fe_meal.iron, 0) * fe_meal.quantity / fe_meal.serving_size) AS iron,
           SUM(COALESCE(fe_meal.caffeine_mg, 0) * fe_meal.quantity / fe_meal.serving_size) AS caffeine_mg,
           SUM(COALESCE(fe_meal.alcohol_g, 0) * fe_meal.quantity / fe_meal.serving_size) AS alcohol_g${
             customNutrientsSelectInner2
               ? ',\n           ' + customNutrientsSelectInner2
               : ''
           }
         FROM food_entry_meals fem
         JOIN food_entries fe_meal ON fem.id = fe_meal.food_entry_meal_id
         WHERE fem.user_id = $1 AND fem.entry_date BETWEEN $2 AND $3
         GROUP BY fem.entry_date
       ) AS combined_nutrition
       GROUP BY entry_date
       ORDER BY entry_date`,
      params
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function getExerciseEntries(
  userId: string,
  startDate: string,
  endDate: string,
  equipment?: string | null,
  muscle?: string | null,
  exercise?: string | null
) {
  const client = await getClient(userId); // User-specific operation
  try {
    let query = `SELECT
         ee.id,
         TO_CHAR(ee.entry_date, 'YYYY-MM-DD') AS entry_date,
         ee.created_at,
         ee.entry_time,
         ee.duration_minutes,
         ee.calories_burned,
         ee.calories_applied,
         ee.distance,
         ee.avg_heart_rate,
         ee.max_heart_rate,
         ee.heart_rate_recovery_1min,
         ee.avg_speed_mps,
         ee.max_speed_mps,
         ee.avg_cadence,
         ee.max_cadence,
         ee.avg_power_watts,
         ee.elevation_gain_meters,
         ee.notes,
         ee.exercise_id,
         ee.exercise_name,
         ee.category AS exercise_category,
         ee.calories_per_hour AS exercise_calories_per_hour,
         ee.equipment AS exercise_equipment,
         ee.primary_muscles AS exercise_primary_muscles,
         ee.secondary_muscles AS exercise_secondary_muscles,
         ee.instructions AS exercise_instructions,
         ee.images AS exercise_images,
         ee.source AS exercise_source,
         ee.source_id AS exercise_source_id,
         ee.user_id AS exercise_user_id,
         ee.level AS exercise_level,
         ee.force AS exercise_force,
         ee.mechanic AS exercise_mechanic,
         ee.modality AS exercise_modality,
         COALESCE(epe.workout_format, 'standard') AS workout_format,
         COALESCE(
           (SELECT json_agg(set_data ORDER BY set_data.set_number)
            FROM (
              SELECT ees.id, ees.set_number, ees.set_type, ees.reps, ees.weight, ees.duration, ees.rest_time, ees.notes, ees.distance, ees.rpe, ees.rir
              FROM exercise_entry_sets ees
              WHERE ees.exercise_entry_id = ee.id
            ) AS set_data
           ), '[]'::json
         ) AS sets
       FROM exercise_entries ee
       LEFT JOIN exercise_preset_entries epe ON ee.exercise_preset_entry_id = epe.id
       WHERE ee.user_id = $1 AND ee.entry_date BETWEEN $2 AND $3`;
    const params: (string | number)[] = [userId, startDate, endDate];
    let paramIndex = 4;
    if (equipment) {
      query += ` AND ee.equipment ILIKE $${paramIndex}`;
      params.push(`%${equipment}%`);
      paramIndex++;
    }
    if (muscle) {
      query += ` AND ee.primary_muscles ILIKE $${paramIndex}`;
      params.push(`%${muscle}%`);
      paramIndex++;
    }
    if (exercise) {
      query += ` AND ee.exercise_name = $${paramIndex}`;
      params.push(exercise);
      paramIndex++;
    }
    query += ' ORDER BY ee.entry_date DESC, ee.created_at DESC';
    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}
/**
 * Check-in body weights for bodyweight-exercise volume (`bodyWeightOnDay` in
 * @workspace/shared): every reading in the range, plus the last one before it
 * and the first one after it, so a day with no reading of its own still
 * resolves. Under RLS a delegate without check-in access gets none back, and
 * bodyweight sets then count their added weight only.
 */
async function getBodyWeightReadings(
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ date: string; weightKg: number }[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `(SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') AS date, weight
          FROM check_in_measurements
         WHERE user_id = $1 AND weight > 0 AND entry_date BETWEEN $2 AND $3)
       UNION ALL
       (SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') AS date, weight
          FROM check_in_measurements
         WHERE user_id = $1 AND weight > 0 AND entry_date < $2
         ORDER BY entry_date DESC LIMIT 1)
       UNION ALL
       (SELECT TO_CHAR(entry_date, 'YYYY-MM-DD') AS date, weight
          FROM check_in_measurements
         WHERE user_id = $1 AND weight > 0 AND entry_date > $3
         ORDER BY entry_date ASC LIMIT 1)`,
      [userId, startDate, endDate]
    );
    return result.rows.map(
      (row: { date: string; weight: string | number }) => ({
        date: row.date,
        weightKg: Number(row.weight),
      })
    );
  } finally {
    client.release();
  }
}
async function getExerciseNames(
  userId: string,
  muscle?: string | null,
  equipment?: string | null
) {
  const client = await getClient(userId); // User-specific operation
  try {
    // Exclude synced device calorie summaries (e.g. Apple Health "Active
    // Calories") — they show up as exercise entries but aren't true workouts,
    // and the Exercise Reports dashboard filters them out of its aggregates.
    let query =
      "SELECT DISTINCT exercise_id as id, exercise_name as name FROM exercise_entries WHERE user_id = $1 AND exercise_name <> 'Active Calories'";
    const params: string[] = [userId];
    let paramIndex = 2;
    if (muscle) {
      query += ` AND primary_muscles ILIKE $${paramIndex}`;
      params.push(`%${muscle}%`);
      paramIndex++;
    }
    if (equipment) {
      query += ` AND equipment ILIKE $${paramIndex}`;
      params.push(`%${equipment}%`);
      paramIndex++;
    }
    query += ' ORDER BY name';
    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}
// The range query's output names differ from the column names for exactly two fields, and
// its consumers read the aliases (foodTools reads row.fiber and row.sugar). Anything without
// an entry here is aliased to itself.
const RANGE_COL_ALIASES: Partial<Record<FoodVariantNutrientField, string>> = {
  dietary_fiber: 'fiber',
  sugars: 'sugar',
};
// Derived rather than hand-listed: this was a second copy of the seventeen fields with
// nothing enforcing that it stayed in step, so a field added to the shared list would have
// silently dropped out of trends and the chatbot's nutrition rows.
const RANGE_COLS: [FoodVariantNutrientField, string][] =
  FOOD_VARIANT_NUTRIENT_FIELDS.map((col) => [
    col,
    RANGE_COL_ALIASES[col] ?? col,
  ]);

// Per-day nutrition totals (macros + micros) over a date range, scaled by
// quantity / serving_size since food_entries snapshots store unscaled
// per-serving values. Backs the chatbot get_nutritional_summary action and
// report tools.
async function getDailyNutritionTotalsRange(
  userId: string,
  startDate: string,
  endDate: string
) {
  const client = await getClient(userId);
  try {
    // Each food SUM gets its dose-scaled supplement contribution for that date added, so
    // trends include supplements too. The date set is the UNION of food and taken-supplement
    // dates, so a day with only supplements logged still yields a row rather than
    // disappearing from the range.
    let rangeSelects = RANGE_COLS.map(
      ([col, alias]) =>
        `COALESCE(SUM(fe.${col} * fe.quantity / NULLIF(fe.serving_size, 0)), 0) + ${supplementFixedSubquery(col, '$1', 'd.entry_date')} as ${alias}`
    ).join(',\n              ');
    const legacyAmbiguousEntryCount = String.raw`COUNT(fe.id) FILTER (WHERE fe.unit ~ '^\s*[0-9]+(?:\.[0-9]+)?\s+\S') AS legacy_ambiguous_entry_count`;
    rangeSelects += `,\n              ${legacyAmbiguousEntryCount}`;
    const result = await client.query(
      `SELECT d.entry_date,
              ${rangeSelects}
       FROM (
         SELECT DISTINCT entry_date
           FROM food_entries
          WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
         UNION
         SELECT DISTINCT me.entry_date
           FROM medication_entries me
          WHERE me.user_id = $1 AND me.entry_date BETWEEN $2 AND $3
            AND ${supplementCountable('me')}
       ) d
       LEFT JOIN food_entries fe
              ON fe.user_id = $1 AND fe.entry_date = d.entry_date
       GROUP BY d.entry_date
       ORDER BY d.entry_date ASC`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Every logged workout in the range with just what training load needs: its
 * day, length and average heart rate. Synced calorie summaries are not
 * workouts.
 */
async function getTrainingLoadSessions(
  userId: string,
  startDate: string,
  endDate: string
): Promise<
  { day: string; durationMinutes: number; avgHeartRate: number | null }[]
> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      // A workout logged without a duration still has its sets: their timing
      // (seconds, per set) stands in for the length before the positive filter.
      `SELECT day, duration_minutes, avg_heart_rate
       FROM (
         SELECT ee.entry_date,
                TO_CHAR(ee.entry_date, 'YYYY-MM-DD') AS day,
                COALESCE(
                  NULLIF(ee.duration_minutes, 0),
                  (SELECT SUM(COALESCE(s.duration, 0)) / 60.0
                   FROM exercise_entry_sets s
                   WHERE s.exercise_entry_id = ee.id),
                  0
                ) AS duration_minutes,
                ee.avg_heart_rate
         FROM exercise_entries ee
         WHERE ee.user_id = $1
           AND ee.entry_date BETWEEN $2 AND $3
           AND ee.exercise_name != 'Active Calories'
       ) sessions
       WHERE duration_minutes > 0
       ORDER BY entry_date ASC`,
      [userId, startDate, endDate]
    );
    return result.rows.map(
      (row: {
        day: string;
        duration_minutes: string | number;
        avg_heart_rate: string | number | null;
      }) => ({
        day: row.day,
        durationMinutes: Number(row.duration_minutes),
        avgHeartRate:
          row.avg_heart_rate === null ? null : Number(row.avg_heart_rate),
      })
    );
  } finally {
    client.release();
  }
}

/** What the readiness score reads besides training: last night and a baseline. */
interface ReadinessVitals {
  sleepHours: number | null;
  restingHeartRate: number | null;
  restingHeartRateBaseline: number | null;
  /** Nights the resting heart rate baseline is the median of. */
  restingHeartRateBaselineNights: number;
  hrv: number | null;
  hrvBaseline: number | null;
  /** Nights the HRV baseline is the median of. */
  hrvBaselineNights: number;
}

const toNumberOrNull = (value: string | number | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

/** The sleep_entries columns the readiness vitals read. */
type SleepVitalColumn = 'resting_heart_rate' | 'avg_overnight_hrv';

/**
 * The newest reading of one sleep vital (nights ending `today` or the day
 * before) and the median of the same vital over the nights from `baselineStart`
 * up to `yesterday`, taken only from the source that recorded the newest one:
 * integrations measure HRV differently (SDNN against RMSSD), so a baseline mixed
 * across sources would be compared with a number it cannot be compared with.
 */
async function getSleepVital(
  client: Awaited<ReturnType<typeof getClient>>,
  column: SleepVitalColumn,
  userId: string,
  today: string,
  yesterday: string,
  baselineStart: string
): Promise<{ value: number | null; baseline: number | null; nights: number }> {
  const latest = await client.query(
    `SELECT ${column} AS value, source
     FROM sleep_entries
     WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 AND ${column} > 0
     ORDER BY entry_date DESC, wake_time DESC
     LIMIT 1`,
    [userId, yesterday, today]
  );
  const row = latest.rows[0];
  if (!row) return { value: null, baseline: null, nights: 0 };
  // The median keeps one noisy night from moving the baseline.
  const baseline = await client.query(
    `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${column}) AS baseline,
            COUNT(*) AS nights
     FROM sleep_entries
     WHERE user_id = $1 AND entry_date >= $2 AND entry_date < $3
       AND source = $4 AND ${column} > 0`,
    [userId, baselineStart, yesterday, row.source]
  );
  return {
    value: toNumberOrNull(row.value),
    baseline: toNumberOrNull(baseline.rows[0]?.baseline),
    nights: Number(baseline.rows[0]?.nights ?? 0),
  };
}

/**
 * The latest night's sleep, resting heart rate and HRV (nights ending `today`
 * or the day before) and the median of the 14 nights before that, which the
 * readiness score compares them with. Any of them can be null.
 */
async function getReadinessVitals(
  userId: string,
  today: string,
  yesterday: string,
  baselineStart: string
): Promise<ReadinessVitals> {
  const client = await getClient(userId);
  try {
    const latest = await client.query(
      `SELECT COALESCE(time_asleep_in_seconds, duration_in_seconds) / 3600.0 AS sleep_hours
       FROM sleep_entries
       WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
       ORDER BY entry_date DESC, wake_time DESC
       LIMIT 1`,
      [userId, yesterday, today]
    );
    const rhr = await getSleepVital(
      client,
      'resting_heart_rate',
      userId,
      today,
      yesterday,
      baselineStart
    );
    const hrv = await getSleepVital(
      client,
      'avg_overnight_hrv',
      userId,
      today,
      yesterday,
      baselineStart
    );
    return {
      sleepHours: toNumberOrNull(latest.rows[0]?.sleep_hours),
      restingHeartRate: rhr.value,
      restingHeartRateBaseline: rhr.baseline,
      restingHeartRateBaselineNights: rhr.nights,
      hrv: hrv.value,
      hrvBaseline: hrv.baseline,
      hrvBaselineNights: hrv.nights,
    };
  } finally {
    client.release();
  }
}

/** A logged cardio entry that might be a run, with what sport detection reads. */
interface RunCandidateRow {
  day: string;
  distanceKm: number;
  durationMinutes: number;
  avgHeartRate: number | null;
  elevationGainMeters: number | null;
  exerciseName: string | null;
  category: string | null;
  notes: string | null;
  providerName: string | null;
  detailData: unknown;
  exerciseSourceId: string | null;
}

/**
 * Cardio entries with a distance and a duration between two local days, with the
 * provider blob and names the shared sport detection reads, so the caller can
 * keep only the runs. Sport is not a column.
 */
async function getRunCandidates(
  userId: string,
  startDate: string,
  endDate: string
): Promise<RunCandidateRow[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT TO_CHAR(ee.entry_date, 'YYYY-MM-DD') AS day,
              ee.distance, ee.duration_minutes, ee.avg_heart_rate,
              ee.elevation_gain_meters, ee.exercise_name, ee.category, ee.notes,
              d.provider_name, d.detail_data,
              x.source_id AS exercise_source_id
       FROM exercise_entries ee
       LEFT JOIN exercises x ON x.id = ee.exercise_id
       LEFT JOIN LATERAL (
         SELECT provider_name, detail_data
         FROM exercise_entry_activity_details
         WHERE exercise_entry_id = ee.id
         ORDER BY CASE WHEN detail_type LIKE '%activity_data%' THEN 0 ELSE 1 END
         LIMIT 1
       ) d ON TRUE
       WHERE ee.user_id = $1
         AND ee.entry_date BETWEEN $2 AND $3
         AND ee.distance > 0
         AND ee.duration_minutes > 0
         AND ee.exercise_name != 'Active Calories'
       ORDER BY ee.entry_date ASC`,
      [userId, startDate, endDate]
    );
    return result.rows.map(
      (row: {
        day: string;
        distance: string | number;
        duration_minutes: string | number;
        avg_heart_rate: string | number | null;
        elevation_gain_meters: string | number | null;
        exercise_name: string | null;
        category: string | null;
        notes: string | null;
        provider_name: string | null;
        detail_data: unknown;
        exercise_source_id: string | null;
      }) => ({
        day: row.day,
        distanceKm: Number(row.distance),
        durationMinutes: Number(row.duration_minutes),
        avgHeartRate: toNumberOrNull(row.avg_heart_rate),
        elevationGainMeters: toNumberOrNull(row.elevation_gain_meters),
        exerciseName: row.exercise_name,
        category: row.category,
        notes: row.notes,
        providerName: row.provider_name,
        detailData: row.detail_data,
        exerciseSourceId: row.exercise_source_id,
      })
    );
  } finally {
    client.release();
  }
}

export { getNutritionData };
export { getTrainingLoadSessions };
export { getReadinessVitals };
export { getRunCandidates };
export type { RunCandidateRow };
export type { ReadinessVitals };
export { getTabularFoodData };
export { getMeasurementData };
export { getCustomMeasurementsData };
export { getMiniNutritionTrends };
export { getExerciseEntries };
export { getBodyWeightReadings };
export { getExerciseNames };
export { getDailyNutritionTotalsRange };
export default {
  getNutritionData,
  getTabularFoodData,
  getMeasurementData,
  getCustomMeasurementsData,
  getMiniNutritionTrends,
  getExerciseEntries,
  getTrainingLoadSessions,
  getReadinessVitals,
  getRunCandidates,
  getBodyWeightReadings,
  getExerciseNames,
  getDailyNutritionTotalsRange,
};
