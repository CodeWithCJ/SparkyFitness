const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');
const format = require('pg-format');

// --- Meal Template CRUD Operations ---

async function createMeal(mealData) {
  const client = await getClient(mealData.user_id); // User-specific operation
  try {
    await client.query('BEGIN');

    const mealResult = await client.query(
      `INSERT INTO meals (user_id, name, description, is_public, serving_size, serving_unit, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now()) RETURNING id, user_id, name, description, is_public, serving_size, serving_unit, created_at, updated_at`,
      [mealData.user_id, mealData.name, mealData.description, mealData.is_public, mealData.serving_size, mealData.serving_unit]
    );
    const newMeal = mealResult.rows[0];

    if (mealData.foods && mealData.foods.length > 0) {
      const mealFoodsValues = mealData.foods.map(food => [
        newMeal.id, food.food_id, food.variant_id, food.quantity, food.unit, 'now()', 'now()'
      ]);
      const mealFoodsQuery = format(
        `INSERT INTO meal_foods (meal_id, food_id, variant_id, quantity, unit, created_at, updated_at) VALUES %L RETURNING id`,
        mealFoodsValues
      );
      await client.query(mealFoodsQuery);
    }

    await client.query('COMMIT');
    return newMeal;
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', `Error creating meal:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function getMeals(userId, filter = 'all') {
  const client = await getClient(userId); // User-specific operation
  try {
    let query = `
      SELECT id, user_id, name, description, is_public, serving_size, serving_unit, created_at, updated_at
      FROM meals
      WHERE 1=1`; // Start with a true condition to easily append AND clauses
    const queryParams = [];

    if (filter === 'mine') {
      query += ` AND user_id = $1`;
      queryParams.push(userId);
    } else if (filter === 'all') {
      // 'all' means user's own meals and public meals
      query += ` AND (user_id = $1 OR is_public = TRUE)`;
      queryParams.push(userId);
    }
    // For 'family' and 'public' filters, separate functions will be called in mealService

    query += ` ORDER BY name ASC`;

    const result = await client.query(query, queryParams);
    const meals = result.rows;

    // For each meal, fetch its associated foods
    for (const meal of meals) {
      const mealFoodsResult = await client.query(
        `SELECT mf.id, mf.food_id, mf.variant_id, mf.quantity, mf.unit,
                f.name AS food_name, f.brand,
                fv.serving_size, fv.serving_unit, fv.calories, fv.protein, fv.carbs, fv.fat
         FROM meal_foods mf
         JOIN foods f ON mf.food_id = f.id
         LEFT JOIN food_variants fv ON mf.variant_id = fv.id
         WHERE mf.meal_id = $1`,
        [meal.id]
      );
      meal.foods = mealFoodsResult.rows;
    }

    return meals;
  } finally {
    client.release();
  }
}

async function searchMeals(searchTerm, userId, limit = null) {
  const client = await getClient(userId); // User-specific operation
  try {
    let query = `
      SELECT id, user_id, name, description, is_public, serving_size, serving_unit
      FROM meals
      WHERE name ILIKE '%' || $1 || '%'
      ORDER BY name ASC`;
    const queryParams = [searchTerm];

    if (limit !== null) {
      query += ` LIMIT $3`;
      queryParams.push(limit);
    }

    const result = await client.query(query, queryParams);
    const meals = result.rows;

    // For each meal, fetch its associated foods
    for (const meal of meals) {
      const mealFoodsResult = await client.query(
        `SELECT mf.id, mf.food_id, mf.variant_id, mf.quantity, mf.unit,
                f.name AS food_name, f.brand,
                fv.serving_size, fv.serving_unit, fv.calories, fv.protein, fv.carbs, fv.fat
         FROM meal_foods mf
         JOIN foods f ON mf.food_id = f.id
         LEFT JOIN food_variants fv ON mf.variant_id = fv.id
         WHERE mf.meal_id = $1`,
        [meal.id]
      );
      meal.foods = mealFoodsResult.rows;
    }
    return meals;
  } finally {
    client.release();
  }
}

async function getMealById(mealId, userId) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const mealResult = await client.query(
      `SELECT id, user_id, name, description, is_public, serving_size, serving_unit, created_at, updated_at
       FROM meals WHERE id = $1`,
      [mealId]
    );
    const meal = mealResult.rows[0];

    if (meal) {
      const mealFoodsResult = await client.query(
        `SELECT mf.id, mf.food_id, mf.variant_id, mf.quantity, mf.unit,
                f.name AS food_name, f.brand,
                fv.serving_size, fv.serving_unit, fv.calories, fv.protein, fv.carbs, fv.fat
         FROM meal_foods mf
         JOIN foods f ON mf.food_id = f.id
         LEFT JOIN food_variants fv ON mf.variant_id = fv.id
         WHERE mf.meal_id = $1`,
        [mealId]
      );
      meal.foods = mealFoodsResult.rows;
    }
    return meal;
  } finally {
    client.release();
  }
}

