import { SAUDI_DEFAULT_PREFERENCES } from './localePolicy';

const DEFAULT_SYSTEM_PROMPT =
  'You are Sparky, a helpful AI assistant for health and fitness tracking.';

export const resolveTimezonePreference = (timezone?: string | null): string =>
  timezone?.trim() || SAUDI_DEFAULT_PREFERENCES.timezoneFallback;

export const buildSaudiDefaultPreferences = (
  userId: string,
  deviceTimezone?: string | null
) => ({
  user_id: userId,
  date_format: SAUDI_DEFAULT_PREFERENCES.dateFormat,
  default_weight_unit: SAUDI_DEFAULT_PREFERENCES.weightUnit,
  default_measurement_unit: SAUDI_DEFAULT_PREFERENCES.measurementUnit,
  default_distance_unit: SAUDI_DEFAULT_PREFERENCES.distanceUnit,
  system_prompt: DEFAULT_SYSTEM_PROMPT,
  auto_clear_history: 'never',
  logging_level: 'ERROR' as const,
  timezone: resolveTimezonePreference(deviceTimezone),
  item_display_limit: 10,
  food_display_limit: 10,
  water_display_unit: SAUDI_DEFAULT_PREFERENCES.waterDisplayUnit,
  language: SAUDI_DEFAULT_PREFERENCES.language,
  calorie_goal_adjustment_mode: 'dynamic' as const,
  energy_unit: SAUDI_DEFAULT_PREFERENCES.energyUnit,
  auto_scale_open_food_facts_imports: false,
  auto_scale_online_imports: true,
  selected_diet: 'balanced',
  first_day_of_week: SAUDI_DEFAULT_PREFERENCES.firstDayOfWeek,
  show_net_carbs: false,
  ai_assisted_conversions: true,
});
