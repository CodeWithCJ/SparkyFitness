const { getClient, getSystemClient } = require("../db/poolManager");
const { log } = require("../config/logging");

function sanitizeGlycemicIndex(gi) {
  const allowedGICategories = ['None', 'Very Low', 'Low', 'Medium', 'High', 'Very High'];
  if (gi === "0" || gi === "0.0" || gi === null || gi === undefined || gi === '' || !allowedGICategories.includes(gi)) {
    return null;
  }
  return gi;
}

async function searchFoods(name, userId, exactMatch, broadMatch, checkCustom, limit = 10) {
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
          'glycemic_index', fv.glycemic_index
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
      throw new Error("Invalid search parameters.");
    }

    query += ` LIMIT $${paramIndex++}`;
    queryParams.push(limit);
    const result = await client.query(query, queryParams);
    return result.rows;
  } finally {
    client.release();
  }
}

async function createFood(foodData) {
  const client = await getClient(foodData.user_id); // User-specific operation
  try {
    await client.query("BEGIN"); // Start transaction

    // 1. Create the food entry
    const foodResult = await client.query(
      `INSERT INTO foods (
        name, is_custom, user_id, brand, barcode, provider_external_id, shared_with_public, provider_type, is_quick_food, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now()) RETURNING id, name, brand, is_custom, user_id, shared_with_public, is_quick_food`,
      [
        foodData.name,
        foodData.is_custom,
        foodData.user_id,
        foodData.brand,
        foodData.barcode,
        foodData.provider_external_id,
        foodData.shared_with_public,
        foodData.provider_type,
        foodData.is_quick_food || false,
      ]
    );
    const newFood = foodResult.rows[0];

    // 2. Create the primary food variant and mark it as default
    const variantResult = await client.query(
      `INSERT INTO food_variants (
        food_id, serving_size, serving_unit, calories, protein, carbs, fat,
        saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
        cholesterol, sodium, potassium, dietary_fiber, sugars,
        vitamin_a, vitamin_c, calcium, iron, is_default, glycemic_index, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, TRUE, $21, now(), now()) RETURNING id`,
      [
        newFood.id,
        foodData.serving_size,
        foodData.serving_unit,
        foodData.calories,
        foodData.protein,
        foodData.carbs,
        foodData.fat,
        foodData.saturated_fat,
        foodData.polyunsaturated_fat,
        foodData.monounsaturated_fat,
        foodData.trans_fat,
        foodData.cholesterol,
        foodData.sodium,
        foodData.potassium,
        foodData.dietary_fiber,
        foodData.sugars,
        foodData.vitamin_a,
        foodData.vitamin_c,
        foodData.calcium,
        foodData.iron,
        sanitizeGlycemicIndex(foodData.glycemic_index),
      ]
    );
    const newVariantId = variantResult.rows[0].id;

    await client.query("COMMIT"); // Commit transaction

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
      },
    };
  } catch (error) {
    await client.query("ROLLBACK"); // Rollback transaction on error
    throw error;
  } finally {
    client.release();
  }
}

async function getFoodById(foodId, userId) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
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
          'is_default', fv.is_default,
          'glycemic_index', fv.glycemic_index
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

async function getFoodOwnerId(foodId, userId) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const foodResult = await client.query(
      "SELECT user_id FROM foods WHERE id = $1",
      [foodId]
    );
    const ownerId = foodResult.rows[0]?.user_id;
    log("info", `getFoodOwnerId: Food ID ${foodId} owner: ${ownerId}`);
    return ownerId;
  } finally {
    client.release();
  }
}

