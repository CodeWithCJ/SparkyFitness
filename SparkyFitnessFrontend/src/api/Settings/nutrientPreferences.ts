import { apiCall } from '@/services/api';

export const updateNutrientDisplayPreference = async (
  viewGroup: string,
  platform: 'desktop' | 'mobile',
  visibleNutrients: string[]
) => {
  return apiCall(`/preferences/nutrient-display/${viewGroup}/${platform}`, {
    method: 'PUT',
    body: JSON.stringify({ visible_nutrients: visibleNutrients }),
  });
};

export const resetNutrientDisplayPreference = async (
  viewGroup: string,
  platform: 'desktop' | 'mobile'
) => {
  return apiCall(`/preferences/nutrient-display/${viewGroup}/${platform}`, {
    method: 'DELETE',
  });
};
