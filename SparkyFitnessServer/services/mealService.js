const mealRepository = require('../models/mealRepository');
const foodRepository = require('../models/foodRepository');
const foodEntryRepository = require('../models/foodEntry');
const mealPlanTemplateRepository = require('../models/mealPlanTemplateRepository');
const mealPlanTemplateService = require('./mealPlanTemplateService'); // Import the service
const { log } = require('../config/logging');

// --- Meal Template Service Functions ---

async function createMeal(userId, mealData) {
  try {
    mealData.user_id = userId;
    // Add serving defaults if not provided
    mealData.serving_size = mealData.serving_size || 1.0;
    mealData.serving_unit = mealData.serving_unit || 'serving';
    const newMeal = await mealRepository.createMeal(mealData);
    log('info', `Meal ${newMeal.id} created with serving: ${newMeal.serving_size} ${newMeal.serving_unit}`);
    return newMeal;
  } catch (error) {
    log('error', `Error in mealService.createMeal for user ${userId}:`, error);
    throw error;
  }
}

async function getMeals(userId, filter = 'all', searchTerm = "") {
  try {
    let meals;
    if (searchTerm) {
      meals = await mealRepository.searchMeals(searchTerm, userId);
    } else {
      switch (filter) {
        case 'all':
          meals = await mealRepository.getMeals(userId, 'all'); // Get all meals (user's and public)
          break;
        case 'mine':
          meals = await mealRepository.getMeals(userId, 'mine'); // Get only user's meals
          break;
        case 'family':
          meals = await mealRepository.getFamilyMeals(userId);
          break;
        case 'public':
          meals = await mealRepository.getPublicMeals(userId);
          break;
        case 'needs-review':
          meals = await mealRepository.getMealsNeedingReview(userId);
          break;
        default:
          meals = await mealRepository.getMeals(userId, 'all');
          break;
      }
    }
    return meals;
  } catch (error) {
    log('error', `Error in mealService.getMeals for user ${userId} with filter ${filter} and searchTerm ${searchTerm}:`, error);
    throw error;
  }
}

async function getMealById(userId, mealId) {
  try {
    log('info', `Attempting to retrieve meal with ID: ${mealId} for user: ${userId}`);
    const meal = await mealRepository.getMealById(mealId, userId);
    if (!meal) {
      log('warn', `Meal with ID: ${mealId} not found in repository for user ${userId}.`);
      throw new Error('Meal not found.');
    }
    log('info', `Meal found: ${meal.name}, User ID: ${meal.user_id}, Is Public: ${meal.is_public}`);
    // Authorization check: User can access their own meals or public meals
    log('info', `Access granted for meal ${mealId} to user ${userId}.`);
    return meal;
  } catch (error) {
    log('error', `Error in mealService.getMealById for user ${userId}, meal ${mealId}:`, error);
    throw error;
  }
}

async function updateMeal(userId, mealId, updateData) {
  try {
    const meal = await mealRepository.getMealById(mealId, userId);
    if (!meal) {
      throw new Error('Meal not found.');
    }
    // Authorization check: User can only update their own meals
    const updatedMeal = await mealRepository.updateMeal(mealId, userId, updateData);

    let confirmationMessage = null;
    if (updateData.is_public) {
      const mealWithFoods = await mealRepository.getMealById(mealId, userId);
      const foodIds = mealWithFoods.foods.map(f => f.food_id);

      if (foodIds.length > 0) {
        log('info', `Updating ${foodIds.length} foods to be public as part of sharing meal ${mealId}`);
        const updatePromises = foodIds.map(foodId =>
          foodRepository.updateFood(foodId, userId, { shared_with_public: true })
        );
        await Promise.all(updatePromises);
        confirmationMessage = `Meal shared successfully. ${foodIds.length} associated foods have also been made public.`;
      }
    }

    // After updating the meal, re-sync any meal plan templates that use this meal
    const affectedTemplates = await mealPlanTemplateRepository.getMealPlanTemplatesByMealId(mealId);
    for (const template of affectedTemplates) {
      // Only re-sync active templates
      if (template.is_active) {
        log('info', `Re-syncing meal plan template ${template.id} due to meal update.`);
        // Pass null for currentClientDate as this is a backend-triggered sync
        await mealPlanTemplateService.updateMealPlanTemplate(template.id, template.user_id, template, null);
      }
    }

    return { ...updatedMeal, confirmationMessage };
  } catch (error) {
    log('error', `Error in mealService.updateMeal for user ${userId}, meal ${mealId}:`, error);
    throw error;
  }
}

