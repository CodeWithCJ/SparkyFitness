const foodRepository = require("../models/foodRepository");
const foodEntryMealRepository = require("../models/foodEntryMealRepository");
const mealService = require("./mealService");
const { log } = require("../config/logging");
const mealTypeRepository = require("../models/mealType");
const { sanitizeCustomNutrients } = require("../utils/foodUtils");

// Helper functions (already defined)
function getGlycemicIndexValue(category) {
  switch (category) {
    case "Very Low":
      return 10;
    case "Low":
      return 30;
    case "Medium":
      return 60;
    case "High":
      return 80;
    case "Very High":
      return 100;
    default:
      return null;
  }
}

function getGlycemicIndexCategory(value) {
  if (value === null) return "None";
  if (value <= 20) return "Very Low";
  if (value <= 50) return "Low";
  if (value <= 70) return "Medium";
  if (value <= 90) return "High";
  return "Very High";
}

async function resolveMealTypeId(userId, mealTypeName) {
  if (!mealTypeName) return null;
  const types = await mealTypeRepository.getAllMealTypes(userId);
  const match = types.find(
    (t) => t.name.toLowerCase() === mealTypeName.toLowerCase(),
  );
  return match ? match.id : null;
}

async function createFoodEntry(authenticatedUserId, actingUserId, entryData) {
  try {
    const entryWithUser = {
      ...entryData,
      user_id: entryData.user_id || authenticatedUserId,
      created_by_user_id: actingUserId,
      custom_nutrients: sanitizeCustomNutrients(entryData.custom_nutrients),
    };
    log(
      "info",
      `createFoodEntry in foodService: authenticatedUserId: ${authenticatedUserId}, actingUserId: ${actingUserId}, entryData: ${JSON.stringify(
        entryData,
      )}`,
    );
    const newEntry = await foodRepository.createFoodEntry(
      entryWithUser,
      actingUserId,
    );
    return newEntry;
  } catch (error) {
    log(
      "error",
      `Error creating food entry for user ${authenticatedUserId} by ${actingUserId} in foodService:`,
      error,
    );
    throw error;
  }
}

async function updateFoodEntry(
  authenticatedUserId,
  actingUserId,
  entryId,
  entryData,
) {
  try {
    const entryOwnerId = await foodRepository.getFoodEntryOwnerId(
      entryId,
      authenticatedUserId,
    );
    if (!entryOwnerId) {
      throw new Error("Food entry not found.");
    }
    if (entryOwnerId !== authenticatedUserId) {
      throw new Error(
        "Forbidden: You do not have permission to update this food entry.",
      );
    }

    // Fetch the existing entry to get food_id and current variant_id if not provided in entryData
    const existingEntry = await foodRepository.getFoodEntryById(
      entryId,
      authenticatedUserId,
    );
    if (!existingEntry) {
      throw new Error("Food entry not found.");
    }

    const foodIdToUse = existingEntry.food_id;
    const variantIdToUse = entryData.variant_id || existingEntry.variant_id;

    // Fetch the latest food and variant details for the snapshot
    const food = await foodRepository.getFoodById(
      foodIdToUse,
      authenticatedUserId,
    );
    if (!food) {
      throw new Error("Food not found for snapshotting.");
    }
    const variant = await foodRepository.getFoodVariantById(
      variantIdToUse,
      authenticatedUserId,
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
      custom_nutrients: sanitizeCustomNutrients(variant.custom_nutrients),
    };

    const updatedEntry = await foodRepository.updateFoodEntry(
      entryId,
      authenticatedUserId,
      actingUserId,
      {
        ...entryData,
        meal_type_id: existingEntry.meal_type_id,
        variant_id: variantIdToUse,
      }, // Ensure meal_type_id and correct variant_id are passed
      newSnapshotData, // Pass the new snapshot data
    );
    if (!updatedEntry) {
      throw new Error("Food entry not found or not authorized to update.");
    }
    return updatedEntry;
  } catch (error) {
    log(
      "error",
      `Error updating food entry ${entryId} by user ${authenticatedUserId} in foodService:`,
      error,
    );
    throw error;
  }
}
async function deleteFoodEntry(authenticatedUserId, entryId) {
  try {
    const entryOwnerId = await foodRepository.getFoodEntryOwnerId(
      entryId,
      authenticatedUserId,
    );
    if (!entryOwnerId) {
      throw new Error("Food entry not found.");
    }
    // Authorization check: Ensure the authenticated user owns the entry
    // or has family access to the owner's data.
    // For simplicity, assuming direct ownership for now.
    if (entryOwnerId !== authenticatedUserId) {
      // In a real app, you'd check family access here.
      throw new Error(
        "Forbidden: You do not have permission to delete this food entry.",
      );
    }

    const success = await foodRepository.deleteFoodEntry(
      entryId,
      authenticatedUserId,
    );
    if (!success) {
      throw new Error("Food entry not found or not authorized to delete.");
    }
    return true;
  } catch (error) {
    log(
      "error",
      `Error deleting food entry ${entryId} by user ${authenticatedUserId} in foodService:`,
      error,
    );
    throw error;
  }
}

