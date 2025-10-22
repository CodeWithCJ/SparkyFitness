import { toast } from "@/hooks/use-toast";
import { apiCall } from './api'; // Import apiCall

// Function to fetch food data provider details from your backend
const fetchFoodDataProvider = async (providerId: string) => {
  try {
    const data = await apiCall(`/external-providers/${providerId}`);
    return data;
  } catch (error) {
    console.error("Error fetching food data provider:", error);
    toast({
      title: "Error",
      description: `Failed to retrieve food data provider details: ${error.message}`,
      variant: "destructive",
    });
    return null;
  }
};

interface NutritionixFoodItem {
  food_name: string;
  brand_name?: string;
  serving_qty: number;
  serving_unit: string;
  nf_calories: number;
  nf_total_fat: number;
  nf_saturated_fat: number;
  nf_cholesterol: number;
  nf_sodium: number;
  nf_total_carbohydrate: number;
  nf_dietary_fiber: number;
  nf_sugars: number;
  nf_protein: number;
  nf_potassium: number;
  nf_p: number; // Phosphorus
}

interface NutritionixInstantSearchResponse {
  common: { food_name: string; photo: { thumb: string } }[];
  branded: {
    food_name: string;
    brand_name: string;
    nf_calories: number;
    nf_protein?: number;
    nf_total_carbohydrate?: number;
    nf_total_fat?: number;
    photo: { thumb: string };
    serving_qty: number;
    serving_unit: string;
    nix_item_id: string;
    full_nutrients?: { attr_id: number; value: number }[]; // Add this for detailed branded item lookup
  }[];
}

interface NutritionixNutrientsResponse {
  foods: NutritionixFoodItem[];
}

const NUTRITIONIX_API_BASE_URL = "https://trackapi.nutritionix.com/v2";

