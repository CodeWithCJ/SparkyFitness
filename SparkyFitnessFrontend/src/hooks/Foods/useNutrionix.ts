import {
  searchNutritionixFoods,
  getNutritionixNutrients,
  getNutritionixBrandedNutrients,
} from '@/api/Foods/nutrionix';
import { nutritionixKeys } from '@/api/keys/meals';

// 1. Search Query Options
export const searchNutritionixOptions = (
  query: string,
  providerId: string | null
) => ({
  queryKey: nutritionixKeys.search(query, providerId),
  queryFn: () => searchNutritionixFoods(query, providerId),
  enabled: !!query && !!providerId,
});

export const nutritionixNaturalNutrientsOptions = (
  query: string,
  providerId: string | null
) => ({
  queryKey: nutritionixKeys.naturalNutrients(query, providerId),
  queryFn: () => getNutritionixNutrients(query, providerId),
  enabled: !!query && !!providerId,
});

export const nutritionixBrandedNutrientsOptions = (
  nixItemId: string,
  providerId: string | null
) => ({
  queryKey: nutritionixKeys.brandedNutrients(nixItemId, providerId),
  queryFn: () => getNutritionixBrandedNutrients(nixItemId, providerId),
  enabled: !!nixItemId && !!providerId,
});
