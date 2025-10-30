const foodRepository = require("../models/foodRepository");
const preferenceService = require("./preferenceService");
const { log } = require("../config/logging");

async function searchFoods(
  authenticatedUserId,
  name,
  targetUserId,
  exactMatch,
  broadMatch,
  checkCustom,
  limitFromRequest = 10, // Renamed to avoid conflict with preference-based limit
  mealType = undefined
) {
  try {
    if (targetUserId && targetUserId !== authenticatedUserId) {
      // Authorization check for targetUserId if needed
    }

    if (!name) {
      // If no search term, return recent and top foods
      const userPreferences = await preferenceService.getUserPreferences(authenticatedUserId, authenticatedUserId);
      const limit = userPreferences?.item_display_limit || limitFromRequest;

      const recentFoods = await foodRepository.getRecentFoods(
        authenticatedUserId,
        limit,
        mealType
      );
      const topFoods = await foodRepository.getTopFoods(
        authenticatedUserId,
        limit,
        mealType
      );
      return { recentFoods, topFoods };
    } else {
      // Otherwise, perform a regular search
      const userPreferences = await preferenceService.getUserPreferences(authenticatedUserId, authenticatedUserId);
      const limit = userPreferences?.food_display_limit || limitFromRequest; // Use food_display_limit for search results

      const foods = await foodRepository.searchFoods(
        name,
        targetUserId || authenticatedUserId,
        exactMatch,
        broadMatch,
        checkCustom,
        limit // Pass the limit to the repository search function
      );
      return { searchResults: foods };
    }
  } catch (error) {
    log(
      "error",
      `Error searching foods for user ${authenticatedUserId} with name "${name}" in foodService:`,
      error
    );
    throw error;
  }
}