async function getFoodEntriesByDate(
  authenticatedUserId,
  targetUserId,
  selectedDate,
) {
  try {
    if (!targetUserId) {
      log(
        "error",
        "getFoodEntriesByDate: targetUserId is undefined. Returning empty array.",
      );
      return [];
    }
    const entries = await foodRepository.getFoodEntriesByDate(
      targetUserId,
      selectedDate,
    );
    return entries;
  } catch (error) {
    log(
      "error",
      `Error fetching food entries for user ${targetUserId} on ${selectedDate} by ${authenticatedUserId} in foodService:`,
      error,
    );
    throw error;
  }
}

async function getFoodEntriesByDateRange(
  authenticatedUserId,
  targetUserId,
  startDate,
  endDate,
) {
  try {
    const entries = await foodRepository.getFoodEntriesByDateRange(
      targetUserId,
      startDate,
      endDate,
    );
    return entries;
  } catch (error) {
    log(
      "error",
      `Error fetching food entries for user ${targetUserId} from ${startDate} to ${endDate} by ${authenticatedUserId} in foodService:`,
      error,
    );
    throw error;
  }
}

async function copyFoodEntries(
  authenticatedUserId,
  actingUserId,
  sourceDate,
  sourceMealType,
  targetDate,
  targetMealType,
) {
  try {
    // 1. Fetch source entries
    const sourceEntries = await foodRepository.getFoodEntriesByDateAndMealType(
      authenticatedUserId,
      sourceDate,
      sourceMealType,
    );

    if (sourceEntries.length === 0) {
      log(
        "debug",
        `No food entries found for ${sourceMealType} on ${sourceDate} for user ${authenticatedUserId}. No entries to copy.`,
      );
      return [];
    }

    const targetMealTypeId = await resolveMealTypeId(
      authenticatedUserId,
      targetMealType,
    );
    if (!targetMealTypeId) {
      throw new Error(`Invalid target meal type: ${targetMealType}`);
    }

    const entriesToCreate = [];
    for (const entry of sourceEntries) {
      log(
        "debug",
        `copyFoodEntries: Processing source entry: ${JSON.stringify(entry)}`,
      );
      // Check for existing entry to prevent duplicates
      const existingEntry = await foodRepository.getFoodEntryByDetails(
        authenticatedUserId,
        entry.food_id,
        targetMealType,
        targetDate,
        entry.variant_id,
      );

      if (!existingEntry) {
        entriesToCreate.push({
          user_id: authenticatedUserId,
          created_by_user_id: actingUserId, // Use actingUserId for audit
          food_id: entry.food_id,
          meal_type_id: targetMealTypeId,
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
          custom_nutrients: sanitizeCustomNutrients(entry.custom_nutrients),
        });
        log(
          "debug",
          `copyFoodEntries: Adding entry for food_id: ${entry.food_id}, meal_type_id: ${targetMealTypeId}, entry_date: ${targetDate}, variant_id: ${entry.variant_id}`,
        );
        // Pass authenticatedUserId as the RLS user for bulkCreateFoodEntries
      } else {
        log(
          "debug",
          `Skipping duplicate food entry for food_id ${entry.food_id} in ${targetMealType} on ${targetDate}.`,
        );
      }
    }

    if (entriesToCreate.length === 0) {
      log(
        "debug",
        `All food entries from ${sourceMealType} on ${sourceDate} already exist in ${targetMealType} on ${targetDate}. No new entries created.`,
      );
      return [];
    }

    // 3. Bulk insert new entries
    const newEntries = await foodRepository.bulkCreateFoodEntries(
      entriesToCreate,
      authenticatedUserId, // Pass authenticatedUserId for RLS
    );
    log(
      "debug",
      `Successfully copied ${newEntries.length} new food entries from ${sourceMealType} on ${sourceDate} to ${targetMealType} on ${targetDate} for user ${authenticatedUserId}.`,
    );
    return newEntries;
  } catch (error) {
    log(
      "error",
      `Error copying food entries for user ${authenticatedUserId} from ${sourceDate} ${sourceMealType} to ${targetDate} ${targetMealType}:`,
      error,
    );
    throw error;
  }
}

