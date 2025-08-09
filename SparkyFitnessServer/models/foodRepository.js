const pool = require('../db/connection');
const { log } = require('../config/logging');
const format = require('pg-format'); // Required for bulkCreateFoodVariants

async function searchFoods(name, userId, exactMatch, broadMatch, checkCustom) {
  const client = await pool.connect();
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
          'is_default', fv.is_default
        ) AS default_variant
      FROM foods f
      LEFT JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
      WHERE f.is_quick_food = FALSE AND `;
    const queryParams = [];
    let paramIndex = 1;
 
    if (exactMatch) {
      query += `CONCAT(f.brand, ' ', f.name) ILIKE $${paramIndex++} AND f.user_id = $${paramIndex++}`;
      queryParams.push(name, userId);
    } else if (broadMatch) {
      query += `CONCAT(f.brand, ' ', f.name) ILIKE $${paramIndex++} AND (f.user_id = $${paramIndex++} OR f.is_custom = FALSE)`;
      queryParams.push(`%${name}%`, userId);
    } else if (checkCustom) {
      query += `f.name = $${paramIndex++} AND f.user_id = $${paramIndex++}`;
      queryParams.push(name, userId);
    } else {
      throw new Error('Invalid search parameters.');
    }
 
    query += ' LIMIT 3';
    const result = await client.query(query, queryParams);
    return result.rows;
  } finally {
    client.release();
  }
}

async function createFood(foodData) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // Start transaction

    // 1. Create the food entry
    const foodResult = await client.query(
      `INSERT INTO foods (
        name, is_custom, user_id, brand, barcode, provider_external_id, shared_with_public, provider_type, is_quick_food, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now()) RETURNING id, name, brand, is_custom, user_id, shared_with_public, is_quick_food`,
      [
        foodData.name, foodData.is_custom, foodData.user_id, foodData.brand, foodData.barcode, foodData.provider_external_id, foodData.shared_with_public, foodData.provider_type, foodData.is_quick_food || false
      ]
    );
    const newFood = foodResult.rows[0];

    // 2. Create the primary food variant and mark it as default
    const variantResult = await client.query(
      `INSERT INTO food_variants (
        food_id, serving_size, serving_unit, calories, protein, carbs, fat,
        saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
        cholesterol, sodium, potassium, dietary_fiber, sugars,
        vitamin_a, vitamin_c, calcium, iron, is_default, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, TRUE, now(), now()) RETURNING id`,
      [
        newFood.id, foodData.serving_size, foodData.serving_unit, foodData.calories, foodData.protein, foodData.carbs, foodData.fat,
        foodData.saturated_fat, foodData.polyunsaturated_fat, foodData.monounsaturated_fat, foodData.trans_fat,
        foodData.cholesterol, foodData.sodium, foodData.potassium, foodData.dietary_fiber, foodData.sugars,
        foodData.vitamin_a, foodData.vitamin_c, foodData.calcium, foodData.iron
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
      }
    };
  } catch (error) {
    await client.query('ROLLBACK'); // Rollback transaction on error
    throw error;
  } finally {
    client.release();
  }
}

async function getFoodById(foodId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
        f.id, f.name, f.brand, f.is_custom, f.user_id, f.shared_with_public,
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
          'is_default', fv.is_default
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

async function getFoodOwnerId(foodId) {
  const client = await pool.connect();
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

async function updateFood(id, userId, foodData) {
  const client = await pool.connect();
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
        updated_at = now()
      WHERE id = $8 AND user_id = $9
      RETURNING *`,
      [
        foodData.name, foodData.is_custom, foodData.brand, foodData.barcode,
        foodData.provider_external_id, foodData.shared_with_public, foodData.provider_type, id, userId
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteFood(id, userId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM foods WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function getFoodsWithPagination(searchTerm, foodFilter, authenticatedUserId, limit, offset, sortBy) {
  const client = await pool.connect();
  try {
    let whereClauses = ["f.is_quick_food = FALSE"];
    const queryParams = [];
    let paramIndex = 1;

    if (searchTerm) {
      whereClauses.push(`CONCAT(brand, ' ', name) ILIKE $${paramIndex}`);
      queryParams.push(`%${searchTerm}%`);
      paramIndex++;
    }

    if (foodFilter === 'mine') {
      whereClauses.push(`user_id = $${paramIndex}`);
      queryParams.push(authenticatedUserId);
      paramIndex++;
    } else if (foodFilter === 'family') {
      whereClauses.push(`user_id IN (SELECT owner_user_id FROM family_access WHERE family_user_id = $${paramIndex} AND is_active = TRUE AND (access_end_date IS NULL OR access_end_date > NOW()))`);
      queryParams.push(authenticatedUserId);
      paramIndex++;
    } else if (foodFilter === 'public') {
      whereClauses.push(`shared_with_public = TRUE`);
    } else if (foodFilter === 'all') {
      whereClauses.push(`(
        user_id IS NULL OR user_id = $${paramIndex} OR shared_with_public = TRUE OR
        user_id IN (SELECT owner_user_id FROM family_access WHERE family_user_id = $${paramIndex} AND is_active = TRUE AND (access_end_date IS NULL OR access_end_date > NOW()))
      )`);
      queryParams.push(authenticatedUserId);
      paramIndex++;
    }

    let query = `
      SELECT
        f.id, f.name, f.brand, f.is_custom, f.user_id, f.shared_with_public,
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
          'is_default', fv.is_default
        ) AS default_variant
      FROM foods f
      LEFT JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
      WHERE ${whereClauses.join(' AND ')}
    `;

    let orderByClause = 'name ASC';
    if (sortBy) {
      const [sortField, sortOrder] = sortBy.split(':');
      const allowedSortFields = ['name', 'calories', 'protein', 'carbs', 'fat'];
      const allowedSortOrders = ['asc', 'desc'];

      if (allowedSortFields.includes(sortField) && allowedSortOrders.includes(sortOrder)) {
        orderByClause = `${sortField} ${sortOrder.toUpperCase()}`;
      } else {
        log('warn', `Invalid sortBy parameter received: ${sortBy}. Using default sort.`);
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

async function countFoods(searchTerm, foodFilter, authenticatedUserId) {
  const client = await pool.connect();
  try {
    let whereClauses = ["is_quick_food = FALSE"];
    const countQueryParams = [];
    let paramIndex = 1;

    if (searchTerm) {
      whereClauses.push(`CONCAT(brand, ' ', name) ILIKE $${paramIndex}`);
      countQueryParams.push(`%${searchTerm}%`);
      paramIndex++;
    }

    if (foodFilter === 'mine') {
      whereClauses.push(`user_id = $${paramIndex}`);
      countQueryParams.push(authenticatedUserId);
      paramIndex++;
    } else if (foodFilter === 'family') {
      whereClauses.push(`user_id IN (SELECT owner_user_id FROM family_access WHERE family_user_id = $${paramIndex} AND is_active = TRUE AND (access_end_date IS NULL OR access_end_date > NOW()))`);
      countQueryParams.push(authenticatedUserId);
      paramIndex++;
    } else if (foodFilter === 'public') {
      whereClauses.push(`shared_with_public = TRUE`);
    } else if (foodFilter === 'all') {
      whereClauses.push(`(
        user_id IS NULL OR user_id = $${paramIndex} OR shared_with_public = TRUE OR
        user_id IN (SELECT owner_user_id FROM family_access WHERE family_user_id = $${paramIndex} AND is_active = TRUE AND (access_end_date IS NULL OR access_end_date > NOW()))
      )`);
      countQueryParams.push(authenticatedUserId);
      paramIndex++;
    }

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

async function createFoodVariant(variantData) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO food_variants (
        food_id, serving_size, serving_unit, calories, protein, carbs, fat,
        saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
        cholesterol, sodium, potassium, dietary_fiber, sugars,
        vitamin_a, vitamin_c, calcium, iron, is_default, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, now(), now()) RETURNING id`,
      [
        variantData.food_id, variantData.serving_size, variantData.serving_unit, variantData.calories, variantData.protein, variantData.carbs, variantData.fat,
        variantData.saturated_fat, variantData.polyunsaturated_fat, variantData.monounsaturated_fat, variantData.trans_fat,
        variantData.cholesterol, variantData.sodium, variantData.potassium, variantData.dietary_fiber, variantData.sugars,
        variantData.vitamin_a, variantData.vitamin_c, variantData.calcium, variantData.iron, variantData.is_default || false
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getFoodVariantById(id) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM food_variants WHERE id = $1',
      [id]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
async function getFoodVariantOwnerId(variantId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT f.user_id
       FROM food_variants fv
       JOIN foods f ON fv.food_id = f.id
       WHERE fv.id = $1`,
      [variantId]
    );
    const ownerId = result.rows[0]?.user_id;
    log('info', `getFoodVariantOwnerId: Variant ID ${variantId} owner: ${ownerId}`);
    return ownerId;
  } finally {
    client.release();
  }
}

async function getFoodVariantsByFoodId(foodId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM food_variants WHERE food_id = $1',
      [foodId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function updateFoodVariant(id, variantData) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE food_variants SET
        food_id = COALESCE($1, food_id),
        serving_size = COALESCE($2, serving_size),
        serving_unit = COALESCE($3, serving_unit),
        calories = COALESCE($4, calories),
        protein = COALESCE($5, protein),
        carbs = COALESCE($6, carbs),
        fat = COALESCE($7, fat),
        saturated_fat = COALESCE($8, saturated_fat),
        polyunsaturated_fat = COALESCE($9, polyunsaturated_fat),
        monounsaturated_fat = COALESCE($10, monounsaturated_fat),
        trans_fat = COALESCE($11, trans_fat),
        cholesterol = COALESCE($12, cholesterol),
        sodium = COALESCE($13, sodium),
        potassium = COALESCE($14, potassium),
        dietary_fiber = COALESCE($15, dietary_fiber),
        sugars = COALESCE($16, sugars),
        vitamin_a = COALESCE($17, vitamin_a),
        vitamin_c = COALESCE($18, vitamin_c),
        calcium = COALESCE($19, calcium),
        iron = COALESCE($20, iron),
        is_default = COALESCE($21, is_default),
        updated_at = now()
      WHERE id = $22
      RETURNING *`,
      [
        variantData.food_id, variantData.serving_size, variantData.serving_unit, variantData.calories, variantData.protein, variantData.carbs, variantData.fat,
        variantData.saturated_fat, variantData.polyunsaturated_fat, variantData.monounsaturated_fat, variantData.trans_fat,
        variantData.cholesterol, variantData.sodium, variantData.potassium, variantData.dietary_fiber, variantData.sugars,
        variantData.vitamin_a, variantData.vitamin_c, variantData.calcium, variantData.iron, variantData.is_default, id
      ]
    );

    // If this variant is being set as default, ensure all other variants for this food_id are not default
    if (variantData.is_default) {
      await client.query(
        `UPDATE food_variants SET is_default = FALSE WHERE food_id = $1 AND id != $2`,
        [variantData.food_id, id]
      );
    }

    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteFoodVariant(id) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM food_variants WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function createFoodEntry(entryData) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO food_entries (user_id, food_id, meal_type, quantity, unit, entry_date, variant_id, meal_plan_template_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [entryData.user_id, entryData.food_id, entryData.meal_type, entryData.quantity, entryData.unit, entryData.entry_date, entryData.variant_id, entryData.meal_plan_template_id]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}
 
async function getFoodEntryOwnerId(entryId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT user_id FROM food_entries WHERE id = $1',
      [entryId]
    );
    return result.rows[0]?.user_id;
  } finally {
    client.release();
  }
}

async function deleteFoodEntry(entryId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM food_entries WHERE id = $1 RETURNING id',
      [entryId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
async function updateFoodEntry(entryId, userId, entryData) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE food_entries SET
        meal_type = COALESCE($1, meal_type),
        quantity = COALESCE($2, quantity),
        unit = COALESCE($3, unit),
        entry_date = COALESCE($4, entry_date),
        variant_id = COALESCE($5, variant_id)
      WHERE id = $6 AND user_id = $7
      RETURNING *`,
      [
        entryData.meal_type,
        entryData.quantity,
        entryData.unit,
        entryData.entry_date,
        entryData.variant_id,
        entryId,
        userId
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getFoodEntriesByDate(userId, selectedDate) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
        fe.id, fe.food_id, fe.meal_type, fe.quantity, fe.unit, fe.variant_id, fe.entry_date, fe.meal_plan_template_id,
        json_build_object(
          'id', f.id,
          'name', f.name,
          'brand', f.brand,
          'is_custom', f.is_custom,
          'user_id', f.user_id,
          'shared_with_public', f.shared_with_public
        ) AS foods,
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
          'iron', fv.iron
        ) AS food_variants
       FROM food_entries fe
       JOIN foods f ON fe.food_id = f.id
       JOIN food_variants fv ON fe.variant_id = fv.id
       WHERE fe.user_id = $1 AND fe.entry_date = $2`,
      [userId, selectedDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getFoodEntriesByDateAndMealType(userId, date, mealType) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
        fe.id, fe.food_id, fe.meal_type, fe.quantity, fe.unit, fe.variant_id, fe.entry_date, fe.meal_plan_template_id,
        json_build_object(
          'id', f.id,
          'name', f.name,
          'brand', f.brand,
          'is_custom', f.is_custom,
          'user_id', f.user_id,
          'shared_with_public', f.shared_with_public
        ) AS foods,
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
          'iron', fv.iron
        ) AS food_variants
       FROM food_entries fe
       JOIN foods f ON fe.food_id = f.id
       JOIN food_variants fv ON fe.variant_id = fv.id
       WHERE fe.user_id = $1 AND fe.entry_date = $2 AND fe.meal_type = $3`,
      [userId, date, mealType]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getFoodEntriesByDateRange(userId, startDate, endDate) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
        fe.id, fe.food_id, fe.meal_type, fe.quantity, fe.unit, fe.variant_id, fe.entry_date, fe.meal_plan_template_id,
        f.name AS food_name, f.brand, f.is_custom, f.user_id, f.shared_with_public,
        fv.serving_size, fv.serving_unit, fv.calories, fv.protein, fv.carbs, fv.fat,
        fv.saturated_fat, fv.polyunsaturated_fat, fv.monounsaturated_fat, fv.trans_fat,
        fv.cholesterol, fv.sodium, fv.potassium, fv.dietary_fiber, fv.sugars,
        fv.vitamin_a, fv.vitamin_c, fv.calcium, fv.iron
       FROM food_entries fe
       JOIN foods f ON fe.food_id = f.id
       JOIN food_variants fv ON fe.variant_id = fv.id
       WHERE fe.user_id = $1 AND fe.entry_date BETWEEN $2 AND $3
       ORDER BY fe.entry_date`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function findFoodByNameAndBrand(name, brand, userId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
        f.id, f.name, f.brand, f.is_custom, f.user_id, f.shared_with_public,
        fv.serving_size, fv.serving_unit, fv.calories, fv.protein, fv.carbs, fv.fat,
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
          'is_default', fv.is_default
        ) AS default_variant
       FROM foods f
       LEFT JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
       WHERE f.name ILIKE $1 AND (f.brand IS NULL OR f.brand ILIKE $2)
         AND (f.user_id = $3 OR f.is_custom = FALSE)`,
      [name, brand || null, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function bulkCreateFoodVariants(variantsData) {
  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO food_variants (
        food_id, serving_size, serving_unit, calories, protein, carbs, fat,
        saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
        cholesterol, sodium, potassium, dietary_fiber, sugars,
        vitamin_a, vitamin_c, calcium, iron, is_default, created_at, updated_at
      ) VALUES %L RETURNING id`;

    const values = variantsData.map(variant => [
      variant.food_id, variant.serving_size, variant.serving_unit, variant.calories, variant.protein, variant.carbs, variant.fat,
      variant.saturated_fat, variant.polyunsaturated_fat, variant.monounsaturated_fat, variant.trans_fat,
      variant.cholesterol, variant.sodium, variant.potassium, variant.dietary_fiber, variant.sugars,
      variant.vitamin_a, variant.vitamin_c, variant.calcium, variant.iron, variant.is_default || false, 'now()', 'now()'
    ]);

    const formattedQuery = format(query, values);
    const result = await client.query(formattedQuery);
    return result.rows;
  } finally {
    client.release();
  }
}

async function deleteFoodEntriesByMealPlanId(mealPlanId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'DELETE FROM food_entries WHERE meal_plan_template_id = $1 AND user_id = $2 RETURNING id',
            [mealPlanId, userId]
        );
        return result.rowCount;
    } catch (error) {
        log('error', `Error deleting food entries for meal plan ${mealPlanId}:`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function deleteFoodEntriesByTemplateId(templateId, userId, currentClientDate = null) {
    const client = await pool.connect();
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
        log('error', `Error deleting food entries for template ${templateId}:`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function createFoodEntriesFromTemplate(templateId, userId, currentClientDate = null) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        log('info', `Creating food entries from template ${templateId} for user ${userId}`);

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
        const templateResult = await client.query(templateQuery, [templateId, userId]);
        if (templateResult.rows.length === 0) {
            throw new Error('Meal plan template not found or access denied.');
        }

        const { start_date, end_date, assignments } = templateResult.rows[0];
        if (!assignments || assignments.length === 0) {
            log('info', `No assignments for template ${templateId}, skipping food entry creation.`);
            await client.query('COMMIT');
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
            const assignmentsForDay = assignments.filter(a => a.day_of_week === dayOfWeek);

            for (const assignment of assignmentsForDay) {
                let foodsToProcess = [];

                if (assignment.item_type === 'meal') {
                    const mealFoodsResult = await client.query(
                        `SELECT food_id, variant_id, quantity, unit FROM meal_foods WHERE meal_id = $1`,
                        [assignment.meal_id]
                    );
                    foodsToProcess = mealFoodsResult.rows;
                } else if (assignment.item_type === 'food') {
                    foodsToProcess.push({
                        food_id: assignment.food_id,
                        variant_id: assignment.variant_id,
                        quantity: assignment.quantity,
                        unit: assignment.unit,
                    });
                }

                for (const foodItem of foodsToProcess) {
                    // Check for existing entry to prevent duplicates
                    const existingEntry = await client.query(
                        `SELECT id FROM food_entries
                         WHERE user_id = $1
                            AND food_id = $2
                            AND meal_type = $3
                            AND entry_date = $4
                            AND variant_id = $5`,
                        [userId, foodItem.food_id, assignment.meal_type, currentDate, foodItem.variant_id]
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
                            templateId // Still link to the template if it's a template-generated entry
                        ];
                        log('info', `Inserting food entry for template ${templateId}, day ${currentDate.toISOString().split('T')[0]}:`, foodEntryData);
                        await client.query(
                            `INSERT INTO food_entries (user_id, food_id, meal_type, quantity, unit, entry_date, variant_id, meal_plan_template_id)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                            foodEntryData
                        );
                    } else {
                        log('info', `Skipping duplicate food entry for template ${templateId}, day ${currentDate.toISOString().split('T')[0]}:`, existingEntry.rows[0].id);
                    }
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        await client.query('COMMIT');
        log('info', `Successfully created food entries from template ${templateId}`);
    } catch (error) {
        await client.query('ROLLBACK');
        log('error', `Error creating food entries from template ${templateId}: ${error.message}`, error);
        throw error;
    } finally {
        client.release();
    }
}

async function bulkCreateFoodEntries(entriesData) {
  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO food_entries (user_id, food_id, meal_type, quantity, unit, entry_date, variant_id, meal_plan_template_id)
      VALUES %L RETURNING *`;

    const values = entriesData.map(entry => [
      entry.user_id,
      entry.food_id,
      entry.meal_type,
      entry.quantity,
      entry.unit,
      entry.entry_date,
      entry.variant_id,
      entry.meal_plan_template_id || null // meal_plan_template_id can be null
    ]);

    const formattedQuery = format(query, values);
    const result = await client.query(formattedQuery);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getFoodDataProviderById(providerId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM external_data_providers WHERE id = $1',
      [providerId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getRecentFoods(userId, limit) {
  const client = await pool.connect();
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
          'is_default', fv.is_default
        ) AS default_variant
      FROM food_entries fe
      JOIN foods f ON fe.food_id = f.id
      LEFT JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
      WHERE fe.user_id = $1
      GROUP BY f.id, f.name, f.brand, f.is_custom, f.user_id, f.shared_with_public, f.provider_external_id, f.provider_type, fv.id, fv.serving_size, fv.serving_unit, fv.calories, fv.protein, fv.carbs, fv.fat, fv.saturated_fat, fv.polyunsaturated_fat, fv.monounsaturated_fat, fv.trans_fat, fv.cholesterol, fv.sodium, fv.potassium, fv.dietary_fiber, fv.sugars, fv.vitamin_a, fv.vitamin_c, fv.calcium, fv.iron, fv.is_default
      ORDER BY MAX(fe.entry_date) DESC, MAX(fe.created_at) DESC
      LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getTopFoods(userId, limit) {
  const client = await pool.connect();
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
          'is_default', fv.is_default
        ) AS default_variant,
        COUNT(fe.food_id) AS usage_count
      FROM food_entries fe
      JOIN foods f ON fe.food_id = f.id
      LEFT JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
      WHERE fe.user_id = $1
      GROUP BY f.id, f.name, f.brand, f.is_custom, f.user_id, f.shared_with_public, f.provider_external_id, f.provider_type, fv.id, fv.serving_size, fv.serving_unit, fv.calories, fv.protein, fv.carbs, fv.fat, fv.saturated_fat, fv.polyunsaturated_fat, fv.monounsaturated_fat, fv.trans_fat, fv.cholesterol, fv.sodium, fv.potassium, fv.dietary_fiber, fv.sugars, fv.vitamin_a, fv.vitamin_c, fv.calcium, fv.iron, fv.is_default
      ORDER BY usage_count DESC
      LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

module.exports = {
  searchFoods,
  createFood,
  getFoodById,
  getFoodOwnerId,
  updateFood,
  deleteFood,
  getFoodsWithPagination,
  countFoods,
  createFoodVariant,
  getFoodVariantById,
  getFoodVariantOwnerId,
  getFoodVariantsByFoodId,
  updateFoodVariant,
  deleteFoodVariant,
  createFoodEntry,
  getFoodEntryOwnerId,
  updateFoodEntry,
  deleteFoodEntry,
  getFoodEntriesByDate,
  getFoodEntriesByDateAndMealType,
  getFoodEntriesByDateRange,
  findFoodByNameAndBrand,
  bulkCreateFoodVariants,
  bulkCreateFoodEntries,
  deleteFoodEntriesByMealPlanId,
  deleteFoodEntriesByTemplateId,
  createFoodEntriesFromTemplate,
  getFoodDataProviderById,
  getFoodEntryByDetails,
  getDailyNutritionSummary,
  getFoodDeletionImpact,
  getRecentFoods, // New export
  getTopFoods,    // New export
};

async function getDailyNutritionSummary(userId, date) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
        SUM(fv.calories * fe.quantity / fv.serving_size) AS total_calories,
        SUM(fv.protein * fe.quantity / fv.serving_size) AS total_protein,
        SUM(fv.carbs * fe.quantity / fv.serving_size) AS total_carbs,
        SUM(fv.fat * fe.quantity / fv.serving_size) AS total_fat
       FROM food_entries fe
       JOIN food_variants fv ON fe.variant_id = fv.id
       WHERE fe.user_id = $1 AND fe.entry_date = $2`,
      [userId, date]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getFoodDeletionImpact(foodId) {
  const client = await pool.connect();
  try {
    const queries = [
      client.query('SELECT COUNT(*) FROM food_entries WHERE food_id = $1', [foodId]),
      client.query('SELECT COUNT(*) FROM meal_foods WHERE food_id = $1', [foodId]),
      client.query('SELECT COUNT(*) FROM meal_plans WHERE food_id = $1', [foodId]),
      client.query('SELECT COUNT(*) FROM meal_plan_template_assignments WHERE food_id = $1', [foodId]),
    ];

    const results = await Promise.all(queries);

    return {
      foodEntriesCount: parseInt(results[0].rows[0].count, 10),
      mealFoodsCount: parseInt(results[1].rows[0].count, 10),
      mealPlansCount: parseInt(results[2].rows[0].count, 10),
      mealPlanTemplateAssignmentsCount: parseInt(results[3].rows[0].count, 10),
    };
  } finally {
    client.release();
  }
}

async function getFoodEntryByDetails(userId, foodId, mealType, entryDate, variantId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id FROM food_entries
       WHERE user_id = $1
         AND food_id = $2
         AND meal_type = $3
         AND entry_date = $4
         AND variant_id = $5`,
      [userId, foodId, mealType, entryDate, variantId]
    );
    return result.rows[0]; // Returns the entry if found, otherwise undefined
  } finally {
    client.release();
  }
}