import mealRepository from '../models/mealRepository.js';
import foodRepository from '../models/foodRepository.js';
import foodEntryRepository from '../models/foodEntry.js';
import mealPlanTemplateRepository from '../models/mealPlanTemplateRepository.js';
import mealPlanTemplateService from './mealPlanTemplateService.js';
import mealTypeRepository from '../models/mealType.js';
import { log } from '../config/logging.js';
// --- Meal Template Service Functions ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveMealTypeId(userId: any, mealTypeName: any) {
  if (!mealTypeName) return null;
  const types = await mealTypeRepository.getAllMealTypes(userId);
  const match = types.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t: any) => t.name.toLowerCase() === mealTypeName.toLowerCase()
  );
  return match ? match.id : null;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createMeal(userId: any, mealData: any) {
  try {
    mealData.user_id = userId;
    // Add serving defaults if not provided
    mealData.serving_size = mealData.serving_size || 1.0;
    mealData.serving_unit = mealData.serving_unit || 'serving';
    const newMeal = await mealRepository.createMeal(mealData);
    log(
      'info',
      `Meal ${newMeal.id} created with serving: ${newMeal.serving_size} ${newMeal.serving_unit}`
    );
    return newMeal;
  } catch (error) {
    log('error', `Error in mealService.createMeal for user ${userId}:`, error);
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMeals(userId: any, filter = 'all', searchTerm = '') {
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
    log(
      'error',
      `Error in mealService.getMeals for user ${userId} with filter ${filter} and searchTerm ${searchTerm}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getRecentMeals(userId: any, limit = 3) {
  try {
    return await mealRepository.getRecentMeals(userId, limit);
  } catch (error) {
    log(
      'error',
      `Error in mealService.getRecentMeals for user ${userId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealById(userId: any, mealId: any) {
  try {
    log(
      'info',
      `Attempting to retrieve meal with ID: ${mealId} for user: ${userId}`
    );
    const meal = await mealRepository.getMealById(mealId, userId);
    if (!meal) {
      log(
        'warn',
        `Meal with ID: ${mealId} not found in repository for user ${userId}.`
      );
      throw new Error('Meal not found.');
    }
    log(
      'info',
      `Meal found: ${meal.name}, User ID: ${meal.user_id}, Is Public: ${meal.is_public}`
    );
    // Authorization check: User can access their own meals or public meals
    log('info', `Access granted for meal ${mealId} to user ${userId}.`);
    return meal;
  } catch (error) {
    log(
      'error',
      `Error in mealService.getMealById for user ${userId}, meal ${mealId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateMeal(userId: any, mealId: any, updateData: any) {
  try {
    const meal = await mealRepository.getMealById(mealId, userId);
    if (!meal) {
      throw new Error('Meal not found.');
    }
    // Authorization check: User can only update their own meals
    const updatedMeal = await mealRepository.updateMeal(
      mealId,
      userId,
      updateData
    );
    let confirmationMessage = null;
    if (updateData.is_public) {
      const mealWithFoods = await mealRepository.getMealById(mealId, userId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const foodIds = mealWithFoods.foods.map((f: any) => f.food_id);
      if (foodIds.length > 0) {
        log(
          'info',
          `Updating ${foodIds.length} foods to be public as part of sharing meal ${mealId}`
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updatePromises = foodIds.map((foodId: any) =>
          foodRepository.updateFood(foodId, userId, {
            shared_with_public: true,
          })
        );
        await Promise.all(updatePromises);
        // Also update custom_nutrients for each food to be shared
        const customNutrientUpdatePromises = foodIds.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (foodId: any) =>
            foodRepository.updateFood(foodId, userId, { custom_nutrients: {} }) // Clear custom nutrients when sharing publicly
        );
        await Promise.all(customNutrientUpdatePromises);
        confirmationMessage = `Meal shared successfully. ${foodIds.length} associated foods have also been made public.`;
      }
    }
    // After updating the meal, re-sync any meal plan templates that use this meal
    const affectedTemplates =
      await mealPlanTemplateRepository.getMealPlanTemplatesByMealId(mealId);
    for (const template of affectedTemplates) {
      // Only re-sync active templates
      if (template.is_active) {
        log(
          'info',
          `Re-syncing meal plan template ${template.id} due to meal update.`
        );
        // Pass null for currentClientDate as this is a backend-triggered sync
        await mealPlanTemplateService.updateMealPlanTemplate(
          template.id,
          template.user_id,
          template,
          // @ts-expect-error TS(2554): Expected 3 arguments, but got 4.
          null
        );
      }
    }
    return { ...updatedMeal, confirmationMessage };
  } catch (error) {
    log(
      'error',
      `Error in mealService.updateMeal for user ${userId}, meal ${mealId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteMeal(userId: any, mealId: any) {
  try {
    const meal = await mealRepository.getMealById(mealId, userId);
    if (!meal) {
      throw new Error('Meal not found.');
    }
    // Authorization check: User can only delete their own meals
    // Check if this meal is used in any meal plans or food entries by other users
    // Assuming a getMealDeletionImpact function exists in mealRepository
    const deletionImpact = await mealRepository.getMealDeletionImpact(
      mealId,
      userId
    );
    if (deletionImpact.usedByOtherUsers) {
      // Soft delete (hide) if used by other users
      await mealRepository.updateMeal(mealId, userId, { is_public: false });
      return { message: 'Meal hidden successfully.' };
    } else if (deletionImpact.usedByCurrentUser) {
      // Force delete if used only by the current user
      await mealRepository.deleteMealPlanEntriesByMealId(mealId, userId); // Assuming this function exists
      const success = await mealRepository.deleteMeal(mealId, userId);
      if (!success) {
        throw new Error('Failed to delete meal.');
      }
      return {
        message: 'Meal and associated meal plan entries deleted permanently.',
      };
    } else {
      // Hard delete if not used by anyone
      const success = await mealRepository.deleteMeal(mealId, userId);
      if (!success) {
        throw new Error('Failed to delete meal.');
      }
      return { message: 'Meal deleted permanently.' };
    }
  } catch (error) {
    log(
      'error',
      `Error in mealService.deleteMeal for user ${userId}, meal ${mealId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealDeletionImpact(userId: any, mealId: any) {
  try {
    const meal = await mealRepository.getMealById(mealId, userId);
    if (!meal) {
      throw new Error('Meal not found.');
    }
    // Authorization check: User can only get deletion impact for their own meals or public meals
    const deletionImpact = await mealRepository.getMealDeletionImpact(
      mealId,
      userId
    );
    return deletionImpact;
  } catch (error) {
    log(
      'error',
      `Error in mealService.getMealDeletionImpact for user ${userId}, meal ${mealId}:`,
      error
    );
    throw error;
  }
}
// --- Meal Plan Service Functions ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createMealPlanEntry(userId: any, planData: any) {
  try {
    planData.user_id = userId;
    const newMealPlanEntry = await mealRepository.createMealPlanEntry(planData);
    return newMealPlanEntry;
  } catch (error) {
    log(
      'error',
      `Error in mealService.createMealPlanEntry for user ${userId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealPlanEntries(userId: any, startDate: any, endDate: any) {
  try {
    const mealPlanEntries = await mealRepository.getMealPlanEntries(
      userId,
      startDate,
      endDate
    );
    return mealPlanEntries;
  } catch (error) {
    log(
      'error',
      `Error in mealService.getMealPlanEntries for user ${userId} from ${startDate} to ${endDate}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateMealPlanEntry(userId: any, planId: any, updateData: any) {
  try {
    // First, verify ownership by fetching the entry by its ID for the specific user
    const mealPlanEntry = await mealRepository.getMealPlanEntryById(
      planId,
      userId
    );
    if (!mealPlanEntry) {
      throw new Error('Meal plan entry not found or not authorized.');
    }
    // If ownership is confirmed, proceed with the update
    const updatedMealPlanEntry = await mealRepository.updateMealPlanEntry(
      planId,
      userId,
      updateData
    );
    return updatedMealPlanEntry;
  } catch (error) {
    log(
      'error',
      `Error in mealService.updateMealPlanEntry for user ${userId}, plan ${planId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteMealPlanEntry(userId: any, planId: any) {
  try {
    // First, verify ownership by fetching the entry by its ID for the specific user
    const mealPlanEntry = await mealRepository.getMealPlanEntryById(
      planId,
      userId
    );
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
    log(
      'error',
      `Error in mealService.deleteMealPlanEntry for user ${userId}, plan ${planId}:`,
      error
    );
    throw error;
  }
}
// --- Logging Meal Plan to Food Entries ---

async function logMealPlanEntryToDiary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mealPlanId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetDate: any
) {
  try {
    const mealPlanEntry = await mealRepository.getMealPlanEntryById(
      mealPlanId,
      userId
    );
    if (!mealPlanEntry) {
      throw new Error('Meal plan entry not found or not authorized.');
    }
    let mealTypeId = mealPlanEntry.meal_type_id;
    if (!mealTypeId && mealPlanEntry.meal_type) {
      mealTypeId = await resolveMealTypeId(userId, mealPlanEntry.meal_type);
    }
    if (!mealTypeId) {
      throw new Error(
        `Invalid meal type configuration for plan entry ${mealPlanId}`
      );
    }
    const entriesToCreate = [];
    if (mealPlanEntry.meal_id) {
      // If it's a meal template, expand its foods
      const meal = await mealRepository.getMealById(
        mealPlanEntry.meal_id,
        userId
      );
      if (!meal) {
        throw new Error('Associated meal template not found.');
      }
      for (const foodItem of meal.foods) {
        entriesToCreate.push({
          user_id: userId,
          food_id: foodItem.food_id,
          meal_type_id: mealTypeId,
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
        meal_type_id: mealTypeId,
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
      // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
      const newFoodEntry = await foodRepository.createFoodEntry(entryData);
      createdFoodEntries.push(newFoodEntry);
    }
    return createdFoodEntries;
  } catch (error) {
    log(
      'error',
      `Error in mealService.logMealPlanEntryToDiary for user ${userId}, plan ${mealPlanId}:`,
      error
    );
    throw error;
  }
}

async function logDayMealPlanToDiary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  planDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetDate: any
) {
  try {
    const mealPlanEntries = await mealRepository.getMealPlanEntries(
      userId,
      planDate,
      planDate
    );
    const createdFoodEntries = [];
    for (const entry of mealPlanEntries) {
      const newEntries = await logMealPlanEntryToDiary(
        userId,
        entry.id,
        targetDate
      );
      createdFoodEntries.push(...newEntries);
    }
    return createdFoodEntries;
  } catch (error) {
    log(
      'error',
      `Error in mealService.logDayMealPlanToDiary for user ${userId}, date ${planDate}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function searchMeals(userId: any, searchTerm: any, limit = null) {
  try {
    const meals = await mealRepository.searchMeals(searchTerm, userId, limit);
    return meals;
  } catch (error) {
    log(
      'error',
      `Error in mealService.searchMeals for user ${userId} with term "${searchTerm}":`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealsNeedingReview(authenticatedUserId: any) {
  try {
    const mealsNeedingReview =
      await mealRepository.getMealsNeedingReview(authenticatedUserId);
    return mealsNeedingReview;
  } catch (error) {
    log(
      'error',
      `Error getting meals needing review for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

async function updateMealEntriesSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mealId: any
) {
  try {
    // Fetch the latest meal details
    const meal = await mealRepository.getMealById(mealId, authenticatedUserId);
    if (!meal) {
      throw new Error('Meal not found.');
    }
    // Construct the new snapshot data
    const newSnapshotData = {
      // Assuming meal entries snapshot the meal name
      meal_name: meal.name,
    };
    // Update all relevant meal entries for the authenticated user
    await mealRepository.updateMealEntriesSnapshot(
      authenticatedUserId,
      mealId,
      newSnapshotData
    );
    // Clear any ignored updates for this meal for this user
    await mealRepository.clearUserIgnoredUpdate(authenticatedUserId, mealId);
    return { message: 'Meal entries updated successfully.' };
  } catch (error) {
    log(
      'error',
      `Error updating meal entries snapshot for user ${authenticatedUserId}, meal ${mealId}:`,
      error
    );
    throw error;
  }
}
async function createMealFromDiaryEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  date: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mealType: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mealName: any,
  description = null,
  isPublic = false
) {
  try {
    // 1. Retrieve food entries for the specified date and meal type
    const foodEntries =
      await foodEntryRepository.getFoodEntriesByDateAndMealType(
        userId,
        date,
        mealType
      );
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
      const variantExists =
        food.default_variant && food.default_variant.id === entry.variant_id;
      if (!variantExists && entry.variant_id) {
        // Only check if a variant_id was explicitly recorded
        // Attempt to find the specific variant, if not the default
        // @ts-expect-error TS(2551): Property 'getFoodVariants' does not exist on type ... Remove this comment to see the full error message
        const allFoodVariants = await foodRepository.getFoodVariants(
          entry.food_id,
          userId
        ); // Assuming this function exists or is created
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!allFoodVariants.some((v: any) => v.id === entry.variant_id)) {
          missingFoods.push(
            `${entry.food_name} (Variant ID: ${entry.variant_id})`
          );
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
        custom_nutrients: entry.custom_nutrients || {},
      });
    }
    if (missingFoods.length > 0) {
      throw new Error(
        `Cannot create meal. The following foods or their variants are missing: ${missingFoods.join(', ')}. Please ensure they exist.`
      );
    }
    const defaultMealName = `${mealType} on ${date}`;
    const mealData = {
      user_id: userId,
      name: mealName || defaultMealName,
      description: description,
      is_public: isPublic,
      serving_size: 1.0,
      serving_unit: 'serving',
      foods: mealFoods,
    };
    // 4. Call mealRepository.createMeal to create the new meal
    const newMeal = await mealRepository.createMeal(mealData);
    return newMeal;
  } catch (error) {
    log(
      'error',
      `Error in mealService.createMealFromDiaryEntries for user ${userId}:`,
      error
    );
    throw error;
  }
}
export { createMeal };
export { getMeals };
export { getRecentMeals };
export { getMealById };
export { updateMeal };
export { deleteMeal };
export { createMealPlanEntry };
export { getMealPlanEntries };
export { updateMealPlanEntry };
export { deleteMealPlanEntry };
export { logMealPlanEntryToDiary };
export { logDayMealPlanToDiary };
export { searchMeals };
export { getMealsNeedingReview };
export { updateMealEntriesSnapshot };
export { getMealDeletionImpact };
export { createMealFromDiaryEntries };
export default {
  createMeal,
  getMeals,
  getRecentMeals,
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
  createMealFromDiaryEntries,
};