async function copyFoodEntriesFromYesterday(
  authenticatedUserId,
  actingUserId,
  mealType,
  targetDate,
) {
  try {
    const [yearStr, monthStr, dayStr] = targetDate.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10); // month is 1-indexed from frontend
    const day = parseInt(dayStr, 10);

    // Validate parsed components
    if (
      isNaN(year) ||
      isNaN(month) ||
      isNaN(day) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      throw new Error("Invalid date format provided for targetDate.");
    }

    // Create UTC date object
    const priorDay = new Date(Date.UTC(year, month - 1, day)); // month - 1 because Date.UTC expects 0-indexed month
    if (isNaN(priorDay.getTime())) {
      throw new Error("Invalid date value generated for prior day.");
    }

    priorDay.setUTCDate(priorDay.getUTCDate() - 1); // Subtract one day in UTC
    if (isNaN(priorDay.getTime())) {
      throw new Error("Invalid date value generated after subtracting a day.");
    }

    const sourceDate = priorDay.toISOString().split("T")[0]; // Format as YYYY-MM-DD

    // 1. Fetch source entries from the prior day for the specified meal type
    const sourceEntries = await foodRepository.getFoodEntriesByDateAndMealType(
      authenticatedUserId,
      sourceDate,
      mealType,
    );

    if (sourceEntries.length === 0) {
      log(
        "debug",
        `No food entries found for ${mealType} on ${sourceDate} for user ${authenticatedUserId}. No entries to copy.`,
      );
      return [];
    }

    const mealTypeId = await resolveMealTypeId(authenticatedUserId, mealType);
    if (!mealTypeId) throw new Error(`Invalid meal type: ${mealType}`);

    const entriesToCreate = [];
    for (const entry of sourceEntries) {
      log(
        "debug",
        `copyFoodEntriesFromYesterday: Processing source entry: ${JSON.stringify(
          entry,
        )}`,
      );
      // Check for existing entry to prevent duplicates
      const existingEntry = await foodRepository.getFoodEntryByDetails(
        authenticatedUserId,
        entry.food_id,
        mealType,
        targetDate,
        entry.variant_id,
      );

      if (!existingEntry) {
        entriesToCreate.push({
          user_id: authenticatedUserId,
          created_by_user_id: actingUserId, // Use actingUserId for audit
          food_id: entry.food_id,
          meal_type_id: mealTypeId,
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
          custom_nutrients: sanitizeCustomNutrients(entry.custom_nutrients),
        });
      } else {
        log(
          "debug",
          `Skipping duplicate food entry for food_id ${entry.food_id} in ${mealType} on ${targetDate}.`,
        );
      }
    }

    if (entriesToCreate.length === 0) {
      log(
        "debug",
        `All food entries from prior day's ${mealType} already exist in ${targetDate} ${mealType}. No new entries created.`,
      );
      return [];
    }

    // 3. Bulk insert new entries
    const newEntries = await foodRepository.bulkCreateFoodEntries(
      entriesToCreate,
      authenticatedUserId, // Pass authenticatedUserId for RLS
    );
    log(
      "debug",
      `Successfully copied ${newEntries.length} new food entries from prior day's ${mealType} to ${targetDate} ${mealType} for user ${authenticatedUserId}.`,
    );
    return newEntries;
  } catch (error) {
    log(
      "error",
      `Error copying food entries from prior day for user ${authenticatedUserId} to ${targetDate} ${mealType}:`,
      error,
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
      error,
    );
    throw error;
  }
}

