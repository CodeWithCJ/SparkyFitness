import { getClient } from '../db/poolManager.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createWaterContainer(userId: any, containerData: any) {
  const { name, volume, unit, is_primary, servings_per_container } =
    containerData;
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `INSERT INTO user_water_containers (user_id, name, volume, unit, is_primary, servings_per_container)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, name, volume, unit, is_primary, servings_per_container]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWaterContainersByUserId(userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'SELECT * FROM user_water_containers WHERE user_id = $1 ORDER BY created_at',
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
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE user_water_containers SET
        name = COALESCE($1, name),
        volume = COALESCE($2, volume),
        unit = COALESCE($3, unit),
        is_primary = COALESCE($4, is_primary),
        servings_per_container = COALESCE($5, servings_per_container),
        updated_at = now()
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [name, volume, unit, is_primary, servings_per_container, id, userId]
    );
    return result.rows[0];
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
    // First, set all containers for this user to not be primary
    await client.query(
      'UPDATE user_water_containers SET is_primary = false WHERE user_id = $1',
      [userId]
    );
    // Then, set the specified container to be primary
    const result = await client.query(
      'UPDATE user_water_containers SET is_primary = true, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
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
async function getPrimaryWaterContainerByUserId(userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'SELECT * FROM user_water_containers WHERE user_id = $1 AND is_primary = TRUE',
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
      'SELECT * FROM user_water_containers WHERE id = $1',
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