async function deleteMeal(userId, mealId) {
  try {
    const meal = await mealRepository.getMealById(mealId, userId);
    if (!meal) {
      throw new Error('Meal not found.');
    }
    // Authorization check: User can only delete their own meals

    // Check if this meal is used in any meal plans or food entries by other users
    // Assuming a getMealDeletionImpact function exists in mealRepository
    const deletionImpact = await mealRepository.getMealDeletionImpact(mealId, userId);

    if (deletionImpact.usedByOtherUsers) {
      // Soft delete (hide) if used by other users
      await mealRepository.updateMeal(mealId, userId, { is_public: false });
      return { message: "Meal hidden successfully." };
    } else if (deletionImpact.usedByCurrentUser) {
      // Force delete if used only by the current user
      await mealRepository.deleteMealPlanEntriesByMealId(mealId, userId); // Assuming this function exists
      const success = await mealRepository.deleteMeal(mealId, userId);
      if (!success) {
        throw new Error('Failed to delete meal.');
      }
      return { message: "Meal and associated meal plan entries deleted permanently." };
    } else {
      // Hard delete if not used by anyone
      const success = await mealRepository.deleteMeal(mealId, userId);
      if (!success) {
        throw new Error('Failed to delete meal.');
      }
      return { message: "Meal deleted permanently." };
    }
  } catch (error) {
    log('error', `Error in mealService.deleteMeal for user ${userId}, meal ${mealId}:`, error);
    throw error;
  }
}

async function getMealDeletionImpact(userId, mealId) {
  try {
    const meal = await mealRepository.getMealById(mealId, userId);
    if (!meal) {
      throw new Error('Meal not found.');
    }
    // Authorization check: User can only get deletion impact for their own meals or public meals
    const deletionImpact = await mealRepository.getMealDeletionImpact(mealId, userId);
    return deletionImpact;
  } catch (error) {
    log('error', `Error in mealService.getMealDeletionImpact for user ${userId}, meal ${mealId}:`, error);
    throw error;
  }
}

// --- Meal Plan Service Functions ---

async function createMealPlanEntry(userId, planData) {
  try {
    planData.user_id = userId;
    const newMealPlanEntry = await mealRepository.createMealPlanEntry(planData);
    return newMealPlanEntry;
  } catch (error) {
    log('error', `Error in mealService.createMealPlanEntry for user ${userId}:`, error);
    throw error;
  }
}

async function getMealPlanEntries(userId, startDate, endDate) {
  try {
    const mealPlanEntries = await mealRepository.getMealPlanEntries(userId, startDate, endDate);
    return mealPlanEntries;
  } catch (error) {
    log('error', `Error in mealService.getMealPlanEntries for user ${userId} from ${startDate} to ${endDate}:`, error);
    throw error;
  }
}

async function updateMealPlanEntry(userId, planId, updateData) {
  try {
    // First, verify ownership by fetching the entry by its ID for the specific user
    const mealPlanEntry = await mealRepository.getMealPlanEntryById(planId, userId);
    if (!mealPlanEntry) {
      throw new Error('Meal plan entry not found or not authorized.');
    }
    // If ownership is confirmed, proceed with the update
    const updatedMealPlanEntry = await mealRepository.updateMealPlanEntry(planId, userId, updateData);
    return updatedMealPlanEntry;
  } catch (error) {
    log('error', `Error in mealService.updateMealPlanEntry for user ${userId}, plan ${planId}:`, error);
    throw error;
  }
}

