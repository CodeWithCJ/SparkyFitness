import { CustomCategoriesResponse } from '@workspace/shared';

export interface CombinedMeasurement {
  id: string;
  entry_date: string;
  entry_hour: number | null;
  entry_timestamp: string;
  value: string | number;
  type: 'custom' | 'standard' | 'fasting' | 'stress' | 'exercise';
  display_name: string;
  display_unit?: string;
  custom_categories?: CustomCategoriesResponse;
  fasting_type?: string;
  duration_minutes?: number;
  originalId?: string;
  exercise_name?: string;
  calories_burned?: number;
}
