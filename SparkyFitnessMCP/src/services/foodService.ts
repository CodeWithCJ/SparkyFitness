import { withClient } from "../db/context.js";
import { normalizePagination, buildPaginatedResult } from "../utils/pagination.js";
import type { FoodItem, FoodEntry, MealTemplate, PaginatedResult } from "../types.js";

/**
 * Resolves a meal_type name (e.g., "breakfast") to its meal_type_id.
 * Creates the meal_type if it doesn't exist for the user.
 */
async function resolveMealTypeId(client: any, userId: string, mealTypeName: string): Promise<string> {
  let result = await client.query(
    "SELECT id FROM meal_types WHERE LOWER(name) = LOWER($1) AND (user_id = $2 OR user_id IS NULL) LIMIT 1",
    [mealTypeName, userId]
  );
  if (result.rows.length > 0) {
    return result.rows[0].id;
  }
  
  // Try to create the meal type for this user, ignoring if it was just created concurrently
  result = await client.query(
    "INSERT INTO meal_types (user_id, name) VALUES ($1, $2) ON CONFLICT (user_id, name) DO NOTHING RETURNING id",
    [userId, mealTypeName.charAt(0).toUpperCase() + mealTypeName.slice(1)]
  );
  if (result.rows.length > 0) {
    return result.rows[0].id;
  }
  
  // If we hit a conflict, it means another request created it, so fetch it again
  result = await client.query(
    "SELECT id FROM meal_types WHERE LOWER(name) = LOWER($1) AND user_id = $2 LIMIT 1",
    [mealTypeName, userId]
  );
  return result.rows[0].id;
}

import { todayInZone, addDays } from "@workspace/shared";

/**
 * Gets today's date in YYYY-MM-DD format (UTC for consistency).
 */
function getTodayDate(): string {
  return todayInZone("UTC");
}

/**
 * Gets yesterday's date in YYYY-MM-DD format.
 */
function getYesterdayDate(): string {
  return addDays(getTodayDate(), -1);
}

/**
 * Valid food-related external data provider types.
 * These are used to filter the lookup cascade so we don't query exercise or health providers.
 */
const FOOD_PROVIDER_TYPES = ["fatsecret", "mealie", "tandoor", "norish", "usda", "openfoodfacts"];

export async function searchFood(
  userId: string,
  foodName: string,
  searchType: "exact" | "broad",
  limit?: number,
  offset?: number
): Promise<PaginatedResult<FoodItem>> {
  const { limit: safeLimit, offset: safeOffset } = normalizePagination(limit, offset);

  return withClient(userId, async (client) => {
    const searchPattern = searchType === "exact" ? foodName : `%${foodName}%`;
    const operator = searchType === "exact" ? "ILIKE" : "ILIKE";

    // Count
    const countResult = await client.query(
      `SELECT COUNT(DISTINCT f.id)::int AS count
       FROM foods f
       WHERE f.name ${operator} $1`,
      [searchPattern]
    );
    const totalCount = countResult.rows[0]?.count ?? 0;

    // Data with default variant
    const dataResult = await client.query(
      `SELECT f.id, f.name, f.brand,
              fv.id AS variant_id, fv.serving_size, fv.serving_unit,
              fv.calories, fv.protein, fv.carbs, fv.fat,
              fv.saturated_fat, fv.polyunsaturated_fat, fv.monounsaturated_fat,
              fv.trans_fat, fv.cholesterol, fv.sodium, fv.potassium,
              fv.dietary_fiber, fv.sugars, fv.vitamin_a, fv.vitamin_c,
              fv.calcium, fv.iron, fv.glycemic_index
       FROM foods f
       LEFT JOIN food_variants fv ON fv.food_id = f.id AND fv.is_default = TRUE
       WHERE f.name ${operator} $1
       ORDER BY f.name ASC
       LIMIT $2 OFFSET $3`,
      [searchPattern, safeLimit, safeOffset]
    );

    const foods: FoodItem[] = dataResult.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      brand: row.brand || undefined,
      variants: row.variant_id
        ? [
            {
              id: row.variant_id,
              food_id: row.id,
              serving_size: row.serving_size,
              serving_unit: row.serving_unit,
              calories: row.calories,
              protein: row.protein,
              carbs: row.carbs,
              fat: row.fat,
              saturated_fat: row.saturated_fat,
              polyunsaturated_fat: row.polyunsaturated_fat,
              monounsaturated_fat: row.monounsaturated_fat,
              trans_fat: row.trans_fat,
              cholesterol: row.cholesterol,
              sodium: row.sodium,
              potassium: row.potassium,
              dietary_fiber: row.dietary_fiber,
              sugars: row.sugars,
              vitamin_a: row.vitamin_a,
              vitamin_c: row.vitamin_c,
              calcium: row.calcium,
              iron: row.iron,
              glycemic_index: row.glycemic_index,
            },
          ]
        : [],
    }));

    return buildPaginatedResult(foods, totalCount, safeOffset);
  });
}