// New functions for food_entry_meals logic
async function createFoodEntryMeal(
  authenticatedUserId,
  actingUserId,
  mealData,
) {
  log(
    "info",
    `createFoodEntryMeal in foodEntryService: authenticatedUserId: ${authenticatedUserId}, actingUserId: ${actingUserId}, mealData: ${JSON.stringify(
      mealData,
    )}`,
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
        unit: mealData.unit || "serving", // Default to 'serving'
      },
      actingUserId,
    );

    const resolvedMealTypeId = newFoodEntryMeal.meal_type_id;

    let foodsToProcess = mealData.foods || [];
    let mealServingSize = 1.0; // Default serving size

    // If a meal_template_id is provided and no specific foods are given, fetch foods from the template
    if (
      mealData.meal_template_id &&
      (!mealData.foods || mealData.foods.length === 0)
    ) {
      log(
        "info",
        `Fetching foods from meal template ${mealData.meal_template_id} for new food entry meal.`,
      );
      const mealTemplate = await mealService.getMealById(
        authenticatedUserId,
        mealData.meal_template_id,
      );
      if (mealTemplate && mealTemplate.foods) {
        foodsToProcess = mealTemplate.foods;
        mealServingSize = mealTemplate.serving_size || 1.0; // Get the meal's serving size
        log(
          "info",
          `Meal template serving size: ${mealServingSize} ${
            mealTemplate.serving_unit || "serving"
          }`,
        );
      } else {
        log(
          "warn",
          `Meal template ${mealData.meal_template_id} not found or has no foods when creating food entry meal.`,
        );
        // Continue without foods, or throw an error if template foods are mandatory
      }
    }

    // Calculate portion multiplier: consumed_quantity / meal_serving_size
    const consumedQuantity = mealData.quantity || 1.0;
    let multiplier = 1.0;
    //Scale if there is a template ID
    if (mealData.meal_template_id) {
      if (mealData.unit === "serving") {
        multiplier = consumedQuantity;
      } else {
        multiplier = consumedQuantity / mealServingSize;
      }
    }
    log(
      "info",
      `Portion multiplier: ${multiplier} (consumed: ${consumedQuantity}, serving_size: ${mealServingSize}, has_template: ${!!mealData.meal_template_id})`,
    );

    // 2. Create component food_entries records with scaled quantities
    const entriesToCreate = [];
    for (const foodItem of foodsToProcess) {
      const food = await foodRepository.getFoodById(
        foodItem.food_id,
        authenticatedUserId,
      );
      if (!food) {
        log(
          "warn",
          `Food with ID ${foodItem.food_id} not found when creating food entry meal. Skipping.`,
        );
        continue;
      }
      const variant = await foodRepository.getFoodVariantById(
        foodItem.variant_id,
        authenticatedUserId,
      );
      if (!variant) {
        log(
          "warn",
          `Food variant with ID ${foodItem.variant_id} not found for food ${foodItem.food_id} when creating food entry meal. Skipping.`,
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
        authenticatedUserId,
      );
      log(
        "info",
        `Created ${entriesToCreate.length} component food entries for food_entry_meal ${newFoodEntryMeal.id}.`,
      );
    }

    return newFoodEntryMeal;
  } catch (error) {
    log(
      "error",
      `Error creating food entry meal for user ${authenticatedUserId}:`,
      error,
    );
    throw error;
  }
}

