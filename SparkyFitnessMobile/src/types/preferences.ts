export interface UserPreferences {
  bmr_algorithm?: string;
  body_fat_algorithm?: string;
  fat_breakdown_algorithm?: string;
  mineral_calculation_algorithm?: string;
  vitamin_calculation_algorithm?: string;
  sugar_calculation_algorithm?: string;
  
  
  default_weight_unit?: 'kg' | 'lbs';
  default_distance_unit?: 'km' | 'miles';
  default_measurement_unit?: 'cm' | 'inches';
  date_format?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | string;
  energy_unit?: 'kcal' | 'kJ';
  water_display_unit?: 'ml' | 'oz' | 'liter';
  
  include_bmr_in_net_calories?: boolean;
  calorie_goal_adjustment_mode?: string;
}