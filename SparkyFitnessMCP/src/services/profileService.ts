import { withClient } from "../db/context.js";

export async function getProfile(userId: string): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT id, email, name, image FROM "user" WHERE id = $1`,
      [userId]
    );
    return result.rows[0] || {};
  });
}

export async function updateProfile(
  userId: string,
  params: { display_name?: string; email?: string; image?: string }
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    const result = await client.query(
      `UPDATE "user"
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           image = COALESCE($3, image),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, email, name, image`,
      [params.display_name ?? null, params.email ?? null, params.image ?? null, userId]
    );
    return result.rows[0];
  });
}


export async function getPreferences(userId: string): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    const result = await client.query(
      `SELECT timezone, energy_unit, default_weight_unit, default_measurement_unit, default_distance_unit, water_display_unit
       FROM user_preferences WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] || {};
  });
}


export async function updatePreferences(
  userId: string,
  params: { 
    timezone?: string; 
    energy_unit?: string; 
    default_weight_unit?: string; 
    default_measurement_unit?: string;
    default_distance_unit?: string;
    water_display_unit?: string;
  }
): Promise<Record<string, unknown>> {
  return withClient(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO user_preferences (user_id, timezone, energy_unit, default_weight_unit, default_measurement_unit, default_distance_unit, water_display_unit, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         timezone = COALESCE(EXCLUDED.timezone, user_preferences.timezone),
         energy_unit = COALESCE(EXCLUDED.energy_unit, user_preferences.energy_unit),
         default_weight_unit = COALESCE(EXCLUDED.default_weight_unit, user_preferences.default_weight_unit),
         default_measurement_unit = COALESCE(EXCLUDED.default_measurement_unit, user_preferences.default_measurement_unit),
         default_distance_unit = COALESCE(EXCLUDED.default_distance_unit, user_preferences.default_distance_unit),
         water_display_unit = COALESCE(EXCLUDED.water_display_unit, user_preferences.water_display_unit),
         updated_at = NOW()
       RETURNING timezone, energy_unit, default_weight_unit, default_measurement_unit, default_distance_unit, water_display_unit`,
      [
        userId,
        params.timezone ?? null,
        params.energy_unit ?? null,
        params.default_weight_unit ?? null,
        params.default_measurement_unit ?? null,
        params.default_distance_unit ?? null,
        params.water_display_unit ?? null,
      ]
    );
    return result.rows[0];
  });
}

