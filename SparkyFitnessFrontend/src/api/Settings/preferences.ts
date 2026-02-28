import { apiCall } from '@/api/api';
import { BmrAlgorithm } from '@/services/bmrService';
import { BodyFatAlgorithm } from '@/services/bodyCompositionService';
import {
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  SugarCalculationAlgorithm,
} from '@/types/nutrientAlgorithms';

export type EnergyUnit = 'kcal' | 'kJ';

interface NutrientPreference {
  view_group: string;
  platform: 'desktop' | 'mobile';
  visible_nutrients: string[];
}

interface UserPreferences {
  user_id: string;
  default_weight_unit: 'kg' | 'lbs';
  default_measurement_unit: 'cm' | 'inches';
  default_distance_unit: 'km' | 'miles';
  date_format: string;
  auto_clear_history: string;
  logging_level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT';
  default_food_data_provider_id: string | null;
  timezone: string;
  item_display_limit: number;
  food_display_limit: number;
  water_display_unit: 'ml' | 'oz' | 'liter';
  language: string;
  calorie_goal_adjustment_mode: 'dynamic' | 'fixed';
  energy_unit: EnergyUnit;
  auto_scale_open_food_facts_imports: boolean;
  bmr_algorithm: BmrAlgorithm;
  body_fat_algorithm: BodyFatAlgorithm;
  include_bmr_in_net_calories: boolean;
  fat_breakdown_algorithm: FatBreakdownAlgorithm;
  mineral_calculation_algorithm: MineralCalculationAlgorithm;
  vitamin_calculation_algorithm: VitaminCalculationAlgorithm;
  sugar_calculation_algorithm: SugarCalculationAlgorithm;
  selected_diet: string;
  updated_at?: string;
}

export const getUserPreferences = async (): Promise<UserPreferences | null> => {
  try {
    return await apiCall('/user-preferences', {
      method: 'GET',
      suppress404Toast: true,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('404')) {
      return null;
    }
    throw err;
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const upsertUserPreferences = async (payload: any): Promise<any> => {
  return apiCall('/user-preferences', {
    method: 'POST',
    body: payload,
  });
};

export const getNutrientDisplayPreferences = async (): Promise<
  NutrientPreference[]
> => {
  return apiCall('/preferences/nutrient-display', {
    method: 'GET',
  });
};
