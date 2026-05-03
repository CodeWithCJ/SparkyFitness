import { getClient, getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { normalizeBarcode } from '../utils/foodUtils.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeGlycemicIndex(gi: any) {
  const allowedGICategories = [
    'None',
    'Very Low',
    'Low',
    'Medium',
    'High',
    'Very High',
  ];
  if (
    gi === '0' ||
    gi === '0.0' ||
    gi === null ||
    gi === undefined ||
    gi === '' ||
    !allowedGICategories.includes(gi)
  ) {
    return null;
  }
  return gi;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeNumeric(value: any) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    value === 'NULL'
  ) {
    return null;
  }
  // Strip quotes if they exist (common in CSV issues)
  let sanitizedValue = value;
  if (typeof value === 'string') {
    sanitizedValue = value.replace(/^["']|["']$/g, '');
  }
  const num = parseFloat(sanitizedValue);
  return isNaN(num) ? null : num;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeBoolean(value: any) {
  if (
    value === true ||
    value === 'TRUE' ||
    value === 't' ||
    value === '1' ||
    value === 1
  ) {
    return true;
  }
  if (
    value === false ||
    value === 'FALSE' ||
    value === 'f' ||
    value === '0' ||
    value === 0
  ) {
    return false;
  }
  return null;
}
async function searchFoods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  name: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exactMatch: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  broadMatch: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checkCustom: any,
  limit = 10
) {
  const client = await getClient(userId); // User-specific operation
  try {
    let query = `
      SELECT
        f.id, f.name, f.brand, f.is_custom, f.user_id, f.shared_with_public, f.provider_external_id, f.provider_type,
        json_build_object(
          'id', fv.id,
          'serving_size', fv.serving_size,
          'serving_unit', fv.serving_unit,
          'calories', fv.calories,
          'protein', fv.protein,
          'carbs', fv.carbs,
          'fat', fv.fat,
          'saturated_fat', fv.saturated_fat,
          'polyunsaturated_fat', fv.polyunsaturated_fat,
          'monounsaturated_fat', fv.monounsaturated_fat,
          'trans_fat', fv.trans_fat,
          'cholesterol', fv.cholesterol,
          'sodium', fv.sodium,
          'potassium', fv.potassium,
          'dietary_fiber', fv.dietary_fiber,
          'sugars', fv.sugars,
          'vitamin_a', fv.vitamin_a,
          'vitamin_c', fv.vitamin_c,
          'calcium', fv.calcium,
          'iron', fv.iron,
          'is_default', fv.is_default,
          'glycemic_index', fv.glycemic_index,
          'custom_nutrients', fv.custom_nutrients
        ) AS default_variant
      FROM foods f
      LEFT JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
      WHERE f.is_quick_food = FALSE AND `;
    const queryParams = [];
    let paramIndex = 1;
    if (exactMatch) {
      query += `CONCAT(f.brand, ' ', f.name) ILIKE $${paramIndex++}`;
      queryParams.push(name);
    } else if (broadMatch) {
      query += `CONCAT(f.brand, ' ', f.name) ILIKE $${paramIndex++}`;
      queryParams.push(`%${name}%`);
    } else if (checkCustom) {
      query += `f.name = $${paramIndex++}`;
      queryParams.push(name);
    } else {
      throw new Error('Invalid search parameters.');
    }
    query += ` LIMIT $${paramIndex++}`;
    queryParams.push(limit);
    const result = await client.query(query, queryParams);
    return result.rows;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createFood(foodData: any) {
  const client = await getClient(foodData.user_id); // User-specific operation
  try {
    await client.query('BEGIN'); // Start transaction
    // 1. Create the food entry
    const foodResult = await client.query(
      `INSERT INTO foods (
        name, is_custom, user_id, brand, barcode, provider_external_id, shared_with_public, provider_type, is_quick_food, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now()) RETURNING id, name, brand, is_custom, user_id, shared_with_public, is_quick_food, provider_external_id, provider_type`,
      [
        foodData.name,
        sanitizeBoolean(foodData.is_custom) ?? true,
        foodData.user_id,
        foodData.brand,
        foodData.barcode
          ? normalizeBarcode(foodData.barcode)
          : foodData.barcode,
        foodData.provider_external_id,
        sanitizeBoolean(foodData.shared_with_public) ?? false,
        foodData.provider_type,
        sanitizeBoolean(foodData.is_quick_food) ?? false,
      ]
    );
    const newFood = foodResult.rows[0];
    // 2. Create the primary food variant and mark it as default
    const variantResult = await client.query(
      `INSERT INTO food_variants (
        food_id, serving_size, serving_unit, calories, protein, carbs, fat,
        saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
        cholesterol, sodium, potassium, dietary_fiber, sugars,
        vitamin_a, vitamin_c, calcium, iron, is_default, glycemic_index, custom_nutrients, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, TRUE, $21, $22, now(), now()) RETURNING id`,
      [
        newFood.id,
        sanitizeNumeric(foodData.serving_size),
        foodData.serving_unit,
        sanitizeNumeric(foodData.calories),
        sanitizeNumeric(foodData.protein),
        sanitizeNumeric(foodData.carbs),
        sanitizeNumeric(foodData.fat),
        sanitizeNumeric(foodData.saturated_fat),
        sanitizeNumeric(foodData.polyunsaturated_fat),
        sanitizeNumeric(foodData.monounsaturated_fat),
        sanitizeNumeric(foodData.trans_fat),
        sanitizeNumeric(foodData.cholesterol),
        sanitizeNumeric(foodData.sodium),
        sanitizeNumeric(foodData.potassium),
        sanitizeNumeric(foodData.dietary_fiber),
        sanitizeNumeric(foodData.sugars),
        sanitizeNumeric(foodData.vitamin_a),
        sanitizeNumeric(foodData.vitamin_c),
        sanitizeNumeric(foodData.calcium),
        sanitizeNumeric(foodData.iron),
        sanitizeGlycemicIndex(foodData.glycemic_index),
        foodData.custom_nutrients || {},
      ]
    );
    const newVariantId = variantResult.rows[0].id;
    await client.query('COMMIT'); // Commit transaction
    // Return the new food with its default variant details
    return {
      ...newFood,
      default_variant: {
        id: newVariantId,
        serving_size: foodData.serving_size,
        serving_unit: foodData.serving_unit,
        calories: foodData.calories,
        protein: foodData.protein,
        carbs: foodData.carbs,
        fat: foodData.fat,
        saturated_fat: foodData.saturated_fat,
        polyunsaturated_fat: foodData.polyunsaturated_fat,
        monounsaturated_fat: foodData.monounsaturated_fat,
        trans_fat: foodData.trans_fat,
        cholesterol: foodData.cholesterol,
        sodium: foodData.sodium,
        potassium: foodData.potassium,
        dietary_fiber: foodData.dietary_fiber,
        sugars: foodData.sugars,
        vitamin_a: foodData.vitamin_a,
        vitamin_c: foodData.vitamin_c,
        calcium: foodData.calcium,
        iron: foodData.iron,
        is_default: true,
        custom_nutrients: foodData.custom_nutrients || {},
      },
    };
  } catch (error) {
    await client.query('ROLLBACK'); // Rollback transaction on error
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findFoodByBarcode(barcode: any, userId: any) {
  barcode = normalizeBarcode(barcode);
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
        f.id, f.name, f.brand, f.is_custom, f.user_id, f.shared_with_public, f.provider_external_id, f.provider_type,
        json_build_object(
          'id', fv.id,
          'serving_size', fv.serving_size,
          'serving_unit', fv.serving_unit,
          'calories', fv.calories,
          'protein', fv.protein,
          'carbs', fv.carbs,
          'fat', fv.fat,
          'saturated_fat', fv.saturated_fat,
          'polyunsaturated_fat', fv.polyunsaturated_fat,
          'monounsaturated_fat', fv.monounsaturated_fat,
          'trans_fat', fv.trans_fat,
          'cholesterol', fv.cholesterol,
          'sodium', fv.sodium,
          'potassium', fv.potassium,
          'dietary_fiber', fv.dietary_fiber,
          'sugars', fv.sugars,
          'vitamin_a', fv.vitamin_a,
          'vitamin_c', fv.vitamin_c,
          'calcium', fv.calcium,
          'iron', fv.iron,
          'is_default', fv.is_default,
          'glycemic_index', fv.glycemic_index,
          'custom_nutrients', fv.custom_nutrients
        ) AS default_variant
      FROM foods f
      LEFT JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
      WHERE f.barcode = $1 AND f.user_id = $2 AND f.is_quick_food = FALSE
      LIMIT 1`,
      [barcode, userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFoodById(foodId: any, userId: any) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      `SELECT
        f.id, f.name, f.brand, f.is_custom, f.user_id, f.shared_with_public, f.provider_external_id, f.provider_type,
        json_build_object(
          'id', fv.id,
          'serving_size', fv.serving_size,
          'serving_unit', fv.serving_unit,
          'calories', fv.calories,
          'protein', fv.protein,
          'carbs', fv.carbs,
          'fat', fv.fat,
          'saturated_fat', fv.saturated_fat,
          'polyunsaturated_fat', fv.polyunsaturated_fat,
          'monounsaturated_fat', fv.monounsaturated_fat,
          'trans_fat', fv.trans_fat,
          'cholesterol', fv.cholesterol,
          'sodium', fv.sodium,
          'potassium', fv.potassium,
          'dietary_fiber', fv.dietary_fiber,
          'sugars', fv.sugars,
          'vitamin_a', fv.vitamin_a,
          'vitamin_c', fv.vitamin_c,
          'calcium', fv.calcium,
          'iron', fv.iron,
          'is_default', fv.is_default,
          'glycemic_index', fv.glycemic_index,
          'custom_nutrients', fv.custom_nutrients
        ) AS default_variant
      FROM foods f
      LEFT JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
      WHERE f.id = $1`,
      [foodId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFoodOwnerId(foodId: any, userId: any) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const foodResult = await client.query(
      'SELECT user_id FROM foods WHERE id = $1',
      [foodId]
    );
    const ownerId = foodResult.rows[0]?.user_id;
    log('info', `getFoodOwnerId: Food ID ${foodId} owner: ${ownerId}`);
    return ownerId;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateFood(id: any, userId: any, foodData: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE foods SET
        name = COALESCE($1, name),
        is_custom = COALESCE($2, is_custom),
        brand = COALESCE($3, brand),
        barcode = COALESCE($4, barcode),
        provider_external_id = COALESCE($5, provider_external_id),
        shared_with_public = COALESCE($6, shared_with_public),
        provider_type = COALESCE($7, provider_type),
        is_quick_food = COALESCE($8, is_quick_food),
        updated_at = now()
      WHERE id = $9
      RETURNING *`,
      [
        foodData.name,
        foodData.is_custom,
        foodData.brand,
        foodData.barcode
          ? normalizeBarcode(foodData.barcode)
          : foodData.barcode,
        foodData.provider_external_id,
        foodData.shared_with_public,
        foodData.provider_type,
        foodData.is_quick_food,
        id,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteFood(id: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM foods WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
async function getFoodsWithPagination(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  searchTerm: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foodFilter: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  limit: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offset: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sortBy: any
) {
  const client = await getClient(authenticatedUserId); // User-specific operation
  try {
    const whereClauses = ['f.is_quick_food = FALSE'];
    const queryParams = [];
    let paramIndex = 1;
    if (searchTerm) {
      whereClauses.push(`CONCAT(brand, ' ', name) ILIKE $${paramIndex}`);
      queryParams.push(`%${searchTerm}%`);
      paramIndex++;
    }
    // RLS will handle ownership filtering
    let query = `
      SELECT
        f.id, f.name, f.brand, f.is_custom, f.user_id, f.shared_with_public, f.provider_external_id, f.provider_type,
        json_build_object(
          'id', fv.id,
          'serving_size', fv.serving_size,
          'serving_unit', fv.serving_unit,
          'calories', fv.calories,
          'protein', fv.protein,
          'carbs', fv.carbs,
          'fat', fv.fat,
          'saturated_fat', fv.saturated_fat,
          'polyunsaturated_fat', fv.polyunsaturated_fat,
          'monounsaturated_fat', fv.monounsaturated_fat,
          'trans_fat', fv.trans_fat,
          'cholesterol', fv.cholesterol,
          'sodium', fv.sodium,
          'potassium', fv.potassium,
          'dietary_fiber', fv.dietary_fiber,
          'sugars', fv.sugars,
          'vitamin_a', fv.vitamin_a,
          'vitamin_c', fv.vitamin_c,
          'calcium', fv.calcium,
          'iron', fv.iron,
          'is_default', fv.is_default,
          'glycemic_index', fv.glycemic_index,
          'custom_nutrients', fv.custom_nutrients
        ) AS default_variant
      FROM foods f
      LEFT JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
      WHERE ${whereClauses.join(' AND ')}
    `;
    let orderByClause = 'f.name ASC, f.id ASC';
    if (sortBy) {
      const [sortField, sortOrder] = sortBy.split(':');
      const nutritionSortFields = ['calories', 'protein', 'carbs', 'fat'];
      const allowedSortFields = ['name', ...nutritionSortFields];
      const allowedSortOrders = ['asc', 'desc'];
      if (
        allowedSortFields.includes(sortField) &&
        allowedSortOrders.includes(sortOrder)
      ) {
        if (nutritionSortFields.includes(sortField)) {
          orderByClause = `fv.${sortField} ${sortOrder.toUpperCase()} NULLS LAST, f.name ASC, f.id ASC`;
        } else {
          orderByClause = `f.${sortField} ${sortOrder.toUpperCase()}, f.id ASC`;
        }
      } else {
        log(
          'warn',
          `Invalid sortBy parameter received: ${sortBy}. Using default sort.`
        );
      }
    }
    query += ` ORDER BY ${orderByClause}`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);
    const foodsResult = await client.query(query, queryParams);
    return foodsResult.rows;
  } finally {
    client.release();
  }
}

async function countFoods(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  searchTerm: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foodFilter: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any
) {
  const client = await getClient(authenticatedUserId); // User-specific operation
  try {
    const whereClauses = ['is_quick_food = FALSE'];
    const countQueryParams = [];
    let paramIndex = 1;
    if (searchTerm) {
      whereClauses.push(`CONCAT(brand, ' ', name) ILIKE $${paramIndex}`);
      countQueryParams.push(`%${searchTerm}%`);
      paramIndex++;
    }
    // RLS will handle ownership filtering
    const countQuery = `
      SELECT COUNT(*)
      FROM foods
      WHERE ${whereClauses.join(' AND ')}
    `;
    const countResult = await client.query(countQuery, countQueryParams);
    return parseInt(countResult.rows[0].count, 10);
  } finally {
    client.release();
  }
}
async function getFoodDeletionImpact(
  foodId: string,
  authenticatedUserId: string
) {
  const client = await getClient(authenticatedUserId);
  const systemClient = await getSystemClient();

  try {
    const [publicFoodResult, foodOwnerResult] = await Promise.all([
      systemClient.query('SELECT shared_with_public FROM foods WHERE id = $1', [
        foodId,
      ]),
      systemClient.query('SELECT user_id FROM foods WHERE id = $1', [foodId]),
    ]);

    const isPubliclyShared =
      publicFoodResult.rows[0]?.shared_with_public || false;
    const foodOwnerId = foodOwnerResult.rows[0]?.user_id;

    // Fetch actual food entry rows for the current user (RLS-scoped)
    const currentUserEntriesResult = await client.query(
      `SELECT id, entry_date, meal_type_id 
       FROM food_entries
       WHERE food_id = $1 AND user_id = $2
       ORDER BY entry_date DESC
       LIMIT 50`,
      [foodId, authenticatedUserId]
    );

    // Fetch actual food entry rows for other users (bypass RLS)
    const otherUserEntriesResult = await systemClient.query(
      `SELECT id, entry_date, meal_type_id
       FROM food_entries
       WHERE food_id = $1 AND user_id != $2
       ORDER BY entry_date DESC
       LIMIT 50`,
      [foodId, authenticatedUserId]
    );

    const currentUserFoodEntries = currentUserEntriesResult.rows.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (row: any) => ({
        id: row.id,
        entry_date: row.entry_date,
        meal_type_id: row.meal_type_id,
        isCurrentUser: true,
      })
    );

    const otherUserFoodEntries = otherUserEntriesResult.rows.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (row: any) => ({
        id: row.id,
        entry_date: row.entry_date,
        meal_type_id: row.meal_type_id,
        isCurrentUser: false,
      })
    );

    // Structural reference counts (meals, plans, templates)
    const [
      currentUserMealFoodsResult,
      currentUserMealPlansResult,
      currentUserTemplatesResult,
      otherUserMealFoodsResult,
      otherUserMealPlansResult,
      otherUserTemplatesResult,
    ] = await Promise.all([
      client.query(
        'SELECT COUNT(*) FROM meal_foods mf JOIN meals m ON mf.meal_id = m.id WHERE mf.food_id = $1 AND m.user_id = $2',
        [foodId, authenticatedUserId]
      ),
      client.query(
        'SELECT COUNT(*) FROM meal_plans mp WHERE mp.food_id = $1 AND mp.user_id = $2',
        [foodId, authenticatedUserId]
      ),
      client.query(
        'SELECT COUNT(*) FROM meal_plan_template_assignments mpta JOIN meal_plan_templates mpt ON mpta.template_id = mpt.id WHERE mpta.food_id = $1 AND mpt.user_id = $2',
        [foodId, authenticatedUserId]
      ),
      systemClient.query(
        'SELECT COUNT(*) FROM meal_foods mf JOIN meals m ON mf.meal_id = m.id WHERE mf.food_id = $1 AND m.user_id != $2',
        [foodId, authenticatedUserId]
      ),
      systemClient.query(
        'SELECT COUNT(*) FROM meal_plans mp WHERE mp.food_id = $1 AND mp.user_id != $2',
        [foodId, authenticatedUserId]
      ),
      systemClient.query(
        'SELECT COUNT(*) FROM meal_plan_template_assignments mpta JOIN meal_plan_templates mpt ON mpta.template_id = mpt.id WHERE mpta.food_id = $1 AND mpt.user_id != $2',
        [foodId, authenticatedUserId]
      ),
    ]);

    const mealFoodsCount =
      parseInt(currentUserMealFoodsResult.rows[0].count, 10) +
      parseInt(otherUserMealFoodsResult.rows[0].count, 10);
    const mealPlansCount =
      parseInt(currentUserMealPlansResult.rows[0].count, 10) +
      parseInt(otherUserMealPlansResult.rows[0].count, 10);
    const mealPlanTemplateAssignmentsCount =
      parseInt(currentUserTemplatesResult.rows[0].count, 10) +
      parseInt(otherUserTemplatesResult.rows[0].count, 10);

    const foodEntriesCount =
      currentUserFoodEntries.length + otherUserFoodEntries.length;
    const currentUserReferences =
      currentUserFoodEntries.length +
      parseInt(currentUserMealFoodsResult.rows[0].count, 10) +
      parseInt(currentUserMealPlansResult.rows[0].count, 10) +
      parseInt(currentUserTemplatesResult.rows[0].count, 10);
    const otherUserReferences =
      otherUserFoodEntries.length +
      parseInt(otherUserMealFoodsResult.rows[0].count, 10) +
      parseInt(otherUserMealPlansResult.rows[0].count, 10) +
      parseInt(otherUserTemplatesResult.rows[0].count, 10);

    let familySharedUsers: string[] = [];
    if (foodOwnerId === authenticatedUserId) {
      const familyAccessResult = await client.query(
        `SELECT fa.family_user_id
         FROM family_access fa
         WHERE fa.owner_user_id = $1
           AND fa.is_active = TRUE
           AND (fa.access_end_date IS NULL OR fa.access_end_date > NOW())
           AND (fa.access_permissions->>'diary')::boolean = TRUE`,
        [authenticatedUserId]
      );
      familySharedUsers = familyAccessResult.rows.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (row: any) => row.family_user_id
      );
    }

    return {
      foodEntries: [...currentUserFoodEntries, ...otherUserFoodEntries],
      foodEntriesCount,
      mealFoodsCount,
      mealPlansCount,
      mealPlanTemplateAssignmentsCount,
      totalReferences: currentUserReferences + otherUserReferences,
      currentUserReferences,
      otherUserReferences,
      isPubliclyShared,
      familySharedUsers,
    };
  } finally {
    client.release();
    systemClient.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteFoodAndDependencies(foodId: any, userId: any) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    // 1. Delete food entries referencing this food for the current user
    await client.query(
      'DELETE FROM food_entries WHERE food_id = $1 AND user_id = $2',
      [foodId, userId]
    );
    log('info', `Deleted food entries for food ${foodId} by user ${userId}`);
    // 2. Delete meal_foods referencing this food for meals owned by the current user
    await client.query(
      `
      DELETE FROM meal_foods mf
      USING meals m
      WHERE mf.meal_id = m.id
        AND mf.food_id = $1
        AND m.user_id = $2
    `,
      [foodId, userId]
    );
    log(
      'info',
      `Deleted meal foods for food ${foodId} in meals by user ${userId}`
    );
    // 3. Delete meal_plans referencing this food for the current user
    await client.query(
      'DELETE FROM meal_plans WHERE food_id = $1 AND user_id = $2',
      [foodId, userId]
    );
    log('info', `Deleted meal plans for food ${foodId} by user ${userId}`);
    // 4. Delete meal_plan_template_assignments referencing this food for templates owned by the current user
    await client.query(
      `
      DELETE FROM meal_plan_template_assignments mpta
      USING meal_plan_templates mpt
      WHERE mpta.template_id = mpt.id
        AND mpta.food_id = $1
        AND mpt.user_id = $2
    `,
      [foodId, userId]
    );
    log(
      'info',
      `Deleted meal plan template assignments for food ${foodId} in templates by user ${userId}`
    );
    // 5. Delete food variants associated with this food
    await client.query('DELETE FROM food_variants WHERE food_id = $1', [
      foodId,
    ]);
    log('info', `Deleted food variants for food ${foodId}`);
    // 6. Finally, delete the food itself
    const result = await client.query(
      'DELETE FROM foods WHERE id = $1 AND user_id = $2 RETURNING id',
      [foodId, userId]
    );
    log('info', `Deleted food ${foodId} by user ${userId}`);
    await client.query('COMMIT');
    return result.rowCount > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Error deleting food and dependencies for food ${foodId} by user ${userId}:`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createFoodsInBulk(userId: any, foodDataArray: any) {
  class DuplicateFoodError extends Error {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    duplicates: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(message: any, duplicates: any) {
      super(message);
      this.name = 'DuplicateFoodError';
      this.duplicates = duplicates;
    }
  }
  // 1. --- Grouping incoming Variants by Food (name + brand)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupedFoods = foodDataArray.reduce((acc: any, variant: any) => {
    const key = `${variant.name}|${variant.brand}`;
    if (!acc[key]) {
      acc[key] = {
        name: variant.name,
        brand: variant.brand,
        is_custom: true,
        user_id: userId,
        shared_with_public: variant.shared_with_public || false,
        is_quick_food: variant.is_quick_food || false,
        variants: [],
      };
    }
    acc[key].variants.push(variant);
    return acc;
  }, {});
  const foodsToCreate = Object.values(groupedFoods);
  if (foodsToCreate.length === 0) {
    return {
      message: 'No food data provided to import.',
      createdFoods: 0,
      createdVariants: 0,
    };
  }
  // 2. Pre-flight Duplicate Check before starting the db transaction
  const potentialDuplicates = foodsToCreate.map((food) => [
    userId,
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    food.name,
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    food.brand,
  ]);
  const flatValues = potentialDuplicates.flat();
  let placeholderIndex = 1;
  const placeholderString = potentialDuplicates
    .map(
      () =>
        `($${placeholderIndex++}::uuid, $${placeholderIndex++}, $${placeholderIndex++})`
    )
    .join(', ');
  const duplicateCheckQuery = `
    SELECT name, brand FROM foods
    WHERE (user_id, name, brand) IN (VALUES ${placeholderString})
  `;
  const clientForDuplicateCheck = await getClient(userId);
  let existingFoods;
  try {
    const { rows } = await clientForDuplicateCheck.query(
      // User-specific check for duplicates
      duplicateCheckQuery,
      flatValues
    );
    existingFoods = rows;
  } finally {
    clientForDuplicateCheck.release();
  }
  if (existingFoods.length > 0) {
    // If duplicates are found, throw an error.
    throw new DuplicateFoodError(
      'The import was terminated because duplicate entries were found in your food list.',
      existingFoods
    );
  }
  // 3. Database Transaction starts here for Bulk Insert
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query('BEGIN');
    let totalFoodsCreated = 0;
    let totalVariantsCreated = 0;
    for (const food of foodsToCreate) {
      const foodResult = await client.query(
        `INSERT INTO foods (name, brand, is_custom, user_id, shared_with_public, is_quick_food,barcode,provider_external_id,provider_type, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
           RETURNING id`,
        [
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          food.name,
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          food.brand,
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          sanitizeBoolean(food.is_custom) ?? true,
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          food.user_id,
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          sanitizeBoolean(food.shared_with_public) ?? false,
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          sanitizeBoolean(food.is_quick_food) ?? false,
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          (food.barcode && normalizeBarcode(food.barcode)) || null,
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          food.provider_external_id || null,
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          food.provider_type || null,
        ]
      );
      const newFoodId = foodResult.rows[0].id;
      totalFoodsCreated++;
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      for (const variant of food.variants) {
        await client.query(
          `INSERT INTO food_variants (
              food_id, serving_size, serving_unit, is_default, calories, protein, carbs, fat,
              saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
              cholesterol, sodium, potassium, dietary_fiber, sugars,
              vitamin_a, vitamin_c, calcium, iron, glycemic_index, custom_nutrients, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
              $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, now(), now()
            )`,
          [
            newFoodId,
            sanitizeNumeric(variant.serving_size),
            variant.serving_unit,
            sanitizeBoolean(variant.is_default) ?? true,
            sanitizeNumeric(variant.calories),
            sanitizeNumeric(variant.protein),
            sanitizeNumeric(variant.carbs),
            sanitizeNumeric(variant.fat),
            sanitizeNumeric(variant.saturated_fat),
            sanitizeNumeric(variant.polyunsaturated_fat),
            sanitizeNumeric(variant.monounsaturated_fat),
            sanitizeNumeric(variant.trans_fat),
            sanitizeNumeric(variant.cholesterol),
            sanitizeNumeric(variant.sodium),
            sanitizeNumeric(variant.potassium),
            sanitizeNumeric(variant.dietary_fiber),
            sanitizeNumeric(variant.sugars),
            sanitizeNumeric(variant.vitamin_a),
            sanitizeNumeric(variant.vitamin_c),
            sanitizeNumeric(variant.calcium),
            sanitizeNumeric(variant.iron),
            sanitizeGlycemicIndex(variant.glycemic_index),
            variant.custom_nutrients || {},
          ]
        );
        totalVariantsCreated++;
      }
    }
    await client.query('COMMIT');
    return {
      message: 'Food data imported successfully.',
      createdFoods: totalFoodsCreated,
      createdVariants: totalVariantsCreated,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during bulk food import:', error);
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFoodsNeedingReview(userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT DISTINCT ON (fe.food_id)
          fe.food_id,
          f.name AS food_name,
          fv.serving_size,
          fv.serving_unit,
          fv.calories,
          f.updated_at AS food_updated_at,
          fe.created_at AS entry_created_at,
          f.user_id AS food_owner_id
       FROM food_entries fe
       JOIN foods f ON fe.food_id = f.id
       JOIN food_variants fv ON fe.variant_id = fv.id
       WHERE fe.user_id = $1
         AND f.updated_at > fe.created_at -- Food has been updated since the entry was created
         AND NOT EXISTS (
             SELECT 1 FROM user_ignored_updates uiu
             WHERE uiu.user_id = $1
               AND uiu.variant_id = fe.variant_id
               AND uiu.ignored_at_timestamp = f.updated_at
         )
       ORDER BY fe.food_id, fe.created_at DESC`,
      [userId]
    );
    return result.rows;
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
export { sanitizeGlycemicIndex };
export { sanitizeNumeric };
export { sanitizeBoolean };
export { searchFoods };
export { createFood };
export { findFoodByBarcode };
export { getFoodById };
export { getFoodOwnerId };
export { updateFood };
export { deleteFood };
export { getFoodsWithPagination };
export { countFoods };
export { getFoodDeletionImpact };
export { createFoodsInBulk };
export { getFoodsNeedingReview };
export { clearUserIgnoredUpdate };
export { deleteFoodAndDependencies };
export default {
  sanitizeGlycemicIndex,
  sanitizeNumeric,
  sanitizeBoolean,
  searchFoods,
  createFood,
  findFoodByBarcode,
  getFoodById,
  getFoodOwnerId,
  updateFood,
  deleteFood,
  getFoodsWithPagination,
  countFoods,
  getFoodDeletionImpact,
  createFoodsInBulk,
  getFoodsNeedingReview,
  clearUserIgnoredUpdate,
  deleteFoodAndDependencies,
};
