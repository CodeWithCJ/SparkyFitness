import { getClient } from '../db/poolManager.js';
import type { WaterContainerResponse } from '@workspace/shared';

// Attempting to make a container both primary and quick-add is a bad request,
// not a server fault; errorHandler.ts maps on `statusCode` alone, so without
// this the caller gets a 500.
type HttpStatusError = Error & { statusCode: number };

function conflictError(message: string): HttpStatusError {
  const error = new Error(message) as HttpStatusError;
  error.statusCode = 409;
  return error;
}

export interface CreateWaterContainerData {
  name: string;
  volume: number;
  unit: string;
  is_primary?: boolean | null;
  servings_per_container?: number;
  hydration_factor?: number;
  linked_food_id?: string | null;
  linked_variant_id?: string | null;
  linked_meal_type_id?: string | null;
  linked_quantity?: number | null;
  is_quick_add?: boolean;
  sort_order?: number;
}

export interface UpdateWaterContainerData {
  name?: string;
  volume?: number;
  unit?: string;
  is_primary?: boolean | null;
  servings_per_container?: number;
  hydration_factor?: number;
  linked_food_id?: string | null;
  linked_variant_id?: string | null;
  linked_meal_type_id?: string | null;
  linked_quantity?: number | null;
  is_quick_add?: boolean;
  sort_order?: number;
}

