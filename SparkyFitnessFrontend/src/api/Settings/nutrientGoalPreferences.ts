import { apiCall } from '@/api/api';
import type { NutrientGoalType } from '@/constants/nutrients';

export interface NutrientGoalPreferenceEntry {
  goalType: NutrientGoalType;
  targetMin?: number;
  targetMax?: number;
}
export type NutrientGoalPreferencesMap = Record<
  string,
  NutrientGoalPreferenceEntry
>;

export const getNutrientGoalPreferences =
  async (): Promise<NutrientGoalPreferencesMap> => {
    return apiCall('/nutrient-goal-preferences');
  };

export const updateNutrientGoalPreference = async (
  nutrientKey: string,
  goalType: NutrientGoalType,
  targetMin?: number,
  targetMax?: number
): Promise<NutrientGoalPreferenceEntry> => {
  return apiCall(
    `/nutrient-goal-preferences/${encodeURIComponent(nutrientKey)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ goalType, targetMin, targetMax }),
    }
  );
};

export const resetNutrientGoalPreference = async (
  nutrientKey: string
): Promise<{ nutrientKey: string; goalType: NutrientGoalType }> => {
  return apiCall(
    `/nutrient-goal-preferences/${encodeURIComponent(nutrientKey)}`,
    { method: 'DELETE' }
  );
};
