import foodRepository from '../models/foodRepository.js';
import foodEntryMealRepository from '../models/foodEntryMealRepository.js';
import mealService from './mealService.js';
import { log } from '../config/logging.js';
import mealTypeRepository from '../models/mealType.js';
import goalRepository from '../models/goalRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import reportRepository from '../models/reportRepository.js';
import { sanitizeCustomNutrients } from '../utils/foodUtils.js';

// @ts-expect-error TS7016: Could not find a declaration file for module 'papaparse'.
import Papa from 'papaparse';
import express from 'express';
// Helper functions (already defined)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getGlycemicIndexValue(category: any) {
  switch (category) {
    case 'Very Low':
      return 10;
    case 'Low':
      return 30;
    case 'Medium':
      return 60;
    case 'High':
      return 80;
    case 'Very High':
      return 100;
    default:
      return null;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getGlycemicIndexCategory(value: any) {
  if (value === null) return 'None';
  if (value <= 20) return 'Very Low';
  if (value <= 50) return 'Low';
  if (value <= 70) return 'Medium';
  if (value <= 90) return 'High';
  return 'Very High';
}
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

async function createFoodEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryData: any
) {
  try {
    const entryWithUser = {
      ...entryData,
      user_id: entryData.user_id || authenticatedUserId,
      created_by_user_id: actingUserId,
    };
    if (entryData.custom_nutrients !== undefined) {
      entryWithUser.custom_nutrients = sanitizeCustomNutrients(
        entryData.custom_nutrients
      );
    }
    log(
      'info',
      `createFoodEntry in foodService: authenticatedUserId: ${authenticatedUserId}, actingUserId: ${actingUserId}, entryData: ${JSON.stringify(entryData)}`
    );
    const newEntry = await foodRepository.createFoodEntry(
      entryWithUser,
      actingUserId
    );
    return newEntry;
  } catch (error) {
    log(
      'error',
      `Error creating food entry for user ${authenticatedUserId} by ${actingUserId} in foodService:`,
      error
    );
    throw error;
  }
}
async function updateFoodEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryData: any
) {
  try {
    const entryOwnerId = await foodRepository.getFoodEntryOwnerId(
      entryId,
      authenticatedUserId
    );
    if (!entryOwnerId) {
      throw new Error('Food entry not found.');
    }
    if (entryOwnerId !== authenticatedUserId) {
      throw new Error(
        'Forbidden: You do not have permission to update this food entry.'
      );
    }
    // Fetch the existing entry to get food_id and current variant_id if not provided in entryData
    const existingEntry = await foodRepository.getFoodEntryById(
      entryId,
      authenticatedUserId
    );
    if (!existingEntry) {
      throw new Error('Food entry not found.');
    }
    const foodIdToUse = existingEntry.food_id;
    const variantIdToUse = entryData.variant_id || existingEntry.variant_id;
    let newSnapshotData;
    if (foodIdToUse) {
      // Variant changed — rebuild snapshot from the new food/variant
      const food = await foodRepository.getFoodById(
        foodIdToUse,
        authenticatedUserId
      );
      if (!food) {
        throw new Error('Food not found for snapshotting.');
      }
      const variant = await foodRepository.getFoodVariantById(
        variantIdToUse,
        authenticatedUserId
      );
      if (!variant) {
        throw new Error('Food variant not found for snapshotting.');
      }
      newSnapshotData = {
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
        custom_nutrients: sanitizeCustomNutrients(variant.custom_nutrients),
      };
    } else {
      // No variant change or no linked food — preserve existing entry's snapshot
      newSnapshotData = {
        food_name: existingEntry.food_name,
        brand_name: existingEntry.brand_name,
        serving_size: existingEntry.serving_size,
        serving_unit: existingEntry.serving_unit,
        calories: existingEntry.calories,
        protein: existingEntry.protein,
        carbs: existingEntry.carbs,
        fat: existingEntry.fat,
        saturated_fat: existingEntry.saturated_fat,
        polyunsaturated_fat: existingEntry.polyunsaturated_fat,
        monounsaturated_fat: existingEntry.monounsaturated_fat,
        trans_fat: existingEntry.trans_fat,
        cholesterol: existingEntry.cholesterol,
        sodium: existingEntry.sodium,
        potassium: existingEntry.potassium,
        dietary_fiber: existingEntry.dietary_fiber,
        sugars: existingEntry.sugars,
        vitamin_a: existingEntry.vitamin_a,
        vitamin_c: existingEntry.vitamin_c,
        calcium: existingEntry.calcium,
        iron: existingEntry.iron,
        glycemic_index: existingEntry.glycemic_index,
        custom_nutrients: sanitizeCustomNutrients(
          existingEntry.custom_nutrients
        ),
      };
    }
    // Apply inline nutrition overrides if provided by the client
    const nutritionOverrideFields = [
      'food_name',
      'brand_name',
      'serving_size',
      'serving_unit',
      'calories',
      'protein',
      'carbs',
      'fat',
      'saturated_fat',
      'polyunsaturated_fat',
      'monounsaturated_fat',
      'trans_fat',
      'cholesterol',
      'sodium',
      'potassium',
      'dietary_fiber',
      'sugars',
      'vitamin_a',
      'vitamin_c',
      'calcium',
      'iron',
      'glycemic_index',
    ];
    for (const field of nutritionOverrideFields) {
      if (entryData[field] !== undefined) {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        newSnapshotData[field] = entryData[field];
      }
    }
    if (entryData.custom_nutrients !== undefined) {
      newSnapshotData.custom_nutrients = sanitizeCustomNutrients(
        entryData.custom_nutrients
      );
    }
    const updatedEntry = await foodRepository.updateFoodEntry(
      entryId,
      authenticatedUserId,
      actingUserId,
      {
        ...entryData,
        meal_type_id: entryData.meal_type_id ?? existingEntry.meal_type_id,
        variant_id: variantIdToUse,
      }, // Ensure meal_type_id and correct variant_id are passed
      newSnapshotData // Pass the new snapshot data
    );
    if (!updatedEntry) {
      throw new Error('Food entry not found or not authorized to update.');
    }
    return updatedEntry;
  } catch (error) {
    log(
      'error',
      `Error updating food entry ${entryId} by user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteFoodEntry(authenticatedUserId: any, entryId: any) {
  try {
    const entryOwnerId = await foodRepository.getFoodEntryOwnerId(
      entryId,
      authenticatedUserId
    );
    if (!entryOwnerId) {
      throw new Error('Food entry not found.');
    }
    // Authorization check: Ensure the authenticated user owns the entry
    // or has family access to the owner's data.
    // For simplicity, assuming direct ownership for now.
    if (entryOwnerId !== authenticatedUserId) {
      // In a real app, you'd check family access here.
      throw new Error(
        'Forbidden: You do not have permission to delete this food entry.'
      );
    }
    const success = await foodRepository.deleteFoodEntry(
      entryId,
      authenticatedUserId
    );
    if (!success) {
      throw new Error('Food entry not found or not authorized to delete.');
    }
    return true;
  } catch (error) {
    log(
      'error',
      `Error deleting food entry ${entryId} by user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}
async function getFoodEntriesByDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedDate: any
) {
  try {
    if (!targetUserId) {
      log(
        'error',
        'getFoodEntriesByDate: targetUserId is undefined. Returning empty array.'
      );
      return [];
    }
    const entries = await foodRepository.getFoodEntriesByDate(
      targetUserId,
      selectedDate
    );
    return entries;
  } catch (error) {
    log(
      'error',
      `Error fetching food entries for user ${targetUserId} on ${selectedDate} by ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}
async function getFoodEntriesByDateRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  try {
    const entries = await foodRepository.getFoodEntriesByDateRange(
      targetUserId,
      startDate,
      endDate
    );
    return entries;
  } catch (error) {
    log(
      'error',
      `Error fetching food entries for user ${targetUserId} from ${startDate} to ${endDate} by ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}
async function copyFoodEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceMealType: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetMealType: any
) {
  try {
    log(
      'info',
      `copyFoodEntries: Copying from ${sourceDate} (${sourceMealType}) to ${targetDate} (${targetMealType}) for user ${authenticatedUserId}`
    );
    // 1. Fetch source entries
    const sourceEntries = await foodRepository.getFoodEntriesByDateAndMealType(
      authenticatedUserId,
      sourceDate,
      sourceMealType
    );
    if (sourceEntries.length === 0) {
      log(
        'debug',
        `No food entries found for ${sourceMealType} on ${sourceDate} for user ${authenticatedUserId}. No entries to copy.`
      );
      return [];
    }
    const targetMealTypeId = await resolveMealTypeId(
      authenticatedUserId,
      targetMealType
    );
    if (!targetMealTypeId) {
      throw new Error(`Invalid target meal type: ${targetMealType}`);
    }
    // Map to keep track of duplicated food_entry_meals
    // Key: old_food_entry_meal_id, Value: new_food_entry_meal_id
    const mealMapping = new Map();
    const entriesToCreate = [];
    for (const entry of sourceEntries) {
      log(
        'debug',
        `copyFoodEntries: Processing source entry: ${JSON.stringify(entry)}`
      );
      let newFoodEntryMealId = null;
      // If the entry belongs to a meal container, ensure the container is duplicated
      if (entry.food_entry_meal_id) {
        if (mealMapping.has(entry.food_entry_meal_id)) {
          newFoodEntryMealId = mealMapping.get(entry.food_entry_meal_id);
        } else {
          // Fetch the original meal details
          const originalMeal =
            await foodEntryMealRepository.getFoodEntryMealById(
              entry.food_entry_meal_id,
              authenticatedUserId
            );
          if (originalMeal) {
            // Create a new meal container for the target date/slot
            const newMeal = await foodEntryMealRepository.createFoodEntryMeal(
              {
                user_id: authenticatedUserId,
                meal_template_id: originalMeal.meal_template_id,
                meal_type_id: targetMealTypeId,
                entry_date: targetDate,
                name: originalMeal.name,
                description: originalMeal.description,
                quantity: originalMeal.quantity,
                unit: originalMeal.unit,
              },
              actingUserId
            );
            newFoodEntryMealId = newMeal.id;
            mealMapping.set(entry.food_entry_meal_id, newFoodEntryMealId);
            log(
              'debug',
              `copyFoodEntries: Duplicated meal container "${originalMeal.name}" (${entry.food_entry_meal_id} -> ${newFoodEntryMealId})`
            );
          }
        }
      }
      // Check for existing entry to prevent duplicates in the same meal/slot
      const existingEntry = await foodRepository.getFoodEntryByDetails(
        authenticatedUserId,
        entry.food_id,
        targetMealType,
        targetDate,
        entry.variant_id,
        newFoodEntryMealId // Use the new meal container ID for the duplicate check
      );
      if (!existingEntry) {
        entriesToCreate.push({
          user_id: authenticatedUserId,
          created_by_user_id: actingUserId,
          food_id: entry.food_id,
          meal_type_id: targetMealTypeId,
          food_entry_meal_id: newFoodEntryMealId, // Link the food to the new container
          quantity: entry.quantity,
          unit: entry.unit,
          entry_date: targetDate,
          variant_id: entry.variant_id,
          meal_plan_template_id: null,
          food_name: entry.food_name,
          brand_name: entry.brand_name,
          serving_size: entry.serving_size,
          serving_unit: entry.serving_unit,
          calories: entry.calories,
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
          saturated_fat: entry.saturated_fat,
          polyunsaturated_fat: entry.polyunsaturated_fat,
          monounsaturated_fat: entry.monounsaturated_fat,
          trans_fat: entry.trans_fat,
          cholesterol: entry.cholesterol,
          sodium: entry.sodium,
          potassium: entry.potassium,
          dietary_fiber: entry.dietary_fiber,
          sugars: entry.sugars,
          vitamin_a: entry.vitamin_a,
          vitamin_c: entry.vitamin_c,
          calcium: entry.calcium,
          iron: entry.iron,
          glycemic_index: entry.glycemic_index,
          custom_nutrients: sanitizeCustomNutrients(entry.custom_nutrients),
        });
        log(
          'debug',
          `copyFoodEntries: Adding entry for food_id: ${entry.food_id} into meal_id: ${newFoodEntryMealId}`
        );
      } else {
        log(
          'debug',
          `Skipping duplicate food entry for food_id ${entry.food_id} in ${targetMealType} on ${targetDate}.`
        );
      }
    }
    if (entriesToCreate.length === 0) {
      log(
        'debug',
        'All food entries already exist in target slot. No new entries created.'
      );
      return [];
    }
    const newEntries = await foodRepository.bulkCreateFoodEntries(
      entriesToCreate,
      authenticatedUserId
    );
    return newEntries;
  } catch (error) {
    log(
      'error',
      `Error copying food entries for user ${authenticatedUserId} from ${sourceDate} ${sourceMealType} to ${targetDate} ${targetMealType}:`,
      error
    );
    throw error;
  }
}
async function copyFoodEntriesFromYesterday(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mealType: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetDate: any
) {
  try {
    const [yearStr, monthStr, dayStr] = targetDate.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      throw new Error('Invalid date format provided for targetDate.');
    }
    const priorDay = new Date(Date.UTC(year, month - 1, day));
    priorDay.setUTCDate(priorDay.getUTCDate() - 1);
    const sourceDate = priorDay.toISOString().split('T')[0];
    log(
      'info',
      `copyFoodEntriesFromYesterday: Calculating sourceDate ${sourceDate} from targetDate ${targetDate}`
    );
    // Delegate to consolidated copyFoodEntries function
    return await copyFoodEntries(
      authenticatedUserId,
      actingUserId,
      sourceDate,
      mealType,
      targetDate,
      mealType
    );
  } catch (error) {
    log(
      'error',
      `Error copying food entries from prior day for user ${authenticatedUserId} to ${targetDate} ${mealType}:`,
      error
    );
    throw error;
  }
}
async function copyAllFoodEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sourceDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetDate: any
) {
  try {
    log(
      'info',
      `copyAllFoodEntries: Copying entire day from ${sourceDate} to ${targetDate} for user ${authenticatedUserId}`
    );
    // 1. Fetch all entries from the source day to find used meal slots
    const allSourceEntries = await foodRepository.getFoodEntriesByDate(
      authenticatedUserId,
      sourceDate
    );
    if (allSourceEntries.length === 0) {
      log(
        'debug',
        `No food entries found on ${sourceDate} for user ${authenticatedUserId}. Nothing to copy.`
      );
      return [];
    }
    // 2. Identify unique meal types (slots) that have data
    const usedMealTypes = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...new Set(allSourceEntries.map((e: any) => e.meal_type)),
    ];
    log(
      'debug',
      `copyAllFoodEntries: Found ${usedMealTypes.length} slots with data: ${usedMealTypes.join(', ')}`
    );
    const allCopiedEntries = [];
    // 3. Loop through each slot and perform a Deep Copy
    for (const mealType of usedMealTypes) {
      const copiedEntries = await copyFoodEntries(
        authenticatedUserId,
        actingUserId,
        sourceDate,
        mealType,
        targetDate,
        mealType
      );
      allCopiedEntries.push(...copiedEntries);
    }
    log(
      'info',
      `Successfully copied entire day (${allCopiedEntries.length} entries) from ${sourceDate} to ${targetDate} for user ${authenticatedUserId}.`
    );
    return allCopiedEntries;
  } catch (error) {
    log(
      'error',
      `Error copying all food entries for user ${authenticatedUserId} from ${sourceDate} to ${targetDate}:`,
      error
    );
    throw error;
  }
}
async function copyAllFoodEntriesFromYesterday(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetDate: any
) {
  try {
    const [yearStr, monthStr, dayStr] = targetDate.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      throw new Error('Invalid date format provided for targetDate.');
    }
    const priorDay = new Date(Date.UTC(year, month - 1, day));
    priorDay.setUTCDate(priorDay.getUTCDate() - 1);
    const sourceDate = priorDay.toISOString().split('T')[0];
    return await copyAllFoodEntries(
      authenticatedUserId,
      actingUserId,
      sourceDate,
      targetDate
    );
  } catch (error) {
    log(
      'error',
      `Error copying all food entries from prior day for user ${authenticatedUserId} to ${targetDate}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDailyNutritionSummary(userId: any, date: any) {
  try {
    const summary = await foodRepository.getDailyNutritionSummary(userId, date);
    if (!summary) {
      // Return a zero-initialized summary if no entries are found for the date
      return {
        total_calories: 0,
        total_protein: 0,
        total_carbs: 0,
        total_fat: 0,
        total_dietary_fiber: 0,
      };
    }
    return summary;
  } catch (error) {
    log(
      'error',
      `Error fetching daily nutrition summary for user ${userId} on ${date} in foodService:`,
      error
    );
    throw error;
  }
}
// New functions for food_entry_meals logic
async function createFoodEntryMeal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mealData: any
) {
  log(
    'info',
    `createFoodEntryMeal in foodEntryService: authenticatedUserId: ${authenticatedUserId}, actingUserId: ${actingUserId}, mealData: ${JSON.stringify(mealData)}`
  );
  try {
    // 1. Create the parent food_entry_meals record with quantity and unit
    const newFoodEntryMeal = await foodEntryMealRepository.createFoodEntryMeal(
      {
        user_id: mealData.user_id || authenticatedUserId, // Use target user ID
        meal_template_id: mealData.meal_template_id || null,
        meal_type_id: mealData.meal_type_id || null,
        meal_type: mealData.meal_type,
        entry_date: mealData.entry_date,
        name: mealData.name,
        description: mealData.description,
        quantity: mealData.quantity || 1.0, // Default to 1.0
        unit: mealData.unit || 'serving', // Default to 'serving'
      },
      actingUserId
    );
    const resolvedMealTypeId = newFoodEntryMeal.meal_type_id;
    let foodsToProcess = mealData.foods || [];
    let mealServingSize = 1.0; // Default serving size
    // If a meal_template id is provided fetch the template for serving size
    if (mealData.meal_template_id) {
      log(
        'info',
        `Fetching meal template ${mealData.meal_template_id} for serving size and foods.`
      );
      const mealTemplate = await mealService.getMealById(
        authenticatedUserId,
        mealData.meal_template_id
      );
      if (mealTemplate) {
        mealServingSize = mealTemplate.serving_size || 1.0; // Always get the meal serving size
        log(
          'info',
          `Meal template serving size: ${mealServingSize} ${mealTemplate.serving_unit || 'serving'}`
        );
        // If no specific foods provided use template
        if (!mealData.foods || mealData.foods.length === 0) {
          if (mealTemplate.foods) {
            foodsToProcess = mealTemplate.foods;
          } else {
            log(
              'warn',
              `Meal template ${mealData.meal_template_id} has no foods.`
            );
          }
        }
      } else {
        log(
          'warn',
          `Meal template ${mealData.meal_template_id} not found when creating food entry meal.`
        );
        // Continue without template data
      }
    }
    // Calculate portion multiplier: consumed_quantity / meal_serving_size
    const consumedQuantity = mealData.quantity || 1.0;
    let multiplier = 1.0;
    //Scale if there is a template ID
    if (mealData.meal_template_id) {
      if (mealData.unit === 'serving') {
        multiplier = consumedQuantity;
      } else {
        multiplier = consumedQuantity / mealServingSize;
      }
    }
    log(
      'info',
      `Portion multiplier: ${multiplier} (consumed: ${consumedQuantity}, serving_size: ${mealServingSize}, has_template: ${!!mealData.meal_template_id})`
    );
    // 2. Create component food_entries records with scaled quantities
    const entriesToCreate = [];
    for (const foodItem of foodsToProcess) {
      const food = await foodRepository.getFoodById(
        foodItem.food_id,
        authenticatedUserId
      );
      if (!food) {
        log(
          'warn',
          `Food with ID ${foodItem.food_id} not found when creating food entry meal. Skipping.`
        );
        continue;
      }
      const variant = await foodRepository.getFoodVariantById(
        foodItem.variant_id,
        authenticatedUserId
      );
      if (!variant) {
        log(
          'warn',
          `Food variant with ID ${foodItem.variant_id} not found for food ${foodItem.food_id} when creating food entry meal. Skipping.`
        );
        continue;
      }
      const snapshot = {
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
        custom_nutrients: sanitizeCustomNutrients(variant.custom_nutrients),
      };
      // Scale the food quantity by the multiplier
      const scaledQuantity = foodItem.quantity * multiplier;
      entriesToCreate.push({
        user_id: newFoodEntryMeal.user_id, // Use the user_id from the created meal (target user)
        created_by_user_id: actingUserId,
        food_id: foodItem.food_id,
        meal_type_id: resolvedMealTypeId,
        quantity: scaledQuantity, // SCALED quantity
        unit: foodItem.unit,
        variant_id: foodItem.variant_id,
        entry_date: mealData.entry_date,
        food_entry_meal_id: newFoodEntryMeal.id, // Link to the new food_entry_meals ID
        ...snapshot,
      });
    }
    if (entriesToCreate.length > 0) {
      await foodRepository.bulkCreateFoodEntries(
        entriesToCreate,
        authenticatedUserId
      );
      log(
        'info',
        `Created ${entriesToCreate.length} component food entries for food_entry_meal ${newFoodEntryMeal.id}.`
      );
    }
    return newFoodEntryMeal;
  } catch (error) {
    log(
      'error',
      `Error creating food entry meal for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function updateFoodEntryMeal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foodEntryMealId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updatedMealData: any
) {
  log(
    'info',
    `updateFoodEntryMeal in foodEntryService: foodEntryMealId: ${foodEntryMealId}, updatedMealData: ${JSON.stringify(updatedMealData)}, authenticatedUserId: ${authenticatedUserId}, actingUserId: ${actingUserId}`
  );
  try {
    // 1. Update the parent food_entry_meals record's metadata
    const updatedFoodEntryMeal =
      await foodEntryMealRepository.updateFoodEntryMeal(
        foodEntryMealId,
        {
          name: updatedMealData.name,
          description: updatedMealData.description,
          meal_type: updatedMealData.meal_type, // Also allow updating meal type
          entry_date: updatedMealData.entry_date, // And entry date
          meal_template_id: updatedMealData.meal_template_id, // Pass meal_template_id
          quantity: updatedMealData.quantity, // Update quantity
          unit: updatedMealData.unit, // Update unit
        },
        authenticatedUserId
      );
    const resolvedMealTypeId = updatedFoodEntryMeal.meal_type_id;
    if (!updatedFoodEntryMeal) {
      throw new Error('Food entry meal not found or not authorized to update.');
    }
    // 2. Delete existing component food_entries
    await foodRepository.deleteFoodEntryComponentsByFoodEntryMealId(
      foodEntryMealId,
      authenticatedUserId
    );
    log(
      'debug',
      `Deleted existing component food entries for food_entry_meal ${foodEntryMealId}.`
    );
    log('info', '[DEBUG] updateFoodEntryMeal Service Data:', updatedMealData); // DEBUG LOG
    // Calculate portion multiplier
    // Foods from getFoodEntryMealWithComponents now have BASE (unscaled) quantities,
    // so we just apply the new quantity as the multiplier
    let multiplier = 1.0;
    const newQuantity = updatedMealData.quantity || 1.0;
    if (updatedMealData.meal_template_id) {
      // Fetch meal template to get reference serving size
      const mealTemplate = await mealService.getMealById(
        authenticatedUserId,
        updatedMealData.meal_template_id
      );
      if (mealTemplate && mealTemplate.serving_size) {
        const referenceServingSize = mealTemplate.serving_size || 1.0;
        if (updatedMealData.unit === 'serving') {
          multiplier = newQuantity;
        } else {
          multiplier = newQuantity / referenceServingSize;
        }
        log(
          'info',
          `Update portion scaling (with template): multiplier ${multiplier} (consumed: ${newQuantity}, reference: ${referenceServingSize})`
        );
      }
    } else {
      multiplier = 1.0;
      log(
        'info',
        `Update portion scaling (no template): multiplier ${multiplier}`
      );
    }
    // 3. Create new component food_entries records
    const entriesToCreate = [];
    for (const foodItem of updatedMealData.foods) {
      const food = await foodRepository.getFoodById(
        foodItem.food_id,
        authenticatedUserId
      );
      if (!food) {
        log(
          'warn',
          `Food with ID ${foodItem.food_id} not found when updating food entry meal. Skipping.`
        );
        continue;
      }
      const variant = await foodRepository.getFoodVariantById(
        foodItem.variant_id,
        authenticatedUserId
      );
      if (!variant) {
        log(
          'warn',
          `Food variant with ID ${foodItem.variant_id} not found for food ${foodItem.food_id} when updating food entry meal. Skipping.`
        );
        continue;
      }
      const snapshot = {
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
        custom_nutrients: sanitizeCustomNutrients(variant.custom_nutrients),
      };
      // Scale the food quantity
      const scaledQuantity = foodItem.quantity * multiplier;
      entriesToCreate.push({
        user_id: authenticatedUserId,
        created_by_user_id: actingUserId,
        food_id: foodItem.food_id,
        meal_type_id: resolvedMealTypeId,
        quantity: scaledQuantity, // SCALED quantity
        unit: foodItem.unit,
        variant_id: foodItem.variant_id,
        entry_date: updatedMealData.entry_date,
        food_entry_meal_id: foodEntryMealId, // Link to the existing food_entry_meals ID
        ...snapshot,
      });
    }
    if (entriesToCreate.length > 0) {
      await foodRepository.bulkCreateFoodEntries(
        entriesToCreate,
        authenticatedUserId
      );
      log(
        'info',
        `Recreated ${entriesToCreate.length} component food entries for food_entry_meal ${foodEntryMealId}.`
      );
    }
    return updatedFoodEntryMeal;
  } catch (error) {
    log(
      'error',
      `Error updating food entry meal ${foodEntryMealId} for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function getFoodEntryMealWithComponents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foodEntryMealId: any
) {
  log(
    'info',
    `getFoodEntryMealWithComponents in foodEntryService: foodEntryMealId: ${foodEntryMealId}, authenticatedUserId: ${authenticatedUserId}`
  );
  try {
    const foodEntryMeal = await foodEntryMealRepository.getFoodEntryMealById(
      foodEntryMealId,
      authenticatedUserId
    );
    if (!foodEntryMeal) {
      return null;
    }
    const componentFoodEntries =
      await foodRepository.getFoodEntryComponentsByFoodEntryMealId(
        foodEntryMealId,
        authenticatedUserId
      );
    // Calculate the multiplier that was used when storing for editing purposes
    let storedMultiplier = 1.0;
    if (foodEntryMeal.meal_template_id) {
      try {
        const mealTemplate = await mealService.getMealById(
          authenticatedUserId,
          foodEntryMeal.meal_template_id
        );
        if (mealTemplate) {
          const consumedQuantity = foodEntryMeal.quantity || 1.0;
          const templateServingSize = mealTemplate.serving_size || 1.0;
          if (foodEntryMeal.unit === 'serving') {
            storedMultiplier = consumedQuantity;
          } else {
            storedMultiplier = consumedQuantity / templateServingSize;
          }
          log(
            'info',
            `Calculated stored multiplier for unscaling: ${storedMultiplier} (consumed: ${consumedQuantity}, template serving: ${templateServingSize})`
          );
        }
      } catch (err) {
        log(
          'warn',
          'Failed to fetch meal template for unscaling, using multiplier 1.0',
          err
        );
      }
    }
    // Aggregate nutritional data from componentFoodEntries (for frontend display)
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalSodium = 0;
    let totalFiber = 0;
    let totalSugars = 0;
    let totalSaturatedFat = 0;
    let totalPolyunsaturatedFat = 0;
    let totalMonounsaturatedFat = 0;
    let totalTransFat = 0;
    let totalCholesterol = 0;
    let totalPotassium = 0;
    let totalVitaminA = 0;
    let totalVitaminC = 0;
    let totalCalcium = 0;
    let totalIron = 0;
    const totalCustomNutrients = {};
    let totalCarbsForGI = 0;
    let weightedGIAccumulator = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    componentFoodEntries.forEach((entry: any) => {
      const servingSize = entry.serving_size || 1;
      const ratio = entry.quantity / servingSize;
      totalCalories += (entry.calories || 0) * ratio;
      totalProtein += (entry.protein || 0) * ratio;
      totalCarbs += (entry.carbs || 0) * ratio;
      totalFat += (entry.fat || 0) * ratio;
      totalSodium += (entry.sodium || 0) * ratio;
      totalFiber += (entry.dietary_fiber || 0) * ratio;
      totalSugars += (entry.sugars || 0) * ratio;
      totalSaturatedFat += (entry.saturated_fat || 0) * ratio;
      totalPolyunsaturatedFat += (entry.polyunsaturated_fat || 0) * ratio;
      totalMonounsaturatedFat += (entry.monounsaturated_fat || 0) * ratio;
      totalTransFat += (entry.trans_fat || 0) * ratio;
      totalCholesterol += (entry.cholesterol || 0) * ratio;
      totalPotassium += (entry.potassium || 0) * ratio;
      totalVitaminA += (entry.vitamin_a || 0) * ratio;
      totalVitaminC += (entry.vitamin_c || 0) * ratio;
      totalCalcium += (entry.calcium || 0) * ratio;
      totalIron += (entry.iron || 0) * ratio;
      // Aggregate custom nutrients
      if (
        entry.custom_nutrients &&
        typeof entry.custom_nutrients === 'object'
      ) {
        Object.entries(entry.custom_nutrients).forEach(([name, value]) => {
          if (
            value === null ||
            value === undefined ||
            String(value).trim() === ''
          ) {
            return; // Skip empty, null, or whitespace-only values
          }
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            totalCustomNutrients[name] =
              // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
              (totalCustomNutrients[name] || 0) + numValue * ratio;
          }
        });
      }
      if (entry.glycemic_index && entry.carbs) {
        const giValue = getGlycemicIndexValue(entry.glycemic_index);
        if (giValue !== null) {
          weightedGIAccumulator +=
            giValue * ((entry.carbs * entry.quantity) / servingSize);
          totalCarbsForGI += (entry.carbs * entry.quantity) / servingSize;
        }
      }
    });
    const aggregatedGlycemicIndex =
      totalCarbsForGI > 0 ? weightedGIAccumulator / totalCarbsForGI : null;
    return {
      ...foodEntryMeal,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      foods: componentFoodEntries.map((entry: any) => {
        const quantityToReturn = foodEntryMeal.meal_template_id
          ? entry.quantity / storedMultiplier
          : entry.quantity;
        return {
          food_id: entry.food_id,
          food_name: entry.food_name,
          variant_id: entry.variant_id,
          quantity: quantityToReturn,
          unit: entry.unit,
          calories: entry.calories, // BASE value per serving_size
          protein: entry.protein,
          carbs: entry.carbs,
          fat: entry.fat,
          saturated_fat: entry.saturated_fat,
          polyunsaturated_fat: entry.polyunsaturated_fat,
          monounsaturated_fat: entry.monounsaturated_fat,
          trans_fat: entry.trans_fat,
          cholesterol: entry.cholesterol,
          sodium: entry.sodium,
          potassium: entry.potassium,
          dietary_fiber: entry.dietary_fiber,
          sugars: entry.sugars,
          vitamin_a: entry.vitamin_a,
          vitamin_c: entry.vitamin_c,
          calcium: entry.calcium,
          iron: entry.iron,
          glycemic_index: entry.glycemic_index,
          custom_nutrients: entry.custom_nutrients,
          serving_size: entry.serving_size,
          serving_unit: entry.serving_unit,
        };
      }),
      // Aggregated totals are still calculated (for display when not editing)
      calories: totalCalories,
      protein: totalProtein,
      carbs: totalCarbs,
      fat: totalFat,
      saturated_fat: totalSaturatedFat,
      polyunsaturated_fat: totalPolyunsaturatedFat,
      monounsaturated_fat: totalMonounsaturatedFat,
      trans_fat: totalTransFat,
      cholesterol: totalCholesterol,
      sodium: totalSodium,
      potassium: totalPotassium,
      dietary_fiber: totalFiber,
      sugars: totalSugars,
      vitamin_a: totalVitaminA,
      vitamin_c: totalVitaminC,
      calcium: totalCalcium,
      iron: totalIron,
      custom_nutrients: totalCustomNutrients,
      glycemic_index: getGlycemicIndexCategory(aggregatedGlycemicIndex),
    };
  } catch (error) {
    log(
      'error',
      `Error getting food entry meal ${foodEntryMealId} with components for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function getFoodEntryMealsByDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedDate: any
) {
  log(
    'info',
    `getFoodEntryMealsByDate in foodEntryService: authenticatedUserId: ${authenticatedUserId}, targetUserId: ${targetUserId}, selectedDate: ${selectedDate}`
  );
  try {
    const foodEntryMeals =
      await foodEntryMealRepository.getFoodEntryMealsByDate(
        targetUserId,
        selectedDate
      );
    const mealsWithComponents = [];
    for (const meal of foodEntryMeals) {
      const componentFoodEntries =
        await foodRepository.getFoodEntryComponentsByFoodEntryMealId(
          meal.id,
          authenticatedUserId
        );
      let totalCalories = 0;
      let totalSodium = 0;
      let totalFiber = 0;
      let totalSugars = 0;
      let totalSaturatedFat = 0;
      let totalPolyunsaturatedFat = 0;
      let totalMonounsaturatedFat = 0;
      let totalTransFat = 0;
      let totalCholesterol = 0;
      let totalPotassium = 0;
      let totalVitaminA = 0;
      let totalVitaminC = 0;
      let totalCalcium = 0;
      let totalIron = 0;
      const totalCustomNutrients = {};
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;
      let totalCarbsForGI = 0;
      let weightedGIAccumulator = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      componentFoodEntries.forEach((entry: any) => {
        const ratio = entry.quantity / (entry.serving_size || 1);
        totalCalories += (entry.calories || 0) * ratio;
        totalProtein += (entry.protein || 0) * ratio;
        totalCarbs += (entry.carbs || 0) * ratio;
        totalFat += (entry.fat || 0) * ratio;
        totalSodium += (entry.sodium || 0) * ratio;
        totalFiber += (entry.dietary_fiber || 0) * ratio;
        totalSugars += (entry.sugars || 0) * ratio;
        totalSaturatedFat += (entry.saturated_fat || 0) * ratio;
        totalPolyunsaturatedFat += (entry.polyunsaturated_fat || 0) * ratio;
        totalMonounsaturatedFat += (entry.monounsaturated_fat || 0) * ratio;
        totalTransFat += (entry.trans_fat || 0) * ratio;
        totalCholesterol += (entry.cholesterol || 0) * ratio;
        totalPotassium += (entry.potassium || 0) * ratio;
        totalVitaminA += (entry.vitamin_a || 0) * ratio;
        totalVitaminC += (entry.vitamin_c || 0) * ratio;
        totalCalcium += (entry.calcium || 0) * ratio;
        totalIron += (entry.iron || 0) * ratio;
        // Aggregate custom nutrients
        if (
          entry.custom_nutrients &&
          typeof entry.custom_nutrients === 'object'
        ) {
          Object.entries(entry.custom_nutrients).forEach(([name, value]) => {
            if (
              value === null ||
              value === undefined ||
              String(value).trim() === ''
            ) {
              return; // Skip empty, null, or whitespace-only values
            }
            const numValue = Number(value);
            if (!isNaN(numValue)) {
              // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
              totalCustomNutrients[name] =
                // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                (totalCustomNutrients[name] || 0) + numValue * ratio;
            }
          });
        }
        if (entry.glycemic_index && entry.carbs) {
          const giValue = getGlycemicIndexValue(entry.glycemic_index);
          if (giValue !== null) {
            weightedGIAccumulator +=
              giValue * ((entry.carbs * entry.quantity) / entry.serving_size);
            totalCarbsForGI +=
              (entry.carbs * entry.quantity) / entry.serving_size;
          }
        }
      });
      const aggregatedGlycemicIndex =
        totalCarbsForGI > 0 ? weightedGIAccumulator / totalCarbsForGI : null;
      mealsWithComponents.push({
        ...meal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        foods: componentFoodEntries.map((entry: any) => ({
          food_id: entry.food_id,
          food_name: entry.food_name,
          variant_id: entry.variant_id,
          quantity: entry.quantity,
          unit: entry.unit,
          calories: (entry.calories * entry.quantity) / entry.serving_size,
          protein: (entry.protein * entry.quantity) / entry.serving_size,
          carbs: (entry.carbs * entry.quantity) / entry.serving_size,
          fat: (entry.fat * entry.quantity) / entry.serving_size,

          saturated_fat:
            (entry.saturated_fat * entry.quantity) / entry.serving_size,

          polyunsaturated_fat:
            (entry.polyunsaturated_fat * entry.quantity) / entry.serving_size,

          monounsaturated_fat:
            (entry.monounsaturated_fat * entry.quantity) / entry.serving_size,

          trans_fat: (entry.trans_fat * entry.quantity) / entry.serving_size,

          cholesterol:
            (entry.cholesterol * entry.quantity) / entry.serving_size,

          sodium: (entry.sodium * entry.quantity) / entry.serving_size,
          potassium: (entry.potassium * entry.quantity) / entry.serving_size,

          dietary_fiber:
            (entry.dietary_fiber * entry.quantity) / entry.serving_size,

          sugars: (entry.sugars * entry.quantity) / entry.serving_size,
          vitamin_a: (entry.vitamin_a * entry.quantity) / entry.serving_size,
          vitamin_c: (entry.vitamin_c * entry.quantity) / entry.serving_size,
          calcium: (entry.calcium * entry.quantity) / entry.serving_size,
          iron: (entry.iron * entry.quantity) / entry.serving_size,
          glycemic_index: entry.glycemic_index,
          custom_nutrients: entry.custom_nutrients,
          serving_size: entry.serving_size,
          serving_unit: entry.serving_unit,
        })),
        calories: totalCalories,
        protein: totalProtein,
        carbs: totalCarbs,
        fat: totalFat,
        saturated_fat: totalSaturatedFat,
        polyunsaturated_fat: totalPolyunsaturatedFat,
        monounsaturated_fat: totalMonounsaturatedFat,
        trans_fat: totalTransFat,
        cholesterol: totalCholesterol,
        sodium: totalSodium,
        potassium: totalPotassium,
        dietary_fiber: totalFiber,
        sugars: totalSugars,
        vitamin_a: totalVitaminA,
        vitamin_c: totalVitaminC,
        calcium: totalCalcium,
        iron: totalIron,
        custom_nutrients: totalCustomNutrients,
        glycemic_index: getGlycemicIndexCategory(aggregatedGlycemicIndex),
      });
    }
    return mealsWithComponents;
  } catch (error) {
    log(
      'error',
      `Error getting food entry meals by date for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

async function deleteFoodEntryMeal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foodEntryMealId: any
) {
  log(
    'info',
    `deleteFoodEntryMeal in foodEntryService: authenticatedUserId: ${authenticatedUserId}, foodEntryMealId: ${foodEntryMealId}`
  );
  try {
    // foodRepository.deleteFoodEntryComponentsByFoodEntryMealId will be called due to ON DELETE CASCADE
    // on the food_entries.food_entry_meal_id foreign key.
    const success = await foodEntryMealRepository.deleteFoodEntryMeal(
      foodEntryMealId,
      authenticatedUserId
    );
    if (!success) {
      throw new Error('Food entry meal not found or not authorized to delete.');
    }
    return { message: 'Food entry meal deleted successfully.' };
  } catch (error) {
    log(
      'error',
      `Error deleting food entry meal ${foodEntryMealId} for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

// Helpers for CSV Export
const translateMealType = (meal: string) => {
  const map: Record<string, string> = {
    breakfast: 'Petit-déjeuner',
    lunch: 'Déjeuner',
    dinner: 'Dîner',
    snacks: 'Collations',
  };
  return map[meal?.toLowerCase()] || meal;
};

const formatFrenchNumber = (num: number | string) => {
  if (num === null || num === undefined || num === '') return '';
  return String(num).replace('.', ',');
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formatDateFrench = (dateInput: any) => {
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (e) {
    return String(dateInput);
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSummaryForDate(userId: any, dateStr: string) {
  // Use dayToPickerDate to ensure YYYY-MM-DD format for DB
  const d = new Date(dateStr);
  const formattedDate = isNaN(d.getTime())
    ? dateStr
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const [nutrition, goal, waterEntries, exerciseEntries] = await Promise.all([
    foodRepository.getDailyNutritionSummary(userId, formattedDate),
    goalRepository.getMostRecentGoalBeforeDate(userId, formattedDate),
    measurementRepository.getWaterIntakeByDate(userId, formattedDate),
    reportRepository.getExerciseEntries(
      userId,
      formattedDate,
      formattedDate,
      null,
      null,
      null
    ),
  ]);

  const waterTotal = parseFloat(waterEntries?.water_ml) || 0;
  let caloriesBurned = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseEntries.forEach((ex: any) => {
    caloriesBurned += parseFloat(ex.calories_burned) || 0;
  });

  return {
    nutrition,
    goal,
    waterTotal,
    caloriesBurned,
  };
}

async function exportAllDiaryEntriesToCSVStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  res: express.Response
) {
  log('info', `exportAllDiaryEntriesToCSVStream: Started for user ${userId}`);

  const BATCH_SIZE = 500;
  let offset = 0;
  let hasMore = true;
  let isFirstBatch = true;

  // State for daily summaries
  let currentDateProcessed: string | null = null;
  const summariesCache = new Map();

  try {
    // Write BOM for Excel UTF-8
    res.write('\ufeff');

    while (hasMore) {
      const batch = await foodRepository.getFoodEntriesBatch(
        userId,
        BATCH_SIZE,
        offset
      );

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      // Map entry_date to YYYY-MM-DD string so Set properly deduplicates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uniqueDates = Array.from(
        new Set(
          batch.map((e: any) => {
            const d = new Date(e.entry_date);
            return isNaN(d.getTime())
              ? String(e.entry_date)
              : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          })
        )
      );

      // Pre-fetch summaries for dates we haven't seen yet
      for (const dateStr of uniqueDates) {
        if (!summariesCache.has(dateStr)) {
          const summary = await getSummaryForDate(userId, dateStr);
          summariesCache.set(dateStr, summary);
        }
      }

      const rowsToExport = [];

      for (const entry of batch) {
        const d = new Date(entry.entry_date);
        const dateStr = isNaN(d.getTime())
          ? String(entry.entry_date)
          : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        // Did the date change? Insert the summary for the PREVIOUS date
        if (currentDateProcessed !== null && currentDateProcessed !== dateStr) {
          const sumData = summariesCache.get(currentDateProcessed);
          if (sumData) {
            const sumDateFormatted = formatDateFrench(currentDateProcessed);

            rowsToExport.push(
              {
                Date: sumDateFormatted,
                Repas: 'BILAN DU JOUR',
                Aliment: 'Total Consommé',
                Marque: '',
                'Quantité Consommée': '',
                Unité: '',
                'Calories (kcal)': formatFrenchNumber(
                  (parseFloat(sumData.nutrition?.total_calories) || 0).toFixed(
                    1
                  )
                ),
                'Protéines (g)': formatFrenchNumber(
                  (parseFloat(sumData.nutrition?.total_protein) || 0).toFixed(1)
                ),
                'Glucides (g)': formatFrenchNumber(
                  (parseFloat(sumData.nutrition?.total_carbs) || 0).toFixed(1)
                ),
                'Lipides (g)': formatFrenchNumber(
                  (parseFloat(sumData.nutrition?.total_fat) || 0).toFixed(1)
                ),
                'Gras Saturés (g)': '',
                'Fibres (g)': formatFrenchNumber(
                  (
                    parseFloat(sumData.nutrition?.total_dietary_fiber) || 0
                  ).toFixed(1)
                ),
                'Sucres (g)': '',
                'Sodium (mg)': '',
                'Cholestérol (mg)': '',
                'Eau (ml)': '',
              },
              {
                Date: sumDateFormatted,
                Repas: 'BILAN DU JOUR',
                Aliment: 'Objectifs du jour',
                Marque: '',
                'Quantité Consommée': '',
                Unité: '',
                'Calories (kcal)': sumData.goal
                  ? formatFrenchNumber(sumData.goal.calories)
                  : '',
                'Protéines (g)': sumData.goal
                  ? formatFrenchNumber(sumData.goal.protein)
                  : '',
                'Glucides (g)': sumData.goal
                  ? formatFrenchNumber(sumData.goal.carbs)
                  : '',
                'Lipides (g)': sumData.goal
                  ? formatFrenchNumber(sumData.goal.fat)
                  : '',
                'Gras Saturés (g)': '',
                'Fibres (g)': '',
                'Sucres (g)': '',
                'Sodium (mg)': '',
                'Cholestérol (mg)': '',
                'Eau (ml)': '',
              },
              {
                Date: sumDateFormatted,
                Repas: 'BILAN DU JOUR',
                Aliment: 'Calories Brûlées (Exercices)',
                Marque: '',
                'Quantité Consommée': '',
                Unité: '',
                'Calories (kcal)': formatFrenchNumber(
                  sumData.caloriesBurned.toFixed(1)
                ),
                'Protéines (g)': '',
                'Glucides (g)': '',
                'Lipides (g)': '',
                'Gras Saturés (g)': '',
                'Fibres (g)': '',
                'Sucres (g)': '',
                'Sodium (mg)': '',
                'Cholestérol (mg)': '',
                'Eau (ml)': '',
              },
              {
                Date: sumDateFormatted,
                Repas: 'BILAN DU JOUR',
                Aliment: 'Eau Consommée',
                Marque: '',
                'Quantité Consommée': '',
                Unité: '',
                'Calories (kcal)': '',
                'Protéines (g)': '',
                'Glucides (g)': '',
                'Lipides (g)': '',
                'Gras Saturés (g)': '',
                'Fibres (g)': '',
                'Sucres (g)': '',
                'Sodium (mg)': '',
                'Cholestérol (mg)': '',
                'Eau (ml)': formatFrenchNumber(sumData.waterTotal),
              }
            );

            // Free memory
            summariesCache.delete(currentDateProcessed);
          }
        }

        currentDateProcessed = dateStr;

        const scale =
          entry.serving_size && entry.serving_size > 0
            ? entry.quantity / entry.serving_size
            : 1;

        // Regular food entry
        rowsToExport.push({
          Date: formatDateFrench(entry.entry_date),
          Repas: translateMealType(entry.meal_type || ''),
          Aliment: entry.food_name || '',
          Marque: entry.brand_name || '',
          'Quantité Consommée': formatFrenchNumber(entry.quantity),
          Unité: entry.unit || '',
          'Calories (kcal)': entry.calories
            ? formatFrenchNumber((entry.calories * scale).toFixed(1))
            : '0',
          'Protéines (g)': entry.protein
            ? formatFrenchNumber((entry.protein * scale).toFixed(1))
            : '0',
          'Glucides (g)': entry.carbs
            ? formatFrenchNumber((entry.carbs * scale).toFixed(1))
            : '0',
          'Lipides (g)': entry.fat
            ? formatFrenchNumber((entry.fat * scale).toFixed(1))
            : '0',
          'Gras Saturés (g)': entry.saturated_fat
            ? formatFrenchNumber((entry.saturated_fat * scale).toFixed(1))
            : '0',
          'Fibres (g)': entry.dietary_fiber
            ? formatFrenchNumber((entry.dietary_fiber * scale).toFixed(1))
            : '0',
          'Sucres (g)': entry.sugars
            ? formatFrenchNumber((entry.sugars * scale).toFixed(1))
            : '0',
          'Sodium (mg)': entry.sodium
            ? formatFrenchNumber((entry.sodium * scale).toFixed(1))
            : '0',
          'Cholestérol (mg)': entry.cholesterol
            ? formatFrenchNumber((entry.cholesterol * scale).toFixed(1))
            : '0',
          'Eau (ml)': '',
        });
      }

      // Parse to CSV chunk
      const csvChunk = Papa.unparse(rowsToExport, {
        header: isFirstBatch,
        delimiter: ';', // Force semicolon for Excel FR
      });

      // Write chunk to stream
      res.write(csvChunk + '\n');

      isFirstBatch = false;
      offset += BATCH_SIZE;
      hasMore = batch.length === BATCH_SIZE;
    }

    // Print summary for the VERY LAST date processed
    if (currentDateProcessed !== null) {
      const sumData = summariesCache.get(currentDateProcessed);
      if (sumData) {
        const sumDateFormatted = formatDateFrench(currentDateProcessed);
        const finalRows = [
          {
            Date: sumDateFormatted,
            Repas: 'BILAN DU JOUR',
            Aliment: 'Total Consommé',
            Marque: '',
            'Quantité Consommée': '',
            Unité: '',
            'Calories (kcal)': formatFrenchNumber(
              (parseFloat(sumData.nutrition?.total_calories) || 0).toFixed(1)
            ),
            'Protéines (g)': formatFrenchNumber(
              (parseFloat(sumData.nutrition?.total_protein) || 0).toFixed(1)
            ),
            'Glucides (g)': formatFrenchNumber(
              (parseFloat(sumData.nutrition?.total_carbs) || 0).toFixed(1)
            ),
            'Lipides (g)': formatFrenchNumber(
              (parseFloat(sumData.nutrition?.total_fat) || 0).toFixed(1)
            ),
            'Gras Saturés (g)': '',
            'Fibres (g)': formatFrenchNumber(
              (parseFloat(sumData.nutrition?.total_dietary_fiber) || 0).toFixed(
                1
              )
            ),
            'Sucres (g)': '',
            'Sodium (mg)': '',
            'Cholestérol (mg)': '',
            'Eau (ml)': '',
          },
          {
            Date: sumDateFormatted,
            Repas: 'BILAN DU JOUR',
            Aliment: 'Objectifs du jour',
            Marque: '',
            'Quantité Consommée': '',
            Unité: '',
            'Calories (kcal)': sumData.goal
              ? formatFrenchNumber(sumData.goal.calories)
              : '',
            'Protéines (g)': sumData.goal
              ? formatFrenchNumber(sumData.goal.protein)
              : '',
            'Glucides (g)': sumData.goal
              ? formatFrenchNumber(sumData.goal.carbs)
              : '',
            'Lipides (g)': sumData.goal
              ? formatFrenchNumber(sumData.goal.fat)
              : '',
            'Gras Saturés (g)': '',
            'Fibres (g)': '',
            'Sucres (g)': '',
            'Sodium (mg)': '',
            'Cholestérol (mg)': '',
            'Eau (ml)': '',
          },
          {
            Date: sumDateFormatted,
            Repas: 'BILAN DU JOUR',
            Aliment: 'Calories Brûlées (Exercices)',
            Marque: '',
            'Quantité Consommée': '',
            Unité: '',
            'Calories (kcal)': formatFrenchNumber(
              sumData.caloriesBurned.toFixed(1)
            ),
            'Protéines (g)': '',
            'Glucides (g)': '',
            'Lipides (g)': '',
            'Gras Saturés (g)': '',
            'Fibres (g)': '',
            'Sucres (g)': '',
            'Sodium (mg)': '',
            'Cholestérol (mg)': '',
            'Eau (ml)': '',
          },
          {
            Date: sumDateFormatted,
            Repas: 'BILAN DU JOUR',
            Aliment: 'Eau Consommée',
            Marque: '',
            'Quantité Consommée': '',
            Unité: '',
            'Calories (kcal)': '',
            'Protéines (g)': '',
            'Glucides (g)': '',
            'Lipides (g)': '',
            'Gras Saturés (g)': '',
            'Fibres (g)': '',
            'Sucres (g)': '',
            'Sodium (mg)': '',
            'Cholestérol (mg)': '',
            'Eau (ml)': formatFrenchNumber(sumData.waterTotal),
          },
        ];

        const finalChunk = Papa.unparse(finalRows, {
          header: false,
          delimiter: ';',
        });

        res.write(finalChunk + '\n');
      }
    }

    res.end();
    log(
      'info',
      `exportAllDiaryEntriesToCSVStream: Completed successfully for user ${userId}.`
    );
  } catch (error) {
    log(
      'error',
      `Error in exportAllDiaryEntriesToCSVStream for user ${userId}:`,
      error
    );
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error during CSV generation');
    } else {
      res.end('\nERROR: Failed to complete export.');
    }
  }
}

export { createFoodEntry };
export { deleteFoodEntry };
export { updateFoodEntry };
export { getFoodEntriesByDate };
export { getFoodEntriesByDateRange };
export { copyFoodEntries };
export { copyFoodEntriesFromYesterday };
export { copyAllFoodEntries };
export { copyAllFoodEntriesFromYesterday };
export { getDailyNutritionSummary };
export { createFoodEntryMeal };
export { updateFoodEntryMeal };
export { getFoodEntryMealWithComponents };
export { getFoodEntryMealsByDate };
export { deleteFoodEntryMeal };
export { exportAllDiaryEntriesToCSVStream };
export default {
  createFoodEntry,
  deleteFoodEntry,
  updateFoodEntry,
  getFoodEntriesByDate,
  getFoodEntriesByDateRange,
  copyFoodEntries,
  copyFoodEntriesFromYesterday,
  copyAllFoodEntries,
  copyAllFoodEntriesFromYesterday,
  getDailyNutritionSummary,
  createFoodEntryMeal,
  updateFoodEntryMeal,
  getFoodEntryMealWithComponents,
  getFoodEntryMealsByDate,
  deleteFoodEntryMeal,
  exportAllDiaryEntriesToCSVStream,
};