export const searchNutritionixFoods = async (query: string, defaultFoodDataProviderId: string | null) => {
  if (!defaultFoodDataProviderId) {
    toast({
      title: "Error",
      description: "No default Nutritionix provider configured.",
      variant: "destructive",
    });
    return [];
  }

  const providerData = await fetchFoodDataProvider(defaultFoodDataProviderId);

  if (!providerData?.app_id || !providerData?.app_key) {
    return [];
  }

  const headers = {
    "Content-Type": "application/json",
    "x-app-id": providerData.app_id,
    "x-app-key": providerData.app_key,
  };

  try {
    const data: NutritionixInstantSearchResponse = await apiCall(`${NUTRITIONIX_API_BASE_URL}/search/instant?query=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers,
      externalApi: true,
    });
    const commonFoods = (data.common || []).slice(0, 10).map((item) => ({
      id: item.food_name, // Use food_name as a temporary ID for common foods
      name: item.food_name,
      brand: null,
      image: item.photo?.thumb,
      source: "Nutritionix",
      // Basic info, full nutrients will be fetched on selection
      serving_size: 0,
      serving_unit: 'g',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    }));

    const brandedFoods = (data.branded || []).slice(0, 10).map((item) => ({
      id: item.nix_item_id,
      name: item.food_name,
      brand: item.brand_name,
      image: item.photo?.thumb,
      source: "Nutritionix",
      calories: item.nf_calories,
      protein: item.nf_protein || 0,
      carbs: item.nf_total_carbohydrate || 0,
      fat: item.nf_total_fat || 0,
      serving_size: item.serving_qty,
      serving_unit: item.serving_unit,
    }));

    const results = [...commonFoods, ...brandedFoods];
    return results;
  } catch (error) {
    console.error("Network error during Nutritionix instant search:", error);
    toast({
      title: "Error",
      description: "Network error during Nutritionix search. Please try again.",
      variant: "destructive",
    });
    return [];
  }
};

export const getNutritionixNutrients = async (query: string, defaultFoodDataProviderId: string | null) => {
  if (!defaultFoodDataProviderId) {
    toast({
      title: "Error",
      description: "No default Nutritionix provider configured.",
      variant: "destructive",
    });
    return null;
  }

  const providerData = await fetchFoodDataProvider(defaultFoodDataProviderId);

  if (!providerData?.app_id || !providerData?.app_key) {
    return null;
  }

  const headers = {
    "Content-Type": "application/json",
    "x-app-id": providerData.app_id,
    "x-app-key": providerData.app_key,
  };

  try {
    const data: any = await apiCall(`${NUTRITIONIX_API_BASE_URL}/natural/nutrients`, {
      method: 'POST',
      headers,
      body: { query },
      externalApi: true,
    });
    if (data && data.foods && data.foods.length > 0) {
      const food = data.foods[0];
      return {
        name: food.food_name,
        brand: food.brand_name || null,
        calories: food.nf_calories,
        protein: food.nf_protein,
        carbs: food.nf_total_carbohydrate,
        fat: food.nf_total_fat,
        saturated_fat: food.nf_saturated_fat,
        polyunsaturated_fat: 0, // Not provided by this endpoint
        monounsaturated_fat: 0, // Not provided by this endpoint
        trans_fat: 0, // Not provided by this endpoint
        cholesterol: food.nf_cholesterol,
        sodium: food.nf_sodium,
        potassium: food.nf_potassium,
        dietary_fiber: food.nf_dietary_fiber,
        sugars: food.nf_sugars,
        vitamin_a: 0, // Not provided by this endpoint
        vitamin_c: 0, // Not provided by this endpoint
        calcium: 0, // Not provided by this endpoint
        iron: 0, // Not provided by this endpoint
        serving_size: food.serving_qty,
        serving_unit: food.serving_unit,
      };
    }
    return null;
  } catch (error) {
    console.error("Network error during Nutritionix nutrient lookup:", error);
    toast({
      title: "Error",
      description: "Network error during Nutritionix nutrient lookup. Please try again.",
      variant: "destructive",
    });
    return null;
  }
};

export const getNutritionixBrandedNutrients = async (nixItemId: string, defaultFoodDataProviderId: string | null) => {
  if (!defaultFoodDataProviderId) {
    toast({
      title: "Error",
      description: "No default Nutritionix provider configured.",
      variant: "destructive",
    });
    return null;
  }

  const providerData = await fetchFoodDataProvider(defaultFoodDataProviderId);

  if (!providerData?.app_id || !providerData?.app_key) {
    return null;
  }

  const headers = {
    "Content-Type": "application/json",
    "x-app-id": providerData.app_id,
    "x-app-key": providerData.app_key,
  };

  try {
    const data: any = await apiCall(`${NUTRITIONIX_API_BASE_URL}/search/item`, {
      method: 'GET',
      headers,
      params: { nix_item_id: nixItemId },
      externalApi: true,
    });
    if (data && data.foods && data.foods.length > 0) {
      const food = data.foods[0];
      return {
        name: food.food_name,
        brand: food.brand_name || null,
        calories: food.nf_calories,
        protein: food.nf_protein,
        carbs: food.nf_total_carbohydrate,
        fat: food.nf_total_fat,
        saturated_fat: food.nf_saturated_fat,
        polyunsaturated_fat: 0, // Not provided by this endpoint
        monounsaturated_fat: 0, // Not provided by this endpoint
        trans_fat: 0, // Not provided by this endpoint
        cholesterol: food.nf_cholesterol,
        sodium: food.nf_sodium,
        potassium: food.nf_potassium,
        dietary_fiber: food.nf_dietary_fiber,
        sugars: food.nf_sugars,
        vitamin_a: 0, // Not provided by this endpoint
        vitamin_c: 0, // Not provided by this endpoint
        calcium: 0, // Not provided by this endpoint
        iron: 0, // Not provided by this endpoint
        serving_size: food.serving_qty,
        serving_unit: food.serving_unit,
      };
    }
    return null;
  } catch (error) {
    console.error("Network error during Nutritionix branded item lookup:", error);
    toast({
      title: "Error",
      description: "Network error during Nutritionix branded item lookup. Please try again.",
      variant: "destructive",
    });
    return null;
  }
};