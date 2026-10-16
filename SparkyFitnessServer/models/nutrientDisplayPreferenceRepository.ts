import { getClient } from '../db/poolManager.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'pg-f... Remove this comment to see the full error message
import format from 'pg-format';
import type { PoolClient } from 'pg';
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
    'INSERT INTO %I (user_id, view_group, platform, visible_nutrients) VALUES %L ON CONFLICT (user_id, view_group, platform) DO NOTHING RETURNING *',
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
/**
 * Rewrites a nutrient key in every saved display list for the user (all view
 * groups and platforms), keeping its position. Used when a custom nutrient is
 * renamed, since its name is the key stored in `visible_nutrients`.
 */
async function renameNutrientDisplayPreferenceKey(
  userId: string,
  oldKey: string,
  newKey: string,
  // When given, the caller owns the transaction and the client's lifetime.
  sharedClient?: PoolClient
): Promise<void> {
  if (oldKey === newKey) return;
  const client = sharedClient ?? (await getClient(userId));
  try {
    // If a list already holds newKey, the old entry is dropped instead of
    // renamed, so the list never gets the same nutrient twice.
    await client.query(
      `UPDATE ${TABLE_NAME}
       SET visible_nutrients = (
         SELECT COALESCE(jsonb_agg(
           CASE WHEN e = to_jsonb($2::text) THEN to_jsonb($3::text) ELSE e END
           ORDER BY ord
         ), '[]'::jsonb)
         FROM jsonb_array_elements(visible_nutrients) WITH ORDINALITY AS x(e, ord)
         WHERE NOT (e = to_jsonb($2::text) AND visible_nutrients ? $3::text)
       ), updated_at = NOW()
       WHERE user_id = $1 AND visible_nutrients ? $2::text`,
      [userId, oldKey, newKey]
    );
  } finally {
    if (!sharedClient) client.release();
  }
}
export { getNutrientDisplayPreferences };
export { renameNutrientDisplayPreferenceKey };
export { upsertNutrientDisplayPreference };
export { deleteNutrientDisplayPreference };
export { createDefaultNutrientPreferences };
export default {
  getNutrientDisplayPreferences,
  renameNutrientDisplayPreferenceKey,
  upsertNutrientDisplayPreference,
  deleteNutrientDisplayPreference,
  createDefaultNutrientPreferences,
};
