import { getClient } from '../db/poolManager.js';
import {
  DEFAULT_HEART_RATE_ZONE_SETTINGS,
  hrZoneMethodSchema,
  type HeartRateZoneSettings,
} from '@workspace/shared';

interface HeartRateZoneRow {
  max_heart_rate: number | null;
  resting_heart_rate: number | null;
  hr_zone_method: string;
  hr_zone_custom_floors: number[] | null;
  hr_zone_display_count: number;
}

function mapRow(row: HeartRateZoneRow | undefined): HeartRateZoneSettings {
  if (!row) return { ...DEFAULT_HEART_RATE_ZONE_SETTINGS };
  const method = hrZoneMethodSchema.safeParse(row.hr_zone_method);
  return {
    maxHeartRate: row.max_heart_rate,
    restingHeartRate: row.resting_heart_rate,
    method: method.success
      ? method.data
      : DEFAULT_HEART_RATE_ZONE_SETTINGS.method,
    customFloors: row.hr_zone_custom_floors
      ? row.hr_zone_custom_floors.map(Number)
      : null,
    displayZones: row.hr_zone_display_count === 4 ? 4 : 5,
  };
}

/** The person's saved heart rate zone settings, or the defaults when none are saved. */
export async function getHeartRateZoneSettings(
  userId: string,
  authenticatedUserId: string = userId
): Promise<HeartRateZoneSettings> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `SELECT max_heart_rate, resting_heart_rate, hr_zone_method, hr_zone_custom_floors, hr_zone_display_count
       FROM user_preferences
       WHERE user_id = $1`,
      [userId]
    )) as { rows: HeartRateZoneRow[] };
    return mapRow(result.rows[0]);
  } finally {
    client.release();
  }
}

/** Replaces the person's heart rate zone settings. */
export async function saveHeartRateZoneSettings(
  userId: string,
  authenticatedUserId: string,
  settings: HeartRateZoneSettings
): Promise<HeartRateZoneSettings> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = (await client.query(
      `INSERT INTO user_preferences
         (user_id, max_heart_rate, resting_heart_rate, hr_zone_method, hr_zone_custom_floors, hr_zone_display_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         max_heart_rate = EXCLUDED.max_heart_rate,
         resting_heart_rate = EXCLUDED.resting_heart_rate,
         hr_zone_method = EXCLUDED.hr_zone_method,
         hr_zone_custom_floors = EXCLUDED.hr_zone_custom_floors,
         hr_zone_display_count = EXCLUDED.hr_zone_display_count,
         updated_at = now()
       RETURNING max_heart_rate, resting_heart_rate, hr_zone_method, hr_zone_custom_floors, hr_zone_display_count`,
      [
        userId,
        settings.maxHeartRate,
        settings.restingHeartRate,
        settings.method,
        settings.customFloors,
        settings.displayZones,
      ]
    )) as { rows: HeartRateZoneRow[] };
    return mapRow(result.rows[0]);
  } finally {
    client.release();
  }
}
