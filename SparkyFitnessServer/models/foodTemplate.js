const { getClient } = require("../db/poolManager");
const { log } = require("../config/logging");

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

    while (currentDate <= lastDate) {
      const dayOfWeek = currentDate.getDay();
      const assignmentsForDay = assignments.filter(
        (a) => a.day_of_week === dayOfWeek
      );

      for (const assignment of assignmentsForDay) {
        let foodsToProcess = [];

        if (assignment.item_type === "meal") {
          // Meal foods are implicitly filtered by RLS on the meals table
          // when the meal_id is accessed.
          const mealFoodsResult = await client.query(
            `SELECT food_id, variant_id, quantity, unit FROM meal_foods WHERE meal_id = $1`,
            [assignment.meal_id]
          );
          foodsToProcess = mealFoodsResult.rows;
        } else if (assignment.item_type === "food") {
          foodsToProcess.push({
            food_id: assignment.food_id,
            variant_id: assignment.variant_id,
            quantity: assignment.quantity,
            unit: assignment.unit,
          });
        }

        for (const foodItem of foodsToProcess) {
          // Check for existing entry to prevent duplicates
          // Existing entries are implicitly filtered by RLS on food_entries table
          const existingEntry = await client.query(
            `SELECT id FROM food_entries
                         WHERE food_id = $1
                            AND meal_type = $2
                            AND entry_date = $3
                            AND variant_id = $4`,
            [
              foodItem.food_id,
              assignment.meal_type,
              currentDate,
              foodItem.variant_id,
            ]
          );

          if (existingEntry.rows.length === 0) {
            // Only insert if no duplicate exists
            const foodEntryData = [
              userId,
              foodItem.food_id,
              assignment.meal_type,
              foodItem.quantity,
              foodItem.unit,
              currentDate,
              foodItem.variant_id,
              templateId, // Still link to the template if it's a template-generated entry
            ];
            log(
              "info",
              `Inserting food entry for template ${templateId}, day ${
                currentDate.toISOString().split("T")[0]
              }:`,
              foodEntryData
            );
            await client.query(
              `INSERT INTO food_entries (user_id, food_id, meal_type, quantity, unit, entry_date, variant_id, meal_plan_template_id)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              foodEntryData
            );
          } else {
            log(
              "info",
              `Skipping duplicate food entry for template ${templateId}, day ${
                currentDate.toISOString().split("T")[0]
              }:`,
              existingEntry.rows[0].id
            );
          }
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
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