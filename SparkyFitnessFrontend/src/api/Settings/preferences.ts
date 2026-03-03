import { apiCall } from '@/api/api';
import { DefaultPreferences } from '@/contexts/PreferencesContext';
import { UserPreferences } from '@/services/preferenceService';

interface NutrientPreference {
  view_group: string;
  platform: 'desktop' | 'mobile';
  visible_nutrients: string[];
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

export const upsertUserPreferences = async (
  payload: Partial<DefaultPreferences>
): Promise<unknown> => {
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
