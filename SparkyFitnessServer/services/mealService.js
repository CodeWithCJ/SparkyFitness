const mealRepository = require('../models/mealRepository');
const foodRepository = require('../models/foodRepository');
const mealPlanTemplateRepository = require('../models/mealPlanTemplateRepository');
const mealPlanTemplateService = require('./mealPlanTemplateService'); // Import the service
const { log } = require('../config/logging');

// --- Meal Template Service Functions ---

async function createMeal(userId, mealData) {
  try {
    mealData.user_id = userId;
    const newMeal = await mealRepository.createMeal(mealData);
    return newMeal;
  } catch (error) {
    log('error', `Error in mealService.createMeal for user ${userId}:`, error);
    throw error;
  }
}

async function getMeals(userId, isPublic = false, isRecent = false, isTop = false, limit = null) {
  try {
    let meals;
    if (isRecent) {
      meals = await mealRepository.getRecentMeals(userId, limit);
    } else if (isTop) {
      meals = await mealRepository.getTopMeals(userId, limit);
    } else {
      meals = await mealRepository.getMeals(userId, isPublic);
    }
    return meals;
  } catch (error) {
    log('error', `Error in mealService.getMeals for user ${userId}:`, error);
    throw error;
  }
}

async function getMealById(userId, mealId) {
  try {
    log('info', `Attempting to retrieve meal with ID: ${mealId} for user: ${userId}`);
    const meal = await mealRepository.getMealById(mealId);
    if (!meal) {
      log('warn', `Meal with ID: ${mealId} not found in repository.`);
      throw new Error('Meal not found.');
    }
    log('info', `Meal found: ${meal.name}, User ID: ${meal.user_id}, Is Public: ${meal.is_public}`);
    // Authorization check: User can access their own meals or public meals
    if (meal.user_id !== userId && !meal.is_public) {
      log('warn', `Forbidden: User ${userId} attempted to access meal ${mealId} (owner: ${meal.user_id}, public: ${meal.is_public}).`);
      throw new Error('Forbidden: You do not have permission to access this meal.');
    }
    log('info', `Access granted for meal ${mealId} to user ${userId}.`);
    return meal;
  } catch (error) {
    log('error', `Error in mealService.getMealById for user ${userId}, meal ${mealId}:`, error);
    throw error;
  }
}

async function updateMeal(userId, mealId, updateData) {
  try {
    const meal = await mealRepository.getMealById(mealId);
    if (!meal) {
      throw new Error('Meal not found.');
    }
    // Authorization check: User can only update their own meals
    if (meal.user_id !== userId) {
      throw new Error('Forbidden: You do not have permission to update this meal.');
    }
    const updatedMeal = await mealRepository.updateMeal(mealId, userId, updateData);

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

    return updatedMeal;
  } catch (error) {
    log('error', `Error in mealService.updateMeal for user ${userId}, meal ${mealId}:`, error);
    throw error;
  }
}

async function deleteMeal(userId, mealId) {
  try {
    const meal = await mealRepository.getMealById(mealId);
    if (!meal) {
      throw new Error('Meal not found.');
    }
    // Authorization check: User can only delete their own meals
    if (meal.user_id !== userId) {
      throw new Error('Forbidden: You do not have permission to delete this meal.');
    }

    // Check if this meal is used in any meal plans or food entries by other users
    // Assuming a getMealDeletionImpact function exists in mealRepository
    const deletionImpact = await mealRepository.getMealDeletionImpact(mealId);
    const isUsedByOthers = deletionImpact.mealPlanTemplatesCount > 0 || deletionImpact.foodEntriesCount > 0;

    if (isUsedByOthers) {
      // If used by others, perform a soft delete (e.g., set is_public to false or add an is_archived flag)
      // For now, we'll set is_public to false as a proxy for soft delete if a dedicated flag doesn't exist.
      // A proper 'is_archived' column should be added to the meals table in a migration.
      await mealRepository.updateMeal(mealId, userId, { is_public: false });
      return { message: "Meal archived successfully (used by others)." };
    } else {
      // If not used by others, perform a hard delete
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
      const meal = await mealRepository.getMealById(mealPlanEntry.meal_id);
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
    const meal = await mealRepository.getMealById(mealId);
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
  getMealsNeedingReview, // New export
  updateMealEntriesSnapshot, // New export
};