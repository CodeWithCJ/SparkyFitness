const { getClient } = require("../db/poolManager");
const { log } = require("../config/logging");
const format = require('pg-format');
const foodEntryDb = require('./foodEntry');

async function deleteFoodEntriesByMealPlanId(mealPlanId, userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      "DELETE FROM food_entries WHERE meal_plan_template_id = $1 AND user_id = $2 RETURNING id",
      [mealPlanId, userId]
    );
    return result.rowCount;
  } catch (error) {
    log(
      "error",
      `Error deleting food entries for meal plan ${mealPlanId}:`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}

async function deleteFoodEntriesByTemplateId(
  templateId,
  userId,
  currentClientDate = null
) {
  const client = await getClient(userId); // User-specific operation
  try {
    let query = `DELETE FROM food_entries WHERE meal_plan_template_id = $1 AND user_id = $2`;
    const params = [templateId, userId];

    // Only delete from today onwards
    query += ` AND entry_date >= CURRENT_DATE`;

    const result = await client.query(query, params);
    return result.rowCount;
  } catch (error) {
    log(
      "error",
      `Error deleting food entries for template ${templateId}:`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}

async function createFoodEntriesFromTemplate(
  templateId,
  userId,
  currentClientDate = null
) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query("BEGIN");
    log(
      "info",
      `Creating food entries from template ${templateId} for user ${userId}`
    );

    const templateQuery = `
            SELECT
                t.start_date,
                t.end_date,
                COALESCE(
                    (
                        SELECT json_agg(
                            json_build_object(
                                'day_of_week', a.day_of_week,
                                'meal_type', a.meal_type,
                                'item_type', a.item_type,
                                'meal_id', a.meal_id,
                                'food_id', a.food_id,
                                'variant_id', a.variant_id,
                                'quantity', a.quantity,
                                'unit', a.unit
                            )
                        )
                        FROM meal_plan_template_assignments a
                        WHERE a.template_id = t.id
                    ),
                    '[]'::json
                ) as assignments
            FROM meal_plan_templates t
            WHERE t.id = $1 AND t.user_id = $2
        `;
    const templateResult = await client.query(templateQuery, [
      templateId,
      userId,
    ]);
    if (templateResult.rows.length === 0) {
      throw new Error("Meal plan template not found or access denied.");
    }

    const { start_date, end_date, assignments } = templateResult.rows[0];
    if (!assignments || assignments.length === 0) {
      log(
        "info",
        `No assignments for template ${templateId}, skipping food entry creation.`
      );
      await client.query("COMMIT");
      return;
    }

    // Determine the effective "today" based on currentClientDate or server's local date
    const today = currentClientDate ? new Date(currentClientDate) : new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day

    let currentDate = new Date(start_date);
    currentDate.setHours(0, 0, 0, 0); // Normalize template start_date to start of day

    // Start from today if template start_date is in the past
    if (currentDate < today) {
      currentDate = today;
    }

    const lastDate = new Date(end_date);
    lastDate.setHours(0, 0, 0, 0); // Normalize template end_date to start of day

    const foodEntriesToInsert = [];
    const mealIds = new Set();
    const foodIds = new Set();
    const variantIds = new Set();

    assignments.forEach(assignment => {
        if (assignment.item_type === "meal") {
            mealIds.add(assignment.meal_id);
            foodIds.add(assignment.meal_id);
        } else if (assignment.item_type === "food") {
            foodIds.add(assignment.food_id);
            if (assignment.variant_id) {
                variantIds.add(assignment.variant_id);
            }
        }
    });

    const mealFoodsMap = new Map();
    if (mealIds.size > 0) {
        const mealFoodsResult = await client.query(
            `SELECT mf.meal_id, mf.food_id, mf.variant_id, mf.quantity, mf.unit, f.name as food_name, f.brand as brand_name, fv.*
             FROM meal_foods mf
             JOIN foods f ON mf.food_id = f.id
             JOIN food_variants fv ON mf.variant_id = fv.id
             WHERE mf.meal_id = ANY($1::uuid[])`,
            [Array.from(mealIds)]
        );
        mealFoodsResult.rows.forEach(row => {
            if (!mealFoodsMap.has(row.meal_id)) {
                mealFoodsMap.set(row.meal_id, []);
            }
            mealFoodsMap.get(row.meal_id).push(row);
            foodIds.add(row.food_id);
            if (row.variant_id) {
                variantIds.add(row.variant_id);
            }
        });
    }

    const foodsMap = new Map();
    if (foodIds.size > 0) {
        const foodsResult = await client.query(`SELECT * FROM foods WHERE id = ANY($1::uuid[])`, [Array.from(foodIds)]);
        foodsResult.rows.forEach(row => foodsMap.set(row.id, row));
    }

    const mealsMap = new Map();
    if (mealIds.size > 0) {
        const mealsResult = await client.query(`SELECT * FROM meals WHERE id = ANY($1::uuid[])`, [Array.from(mealIds)]);
        mealsResult.rows.forEach(row => mealsMap.set(row.id, row));
    }

    const variantsMap = new Map();
    if (variantIds.size > 0) {
        const variantsResult = await client.query(`SELECT * FROM food_variants WHERE id = ANY($1::uuid[])`, [Array.from(variantIds)]);
        variantsResult.rows.forEach(row => variantsMap.set(row.id, row));
    }

    const existingFoodEntries = new Set();
    const existingEntriesQuery = `
        SELECT food_id, meal_id, meal_type, entry_date, variant_id
        FROM food_entries
        WHERE user_id = $1
          AND meal_plan_template_id = $2
          AND entry_date >= $3
          AND entry_date <= $4
    `;
    const existingEntriesResult = await client.query(existingEntriesQuery, [userId, templateId, currentDate, lastDate]);
    existingEntriesResult.rows.forEach(entry => {
        const key = `${entry.food_id || entry.meal_id}-${entry.meal_type}-${entry.entry_date.toISOString().split('T')[0]}-${entry.variant_id}`;
        existingFoodEntries.add(key);
    });

    while (currentDate <= lastDate) {
        const dayOfWeek = currentDate.getDay();
        const assignmentsForDay = assignments.filter(a => a.day_of_week === dayOfWeek);

        for (const assignment of assignmentsForDay) {
            if (assignment.item_type === "meal") {
                const mealFoods = mealFoodsMap.get(assignment.meal_id) || [];
                if (mealFoods.length === 0) continue;

                const entryKey = `${assignment.meal_id}-${assignment.meal_type}-${currentDate.toISOString().split('T')[0]}-null`;
                if (existingFoodEntries.has(entryKey)) continue;

                let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
                mealFoods.forEach(foodItem => {
                    const variant = variantsMap.get(foodItem.variant_id);
                    if (variant) {
                        const multiplier = foodItem.quantity / variant.serving_size;
                        totalCalories += (variant.calories || 0) * multiplier;
                        totalProtein += (variant.protein || 0) * multiplier;
                        totalCarbs += (variant.carbs || 0) * multiplier;
                        totalFat += (variant.fat || 0) * multiplier;
                    }
                });

                const meal = mealsMap.get(assignment.meal_id);
                if (meal) {
                    foodEntriesToInsert.push([
                        userId, null, assignment.meal_type.toLowerCase(), 1, 'meal', currentDate.toISOString().split('T')[0], null, templateId,
                        meal.name, 'Meal', 1, 'meal',
                        totalCalories, totalProtein, totalCarbs, totalFat,
                        null, null, null, null, null, null, null, null, null, null, null, null, null, assignment.meal_id, userId
                    ]);
                }
                existingFoodEntries.add(entryKey);

            } else if (assignment.item_type === "food") {
                const food = foodsMap.get(assignment.food_id);
                const variant = variantsMap.get(assignment.variant_id);
                if (!food || !variant) continue;

                const entryKey = `${assignment.food_id}-${assignment.meal_type}-${currentDate.toISOString().split('T')[0]}-${assignment.variant_id}`;
                if (existingFoodEntries.has(entryKey)) continue;

                foodEntriesToInsert.push([
                    userId, assignment.food_id, assignment.meal_type.toLowerCase(), assignment.quantity, assignment.unit, currentDate.toISOString().split('T')[0], assignment.variant_id, templateId,
                    food.name, food.brand, variant.serving_size, variant.serving_unit,
                    variant.calories, variant.protein, variant.carbs, variant.fat,
                    variant.saturated_fat, variant.polyunsaturated_fat, variant.monounsaturated_fat, variant.trans_fat,
                    variant.cholesterol, variant.sodium, variant.potassium, variant.dietary_fiber, variant.sugars,
                    variant.vitamin_a, variant.vitamin_c, variant.calcium, variant.iron, null, userId
                ]);
                existingFoodEntries.add(entryKey);
            }
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    if (foodEntriesToInsert.length > 0) {
        const insertQuery = format(
            `INSERT INTO food_entries (
                user_id, food_id, meal_type, quantity, unit, entry_date, variant_id, meal_plan_template_id,
                food_name, brand_name, serving_size, serving_unit,
                calories, protein, carbs, fat,
                saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
                cholesterol, sodium, potassium, dietary_fiber, sugars,
                vitamin_a, vitamin_c, calcium, iron, meal_id, created_by_user_id
            ) VALUES %L`,
            foodEntriesToInsert
        );
        await client.query(insertQuery);
        log("info", `Inserted ${foodEntriesToInsert.length} food entries for template ${templateId}`);
    } else {
        log("info", `No new food entries to insert for template ${templateId}`);
    }

    await client.query("COMMIT");
    log(
        "info",
        `Successfully created food entries from template ${templateId}`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    log(
      "error",
      `Error creating food entries from template ${templateId}: ${error.message}`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  deleteFoodEntriesByMealPlanId,
  deleteFoodEntriesByTemplateId,
  createFoodEntriesFromTemplate,
};