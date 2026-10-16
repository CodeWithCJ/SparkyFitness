import { apiFetch } from './apiClient';

export type NutrientGoalType = 'minimum' | 'maximum' | 'target';

export interface NutrientGoalPreference {
  goalType: NutrientGoalType;
  targetMin?: number | null;
  targetMax?: number | null;
}

export type NutrientGoalPreferences = Record<string, NutrientGoalPreference>;

/** Effective direction (saved override or built-in default) for every goal nutrient. */
export const fetchNutrientGoalPreferences =
  async (): Promise<NutrientGoalPreferences> => {
    return apiFetch<NutrientGoalPreferences>({
      endpoint: '/api/nutrient-goal-preferences',
      serviceName: 'Nutrient Goal Preferences API',
      operation: 'fetch nutrient goal preferences',
    });
  };

export const saveNutrientGoalPreference = async (
  nutrientKey: string,
  preference: NutrientGoalPreference
): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: `/api/nutrient-goal-preferences/${encodeURIComponent(nutrientKey)}`,
    serviceName: 'Nutrient Goal Preferences API',
    operation: 'save nutrient goal preference',
    method: 'PUT',
    body: preference,
  });
};
