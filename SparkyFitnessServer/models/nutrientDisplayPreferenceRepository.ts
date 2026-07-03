import { getClient } from '../db/poolManager.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'pg-f... Remove this comment to see the full error message
import format from 'pg-format';
const TABLE_NAME = 'user_nutrient_display_preferences';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getNutrientDisplayPreferences(userId: any) {
  const query = `SELECT * FROM ${TABLE_NAME} WHERE user_id = $1`;
  const client = await getClient(userId);
  try {
    const { rows } = await client.query(query, [userId]);
    return rows;
  } finally {
    client.release();
  }
}
async function upsertNutrientDisplayPreference(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewGroup: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  platform: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visibleNutrients: any
) {
  const query = `
        INSERT INTO ${TABLE_NAME} (user_id, view_group, platform, visible_nutrients)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, view_group, platform)
        DO UPDATE SET visible_nutrients = EXCLUDED.visible_nutrients, updated_at = NOW()
        RETURNING *;
    `;
  const client = await getClient(userId);
  try {
    const { rows } = await client.query(query, [
      userId,
      viewGroup,
      platform,
      JSON.stringify(visibleNutrients),
    ]);
    return rows[0];
  } finally {
    client.release();
  }
}

async function deleteNutrientDisplayPreference(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewGroup: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  platform: any
) {
  const query = `DELETE FROM ${TABLE_NAME} WHERE user_id = $1 AND view_group = $2 AND platform = $3`;
  const client = await getClient(userId);
  try {
    await client.query(query, [userId, viewGroup, platform]);
  } finally {
    client.release();
  }
}

async function createDefaultNutrientPreferences(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultPreferences: any
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values = defaultPreferences.map((pref: any) => [
    userId,
    pref.view_group,
    pref.platform,
    JSON.stringify(pref.visible_nutrients),
  ]);
  const query = format(
    'INSERT INTO %I (user_id, view_group, platform, visible_nutrients) VALUES %L RETURNING *',
    TABLE_NAME,
    values
  );
  const client = await getClient(userId); // Assuming userId is available in context for this function
  try {
    const { rows } = await client.query(query);
    return rows;
  } finally {
    client.release();
  }
}
export { getNutrientDisplayPreferences };
export { upsertNutrientDisplayPreference };
export { deleteNutrientDisplayPreference };
export { createDefaultNutrientPreferences };
export default {
  getNutrientDisplayPreferences,
  upsertNutrientDisplayPreference,
  deleteNutrientDisplayPreference,
  createDefaultNutrientPreferences,
};