async function createFood(authenticatedUserId, foodData) {
  try {
    // The foodData object already contains all necessary fields for food and its default variant.
    // foodRepository.createFood handles the creation of both the food and its default variant in a single transaction.
    const newFood = await foodRepository.createFood({
      ...foodData,
      glycemic_index: foodData.glycemic_index || null,
    });
    return newFood;
  } catch (error) {
    log(
      "error",
      `Error creating food for user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}

async function getFoodById(authenticatedUserId, foodId) {
  try {
    const foodOwnerId = await foodRepository.getFoodOwnerId(foodId, authenticatedUserId);
    if (!foodOwnerId) {
      // If food is not found, it might be a public food or an invalid ID.
      // Try to fetch it without user_id constraint.
      const publicFood = await foodRepository.getFoodById(foodId, authenticatedUserId);
      if (publicFood && !publicFood.is_custom) {
        // Assuming public foods are not custom
        return publicFood;
      }
      throw new Error("Food not found.");
    }

    const food = await foodRepository.getFoodById(foodId, authenticatedUserId);
    return food;
  } catch (error) {
    log(
      "error",
      `Error fetching food ${foodId} by user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}

async function updateFood(authenticatedUserId, foodId, foodData) {
  try {
    const foodOwnerId = await foodRepository.getFoodOwnerId(foodId, authenticatedUserId);
    if (!foodOwnerId) {
      throw new Error("Food not found.");
    }
    if (foodOwnerId !== authenticatedUserId) {
      throw new Error(
        "Forbidden: You do not have permission to update this food."
      );
    }

    // Update the food's main details
    const updatedFood = await foodRepository.updateFood(
      foodId,
      foodOwnerId,
      foodData
    );
    if (!updatedFood) {
      throw new Error("Food not found or not authorized to update.");
    }

    // The food_entries table now holds the snapshot of nutrient data.
    // Updating the food or its default variant directly will not affect existing food entries.
    // If a food's default variant is updated, existing food entries will retain their original snapshot.
    // New food entries will use the updated default variant's data.
    // The updateFoodEntriesSnapshot function can be used to update existing entries if needed.
    return updatedFood;
  } catch (error) {
    log(
      "error",
      `Error updating food ${foodId} by user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}

async function deleteFood(authenticatedUserId, foodId, forceDelete = false) {
  log("info", `deleteFood: Attempting to delete food ${foodId} by user ${authenticatedUserId}. Force delete: ${forceDelete}`);
  try {
    const foodOwnerId = await foodRepository.getFoodOwnerId(foodId, authenticatedUserId);
    if (!foodOwnerId) {
      log("warn", `deleteFood: Food ${foodId} not found for user ${authenticatedUserId}.`);
      throw new Error("Food not found.");
    }
    if (foodOwnerId !== authenticatedUserId) {
      log("warn", `deleteFood: User ${authenticatedUserId} forbidden from deleting food ${foodId} owned by ${foodOwnerId}.`);
      throw new Error(
        "Forbidden: You do not have permission to delete this food."
      );
    }

    const deletionImpact = await foodRepository.getFoodDeletionImpact(foodId, authenticatedUserId);
    log("info", `deleteFood: Deletion impact for food ${foodId}: ${JSON.stringify(deletionImpact)}`);

    const {
      foodEntriesCount,
      mealFoodsCount,
      mealPlansCount,
      mealPlanTemplateAssignmentsCount,
      currentUserReferences,
      otherUserReferences,
      isPubliclyShared,
      familySharedUsers,
    } = deletionImpact;

    const totalReferences = foodEntriesCount + mealFoodsCount + mealPlansCount + mealPlanTemplateAssignmentsCount;

    // Scenario 1: No references at all
    if (totalReferences === 0) {
      log("info", `deleteFood: Food ${foodId} has no references. Performing hard delete.`);
      const success = await foodRepository.deleteFoodAndDependencies(foodId, authenticatedUserId);
      if (!success) {
        throw new Error("Food not found or not authorized to delete.");
      }
      return { message: "Food deleted permanently.", status: "deleted" };
    }

    // Scenario 2: References only by the current user
    if (otherUserReferences === 0) {
      if (forceDelete) {
        log("info", `deleteFood: Food ${foodId} has references only by current user. Force deleting.`);
        const success = await foodRepository.deleteFoodAndDependencies(foodId, authenticatedUserId);
        if (!success) {
          throw new Error("Food not found or not authorized to delete.");
        }
        return { message: "Food and all its references deleted permanently.", status: "force_deleted" };
      } else {
        log("info", `deleteFood: Food ${foodId} has references only by current user. Hiding as quick food.`);
        await foodRepository.updateFood(foodId, foodOwnerId, { is_quick_food: true });
        return { message: "Food hidden (marked as quick food). Existing references remain.", status: "hidden" };
      }
    }

    // Scenario 3: References by other users
    if (otherUserReferences > 0) {
      log("info", `deleteFood: Food ${foodId} has references by other users. Hiding as quick food.`);
      await foodRepository.updateFood(foodId, foodOwnerId, { is_quick_food: true });
      return { message: "Food hidden (marked as quick food). Existing references remain.", status: "hidden" };
    }

    // Fallback for any unhandled cases (should not be reached)
    log("warn", `deleteFood: Unhandled deletion scenario for food ${foodId}. Hiding as quick food.`);
    await foodRepository.updateFood(foodId, foodOwnerId, { is_quick_food: true });
    return { message: "Food hidden (marked as quick food). Existing references remain.", status: "hidden" };

  } catch (error) {
    log(
      "error",
      `Error deleting food ${foodId} by user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}

async function getFoodsWithPagination(
  authenticatedUserId,
  searchTerm,
  foodFilter,
  currentPage,
  itemsPerPage,
  sortBy
) {
  try {
    const limit = parseInt(itemsPerPage, 10) || 10;
    const offset = ((parseInt(currentPage, 10) || 1) - 1) * limit;

    const [foods, totalCount] = await Promise.all([
      foodRepository.getFoodsWithPagination(
        searchTerm,
        foodFilter,
        authenticatedUserId,
        limit,
        offset,
        sortBy
      ),
      foodRepository.countFoods(searchTerm, foodFilter, authenticatedUserId),
    ]);
    return { foods, totalCount };
  } catch (error) {
    log(
      "error",
      `Error fetching foods with pagination for user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}

async function createFoodVariant(authenticatedUserId, variantData) {
  try {
    const foodOwnerId = await foodRepository.getFoodOwnerId(
      variantData.food_id, authenticatedUserId
    );
    if (!foodOwnerId) {
      throw new Error("Food not found.");
    }
    if (foodOwnerId !== authenticatedUserId) {
      throw new Error(
        "Forbidden: You do not have permission to create a variant for this food."
      );
    }
    variantData.user_id = authenticatedUserId; // Ensure user_id is set from authenticated user
    const newVariant = await foodRepository.createFoodVariant(
      {
        ...variantData,
        glycemic_index: variantData.glycemic_index || null,
      },
      authenticatedUserId
    );
    return newVariant;
  } catch (error) {
    log(
      "error",
      `Error creating food variant for food ${variantData.food_id} by user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}

async function getFoodVariantById(authenticatedUserId, variantId) {
  try {
    const variant = await foodRepository.getFoodVariantById(
      variantId,
      authenticatedUserId
    );
    if (!variant) {
      throw new Error("Food variant not found.");
    }
    const foodOwnerId = await foodRepository.getFoodOwnerId(variant.food_id, authenticatedUserId);
    if (!foodOwnerId) {
      throw new Error("Associated food not found.");
    }
    return variant;
  } catch (error) {
    log(
      "error",
      `Error fetching food variant ${variantId} by user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}

async function updateFoodVariant(authenticatedUserId, variantId, variantData) {
  try {
    const variant = await foodRepository.getFoodVariantById(
      variantId,
      authenticatedUserId
    );
    if (!variant) {
      throw new Error("Food variant not found.");
    }
    const foodOwnerId = await foodRepository.getFoodOwnerId(variant.food_id, authenticatedUserId);
    if (!foodOwnerId) {
      throw new Error("Associated food not found.");
    }
    if (foodOwnerId !== authenticatedUserId) {
      throw new Error(
        "Forbidden: You do not have permission to update this food variant."
      );
    }
    variantData.user_id = authenticatedUserId; // Ensure user_id is set from authenticated user
    const updatedVariant = await foodRepository.updateFoodVariant(
      variantId,
      {
        ...variantData,
        glycemic_index: variantData.glycemic_index || null,
      },
      authenticatedUserId
    );
    if (!updatedVariant) {
      throw new Error("Food variant not found.");
    }
    return updatedVariant;
  } catch (error) {
    log(
      "error",
      `Error updating food variant ${variantId} by user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}

async function deleteFoodVariant(authenticatedUserId, variantId) {
  try {
    const variant = await foodRepository.getFoodVariantById(
      variantId,
      authenticatedUserId
    );
    if (!variant) {
      throw new Error("Food variant not found.");
    }
    const foodOwnerId = await foodRepository.getFoodOwnerId(variant.food_id, authenticatedUserId);
    if (!foodOwnerId) {
      throw new Error("Associated food not found.");
    }
    const success = await foodRepository.deleteFoodVariant(
      variantId,
      authenticatedUserId
    );
    if (!success) {
      throw new Error("Food variant not found.");
    }
    return true;
  } catch (error) {
    log(
      "error",
      `Error deleting food variant ${variantId} by user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}

async function getFoodVariantsByFoodId(authenticatedUserId, foodId) {
  log(
    "info",
    `getFoodVariantsByFoodId: Fetching variants for foodId: ${foodId}, authenticatedUserId: ${authenticatedUserId}`
  );
  try {
    const foodOwnerId = await foodRepository.getFoodOwnerId(foodId, authenticatedUserId);
    log(
      "info",
      `getFoodVariantsByFoodId: foodOwnerId for ${foodId}: ${foodOwnerId}`
    );
    // If food is not found (foodOwnerId is null), return an empty array of variants.
    // The client-side expects an empty array if no variants exist for a food.
    if (!foodOwnerId) {
      log(
        "warn",
        `getFoodVariantsByFoodId: Food with ID ${foodId} not found or not owned by user. Returning empty array.`
      );
      return [];
    }

    // Authorization check: Ensure the authenticated user owns the food,
    // or if the food is public, allow access.

    const variants = await foodRepository.getFoodVariantsByFoodId(
      foodId,
      authenticatedUserId
    );
    log(
      "info",
      `getFoodVariantsByFoodId: Found ${variants.length} variants for foodId: ${foodId}`
    );
    return variants;
  } catch (error) {
    log(
      "error",
      `Error fetching food variants for food ${foodId} by user ${authenticatedUserId} in foodService:`,
      error
    );
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
      log(
        "info",
        `Found existing food: ${existingFood.name} (ID: ${existingFood.id})`
      );
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
      glycemic_index: foodSuggestion.glycemic_index || null,
    };

    const newFood = await foodRepository.createFood(foodToCreate);

    const defaultVariantData = {
      food_id: newFood.id,
      serving_size: foodSuggestion.serving_size || 0,
      serving_unit: foodSuggestion.serving_unit || "g",
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
      glycemic_index: foodSuggestion.glycemic_index || null,
    };
    const newVariant = await foodRepository.createFoodVariant(
      defaultVariantData,
      authenticatedUserId
    );

    // Update the food with the default_variant_id
    await foodRepository.updateFood(newFood.id, newFood.user_id, {
      default_variant_id: newVariant.id,
    });

    log(
      "info",
      `Created new food: ${newFood.name} (ID: ${newFood.id}) with default variant (ID: ${newVariant.id})`
    );
    return { ...newFood, ...newVariant };
  } catch (error) {
    log(
      "error",
      `Error in createOrGetFood for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

async function bulkCreateFoodVariants(authenticatedUserId, variantsData) {
  try {
    const variantsToCreate = await Promise.all(
      variantsData.map(async (variant) => {
        const foodOwnerId = await foodRepository.getFoodOwnerId(
          variant.food_id, authenticatedUserId
        );
        if (!foodOwnerId || foodOwnerId !== authenticatedUserId) {
          throw new Error(
            `Forbidden: You do not have permission to create a variant for food ID ${variant.food_id}.`
          );
        }
        return { ...variant, user_id: authenticatedUserId, glycemic_index: variant.glycemic_index || null };
      })
    );
    const createdVariants = await foodRepository.bulkCreateFoodVariants(
      variantsToCreate,
      authenticatedUserId
    );
    return createdVariants;
  } catch (error) {
    log(
      "error",
      `Error in bulkCreateFoodVariants for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

async function getFoodDeletionImpact(authenticatedUserId, foodId) {
  log("info", `getFoodDeletionImpact: Checking deletion impact for food ${foodId} by user ${authenticatedUserId}`);
  try {
    const foodOwnerId = await foodRepository.getFoodOwnerId(foodId, authenticatedUserId);
    if (!foodOwnerId) {
      log("warn", `getFoodDeletionImpact: Food ${foodId} not found for user ${authenticatedUserId}.`);
      throw new Error("Food not found.");
    }
    // No need to check permission here, as foodRepository.getFoodDeletionImpact handles it
    return await foodRepository.getFoodDeletionImpact(foodId, authenticatedUserId);
  } catch (error) {
    log(
      "error",
      `Error getting food deletion impact for food ${foodId} by user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}

async function importFoodsInBulk(authenticatedUserId, foodDataArray) {
  try {
    if (!foodDataArray) {
      log("error", `importFoodsInBulk: No food data provided.`);
      throw new Error("No food data provided.");
    }
    return await foodRepository.createFoodsInBulk(
      authenticatedUserId,
      foodDataArray.map(food => ({
        ...food,
        glycemic_index: food.glycemic_index || null,
      }))
    );
  } catch (error) {
    log(
      "error",
      `Error importing foods in bulk for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

async function getFoodsNeedingReview(authenticatedUserId) {
  try {
    const foodsNeedingReview = await foodRepository.getFoodsNeedingReview(authenticatedUserId);
    return foodsNeedingReview;
  } catch (error) {
    log("error", `Error getting foods needing review for user ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function updateFoodEntriesSnapshot(authenticatedUserId, foodId, variantId) {
  try {
    // Fetch the latest food and variant details
    const food = await foodRepository.getFoodById(foodId, authenticatedUserId);
    if (!food) {
      throw new Error("Food not found.");
    }
    const variant = await foodRepository.getFoodVariantById(
      variantId,
      authenticatedUserId
    );
    if (!variant) {
      throw new Error("Food variant not found.");
    }

    // Construct the new snapshot data
    const newSnapshotData = {
      food_name: food.name,
      brand_name: food.brand,
      serving_size: variant.serving_size,
      serving_unit: variant.serving_unit,
      calories: variant.calories,
      protein: variant.protein,
      carbs: variant.carbs,
      fat: variant.fat,
      saturated_fat: variant.saturated_fat,
      polyunsaturated_fat: variant.polyunsaturated_fat,
      monounsaturated_fat: variant.monounsaturated_fat,
      trans_fat: variant.trans_fat,
      cholesterol: variant.cholesterol,
      sodium: variant.sodium,
      potassium: variant.potassium,
      dietary_fiber: variant.dietary_fiber,
      sugars: variant.sugars,
      vitamin_a: variant.vitamin_a,
      vitamin_c: variant.vitamin_c,
      calcium: variant.calcium,
      iron: variant.iron,
      glycemic_index: variant.glycemic_index,
    };

    // Update all relevant food entries for the authenticated user
    await foodRepository.updateFoodEntriesSnapshot(authenticatedUserId, foodId, variantId, newSnapshotData);

    // Clear any ignored updates for this variant for this user
    await foodRepository.clearUserIgnoredUpdate(authenticatedUserId, variantId);

    return { message: "Food entries updated successfully." };
  } catch (error) {
    log("error", `Error updating food entries snapshot for user ${authenticatedUserId}, food ${foodId}, variant ${variantId}:`, error);
    throw error;
  }
}
 
module.exports = {
  searchFoods,
  createFood,
  getFoodById,
  updateFood,
  deleteFood,
  getFoodsWithPagination,
  getFoodVariantById,
  createFoodVariant,
  updateFoodVariant,
  deleteFoodVariant,
  getFoodVariantsByFoodId,
  createOrGetFood,
  bulkCreateFoodVariants,
  getFoodDeletionImpact,
  importFoodsInBulk,
  getFoodsNeedingReview,
  updateFoodEntriesSnapshot,
};