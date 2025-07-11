const foodRepository = require('../models/foodRepository');
const userRepository = require('../models/userRepository'); // For authorization checks
const mealService = require('./mealService');
const { log } = require('../config/logging');
const { getFatSecretAccessToken, foodNutrientCache, CACHE_DURATION_MS, FATSECRET_API_BASE_URL } = require('../integrations/fatsecret/fatsecretService');

async function getFoodDataProviders(userId) {
  try {
    const providers = await foodRepository.getFoodDataProviders(userId);
    return providers;
  } catch (error) {
    log('error', `Error fetching food data providers for user ${userId} in foodService:`, error);
    throw error;
  }
}

async function getFoodDataProvidersForUser(authenticatedUserId, targetUserId) {
  try {
    const providers = await foodRepository.getFoodDataProvidersByUserId(targetUserId);
    return providers;
  } catch (error) {
    log('error', `Error fetching food data providers for target user ${targetUserId} by ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function createFoodDataProvider(authenticatedUserId, providerData) {
  try {
    // Ensure the authenticated user is the one creating the provider
    providerData.user_id = authenticatedUserId;
    const newProvider = await foodRepository.createFoodDataProvider(providerData);
    return newProvider;
  } catch (error) {
    log('error', `Error creating food data provider for user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function updateFoodDataProvider(authenticatedUserId, providerId, updateData) {
  try {
    const isOwner = await foodRepository.checkFoodDataProviderOwnership(providerId, authenticatedUserId);
    if (!isOwner) {
      throw new Error("Forbidden: You do not have permission to update this food data provider.");
    }
    const updatedProvider = await foodRepository.updateFoodDataProvider(providerId, authenticatedUserId, updateData);
    if (!updatedProvider) {
      throw new Error('Food data provider not found or not authorized to update.');
    }
    return updatedProvider;
  } catch (error) {
    log('error', `Error updating food data provider ${providerId} by user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function getFoodDataProviderDetails(authenticatedUserId, providerId) {
  try {
    const isOwner = await foodRepository.checkFoodDataProviderOwnership(providerId, authenticatedUserId);
    if (!isOwner) {
      throw new Error("Forbidden: You do not have permission to access this food data provider.");
    }
    const details = await foodRepository.getFoodDataProviderById(providerId);
    return details;
  } catch (error) {
    log('error', `Error fetching food data provider details for ${providerId} by user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}
 
async function deleteFoodDataProvider(authenticatedUserId, providerId) {
  try {
    const isOwner = await foodRepository.checkFoodDataProviderOwnership(providerId, authenticatedUserId);
    if (!isOwner) {
      throw new Error("Forbidden: You do not have permission to delete this food data provider.");
    }
    const success = await foodRepository.deleteFoodDataProvider(providerId);
    if (!success) {
      throw new Error('Food data provider not found or not authorized to delete.');
    }
    return true;
  } catch (error) {
    log('error', `Error deleting food data provider ${providerId} by user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}
 
async function searchFatSecretFoods(query, clientId, clientSecret) {
  try {
    const accessToken = await getFatSecretAccessToken(clientId, clientSecret);
    const searchUrl = `${FATSECRET_API_BASE_URL}?${new URLSearchParams({
      method: "foods.search",
      search_expression: query,
      format: "json",
    }).toString()}`;
    log('info', `FatSecret Search URL: ${searchUrl}`);
    const response = await fetch(
      searchUrl,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        }
      }
    );
 
    if (!response.ok) {
      const errorText = await response.text();
      log('error', "FatSecret Food Search API error:", errorText);
      throw new Error(`FatSecret API error: ${errorText}`);
    }
 
    const data = await response.json();
    return data;
  } catch (error) {
    log('error', `Error searching FatSecret foods with query "${query}" in foodService:`, error);
    throw error;
  }
}

async function getFatSecretNutrients(foodId, clientId, clientSecret) {
  try {
    // Check cache first
    const cachedData = foodNutrientCache.get(foodId);
    if (cachedData && Date.now() < cachedData.expiry) {
      log('info', `Returning cached data for foodId: ${foodId}`);
      return cachedData.data;
    }

    const accessToken = await getFatSecretAccessToken(clientId, clientSecret);
    const nutrientsUrl = `${FATSECRET_API_BASE_URL}?${new URLSearchParams({
      method: "food.get.v4",
      food_id: foodId,
      format: "json",
    }).toString()}`;
    log('info', `FatSecret Nutrients URL: ${nutrientsUrl}`);
    const response = await fetch(
      nutrientsUrl,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      log('error', "FatSecret Food Get API error:", errorText);
      throw new Error(`FatSecret API error: ${errorText}`);
    }

    const data = await response.json();
    // Store in cache
    foodNutrientCache.set(foodId, {
      data: data,
      expiry: Date.now() + CACHE_DURATION_MS
    });
    return data;
  } catch (error) {
    log('error', `Error fetching FatSecret nutrients for foodId ${foodId} in foodService:`, error);
    throw error;
  }
}

async function searchFoods(authenticatedUserId, name, targetUserId, exactMatch, broadMatch, checkCustom) {
  try {
    if (targetUserId && targetUserId !== authenticatedUserId) {
    }
    const foods = await foodRepository.searchFoods(name, targetUserId || authenticatedUserId, exactMatch, broadMatch, checkCustom);
    return foods;
  } catch (error) {
    log('error', `Error searching foods for user ${authenticatedUserId} with name "${name}" in foodService:`, error);
    throw error;
  }
}

async function createFood(authenticatedUserId, foodData) {
  try {
    // The foodData object already contains all necessary fields for food and its default variant.
    // foodRepository.createFood handles the creation of both the food and its default variant in a single transaction.
    const newFood = await foodRepository.createFood(foodData);
    return newFood;
  } catch (error) {
    log('error', `Error creating food for user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function getFoodById(authenticatedUserId, foodId) {
  try {
    const foodOwnerId = await foodRepository.getFoodOwnerId(foodId);
    if (!foodOwnerId) {
      // If food is not found, it might be a public food or an invalid ID.
      // Try to fetch it without user_id constraint.
      const publicFood = await foodRepository.getFoodById(foodId);
      if (publicFood && !publicFood.is_custom) { // Assuming public foods are not custom
        return publicFood;
      }
      throw new Error('Food not found.');
    }

    const food = await foodRepository.getFoodById(foodId);
    return food;
  } catch (error) {
    log('error', `Error fetching food ${foodId} by user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function updateFood(authenticatedUserId, foodId, foodData) {
  try {
    const foodOwnerId = await foodRepository.getFoodOwnerId(foodId);
    if (!foodOwnerId) {
      throw new Error('Food not found.');
    }
    if (foodOwnerId !== authenticatedUserId) {
      throw new Error('Forbidden: You do not have permission to update this food.');
    }

    // Update the food's main details
    const updatedFood = await foodRepository.updateFood(foodId, foodOwnerId, foodData);
    if (!updatedFood) {
      throw new Error('Food not found or not authorized to update.');
    }

    // If nutrient or serving data is provided, update the default variant
    if (foodData.serving_size !== undefined || foodData.calories !== undefined) {
      const defaultVariant = await foodRepository.getFoodVariantById(updatedFood.default_variant_id);
      if (defaultVariant) {
        const updatedVariantData = {
          serving_size: foodData.serving_size ?? defaultVariant.serving_size,
          serving_unit: foodData.serving_unit ?? defaultVariant.serving_unit,
          calories: foodData.calories ?? defaultVariant.calories,
          protein: foodData.protein ?? defaultVariant.protein,
          carbs: foodData.carbs ?? defaultVariant.carbs,
          fat: foodData.fat ?? defaultVariant.fat,
          saturated_fat: foodData.saturated_fat ?? defaultVariant.saturated_fat,
          polyunsaturated_fat: foodData.polyunsaturated_fat ?? defaultVariant.polyunsaturated_fat,
          monounsaturated_fat: foodData.monounsaturated_fat ?? defaultVariant.monounsaturated_fat,
          trans_fat: foodData.trans_fat ?? defaultVariant.trans_fat,
          cholesterol: foodData.cholesterol ?? defaultVariant.cholesterol,
          sodium: foodData.sodium ?? defaultVariant.sodium,
          potassium: foodData.potassium ?? defaultVariant.potassium,
          dietary_fiber: foodData.dietary_fiber ?? defaultVariant.dietary_fiber,
          sugars: foodData.sugars ?? defaultVariant.sugars,
          vitamin_a: foodData.vitamin_a ?? defaultVariant.vitamin_a,
          vitamin_c: foodData.vitamin_c ?? defaultVariant.vitamin_c,
          calcium: foodData.calcium ?? defaultVariant.calcium,
          iron: foodData.iron ?? defaultVariant.iron,
        };
        await foodRepository.updateFoodVariant(defaultVariant.id, updatedVariantData);
      }
    }
    return updatedFood;
  } catch (error) {
    log('error', `Error updating food ${foodId} by user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function deleteFood(authenticatedUserId, foodId) {
  try {
    const foodOwnerId = await foodRepository.getFoodOwnerId(foodId);
    if (!foodOwnerId) {
      throw new Error('Food not found.');
    }
    const success = await foodRepository.deleteFood(foodId, foodOwnerId);
    if (!success) {
      throw new Error('Food not found or not authorized to delete.');
    }
    return true;
  } catch (error) {
    log('error', `Error deleting food ${foodId} by user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function getFoodsWithPagination(authenticatedUserId, searchTerm, foodFilter, currentPage, itemsPerPage, sortBy) {
  try {
    const limit = parseInt(itemsPerPage, 10) || 10;
    const offset = ((parseInt(currentPage, 10) || 1) - 1) * limit;

    const [foods, totalCount] = await Promise.all([
      foodRepository.getFoodsWithPagination(searchTerm, foodFilter, authenticatedUserId, limit, offset, sortBy),
      foodRepository.countFoods(searchTerm, foodFilter, authenticatedUserId)
    ]);
    return { foods, totalCount };
  } catch (error) {
    log('error', `Error fetching foods with pagination for user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function createFoodVariant(authenticatedUserId, variantData) {
  try {
    const foodOwnerId = await foodRepository.getFoodOwnerId(variantData.food_id);
    if (!foodOwnerId) {
      throw new Error('Food not found.');
    }
    if (foodOwnerId !== authenticatedUserId) {
      throw new Error('Forbidden: You do not have permission to create a variant for this food.');
    }
    variantData.user_id = authenticatedUserId; // Ensure user_id is set from authenticated user
    const newVariant = await foodRepository.createFoodVariant(variantData);
    return newVariant;
  } catch (error) {
    log('error', `Error creating food variant for food ${variantData.food_id} by user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function getFoodVariantById(authenticatedUserId, variantId) {
  try {
    const variant = await foodRepository.getFoodVariantById(variantId);
    if (!variant) {
      throw new Error('Food variant not found.');
    }
    const foodOwnerId = await foodRepository.getFoodOwnerId(variant.food_id);
    if (!foodOwnerId) {
      throw new Error('Associated food not found.');
    }
    return variant;
  } catch (error) {
    log('error', `Error fetching food variant ${variantId} by user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function updateFoodVariant(authenticatedUserId, variantId, variantData) {
  try {
    const variant = await foodRepository.getFoodVariantById(variantId);
    if (!variant) {
      throw new Error('Food variant not found.');
    }
    const foodOwnerId = await foodRepository.getFoodOwnerId(variant.food_id);
    if (!foodOwnerId) {
      throw new Error('Associated food not found.');
    }
    if (foodOwnerId !== authenticatedUserId) {
      throw new Error('Forbidden: You do not have permission to update this food variant.');
    }
    variantData.user_id = authenticatedUserId; // Ensure user_id is set from authenticated user
    const updatedVariant = await foodRepository.updateFoodVariant(variantId, variantData);
    if (!updatedVariant) {
      throw new Error('Food variant not found.');
    }
    return updatedVariant;
  } catch (error) {
    log('error', `Error updating food variant ${variantId} by user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function deleteFoodVariant(authenticatedUserId, variantId) {
  try {
    const variant = await foodRepository.getFoodVariantById(variantId);
    if (!variant) {
      throw new Error('Food variant not found.');
    }
    const foodOwnerId = await foodRepository.getFoodOwnerId(variant.food_id);
    if (!foodOwnerId) {
      throw new Error('Associated food not found.');
    }
    const success = await foodRepository.deleteFoodVariant(variantId);
    if (!success) {
      throw new Error('Food variant not found.');
    }
    return true;
  } catch (error) {
    log('error', `Error deleting food variant ${variantId} by user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function getFoodVariantsByFoodId(authenticatedUserId, foodId) {
  log('info', `getFoodVariantsByFoodId: Fetching variants for foodId: ${foodId}, authenticatedUserId: ${authenticatedUserId}`);
  try {
    const foodOwnerId = await foodRepository.getFoodOwnerId(foodId);
    log('info', `getFoodVariantsByFoodId: foodOwnerId for ${foodId}: ${foodOwnerId}`);
    // If food is not found (foodOwnerId is null), return an empty array of variants.
    // The client-side expects an empty array if no variants exist for a food.
    if (!foodOwnerId) {
      log('warn', `getFoodVariantsByFoodId: Food with ID ${foodId} not found or not owned by user. Returning empty array.`);
      return [];
    }

    // Authorization check: Ensure the authenticated user owns the food
    // or has family access to the owner's data.
    // For simplicity, assuming direct ownership for now.
    if (foodOwnerId !== authenticatedUserId) {
      log('warn', `getFoodVariantsByFoodId: Forbidden - User ${authenticatedUserId} does not own food ${foodId}.`);
      throw new Error('Forbidden: You do not have permission to access variants for this food.');
    }

    const variants = await foodRepository.getFoodVariantsByFoodId(foodId);
    log('info', `getFoodVariantsByFoodId: Found ${variants.length} variants for foodId: ${foodId}`);
    return variants;
  } catch (error) {
    log('error', `Error fetching food variants for food ${foodId} by user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}
 
async function createFoodEntry(authenticatedUserId, entryData) {
  try {
    entryData.user_id = authenticatedUserId; // Ensure user_id is set from authenticated user
    const newEntry = await foodRepository.createFoodEntry(entryData);
    return newEntry;
  } catch (error) {
    log('error', `Error creating food entry for user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function updateFoodEntry(authenticatedUserId, entryId, entryData) {
  try {
    const entryOwnerId = await foodRepository.getFoodEntryOwnerId(entryId);
    if (!entryOwnerId) {
      throw new Error('Food entry not found.');
    }
    if (entryOwnerId !== authenticatedUserId) {
      throw new Error('Forbidden: You do not have permission to update this food entry.');
    }
    const updatedEntry = await foodRepository.updateFoodEntry(entryId, authenticatedUserId, entryData);
    if (!updatedEntry) {
      throw new Error('Food entry not found or not authorized to update.');
    }
    return updatedEntry;
  } catch (error) {
    log('error', `Error updating food entry ${entryId} by user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}
async function deleteFoodEntry(authenticatedUserId, entryId) {
  try {
    const entryOwnerId = await foodRepository.getFoodEntryOwnerId(entryId);
    if (!entryOwnerId) {
      throw new Error('Food entry not found.');
    }
    // Authorization check: Ensure the authenticated user owns the entry
    // or has family access to the owner's data.
    // For simplicity, assuming direct ownership for now.
    if (entryOwnerId !== authenticatedUserId) {
      // In a real app, you'd check family access here.
      throw new Error('Forbidden: You do not have permission to delete this food entry.');
    }

    const success = await foodRepository.deleteFoodEntry(entryId);
    if (!success) {
      throw new Error('Food entry not found or not authorized to delete.');
    }
    return true;
  } catch (error) {
    log('error', `Error deleting food entry ${entryId} by user ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function getFoodEntriesByDate(authenticatedUserId, targetUserId, selectedDate) {
  try {
    if (!targetUserId) {
      log('error', 'getFoodEntriesByDate: targetUserId is undefined. Returning empty array.');
      return [];
    }

    const entries = await foodRepository.getFoodEntriesByDate(targetUserId, selectedDate);
    return entries;
  } catch (error) {
    log('error', `Error fetching food entries for user ${targetUserId} on ${selectedDate} by ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function getFoodEntriesByDateRange(authenticatedUserId, targetUserId, startDate, endDate) {
  try {
    const entries = await foodRepository.getFoodEntriesByDateRange(targetUserId, startDate, endDate);
    return entries;
  } catch (error) {
    log('error', `Error fetching food entries for user ${targetUserId} from ${startDate} to ${endDate} by ${authenticatedUserId} in foodService:`, error);
    throw error;
  }
}

async function createOrGetFood(authenticatedUserId, foodSuggestion) {
  try {
    // First, try to find an existing food (either public or user's custom food)
    const existingFood = await foodRepository.findFoodByNameAndBrand(
      foodSuggestion.name,
      foodSuggestion.brand,
      authenticatedUserId
    );

    if (existingFood) {
      log('info', `Found existing food: ${existingFood.name} (ID: ${existingFood.id})`);
      return existingFood;
    }

    // If not found, create a new custom food for the user
    const foodToCreate = {
      name: foodSuggestion.name,
      brand: foodSuggestion.brand || null,
      is_custom: true,
      user_id: authenticatedUserId,
      barcode: foodSuggestion.barcode || null,
      provider_external_id: foodSuggestion.provider_external_id || null,
      shared_with_public: foodSuggestion.shared_with_public || false,
      provider_type: foodSuggestion.provider_type || null,
    };

    const newFood = await foodRepository.createFood(foodToCreate);

    const defaultVariantData = {
      food_id: newFood.id,
      serving_size: foodSuggestion.serving_size || 0,
      serving_unit: foodSuggestion.serving_unit || 'g',
      calories: foodSuggestion.calories || 0,
      protein: foodSuggestion.protein || 0,
      carbs: foodSuggestion.carbs || 0,
      fat: foodSuggestion.fat || 0,
      saturated_fat: foodSuggestion.saturated_fat || 0,
      polyunsaturated_fat: foodSuggestion.polyunsaturated_fat || 0,
      monounsaturated_fat: foodSuggestion.monounsaturated_fat || 0,
      trans_fat: foodSuggestion.trans_fat || 0,
      cholesterol: foodSuggestion.cholesterol || 0,
      sodium: foodSuggestion.sodium || 0,
      potassium: foodSuggestion.potassium || 0,
      dietary_fiber: foodSuggestion.dietary_fiber || 0,
      sugars: foodSuggestion.sugars || 0,
      vitamin_a: foodSuggestion.vitamin_a || 0,
      vitamin_c: foodSuggestion.vitamin_c || 0,
      calcium: foodSuggestion.calcium || 0,
      iron: foodSuggestion.iron || 0,
    };
    const newVariant = await foodRepository.createFoodVariant(defaultVariantData);

    // Update the food with the default_variant_id
    await foodRepository.updateFood(newFood.id, newFood.user_id, { default_variant_id: newVariant.id });

    log('info', `Created new food: ${newFood.name} (ID: ${newFood.id}) with default variant (ID: ${newVariant.id})`);
    return { ...newFood, ...newVariant };
  } catch (error) {
    log('error', `Error in createOrGetFood for user ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function bulkCreateFoodVariants(authenticatedUserId, variantsData) {
  try {
    const variantsToCreate = await Promise.all(variantsData.map(async (variant) => {
      const foodOwnerId = await foodRepository.getFoodOwnerId(variant.food_id);
      if (!foodOwnerId || foodOwnerId !== authenticatedUserId) {
        throw new Error(`Forbidden: You do not have permission to create a variant for food ID ${variant.food_id}.`);
      }
      return { ...variant, user_id: authenticatedUserId };
    }));
    const createdVariants = await foodRepository.bulkCreateFoodVariants(variantsToCreate);
    return createdVariants;
  } catch (error) {
    log('error', `Error in bulkCreateFoodVariants for user ${authenticatedUserId}:`, error);
    throw error;
  }
}
module.exports = {
  getFoodDataProviders,
  getFoodDataProvidersForUser,
  createFoodDataProvider,
  updateFoodDataProvider,
  getFoodDataProviderDetails,
  searchFatSecretFoods,
  getFatSecretNutrients,
  searchFoods,
  createFood,
  getFoodById,
  updateFood,
  deleteFood,
  getFoodsWithPagination,
  createFoodVariant,
  getFoodVariantById,
  updateFoodVariant,
  deleteFoodVariant,
  getFoodVariantsByFoodId,
  createFoodEntry,
  deleteFoodEntry,
  updateFoodEntry,
  getFoodEntriesByDate,
  getFoodEntriesByDateRange,
  createOrGetFood,
  bulkCreateFoodVariants,
  deleteFoodDataProvider,
};