async function updateFoodEntryMeal(
  authenticatedUserId,
  actingUserId,
  foodEntryMealId,
  updatedMealData,
) {
  log(
    "info",
    `updateFoodEntryMeal in foodEntryService: foodEntryMealId: ${foodEntryMealId}, updatedMealData: ${JSON.stringify(
      updatedMealData,
    )}, authenticatedUserId: ${authenticatedUserId}, actingUserId: ${actingUserId}`,
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
        authenticatedUserId,
      );

    const resolvedMealTypeId = updatedFoodEntryMeal.meal_type_id;

    if (!updatedFoodEntryMeal) {
      throw new Error("Food entry meal not found or not authorized to update.");
    }

    // 2. Delete existing component food_entries
    await foodRepository.deleteFoodEntryComponentsByFoodEntryMealId(
      foodEntryMealId,
      authenticatedUserId,
    );
    log(
      "debug",
      `Deleted existing component food entries for food_entry_meal ${foodEntryMealId}.`,
    );
    log("info", `[DEBUG] updateFoodEntryMeal Service Data:`, updatedMealData); // DEBUG LOG

    // Calculate portion multiplier
    // Foods from getFoodEntryMealWithComponents now have BASE (unscaled) quantities,
    // so we just apply the new quantity as the multiplier

    let multiplier = 1.0;
    const newQuantity = updatedMealData.quantity || 1.0;

    if (updatedMealData.meal_template_id) {
      // Fetch meal template to get reference serving size
      const mealTemplate = await mealService.getMealById(
        authenticatedUserId,
        updatedMealData.meal_template_id,
      );
      if (mealTemplate && mealTemplate.serving_size) {
        const referenceServingSize = mealTemplate.serving_size || 1.0;
        if (updatedMealData.unit === "serving") {
          multiplier = newQuantity;
        } else {
          multiplier = newQuantity / referenceServingSize;
        }
        log(
          "info",
          `Update portion scaling (with template): multiplier ${multiplier} (consumed: ${newQuantity}, reference: ${referenceServingSize})`,
        );
      }
    } else {
      multiplier = 1.0;
      log(
        "info",
        `Update portion scaling (no template): multiplier ${multiplier}`,
      );
    }

    // 3. Create new component food_entries records
    const entriesToCreate = [];
    for (const foodItem of updatedMealData.foods) {
      const food = await foodRepository.getFoodById(
        foodItem.food_id,
        authenticatedUserId,
      );
      if (!food) {
        log(
          "warn",
          `Food with ID ${foodItem.food_id} not found when updating food entry meal. Skipping.`,
        );
        continue;
      }
      const variant = await foodRepository.getFoodVariantById(
        foodItem.variant_id,
        authenticatedUserId,
      );
      if (!variant) {
        log(
          "warn",
          `Food variant with ID ${foodItem.variant_id} not found for food ${foodItem.food_id} when updating food entry meal. Skipping.`,
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
        authenticatedUserId,
      );
      log(
        "info",
        `Recreated ${entriesToCreate.length} component food entries for food_entry_meal ${foodEntryMealId}.`,
      );
    }

    return updatedFoodEntryMeal;
  } catch (error) {
    log(
      "error",
      `Error updating food entry meal ${foodEntryMealId} for user ${authenticatedUserId}:`,
      error,
    );
    throw error;
  }
}

