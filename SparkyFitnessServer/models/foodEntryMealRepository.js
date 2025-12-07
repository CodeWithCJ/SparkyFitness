const { getClient } = require("../db/poolManager");
const { log } = require("../config/logging");

async function createFoodEntryMeal(foodEntryMealData, createdByUserId) {
    log("info", `createFoodEntryMeal in foodEntryMealRepository: foodEntryMealData: ${JSON.stringify(foodEntryMealData)}, createdByUserId: ${createdByUserId}`);
    const client = await getClient(createdByUserId);
    try {
        const result = await client.query(
            `INSERT INTO food_entry_meals (
                user_id, meal_template_id, meal_type, entry_date, name, description,
                quantity, unit,
                created_by_user_id, updated_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [
                foodEntryMealData.user_id,
                foodEntryMealData.meal_template_id,
                foodEntryMealData.meal_type,
                foodEntryMealData.entry_date,
                foodEntryMealData.name,
                foodEntryMealData.description,
                foodEntryMealData.quantity,
                foodEntryMealData.unit,
                createdByUserId,
                createdByUserId
            ]
        );
        return result.rows[0];
    } catch (error) {
        log("error", `Error creating food entry meal in repository:`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function updateFoodEntryMeal(foodEntryMealId, foodEntryMealData, updatedByUserId) {
    log("info", `updateFoodEntryMeal in foodEntryMealRepository: foodEntryMealId: ${foodEntryMealId}, foodEntryMealData: ${JSON.stringify(foodEntryMealData)}, updatedByUserId: ${updatedByUserId}`);
    const client = await getClient(updatedByUserId);
    log("info", `[DEBUG] Repo update params: quantity=${foodEntryMealData.quantity}, unit=${foodEntryMealData.unit}`); // DEBUG LOG
    try {
        const result = await client.query(
            `UPDATE food_entry_meals SET
                meal_template_id = $1,
                meal_type = COALESCE($2, meal_type),
                entry_date = COALESCE($3, entry_date),
                name = COALESCE($4, name),
                description = COALESCE($5, description),
                quantity = COALESCE($6, quantity),
                unit = COALESCE($7, unit),
                updated_at = CURRENT_TIMESTAMP,
                updated_by_user_id = $8
            WHERE id = $9
            RETURNING *`,
            [
                foodEntryMealData.meal_template_id,
                foodEntryMealData.meal_type,
                foodEntryMealData.entry_date,
                foodEntryMealData.name,
                foodEntryMealData.description,
                foodEntryMealData.quantity,
                foodEntryMealData.unit,
                updatedByUserId,
                foodEntryMealId
            ]
        );
        if (result.rows.length === 0) {
            throw new Error("Food entry meal not found or not authorized to update.");
        }
        return result.rows[0];
    } catch (error) {
        log("error", `Error updating food entry meal ${foodEntryMealId} in repository:`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function getFoodEntryMealById(foodEntryMealId, userId) {
    log("info", `getFoodEntryMealById in foodEntryMealRepository: foodEntryMealId: ${foodEntryMealId}, userId: ${userId}`);
    const client = await getClient(userId);
    try {
        const result = await client.query(
            `SELECT
                id, user_id, meal_template_id, meal_type, entry_date, name, description, quantity, unit,
                created_at, updated_at, created_by_user_id, updated_by_user_id
            FROM food_entry_meals
            WHERE id = $1`,
            [foodEntryMealId]
        );
        return result.rows[0];
    } catch (error) {
        log("error", `Error getting food entry meal ${foodEntryMealId} in repository:`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function getFoodEntryMealsByDate(userId, selectedDate) {
    log("info", `getFoodEntryMealsByDate in foodEntryMealRepository: userId: ${userId}, selectedDate: ${selectedDate}`);
    const client = await getClient(userId);
    try {
        const result = await client.query(
            `SELECT
                id, user_id, meal_template_id, meal_type, entry_date, name, description, quantity, unit,
                created_at, updated_at, created_by_user_id, updated_by_user_id
            FROM food_entry_meals
            WHERE user_id = $1 AND entry_date = $2
            ORDER BY created_at`,
            [userId, selectedDate]
        );
        return result.rows;
    } catch (error) {
        log("error", `Error getting food entry meals by date for user ${userId} on ${selectedDate} in repository:`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function deleteFoodEntryMeal(foodEntryMealId, userId) {
    log("info", `deleteFoodEntryMeal in foodEntryMealRepository: foodEntryMealId: ${foodEntryMealId}, userId: ${userId}`);
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
        log("error", `Error deleting food entry meal ${foodEntryMealId} in repository:`, error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    createFoodEntryMeal,
    updateFoodEntryMeal,
    getFoodEntryMealById,
    getFoodEntryMealsByDate,
    deleteFoodEntryMeal
};