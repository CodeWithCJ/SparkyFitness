export interface CustomCategory {
  id: string;
  name: string;
  measurement_type: string;
  frequency: string;
  data_type: string;
  display_name?: string | null;
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
