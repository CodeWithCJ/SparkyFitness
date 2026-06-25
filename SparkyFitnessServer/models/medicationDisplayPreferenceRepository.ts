import { getClient } from '../db/poolManager.js';

const TABLE_NAME = 'user_medication_display_preferences';

async function getMedicationDisplayPreferences(userId: string) {
  const query = `SELECT * FROM ${TABLE_NAME} WHERE user_id = $1`;
  const client = await getClient(userId);
  try {
    const { rows } = await client.query(query, [userId]);
    return rows;
  } finally {
    client.release();
  }
}

async function upsertMedicationDisplayPreference(
  userId: string,
  viewGroup: string,
  platform: string,
  visibleItems: string[]
) {
  const query = `
    INSERT INTO ${TABLE_NAME} (user_id, view_group, platform, visible_items)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, view_group, platform)
    DO UPDATE SET visible_items = EXCLUDED.visible_items, updated_at = NOW()
    RETURNING *;
  `;
  const client = await getClient(userId);
  try {
    const { rows } = await client.query(query, [
      userId,
      viewGroup,
      platform,
      JSON.stringify(visibleItems),
    ]);
    return rows[0];
  } finally {
    client.release();
  }
}

async function deleteMedicationDisplayPreference(
  userId: string,
  viewGroup: string,
  platform: string
) {
  const query = `DELETE FROM ${TABLE_NAME} WHERE user_id = $1 AND view_group = $2 AND platform = $3`;
  const client = await getClient(userId);
  try {
    const { rowCount } = await client.query(query, [
      userId,
      viewGroup,
      platform,
    ]);
    return (rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export {
  getMedicationDisplayPreferences,
  upsertMedicationDisplayPreference,
  deleteMedicationDisplayPreference,
};

export default {
  getMedicationDisplayPreferences,
  upsertMedicationDisplayPreference,
  deleteMedicationDisplayPreference,
};
