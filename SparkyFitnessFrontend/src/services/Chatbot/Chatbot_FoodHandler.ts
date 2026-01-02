import { parseISO } from 'date-fns'; // Import parseISO
import { CoachResponse, FoodOption } from './Chatbot_types'; // Import types
import { debug, info, warn, error, UserLoggingLevel } from '@/utils/logging'; // Import logging utility
import { apiCall } from '../api'; // Import apiCall

import SparkyAIService from '@/components/SparkyAIService'; // Import SparkyAIService

const sparkyAIService = new SparkyAIService(); // Create an instance of SparkyAIService
// Function to process food input
export const processFoodInput = async (data: {
  food_name: string;
  quantity: number;
  unit: string;
  meal_type: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  foodOptions?: FoodOption[]; // Add foodOptions here
}, entryDate: string | undefined, formatDateInUserTimezone: (date: string | Date, formatStr?: string) => string, userLoggingLevel: UserLoggingLevel, transactionId: string): Promise<CoachResponse> => {
  try {
    debug(userLoggingLevel, `[${transactionId}] Processing food input with data:`, data, 'and entryDate:', entryDate);

    const { food_name, quantity, unit, meal_type: raw_meal_type, foodOptions, ...nutritionData } = data; // Destructure, also check for foodOptions array
    // Standardize meal type: convert 'snack' to 'snacks' to match potential database constraint
    const meal_type = raw_meal_type?.toLowerCase() === 'snack' ? 'snacks' : raw_meal_type;
    // Parse the entryDate string into a Date object in the user's timezone, then format it back to YYYY-MM-DD for DB insertion
    // If entryDate is not provided by AI, use today's date in user's timezone
    const dateToUse = formatDateInUserTimezone(entryDate ? parseISO(entryDate) : new Date(), 'yyyy-MM-dd');

    // Check if the data already contains food options from the AI
    if (foodOptions && Array.isArray(foodOptions) && foodOptions.length > 0) {
      info(userLoggingLevel, 'Received food options from AI:', foodOptions);
      // Return food options to the user
      const optionsResponse = foodOptions.map((option: FoodOption, index: number) =>
        `${index + 1}. ${option.name} (~${Math.round(option.calories || 0)} calories per ${option.serving_size}${option.serving_unit})`
      ).join('\n');

      return {
        action: 'food_options',
        response: `I couldn't find "${food_name}" in the database. Here are a few options. Please select one by number:\n\n${optionsResponse}`,
        metadata: {
          foodOptions: foodOptions,
          mealType: meal_type,
          quantity: quantity,
          unit: unit, // Pass the original unit from user input
          entryDate: dateToUse // Pass the determined date
        }
      };
    }

    // If no food options array, proceed with database search
    debug(userLoggingLevel, 'No food options array received, searching database for:', food_name);

    // Search for exact match first (case-insensitive)
    debug(userLoggingLevel, 'Searching for exact food match:', food_name);
    let exactFoods = null;
    try {
      exactFoods = await apiCall(`/foods/search?name=${encodeURIComponent(food_name)}&exactMatch=true`, {
        method: 'GET',
      });
    } catch (err: any) {
      error(userLoggingLevel, '❌ [Nutrition Coach] Error searching for exact food match:', err);
      // Continue even if search fails, will try broad search
    }

    debug(userLoggingLevel, 'Exact search results:', exactFoods);

    let existingFoods = exactFoods;
    let broadError = null;

    // If no exact match found, try a broader case-insensitive search
    if (!existingFoods || existingFoods.length === 0) {
      debug(userLoggingLevel, 'No exact match found, searching broadly for:', food_name);
      let broadFoods = null;
      try {
        broadFoods = await apiCall(`/foods/search?name=${encodeURIComponent(food_name)}&broadMatch=true`, {
          method: 'GET',
        });
      } catch (err: any) {
        error(userLoggingLevel, '❌ [Nutrition Coach] Error searching for broad food match:', err);
        // Continue even if broad search fails
      }
      debug(userLoggingLevel, 'Broad search results:', broadFoods);
      existingFoods = broadFoods;
    }


    debug(userLoggingLevel, 'Final search results:', existingFoods);

    if (existingFoods && existingFoods.length > 0) {
      info(userLoggingLevel, 'Food found in database.');
      // Food exists, add it directly
      // Prioritize exact match if found, otherwise use the first broad match
      const food = exactFoods?.length > 0 ? exactFoods[0] : existingFoods[0];
      debug(userLoggingLevel, 'Using food:', food);

      // Check unit mismatch first. If mismatch, return fallback without inserting.
      if (unit && food.default_variant && food.default_variant.serving_unit && unit.toLowerCase() !== food.default_variant.serving_unit.toLowerCase()) {
          warn(userLoggingLevel, `Unit mismatch: User requested '${quantity}${unit}' but database serving unit is '${food.default_variant.serving_size}${food.default_variant.serving_unit}'. Triggering AI options.`);
          return {
              action: 'none', // Indicate that no food was added directly
              response: `I found "${food.name}" in the database, but its primary serving unit is "${food.default_variant.serving_unit}". I'll check for other options.`, // Provide feedback
              metadata: {
                  is_fallback: true, // Flag to indicate fallback to AI for options
                  foodName: food_name, // Pass the food name
                  unit: unit, // Pass the original unit
                  mealType: meal_type, // Pass the meal type
                  quantity: quantity, // Pass the quantity
                  entryDate: dateToUse // Pass the determined date
              }
          };
      }

      // If no unit mismatch, proceed with insertion
      info(userLoggingLevel, 'Inserting food entry...');
      let insertError = null;
      try {
        await apiCall('/food-entries', {
          method: 'POST',
          body: {
food_id: food.id,
            meal_type: meal_type,
            quantity: quantity,
            unit: food.default_variant.serving_unit, // Use the default variant's serving unit
            entry_date: dateToUse,
            variant_id: food.default_variant.id // Populate variant_id
          }
        });
      } catch (err: any) {
        error(userLoggingLevel, '❌ [Nutrition Coach] Error adding food entry:', err);
        return {
          action: 'none',
          response: 'Sorry, I couldn\'t add that to your diary. Please try again.'
        };
      }

      info(userLoggingLevel, 'Food entry inserted successfully.');

      const calories = Math.round((food.default_variant.calories || 0) * (quantity / (food.default_variant.serving_size || 100)));

      return {
        action: 'food_added',
        response: `✅ **Added to your ${meal_type} on ${formatDateInUserTimezone(dateToUse, 'PPP')}!**\n\n🍽️ ${food.name} (${quantity}${unit})\n📊 ~${calories} calories\n\n💡 Great choice! This adds ${Math.round(food.default_variant.protein || 0)}g protein to your day.`
      };
    } else {
      info(userLoggingLevel, 'Food not found in database. Returning fallback data.');
      // Food not found, return a response indicating this,
      // and include the original data for the coach to request AI options.
      return {
        action: 'none', // Indicate that no food was added
        response: `Food "${food_name}" not found in database.`, // Provide feedback
        metadata: {
          is_fallback: true, // Flag to indicate fallback
          foodName: food_name, // Pass the food name
          unit: unit, // Pass the original unit
          mealType: meal_type, // Pass the meal type
          quantity: quantity, // Pass the quantity
          entryDate: dateToUse // Pass the determined date
        }
      };
    }
 } catch (err) {
    error(userLoggingLevel, '❌ [Nutrition Coach] Error processing food input:', err);
    error(userLoggingLevel, 'Full error details:', err);
    return {
      action: 'none',
      response: 'Sorry, I had trouble processing that. Could you try rephrasing what you ate?'
    };
  }
};