async function getFoodEntryMealWithComponents(
  authenticatedUserId,
  foodEntryMealId,
) {
  log(
    "info",
    `getFoodEntryMealWithComponents in foodEntryService: foodEntryMealId: ${foodEntryMealId}, authenticatedUserId: ${authenticatedUserId}`,
  );
  try {
    const foodEntryMeal = await foodEntryMealRepository.getFoodEntryMealById(
      foodEntryMealId,
      authenticatedUserId,
    );
    if (!foodEntryMeal) {
      return null;
    }

    const componentFoodEntries =
      await foodRepository.getFoodEntryComponentsByFoodEntryMealId(
        foodEntryMealId,
        authenticatedUserId,
      );

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
    let totalCustomNutrients = {};
    let totalCarbsForGI = 0;
    let weightedGIAccumulator = 0;

    componentFoodEntries.forEach((entry) => {
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
        typeof entry.custom_nutrients === "object"
      ) {
        Object.entries(entry.custom_nutrients).forEach(([name, value]) => {
          if (
            value === null ||
            value === undefined ||
            String(value).trim() === ""
          ) {
            return; // Skip empty, null, or whitespace-only values
          }
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            totalCustomNutrients[name] =
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
      foods: componentFoodEntries.map((entry) => {
        const quantityToReturn = foodEntryMeal.meal_template_id 
          ? entry.quantity / (foodEntryMeal.quantity || 1)
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
      "error",
      `Error getting food entry meal ${foodEntryMealId} with components for user ${authenticatedUserId}:`,
      error,
    );
    throw error;
  }
}

async function getFoodEntryMealsByDate(
  authenticatedUserId,
  targetUserId,
  selectedDate,
) {
  log(
    "info",
    `getFoodEntryMealsByDate in foodEntryService: authenticatedUserId: ${authenticatedUserId}, targetUserId: ${targetUserId}, selectedDate: ${selectedDate}`,
  );
  try {
    const foodEntryMeals =
      await foodEntryMealRepository.getFoodEntryMealsByDate(
        targetUserId,
        selectedDate,
      );
    const mealsWithComponents = [];

    for (const meal of foodEntryMeals) {
      const componentFoodEntries =
        await foodRepository.getFoodEntryComponentsByFoodEntryMealId(
          meal.id,
          authenticatedUserId,
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
      let totalCustomNutrients = {};
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;
      let totalCarbsForGI = 0;
      let weightedGIAccumulator = 0;

      componentFoodEntries.forEach((entry) => {
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
          typeof entry.custom_nutrients === "object"
        ) {
          Object.entries(entry.custom_nutrients).forEach(([name, value]) => {
            if (
              value === null ||
              value === undefined ||
              String(value).trim() === ""
            ) {
              return; // Skip empty, null, or whitespace-only values
            }
            const numValue = Number(value);
            if (!isNaN(numValue)) {
              totalCustomNutrients[name] =
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
        foods: componentFoodEntries.map((entry) => ({
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
      "error",
      `Error getting food entry meals by date for user ${authenticatedUserId}:`,
      error,
    );
    throw error;
  }
}

async function deleteFoodEntryMeal(authenticatedUserId, foodEntryMealId) {
  log(
    "info",
    `deleteFoodEntryMeal in foodEntryService: authenticatedUserId: ${authenticatedUserId}, foodEntryMealId: ${foodEntryMealId}`,
  );
  try {
    // foodRepository.deleteFoodEntryComponentsByFoodEntryMealId will be called due to ON DELETE CASCADE
    // on the food_entries.food_entry_meal_id foreign key.
    const success = await foodEntryMealRepository.deleteFoodEntryMeal(
      foodEntryMealId,
      authenticatedUserId,
    );
    if (!success) {
      throw new Error("Food entry meal not found or not authorized to delete.");
    }
    return { message: "Food entry meal deleted successfully." };
  } catch (error) {
    log(
      "error",
      `Error deleting food entry meal ${foodEntryMealId} for user ${authenticatedUserId}:`,
      error,
    );
    throw error;
  }
}

module.exports = {
  createFoodEntry,
  deleteFoodEntry,
  updateFoodEntry,
  getFoodEntriesByDate,
  // getFoodEntriesByDateAndMealType, // This function is used internally by the service, no need to export
  getFoodEntriesByDateRange,
  copyFoodEntries,
  copyFoodEntriesFromYesterday,
  getDailyNutritionSummary,
  createFoodEntryMeal, // New export
  updateFoodEntryMeal, // New export
  getFoodEntryMealWithComponents, // New export
  getFoodEntryMealsByDate, // New export
  deleteFoodEntryMeal, // New export
};
