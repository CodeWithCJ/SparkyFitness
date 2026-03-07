export interface UserPreferences {
  bmr_algorithm?: string;
  body_fat_algorithm?: string;
  fat_breakdown_algorithm?: string;
  mineral_calculation_algorithm?: string;
  vitamin_calculation_algorithm?: string;
  sugar_calculation_algorithm?: string;
  default_food_data_provider_id?: string;
  default_barcode_provider_id?: string;

  default_weight_unit?: 'kg' | 'lbs';
  default_distance_unit?: 'km' | 'miles';
  default_measurement_unit?: 'cm' | 'inches';
  date_format?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | string;
  energy_unit?: 'kcal' | 'kJ';
  water_display_unit?: 'ml' | 'oz' | 'liter';

  include_bmr_in_net_calories?: boolean;
  calorie_goal_adjustment_mode?: string;
  auto_scale_open_food_facts_imports?: boolean;
  exercise_calorie_percentage?: number;
  activity_level?: string;
  tdee_allow_negative_adjustment?: boolean;
  system_prompt?: string;
  auto_clear_history?: string;
  logging_level?: string;
  timezone?: string;
  item_display_limit?: number;
  language?: string;
}