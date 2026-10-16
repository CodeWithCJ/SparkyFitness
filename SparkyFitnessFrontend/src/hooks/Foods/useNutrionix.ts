import {
  searchNutritionixFoods,
  getNutritionixNutrients,
  getNutritionixBrandedNutrients,
} from '@/api/Foods/nutrionix';
import { nutritionixKeys } from '@/api/keys/meals';

import i18n from 'i18next';
// 1. Search Query Options
export const searchNutritionixOptions = (
  query: string,
  providerId: string | null
) => ({
  queryKey: nutritionixKeys.search(query, providerId),
  queryFn: () => searchNutritionixFoods(query, providerId),
  enabled: !!query && !!providerId,
  meta: {
    errorMessage: i18n.t(
      'hooks.useNutrionix.failedToSearchNutritionixFoods',
      'Failed to search Nutritionix foods.'
    ),
  },
});

export const nutritionixNaturalNutrientsOptions = (
  query: string,
  providerId: string | null
) => ({
  queryKey: nutritionixKeys.naturalNutrients(query, providerId),
  queryFn: () => getNutritionixNutrients(query, providerId),
  enabled: !!query && !!providerId,
  meta: {
    errorMessage: i18n.t(
      'hooks.useNutrionix.failedToLoadNutritionixNatural',
      'Failed to load Nutritionix natural nutrients.'
    ),
  },
});

export const nutritionixBrandedNutrientsOptions = (
  nixItemId: string,
  providerId: string | null
) => ({
  queryKey: nutritionixKeys.brandedNutrients(nixItemId, providerId),
  queryFn: () => getNutritionixBrandedNutrients(nixItemId, providerId),
  enabled: !!nixItemId && !!providerId,
  meta: {
    errorMessage: i18n.t(
      'hooks.useNutrionix.failedToLoadNutritionixBranded',
      'Failed to load Nutritionix branded nutrients.'
    ),
  },
});
