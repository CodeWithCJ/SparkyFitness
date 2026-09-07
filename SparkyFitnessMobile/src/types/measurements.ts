export interface CheckInMeasurement {
  entry_date: string;
  weight?: number | null;
  neck?: number | null;
  waist?: number | null;
  hips?: number | null;
  steps?: number | null;
  height?: number | null;
  body_fat_percentage?: number | null;
  muscle_mass_kg?: number | null;
  bone_mass_kg?: number | null;
  body_water_percentage?: number | null;
  bmr?: number | null;
}

export interface CheckInMeasurementRange {
  id: string;
  user_id: string;
  entry_date: string;
  weight?: number | null;
  neck?: number | null;
  waist?: number | null;
  hips?: number | null;
  steps?: number | null;
  height?: number | null;
  body_fat_percentage?: number | null;
  muscle_mass_kg?: number | null;
  bone_mass_kg?: number | null;
  body_water_percentage?: number | null;
  bmr?: number | null;
  updated_at: string;
}

export interface WaterIntake {
  water_ml: number;
  /** Manually-logged subtotal; servers predating per-record water sync omit it. */
  manual_ml?: number;
}

export interface WaterContainer {
  id: number;
  name: string;
  volume: number;
  unit: string;
  is_primary: boolean;
  servings_per_container: number;
}

export interface WaterIntakeResponse {
  id: string;
  water_ml: number;
  entry_date: string;
}

/**
 * One individual logged drink, as returned by
 * `GET /api/v2/measurements/water-intake/:date/log`.
 *
 * Distinct from `WaterIntake` above, which is the day's rolled-up total:
 * these are the underlying per-drink rows, each independently deletable via
 * `DELETE /api/v2/measurements/water-intake/log/:id`. `container_name` and
 * `container_id` are null for entries that didn't come from a container at
 * all (water synced in from Apple Health, for example).
 */
export interface WaterIntakeLogEntry {
  id: string;
  entry_date: string;
  water_ml: number;
  container_id?: number | null;
  container_name?: string | null;
  /** 'manual' for a phone/watch tap; a provider name for synced records. */
  source: string;
  /** When the drink was logged — a full timestamp, not just the day. */
  logged_at: string;
  created_at: string;
}
