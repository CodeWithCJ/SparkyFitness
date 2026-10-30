import type {
  CalorieSafetyFloorMode,
  GoalMode,
  GoalModeCalculationMethod,
} from '@workspace/shared';

export interface UserPreferences {
  bmr_algorithm?: string;
  body_fat_algorithm?: string;
  fat_breakdown_algorithm?: string;
  mineral_calculation_algorithm?: string;
  vitamin_calculation_algorithm?: string;
  sugar_calculation_algorithm?: string;
  default_food_data_provider_id?: string;
  default_barcode_provider_id?: string;
  /** When on, food search defaults to the aggregated "All Providers" mode. Held
   *  separately from default_food_data_provider_id, a uuid column that cannot
   *  store the sentinel, so the single-provider choice survives turning it off. */
  food_search_all_providers_default?: boolean;

  default_weight_unit?: 'kg' | 'lbs' | 'st_lbs';
  default_distance_unit?: 'km' | 'miles';
  default_measurement_unit?: 'cm' | 'inches' | 'ft_in';
  date_format?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | string;
  energy_unit?: 'kcal' | 'kJ';
  water_display_unit?: 'ml' | 'oz' | 'liter';
  /** Raises the daily water goal by estimated sweat loss from logged exercise. */
  add_exercise_water_to_goal?: boolean;
  /** Folds a logged food's water content into the daily water total. */
  add_food_water_to_intake?: boolean;

  include_bmr_in_net_calories?: boolean;
  /** When on, override the formula BMR with the synced Apple Health Resting Energy /
   *  Health Connect BasalMetabolicRate value for the day (mobile-only toggle). */
  use_external_bmr?: boolean;
  show_net_carbs?: boolean;
  calorie_goal_adjustment_mode?: string;
  goal_mode?: GoalMode;
  goal_mode_calculation_method?: GoalModeCalculationMethod;
  adaptive_activity_separate?: boolean;
  adjust_macros_with_exercise?: boolean;
  goal_mode_custom_percentage?: number;
  /** Signed kilograms per week: negative for loss, positive for gain. */
  goal_mode_weekly_change_kg?: number;
  auto_scale_open_food_facts_imports?: boolean;
  auto_scale_online_imports?: boolean;
  barcode_fallback_open_food_facts?: boolean;
  exercise_calorie_percentage?: number;
  activity_level?: string;
  tdee_allow_negative_adjustment?: boolean;
  calorie_safety_floor_mode?: CalorieSafetyFloorMode;
  calorie_safety_floor_value?: number;
  auto_clear_history?: string;
  logging_level?: string;
  timezone?: string | null;
  /** Clock display preference: 'HH:mm' (24-hour), 'h:mm A'/'h:mm a' (12-hour). */
  time_format?: 'HH:mm' | 'h:mm A' | 'h:mm a';
  item_display_limit?: number;
  language?: string;
  first_day_of_week?: number;
  /** AI-Assisted Unit Conversions toggle (server default: true). Gates the AI
   *  estimate path inside the unit selector sheet for cross-category swaps. */
  ai_assisted_conversions?: boolean;
  /** NULL uses free platform dictation; an ID selects a server-side audio model. */
  active_voice_ai_service_id?: string | null;
  voice_input_enabled?: boolean;
}