async function createWaterContainer(
  userId: string,
  containerData: CreateWaterContainerData
): Promise<WaterContainerResponse> {
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
    linked_quantity,
    is_quick_add = false,
    sort_order = 0,
  } = containerData;

  if (is_quick_add && is_primary) {
    throw conflictError(
      'Quick-add drink presets cannot be set as the primary water container.'
    );
  }

  const client = await getClient(userId);
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
         hydration_factor, linked_food_id, linked_variant_id, linked_meal_type_id,
         is_quick_add, sort_order, linked_quantity
       )
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 1.000), $8, $9, $10, $11, $12,
               COALESCE($13, 1)) RETURNING *`,
      [
        userId,
        name,
        volume,
        unit,
        is_primary ?? false,
        servings_per_container ?? 1,
        hydration_factor,
        linked_food_id ?? null,
        linked_variant_id ?? null,
        linked_meal_type_id ?? null,
        is_quick_add,
        sort_order,
        linked_quantity ?? null,
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

async function getWaterContainersByUserId(
  userId: string
): Promise<WaterContainerResponse[]> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
         c.*,
         f.name AS linked_food_name,
         fv.serving_size AS linked_variant_serving_size,
         fv.serving_unit AS linked_variant_serving_unit,
         fv.water_ml AS linked_variant_water_ml,
         mt.name AS linked_meal_type_name
       FROM user_water_containers c
       LEFT JOIN foods f ON c.linked_food_id = f.id
       LEFT JOIN food_variants fv ON c.linked_variant_id = fv.id
       LEFT JOIN meal_types mt ON c.linked_meal_type_id = mt.id
       WHERE c.user_id = $1
       ORDER BY c.sort_order ASC, c.created_at ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function updateWaterContainer(
  id: number,
  userId: string,
  updateData: UpdateWaterContainerData
): Promise<WaterContainerResponse | null> {
  const { name, volume, unit, is_primary, servings_per_container } = updateData;
  const hydration_factor = updateData.hydration_factor;
  const is_quick_add = updateData.is_quick_add;
  const sort_order = updateData.sort_order;

  // Link fields are nullable, so `undefined` (omitted -- leave alone) and
  // `null` (explicit -- unlink) must be distinguishable.
  const linkedFoodIdPresent = 'linked_food_id' in updateData;
  const linkedVariantIdPresent = 'linked_variant_id' in updateData;
  const linkedMealTypeIdPresent = 'linked_meal_type_id' in updateData;

  const client = await getClient(userId);
  try {
    await client.query('BEGIN');

    // Primary and quick-add are mutually exclusive, and either flag can arrive
    // on its own -- so judge the state this update would leave behind rather
    // than the single field it names. Keying off `is_primary === true` alone
    // let one request set both flags at once, and let quick-add be turned on
    // for a container that was already primary.
    if (
      is_primary === true ||
      is_quick_add === true ||
      volume !== undefined ||
      linkedFoodIdPresent
    ) {
      const current = await client.query(
        'SELECT is_primary, is_quick_add, volume, linked_food_id FROM user_water_containers WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      const currentRow = current.rows[0];
      if (currentRow) {
        // `??` mirrors the COALESCE below: an absent flag keeps its stored value.
        const willBePrimary = is_primary ?? currentRow.is_primary;
        const willBeQuickAdd = is_quick_add ?? currentRow.is_quick_add;
        if (willBePrimary && willBeQuickAdd) {
          throw conflictError(
            'Quick-add drink presets cannot be set as the primary water container.'
          );
        }

        // Volume 0 means "no override -- take the volume from the linked
        // food", so it is only meaningful while a link exists. Judged on the
        // resulting row for the same reason as the pair above: the request can
        // name either half. Validating only the submitted patch let
        // `{"linked_food_id": null}` unlink a container that was holding 0 and
        // leave it crediting nothing, while `{"volume": 0}` on an already
        // linked container was refused because the link was not in the body.
        const willBeVolume = volume ?? Number(currentRow.volume);
        const willBeLinked = linkedFoodIdPresent
          ? Boolean(updateData.linked_food_id)
          : Boolean(currentRow.linked_food_id);
        if (Number(willBeVolume) === 0 && !willBeLinked) {
          throw conflictError(
            'Volume must be greater than 0 unless the container is linked to a food.'
          );
        }
      }
    }

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
        is_quick_add = COALESCE($15, is_quick_add),
        sort_order = COALESCE($16, sort_order),
        linked_quantity = COALESCE($17, linked_quantity),
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
        is_quick_add,
        sort_order,
        updateData.linked_quantity ?? null,
      ]
    );

    if (result.rows[0] && is_primary === true) {
      await client.query(
        'UPDATE user_water_containers SET is_primary = false WHERE user_id = $1 AND id != $2',
        [userId, id]
      );
    }
    await client.query('COMMIT');
    return result.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteWaterContainer(
  id: number,
  userId: string
): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'DELETE FROM user_water_containers WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

async function setPrimaryWaterContainer(
  id: number,
  userId: string
): Promise<WaterContainerResponse | null> {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');

    // Disallow setting quick-add containers as primary
    const targetCheck = await client.query(
      'SELECT is_quick_add FROM user_water_containers WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (!targetCheck.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    if (targetCheck.rows[0].is_quick_add) {
      throw conflictError(
        'Quick-add drink presets cannot be set as the primary water container.'
      );
    }

    const result = await client.query(
      'UPDATE user_water_containers SET is_primary = true, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    if (result.rows[0]) {
      await client.query(
        'UPDATE user_water_containers SET is_primary = false WHERE user_id = $1 AND id != $2',
        [userId, id]
      );
    }
    await client.query('COMMIT');
    return result.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getPrimaryWaterContainerByUserId(
  userId: string
): Promise<WaterContainerResponse | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
         c.*,
         f.name AS linked_food_name,
         fv.serving_size AS linked_variant_serving_size,
         fv.serving_unit AS linked_variant_serving_unit,
         fv.water_ml AS linked_variant_water_ml,
         mt.name AS linked_meal_type_name
       FROM user_water_containers c
       LEFT JOIN foods f ON c.linked_food_id = f.id
       LEFT JOIN food_variants fv ON c.linked_variant_id = fv.id
       LEFT JOIN meal_types mt ON c.linked_meal_type_id = mt.id
       WHERE c.user_id = $1 AND c.is_primary = TRUE AND (c.is_quick_add IS FALSE OR c.is_quick_add IS NULL)`,
      [userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

async function getWaterContainerById(
  id: number,
  userId: string
): Promise<WaterContainerResponse | null> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
         c.*,
         f.name AS linked_food_name,
         fv.serving_size AS linked_variant_serving_size,
         fv.serving_unit AS linked_variant_serving_unit,
         fv.water_ml AS linked_variant_water_ml,
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

async function reorderWaterContainers(
  userId: string,
  containerIds: number[]
): Promise<void> {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    for (let i = 0; i < containerIds.length; i++) {
      await client.query(
        'UPDATE user_water_containers SET sort_order = $1, updated_at = now() WHERE id = $2 AND user_id = $3',
        [i, containerIds[i], userId]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export {
  createWaterContainer,
  getWaterContainersByUserId,
  updateWaterContainer,
  deleteWaterContainer,
  setPrimaryWaterContainer,
  getPrimaryWaterContainerByUserId,
  getWaterContainerById,
  reorderWaterContainers,
};

export default {
  createWaterContainer,
  getWaterContainersByUserId,
  updateWaterContainer,
  deleteWaterContainer,
  setPrimaryWaterContainer,
  getPrimaryWaterContainerByUserId,
  getWaterContainerById,
  reorderWaterContainers,
};
