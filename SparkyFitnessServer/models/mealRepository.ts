import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'pg-f... Remove this comment to see the full error message
import format from 'pg-format';
import {
  buildSqlSearch,
  buildSqlExactMatchOrder,
} from '../utils/dbSearchHelper.js';
// --- Helpers ---
// Shared column list + joins for reading a meal's ingredient rows (meal_foods).
// A row is polymorphic (item_type 'food' | 'meal'): food rows carry the food
// nutrition snapshot (falling back to the live variant), meal rows carry the
// linked child meal's identity/serving metadata for the client to resolve. The
// only per-call difference is the WHERE clause, so callers append it.
const MEAL_FOODS_SELECT = `
  SELECT mf.id, mf.meal_id, mf.food_id, mf.child_meal_id, mf.item_type,
         mf.variant_id, mf.quantity, mf.unit,
         f.name AS food_name, f.brand,
         cm.name AS child_meal_name,
         cm.serving_size AS child_meal_serving_size,
         cm.serving_unit AS child_meal_serving_unit,
         cm.total_servings AS child_meal_total_servings,
         COALESCE(mf.serving_size, fv.serving_size)               AS serving_size,
         COALESCE(mf.serving_unit, fv.serving_unit)               AS serving_unit,
         COALESCE(mf.calories, fv.calories)                       AS calories,
         COALESCE(mf.protein, fv.protein)                         AS protein,
         COALESCE(mf.carbs, fv.carbs)                             AS carbs,
         COALESCE(mf.fat, fv.fat)                                 AS fat,
         COALESCE(mf.saturated_fat, fv.saturated_fat)             AS saturated_fat,
         COALESCE(mf.polyunsaturated_fat, fv.polyunsaturated_fat) AS polyunsaturated_fat,
         COALESCE(mf.monounsaturated_fat, fv.monounsaturated_fat) AS monounsaturated_fat,
         COALESCE(mf.trans_fat, fv.trans_fat)                     AS trans_fat,
         COALESCE(mf.cholesterol, fv.cholesterol)                 AS cholesterol,
         COALESCE(mf.sodium, fv.sodium)                           AS sodium,
         COALESCE(mf.potassium, fv.potassium)                     AS potassium,
         COALESCE(mf.dietary_fiber, fv.dietary_fiber)             AS dietary_fiber,
         COALESCE(mf.sugars, fv.sugars)                           AS sugars,
         COALESCE(mf.vitamin_a, fv.vitamin_a)                     AS vitamin_a,
         COALESCE(mf.vitamin_c, fv.vitamin_c)                     AS vitamin_c,
         COALESCE(mf.calcium, fv.calcium)                         AS calcium,
         COALESCE(mf.iron, fv.iron)                               AS iron,
         COALESCE(mf.glycemic_index, fv.glycemic_index)           AS glycemic_index,
         COALESCE(mf.custom_nutrients, fv.custom_nutrients)       AS custom_nutrients
  FROM meal_foods mf
  LEFT JOIN foods f ON mf.food_id = f.id
  LEFT JOIN food_variants fv ON mf.variant_id = fv.id
  LEFT JOIN meals cm ON mf.child_meal_id = cm.id`;

