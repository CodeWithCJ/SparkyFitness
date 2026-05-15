import { withClient } from "../db/context.js";
import { normalizePagination, buildPaginatedResult } from "../utils/pagination.js";
import type { FoodItem, FoodEntry, MealTemplate, PaginatedResult } from "../types.js";

/**
 * Resolves a meal_type name (e.g., "breakfast") to its meal_type_id.
 * Creates the meal_type if it doesn't exist for the user.
 */
async function resolveMealTypeId(client: any, userId: string, mealTypeName: string): Promise<string> {
  const result = await client.query(
    "SELECT id FROM meal_types WHERE LOWER(name) = LOWER($1) AND (user_id = $2 OR user_id IS NULL) LIMIT 1",
    [mealTypeName, userId]
  );
  if (result.rows.length > 0) {
    return result.rows[0].id;
  }
  // Create the meal type for this user
  const insert = await client.query(
    "INSERT INTO meal_types (user_id, name) VALUES ($1, $2) RETURNING id",
    [userId, mealTypeName.charAt(0).toUpperCase() + mealTypeName.slice(1)]
  );
  return insert.rows[0].id;
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
        
        let multiplier: number;
        if (userUnit === "serving" || userUnit !== variantUnit) {
          // User is logging servings — each serving = the full variant macros
          multiplier = params.quantity;
        } else {
          // Units match (e.g. both "g") — scale proportionally
          multiplier = params.quantity / variantServingSize;
        }

        const scale = (val: unknown) => {
          const n = Number(val);
          return isNaN(n) ? null : Math.round(n * multiplier * 10) / 10;
        };

        nutritionData = {
          calories: scale(v.calories), protein: scale(v.protein),
          carbs: scale(v.carbs), fat: scale(v.fat),
          saturated_fat: scale(v.saturated_fat), polyunsaturated_fat: scale(v.polyunsaturated_fat),
          monounsaturated_fat: scale(v.monounsaturated_fat), trans_fat: scale(v.trans_fat),
          cholesterol: scale(v.cholesterol), sodium: scale(v.sodium), potassium: scale(v.potassium),
          dietary_fiber: scale(v.dietary_fiber), sugars: scale(v.sugars),
          vitamin_a: scale(v.vitamin_a), vitamin_c: scale(v.vitamin_c), calcium: scale(v.calcium),
          iron: scale(v.iron), glycemic_index: v.glycemic_index,
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
          params.quantity || (params.unit === "serving" ? 1 : 100),
          params.unit || "serving",
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
        const logQuantity = params.quantity || (params.unit === "serving" ? 1 : 100);
        const logUnit = params.unit || "serving";
        
        const variantServingSize = Number(variant.serving_size) || 1;
        const variantUnit = (variant.serving_unit || "serving").toLowerCase();
        const userUnit = (logUnit || "serving").toLowerCase();
        
        let multiplier: number;
        if (userUnit === "serving" || userUnit !== variantUnit) {
          multiplier = logQuantity;
        } else {
          multiplier = logQuantity / variantServingSize;
        }

        const scale = (val: unknown) => {
          const n = Number(val);
          return isNaN(n) ? null : Math.round(n * multiplier * 10) / 10;
        };

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
            scale(variant.calories), scale(variant.protein), scale(variant.carbs), scale(variant.fat),
            scale(variant.saturated_fat), scale(variant.polyunsaturated_fat), scale(variant.monounsaturated_fat),
            scale(variant.trans_fat), scale(variant.cholesterol), scale(variant.sodium), scale(variant.potassium),
            scale(variant.dietary_fiber), scale(variant.sugars), scale(variant.vitamin_a), scale(variant.vitamin_c),
            scale(variant.calcium), scale(variant.iron), variant.glycemic_index,
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
): Promise<{ food_entries: FoodEntry[]; meal_entries: any[] }> {
  const date = entryDate || getTodayDate();

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

    const foodEntries: FoodEntry[] = foodResult.rows.map((row: any) => ({
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
            calories: Math.round(Number(row.calories)),
            protein: Math.round((Number(row.protein) || 0) * 10) / 10,
            carbs: Math.round((Number(row.carbs) || 0) * 10) / 10,
            fat: Math.round((Number(row.fat) || 0) * 10) / 10,
          }
        : undefined,
    }));

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

    return { food_entries: foodEntries, meal_entries: mealEntries };
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

      // Copy food_entries (inline nutritional data)
      const foodEntries = await client.query(
        `SELECT food_id, variant_id, quantity, unit, meal_type_id,
                food_name, brand_name, serving_size, serving_unit,
                calories, protein, carbs, fat, saturated_fat, polyunsaturated_fat,
                monounsaturated_fat, trans_fat, cholesterol, sodium, potassium,
                dietary_fiber, sugars, vitamin_a, vitamin_c, calcium, iron, glycemic_index
         FROM food_entries
         WHERE entry_date = $1${mealTypeFilter}`,
        baseParams
      );

      for (const row of foodEntries.rows) {
        await client.query(
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
           )`,
          [
            userId, row.food_id, row.variant_id, targetDate, row.quantity, row.unit, row.meal_type_id,
            row.food_name, row.brand_name, row.serving_size, row.serving_unit,
            row.calories, row.protein, row.carbs, row.fat, row.saturated_fat, row.polyunsaturated_fat,
            row.monounsaturated_fat, row.trans_fat, row.cholesterol, row.sodium, row.potassium,
            row.dietary_fiber, row.sugars, row.vitamin_a, row.vitamin_c, row.calcium, row.iron, row.glycemic_index,
          ]
        );
        copiedCount++;
      }

      // Copy food_entry_meals
      const mealEntries = await client.query(
        `SELECT meal_template_id, quantity, unit, meal_type_id, name, description
         FROM food_entry_meals
         WHERE entry_date = $1${mealTypeFilter}`,
        baseParams
      );

      for (const row of mealEntries.rows) {
        await client.query(
          `INSERT INTO food_entry_meals (user_id, meal_template_id, entry_date, meal_type_id, quantity, unit, name, description, created_by_user_id, updated_by_user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $1, $1, NOW(), NOW())`,
          [userId, row.meal_template_id, targetDate, row.meal_type_id, row.quantity, row.unit, row.name, row.description]
        );
        copiedCount++;
      }

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
