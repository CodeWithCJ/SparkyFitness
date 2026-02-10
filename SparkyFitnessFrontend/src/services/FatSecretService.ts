import { toast } from '@/hooks/use-toast';
import { apiCall } from './api';

const PROXY_BASE_URL = '/foods/fatsecret'; // Base path for FatSecret proxy endpoints

export interface FatSecretFoodItem {
  food_id: string;
  food_name: string;
  brand_name?: string;
  food_type: string;
  food_url: string;
  food_description: string;
  // Add parsed basic nutrients from food_description
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  serving_size?: number;
  serving_unit?: string;
}

interface FatSecretServing {
  serving_id: string;
  serving_description: string;
  metric_serving_amount: string;
  metric_serving_unit: string;
  number_of_units: string;
  measurement_description: string;
  is_default: string;
  calories: string;
  carbohydrate: string;
  protein: string;
  fat: string;
  saturated_fat?: string;
  polyunsaturated_fat?: string;
  monounsaturated_fat?: string;
  trans_fat?: string;
  cholesterol?: string;
  sodium?: string;
  potassium?: string;
  fiber?: string;
  sugar?: string;
  added_sugars?: string;
  vitamin_d?: string;
  vitamin_a?: string;
  vitamin_c?: string;
  calcium?: string;
  iron?: string;
}

interface FatSecretSearchResponse {
  foods: {
    max_results: string;
    total_results: string;
    page_number: string;
    food: FatSecretFoodItem[]; // Corrected: 'food' array is directly under 'foods'
  };
}

interface FatSecretFoodGetResponse {
  food: {
    food_id: string;
    food_name: string;
    brand_name?: string;
    food_type: string;
    food_url: string;
    servings: {
      serving: FatSecretServing[];
    };
  };
}

// Helper function to parse food_description for nutrients and serving info
const parseFoodDescription = (description: string) => {
  const caloriesMatch = description.match(/Calories: (\d+)kcal/);
  const fatMatch = description.match(/Fat: ([\d.]+)g/);
  const carbsMatch = description.match(/Carbs: ([\d.]+)g/);
  const proteinMatch = description.match(/Protein: ([\d.]+)g/);

  // Extract serving size and unit (e.g., "Per 1 serving", "Per 100g")
  const servingMatch = description.match(/Per ([\d.]+) (.+?) -/);
  let serving_size: number | undefined;
  let serving_unit: string | undefined;

  if (servingMatch) {
    serving_size = parseFloat(servingMatch[1]);
    serving_unit = servingMatch[2].trim();
  }

  return {
    calories: caloriesMatch ? parseFloat(caloriesMatch[1]) : 0,
    fat: fatMatch ? parseFloat(fatMatch[1]) : 0,
    carbs: carbsMatch ? parseFloat(carbsMatch[1]) : 0,
    protein: proteinMatch ? parseFloat(proteinMatch[1]) : 0,
    serving_size,
    serving_unit,
  };
};

export const searchFatSecretFoods = async (
  query: string,
  providerId: string
) => {
  try {
    const data: FatSecretSearchResponse = await apiCall(
      `${PROXY_BASE_URL}/search?query=${encodeURIComponent(query)}`,
      {
        method: 'GET',
        headers: {
          'x-provider-id': providerId, // Pass providerId in a custom header
        },
      }
    );
    if (data.foods && data.foods.food) {
      return data.foods.food.map((item) => {
        const parsedData = parseFoodDescription(item.food_description);
        return {
          food_id: item.food_id,
          food_name: item.food_name,
          brand_name: item.brand_name || null,
          food_type: item.food_type,
          food_url: item.food_url,
          food_description: item.food_description, // Keep original for now, will remove from display in frontend
          calories: parsedData.calories,
          protein: parsedData.protein,
          carbs: parsedData.carbs,
          fat: parsedData.fat,
          serving_size: parsedData.serving_size,
          serving_unit: parsedData.serving_unit,
        };
      });
    }
    return [];
  } catch (error) {
    console.error('Network error during FatSecret food search:', error);
    toast({
      title: 'Error',
      description: 'Network error during FatSecret search. Please try again.',
      variant: 'destructive',
    });
    return [];
  }
};

export const getFatSecretNutrients = async (
  foodId: string,
  providerId: string
) => {
  try {
    const data: FatSecretFoodGetResponse = await apiCall(
      `${PROXY_BASE_URL}/nutrients?foodId=${encodeURIComponent(foodId)}`,
      {
        method: 'GET',
        headers: {
          'x-provider-id': providerId, // Pass providerId in a custom header
        },
      }
    );
    // The proxy returns the raw FatSecret response, so we parse it here
    if (data.food && data.food.servings && data.food.servings.serving) {
      // Find the default serving or the first serving if no default is flagged
      const defaultServing =
        data.food.servings.serving.find((s) => s.is_default === '1') ||
        data.food.servings.serving[0];

      if (defaultServing) {
        return {
          name: data.food.food_name,
          brand: data.food.brand_name || null,
          calories: parseFloat(defaultServing.calories || '0'),
          protein: parseFloat(defaultServing.protein || '0'),
          carbohydrates: parseFloat(defaultServing.carbohydrate || '0'),
          fat: parseFloat(defaultServing.fat || '0'),
          saturated_fat: parseFloat(defaultServing.saturated_fat || '0'),
          polyunsaturated_fat: parseFloat(
            defaultServing.polyunsaturated_fat || '0'
          ),
          monounsaturated_fat: parseFloat(
            defaultServing.monounsaturated_fat || '0'
          ),
          trans_fat: parseFloat(defaultServing.trans_fat || '0'),
          cholesterol: parseFloat(defaultServing.cholesterol || '0'),
          sodium: parseFloat(defaultServing.sodium || '0'),
          potassium: parseFloat(defaultServing.potassium || '0'),
          dietary_fiber: parseFloat(defaultServing.fiber || '0'),
          sugars: parseFloat(defaultServing.sugar || '0'),
          vitamin_a: parseFloat(defaultServing.vitamin_a || '0'),
          vitamin_c: parseFloat(defaultServing.vitamin_c || '0'),
          calcium: parseFloat(defaultServing.calcium || '0'),
          iron: parseFloat(defaultServing.iron || '0'),
          serving_qty: parseFloat(defaultServing.metric_serving_amount || '0'),
          serving_unit: defaultServing.metric_serving_unit || 'g',
        };
      }
    }
    return null;
  } catch (error) {
    console.error(
      'Network error during FatSecret nutrient lookup via proxy:',
      error
    );
    toast({
      title: 'Error',
      description:
        'Network error during FatSecret nutrient lookup. Please ensure your SparkyFitnessServer is running.',
      variant: 'destructive',
    });
    return null;
  }
};
