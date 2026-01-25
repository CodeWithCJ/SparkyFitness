const { log } = require('../../config/logging');
const externalProviderRepository = require('../../models/externalProviderRepository');

const NUTRITIONIX_API_BASE_URL = "https://trackapi.nutritionix.com/v2";

async function getNutritionixHeaders(providerId) {
  const providerData = await externalProviderRepository.getExternalDataProviderById(providerId);
  if (!providerData || !providerData.app_id || !providerData.app_key) {
    throw new Error("Nutritionix provider not configured or keys missing.");
  }
  return {
    "Content-Type": "application/json",
    "x-app-id": providerData.app_id,
    "x-app-key": providerData.app_key,
  };
}

async function searchNutritionixFoods(query, providerId) {
  try {
    const headers = await getNutritionixHeaders(providerId);
    const response = await fetch(`${NUTRITIONIX_API_BASE_URL}/search/instant?query=${encodeURIComponent(query)}`, {
      method: "GET",
      headers: headers,
    });
    if (!response.ok) {
      const errorText = await response.text();
      log('error', "Nutritionix Instant Search API error:", errorText);
      throw new Error(`Nutritionix API error: ${errorText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    log('error', `Error searching Nutritionix foods with query "${query}" in nutritionixService:`, error);
    throw error;
  }
}

async function getNutritionixNutrients(query, providerId) {
  try {
    const headers = await getNutritionixHeaders(providerId);
    const response = await fetch(`${NUTRITIONIX_API_BASE_URL}/natural/nutrients`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ query: query }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      log('error', "Nutritionix Natural Nutrients API error:", errorText);
      throw new Error(`Nutritionix API error: ${errorText}`);
    }
    const data = await response.json();
    // Extract relevant nutrient information
    if (data.foods && data.foods.length > 0) {
      const food = data.foods[0];
      return {
        name: food.food_name,
        brand: food.brand_name || null,
        calories: food.nf_calories,
        protein: food.nf_protein,
        carbs: food.nf_total_carbohydrate,
        fat: food.nf_total_fat,
        serving_size: food.serving_qty,
        serving_unit: food.serving_unit,
        saturated_fat: food.nf_saturated_fat,
        polyunsaturated_fat: food.nf_polyunsaturated_fat, // Assuming this exists or needs to be mapped
        monounsaturated_fat: food.nf_monounsaturated_fat, // Assuming this exists or needs to be mapped
        trans_fat: food.nf_trans_fat, // Assuming this exists or needs to be mapped
        cholesterol: food.nf_cholesterol,
        sodium: food.nf_sodium,
        potassium: food.nf_potassium,
        dietary_fiber: food.nf_dietary_fiber,
        sugars: food.nf_sugars,
        vitamin_a: food.nf_vitamin_a, // Assuming this exists or needs to be mapped
        vitamin_c: food.nf_vitamin_c, // Assuming this exists or needs to be mapped
        calcium: food.nf_calcium, // Assuming this exists or needs to be mapped
        iron: food.nf_iron, // Assuming this exists or needs to be mapped
      };
    }
    return null;
  } catch (error) {
    log('error', `Error fetching Nutritionix nutrients for query "${query}" in nutritionixService:`, error);
    throw error;
  }
}

async function getNutritionixBrandedNutrients(nixItemId, providerId) {
  try {
    const headers = await getNutritionixHeaders(providerId);
    const response = await fetch(`${NUTRITIONIX_API_BASE_URL}/search/item`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ nix_item_id: nixItemId }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      log('error', "Nutritionix Item Search API error:", errorText);
      throw new Error(`Nutritionix API error: ${errorText}`);
    }
    const data = await response.json();
    // Extract relevant nutrient information
    if (data.foods && data.foods.length > 0) {
      const food = data.foods[0];
      const getNutrientValue = (attr_id) => food.full_nutrients?.find(n => n.attr_id === attr_id)?.value || 0;

      return {
        name: food.food_name,
        brand: food.brand_name || null,
        calories: getNutrientValue(208), // Calories
        protein: getNutrientValue(203), // Protein
        carbs: getNutrientValue(205), // Carbohydrates
        fat: getNutrientValue(204), // Total Fat
        serving_size: food.serving_qty,
        serving_unit: food.serving_unit,
        saturated_fat: getNutrientValue(606), // Saturated Fat
        polyunsaturated_fat: getNutrientValue(646), // Polyunsaturated Fat (Commonly 646, verify with Nutritionix API docs)
        monounsaturated_fat: getNutrientValue(645), // Monounsaturated Fat (Commonly 645, verify with Nutritionix API docs)
        trans_fat: getNutrientValue(605), // Trans Fat (Commonly 605, verify with Nutritionix API docs)
        cholesterol: getNutrientValue(601), // Cholesterol
        sodium: getNutrientValue(307), // Sodium
        potassium: getNutrientValue(306), // Potassium
        dietary_fiber: getNutrientValue(291), // Dietary Fiber
        sugars: getNutrientValue(269), // Sugars
        vitamin_a: getNutrientValue(318), // Vitamin A (Commonly 318, verify with Nutritionix API docs)
        vitamin_c: getNutrientValue(401), // Vitamin C (Commonly 401, verify with Nutritionix API docs)
        calcium: getNutrientValue(301), // Calcium (Commonly 301, verify with Nutritionix API docs)
        iron: getNutrientValue(303), // Iron (Commonly 303, verify with Nutritionix API docs)
      };
    }
    return null;
  } catch (error) {
    log('error', `Error fetching Nutritionix branded item "${nixItemId}" in nutritionixService:`, error);
    throw error;
  }
}

async function searchNutritionixExercises(query, providerId, userDemographics = {}) {
  try {
    const headers = await getNutritionixHeaders(providerId);
    const body = {
      query: query,
      ...userDemographics, // Add user demographics if provided
    };

    const response = await fetch(`${NUTRITIONIX_API_BASE_URL}/natural/exercise`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log('error', "Nutritionix Natural Exercise API error:", errorText);
      throw new Error(`Nutritionix API error: ${errorText}`);
    }

    const data = await response.json();
    
    // Map Nutritionix exercise data to a standardized format
    if (data.exercises && data.exercises.length > 0) {
      return data.exercises.map(exercise => {
        const caloriesPerHour = exercise.duration_min ? (exercise.nf_calories / exercise.duration_min) * 60 : null;
        return {
          id: exercise.tag_id, // Using tag_id as a unique identifier for now
          name: exercise.name || exercise.user_input, // Use user_input as fallback for name
          category: "External", // Nutritionix doesn't provide categories in the same way as Wger
          calories_per_hour: caloriesPerHour,
          description: exercise.description || exercise.user_input,
          duration_min: exercise.duration_min,
          external_id: exercise.tag_id, // Store original external ID
          source: "nutritionix",
        };
      });
    }
    return [];
  } catch (error) {
    log('error', `Error searching Nutritionix exercises with query "${query}" in nutritionixService:`, error);
    throw error;
  }
}

module.exports = {
  searchNutritionixFoods,
  getNutritionixNutrients,
  getNutritionixBrandedNutrients,
  searchNutritionixExercises,
};