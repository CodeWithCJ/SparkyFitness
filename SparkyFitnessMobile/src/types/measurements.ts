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
  // #2115: container -> food link. hydration_factor scales ONLY the water
  // credit; calories/macros/caffeine/alcohol from the linked food always
  // count in full.
  hydration_factor?: number;
  linked_food_id?: string | null;
  linked_variant_id?: string | null;
  linked_meal_type_id?: string | null;
  linked_food_name?: string | null;
  linked_variant_serving_size?: number | string | null;
  linked_variant_serving_unit?: string | null;
  /** The linked variant's own water, so a client can show an honest per-press amount. */
  linked_variant_water_ml?: number | string | null;
  /** Amount of the linked food one press logs, in the linked variant's unit. */
  linked_quantity?: number;
  linked_meal_type_name?: string | null;
  is_quick_add?: boolean;
  sort_order?: number;
}

export interface WaterIntakeResponse {
  id: string;
  water_ml: number;
  entry_date: string;
}
