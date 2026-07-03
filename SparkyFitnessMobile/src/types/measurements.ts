export interface CheckInMeasurement {
  entry_date: string;
  weight?: number | null;
  neck?: number | null;
  waist?: number | null;
  hips?: number | null;
  steps?: number | null;
  height?: number | null;
  body_fat_percentage?: number | null;
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
  updated_at: string;
}

export interface WaterIntake {
  water_ml: number;
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
