import { api } from '../api/api';
import { debug, error, type UserLoggingLevel } from '@/utils/logging';

export interface UserPreferences {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;

  date_format:
    | 'MM/DD/YYYY'
    | 'DD/MM/YYYY'
    | 'YYYY-MM-DD'
    | 'dd/MM/yyyy'
    | string;
  language: string;
  timezone: string;

  default_weight_unit: 'kg' | 'lbs';
  default_measurement_unit: 'cm' | 'in';
  default_distance_unit: 'km' | 'miles';
  energy_unit: 'kcal' | 'kJ';
  water_display_unit: 'ml' | 'oz' | string;
  bmr_algorithm: 'Mifflin-St Jeor' | 'Harris-Benedict' | string;
  body_fat_algorithm: 'U.S. Navy' | string;
  fat_breakdown_algorithm: 'AHA_GUIDELINES' | string;
  mineral_calculation_algorithm: 'RDA_STANDARD' | string;
  vitamin_calculation_algorithm: 'RDA_STANDARD' | string;
  sugar_calculation_algorithm: 'WHO_GUIDELINES' | string;
  include_bmr_in_net_calories: boolean;
  calorie_goal_adjustment_mode: 'dynamic' | 'fixed' | string;
  auto_scale_open_food_facts_imports: boolean;
  auto_clear_history: 'never' | string;
  logging_level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  system_prompt: string;
  item_display_limit: number;
  default_food_data_provider_id: string | null;
}

export const updateUserPreferences = async (
  preferences: UserPreferences,
  loggingLevel: UserLoggingLevel
): Promise<UserPreferences> => {
  try {
    const response = await api.put('/user-preferences', { body: preferences });
    debug(loggingLevel, 'API response for user preferences:', response); // Use debug logging
    return response;
  } catch (err) {
    error(loggingLevel, 'Error updating user preferences:', err); // Use error logging
    throw err;
  }
};