async function updateMeal(mealId, userId, updateData) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE meals SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        is_public = COALESCE($3, is_public),
        serving_size = COALESCE($4, serving_size),
        serving_unit = COALESCE($5, serving_unit),
        updated_at = now()
       WHERE id = $6
       RETURNING id, user_id, name, description, is_public, serving_size, serving_unit, created_at, updated_at`,
      [updateData.name, updateData.description, updateData.is_public, updateData.serving_size, updateData.serving_unit, mealId]
    );
    const updatedMeal = result.rows[0];

    if (updatedMeal && updateData.foods !== undefined) {
      // Delete existing meal_foods for this meal
      await client.query('DELETE FROM meal_foods WHERE meal_id = $1', [mealId]);

      // Insert new meal_foods
      if (updateData.foods.length > 0) {
        const mealFoodsValues = updateData.foods.map(food => [
          mealId, food.food_id, food.variant_id, food.quantity, food.unit, 'now()', 'now()'
        ]);
        const mealFoodsQuery = format(
          `INSERT INTO meal_foods (meal_id, food_id, variant_id, quantity, unit, created_at, updated_at) VALUES %L RETURNING id`,
          mealFoodsValues
        );
        await client.query(mealFoodsQuery);
      }
    }

    await client.query('COMMIT');
    return updatedMeal;
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', `Error updating meal ${mealId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function deleteMeal(mealId, userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query('BEGIN');
    // meal_foods will be cascade deleted due to ON DELETE CASCADE on meal_id
    const result = await client.query(
      'DELETE FROM meals WHERE id = $1 RETURNING id',
      [mealId]
    );
    await client.query('COMMIT');
    return result.rowCount > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', `Error deleting meal ${mealId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

// --- Meal Plan CRUD Operations ---

async function createMealPlanEntry(planData) {
  const client = await getClient(planData.user_id); // User-specific operation
  try {
    const result = await client.query(
      `INSERT INTO meal_plans (user_id, meal_id, food_id, variant_id, quantity, unit, plan_date, meal_type, is_template, template_name, day_of_week, meal_plan_template_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now()) RETURNING *`,
      [
        planData.user_id, planData.meal_id, planData.food_id, planData.variant_id,
        planData.quantity, planData.unit, planData.plan_date, planData.meal_type,
        planData.is_template, planData.template_name, planData.day_of_week, planData.meal_plan_template_id
      ]
    );
    return result.rows[0];
  } catch (error) {
    log('error', `Error creating meal plan entry:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function getMealPlanEntries(userId, startDate, endDate) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
        mp.id, mp.user_id, mp.meal_id, mp.food_id, mp.variant_id, mp.quantity, mp.unit,
        mp.plan_date, mp.meal_type, mp.is_template, mp.template_name, mp.day_of_week,
        m.name AS meal_name, m.description AS meal_description,
        f.name AS food_name, f.brand AS food_brand,
        fv.serving_size, fv.serving_unit, fv.calories, fv.protein, fv.carbs, fv.fat
       FROM meal_plans mp
       LEFT JOIN meals m ON mp.meal_id = m.id
       LEFT JOIN foods f ON mp.food_id = f.id
       LEFT JOIN food_variants fv ON mp.variant_id = fv.id
       WHERE mp.plan_date BETWEEN $1 AND $2
       ORDER BY mp.plan_date, mp.meal_type`,
      [startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function updateMealPlanEntry(planId, userId, updateData) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE meal_plans SET
        meal_id = COALESCE($1, meal_id),
        food_id = COALESCE($2, food_id),
        variant_id = COALESCE($3, variant_id),
        quantity = COALESCE($4, quantity),
        unit = COALESCE($5, unit),
        plan_date = COALESCE($6, plan_date),
        meal_type = COALESCE($7, meal_type),
        is_template = COALESCE($8, is_template),
        template_name = COALESCE($9, template_name),
        day_of_week = COALESCE($10, day_of_week),
        meal_plan_template_id = COALESCE($11, meal_plan_template_id),
        updated_at = now()
       WHERE id = $12
       RETURNING *`,
      [
        updateData.meal_id, updateData.food_id, updateData.variant_id,
        updateData.quantity, updateData.unit, updateData.plan_date, updateData.meal_type,
        updateData.is_template, updateData.template_name, updateData.day_of_week,
        updateData.meal_plan_template_id, planId
      ]
    );
    return result.rows[0];
  } catch (error) {
    log('error', `Error updating meal plan entry ${planId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function deleteMealPlanEntry(planId, userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM meal_plans WHERE id = $1 RETURNING id',
      [planId]
    );
    return result.rowCount > 0;
  } catch (error) {
    log('error', `Error deleting meal plan entry ${planId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function getMealPlanEntryById(planId, userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
        mp.id, mp.user_id, mp.meal_id, mp.food_id, mp.variant_id, mp.quantity, mp.unit,
        mp.plan_date, mp.meal_type,
        m.name AS meal_name,
        f.name AS food_name
       FROM meal_plans mp
       LEFT JOIN meals m ON mp.meal_id = m.id
       LEFT JOIN foods f ON mp.food_id = f.id
       WHERE mp.id = $1`,
      [planId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// --- Helper for logging meal plan to food entries ---

async function createFoodEntryFromMealPlan(entryData) {
  const client = await getClient(entryData.user_id); // User-specific operation
  try {
    const result = await client.query(
      `INSERT INTO food_entries (user_id, food_id, meal_type, quantity, unit, entry_date, variant_id, meal_plan_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING *`,
      [
        entryData.user_id, entryData.food_id, entryData.meal_type, entryData.quantity,
        entryData.unit, entryData.entry_date, entryData.variant_id, entryData.meal_plan_id
      ]
    );
    return result.rows[0];
  } catch (error) {
    log('error', `Error creating food entry from meal plan:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function deleteMealPlanEntriesByTemplateId(templateId, userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM meal_plans WHERE meal_plan_template_id = $1 RETURNING id',
      [templateId]
    );
    return result.rowCount;
  } catch (error) {
    log('error', `Error deleting meal plan entries for template ${templateId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}


async function getRecentMeals(userId, limit = null) {
  const client = await getClient(userId); // User-specific operation
  try {
    let query = `
      SELECT id, user_id, name, description, is_public, serving_size, serving_unit, created_at, updated_at
      FROM meals
      ORDER BY updated_at DESC`;
    const queryParams = [];

    if (limit !== null) {
      query += ` LIMIT $2`;
      queryParams.push(limit);
    }

    const result = await client.query(query, queryParams);
    const meals = result.rows;

    for (const meal of meals) {
      const mealFoodsResult = await client.query(
        `SELECT mf.id, mf.food_id, mf.variant_id, mf.quantity, mf.unit,
                f.name AS food_name, f.brand,
                fv.serving_size, fv.serving_unit, fv.calories, fv.protein, fv.carbs, fv.fat
         FROM meal_foods mf
         JOIN foods f ON mf.food_id = f.id
         LEFT JOIN food_variants fv ON mf.variant_id = fv.id
         WHERE mf.meal_id = $1`,
        [meal.id]
      );
      meal.foods = mealFoodsResult.rows;
    }
    return meals;
  } finally {
    client.release();
  }
}

async function getTopMeals(userId, limit = null) {
  const client = await getClient(userId); // User-specific operation
  try {
    // For "top meals", we'll use a simple heuristic: meals with more foods,
    // or more recently created public meals. This can be refined later.
    let query = `
      SELECT m.id, m.user_id, m.name, m.description, m.is_public, m.serving_size, m.serving_unit, m.created_at, m.updated_at,
             COUNT(mf.id) AS food_count
      FROM meals m
      LEFT JOIN meal_foods mf ON m.id = mf.meal_id
      GROUP BY m.id
      ORDER BY food_count DESC, m.created_at DESC`;
    const queryParams = [];

    if (limit !== null) {
      query += ` LIMIT $2`;
      queryParams.push(limit);
    }

    const result = await client.query(query, queryParams);
    const meals = result.rows;

    for (const meal of meals) {
      const mealFoodsResult = await client.query(
        `SELECT mf.id, mf.food_id, mf.variant_id, mf.quantity, mf.unit,
                f.name AS food_name, f.brand,
                fv.serving_size, fv.serving_unit, fv.calories, fv.protein, fv.carbs, fv.fat
         FROM meal_foods mf
         JOIN foods f ON mf.food_id = f.id
         LEFT JOIN food_variants fv ON mf.variant_id = fv.id
         WHERE mf.meal_id = $1`,
        [meal.id]
      );
      meal.foods = mealFoodsResult.rows;
    }
    return meals;
  } finally {
    client.release();
  }
}

async function getMealOwnerId(mealId, userId) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      'SELECT user_id FROM meals WHERE id = $1',
      [mealId]
    );
    return result.rows[0] ? result.rows[0].user_id : null;
  } finally {
    client.release();
  }
}

async function getMealsNeedingReview(userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT DISTINCT ON (fe.meal_id)
          fe.meal_id,
          m.name AS meal_name,
          m.updated_at AS meal_updated_at,
          fe.created_at AS entry_created_at,
          m.user_id AS meal_owner_id
       FROM food_entries fe
       JOIN meals m ON fe.meal_id = m.id
       WHERE fe.user_id = $1
         AND m.updated_at > fe.created_at -- Meal has been updated since the entry was created
         AND NOT EXISTS (
             SELECT 1 FROM user_ignored_updates uiu
             WHERE uiu.user_id = $1
               AND uiu.variant_id = fe.meal_id -- Using meal_id as variant_id for meals
               AND uiu.ignored_at_timestamp = m.updated_at
         )
       ORDER BY fe.meal_id, fe.created_at DESC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function updateMealEntriesSnapshot(userId, mealId, newSnapshotData) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE food_entries
       SET
          meal_name = $1
       WHERE user_id = $2 AND meal_id = $3
       RETURNING id`,
      [
        newSnapshotData.meal_name,
        userId,
        mealId,
      ]
    );
    return result.rowCount;
  } finally {
    client.release();
  }
}

async function clearUserIgnoredUpdate(userId, variantId) {
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

async function getMealDeletionImpact(mealId, userId) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      `SELECT mpt.user_id
       FROM meal_plan_template_assignments mpta
       JOIN meal_plan_templates mpt ON mpta.template_id = mpt.id
       WHERE mpta.meal_id = $1`,
      [mealId]
    );

    const usage = {
      usedByOtherUsers: false,
      usedByCurrentUser: false,
    };

    for (const row of result.rows) {
      if (row.user_id !== userId) {
        usage.usedByOtherUsers = true;
      } else {
        usage.usedByCurrentUser = true;
      }
    }

    return usage;
  } finally {
    client.release();
  }
}

async function deleteMealPlanEntriesByMealId(mealId, userId) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `DELETE FROM meal_plan_template_assignments
       WHERE meal_id = $1 AND template_id IN (SELECT id FROM meal_plan_templates WHERE user_id = $2)`,
      [mealId, userId]
    );
    return result.rowCount;
  } catch (error) {
    log('error', `Error deleting meal plan entries for meal ${mealId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function getMealPlanOwnerId(mealPlanId) {
  const client = await getClient(mealPlanId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      'SELECT user_id FROM meal_plans WHERE id = $1',
      [mealPlanId]
    );
    return result.rows[0] ? result.rows[0].user_id : null;
  } finally {
    client.release();
  }
}

async function getPublicMeals(userId) {
  const client = await getClient(userId); // User-specific operation for RLS
  try {
    const result = await client.query(
      `SELECT id, user_id, name, description, is_public, serving_size, serving_unit, created_at, updated_at
       FROM meals
       WHERE is_public = TRUE
       ORDER BY name ASC`
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getFamilyMeals(userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    // This query assumes a mechanism for defining "family" meals,
    // e.g., meals shared by users in the same family group.
    // For now, let's assume it fetches meals shared with the user via family access.
    // This might need to be refined based on actual family sharing implementation.
    const result = await client.query(
      `SELECT m.id, m.user_id, m.name, m.description, m.is_public, m.serving_size, m.serving_unit, m.created_at, m.updated_at
       FROM meals m
       JOIN family_access fa ON m.user_id = fa.owner_user_id
       WHERE fa.family_user_id = $1 AND fa.is_active = TRUE AND (fa.access_permissions->>'food_list')::boolean = TRUE
       ORDER BY m.name ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

module.exports = {
  createMeal,
  getMeals,
  getMealById,
  updateMeal,
  deleteMeal,
  createMealPlanEntry,
  getMealPlanEntries,
  getMealPlanEntryById,
  updateMealPlanEntry,
  deleteMealPlanEntry,
  deleteMealPlanEntriesByTemplateId,
  createFoodEntryFromMealPlan,
  getMealOwnerId,
  getMealPlanOwnerId,
  searchMeals,
  getRecentMeals,
  getTopMeals,
  getPublicMeals, // New export
  getFamilyMeals, // New export
  getMealDeletionImpact,
  deleteMealPlanEntriesByMealId,
  getMealsNeedingReview,
  updateMealEntriesSnapshot,
  clearUserIgnoredUpdate,
};