// Function to add a selected food option to the diary
export const addFoodOption = async (optionIndex: number, originalMetadata: any, formatDateInUserTimezone: (date: string | Date, formatStr?: string) => string, userLoggingLevel: UserLoggingLevel, transactionId: string): Promise<CoachResponse> => {
  try {
    const { foodOptions, mealType, quantity, unit, entryDate } = originalMetadata;
    const selectedOption = foodOptions[optionIndex];

    if (!selectedOption) {
      error(userLoggingLevel, `[${transactionId}] Invalid option index:`, optionIndex);
      return {
        action: 'none',
        response: 'Invalid option selected. Please try again.'
      };
    }

    // Parse the entryDate string from originalMetadata into a Date object in the user's timezone, then format it back to YYYY-MM-DD for DB insertion
    const dateToUse = formatDateInUserTimezone(entryDate ? parseISO(entryDate) : new Date(), 'yyyy-MM-dd');

    let foodId: string;
    let variantId: string | null = null;

    // 1. Check if the food name already exists in the 'foods' table for the user
    let existingFoods = null;
    try {
      existingFoods = await apiCall(`/foods/search?name=${encodeURIComponent(selectedOption.name)}&exactMatch=true&checkCustom=true`, {
        method: 'GET',
      });
    } catch (err: any) {
      error(userLoggingLevel, `[${transactionId}] Error fetching existing food:`, err);
      return {
        action: 'none',
        response: 'Sorry, I had trouble checking for existing food. Please try again.'
      };
    }

    const foodToUse = existingFoods && existingFoods.length > 0 ? existingFoods[0] : null;

    if (foodToUse) {
        foodId = foodToUse.id;
        // Check if the selected option's unit is the same as the base food's unit
        if (selectedOption.serving_unit.toLowerCase() === foodToUse.serving_unit.toLowerCase()) {
            info(userLoggingLevel, `[${transactionId}] Selected option unit matches base food unit. Logging as base food.`);
            variantId = null; // No variant needed for the base unit
        } else {
            // Selected option unit is different from base food unit, check/create variant
            let existingVariant = null;
            try {
              existingVariant = await apiCall(`/food-variants?food_id=${foodId}&serving_unit=${encodeURIComponent(selectedOption.serving_unit)}`, {
                method: 'GET',
              });
            } catch (err: any) {
              error(userLoggingLevel, `[${transactionId}] Error fetching existing variant:`, err);
              return {
                action: 'none',
                response: 'Sorry, I had trouble checking for existing food variants. Please try again.'
              };
            }

            if (existingVariant && existingVariant.length > 0) {
                // Variant already exists, use its ID
                variantId = existingVariant[0].id;
                info(userLoggingLevel, `[${transactionId}] Existing food variant found:`, variantId);
            } else {
                // Food exists, but this specific variant does not. Create a new variant.
                info(userLoggingLevel, `[${transactionId}] Creating new food variant for existing food:`, selectedOption.name);
                let newVariant = null;
                try {
                  newVariant = await apiCall('/food-variants', {
                    method: 'POST',
                    body: {
                      food_id: foodId,
                      serving_size: selectedOption.serving_size,
                      serving_unit: selectedOption.serving_unit,
                      calories: selectedOption.calories,
                      protein: selectedOption.protein,
                      carbs: selectedOption.carbs,
                      fat: selectedOption.fat,
                      saturated_fat: selectedOption.saturated_fat,
                      polyunsaturated_fat: selectedOption.polyunsaturated_fat,
                      monounsaturated_fat: selectedOption.monounsaturated_fat,
                      trans_fat: selectedOption.trans_fat,
                      cholesterol: selectedOption.cholesterol,
                      sodium: selectedOption.sodium,
                      potassium: selectedOption.potassium,
                      dietary_fiber: selectedOption.dietary_fiber,
                      sugars: selectedOption.sugars,
                      vitamin_a: selectedOption.vitamin_a,
                      vitamin_c: selectedOption.vitamin_c,
                      calcium: selectedOption.calcium,
                      iron: selectedOption.iron,
                    }
                  });
                } catch (err: any) {
                  error(userLoggingLevel, `[${transactionId}] Error creating food variant:`, err);
                  return {
                    action: 'none',
                    response: 'Sorry, I couldn\'t create that food variant. Please try again.'
                  };
                }
                variantId = newVariant.id;
            }
        }
    } else {
        // Food does not exist in the 'foods' table. Create a new food entry.
        info(userLoggingLevel, `[${transactionId}] Creating new food entry:`, selectedOption.name);
        let newFood = null;
        try {
          newFood = await apiCall('/foods', {
            method: 'POST',
            body: {
              name: selectedOption.name,
              calories: selectedOption.calories,
              protein: selectedOption.protein,
              carbs: selectedOption.carbs,
              fat: selectedOption.fat,
              serving_size: selectedOption.serving_size,
              serving_unit: selectedOption.serving_unit,
              saturated_fat: selectedOption.saturated_fat,
              polyunsaturated_fat: selectedOption.polyunsaturated_fat,
              monounsaturated_fat: selectedOption.monounsaturated_fat,
              trans_fat: selectedOption.trans_fat,
              cholesterol: selectedOption.cholesterol,
              sodium: selectedOption.sodium,
              potassium: selectedOption.potassium,
              dietary_fiber: selectedOption.dietary_fiber,
              sugars: selectedOption.sugars,
              vitamin_a: selectedOption.vitamin_a,
              vitamin_c: selectedOption.vitamin_c,
              calcium: selectedOption.calcium,
              iron: selectedOption.iron,
              is_custom: true,
            }
          });
        } catch (err: any) {
          error(userLoggingLevel, `[${transactionId}] Error creating food:`, err);
          return {
            action: 'none',
            response: 'Sorry, I couldn\'t create that food. Please try again.'
          };
        }
        foodId = newFood.id;
        variantId = newFood.default_variant.id; // Set variantId to the ID of the newly created default variant
    }

    // Then, add it to the diary
    debug(userLoggingLevel, `[${transactionId}] Preparing to insert food entry. Selected Option:`, selectedOption);
    debug(userLoggingLevel, `[${transactionId}] Food Entry Details:`, {
        foodId,
        mealType,
        quantity,
        unit,
        entryDate: dateToUse,
        variantId
    });
    let entryError = null;
    try {
      await apiCall('/food-entries', {
        method: 'POST',
        body: {
          food_id: foodId,
          meal_type: mealType,
          quantity: quantity,
          unit: selectedOption.serving_unit,
          entry_date: dateToUse,
          variant_id: variantId
        }
      });
    } catch (err: any) {
      error(userLoggingLevel, `[${transactionId}] Error creating food entry:`, err);
      return {
        action: 'none',
        response: 'I created the food/variant but couldn\'t add it to your diary. Please try again.'
      };
    }
    info(userLoggingLevel, `[${transactionId}] Food entry inserted successfully.`);

    const calories = Math.round((selectedOption.calories || 0) * (quantity / (selectedOption.serving_size || 100)));

    return {
        action: 'food_added',
        response: `✅ **Added to your ${mealType} on ${formatDateInUserTimezone(dateToUse, 'PPP')}!**\n\n🍽️ ${selectedOption.name} (${quantity}${unit})\n📊 ~${calories} calories\n\n💡 Great choice! This adds ${Math.round(selectedOption.protein || 0)}g protein to your day.`
    };

  } catch (err) {
    error(userLoggingLevel, `[${transactionId}] Error in addFoodOption:`, err);
    return {
      action: 'none',
      response: 'Sorry, I encountered an error adding that food. Please try again.'
    };
  }
};