async function deleteMealPlanEntry(userId, planId) {
  try {
    // First, verify ownership by fetching the entry by its ID for the specific user
    const mealPlanEntry = await mealRepository.getMealPlanEntryById(planId, userId);
    if (!mealPlanEntry) {
      throw new Error('Meal plan entry not found or not authorized.');
    }
    // If ownership is confirmed, proceed with the deletion
    const success = await mealRepository.deleteMealPlanEntry(planId, userId);
    if (!success) {
      throw new Error('Failed to delete meal plan entry.');
    }
    return true;
  } catch (error) {
    log('error', `Error in mealService.deleteMealPlanEntry for user ${userId}, plan ${planId}:`, error);
    throw error;
  }
}

// --- Logging Meal Plan to Food Entries ---

async function logMealPlanEntryToDiary(userId, mealPlanId, targetDate) {
  try {
    const mealPlanEntry = await mealRepository.getMealPlanEntryById(mealPlanId, userId);
    if (!mealPlanEntry) {
      throw new Error('Meal plan entry not found or not authorized.');
    }

    const entriesToCreate = [];

    if (mealPlanEntry.meal_id) {
      // If it's a meal template, expand its foods
      const meal = await mealRepository.getMealById(mealPlanEntry.meal_id, userId);
      if (!meal) {
        throw new Error('Associated meal template not found.');
      }
      for (const foodItem of meal.foods) {
        entriesToCreate.push({
          user_id: userId,
          food_id: foodItem.food_id,
          meal_type: mealPlanEntry.meal_type,
          quantity: foodItem.quantity,
          unit: foodItem.unit,
          entry_date: targetDate || mealPlanEntry.plan_date,
          variant_id: foodItem.variant_id,
          meal_plan_id: mealPlanId,
        });
      }
    } else if (mealPlanEntry.food_id) {
      // If it's a direct food entry
      entriesToCreate.push({
        user_id: userId,
        food_id: mealPlanEntry.food_id,
        meal_type: mealPlanEntry.meal_type,
        quantity: mealPlanEntry.quantity,
        unit: mealPlanEntry.unit,
        entry_date: targetDate || mealPlanEntry.plan_date,
        variant_id: mealPlanEntry.variant_id,
        meal_plan_id: mealPlanId,
      });
    } else {
      throw new Error('Meal plan entry is neither a meal nor a food.');
    }

    const createdFoodEntries = [];
    for (const entryData of entriesToCreate) {
      const newFoodEntry = await foodRepository.createFoodEntry(entryData);
      createdFoodEntries.push(newFoodEntry);
    }
    return createdFoodEntries;
  } catch (error) {
    log('error', `Error in mealService.logMealPlanEntryToDiary for user ${userId}, plan ${mealPlanId}:`, error);
    throw error;
  }
}

async function logDayMealPlanToDiary(userId, planDate, targetDate) {
  try {
    const mealPlanEntries = await mealRepository.getMealPlanEntries(userId, planDate, planDate);
    const createdFoodEntries = [];

    for (const entry of mealPlanEntries) {
      const newEntries = await logMealPlanEntryToDiary(userId, entry.id, targetDate);
      createdFoodEntries.push(...newEntries);
    }
    return createdFoodEntries;
  } catch (error) {
    log('error', `Error in mealService.logDayMealPlanToDiary for user ${userId}, date ${planDate}:`, error);
    throw error;
  }
}

async function searchMeals(userId, searchTerm, limit = null) {
  try {
    const meals = await mealRepository.searchMeals(searchTerm, userId, limit);
    return meals;
  } catch (error) {
    log('error', `Error in mealService.searchMeals for user ${userId} with term "${searchTerm}":`, error);
    throw error;
  }
}

