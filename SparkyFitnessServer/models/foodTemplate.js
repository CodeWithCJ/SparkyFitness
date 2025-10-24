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

    if (currentClientDate) {
      // Only delete from currentClientDate onwards
      query += ` AND entry_date >= $3`;
      params.push(currentClientDate);
    }

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

    // Collect all meal_ids and food_ids from assignments
    assignments.forEach(assignment => {
        if (assignment.item_type === "meal") {
            mealIds.add(assignment.meal_id);
        } else if (assignment.item_type === "food") {
            foodIds.add(assignment.food_id);
        }
    });

    // Fetch all meal foods in a single query
    const mealFoodsMap = new Map();
    if (mealIds.size > 0) {
        const mealFoodsResult = await client.query(
            `SELECT meal_id, food_id, variant_id, quantity, unit FROM meal_foods WHERE meal_id = ANY($1::uuid[])`,
            [Array.from(mealIds)]
        );
        mealFoodsResult.rows.forEach(row => {
            if (!mealFoodsMap.has(row.meal_id)) {
                mealFoodsMap.set(row.meal_id, []);
            }
            mealFoodsMap.get(row.meal_id).push(row);
        });
    }

    // Fetch all existing food entries for the relevant period to avoid duplicates
    const existingFoodEntries = new Set();
    const existingEntriesQuery = `
        SELECT food_id, meal_type, entry_date, variant_id
        FROM food_entries
        WHERE user_id = $1
          AND meal_plan_template_id = $2
          AND entry_date >= $3
          AND entry_date <= $4
    `;
    const existingEntriesResult = await client.query(existingEntriesQuery, [userId, templateId, currentDate, lastDate]);
    existingEntriesResult.rows.forEach(entry => {
        existingFoodEntries.add(`${entry.food_id}-${entry.meal_type}-${entry.entry_date.toISOString().split('T')[0]}-${entry.variant_id}`);
    });

    while (currentDate <= lastDate) {
        const dayOfWeek = currentDate.getDay();
        const assignmentsForDay = assignments.filter(
            (a) => a.day_of_week === dayOfWeek
        );

        for (const assignment of assignmentsForDay) {
            let foodsToProcess = [];

            if (assignment.item_type === "meal") {
                foodsToProcess = mealFoodsMap.get(assignment.meal_id) || [];
            } else if (assignment.item_type === "food") {
                foodsToProcess.push({
                    food_id: assignment.food_id,
                    variant_id: assignment.variant_id,
                    quantity: assignment.quantity,
                    unit: assignment.unit,
                });
            }

            for (const foodItem of foodsToProcess) {
                const entryKey = `${foodItem.food_id}-${assignment.meal_type}-${currentDate.toISOString().split('T')[0]}-${foodItem.variant_id}`;

                if (!existingFoodEntries.has(entryKey)) {
                    foodEntriesToInsert.push([
                        userId,
                        foodItem.food_id,
                        assignment.meal_type,
                        foodItem.quantity,
                        foodItem.unit,
                        currentDate,
                        foodItem.variant_id,
                        templateId,
                    ]);
                    existingFoodEntries.add(entryKey); // Add to set to prevent duplicates within the same batch
                } else {
                    log(
                        "info",
                        `Skipping duplicate food entry for template ${templateId}, day ${
                            currentDate.toISOString().split("T")[0]
                        }: ${entryKey}`
                    );
                }
            }
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    if (foodEntriesToInsert.length > 0) {
        const insertQuery = format(
            `INSERT INTO food_entries (user_id, food_id, meal_type, quantity, unit, entry_date, variant_id, meal_plan_template_id) VALUES %L`,
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