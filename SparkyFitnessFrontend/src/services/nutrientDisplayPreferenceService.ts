import { apiCall } from './api';

interface NutrientPreference {
    view_group: string;
    platform: 'desktop' | 'mobile';
    visible_nutrients: string[];
}

export const getNutrientDisplayPreferences = async (): Promise<NutrientPreference[]> => {
    return await apiCall('/preferences/nutrient-display');
};

export const updateNutrientDisplayPreferences = async (viewGroup: string, platform: 'desktop' | 'mobile', visible_nutrients: string[]): Promise<any> => {
    return await apiCall(`/preferences/nutrient-display/${viewGroup}/${platform}`, {
        method: 'PUT',
        body: JSON.stringify({ visible_nutrients }),
    });
};

export const resetNutrientDisplayPreferences = async (viewGroup: string, platform: 'desktop' | 'mobile'): Promise<any> => {
    return await apiCall(`/preferences/nutrient-display/${viewGroup}/${platform}`, {
        method: 'DELETE',
    });
};