export async function logFood(
  userId: string,
  params: {
    food_name: string;
    food_id?: string;
    variant_id?: string;
    quantity: number;
    unit: string;
    meal_type: string;
    entry_date: string;
  }
): Promise<FoodEntry> {
  return withClient(userId, async (client) => {
    let foodId = params.food_id;
    let variantId = params.variant_id;

    // If no food_id, try to find by name
    if (!foodId) {
      const existing = await client.query(
        "SELECT id FROM foods WHERE name ILIKE $1 LIMIT 1",
        [params.food_name]
      );
      if (existing.rows.length === 0) {
        throw new Error(`Food "${params.food_name}" not found. Create it first using create_food action.`);
      }
      foodId = existing.rows[0].id;
    }

    // If no variant_id, get the default variant
    if (!variantId) {
      const variantResult = await client.query(
        "SELECT id FROM food_variants WHERE food_id = $1 AND is_default = TRUE LIMIT 1",
        [foodId]
      );
      if (variantResult.rows.length > 0) {
        variantId = variantResult.rows[0].id;
      }
    }

    // Resolve meal_type name to meal_type_id
    const mealTypeId = await resolveMealTypeId(client, userId, params.meal_type);

    // Fetch nutritional data from the variant to inline into food_entries
    // Scale nutrition by (quantity / serving_size) so inline values reflect actual intake
    let nutritionData: Record<string, unknown> = {};
    let foodName = params.food_name;
    let brandName: string | null = null;
    let servingSize: number | null = null;
    let servingUnit: string | null = null;

    if (variantId) {
      const variantInfo = await client.query(
        `SELECT fv.serving_size, fv.serving_unit, fv.calories, fv.protein, fv.carbs, fv.fat,
                fv.saturated_fat, fv.polyunsaturated_fat, fv.monounsaturated_fat, fv.trans_fat,
                fv.cholesterol, fv.sodium, fv.potassium, fv.dietary_fiber, fv.sugars,
                fv.vitamin_a, fv.vitamin_c, fv.calcium, fv.iron, fv.glycemic_index
         FROM food_variants fv WHERE fv.id = $1`,
        [variantId]
      );
      if (variantInfo.rows.length > 0) {
        const v = variantInfo.rows[0];
        servingSize = v.serving_size;
        servingUnit = v.serving_unit;

        // Calculate multiplier based on unit compatibility:
        // - If user logs in "serving" → multiplier = quantity (absolute servings)
        // - If user logs in same unit as variant (e.g. both "g") → multiplier = quantity / serving_size
        // - Otherwise → multiplier = quantity (treat as absolute)
        const variantServingSize = Number(v.serving_size) || 1;
        const variantUnit = (v.serving_unit || "serving").toLowerCase();
        const userUnit = (params.unit || "serving").toLowerCase();
        
        nutritionData = {
          calories: v.calories, protein: v.protein,
          carbs: v.carbs, fat: v.fat,
          saturated_fat: v.saturated_fat, polyunsaturated_fat: v.polyunsaturated_fat,
          monounsaturated_fat: v.monounsaturated_fat, trans_fat: v.trans_fat,
          cholesterol: v.cholesterol, sodium: v.sodium, potassium: v.potassium,
          dietary_fiber: v.dietary_fiber, sugars: v.sugars,
          vitamin_a: v.vitamin_a, vitamin_c: v.vitamin_c, calcium: v.calcium,
          iron: v.iron, glycemic_index: v.glycemic_index,
        };
      }
    }

    // Get food name and brand from foods table
    if (foodId) {
      const foodInfo = await client.query("SELECT name, brand FROM foods WHERE id = $1", [foodId]);
      if (foodInfo.rows.length > 0) {
        foodName = foodInfo.rows[0].name;
        brandName = foodInfo.rows[0].brand || null;
      }
    }

    const result = await client.query(
      `INSERT INTO food_entries (
         user_id, food_id, variant_id, entry_date, quantity, unit, meal_type_id,
         food_name, brand_name, serving_size, serving_unit,
         calories, protein, carbs, fat, saturated_fat, polyunsaturated_fat,
         monounsaturated_fat, trans_fat, cholesterol, sodium, potassium,
         dietary_fiber, sugars, vitamin_a, vitamin_c, calcium, iron, glycemic_index,
         created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17,
         $18, $19, $20, $21, $22,
         $23, $24, $25, $26, $27, $28, $29,
         NOW()
       )
       RETURNING id, user_id, food_id, variant_id, entry_date, quantity, unit, meal_type_id, food_name, created_at`,
      [
        userId, foodId, variantId || null, params.entry_date, params.quantity, params.unit, mealTypeId,
        foodName, brandName, servingSize, servingUnit,
        nutritionData.calories ?? null, nutritionData.protein ?? null,
        nutritionData.carbs ?? null, nutritionData.fat ?? null,
        nutritionData.saturated_fat ?? null, nutritionData.polyunsaturated_fat ?? null,
        nutritionData.monounsaturated_fat ?? null, nutritionData.trans_fat ?? null,
        nutritionData.cholesterol ?? null, nutritionData.sodium ?? null,
        nutritionData.potassium ?? null, nutritionData.dietary_fiber ?? null,
        nutritionData.sugars ?? null, nutritionData.vitamin_a ?? null,
        nutritionData.vitamin_c ?? null, nutritionData.calcium ?? null,
        nutritionData.iron ?? null, nutritionData.glycemic_index ?? null,
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      food_id: row.food_id,
      variant_id: row.variant_id || undefined,
      food_name: row.food_name,
      quantity: params.quantity,
      unit: params.unit,
      meal_type: params.meal_type,
      entry_date: row.entry_date,
    };
  });
}

export async function createFood(
  userId: string,
  params: {
    food_name: string;
    brand?: string;
    macros: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      saturated_fat?: number;
      polyunsaturated_fat?: number;
      monounsaturated_fat?: number;
      trans_fat?: number;
      cholesterol?: number;
      sodium?: number;
      potassium?: number;
      fiber?: number;
      sugar?: number;
      vitamin_a?: number;
      vitamin_c?: number;
      calcium?: number;
      iron?: number;
      gi?: string;
    };
    quantity?: number;
    unit?: string;
    meal_type?: string;
    entry_date?: string;
  }
): Promise<FoodItem & { logged_entry?: FoodEntry }> {
  return withClient(userId, async (client) => {
    await client.query("BEGIN");
    try {
      // Insert food
      const foodResult = await client.query(
        `INSERT INTO foods (user_id, name, brand, is_custom, shared_with_public, created_at, updated_at)
         VALUES ($1, $2, $3, TRUE, FALSE, NOW(), NOW())
         RETURNING id, name, brand`,
        [userId, params.food_name, params.brand || null]
      );
      const food = foodResult.rows[0];

      const targetUnit = params.unit || "serving";
      const countBasedUnits = ["serving", "piece", "slice", "portion", "unit", "can", "bottle", "item", "pack"];
      const isCountUnit = countBasedUnits.includes(targetUnit.toLowerCase());
      const targetQuantity = params.quantity || (isCountUnit ? 1 : 100);

      // Insert default variant
      const variantResult = await client.query(
        `INSERT INTO food_variants (
           food_id, serving_size, serving_unit, calories, protein, carbs, fat,
           saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
           cholesterol, sodium, potassium, dietary_fiber, sugars,
           vitamin_a, vitamin_c, calcium, iron, glycemic_index, is_default, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, TRUE, NOW(), NOW())
         RETURNING id, food_id, serving_size, serving_unit, calories, protein, carbs, fat,
                   saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
                   cholesterol, sodium, potassium, dietary_fiber, sugars,
                   vitamin_a, vitamin_c, calcium, iron, glycemic_index`,
        [
          food.id,
          targetQuantity,
          targetUnit,
          params.macros.calories,
          params.macros.protein,
          params.macros.carbs,
          params.macros.fat,
          params.macros.saturated_fat || null,
          params.macros.polyunsaturated_fat || null,
          params.macros.monounsaturated_fat || null,
          params.macros.trans_fat || null,
          params.macros.cholesterol || null,
          params.macros.sodium || null,
          params.macros.potassium || null,
          params.macros.fiber || null,
          params.macros.sugar || null,
          params.macros.vitamin_a || null,
          params.macros.vitamin_c || null,
          params.macros.calcium || null,
          params.macros.iron || null,
          params.macros.gi || null,
        ]
      );
      const variant = variantResult.rows[0];

      // Ported feature: Automatically log to diary if meal_type is provided
      let logged_entry: FoodEntry | undefined;
      if (params.meal_type) {
        const entryDate = params.entry_date || getTodayDate();
        const mealTypeId = await resolveMealTypeId(client, userId, params.meal_type);

        // Scale macros for the entry (same logic as logFood but simpler since we just created it)
        const logQuantity = params.quantity || (isCountUnit ? 1 : 100);
        const logUnit = params.unit || "serving";
        
        const result = await client.query(
          `INSERT INTO food_entries (
             user_id, food_id, variant_id, entry_date, quantity, unit, meal_type_id,
             food_name, brand_name, serving_size, serving_unit,
             calories, protein, carbs, fat, saturated_fat, polyunsaturated_fat,
             monounsaturated_fat, trans_fat, cholesterol, sodium, potassium,
             dietary_fiber, sugars, vitamin_a, vitamin_c, calcium, iron, glycemic_index,
             created_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, NOW()
           ) RETURNING id, entry_date, quantity, unit, food_name`,
          [
            userId, food.id, variant.id, entryDate, logQuantity, logUnit, mealTypeId,
            food.name, food.brand || null, variant.serving_size, variant.serving_unit,
            variant.calories ?? null, variant.protein ?? null, variant.carbs ?? null, variant.fat ?? null,
            variant.saturated_fat ?? null, variant.polyunsaturated_fat ?? null, variant.monounsaturated_fat ?? null,
            variant.trans_fat ?? null, variant.cholesterol ?? null, variant.sodium ?? null, variant.potassium ?? null,
            variant.dietary_fiber ?? null, variant.sugars ?? null, variant.vitamin_a ?? null, variant.vitamin_c ?? null,
            variant.calcium ?? null, variant.iron ?? null, variant.glycemic_index,
          ]
        );
        
        const row = result.rows[0];
        logged_entry = {
          id: row.id,
          user_id: userId,
          food_id: food.id,
          variant_id: variant.id,
          food_name: row.food_name,
          quantity: Number(row.quantity),
          unit: row.unit,
          meal_type: params.meal_type,
          entry_date: row.entry_date,
        };
      }

      await client.query("COMMIT");

      return {
        id: food.id,
        name: food.name,
        brand: food.brand || undefined,
        logged_entry,
        variants: [
          {
            id: variant.id,
            food_id: variant.food_id,
            serving_size: variant.serving_size,
            serving_unit: variant.serving_unit,
            calories: variant.calories,
            protein: variant.protein,
            carbs: variant.carbs,
            fat: variant.fat,
            saturated_fat: variant.saturated_fat,
            polyunsaturated_fat: variant.polyunsaturated_fat,
            monounsaturated_fat: variant.monounsaturated_fat,
            trans_fat: variant.trans_fat,
            cholesterol: variant.cholesterol,
            sodium: variant.sodium,
            potassium: variant.potassium,
            dietary_fiber: variant.dietary_fiber,
            sugars: variant.sugars,
            vitamin_a: variant.vitamin_a,
            vitamin_c: variant.vitamin_c,
            calcium: variant.calcium,
            iron: variant.iron,
            glycemic_index: variant.glycemic_index,
          },
        ],
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function searchMeal(userId: string, mealName: string): Promise<MealTemplate[]> {
  return withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT m.id, m.user_id, m.name, m.description,
              json_agg(json_build_object(
                'food_id', mf.food_id,
                'food_name', f.name,
                'variant_id', mf.variant_id,
                'quantity', mf.quantity,
                'unit', COALESCE(mf.unit, fv.serving_unit, 'serving')
              )) AS foods
       FROM meals m
       LEFT JOIN meal_foods mf ON mf.meal_id = m.id
       LEFT JOIN foods f ON f.id = mf.food_id
       LEFT JOIN food_variants fv ON fv.id = mf.variant_id
       WHERE m.name ILIKE $1
       GROUP BY m.id, m.user_id, m.name, m.description
       ORDER BY m.name ASC`,
      [`%${mealName}%`]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      description: row.description || undefined,
      foods: row.foods && row.foods[0]?.food_id ? row.foods : [],
    }));
  });
}

export async function logMeal(
  userId: string,
  params: {
    meal_id?: string;
    meal_name?: string;
    meal_type: string;
    entry_date: string;
    quantity?: number;
    unit?: string;
  }
): Promise<{ id: string; meal_name: string; entry_date: string }> {
  return withClient(userId, async (client) => {
    // Find the meal
    let mealId = params.meal_id;
    let mealName = params.meal_name || "";

    if (!mealId && params.meal_name) {
      const result = await client.query(
        "SELECT id, name FROM meals WHERE name ILIKE $1 LIMIT 1",
        [params.meal_name]
      );
      if (result.rows.length === 0) {
        throw new Error(`Meal "${params.meal_name}" not found.`);
      }
      mealId = result.rows[0].id;
      mealName = result.rows[0].name;
    } else if (mealId) {
      const result = await client.query("SELECT name FROM meals WHERE id = $1", [mealId]);
      if (result.rows.length === 0) {
        throw new Error(`Meal with ID "${mealId}" not found.`);
      }
      mealName = result.rows[0].name;
    }

    // Resolve meal_type name to meal_type_id
    const mealTypeId = await resolveMealTypeId(client, userId, params.meal_type);

    const quantity = params.quantity || 1;
    const unit = params.unit || "serving";

    const result = await client.query(
      `INSERT INTO food_entry_meals (user_id, meal_template_id, entry_date, meal_type_id, quantity, unit, name, created_by_user_id, updated_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $1, $1, NOW(), NOW())
       RETURNING id, entry_date`,
      [userId, mealId, params.entry_date, mealTypeId, quantity, unit, mealName]
    );

    return {
      id: result.rows[0].id,
      meal_name: mealName,
      entry_date: result.rows[0].entry_date,
    };
  });
}

export async function listDiary(
  userId: string,
  entryDate?: string
): Promise<{ food_entries: FoodEntry[]; meal_entries: any[]; energy_unit: string }> {
  const date = entryDate || getTodayDate();
  const prefs = await getPreferences(userId);
  const energyUnit = (prefs.energy_unit as string) || "kcal";

  return withClient(userId, async (client) => {
    // Get food entries — nutritional data is stored inline on food_entries
    const foodResult = await client.query(
      `SELECT fe.id, fe.user_id, fe.food_id, fe.variant_id, fe.food_name,
              fe.entry_date, fe.quantity, fe.unit, mt.name AS meal_type,
              fe.serving_size, fe.serving_unit, fe.calories, fe.protein, fe.carbs, fe.fat,
              fe.saturated_fat, fe.polyunsaturated_fat, fe.monounsaturated_fat,
              fe.trans_fat, fe.cholesterol, fe.sodium, fe.potassium,
              fe.dietary_fiber, fe.sugars, fe.vitamin_a, fe.vitamin_c,
              fe.calcium, fe.iron, fe.glycemic_index
       FROM food_entries fe
       LEFT JOIN meal_types mt ON mt.id = fe.meal_type_id
       WHERE fe.entry_date = $1
       ORDER BY fe.created_at ASC`,
      [date]
    );

    const foodEntries: FoodEntry[] = foodResult.rows.map((row: any) => {
      const servingSize = Number(row.serving_size) || 1;
      const servingUnit = (row.serving_unit || "serving").toLowerCase();
      const unit = (row.unit || "serving").toLowerCase();
      const quantity = Number(row.quantity);

      let multiplier: number;
      if (unit === "serving" || unit !== servingUnit) {
        multiplier = quantity;
      } else {
        multiplier = quantity / servingSize;
      }

      const scale = (val: unknown) => {
        const n = Number(val);
        return isNaN(n) ? 0 : Math.round(n * multiplier * 10) / 10;
      };

      const scaledCalories = scale(row.calories);
      const displayCalories = energyUnit === "kJ" ? convertEnergy(scaledCalories, "kcal", "kJ") : scaledCalories;

      return {
        id: row.id,
        user_id: row.user_id,
        food_id: row.food_id,
        variant_id: row.variant_id || undefined,
        food_name: row.food_name,
        quantity: Number(row.quantity),
        unit: row.unit || "g",
        meal_type: row.meal_type ? row.meal_type.toLowerCase() : "snacks",
        entry_date: row.entry_date,
        nutritional_values: row.calories != null
          ? {
              calories: Math.round(displayCalories),
              protein: scale(row.protein),
              carbs: scale(row.carbs),
              fat: scale(row.fat),
            }
          : undefined,
      };
    });

    // Get meal entries
    const mealResult = await client.query(
      `SELECT fem.id, fem.user_id, fem.meal_template_id, fem.name AS meal_name,
              fem.entry_date, fem.quantity, fem.unit, mt.name AS meal_type
       FROM food_entry_meals fem
       LEFT JOIN meal_types mt ON mt.id = fem.meal_type_id
       WHERE fem.entry_date = $1
       ORDER BY fem.created_at ASC`,
      [date]
    );

    const mealEntries = mealResult.rows.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      meal_template_id: row.meal_template_id,
      meal_name: row.meal_name,
      entry_date: row.entry_date,
      quantity: Number(row.quantity),
      unit: row.unit || "serving",
      meal_type: row.meal_type ? row.meal_type.toLowerCase() : "snacks",
      entry_type: "food_entry_meal",
    }));

    return { food_entries: foodEntries, meal_entries: mealEntries, energy_unit: energyUnit };
  });
}


export async function logWater(
  userId: string,
  params: { amount_ml: number; entry_date: string }
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO water_intake_entries (user_id, entry_date, water_ml, source, created_at, created_by_user_id, logged_at)
       VALUES ($1, $2, $3, 'manual', NOW(), $1, NOW())
       RETURNING id, entry_date, water_ml, source, created_at`,
      [userId, params.entry_date, params.amount_ml]
    );
    return result.rows[0];
  });
}

export async function getWaterHistory(
  userId: string,
  params: { start_date?: string; end_date?: string }
): Promise<Record<string, unknown>[]> {
  const prefs = await getPreferences(userId);
  const waterUnit = (prefs.water_display_unit as string) || "ml";

  return withClient(userId, async (client) => {
    let query = `
      SELECT entry_date, SUM(water_ml) as total_ml
      FROM water_intake_entries
      WHERE user_id = $1
    `;
    const queryParams: any[] = [userId];
    let paramIdx = 2;

    if (params.start_date) {
      query += ` AND entry_date >= $${paramIdx}`;
      queryParams.push(params.start_date);
      paramIdx++;
    }
    if (params.end_date) {
      query += ` AND entry_date <= $${paramIdx}`;
      queryParams.push(params.end_date);
      paramIdx++;
    }

    query += ` GROUP BY entry_date ORDER BY entry_date ASC`;

    const result = await client.query(query, queryParams);
    return result.rows.map((row: any) => {
      const ml = Number(row.total_ml || 0);
      return {
        entry_date: row.entry_date,
        amount: waterUnit === "oz" ? Math.round(ml / 29.5735 * 10) / 10 : ml,
        unit: waterUnit,
      };
    });
  });
}


import { getPreferences } from "./profileService.js";
import { convertEnergy } from "../utils/unitConversion.js";

export async function getNutritionalSummary(
  userId: string,
  params: { start_date: string; end_date: string }
): Promise<Record<string, unknown>[]> {
  const prefs = await getPreferences(userId);
  const energyUnit = (prefs.energy_unit as string) || "kcal";

  return withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT entry_date, 
              SUM(calories * quantity / NULLIF(serving_size, 0)) as calories, 
              SUM(protein * quantity / NULLIF(serving_size, 0)) as protein, 
              SUM(carbs * quantity / NULLIF(serving_size, 0)) as carbs, 
              SUM(fat * quantity / NULLIF(serving_size, 0)) as fat,
              SUM(saturated_fat * quantity / NULLIF(serving_size, 0)) as saturated_fat,
              SUM(polyunsaturated_fat * quantity / NULLIF(serving_size, 0)) as polyunsaturated_fat,
              SUM(monounsaturated_fat * quantity / NULLIF(serving_size, 0)) as monounsaturated_fat,
              SUM(trans_fat * quantity / NULLIF(serving_size, 0)) as trans_fat,
              SUM(cholesterol * quantity / NULLIF(serving_size, 0)) as cholesterol,
              SUM(sodium * quantity / NULLIF(serving_size, 0)) as sodium,
              SUM(potassium * quantity / NULLIF(serving_size, 0)) as potassium,
              SUM(dietary_fiber * quantity / NULLIF(serving_size, 0)) as fiber,
              SUM(sugars * quantity / NULLIF(serving_size, 0)) as sugar,
              SUM(vitamin_a * quantity / NULLIF(serving_size, 0)) as vitamin_a,
              SUM(vitamin_c * quantity / NULLIF(serving_size, 0)) as vitamin_c,
              SUM(calcium * quantity / NULLIF(serving_size, 0)) as calcium,
              SUM(iron * quantity / NULLIF(serving_size, 0)) as iron
       FROM food_entries
       WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3
       GROUP BY entry_date
       ORDER BY entry_date ASC`,
      [userId, params.start_date, params.end_date]
    );

    return result.rows.map((row: any) => {
      const calories = Number(row.calories || 0);
      return {
        ...row,
        calories: energyUnit === "kJ" ? convertEnergy(calories, "kcal", "kJ") : calories,
        protein: Number(row.protein || 0),
        carbs: Number(row.carbs || 0),
        fat: Number(row.fat || 0),
        saturated_fat: Number(row.saturated_fat || 0),
        polyunsaturated_fat: Number(row.polyunsaturated_fat || 0),
        monounsaturated_fat: Number(row.monounsaturated_fat || 0),
        trans_fat: Number(row.trans_fat || 0),
        cholesterol: Number(row.cholesterol || 0),
        sodium: Number(row.sodium || 0),
        potassium: Number(row.potassium || 0),
        fiber: Number(row.fiber || 0),
        sugar: Number(row.sugar || 0),
        vitamin_a: Number(row.vitamin_a || 0),
        vitamin_c: Number(row.vitamin_c || 0),
        calcium: Number(row.calcium || 0),
        iron: Number(row.iron || 0),
        energy_unit: energyUnit,
      };
    });
  });
}





export async function deleteEntry(
  userId: string,
  entryId: string,
  entryType: "food_entry" | "food_entry_meal"
): Promise<boolean> {
  return withClient(userId, async (client) => {
    const table = entryType === "food_entry" ? "food_entries" : "food_entry_meals";
    const result = await client.query(
      `DELETE FROM ${table} WHERE id = $1 RETURNING id`,
      [entryId]
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export async function deleteFood(
  userId: string,
  foodId?: string,
  foodName?: string
): Promise<{ deleted: boolean; food_name?: string }> {
  return withClient(userId, async (client) => {
    let targetFoodId = foodId;
    let name = foodName;

    // Find by name if no ID provided
    if (!targetFoodId && foodName) {
      const result = await client.query(
        "SELECT id, name FROM foods WHERE name ILIKE $1 LIMIT 1",
        [foodName]
      );
      if (result.rows.length === 0) {
        throw new Error(`Food "${foodName}" not found.`);
      }
      targetFoodId = result.rows[0].id;
      name = result.rows[0].name;
    }

    if (!targetFoodId) {
      throw new Error("Either food_id or food_name must be provided.");
    }

    await client.query("BEGIN");
    try {
      // Delete food_entries referencing this food
      await client.query("DELETE FROM food_entries WHERE food_id = $1", [targetFoodId]);
      // Delete food_variants
      await client.query("DELETE FROM food_variants WHERE food_id = $1", [targetFoodId]);
      // Delete the food itself
      const result = await client.query("DELETE FROM foods WHERE id = $1 RETURNING name", [targetFoodId]);
      await client.query("COMMIT");

      if ((result.rowCount ?? 0) === 0) {
        return { deleted: false };
      }
      return { deleted: true, food_name: result.rows[0]?.name || name };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}


export async function updateFoodVariant(
  userId: string,
  params: {
    food_id?: string;
    variant_id?: string;
    serving_size?: number;
    serving_unit?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    saturated_fat?: number;
    polyunsaturated_fat?: number;
    monounsaturated_fat?: number;
    trans_fat?: number;
    cholesterol?: number;
    sodium?: number;
    potassium?: number;
    fiber?: number;
    sugar?: number;
    vitamin_a?: number;
    vitamin_c?: number;
    calcium?: number;
    iron?: number;
    gi?: string;
    update_existing_entries?: boolean;
  }
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    await client.query("BEGIN");
    try {
      let variantId = params.variant_id;

      if (!variantId && params.food_id) {
        const defaultVariant = await client.query(
          `SELECT fv.id
           FROM food_variants fv
           JOIN foods f ON f.id = fv.food_id
           WHERE fv.food_id = $1 AND fv.is_default = TRUE AND f.user_id = $2
           LIMIT 1`,
          [params.food_id, userId]
        );
        if (defaultVariant.rows.length === 0) {
          throw new Error(`Default variant for food_id "${params.food_id}" not found or not editable.`);
        }
        variantId = defaultVariant.rows[0].id;
      }

      if (!variantId) {
        throw new Error("Either variant_id or food_id must be provided.");
      }

      const existing = await client.query(
        `SELECT fv.id, fv.food_id, f.name AS food_name
         FROM food_variants fv
         JOIN foods f ON f.id = fv.food_id
         WHERE fv.id = $1 AND f.user_id = $2
         LIMIT 1`,
        [variantId, userId]
      );

      if (existing.rows.length === 0) {
        throw new Error(`Food variant "${variantId}" not found or not editable.`);
      }

      if (params.food_id && existing.rows[0].food_id !== params.food_id) {
        throw new Error(`Variant "${variantId}" does not belong to food "${params.food_id}".`);
      }

      const fieldMap: Record<string, string> = {
        serving_size: "serving_size",
        serving_unit: "serving_unit",
        calories: "calories",
        protein: "protein",
        carbs: "carbs",
        fat: "fat",
        saturated_fat: "saturated_fat",
        polyunsaturated_fat: "polyunsaturated_fat",
        monounsaturated_fat: "monounsaturated_fat",
        trans_fat: "trans_fat",
        cholesterol: "cholesterol",
        sodium: "sodium",
        potassium: "potassium",
        fiber: "dietary_fiber",
        sugar: "sugars",
        vitamin_a: "vitamin_a",
        vitamin_c: "vitamin_c",
        calcium: "calcium",
        iron: "iron",
        gi: "glycemic_index",
      };

      const updates: string[] = [];
      const values: unknown[] = [];
      for (const [inputField, dbField] of Object.entries(fieldMap)) {
        const value = (params as Record<string, unknown>)[inputField];
        if (value !== undefined) {
          values.push(value);
          updates.push(`${dbField} = $${values.length}`);
        }
      }

      if (updates.length === 0) {
        throw new Error("At least one nutritional or serving field must be provided for update_food_variant.");
      }

      values.push(variantId);
      const variantIdParam = values.length;

      const updatedVariant = await client.query(
        `UPDATE food_variants
         SET ${updates.join(", ")}, updated_at = NOW()
         WHERE id = $${variantIdParam}
         RETURNING id, food_id, serving_size, serving_unit, calories, protein, carbs, fat,
                   saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
                   cholesterol, sodium, potassium, dietary_fiber, sugars,
                   vitamin_a, vitamin_c, calcium, iron, glycemic_index, is_default, updated_at`,
        values
      );

      if (updatedVariant.rows.length === 0) {
        throw new Error(`Food variant "${variantId}" could not be updated.`);
      }

      let updatedEntriesCount = 0;
      if (params.update_existing_entries !== false) {
        const v = updatedVariant.rows[0];
        const updatedEntries = await client.query(
          `UPDATE food_entries
           SET serving_size = $1,
               serving_unit = $2,
               calories = $3,
               protein = $4,
               carbs = $5,
               fat = $6,
               saturated_fat = $7,
               polyunsaturated_fat = $8,
               monounsaturated_fat = $9,
               trans_fat = $10,
               cholesterol = $11,
               sodium = $12,
               potassium = $13,
               dietary_fiber = $14,
               sugars = $15,
               vitamin_a = $16,
               vitamin_c = $17,
               calcium = $18,
               iron = $19,
               glycemic_index = $20
           WHERE user_id = $21 AND variant_id = $22`,
          [
            v.serving_size,
            v.serving_unit,
            v.calories,
            v.protein,
            v.carbs,
            v.fat,
            v.saturated_fat,
            v.polyunsaturated_fat,
            v.monounsaturated_fat,
            v.trans_fat,
            v.cholesterol,
            v.sodium,
            v.potassium,
            v.dietary_fiber,
            v.sugars,
            v.vitamin_a,
            v.vitamin_c,
            v.calcium,
            v.iron,
            v.glycemic_index,
            userId,
            variantId,
          ]
        );
        updatedEntriesCount = updatedEntries.rowCount ?? 0;
      }

      await client.query("COMMIT");
      return {
        food_id: updatedVariant.rows[0].food_id,
        food_name: existing.rows[0].food_name,
        variant: updatedVariant.rows[0],
        updated_existing_entries: params.update_existing_entries !== false,
        updated_entries_count: updatedEntriesCount,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}


export async function updateEntry(
  userId: string,
  entryId: string,
  entryType: "food_entry" | "food_entry_meal",
  quantity: number,
  unit: string
): Promise<boolean> {
  return withClient(userId, async (client) => {
    const table = entryType === "food_entry" ? "food_entries" : "food_entry_meals";

    if (entryType === "food_entry") {
      const result = await client.query(
        `UPDATE food_entries SET quantity = $1, unit = $2 WHERE id = $3 RETURNING id`,
        [quantity, unit, entryId]
      );
      return (result.rowCount ?? 0) > 0;
    } else {
      const result = await client.query(
        `UPDATE food_entry_meals SET quantity = $1, unit = $2, updated_at = NOW() WHERE id = $3 RETURNING id`,
        [quantity, unit, entryId]
      );
      return (result.rowCount ?? 0) > 0;
    }
  });
}

export async function copyFromYesterday(
  userId: string,
  params: {
    target_date?: string;
    source_date?: string;
    meal_type?: string;
  }
): Promise<{ copied_count: number; target_date: string }> {
  const targetDate = params.target_date || getTodayDate();
  const sourceDate = params.source_date || getYesterdayDate();

  return withClient(userId, async (client) => {
    await client.query("BEGIN");
    try {
      let copiedCount = 0;

      // Build meal_type filter
      let mealTypeFilter = "";
      const baseParams: unknown[] = [sourceDate];
      if (params.meal_type) {
        const mealTypeId = await resolveMealTypeId(client, userId, params.meal_type);
        mealTypeFilter = " AND meal_type_id = $2";
        baseParams.push(mealTypeId);
      }

      // Copy food_entries (inline nutritional data) using INSERT INTO SELECT
      const insertFoodEntries = await client.query(
        `INSERT INTO food_entries (
           user_id, food_id, variant_id, entry_date, quantity, unit, meal_type_id,
           food_name, brand_name, serving_size, serving_unit,
           calories, protein, carbs, fat, saturated_fat, polyunsaturated_fat,
           monounsaturated_fat, trans_fat, cholesterol, sodium, potassium,
           dietary_fiber, sugars, vitamin_a, vitamin_c, calcium, iron, glycemic_index,
           created_at
         )
         SELECT 
           $1, food_id, variant_id, $2, quantity, unit, meal_type_id,
           food_name, brand_name, serving_size, serving_unit,
           calories, protein, carbs, fat, saturated_fat, polyunsaturated_fat,
           monounsaturated_fat, trans_fat, cholesterol, sodium, potassium,
           dietary_fiber, sugars, vitamin_a, vitamin_c, calcium, iron, glycemic_index,
           NOW()
         FROM food_entries
         WHERE user_id = $1 AND entry_date = $3${mealTypeFilter}`,
        [userId, targetDate, ...baseParams]
      );
      copiedCount += insertFoodEntries.rowCount ?? 0;

      // Copy food_entry_meals using INSERT INTO SELECT
      const insertMealEntries = await client.query(
        `INSERT INTO food_entry_meals (
           user_id, meal_template_id, entry_date, meal_type_id, quantity, unit, name, description, 
           created_by_user_id, updated_by_user_id, created_at, updated_at
         )
         SELECT 
           $1, meal_template_id, $2, meal_type_id, quantity, unit, name, description,
           $1, $1, NOW(), NOW()
         FROM food_entry_meals
         WHERE user_id = $1 AND entry_date = $3${mealTypeFilter}`,
        [userId, targetDate, ...baseParams]
      );
      copiedCount += insertMealEntries.rowCount ?? 0;

      await client.query("COMMIT");
      return { copied_count: copiedCount, target_date: targetDate };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function saveAsMealTemplate(
  userId: string,
  params: {
    entry_date: string;
    meal_type: string;
    meal_name: string;
    description?: string;
  }
): Promise<MealTemplate> {
  return withClient(userId, async (client) => {
    await client.query("BEGIN");
    try {
      // Resolve meal_type to get entries
      const mealTypeId = await resolveMealTypeId(client, userId, params.meal_type);

      // Get food entries for the date and meal type
      const entries = await client.query(
        `SELECT food_id, variant_id, quantity, unit
         FROM food_entries
         WHERE entry_date = $1 AND meal_type_id = $2`,
        [params.entry_date, mealTypeId]
      );

      if (entries.rows.length === 0) {
        throw new Error(`No food entries found for ${params.meal_type} on ${params.entry_date}.`);
      }

      // Create the meal template
      const mealResult = await client.query(
        `INSERT INTO meals (user_id, name, description, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id, user_id, name, description`,
        [userId, params.meal_name, params.description || null]
      );
      const meal = mealResult.rows[0];

      // Insert meal_foods — columns are quantity and unit (not servings)
      const foods: MealTemplate["foods"] = [];
      for (const entry of entries.rows) {
        await client.query(
          `INSERT INTO meal_foods (meal_id, food_id, variant_id, quantity, unit, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [meal.id, entry.food_id, entry.variant_id, entry.quantity, entry.unit || "g"]
        );

        // Get food name for response
        const foodInfo = await client.query("SELECT name FROM foods WHERE id = $1", [entry.food_id]);
        const variantInfo = entry.variant_id
          ? await client.query("SELECT serving_unit FROM food_variants WHERE id = $1", [entry.variant_id])
          : null;

        foods.push({
          food_id: entry.food_id,
          food_name: foodInfo.rows[0]?.name || "Unknown",
          variant_id: entry.variant_id || undefined,
          quantity: entry.quantity,
          unit: entry.unit || variantInfo?.rows[0]?.serving_unit || "serving",
        });
      }

      await client.query("COMMIT");

      return {
        id: meal.id,
        user_id: meal.user_id,
        name: meal.name,
        description: meal.description || undefined,
        foods,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

/**
 * Perform a cascade search lookup for food nutrition:
 * 1. Internal DB
 * 2. User's active configured external providers (USDA, FatSecret, Mealie, Tandoor, Norish)
 * 3. Free OpenFoodFacts provider
 * Returns the matched food details or null if not found (indicating AI estimation fallback).
 */
export async function lookupFoodNutrition(
  userId: string,
  foodName: string,
  providerType?: "internal" | "openfoodfacts" | "usda" | "fatsecret" | "mealie" | "tandoor" | "norish"
): Promise<{
  source: string;
  food: any | null;
  alternatives?: any[];
}> {
  // Step 1: Internal DB Search (unless another provider was explicitly requested)
  if (!providerType || providerType === "internal") {
    const internalExact = await searchFood(userId, foodName, "exact");
    if (internalExact.data.length > 0) {
      return {
        source: "internal",
        food: internalExact.data[0],
        alternatives: internalExact.data.slice(1),
      };
    }

    const internalBroad = await searchFood(userId, foodName, "broad");
    if (internalBroad.data.length > 0) {
      return {
        source: "internal",
        food: internalBroad.data[0],
        alternatives: internalBroad.data.slice(1),
      };
    }

    // If "internal" was explicitly requested and not found, stop here
    if (providerType === "internal") {
      return { source: "internal", food: null };
    }
  }

  // Obtain database client to query active providers and session tokens
  return withClient(userId, async (client) => {
    // Determine which providers to search
    let targetProviders: { id?: string; provider_type: string; provider_name: string }[] = [];

    if (providerType) {
      // Explicit provider requested
      if (providerType === "openfoodfacts") {
        targetProviders.push({ provider_type: "openfoodfacts", provider_name: "OpenFoodFacts" });
      } else {
        const provRes = await client.query(
          `SELECT id, provider_type, provider_name FROM external_data_providers
           WHERE user_id = $1 AND provider_type = $2 AND is_active = TRUE LIMIT 1`,
          [userId, providerType]
        );
        if (provRes.rows.length > 0) {
          targetProviders.push(provRes.rows[0]);
        } else {
          // Fallback to unconfigured search if the user explicitly asked but has no row
          targetProviders.push({ provider_type: providerType, provider_name: providerType });
        }
      }
    } else {
      // Cascade lookup: get all active providers for the user (filtered to food-related types)
      const activeRes = await client.query(
        `SELECT id, provider_type, provider_name FROM external_data_providers
         WHERE user_id = $1 AND is_active = TRUE 
         AND provider_type = ANY($2::text[])
         ORDER BY sort_order ASC NULLS LAST, created_at DESC`,
        [userId, FOOD_PROVIDER_TYPES]
      );
      targetProviders = activeRes.rows;

      // Add OpenFoodFacts as fallback at the end if not already present in configured providers
      if (!targetProviders.some((p) => p.provider_type === "openfoodfacts")) {
        targetProviders.push({ provider_type: "openfoodfacts", provider_name: "OpenFoodFacts" });
      }
    }

    // Retrieve a valid session token for authentication against the backend API
    const sessionRes = await client.query(
      `SELECT token FROM session 
       WHERE user_id = $1 AND expires_at > NOW() 
       ORDER BY expires_at DESC LIMIT 1`,
      [userId]
    );
    const sessionToken = sessionRes.rows[0]?.token;

    // Prepare auth headers for SparkyFitness Server request
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "Content-Type": "application/json",
    };
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
    } else if (process.env.SPARKY_FITNESS_API_KEY) {
      headers["x-api-key"] = process.env.SPARKY_FITNESS_API_KEY;
    } else if (process.env.Authorization) {
      headers["Authorization"] = process.env.Authorization;
    } else if (process.env.Cookie) {
      headers["Cookie"] = process.env.Cookie;
    }

    // Construct server URL using Docker/Local config
    const host = process.env.SPARKY_FITNESS_SERVER_HOST || "localhost";
    const port = process.env.SPARKY_FITNESS_SERVER_PORT || "3010";
    const baseUrl = `http://${host}:${port}`;

    // Loop through providers and perform searches sequentially until we find a match
    for (const provider of targetProviders) {
      try {
        console.log(`[Lookup Cascade] Querying external provider: ${provider.provider_name} (${provider.provider_type})`);
        const queryParams = new URLSearchParams({ query: foodName });
        if (provider.id) {
          queryParams.append("providerId", provider.id);
        }

        const url = `${baseUrl}/api/v2/foods/search/${provider.provider_type}?${queryParams.toString()}`;
        const response = await fetch(url, {
          method: "GET",
          headers,
        });

        if (response.ok) {
          const data: any = await response.json();
          if (data?.foods && data.foods.length > 0) {
            console.log(`[Lookup Cascade] Success! Match found in provider: ${provider.provider_name}`);
            return {
              source: provider.provider_type,
              food: data.foods[0],
              alternatives: data.foods.slice(1),
            };
          }
        } else {
          console.warn(`[Lookup Cascade] Provider search returned non-200 status: ${response.status} for provider: ${provider.provider_name}`);
        }
      } catch (err) {
        console.error(`[Lookup Cascade] Error searching provider ${provider.provider_name}:`, err);
      }
    }

    // Cascade failed to find any external result
    console.log(`[Lookup Cascade] No matches found in any provider for "${foodName}". Falling back to AI estimate.`);
    return {
      source: "ai_estimate",
      food: null,
    };
  });
}

