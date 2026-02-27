import { apiCall } from '@/api/api';

export interface UsdaFoodSearchItem {
  fdcId: number;
  description: string;
  brandOwner?: string;
  dataType: string;
  foodCategory: string;
  publicationDate: string;
  foodNutrients: UsdaFoodNutrient[];
  servingSize?: number;
  servingSizeUnit?: string;
}

export interface UsdaFoodNutrient {
  nutrientId: number;
  nutrientName: string;
  nutrientNumber: string;
  unitName: string;
  value: number;
}

export interface UsdaFoodDetails {
  fdcId: number;
  description: string;
  brandOwner?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  calories: number;
  protein: number;
  fat: number;
  carbohydrates: number;
  sugars?: number;
  fiber?: number;
  sodium?: number;
  cholesterol?: number;
  saturatedFat?: number;
  transFat?: number;
  monounsaturatedFat?: number;
  polyunsaturatedFat?: number;
  potassium?: number;
  vitaminA?: number;
  vitaminC?: number;
  calcium?: number;
  iron?: number;
}

export const searchUsdaFoods = async (
  query: string,
  providerId: string,
  limit: number = 50
): Promise<UsdaFoodSearchItem[]> => {
  try {
    const response = await apiCall(
      `/foods/usda/search?query=${encodeURIComponent(query)}&pageSize=${limit}`,
      {
        headers: { 'x-provider-id': providerId },
      }
    );
    return response.foods || [];
  } catch (error) {
    console.error('Error searching USDA foods:', error);
    throw error;
  }
};

export const getUsdaFoodDetails = async (
  fdcId: number,
  providerId: string
): Promise<UsdaFoodDetails | null> => {
  try {
    const response = await apiCall(`/foods/usda/details?fdcId=${fdcId}`, {
      headers: { 'x-provider-id': providerId },
    });

    if (!response) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nutrientMap: any = {};
    if (response.foodNutrients) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response.foodNutrients.forEach((n: any) => {
        // USDA returns various spellings, try to normalize or check multiple
        const name =
          n.nutrient?.name?.toLowerCase() ||
          n.nutrientName?.toLowerCase() ||
          '';
        const unit = n.amount !== undefined ? n.unitName : n.nutrient?.unitName; // Check where unit is stored
        const unitLower = unit?.toLowerCase() || '';
        const nutrientId = n.nutrient?.id || n.nutrientId;

        // In details endpoint, value is often in 'amount' or 'value'
        const value = n.amount !== undefined ? n.amount : n.value;

        // Energy: Check specific IDs first (1008, 2047, 2048) or name/unit match
        if (
          nutrientId === 1008 ||
          nutrientId === 2047 ||
          nutrientId === 2048 ||
          (name.includes('energy') &&
            (unitLower === 'kcal' ||
              unitLower === 'calorie' ||
              name.includes('kcal')))
        ) {
          nutrientMap.calories = value;
        } else if (name === 'protein') {
          nutrientMap.protein = value;
        } else if (name === 'total lipid (fat)' || name === 'fat') {
          nutrientMap.fat = value;
        } else if (name.includes('carbohydrate')) {
          nutrientMap.carbohydrates = value;
        } else if (name.includes('sugars, total')) {
          nutrientMap.sugars = value;
        } else if (name.includes('fiber')) {
          nutrientMap.fiber = value;
        } else if (name.includes('sodium')) {
          nutrientMap.sodium = value;
        } else if (name.includes('cholesterol')) {
          nutrientMap.cholesterol = value;
        } else if (name.includes('saturated')) {
          nutrientMap.saturatedFat = value;
        } else if (name.includes('trans')) {
          nutrientMap.transFat = value;
        } else if (name.includes('monounsaturated')) {
          nutrientMap.monounsaturatedFat = value;
        } else if (name.includes('polyunsaturated')) {
          nutrientMap.polyunsaturatedFat = value;
        } else if (name.includes('potassium')) {
          nutrientMap.potassium = value;
        } else if (name.includes('vitamin a')) {
          nutrientMap.vitaminA = value;
        } else if (name.includes('vitamin c')) {
          nutrientMap.vitaminC = value;
        } else if (name.includes('calcium')) {
          nutrientMap.calcium = value;
        } else if (name.includes('iron')) {
          nutrientMap.iron = value;
        }
      });
    }

    return {
      fdcId: response.fdcId,
      description: response.description,
      brandOwner: response.brandOwner,
      servingSize: response.servingSize,
      servingSizeUnit: response.servingSizeUnit,
      calories: nutrientMap.calories || 0,
      protein: nutrientMap.protein || 0,
      fat: nutrientMap.fat || 0,
      carbohydrates: nutrientMap.carbohydrates || 0,
      sugars: nutrientMap.sugars || 0,
      fiber: nutrientMap.fiber || 0,
      sodium: nutrientMap.sodium || 0,
      cholesterol: nutrientMap.cholesterol || 0,
      saturatedFat: nutrientMap.saturatedFat || 0,
      transFat: nutrientMap.transFat || 0,
      monounsaturatedFat: nutrientMap.monounsaturatedFat || 0,
      polyunsaturatedFat: nutrientMap.polyunsaturatedFat || 0,
      potassium: nutrientMap.potassium || 0,
      vitaminA: nutrientMap.vitaminA || 0,
      vitaminC: nutrientMap.vitaminC || 0,
      calcium: nutrientMap.calcium || 0,
      iron: nutrientMap.iron || 0,
    };
  } catch (error) {
    console.error(`Error getting USDA food details for fdcId ${fdcId}:`, error);
    return null;
  }
};
