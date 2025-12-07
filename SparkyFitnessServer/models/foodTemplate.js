const { getClient } = require("../db/poolManager");
const { log } = require("../config/logging");
const format = require('pg-format');
const foodEntryDb = require('./foodEntry');
const foodEntryMealRepository = require('./foodEntryMealRepository');

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

    // 1. Identify food_entry_meals to delete (orphaned by this operation)
    const entryMealsQuery = `
      SELECT DISTINCT food_entry_meal_id
      FROM food_entries
      WHERE meal_plan_template_id = $1 AND user_id = $2 AND entry_date >= CURRENT_DATE AND food_entry_meal_id IS NOT NULL
    `;
    const entryMealsResult = await client.query(entryMealsQuery, params);
    const entryMealIds = entryMealsResult.rows.map(r => r.food_entry_meal_id);

    // 2. Delete the food entries
    const result = await client.query(query, params);

    // 3. Delete the orphaned food_entry_meals
    if (entryMealIds.length > 0) {
      await client.query(
        `DELETE FROM food_entry_meals WHERE id = ANY($1::uuid[])`,
        [entryMealIds]
      );
      log("info", `Deleted ${entryMealIds.length} orphaned food_entry_meals for template ${templateId}`);
    }

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

          const meal = mealsMap.get(assignment.meal_id);
          if (!meal) continue;

          const mealQuantity = assignment.quantity || 1.0;
          const mealUnit = assignment.unit || 'serving';

          log("info", `Creating food_entry_meal for meal ${meal.name} with quantity ${mealQuantity} ${mealUnit}`);

          // Create food_entry_meals record
          const foodEntryMealData = {
            user_id: userId,
            meal_template_id: assignment.meal_id,
            meal_type: assignment.meal_type.toLowerCase(),
            entry_date: currentDate.toISOString().split('T')[0],
            name: meal.name,
            description: meal.description || '',
            quantity: mealQuantity,
            unit: mealUnit,
            created_by_user_id: userId,
            updated_by_user_id: userId
          };

          const newFoodEntryMeal = await foodEntryMealRepository.createFoodEntryMeal(
            foodEntryMealData,
            userId
          );

          log("info", `Created food_entry_meal ${newFoodEntryMeal.id} for meal ${meal.name}`);

          // Calculate multiplier for scaling component foods
          const mealServingSize = meal.serving_size || 1.0;
          let multiplier = 1.0;
          if (mealUnit === 'serving' || mealUnit === meal.serving_unit) {
            multiplier = mealQuantity;
          } else {
            multiplier = mealQuantity / mealServingSize;
          }

          log("info", `Multiplier for meal scaling: ${multiplier} (quantity: ${mealQuantity}, serving_size: ${mealServingSize})`);

          for (const foodItem of mealFoods) {
            const variant = variantsMap.get(foodItem.variant_id);
            if (!variant) {
              log("warn", `Variant ${foodItem.variant_id} not found for food ${foodItem.food_id}`);
              continue;
            }

            const scaledQuantity = foodItem.quantity * multiplier;

            foodEntriesToInsert.push([
              userId,
              foodItem.food_id,
              assignment.meal_type.toLowerCase(),
              scaledQuantity,
              foodItem.unit,
              currentDate.toISOString().split('T')[0],
              foodItem.variant_id,
              templateId,
              foodItem.food_name,
              foodItem.brand_name,
              variant.serving_size,
              variant.serving_unit,
              variant.calories,
              variant.protein,
              variant.carbs,
              variant.fat,
              variant.saturated_fat,
              variant.polyunsaturated_fat,
              variant.monounsaturated_fat,
              variant.trans_fat,
              variant.cholesterol,
              variant.sodium,
              variant.potassium,
              variant.dietary_fiber,
              variant.sugars,
              variant.vitamin_a,
              variant.vitamin_c,
              variant.calcium,
              variant.iron,
              null,
              userId,
              newFoodEntryMeal.id
            ]);
          }
          log("info", `Created ${mealFoods.length} component food entries for food_entry_meal ${newFoodEntryMeal.id}`);
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
            variant.vitamin_a, variant.vitamin_c, variant.calcium, variant.iron, null, userId, null
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
                vitamin_a, vitamin_c, calcium, iron, meal_id, created_by_user_id, food_entry_meal_id
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