// Attach the ordered ingredient list (foods and linked meals) to each meal in
// a single round-trip. Used by every meal read path.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function attachFoodsToMeals(client: any, meals: any) {
  if (meals.length === 0) return meals;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mealIds = meals.map((m: any) => m.id);
  const mealFoodsResult = await client.query(
    `${MEAL_FOODS_SELECT} WHERE mf.meal_id = ANY($1::uuid[])`,
    [mealIds]
  );
  const foodsByMealId = {};
  for (const food of mealFoodsResult.rows) {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    if (!foodsByMealId[food.meal_id]) foodsByMealId[food.meal_id] = [];
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    foodsByMealId[food.meal_id].push(food);
  }
  for (const meal of meals) {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    meal.foods = foodsByMealId[meal.id] || [];
  }
  return meals;
}
// Normalizes an ingredient (a food or a linked child meal) into the ordered
// meal_foods INSERT value tuple. item_type is derived from which reference is
// present; meal rows null out food_id/variant_id but may still carry an
// aggregated nutrition snapshot for the linked meal.
function buildMealFoodValues(mealId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (item: any) => {
    const isChildMeal =
      item.item_type === 'meal' || (!!item.child_meal_id && !item.food_id);
    return [
      mealId,
      isChildMeal ? null : item.food_id,
      isChildMeal ? item.child_meal_id : null,
      isChildMeal ? 'meal' : 'food',
      isChildMeal ? null : (item.variant_id ?? null),
      item.quantity,
      item.unit,
      item.serving_size ?? null,
      item.serving_unit ?? null,
      item.calories ?? null,
      item.protein ?? null,
      item.carbs ?? null,
      item.fat ?? null,
      item.saturated_fat ?? null,
      item.polyunsaturated_fat ?? null,
      item.monounsaturated_fat ?? null,
      item.trans_fat ?? null,
      item.cholesterol ?? null,
      item.sodium ?? null,
      item.potassium ?? null,
      item.dietary_fiber ?? null,
      item.sugars ?? null,
      item.vitamin_a ?? null,
      item.vitamin_c ?? null,
      item.calcium ?? null,
      item.iron ?? null,
      item.glycemic_index ?? null,
      item.custom_nutrients ?? null,
    ];
  };
}
// --- Meal Template CRUD Operations ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createMeal(mealData: any) {
  const client = await getClient(mealData.user_id); // User-specific operation
  try {
    await client.query('BEGIN');
    const mealResult = await client.query(
      `INSERT INTO meals (user_id, name, description, is_public, serving_size, serving_unit, total_servings, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now()) RETURNING id, user_id, name, description, is_public, serving_size, serving_unit, total_servings, created_at, updated_at`,
      [
        mealData.user_id,
        mealData.name,
        mealData.description,
        mealData.is_public,
        mealData.serving_size,
        mealData.serving_unit,
        mealData.total_servings,
      ]
    );
    const newMeal = mealResult.rows[0];
    if (mealData.foods && mealData.foods.length > 0) {
      const mealFoodsValues = mealData.foods.map(
        buildMealFoodValues(newMeal.id)
      );
      const mealFoodsQuery = format(
        `INSERT INTO meal_foods (
           meal_id, food_id, child_meal_id, item_type, variant_id, quantity, unit,
           serving_size, serving_unit, calories, protein, carbs, fat,
           saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
           cholesterol, sodium, potassium, dietary_fiber, sugars,
           vitamin_a, vitamin_c, calcium, iron, glycemic_index,
           custom_nutrients
         ) VALUES %L RETURNING id`,
        mealFoodsValues
      );
      await client.query(mealFoodsQuery);
    }
    await client.query('COMMIT');
    return newMeal;
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', 'Error creating meal:', error);
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMeals(userId: any, filter = 'all') {
  const client = await getClient(userId); // User-specific operation
  try {
    let query = `
      SELECT id, user_id, name, description, is_public, serving_size, serving_unit, total_servings, created_at, updated_at
      FROM meals
      WHERE 1=1`; // Start with a true condition to easily append AND clauses
    const queryParams = [];
    if (filter === 'mine') {
      query += ' AND user_id = $1';
      queryParams.push(userId);
    }
    // For 'family' and 'public' filters, separate functions will be called in mealService
    query += ' ORDER BY name ASC';
    const result = await client.query(query, queryParams);
    // Await so attachFoodsToMeals' queries finish before finally releases the client.
    return await attachFoodsToMeals(client, result.rows);
  } finally {
    client.release();
  }
}
async function searchMeals(
  searchTerm: string | null | undefined,
  userId: string | null | undefined,
  limit: number | null = null
) {
  const client = await getClient(userId); // User-specific operation
  try {
    const {
      whereClauses: searchClauses,
      queryParams: searchParams,
      nextParamIndex,
    } = buildSqlSearch('name', searchTerm, 1);
    const whereClauses: string[] = [...searchClauses];
    const queryParams: any[] = [...searchParams];
    const paramIndex = nextParamIndex;

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let orderClause = 'name ASC';
    const selectQueryParams = [...queryParams];
    let selectParamIndex = paramIndex;
    if (searchTerm) {
      const exactMatchParamIndex = selectParamIndex;
      selectQueryParams.push(`%${searchTerm}%`);
      selectParamIndex++;
      orderClause = `${buildSqlExactMatchOrder('name', exactMatchParamIndex)}, name ASC`;
    }

    let query = `
      SELECT id, user_id, name, description, is_public, serving_size, serving_unit, total_servings
      FROM meals
      ${whereSql}
      ORDER BY ${orderClause}`;

    if (limit !== null) {
      query += ` LIMIT $${selectParamIndex}`;
      selectQueryParams.push(limit);
    }
    const result = await client.query(query, selectQueryParams);
    // Await so attachFoodsToMeals' queries finish before finally releases the client.
    return await attachFoodsToMeals(client, result.rows);
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealById(mealId: any, userId: any) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const mealResult = await client.query(
      `SELECT id, user_id, name, description, is_public, serving_size, serving_unit, total_servings, created_at, updated_at
       FROM meals WHERE id = $1`,
      [mealId]
    );
    const meal = mealResult.rows[0];
    if (meal) {
      await attachFoodsToMeals(client, [meal]);
    }
    return meal;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateMeal(mealId: any, userId: any, updateData: any) {
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
        total_servings = COALESCE($6, total_servings),
        updated_at = now()
       WHERE id = $7
       RETURNING id, user_id, name, description, is_public, serving_size, serving_unit, total_servings, created_at, updated_at`,
      [
        updateData.name,
        updateData.description,
        updateData.is_public,
        updateData.serving_size,
        updateData.serving_unit,
        updateData.total_servings,
        mealId,
      ]
    );
    const updatedMeal = result.rows[0];
    if (updatedMeal && updateData.foods !== undefined) {
      // Delete existing meal_foods for this meal
      await client.query('DELETE FROM meal_foods WHERE meal_id = $1', [mealId]);
      // Insert new meal_foods
      if (updateData.foods.length > 0) {
        const mealFoodsValues = updateData.foods.map(
          buildMealFoodValues(mealId)
        );
        const mealFoodsQuery = format(
          `INSERT INTO meal_foods (
             meal_id, food_id, child_meal_id, item_type, variant_id, quantity, unit,
             serving_size, serving_unit, calories, protein, carbs, fat,
             saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
             cholesterol, sodium, potassium, dietary_fiber, sugars,
             vitamin_a, vitamin_c, calcium, iron, glycemic_index,
             custom_nutrients
           ) VALUES %L RETURNING id`,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteMeal(mealId: any, userId: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createMealPlanEntry(planData: any) {
  const client = await getClient(planData.user_id); // User-specific operation
  try {
    let mealTypeId = planData.meal_type_id;
    if (!mealTypeId && planData.meal_type) {
      const typeRes = await client.query(
        'SELECT id FROM meal_types WHERE LOWER(name) = LOWER($1)',
        [planData.meal_type]
      );
      if (typeRes.rows.length > 0) mealTypeId = typeRes.rows[0].id;
      else throw new Error(`Invalid meal type: ${planData.meal_type}`);
    }
    const result = await client.query(
      `INSERT INTO meal_plans (user_id, meal_id, food_id, variant_id, quantity, unit, plan_date, meal_type_id, is_template, template_name, day_of_week, meal_plan_template_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now()) RETURNING *`,
      [
        planData.user_id,
        planData.meal_id,
        planData.food_id,
        planData.variant_id,
        planData.quantity,
        planData.unit,
        planData.plan_date,
        mealTypeId,
        planData.is_template,
        planData.template_name,
        planData.day_of_week,
        planData.meal_plan_template_id,
      ]
    );
    return result.rows[0];
  } catch (error) {
    log('error', 'Error creating meal plan entry:', error);
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealPlanEntries(userId: any, startDate: any, endDate: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
        mp.id, 
        mp.user_id, 
        mp.meal_id, 
        mp.food_id, 
        mp.variant_id, 
        mp.quantity, 
        mp.unit,
        mp.plan_date,  
        mt.name AS meal_type, 
        mp.meal_type_id,
        mp.is_template, 
        mp.template_name, 
        mp.day_of_week,
        m.name AS meal_name, 
        m.description AS meal_description,
        f.name AS food_name, 
        f.brand AS food_brand,
        fv.serving_size, 
        fv.serving_unit, 
        fv.calories, 
        fv.protein, 
        fv.carbs, 
        fv.fat
       FROM meal_plans mp
       LEFT JOIN meal_types mt ON mp.meal_type_id = mt.id
       LEFT JOIN meals m ON mp.meal_id = m.id
       LEFT JOIN foods f ON mp.food_id = f.id
       LEFT JOIN food_variants fv ON mp.variant_id = fv.id
       WHERE mp.plan_date BETWEEN $1 AND $2
       ORDER BY mp.plan_date, mt.sort_order ASC`,
      [startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateMealPlanEntry(planId: any, userId: any, updateData: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    let mealTypeId = updateData.meal_type_id;
    if (!mealTypeId && updateData.meal_type) {
      const typeRes = await client.query(
        'SELECT id FROM meal_types WHERE LOWER(name) = LOWER($1)',
        [updateData.meal_type]
      );
      if (typeRes.rows.length > 0) mealTypeId = typeRes.rows[0].id;
    }
    const result = await client.query(
      `UPDATE meal_plans SET
        meal_id = COALESCE($1, meal_id),
        food_id = COALESCE($2, food_id),
        variant_id = COALESCE($3, variant_id),
        quantity = COALESCE($4, quantity),
        unit = COALESCE($5, unit),
        plan_date = COALESCE($6, plan_date),
        meal_type_id = COALESCE($7, meal_type_id),
        is_template = COALESCE($8, is_template),
        template_name = COALESCE($9, template_name),
        day_of_week = COALESCE($10, day_of_week),
        meal_plan_template_id = COALESCE($11, meal_plan_template_id),
        updated_at = now()
       WHERE id = $12
       RETURNING *`,
      [
        updateData.meal_id,
        updateData.food_id,
        updateData.variant_id,
        updateData.quantity,
        updateData.unit,
        updateData.plan_date,
        mealTypeId,
        updateData.is_template,
        updateData.template_name,
        updateData.day_of_week,
        updateData.meal_plan_template_id,
        planId,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteMealPlanEntry(planId: any, userId: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealPlanEntryById(planId: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
        mp.id, 
        mp.user_id, 
        mp.meal_id, 
        mp.food_id, 
        mp.variant_id, 
        mp.quantity, 
        mp.unit,
        mp.plan_date, 
        mt.name AS meal_type, 
        mp.meal_type_id,
        m.name AS meal_name,
        f.name AS food_name
       FROM meal_plans mp
       LEFT JOIN meal_types mt ON mp.meal_type_id = mt.id
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createFoodEntryFromMealPlan(entryData: any) {
  const client = await getClient(entryData.user_id); // User-specific operation
  try {
    let mealTypeId = entryData.meal_type_id;
    if (!mealTypeId && entryData.meal_type) {
      const typeRes = await client.query(
        'SELECT id FROM meal_types WHERE LOWER(name) = LOWER($1)',
        [entryData.meal_type]
      );
      if (typeRes.rows.length > 0) mealTypeId = typeRes.rows[0].id;
      else throw new Error(`Invalid meal type: ${entryData.meal_type}`);
    }
    const result = await client.query(
      `INSERT INTO food_entries (user_id, food_id, meal_type_id, quantity, unit, entry_date, variant_id, meal_plan_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING *`,
      [
        entryData.user_id,
        entryData.food_id,
        mealTypeId,
        entryData.quantity,
        entryData.unit,
        entryData.entry_date,
        entryData.variant_id,
        entryData.meal_plan_id,
      ]
    );
    return result.rows[0];
  } catch (error) {
    log('error', 'Error creating food entry from meal plan:', error);
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteMealPlanEntriesByTemplateId(templateId: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM meal_plans WHERE meal_plan_template_id = $1 RETURNING id',
      [templateId]
    );
    return result.rowCount;
  } catch (error) {
    log(
      'error',
      `Error deleting meal plan entries for template ${templateId}:`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getRecentMeals(userId: any, limit = 3) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `WITH recent_usage AS (
        SELECT
          fe.meal_id,
          fe.entry_date,
          fe.created_at
        FROM food_entries fe
        WHERE fe.user_id = $1
          AND fe.meal_id IS NOT NULL
        UNION ALL
        SELECT
          fem.meal_template_id AS meal_id,
          fem.entry_date,
          fem.created_at
        FROM food_entry_meals fem
        WHERE fem.user_id = $1
          AND fem.meal_template_id IS NOT NULL
      ),
      latest_usage AS (
        SELECT DISTINCT ON (meal_id)
          meal_id,
          entry_date AS last_used_date,
          created_at AS last_used_at
        FROM recent_usage
        ORDER BY meal_id, entry_date DESC, created_at DESC
      )
      SELECT
        m.id,
        m.user_id,
        m.name,
        m.description,
        m.is_public,
        m.serving_size,
        m.serving_unit,
        m.total_servings,
        m.created_at,
        m.updated_at,
        lu.last_used_date
      FROM latest_usage lu
      JOIN meals m ON m.id = lu.meal_id
      ORDER BY lu.last_used_date DESC, lu.last_used_at DESC, m.name ASC
      LIMIT $2`,
      [userId, limit]
    );
    // await before returning: attachFoodsToMeals runs more queries on `client`,
    // and the finally below releases it. Returning the un-awaited promise would
    // release the client back to the pool before those queries finish.
    return await attachFoodsToMeals(client, result.rows);
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTopMeals(userId: any, limit = 3) {
  const client = await getClient(userId); // User-specific operation
  try {
    // "Top meals" = the meals this user logs most often, ranked by how many
    // times they have been logged. Usage is counted over the same two sources
    // as getRecentMeals: meals logged directly (food_entries.meal_id) and meals
    // logged as a template (food_entry_meals.meal_template_id).
    //
    // Join meals first, then GROUP/LIMIT, so the LIMIT is applied to *active*
    // meals only. A frequently logged meal that was later deleted still leaves
    // its id in the usage history; limiting before the join would let those
    // dead ids take top slots and then get dropped by the inner join, returning
    // fewer than `limit` (or zero) results. (Matches getRecentMeals' ordering.)
    const result = await client.query(
      `WITH meal_usage AS (
        SELECT fe.meal_id AS meal_id
        FROM food_entries fe
        WHERE fe.user_id = $1
          AND fe.meal_id IS NOT NULL
        UNION ALL
        SELECT fem.meal_template_id AS meal_id
        FROM food_entry_meals fem
        WHERE fem.user_id = $1
          AND fem.meal_template_id IS NOT NULL
      )
      SELECT
        m.id,
        m.user_id,
        m.name,
        m.description,
        m.is_public,
        m.serving_size,
        m.serving_unit,
        m.total_servings,
        m.created_at,
        m.updated_at,
        COUNT(*) AS usage_count
      FROM meal_usage mu
      JOIN meals m ON m.id = mu.meal_id
      GROUP BY m.id
      ORDER BY usage_count DESC, m.name ASC
      LIMIT $2`,
      [userId, limit]
    );
    // await before the finally releases the client: attachFoodsToMeals runs
    // more queries on this same client, so returning the promise unawaited would
    // release the client back to the pool before those queries finish.
    return await attachFoodsToMeals(client, result.rows);
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealOwnerId(mealId: any, userId: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealsNeedingReview(userId: any) {
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

async function updateMealEntriesSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mealId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newSnapshotData: any
) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE food_entries
       SET
          meal_name = $1
       WHERE user_id = $2 AND meal_id = $3
       RETURNING id`,
      [newSnapshotData.meal_name, userId, mealId]
    );
    return result.rowCount;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clearUserIgnoredUpdate(userId: any, variantId: any) {
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
// Returns true when `ancestorMealId` transitively contains `descendantMealId`
// as a linked sub-meal (following meal_foods.child_meal_id edges). Used by the
// service to reject cycles before inserting a meal-as-ingredient link.
async function mealContainsMeal(
  ancestorMealId: string,
  descendantMealId: string,
  userId: string
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `WITH RECURSIVE descendants AS (
         SELECT child_meal_id
         FROM meal_foods
         WHERE meal_id = $1 AND child_meal_id IS NOT NULL
         UNION
         SELECT mf.child_meal_id
         FROM meal_foods mf
         JOIN descendants d ON mf.meal_id = d.child_meal_id
         WHERE mf.child_meal_id IS NOT NULL
       )
       SELECT 1 FROM descendants WHERE child_meal_id = $2 LIMIT 1`,
      [ancestorMealId, descendantMealId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
// Returns the depth of the linked-sub-meal subtree rooted at `mealId` (0 when
// it links no other meals). Used to bound nesting depth before adding a link.
// The depth < 20 guard prevents runaway if a cycle somehow exists.
async function getMealSubtreeDepth(mealId: string, userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `WITH RECURSIVE tree AS (
         SELECT child_meal_id, 1 AS depth
         FROM meal_foods
         WHERE meal_id = $1 AND child_meal_id IS NOT NULL
         UNION ALL
         SELECT mf.child_meal_id, t.depth + 1
         FROM meal_foods mf
         JOIN tree t ON mf.meal_id = t.child_meal_id
         WHERE mf.child_meal_id IS NOT NULL AND t.depth < 20
       )
       SELECT COALESCE(MAX(depth), 0)::int AS depth FROM tree`,
      [mealId]
    );
    return result.rows[0]?.depth ?? 0;
  } finally {
    client.release();
  }
}
// Returns the max height of the ancestors chain pointing to `mealId` (0 when
// it is not referenced by any other sub-meals). Used to bound nesting depth.
async function getMealAncestryHeight(mealId: string, userId: string) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `WITH RECURSIVE tree AS (
         SELECT meal_id, 1 AS height
         FROM meal_foods
         WHERE child_meal_id = $1
         UNION ALL
         SELECT mf.meal_id, t.height + 1
         FROM meal_foods mf
         JOIN tree t ON mf.child_meal_id = t.meal_id
         WHERE t.height < 20
       )
       SELECT COALESCE(MAX(height), 0)::int AS height FROM tree`,
      [mealId]
    );
    return result.rows[0]?.height ?? 0;
  } finally {
    client.release();
  }
}
// Returns the parent meals that reference `mealId` as a linked sub-meal, so
// callers can warn about (or block) deleting a meal still used as a component.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealComponentUsage(mealId: any, userId: any) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT DISTINCT m.id, m.name, m.user_id
       FROM meal_foods mf
       JOIN meals m ON mf.meal_id = m.id
       WHERE mf.child_meal_id = $1`,
      [mealId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealDeletionImpact(mealId: any, userId: any) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      `SELECT mpt.user_id
       FROM meal_plan_template_assignments mpta
       JOIN meal_plan_templates mpt ON mpta.template_id = mpt.id
       WHERE mpta.meal_id = $1
       UNION ALL
       SELECT m.user_id
       FROM meal_foods mf
       JOIN meals m ON mf.meal_id = m.id
       WHERE mf.child_meal_id = $1`,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteMealPlanEntriesByMealId(mealId: any, userId: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealPlanOwnerId(mealPlanId: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPublicMeals(userId: any) {
  const client = await getClient(userId); // User-specific operation for RLS
  try {
    const result =
      await client.query(`SELECT id, user_id, name, description, is_public, serving_size, serving_unit, total_servings, created_at, updated_at
       FROM meals
       WHERE is_public = TRUE
       ORDER BY name ASC`);
    // Await so attachFoodsToMeals' queries finish before finally releases the client.
    return await attachFoodsToMeals(client, result.rows);
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFamilyMeals(userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    // This query assumes a mechanism for defining "family" meals,
    // e.g., meals shared by users in the same family group.
    // For now, let's assume it fetches meals shared with the user via family access.
    // This might need to be refined based on actual family sharing implementation.
    const result = await client.query(
      `SELECT m.id, m.user_id, m.name, m.description, m.is_public, m.serving_size, m.serving_unit, m.total_servings, m.created_at, m.updated_at
       FROM meals m
       JOIN family_access fa ON m.user_id = fa.owner_user_id
       WHERE fa.family_user_id = $1 AND fa.is_active = TRUE
       ORDER BY m.name ASC`,
      [userId]
    );
    // Await so attachFoodsToMeals' queries finish before finally releases the client.
    return await attachFoodsToMeals(client, result.rows);
  } finally {
    client.release();
  }
}
export { createMeal };
export { getMeals };
export { getMealById };
export { updateMeal };
export { deleteMeal };
export { createMealPlanEntry };
export { getMealPlanEntries };
export { getMealPlanEntryById };
export { updateMealPlanEntry };
export { deleteMealPlanEntry };
export { deleteMealPlanEntriesByTemplateId };
export { createFoodEntryFromMealPlan };
export { getMealOwnerId };
export { getMealPlanOwnerId };
export { searchMeals };
export { getRecentMeals };
export { getTopMeals };
export { getPublicMeals };
export { getFamilyMeals };
export { getMealDeletionImpact };
export { deleteMealPlanEntriesByMealId };
export { getMealsNeedingReview };
export { updateMealEntriesSnapshot };
export { clearUserIgnoredUpdate };
export { mealContainsMeal };
export { getMealComponentUsage };
export { getMealSubtreeDepth };
export { getMealAncestryHeight };
export default {
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
  getPublicMeals,
  getFamilyMeals,
  getMealDeletionImpact,
  deleteMealPlanEntriesByMealId,
  getMealsNeedingReview,
  updateMealEntriesSnapshot,
  clearUserIgnoredUpdate,
  mealContainsMeal,
  getMealComponentUsage,
  getMealSubtreeDepth,
  getMealAncestryHeight,
};
