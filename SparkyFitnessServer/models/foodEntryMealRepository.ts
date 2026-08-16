import { getClient } from '../db/poolManager.js';
import { toImageArray } from '../utils/imageLocalizer.js';
import { log } from '../config/logging.js';

/**
 * Fields accepted when creating or updating a logged meal.
 *
 * `meal_type` is the human name (e.g. "Breakfast") and is resolved to a
 * `meal_type_id` when the id is not supplied directly.
 */
interface FoodEntryMealInput {
  user_id: string;
  meal_template_id?: string | null;
  meal_type_id?: string | null;
  meal_type?: string | null;
  entry_date: string;
  entry_time?: string | null;
  name: string;
  description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  legacy_serving_unit_math?: boolean;
}

/** The subset of fields an update may change. */
type FoodEntryMealUpdate = Partial<FoodEntryMealInput>;

async function createFoodEntryMeal(
  foodEntryMealData: FoodEntryMealInput,
  createdByUserId: string
) {
  log(
    'info',
    `createFoodEntryMeal in foodEntryMealRepository: foodEntryMealData: ${JSON.stringify(foodEntryMealData)}, createdByUserId: ${createdByUserId}`
  );
  const client = await getClient(foodEntryMealData.user_id, createdByUserId);
  try {
    let mealTypeId = foodEntryMealData.meal_type_id;
    if (!mealTypeId && foodEntryMealData.meal_type) {
      const typeRes = await client.query(
        'SELECT id FROM meal_types WHERE LOWER(name) = LOWER($1)',
        [foodEntryMealData.meal_type]
      );
      if (typeRes.rows.length > 0) {
        mealTypeId = typeRes.rows[0].id;
      } else {
        throw new Error(`Invalid meal type: ${foodEntryMealData.meal_type}`);
      }
    }
    // Snapshot the template's photo onto the logged meal, mirroring how the
    // nutrition of its components is snapshotted: editing the template later
    // must not rewrite what past entries show. Ad-hoc logged meals have no
    // template and simply keep an empty array.
    const result = await client.query(
      `INSERT INTO food_entry_meals (
                user_id, meal_template_id, meal_type_id, entry_date, entry_time, name, description,
                quantity, unit, legacy_serving_unit_math,
                created_by_user_id, updated_by_user_id, images
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
              COALESCE(
                (SELECT m.images FROM meals m WHERE m.id = $2),
                '[]'::jsonb
              )
            )
            RETURNING *`,
      [
        foodEntryMealData.user_id,
        foodEntryMealData.meal_template_id,
        mealTypeId,
        foodEntryMealData.entry_date,
        foodEntryMealData.entry_time ?? null,
        foodEntryMealData.name,
        foodEntryMealData.description,
        foodEntryMealData.quantity,
        foodEntryMealData.unit,
        foodEntryMealData.legacy_serving_unit_math ?? false,
        createdByUserId,
        createdByUserId,
      ]
    );
    return result.rows[0];
  } catch (error) {
    log('error', 'Error creating food entry meal in repository:', error);
    throw error;
  } finally {
    client.release();
  }
}
async function updateFoodEntryMeal(
  foodEntryMealId: string,
  foodEntryMealData: FoodEntryMealUpdate,
  updatedByUserId: string
) {
  log(
    'info',
    `updateFoodEntryMeal in foodEntryMealRepository: foodEntryMealId: ${foodEntryMealId}, foodEntryMealData: ${JSON.stringify(foodEntryMealData)}, updatedByUserId: ${updatedByUserId}`
  );
  const client = await getClient(updatedByUserId);
  log(
    'info',
    `[DEBUG] Repo update params: quantity=${foodEntryMealData.quantity}, unit=${foodEntryMealData.unit}`
  ); // DEBUG LOG
  try {
    let mealTypeId = foodEntryMealData.meal_type_id;
    if (!mealTypeId && foodEntryMealData.meal_type) {
      const typeRes = await client.query(
        'SELECT id FROM meal_types WHERE LOWER(name) = LOWER($1)',
        [foodEntryMealData.meal_type]
      );
      if (typeRes.rows.length > 0) mealTypeId = typeRes.rows[0].id;
    }
    const result = await client.query(
      `UPDATE food_entry_meals SET
                meal_template_id = $1,
                meal_type_id = COALESCE($2, meal_type_id),
                entry_date = COALESCE($3, entry_date),
                name = COALESCE($4, name),
                description = COALESCE($5, description),
                quantity = COALESCE($6, quantity),
                unit = COALESCE($7, unit),
                -- COALESCE cannot clear a value; $10 flags whether entry_time
                -- was provided so an explicit null clears it.
                entry_time = CASE WHEN $10::boolean THEN $11::time ELSE entry_time END,
                updated_at = CURRENT_TIMESTAMP,
                updated_by_user_id = $8
            WHERE id = $9
            RETURNING *`,
      [
        foodEntryMealData.meal_template_id,
        mealTypeId,
        foodEntryMealData.entry_date,
        foodEntryMealData.name,
        foodEntryMealData.description,
        foodEntryMealData.quantity,
        foodEntryMealData.unit,
        updatedByUserId,
        foodEntryMealId,
        foodEntryMealData.entry_time !== undefined,
        foodEntryMealData.entry_time ?? null,
      ]
    );
    if (result.rows.length === 0) {
      throw new Error('Food entry meal not found or not authorized to update.');
    }
    return result.rows[0];
  } catch (error) {
    log(
      'error',
      `Error updating food entry meal ${foodEntryMealId} in repository:`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
async function getFoodEntryMealById(foodEntryMealId: string, userId: string) {
  log(
    'info',
    `getFoodEntryMealById in foodEntryMealRepository: foodEntryMealId: ${foodEntryMealId}, userId: ${userId}`
  );
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
            fem.id,
            fem.user_id,
            fem.meal_template_id,
            mt.name as meal_type,
            fem.meal_type_id,
            fem.entry_date,
            fem.entry_time,
            fem.name,
            fem.description,
            fem.quantity,
            fem.unit,
            fem.legacy_serving_unit_math,
            fem.created_at,
            fem.updated_at,
            fem.created_by_user_id,
            fem.updated_by_user_id,
            -- Per-entry override photo, plus the meal template's own images so
            -- the diary can fall back when this entry has no override.
            fem.images,
            m.images AS meal_images
            FROM food_entry_meals fem
            LEFT JOIN meal_types mt ON fem.meal_type_id = mt.id
            LEFT JOIN meals m ON fem.meal_template_id = m.id
            WHERE fem.id = $1`,
      [foodEntryMealId]
    );
    return result.rows[0];
  } catch (error) {
    log(
      'error',
      `Error getting food entry meal ${foodEntryMealId} in repository:`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
async function getFoodEntryMealsByDate(userId: string, selectedDate: string) {
  log(
    'debug',
    `getFoodEntryMealsByDate in foodEntryMealRepository: userId: ${userId}, selectedDate: ${selectedDate}`
  );
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
            fem.id,
            fem.user_id,
            fem.meal_template_id,
            mt.name as meal_type,
            fem.meal_type_id,
            fem.entry_date,
            fem.entry_time,
            fem.name,
            fem.description,
            fem.quantity,
            fem.unit,
            fem.legacy_serving_unit_math,
            fem.created_at,
            fem.updated_at,
            fem.created_by_user_id,
            fem.updated_by_user_id,
            -- Per-entry override photo, plus the meal template's own images so
            -- the diary can fall back when this entry has no override.
            fem.images,
            m.images AS meal_images
            FROM food_entry_meals fem
            LEFT JOIN meal_types mt ON fem.meal_type_id = mt.id
            LEFT JOIN meals m ON fem.meal_template_id = m.id
            WHERE fem.user_id = $1 AND fem.entry_date = $2
            ORDER BY mt.sort_order ASC, fem.entry_time ASC NULLS LAST, fem.created_at ASC`,
      [userId, selectedDate]
    );
    return result.rows;
  } catch (error) {
    log(
      'error',
      `Error getting food entry meals by date for user ${userId} on ${selectedDate} in repository:`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
// Flat meal-container rows for a date range. Backs the chatbot
// sparky_get_food_diary tool (per-date reads use getFoodEntryMealsByDate).
async function getFoodEntryMealsByDateRange(
  userId: string,
  startDate: string,
  endDate: string
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT fem.*, mt.name AS meal_type
       FROM food_entry_meals fem
       LEFT JOIN meal_types mt ON fem.meal_type_id = mt.id
       WHERE fem.user_id = $1 AND fem.entry_date BETWEEN $2 AND $3
       ORDER BY fem.entry_date ASC, fem.created_at ASC`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function deleteFoodEntryMeal(foodEntryMealId: string, userId: string) {
  log(
    'info',
    `deleteFoodEntryMeal in foodEntryMealRepository: foodEntryMealId: ${foodEntryMealId}, userId: ${userId}`
  );
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `DELETE FROM food_entry_meals
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
      [foodEntryMealId, userId]
    );
    return result.rowCount > 0;
  } catch (error) {
    log(
      'error',
      `Error deleting food entry meal ${foodEntryMealId} in repository:`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
// Result of a metadata-only meal-type move.
export interface MealEntryMoveResult {
  id: string;
  meal_type_id: string;
}

// Metadata-only move of a meal container (and its component food_entries) to
// another meal type, in one transaction. Unlike updateFoodEntryMeal, this
// does NOT delete and rebuild the components, so historical nutrition
// snapshots and quantities are preserved untouched.
async function moveFoodEntryMealToMealType(
  foodEntryMealId: string,
  mealTypeId: string,
  userId: string,
  updatedByUserId: string
): Promise<MealEntryMoveResult> {
  log(
    'info',
    `moveFoodEntryMealToMealType in foodEntryMealRepository: foodEntryMealId: ${foodEntryMealId}, mealTypeId: ${mealTypeId}, userId: ${userId}`
  );
  const client = await getClient(userId, updatedByUserId);
  try {
    await client.query('BEGIN');
    const parent = await client.query(
      `UPDATE food_entry_meals
       SET meal_type_id = $1,
           updated_by_user_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING id, meal_type_id`,
      [mealTypeId, updatedByUserId, foodEntryMealId, userId]
    );
    if (parent.rows.length === 0) {
      throw new Error('Food entry meal not found or not authorized to update.');
    }
    await client.query(
      `UPDATE food_entries
       SET meal_type_id = $1,
           updated_by_user_id = $2
       WHERE food_entry_meal_id = $3 AND user_id = $4`,
      [mealTypeId, updatedByUserId, foodEntryMealId, userId]
    );
    await client.query('COMMIT');
    return parent.rows[0] as MealEntryMoveResult;
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Error moving food entry meal ${foodEntryMealId} to meal type ${mealTypeId} in repository:`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
/**
 * Replaces a logged meal's per-entry override photos.
 *
 * Scoped by user_id so a caller cannot retarget another user's entry. Passing
 * an empty array clears the override, restoring the meal template's images as
 * the fallback; the template itself is never modified.
 */
async function setFoodEntryMealImages(
  foodEntryMealId: string,
  userId: string,
  images: string[]
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE food_entry_meals
         SET images = $3::jsonb, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, images`,
      [foodEntryMealId, userId, JSON.stringify(toImageArray(images))]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

export { setFoodEntryMealImages };
export { createFoodEntryMeal };
export { updateFoodEntryMeal };
export { getFoodEntryMealById };
export { getFoodEntryMealsByDate };
export { getFoodEntryMealsByDateRange };
export { deleteFoodEntryMeal };
export { moveFoodEntryMealToMealType };
export default {
  setFoodEntryMealImages,
  createFoodEntryMeal,
  updateFoodEntryMeal,
  getFoodEntryMealById,
  getFoodEntryMealsByDate,
  getFoodEntryMealsByDateRange,
  deleteFoodEntryMeal,
  moveFoodEntryMealToMealType,
};
