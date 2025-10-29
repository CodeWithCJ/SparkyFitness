const foodRepository = require("../models/foodRepository");
const mealService = require("./mealService");
const { log } = require("../config/logging");

async function createFoodEntry(authenticatedUserId, actingUserId, entryData) {
  try {
    const entryWithUser = { ...entryData, user_id: authenticatedUserId, created_by_user_id: actingUserId };
    log("info", `createFoodEntry in foodService: authenticatedUserId: ${authenticatedUserId}, actingUserId: ${actingUserId}, entryData: ${JSON.stringify(entryData)}`);
    const newEntry = await foodRepository.createFoodEntry(entryWithUser, actingUserId);
    return newEntry;
  } catch (error) {
    log(
      "error",
      `Error creating food entry for user ${authenticatedUserId} by ${actingUserId} in foodService:`,
      error
    );
    throw error;
  }
}

async function updateFoodEntry(authenticatedUserId, actingUserId, entryId, entryData) {
  try {
    const entryOwnerId = await foodRepository.getFoodEntryOwnerId(entryId, authenticatedUserId);
    if (!entryOwnerId) {
      throw new Error("Food entry not found.");
    }
    if (entryOwnerId !== authenticatedUserId) {
      throw new Error(
        "Forbidden: You do not have permission to update this food entry."
      );
    }

    // Fetch the existing entry to get food_id and current variant_id if not provided in entryData
    const existingEntry = await foodRepository.getFoodEntryById(entryId, authenticatedUserId);
    if (!existingEntry) {
      throw new Error("Food entry not found.");
    }

    const foodIdToUse = existingEntry.food_id;
    const variantIdToUse = entryData.variant_id || existingEntry.variant_id;

    // Fetch the latest food and variant details for the snapshot
    const food = await foodRepository.getFoodById(foodIdToUse, authenticatedUserId);
    if (!food) {
      throw new Error("Food not found for snapshotting.");
    }
    const variant = await foodRepository.getFoodVariantById(
      variantIdToUse,
      authenticatedUserId
    );
    if (!variant) {
      throw new Error("Food variant not found for snapshotting.");
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

    const updatedEntry = await foodRepository.updateFoodEntry(
      entryId,
      authenticatedUserId,
      actingUserId,
      { ...entryData, meal_type: existingEntry.meal_type, variant_id: variantIdToUse }, // Ensure meal_type and correct variant_id are passed
      newSnapshotData // Pass the new snapshot data
    );
    if (!updatedEntry) {
      throw new Error("Food entry not found or not authorized to update.");
    }
    return updatedEntry;
  } catch (error) {
    log(
      "error",
      `Error updating food entry ${entryId} by user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}
async function deleteFoodEntry(authenticatedUserId, entryId) {
  try {
    const entryOwnerId = await foodRepository.getFoodEntryOwnerId(entryId, authenticatedUserId);
    if (!entryOwnerId) {
      throw new Error("Food entry not found.");
    }
    // Authorization check: Ensure the authenticated user owns the entry
    // or has family access to the owner's data.
    // For simplicity, assuming direct ownership for now.
    if (entryOwnerId !== authenticatedUserId) {
      // In a real app, you'd check family access here.
      throw new Error(
        "Forbidden: You do not have permission to delete this food entry."
      );
    }

    const success = await foodRepository.deleteFoodEntry(entryId, authenticatedUserId);
    if (!success) {
      throw new Error("Food entry not found or not authorized to delete.");
    }
    return true;
  } catch (error) {
    log(
      "error",
      `Error deleting food entry ${entryId} by user ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}

async function getFoodEntriesByDate(
  authenticatedUserId,
  targetUserId,
  selectedDate
) {
  try {
    if (!targetUserId) {
      log(
        "error",
        "getFoodEntriesByDate: targetUserId is undefined. Returning empty array."
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
      "error",
      `Error fetching food entries for user ${targetUserId} on ${selectedDate} by ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}

async function getFoodEntriesByDateRange(
  authenticatedUserId,
  targetUserId,
  startDate,
  endDate
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
      "error",
      `Error fetching food entries for user ${targetUserId} from ${startDate} to ${endDate} by ${authenticatedUserId} in foodService:`,
      error
    );
    throw error;
  }
}

async function addMealFoodsToDiary(
  authenticatedUserId,
  actingUserId,
  mealId,
  mealType,
  entryDate
) {
  try {
    const meal = await mealService.getMealById(authenticatedUserId, mealId);
    if (!meal) {
      throw new Error("Meal not found.");
    }

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let totalSaturatedFat = 0;
    let totalPolyunsaturatedFat = 0;
    let totalMonounsaturatedFat = 0;
    let totalTransFat = 0;
    let totalCholesterol = 0;
    let totalSodium = 0;
    let totalPotassium = 0;
    let totalDietaryFiber = 0;
    let totalSugars = 0;
    let totalVitaminA = 0;
    let totalVitaminC = 0;
    let totalCalcium = 0;
    let totalIron = 0;
    let totalCarbsForGI = 0;
    let weightedGIAccumulator = 0;

    for (const foodItem of meal.foods) {
      const food = await foodRepository.getFoodById(foodItem.food_id, authenticatedUserId);
      if (!food) {
        log("warn", `Food with ID ${foodItem.food_id} not found for meal ${mealId}. Skipping.`);
        continue;
      }

      const variant = await foodRepository.getFoodVariantById(foodItem.variant_id, authenticatedUserId);
      if (!variant) {
        log("warn", `Food variant with ID ${foodItem.variant_id} not found for food ${foodItem.food_id} in meal ${mealId}. Skipping.`);
        continue;
      }

      // Assuming foodItem.quantity and foodItem.unit are already normalized to a base unit or serving size
      // For simplicity, we'll assume foodItem.quantity is in terms of variant.serving_size
      // If units need conversion, that logic would go here.
      const multiplier = foodItem.quantity / variant.serving_size;

      totalCalories += (variant.calories || 0) * multiplier;
      totalProtein += (variant.protein || 0) * multiplier;
      totalCarbs += (variant.carbs || 0) * multiplier;
      totalFat += (variant.fat || 0) * multiplier;
      totalSaturatedFat += (variant.saturated_fat || 0) * multiplier;
      totalPolyunsaturatedFat += (variant.polyunsaturated_fat || 0) * multiplier;
      totalMonounsaturatedFat += (variant.monounsaturated_fat || 0) * multiplier;
      totalTransFat += (variant.trans_fat || 0) * multiplier;
      totalCholesterol += (variant.cholesterol || 0) * multiplier;
      totalSodium += (variant.sodium || 0) * multiplier;
      totalPotassium += (variant.potassium || 0) * multiplier;
      totalDietaryFiber += (variant.dietary_fiber || 0) * multiplier;
      totalSugars += (variant.sugars || 0) * multiplier;
      totalVitaminA += (variant.vitamin_a || 0) * multiplier;
      totalVitaminC += (variant.vitamin_c || 0) * multiplier;
      totalCalcium += (variant.calcium || 0) * multiplier;
      totalIron += (variant.iron || 0) * multiplier;

      // For weighted average GI
      if (variant.glycemic_index && variant.carbs) {
        const giValue = getGlycemicIndexValue(variant.glycemic_index);
        if (giValue !== null) {
          weightedGIAccumulator += giValue * (variant.carbs * multiplier);
          totalCarbsForGI += (variant.carbs * multiplier);
        }
      }
    }

    const aggregatedGlycemicIndex = totalCarbsForGI > 0 ? weightedGIAccumulator / totalCarbsForGI : null;

    const newEntry = await foodRepository.createFoodEntry({
      user_id: authenticatedUserId,
      created_by_user_id: actingUserId,
      meal_id: mealId, // Link to the meal
      food_id: null, // No specific food_id for aggregated meal
      meal_type: mealType,
      quantity: 1, // One aggregated meal entry
      unit: 'meal', // Unit is 'meal'
      entry_date: entryDate,
      variant_id: null, // No variant for aggregated meal

      // Snapshot data for the aggregated meal
      food_name: meal.name,
      brand_name: 'Meal',
      serving_size: 1,
      serving_unit: 'meal',
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
      dietary_fiber: totalDietaryFiber,
      sugars: totalSugars,
      vitamin_a: totalVitaminA,
      vitamin_c: totalVitaminC,
      calcium: totalCalcium,
      iron: totalIron,
      glycemic_index: getGlycemicIndexCategory(aggregatedGlycemicIndex),
    }, authenticatedUserId);

    return [newEntry]; // Return as an array for consistency with previous behavior
  } catch (error) {
    log(
      "error",
      `Error adding meal foods to diary for user ${authenticatedUserId} by ${actingUserId}, meal ${mealId}:`,
      error
    );
    throw error;
  }
}

// Helper function to convert GlycemicIndex category to a numerical value for calculation
function getGlycemicIndexValue(category) {
  switch (category) {
    case 'Very Low': return 10; // Example values, adjust as needed
    case 'Low': return 30;
    case 'Medium': return 60;
    case 'High': return 80;
    case 'Very High': return 100;
    default: return null;
  }
}

// Helper function to convert numerical GI back to category
function getGlycemicIndexCategory(value) {
  if (value === null) return 'None';
  if (value <= 20) return 'Very Low';
  if (value <= 50) return 'Low';
  if (value <= 70) return 'Medium';
  if (value <= 90) return 'High';
  return 'Very High';
}

async function copyFoodEntries(
  authenticatedUserId,
  actingUserId,
  sourceDate,
  sourceMealType,
  targetDate,
  targetMealType
) {
  try {
    // 1. Fetch source entries
    const sourceEntries = await foodRepository.getFoodEntriesByDateAndMealType(
      authenticatedUserId,
      sourceDate,
      sourceMealType
    );

    if (sourceEntries.length === 0) {
      log(
        "debug",
        `No food entries found for ${sourceMealType} on ${sourceDate} for user ${authenticatedUserId}. No entries to copy.`
      );
      return [];
    }

    const entriesToCreate = [];
    for (const entry of sourceEntries) {
      log("debug", `copyFoodEntries: Processing source entry: ${JSON.stringify(entry)}`);
      // Check for existing entry to prevent duplicates
      const existingEntry = await foodRepository.getFoodEntryByDetails(
        authenticatedUserId,
        entry.food_id,
        targetMealType,
        targetDate,
        entry.variant_id
      );

      if (!existingEntry) {
        entriesToCreate.push({
          user_id: authenticatedUserId,
          created_by_user_id: actingUserId, // Use actingUserId for audit
          food_id: entry.food_id,
          meal_type: targetMealType,
          quantity: entry.quantity,
          unit: entry.unit,
          entry_date: targetDate,
          variant_id: entry.variant_id,
          meal_plan_template_id: null, // Copied entries are not part of a template
          // Copy all snapshot data from the source entry
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
        });
        log("debug", `copyFoodEntries: Adding entry for food_id: ${entry.food_id}, meal_type: ${targetMealType}, entry_date: ${targetDate}, variant_id: ${entry.variant_id}`);
        // Pass authenticatedUserId as the RLS user for bulkCreateFoodEntries
      } else {
        log(
          "debug",
          `Skipping duplicate food entry for food_id ${entry.food_id} in ${targetMealType} on ${targetDate}.`
        );
      }
    }

    if (entriesToCreate.length === 0) {
      log(
        "debug",
        `All food entries from ${sourceMealType} on ${sourceDate} already exist in ${targetMealType} on ${targetDate}. No new entries created.`
      );
      return [];
    }

    // 3. Bulk insert new entries
    const newEntries = await foodRepository.bulkCreateFoodEntries(
      entriesToCreate,
      authenticatedUserId // Pass authenticatedUserId for RLS
    );
    log(
      "debug",
      `Successfully copied ${newEntries.length} new food entries from ${sourceMealType} on ${sourceDate} to ${targetMealType} on ${targetDate} for user ${authenticatedUserId}.`
    );
    return newEntries;
  } catch (error) {
    log(
      "error",
      `Error copying food entries for user ${authenticatedUserId} from ${sourceDate} ${sourceMealType} to ${targetDate} ${targetMealType}:`,
      error
    );
    throw error;
  }
}

async function copyFoodEntriesFromYesterday(
  authenticatedUserId,
  actingUserId,
  mealType,
  targetDate
) {
  try {
    const [yearStr, monthStr, dayStr] = targetDate.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10); // month is 1-indexed from frontend
    const day = parseInt(dayStr, 10);

    // Validate parsed components
    if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
      throw new Error("Invalid date format provided for targetDate.");
    }

    // Create UTC date object
    const priorDay = new Date(Date.UTC(year, month - 1, day)); // month - 1 because Date.UTC expects 0-indexed month

    // Check if the date object is valid
    if (isNaN(priorDay.getTime())) {
      throw new Error("Invalid date value generated for prior day.");
    }

    priorDay.setUTCDate(priorDay.getUTCDate() - 1); // Subtract one day in UTC

    // Check again after subtraction
    if (isNaN(priorDay.getTime())) {
      throw new Error("Invalid date value generated after subtracting a day.");
    }

    const sourceDate = priorDay.toISOString().split("T")[0]; // Format as YYYY-MM-DD

    // 1. Fetch source entries from the prior day for the specified meal type
    const sourceEntries = await foodRepository.getFoodEntriesByDateAndMealType(
      authenticatedUserId,
      sourceDate,
      mealType
    );

    if (sourceEntries.length === 0) {
      log(
        "debug",
        `No food entries found for ${mealType} on ${sourceDate} for user ${authenticatedUserId}. No entries to copy.`
      );
      return [];
    }

    const entriesToCreate = [];
    for (const entry of sourceEntries) {
      log("debug", `copyFoodEntriesFromYesterday: Processing source entry: ${JSON.stringify(entry)}`);
      // Check for existing entry to prevent duplicates
      const existingEntry = await foodRepository.getFoodEntryByDetails(
        authenticatedUserId,
        entry.food_id,
        mealType,
        targetDate,
        entry.variant_id
      );

      if (!existingEntry) {
        entriesToCreate.push({
          user_id: authenticatedUserId,
          created_by_user_id: actingUserId, // Use actingUserId for audit
          food_id: entry.food_id,
          meal_type: mealType, // Keep the same meal type
          quantity: entry.quantity,
          unit: entry.unit,
          entry_date: targetDate, // Set to targetDate
          variant_id: entry.variant_id,
          meal_plan_template_id: null, // Copied entries are not part of a template
          // Copy all snapshot data from the source entry
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
        });
      } else {
        log(
          "debug",
          `Skipping duplicate food entry for food_id ${entry.food_id} in ${mealType} on ${targetDate}.`
        );
      }
    }

    if (entriesToCreate.length === 0) {
      log(
        "debug",
        `All food entries from prior day's ${mealType} already exist in ${targetDate} ${mealType}. No new entries created.`
      );
      return [];
    }

    // 3. Bulk insert new entries
    const newEntries = await foodRepository.bulkCreateFoodEntries(
      entriesToCreate,
      authenticatedUserId // Pass authenticatedUserId for RLS
    );
    log(
      "debug",
      `Successfully copied ${newEntries.length} new food entries from prior day's ${mealType} to ${targetDate} ${mealType} for user ${authenticatedUserId}.`
    );
    return newEntries;
  } catch (error) {
    log(
      "error",
      `Error copying food entries from prior day for user ${authenticatedUserId} to ${targetDate} ${mealType}:`,
      error
    );
    throw error;
  }
}

async function getDailyNutritionSummary(userId, date) {
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
      "error",
      `Error fetching daily nutrition summary for user ${userId} on ${date} in foodService:`,
      error
    );
    throw error;
  }
}

module.exports = {
  createFoodEntry,
  deleteFoodEntry,
  updateFoodEntry,
  getFoodEntriesByDate,
  getFoodEntriesByDateRange,
  addMealFoodsToDiary,
  copyFoodEntries,
  copyFoodEntriesFromYesterday,
  getDailyNutritionSummary,
};