async function updateFood(id, userId, foodData) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE foods SET
        name = COALESCE($1, name),
        is_custom = COALESCE($2, is_custom),
        brand = COALESCE($3, brand),
        barcode = COALESCE($4, barcode),
        provider_external_id = COALESCE($5, provider_external_id),
        shared_with_public = $6,
        provider_type = COALESCE($7, provider_type),
        is_quick_food = COALESCE($8, is_quick_food),
        updated_at = now()
      WHERE id = $9
      RETURNING *`,
      [
        foodData.name,
        foodData.is_custom,
        foodData.brand,
        foodData.barcode,
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

async function deleteFood(id, userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      "DELETE FROM foods WHERE id = $1 RETURNING id",
      [id]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function getFoodsWithPagination(
  searchTerm,
  foodFilter,
  authenticatedUserId,
  limit,
  offset,
  sortBy
) {
  const client = await getClient(authenticatedUserId); // User-specific operation
  try {
    let whereClauses = ["f.is_quick_food = FALSE"];
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
          'is_default', fv.is_default,
          'glycemic_index', fv.glycemic_index
        ) AS default_variant
      FROM foods f
      LEFT JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
      WHERE ${whereClauses.join(" AND ")}
    `;

    let orderByClause = "name ASC";
    if (sortBy) {
      const [sortField, sortOrder] = sortBy.split(":");
      const allowedSortFields = ["name", "calories", "protein", "carbs", "fat"];
      const allowedSortOrders = ["asc", "desc"];

      if (
        allowedSortFields.includes(sortField) &&
        allowedSortOrders.includes(sortOrder)
      ) {
        orderByClause = `${sortField} ${sortOrder.toUpperCase()}`;
      } else {
        log(
          "warn",
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

async function countFoods(searchTerm, foodFilter, authenticatedUserId) {
  const client = await getClient(authenticatedUserId); // User-specific operation
  try {
    let whereClauses = ["is_quick_food = FALSE"];
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
      WHERE ${whereClauses.join(" AND ")}
    `;
    const countResult = await client.query(countQuery, countQueryParams);
    return parseInt(countResult.rows[0].count, 10);
  } finally {
    client.release();
  }
}

async function findFoodByNameAndBrand(name, brand, userId) {
  const client = await getClient(userId); // User-specific operation
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
          'is_default', fv.is_default,
          'glycemic_index', fv.glycemic_index
        ) AS default_variant
       FROM foods f
       LEFT JOIN food_variants fv ON f.id = fv.food_id AND fv.is_default = TRUE
       WHERE f.name ILIKE $1 AND (f.brand IS NULL OR f.brand ILIKE $2)
         AND (f.is_custom = FALSE)`,
      [name, brand || null]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getFoodDeletionImpact(foodId, authenticatedUserId) {
  const client = await getClient(authenticatedUserId); // Client for authenticated user's RLS
  const systemClient = await getSystemClient(); // Client to bypass RLS for cross-user checks
  try {
    // Check if the food is publicly shared (using systemClient to bypass RLS)
    const publicFoodResult = await systemClient.query(
      "SELECT shared_with_public FROM foods WHERE id = $1",
      [foodId]
    );
    const isPubliclyShared = publicFoodResult.rows[0]?.shared_with_public || false;

    // Get food owner ID (using systemClient to bypass RLS)
    const foodOwnerResult = await systemClient.query(
      "SELECT user_id FROM foods WHERE id = $1",
      [foodId]
    );
    const foodOwnerId = foodOwnerResult.rows[0]?.user_id;

    // Count references by the authenticated user (using client with RLS)
    const currentUserReferencesQueries = [
      client.query("SELECT COUNT(*) FROM food_entries WHERE food_id = $1 AND user_id = $2", [foodId, authenticatedUserId]),
      client.query("SELECT COUNT(*) FROM meal_foods mf JOIN meals m ON mf.meal_id = m.id WHERE mf.food_id = $1 AND m.user_id = $2", [foodId, authenticatedUserId]),
      client.query("SELECT COUNT(*) FROM meal_plans mp WHERE mp.food_id = $1 AND mp.user_id = $2", [foodId, authenticatedUserId]),
      client.query("SELECT COUNT(*) FROM meal_plan_template_assignments mpta JOIN meal_plan_templates mpt ON mpta.template_id = mpt.id WHERE mpta.food_id = $1 AND mpt.user_id = $2", [foodId, authenticatedUserId]),
    ];
    const currentUserReferencesResults = await Promise.all(currentUserReferencesQueries);
    const currentUserFoodEntriesCount = parseInt(currentUserReferencesResults[0].rows[0].count, 10);
    const currentUserMealFoodsCount = parseInt(currentUserReferencesResults[1].rows[0].count, 10);
    const currentUserMealPlansCount = parseInt(currentUserReferencesResults[2].rows[0].count, 10);
    const currentUserMealPlanTemplateAssignmentsCount = parseInt(currentUserReferencesResults[3].rows[0].count, 10);

    const currentUserReferences =
      currentUserFoodEntriesCount +
      currentUserMealFoodsCount +
      currentUserMealPlansCount +
      currentUserMealPlanTemplateAssignmentsCount;

    // Count references by other users (excluding the authenticated user) (using systemClient to bypass RLS)
    const otherUserReferencesQueries = [
      systemClient.query("SELECT COUNT(*) FROM food_entries WHERE food_id = $1 AND user_id != $2", [foodId, authenticatedUserId]),
      systemClient.query("SELECT COUNT(*) FROM meal_foods mf JOIN meals m ON mf.meal_id = m.id WHERE mf.food_id = $1 AND m.user_id != $2", [foodId, authenticatedUserId]),
      systemClient.query("SELECT COUNT(*) FROM meal_plans mp WHERE mp.food_id = $1 AND mp.user_id != $2", [foodId, authenticatedUserId]),
      systemClient.query("SELECT COUNT(*) FROM meal_plan_template_assignments mpta JOIN meal_plan_templates mpt ON mpta.template_id = mpt.id WHERE mpta.food_id = $1 AND mpt.user_id != $2", [foodId, authenticatedUserId]),
    ];
    const otherUserReferencesResults = await Promise.all(otherUserReferencesQueries);
    const otherUserFoodEntriesCount = parseInt(otherUserReferencesResults[0].rows[0].count, 10);
    const otherUserMealFoodsCount = parseInt(otherUserReferencesResults[1].rows[0].count, 10);
    const otherUserMealPlansCount = parseInt(otherUserReferencesResults[2].rows[0].count, 10);
    const otherUserMealPlanTemplateAssignmentsCount = parseInt(otherUserReferencesResults[3].rows[0].count, 10);

    const otherUserReferences =
      otherUserFoodEntriesCount +
      otherUserMealFoodsCount +
      otherUserMealPlansCount +
      otherUserMealPlanTemplateAssignmentsCount;

    // Get users who have family access to this food (if the food owner is the authenticated user)
    let familySharedUsers = [];
    if (foodOwnerId === authenticatedUserId) {
      const familyAccessResult = await client.query( // Use client with RLS for family access check
        `SELECT fa.family_user_id
         FROM family_access fa
         WHERE fa.owner_user_id = $1
           AND fa.is_active = TRUE
           AND (fa.access_end_date IS NULL OR fa.access_end_date > NOW())
           AND (fa.access_permissions->>'diary')::boolean = TRUE`,
        [authenticatedUserId]
      );
      familySharedUsers = familyAccessResult.rows.map(row => row.family_user_id);
    }

    return {
      foodEntriesCount: currentUserFoodEntriesCount + otherUserFoodEntriesCount,
      mealFoodsCount: currentUserMealFoodsCount + otherUserMealFoodsCount,
      mealPlansCount: currentUserMealPlansCount + otherUserMealPlansCount,
      mealPlanTemplateAssignmentsCount: currentUserMealPlanTemplateAssignmentsCount + otherUserMealPlanTemplateAssignmentsCount,
      totalReferences: currentUserReferences + otherUserReferences,
      currentUserReferences: currentUserReferences,
      otherUserReferences: otherUserReferences,
      isPubliclyShared: isPubliclyShared,
      familySharedUsers: familySharedUsers,
    };
  } finally {
    client.release();
    systemClient.release(); // Release the system client as well
  }
}

async function deleteFoodAndDependencies(foodId, userId) {
  const client = await getClient(userId);
  try {
    await client.query("BEGIN");

    // 1. Delete food entries referencing this food for the current user
    await client.query("DELETE FROM food_entries WHERE food_id = $1 AND user_id = $2", [foodId, userId]);
    log("info", `Deleted food entries for food ${foodId} by user ${userId}`);

    // 2. Delete meal_foods referencing this food for meals owned by the current user
    await client.query(`
      DELETE FROM meal_foods mf
      USING meals m
      WHERE mf.meal_id = m.id
        AND mf.food_id = $1
        AND m.user_id = $2
    `, [foodId, userId]);
    log("info", `Deleted meal foods for food ${foodId} in meals by user ${userId}`);

    // 3. Delete meal_plans referencing this food for the current user
    await client.query("DELETE FROM meal_plans WHERE food_id = $1 AND user_id = $2", [foodId, userId]);
    log("info", `Deleted meal plans for food ${foodId} by user ${userId}`);

    // 4. Delete meal_plan_template_assignments referencing this food for templates owned by the current user
    await client.query(`
      DELETE FROM meal_plan_template_assignments mpta
      USING meal_plan_templates mpt
      WHERE mpta.template_id = mpt.id
        AND mpta.food_id = $1
        AND mpt.user_id = $2
    `, [foodId, userId]);
    log("info", `Deleted meal plan template assignments for food ${foodId} in templates by user ${userId}`);

    // 5. Delete food variants associated with this food
    await client.query("DELETE FROM food_variants WHERE food_id = $1", [foodId]);
    log("info", `Deleted food variants for food ${foodId}`);

    // 6. Finally, delete the food itself
    const result = await client.query("DELETE FROM foods WHERE id = $1 AND user_id = $2 RETURNING id", [foodId, userId]);
    log("info", `Deleted food ${foodId} by user ${userId}`);

    await client.query("COMMIT");
    return result.rowCount > 0;
  } catch (error) {
    await client.query("ROLLBACK");
    log("error", `Error deleting food and dependencies for food ${foodId} by user ${userId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function createFoodsInBulk(userId, foodDataArray) {
  class DuplicateFoodError extends Error {
    constructor(message, duplicates) {
      super(message);
      this.name = "DuplicateFoodError";
      this.duplicates = duplicates;
    }
  }

  // 1. --- Grouping incoming Variants by Food (name + brand)
  const groupedFoods = foodDataArray.reduce((acc, variant) => {
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
      message: "No food data provided to import.",
      createdFoods: 0,
      createdVariants: 0,
    };
  }

  // 2. Pre-flight Duplicate Check before starting the db transaction
  const potentialDuplicates = foodsToCreate.map((food) => [
    userId,
    food.name,
    food.brand,
  ]);

  const flatValues = potentialDuplicates.flat();

  let placeholderIndex = 1;
  const placeholderString = potentialDuplicates
    .map(
      () =>
        `($${placeholderIndex++}::uuid, $${placeholderIndex++}, $${placeholderIndex++})`
    )
    .join(", ");

  const duplicateCheckQuery = `
    SELECT name, brand FROM foods
    WHERE (user_id, name, brand) IN (VALUES ${placeholderString})
  `;

  const clientForDuplicateCheck = await getClient(userId);
  let existingFoods = [];
  try {
    const { rows } = await clientForDuplicateCheck.query( // User-specific check for duplicates
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
      `The import was terminated because duplicate entries were found in your food list.`,
      existingFoods
    );
  }

  // 3. Database Transaction starts here for Bulk Insert
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query("BEGIN");

    let totalFoodsCreated = 0;
    let totalVariantsCreated = 0;

    for (const food of foodsToCreate) {
      const foodResult = await client.query(
        `INSERT INTO foods (name, brand, is_custom, user_id, shared_with_public, is_quick_food,barcode,provider_external_id,provider_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
         RETURNING id`,
        [
          food.name,
          food.brand,
          food.is_custom,
          food.user_id,
          food.shared_with_public,
          food.is_quick_food,
          food.barcode || null,
          food.provider_external_id || null,
          food.provider_type || null,
        ]
      );
      const newFoodId = foodResult.rows[0].id;
      totalFoodsCreated++;

      for (const variant of food.variants) {
        await client.query(
          `INSERT INTO food_variants (
            food_id, serving_size, serving_unit, is_default, calories, protein, carbs, fat,
            saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
            cholesterol, sodium, potassium, dietary_fiber, sugars,
            vitamin_a, vitamin_c, calcium, iron, glycemic_index, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
            $14, $15, $16, $17, $18, $19, $20, $21, $22, now(), now()
          )`,
          [
            newFoodId,
            variant.serving_size,
            variant.serving_unit,
            variant.is_default || true,
            variant.calories || 0,
            variant.protein || 0,
            variant.carbs || 0,
            variant.fat || 0,
            variant.saturated_fat || 0,
            variant.polyunsaturated_fat || 0,
            variant.monounsaturated_fat || 0,
            variant.trans_fat || 0,
            variant.cholesterol || 0,
            variant.sodium || 0,
            variant.potassium || 0,
            variant.dietary_fiber || 0,
            variant.sugars || 0,
            variant.vitamin_a || 0,
            variant.vitamin_c || 0,
            variant.calcium || 0,
            variant.iron || 0,
            sanitizeGlycemicIndex(variant.glycemic_index),
          ]
        );
        totalVariantsCreated++;
      }
    }

    await client.query("COMMIT");

    return {
      message: "Food data imported successfully.",
      createdFoods: totalFoodsCreated,
      createdVariants: totalVariantsCreated,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error during bulk food import:", error);
    throw error;
  } finally {
    client.release();
  }
}

async function getFoodsNeedingReview(userId) {
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

async function updateFoodEntriesSnapshot(userId, foodId, newSnapshotData) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE food_entries
       SET
          food_name = $1,
          serving_size = $2,
          serving_unit = $3,
          calories = $4
       WHERE user_id = $5 AND food_id = $6
       RETURNING id`,
      [
        newSnapshotData.food_name,
        newSnapshotData.serving_size,
        newSnapshotData.serving_unit,
        newSnapshotData.calories,
        userId,
        foodId,
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
module.exports = {
  sanitizeGlycemicIndex,
  searchFoods,
  createFood,
  getFoodById,
  getFoodOwnerId,
  updateFood,
  deleteFood,
  getFoodsWithPagination,
  countFoods,
  findFoodByNameAndBrand,
  getFoodDeletionImpact,
  createFoodsInBulk,
  getFoodsNeedingReview,
  updateFoodEntriesSnapshot,
  clearUserIgnoredUpdate,
  deleteFoodAndDependencies,
};