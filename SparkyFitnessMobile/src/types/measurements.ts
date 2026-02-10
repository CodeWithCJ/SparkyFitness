export interface CheckInMeasurement {
  entry_date: string;
  weight?: number;
  neck?: number;
  waist?: number;
  hips?: number;
  steps?: number;
  height?: number;
  body_fat_percentage?: number;
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