async function getMealsNeedingReview(authenticatedUserId) {
  try {
    const mealsNeedingReview = await mealRepository.getMealsNeedingReview(authenticatedUserId);
    return mealsNeedingReview;
  } catch (error) {
    log("error", `Error getting meals needing review for user ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function updateMealEntriesSnapshot(authenticatedUserId, mealId) {
  try {
    // Fetch the latest meal details
    const meal = await mealRepository.getMealById(mealId, authenticatedUserId);
    if (!meal) {
      throw new Error("Meal not found.");
    }

    // Construct the new snapshot data
    const newSnapshotData = {
      // Assuming meal entries snapshot the meal name
      meal_name: meal.name,
    };

    // Update all relevant meal entries for the authenticated user
    await mealRepository.updateMealEntriesSnapshot(authenticatedUserId, mealId, newSnapshotData);

    // Clear any ignored updates for this meal for this user
    await mealRepository.clearUserIgnoredUpdate(authenticatedUserId, mealId);

    return { message: "Meal entries updated successfully." };
  } catch (error) {
    log("error", `Error updating meal entries snapshot for user ${authenticatedUserId}, meal ${mealId}:`, error);
    throw error;
  }
}

async function createMealFromDiaryEntries(userId, date, mealType, mealName, description = null, isPublic = false) {
  try {
    // 1. Retrieve food entries for the specified date and meal type
    const foodEntries = await foodEntryRepository.getFoodEntriesByDateAndMealType(userId, date, mealType);

    if (foodEntries.length === 0) {
      throw new Error(`No food entries found for ${mealType} on ${date}.`);
    }

    const mealFoods = [];
    const missingFoods = [];

    // 2. Validate existence of food_id and variant_id for each retrieved food entry
    for (const entry of foodEntries) {
      const food = await foodRepository.getFoodById(entry.food_id, userId);
      if (!food) {
        missingFoods.push(`${entry.food_name} (ID: ${entry.food_id})`);
        continue; // Skip this entry and continue to the next
      }

      // Ensure the variant exists. Food entries store variant_id which links to food_variants
      // For simplicity, we'll re-fetch the food to ensure all variant details are current
      // (though foodEntry stores a snapshot, meal creation should use current data)
      const variantExists = food.default_variant && food.default_variant.id === entry.variant_id;
      if (!variantExists && entry.variant_id) { // Only check if a variant_id was explicitly recorded
        // Attempt to find the specific variant, if not the default
        const allFoodVariants = await foodRepository.getFoodVariants(entry.food_id, userId); // Assuming this function exists or is created
        if (!allFoodVariants.some(v => v.id === entry.variant_id)) {
          missingFoods.push(`${entry.food_name} (Variant ID: ${entry.variant_id})`);
          continue;
        }
      } else if (!food.default_variant && !entry.variant_id) {
        // If there's no default variant and no specific variant_id recorded, this is an issue.
        missingFoods.push(`${entry.food_name} (No variant found)`);
        continue;
      }

      // 3. Transform food entries into meal template format
      mealFoods.push({
        food_id: entry.food_id,
        variant_id: entry.variant_id || food.default_variant.id, // Use entry's variant_id or default
        quantity: entry.quantity,
        unit: entry.unit,
      });
    }

    if (missingFoods.length > 0) {
      throw new Error(`Cannot create meal. The following foods or their variants are missing: ${missingFoods.join(', ')}. Please ensure they exist.`);
    }

    const defaultMealName = `${mealType} on ${date}`;
    const mealData = {
      user_id: userId,
      name: mealName || defaultMealName,
      description: description,
      is_public: isPublic,
      foods: mealFoods,
    };

    // 4. Call mealRepository.createMeal to create the new meal
    const newMeal = await mealRepository.createMeal(mealData);
    return newMeal;
  } catch (error) {
    log('error', `Error in mealService.createMealFromDiaryEntries for user ${userId}:`, error);
    throw error;
  }
}

module.exports = {
  createMeal,
  getMeals,
  getMealById,
  updateMeal,
  deleteMeal,
  createMealPlanEntry,
  getMealPlanEntries,
  updateMealPlanEntry,
  deleteMealPlanEntry,
  logMealPlanEntryToDiary,
  logDayMealPlanToDiary,
  searchMeals,
  getMealsNeedingReview,
  updateMealEntriesSnapshot,
  getMealDeletionImpact,
  createMealFromDiaryEntries, // New function export
};