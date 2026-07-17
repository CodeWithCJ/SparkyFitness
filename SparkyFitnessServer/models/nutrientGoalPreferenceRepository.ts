import { getClient } from '../db/poolManager.js';
import type { NutrientGoalType } from '@workspace/shared';

const TABLE_NAME = 'user_nutrient_goal_preferences';

export interface NutrientGoalPreferenceRow {
  id: string;
  user_id: string;
  nutrient_key: string;
  goal_type: NutrientGoalType;
  target_min: number | null;
  target_max: number | null;
  created_at: Date;
  updated_at: Date;
}

async function getNutrientGoalPreferences(
  userId: string
): Promise<NutrientGoalPreferenceRow[]> {
  const client = await getClient(userId);
  try {
    const { rows } = await client.query(
      `SELECT * FROM ${TABLE_NAME} WHERE user_id = $1`,
      [userId]
    );
    return rows;
  } finally {
    client.release();
  }
}

async function upsertNutrientGoalPreference(
  userId: string,
  nutrientKey: string,
  goalType: NutrientGoalType,
  targetMin: number | null,
  targetMax: number | null
): Promise<NutrientGoalPreferenceRow> {
  const client = await getClient(userId);
  try {
    const { rows } = await client.query(
      `INSERT INTO ${TABLE_NAME} (user_id, nutrient_key, goal_type, target_min, target_max)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, nutrient_key)
       DO UPDATE SET goal_type = EXCLUDED.goal_type,
                     target_min = EXCLUDED.target_min,
                     target_max = EXCLUDED.target_max,
                     updated_at = NOW()
       RETURNING *`,
      [userId, nutrientKey, goalType, targetMin, targetMax]
    );
    return rows[0];
  } finally {
    client.release();
  }
}

async function deleteNutrientGoalPreference(
  userId: string,
  nutrientKey: string
): Promise<void> {
  const client = await getClient(userId);
  try {
    await client.query(
      `DELETE FROM ${TABLE_NAME} WHERE user_id = $1 AND nutrient_key = $2`,
      [userId, nutrientKey]
    );
  } finally {
    client.release();
  }
}

async function renameNutrientGoalPreferenceKey(
  userId: string,
  oldKey: string,
  newKey: string
): Promise<void> {
  const client = await getClient(userId);
  try {
    // ON CONFLICT DO NOTHING: if the user somehow already has an override at
    // newKey, keep it and drop the stale oldKey row rather than erroring.
    await client.query(
      `UPDATE ${TABLE_NAME} SET nutrient_key = $1, updated_at = NOW()
       WHERE user_id = $2 AND nutrient_key = $3
       AND NOT EXISTS (
         SELECT 1 FROM ${TABLE_NAME} WHERE user_id = $2 AND nutrient_key = $1
       )`,
      [newKey, userId, oldKey]
    );
    await client.query(
      `DELETE FROM ${TABLE_NAME} WHERE user_id = $1 AND nutrient_key = $2`,
      [userId, oldKey]
    );
  } finally {
    client.release();
  }
}

export {
  getNutrientGoalPreferences,
  upsertNutrientGoalPreference,
  deleteNutrientGoalPreference,
  renameNutrientGoalPreferenceKey,
};
export default {
  getNutrientGoalPreferences,
  upsertNutrientGoalPreference,
  deleteNutrientGoalPreference,
  renameNutrientGoalPreferenceKey,
};
