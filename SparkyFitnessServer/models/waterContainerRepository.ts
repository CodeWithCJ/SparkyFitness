import { getClient } from '../db/poolManager.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createWaterContainer(userId: any, containerData: any) {
  const {
    name,
    volume,
    unit,
    is_primary,
    servings_per_container,
    hydration_factor,
    linked_food_id,
    linked_variant_id,
    linked_meal_type_id,
  } = containerData;
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query('BEGIN');
    if (is_primary === true) {
      // A user has at most one primary container
      await client.query(
        'UPDATE user_water_containers SET is_primary = false WHERE user_id = $1',
        [userId]
      );
    }
    const result = await client.query(
      `INSERT INTO user_water_containers (
         user_id, name, volume, unit, is_primary, servings_per_container,
         hydration_factor, linked_food_id, linked_variant_id, linked_meal_type_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 1.000), $8, $9, $10) RETURNING *`,
      [
        userId,
        name,
        volume,
        unit,
        is_primary,
        servings_per_container,
        hydration_factor,
        linked_food_id ?? null,
        linked_variant_id ?? null,
        linked_meal_type_id ?? null,
      ]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWaterContainersByUserId(userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
         c.*,
         f.name AS linked_food_name,
         fv.serving_size AS linked_variant_serving_size,
         fv.serving_unit AS linked_variant_serving_unit,
         mt.name AS linked_meal_type_name
       FROM user_water_containers c
       LEFT JOIN foods f ON c.linked_food_id = f.id
       LEFT JOIN food_variants fv ON c.linked_variant_id = fv.id
       LEFT JOIN meal_types mt ON c.linked_meal_type_id = mt.id
       WHERE c.user_id = $1
       ORDER BY c.created_at`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateWaterContainer(id: any, userId: any, updateData: any) {
  const { name, volume, unit, is_primary, servings_per_container } = updateData;
  const hydration_factor = updateData.hydration_factor;
  // Link fields are nullable, so `undefined` (omitted -- leave alone) and
  // `null` (explicit -- unlink) must be distinguishable. Same shape as
  // preferenceRepository's default_barcode_provider_id: a present flag per
  // field gates a CASE WHEN, and the value beside it is read whether it's a
  // uuid or null.
  const linkedFoodIdPresent = 'linked_food_id' in updateData;
  const linkedVariantIdPresent = 'linked_variant_id' in updateData;
  const linkedMealTypeIdPresent = 'linked_meal_type_id' in updateData;
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE user_water_containers SET
        name = COALESCE($1, name),
        volume = COALESCE($2, volume),
        unit = COALESCE($3, unit),
        is_primary = COALESCE($4, is_primary),
        servings_per_container = COALESCE($5, servings_per_container),
        hydration_factor = COALESCE($8, hydration_factor),
        linked_food_id = CASE WHEN $9 THEN $10 ELSE linked_food_id END,
        linked_variant_id = CASE WHEN $11 THEN $12 ELSE linked_variant_id END,
        linked_meal_type_id = CASE WHEN $13 THEN $14 ELSE linked_meal_type_id END,
        updated_at = now()
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [
        name,
        volume,
        unit,
        is_primary,
        servings_per_container,
        id,
        userId,
        hydration_factor,
        linkedFoodIdPresent,
        updateData.linked_food_id ?? null,
        linkedVariantIdPresent,
        updateData.linked_variant_id ?? null,
        linkedMealTypeIdPresent,
        updateData.linked_meal_type_id ?? null,
      ]
    );
    // Demote competing primaries only after the target row is confirmed to
    // exist and belong to this user
    if (result.rows[0] && is_primary === true) {
      // A user has at most one primary container
      await client.query(
        'UPDATE user_water_containers SET is_primary = false WHERE user_id = $1 AND id != $2',
        [userId, id]
      );
    }
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteWaterContainer(id: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM user_water_containers WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setPrimaryWaterContainer(id: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'UPDATE user_water_containers SET is_primary = true, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    // Demote the other containers only after the target row is confirmed to
    // exist and belong to this user
    if (result.rows[0]) {
      await client.query(
        'UPDATE user_water_containers SET is_primary = false WHERE user_id = $1 AND id != $2',
        [userId, id]
      );
    }
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPrimaryWaterContainerByUserId(userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT
         c.*,
         f.name AS linked_food_name,
         fv.serving_size AS linked_variant_serving_size,
         fv.serving_unit AS linked_variant_serving_unit,
         mt.name AS linked_meal_type_name
       FROM user_water_containers c
       LEFT JOIN foods f ON c.linked_food_id = f.id
       LEFT JOIN food_variants fv ON c.linked_variant_id = fv.id
       LEFT JOIN meal_types mt ON c.linked_meal_type_id = mt.id
       WHERE c.user_id = $1 AND c.is_primary = TRUE`,
      [userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWaterContainerById(id: any, userId: any) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      `SELECT
         c.*,
         f.name AS linked_food_name,
         fv.serving_size AS linked_variant_serving_size,
         fv.serving_unit AS linked_variant_serving_unit,
         mt.name AS linked_meal_type_name
       FROM user_water_containers c
       LEFT JOIN foods f ON c.linked_food_id = f.id
       LEFT JOIN food_variants fv ON c.linked_variant_id = fv.id
       LEFT JOIN meal_types mt ON c.linked_meal_type_id = mt.id
       WHERE c.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}
export { createWaterContainer };
export { getWaterContainersByUserId };
export { updateWaterContainer };
export { deleteWaterContainer };
export { setPrimaryWaterContainer };
export { getPrimaryWaterContainerByUserId };
export { getWaterContainerById };
export default {
  createWaterContainer,
  getWaterContainersByUserId,
  updateWaterContainer,
  deleteWaterContainer,
  setPrimaryWaterContainer,
  getPrimaryWaterContainerByUserId,
  getWaterContainerById,
};
