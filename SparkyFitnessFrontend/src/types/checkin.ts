import { CustomCategoriesResponse } from '@workspace/shared';
import { FastingLog } from './fasting';

// Latest recorded value per standard measurement (metric), shown as input
// placeholders on the check-in form.
export interface CheckInPlaceholders {
  weight: number | null;
  neck: number | null;
  waist: number | null;
  hips: number | null;
  height: number | null;
  bodyFatPercentage: number | null;
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
  custom_categories?: CustomCategoriesResponse;
  fasting_type?: string;
  duration_minutes?: number;
  originalId?: string;
  exercise_name?: string;
  calories_burned?: number;
  originalFast?: FastingLog;
}
