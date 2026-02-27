export interface CustomCategory {
  id: string;
  name: string;
  display_name?: string | null;
  measurement_type: string;
  frequency: string;
  data_type: string;
}

export interface CustomMeasurement {
  id: string;
  category_id: string;
  timestamp?: string;
  hour?: number;
  value: string | number;
  entry_date: string;
  entry_hour: number | null;
  entry_timestamp: string;
  notes?: string;
  custom_categories: CustomCategory;
}

export interface CheckInMeasurement {
  id: string;
  entry_date: string;
  weight: number | null;
  neck: number | null;
  waist: number | null;
  hips: number | null;
  steps: number | null;
  height: number | null;
  body_fat_percentage: number | null;
  updated_at: string; // Add updated_at for sorting
}

export interface CombinedMeasurement {
  id: string;
  entry_date: string;
  entry_hour: number | null;
  entry_timestamp: string;
  value: string | number;
  type: 'custom' | 'standard' | 'fasting' | 'stress' | 'exercise';
  display_name: string;
  display_unit?: string;
  custom_categories?: CustomCategory;
  fasting_type?: string;
  duration_minutes?: number;
  originalId?: string;
  exercise_name?: string;
  calories_burned?: number;
}
