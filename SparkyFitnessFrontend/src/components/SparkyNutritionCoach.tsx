
import React, { forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from "react-i18next";
import { UserLoggingLevel, error, info, warn, debug } from "@/utils/logging";
import { apiCall } from "@/services/api";
import { CoachResponse, FoodOption, NutritionData } from "@/services/Chatbot/Chatbot_types";
import SparkyAIService from "@/components/SparkyAIService";
import { fileToBase64, saveMessageToHistory, clearHistory } from "@/services/Chatbot/Chatbot_utils";
import { processFoodInput, addFoodOption } from "@/services/Chatbot/Chatbot_FoodHandler";
import { processExerciseInput } from "@/services/Chatbot/Chatbot_ExerciseHandler";
import { processMeasurementInput } from "@/services/Chatbot/Chatbot_MeasurementHandler";
import { processWaterInput } from "@/services/Chatbot/Chatbot_WaterHandler";
import { processChatInput } from "@/services/Chatbot/Chatbot_ChatHandler";

const SparkyNutritionCoach = forwardRef<any, { userLoggingLevel: UserLoggingLevel; formatDateInUserTimezone: (date: string | Date, formatStr?: string) => string; energyUnit: 'kcal' | 'kJ'; convertEnergy: (value: number, fromUnit: 'kcal' | 'kJ', toUnit: 'kcal' | 'kJ') => number; getEnergyUnitString: (unit: 'kcal' | 'kJ') => string }>(({ userLoggingLevel, formatDateInUserTimezone, energyUnit, convertEnergy, getEnergyUnitString }, ref) => {
  const { t } = useTranslation();


  useImperativeHandle(ref, () => ({
    getTodaysNutrition,
    processUserInput: (input, imageFile, transactionId) => handleUserInput(input, imageFile, transactionId),
    addFoodOption: (optionIndex, originalMetadata, transactionId) => addFoodOption(optionIndex, originalMetadata, formatDateInUserTimezone, userLoggingLevel, transactionId),
    saveMessageToHistory: (content: string, messageType: 'user' | 'assistant', metadata?: any) => saveMessageToHistory(content, messageType, metadata),
    clearHistory: (autoClearPreference: string) => clearHistory(autoClearPreference)
  }));


  const getTodaysNutrition = async (date: string): Promise<NutritionData | null> => {
    try {

      // Get user's goals
      let goalsData = null;
      let goalsError = null;
      try {
        goalsData = await apiCall(`/goals/for-date?date=${date}`, { method: 'GET' });
      } catch (err: any) {
        goalsError = err;
      }

      if (goalsError) {
        error(userLoggingLevel, '❌ [Nutrition Coach] Error loading goals:', goalsError);
      }

      const goals = goalsData?.[0] || { calories: 2000, protein: 150, carbs: 250, fat: 67 };

      // Get today's food entries
      let foodEntries = null;
      let foodError = null;
      try {
        foodEntries = await apiCall(`/food-entries/${date}`, { method: 'GET' });
      } catch (err: any) {
        foodError = err;
      }

      if (foodError) {
        error(userLoggingLevel, '❌ [Nutrition Coach] Error loading food entries:', foodError);
        return null;
      }


      // Calculate nutrition totals
      const totals = (foodEntries || []).reduce((acc, entry) => {
        const food = entry.foods;
        if (!food) return acc;

        const servingSize = food.serving_size || 100;
        const ratio = entry.quantity / servingSize;

        acc.calories += (food.calories || 0) * ratio;
        acc.protein += (food.protein || 0) * ratio;
        acc.carbs += (food.carbs || 0) * ratio;
        acc.fat += (food.fat || 0) * ratio;

        return acc;
      }, { calories: 0, protein: 0, carbs: 0, fat: 0 });


      // Get exercise entries
      let exerciseEntries = null;
      try {
        exerciseEntries = await apiCall(`/exercise-entries/${date}`, { method: 'GET' });
      } catch (err: any) {
        error(userLoggingLevel, '❌ [Nutrition Coach] Error loading exercise entries:', err);
      }

      const exerciseCalories = (exerciseEntries || []).reduce((sum, entry) => sum + (entry.calories_burned || 0), 0);

      // Generate analysis
      const netCalories = totals.calories - exerciseCalories;
      const calorieProgress = Math.round((totals.calories / goals.calories) * 100);
      const proteinProgress = Math.round((totals.protein / goals.protein) * 100);

      let analysis = `📊 **${t('nutritionCoach.todaysProgress', "Today's Progress")} (${date}):**\n`;
      analysis += `• ${t('common.calories', 'Calories')}: ${Math.round(convertEnergy(totals.calories, 'kcal', energyUnit))}/${Math.round(convertEnergy(goals.calories, 'kcal', energyUnit))} (${calorieProgress}%) ${getEnergyUnitString(energyUnit)}\n`;
      analysis += `• ${t('common.protein', 'Protein')}: ${Math.round(totals.protein)}g/${goals.protein}g (${proteinProgress}%)\n`;
      analysis += `• ${t('common.carbs', 'Carbs')}: ${Math.round(totals.carbs)}g/${goals.carbs}g\n`;
      analysis += `• ${t('common.fat', 'Fat')}: ${Math.round(totals.fat)}g/${goals.fat}g\n`;
      if (exerciseCalories > 0) {
        analysis += `• ${t('common.exercise', 'Exercise')}: -${Math.round(convertEnergy(exerciseCalories, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)} ${t('common.burned', 'burned')}\n`;
        analysis += `• ${t('common.netCalories', 'Net Calories')}: ${Math.round(convertEnergy(netCalories, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)}
`;
      }

      // Generate tips
      let tips = '';
      if (calorieProgress < 70) {
        tips += '• You\'re under your calorie goal - consider adding a healthy snack\n';
      } else if (calorieProgress > 110) {
        tips += '• You\'re over your calorie goal - maybe add some exercise or lighter dinner\n';
      }

      if (proteinProgress < 70) {
        tips += '• Your protein intake is low - try adding lean meats, eggs, or protein shakes\n';
      }

      if ((foodEntries || []).length === 0) {
        analysis = `📝 **Ready to start your day!**\nNo entries yet for ${date}. Let's get tracking!`;
        tips = '• Tell me what you had for breakfast to get started\n• I can help you log food, exercise, and measurements\n• Just describe what you ate naturally - like "I had 2 eggs and toast"';
      }

      return {
        analysis,
        tips: tips || '• You\'re doing great! Keep up the good work\n• Remember to stay hydrated\n• Consider adding more vegetables to your meals',
        calories: totals.calories,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
        goals
      };
    } catch (err) {
      error(userLoggingLevel, '❌ [Nutrition Coach] Error getting nutrition data:', err);
      return null;
    }
  };

  const sparkyAIService = new SparkyAIService(energyUnit, convertEnergy, getEnergyUnitString); // Instantiate SparkyAIService with preferences

  const handleUserInput = async (input: string, imageFile: File | null = null, transactionId: string): Promise<CoachResponse> => {
    try {
      let imageData = null;
      if (imageFile) {
        imageData = await fileToBase64(imageFile);
      }

      // Use SparkyAIService to process the message
      const aiResponse = await sparkyAIService.processMessage(input);

      let parsedResponse: { intent: string; data: any; response?: string; entryDate?: string };
      try {
        // Extract JSON string from markdown code block if present
        const jsonMatch = aiResponse.content.match(/```json\n([\s\S]*?)\n```/);
        const jsonString = jsonMatch ? jsonMatch[1] : aiResponse.content;

        parsedResponse = JSON.parse(jsonString);
        info(userLoggingLevel, 'Parsed AI response:', parsedResponse);
      } catch (jsonError) {
        error(userLoggingLevel, '❌ [Nutrition Coach] Failed to parse AI response as JSON:', jsonError);
        // If JSON parsing fails, treat the entire response as a chat/advice response
        // Construct a CoachResponse with action 'advice'
        return {
          action: 'advice',
          response: aiResponse.content || 'Sorry, I had trouble understanding that.'
        };
      }

      // Resolve the date: prioritize AI's extracted date, fallback to manual extraction
      const determinedEntryDate = parsedResponse.entryDate ? extractDateFromInput(parsedResponse.entryDate) : extractDateFromInput(input);
      info(userLoggingLevel, 'Determined entry date:', determinedEntryDate);

      // Map AI intent to CoachResponse action and call appropriate handlers
      switch (parsedResponse.intent) {
        case 'log_food':
          const foodResponse = await processFoodInput(parsedResponse.data, determinedEntryDate, formatDateInUserTimezone, userLoggingLevel, transactionId);

          // Check if the food was not found in the database (fallback)
          if (foodResponse.action === 'none' && foodResponse.metadata?.is_fallback) {
            info(userLoggingLevel, 'Food not found in DB, requesting AI options...');
            const { foodName, unit, mealType, quantity, entryDate } = foodResponse.metadata;

            // Request food options from AI via SparkyAIService
            const foodOptions = await callAIForFoodOptions(foodName, unit);

            if (foodOptions.length > 0) {
              info(userLoggingLevel, 'Received AI food options:', foodOptions);
              // Format the options for the user
              const optionsResponse = foodOptions.map((option: FoodOption, index: number) =>
                `${index + 1}. ${option.name} (~${Math.round(convertEnergy(option.calories || 0, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)} per ${option.serving_size}${option.serving_unit})`
              ).join('\n');

              // Return a CoachResponse with action 'food_options'
              return {
                action: 'food_options',
                response: `I couldn't find "${foodName}" in the database. Here are a few options. Please select one by number:\n\n${optionsResponse}`,
                metadata: {
                  foodOptions: foodOptions, // Include the generated options
                  mealType: mealType,
                  quantity: quantity,
                  unit: unit,
                  entryDate: entryDate
                }
              };
            } else {
              error(userLoggingLevel, 'Failed to generate food options via AI.');
              // Fallback if AI options couldn't be generated
              return {
                action: 'none',
                response: `Sorry, I couldn't find "${foodName}" in the database and had trouble generating suitable options using the AI service. Please check your AI service configuration in settings or try a different food.`
              };
            }
          } else {
            // If food was found and logged, or another issue occurred, return the original response
            return foodResponse;
          }

        case 'log_exercise':
          return await processExerciseInput(parsedResponse.data, determinedEntryDate, formatDateInUserTimezone, userLoggingLevel);
        case 'log_measurement':
          return await processMeasurementInput(parsedResponse.data, determinedEntryDate, formatDateInUserTimezone, userLoggingLevel);
        case 'log_water':
          return await processWaterInput(parsedResponse.data, determinedEntryDate, formatDateInUserTimezone, userLoggingLevel, transactionId);
        case 'ask_question':
        case 'chat':
          // For chat/ask_question, the response is already in parsedResponse.response
          // We should ensure data is an empty object if not provided by AI
          // processChatInput returns a CoachResponse with action 'advice' or 'chat'
          return await processChatInput(parsedResponse.data || {}, parsedResponse.response, userLoggingLevel); // Chat doesn't need entryDate
        default:
          warn(userLoggingLevel, '⚠️ [Nutrition Coach] Unrecognized AI intent:', parsedResponse.intent);
          // For unrecognized intent, return a CoachResponse with action 'none'
          return {
            action: 'none',
            response: parsedResponse.response || 'I\'m not sure how to handle that request. Can you please rephrase?'
          };
      }

    } catch (err) {
      error(userLoggingLevel, '❌ [Nutrition Coach] Error in processUserInput:', err);
      return {
        action: 'none',
        response: 'An unexpected error occurred while processing your request.'
      };
    }
  };

  const callAIForFoodOptions = async (foodName: string, unit: string): Promise<FoodOption[]> => {
    try {
      // Construct the specific message for food option generation
      const userMessageContent = `GENERATE_FOOD_OPTIONS:${foodName} in ${unit}`;

      // Use SparkyAIService to process the message for food options
      const aiResponse = await sparkyAIService.processMessage(userMessageContent);

      if (!aiResponse || !aiResponse.content) {
        error(userLoggingLevel, '❌ [Nutrition Coach] No content received from AI for food options.');
        return [];
      }

      let foodOptionsJsonString = aiResponse.content;
      // Extract JSON string from markdown code block if present
      const jsonMatch = aiResponse.content.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        foodOptionsJsonString = jsonMatch[1];
      }

      try {
        // Attempt to parse the JSON response
        const rawFoodOptions = JSON.parse(foodOptionsJsonString);

        // Map the raw AI response to the FoodOption interface
        const foodOptions: FoodOption[] = (Array.isArray(rawFoodOptions) ? rawFoodOptions : []).map((rawOption: any) => {
          debug(userLoggingLevel, 'Raw AI food option received:', rawOption); // Changed to debug for more detailed info
          const mappedOption: FoodOption = {
            name: rawOption.food_name || rawOption.name || 'Unknown Food', // Map food_name or name to name
            calories: rawOption.calories || 0,
            protein: rawOption.macros?.protein || rawOption.protein || 0,
            carbs: rawOption.macros?.carbs || rawOption.carbs || 0,
            fat: rawOption.macros?.fat || rawOption.fat || 0,
            serving_size: parseFloat(rawOption.serving_size) || 1,
            serving_unit: rawOption.serving_unit || 'serving',
            saturated_fat: rawOption.macros?.saturated_fat || rawOption.saturated_fat,
            polyunsaturated_fat: rawOption.macros?.polyunsaturated_fat || rawOption.polyunsaturated_fat,
            monounsaturated_fat: rawOption.macros?.monounsaturated_fat || rawOption.monounsaturated_fat,
            trans_fat: rawOption.macros?.trans_fat || rawOption.trans_fat,
            cholesterol: rawOption.cholesterol,
            sodium: rawOption.sodium,
            potassium: rawOption.potassium,
            dietary_fiber: rawOption.dietary_fiber,
            sugars: rawOption.sugars,
            vitamin_a: rawOption.vitamin_a,
            vitamin_c: rawOption.vitamin_c,
            calcium: rawOption.calcium,
            iron: rawOption.iron,
          };
          debug(userLoggingLevel, 'Mapped food option:', mappedOption); // Changed to debug
          return mappedOption;
        });

        // Basic validation to ensure the mapped objects have expected properties
        if (foodOptions.every(option =>
          typeof option.name === 'string' &&
          typeof option.calories === 'number' &&
          typeof option.protein === 'number' &&
          typeof option.carbs === 'number' &&
          typeof option.fat === 'number' &&
          typeof option.serving_size === 'number' &&
          typeof option.serving_unit === 'string' &&
          (option.saturated_fat === undefined || typeof option.saturated_fat === 'number') &&
          (option.polyunsaturated_fat === undefined || typeof option.polyunsaturated_fat === 'number') &&
          (option.monounsaturated_fat === undefined || typeof option.monounsaturated_fat === 'number') &&
          (option.trans_fat === undefined || typeof option.trans_fat === 'number') &&
          (option.cholesterol === undefined || typeof option.cholesterol === 'number') &&
          (option.sodium === undefined || typeof option.sodium === 'number') &&
          (option.potassium === undefined || typeof option.potassium === 'number') &&
          (option.dietary_fiber === undefined || typeof option.dietary_fiber === 'number') &&
          (option.sugars === undefined || typeof option.sugars === 'number') &&
          (option.vitamin_a === undefined || typeof option.vitamin_a === 'number') &&
          (option.vitamin_c === undefined || typeof option.vitamin_c === 'number') &&
          (option.calcium === undefined || typeof option.calcium === 'number') &&
          (option.iron === undefined || typeof option.iron === 'number')
        )) {
          return foodOptions;
        } else {
          error(userLoggingLevel, '❌ [Nutrition Coach] Mapped food options failed validation:', foodOptions);
          return [];
        }
      } catch (jsonParseError) {
        error(userLoggingLevel, '❌ [Nutrition Coach] Failed to parse or map JSON response for food options:', jsonParseError, foodOptionsJsonString);
        return []; // Return empty array if JSON parsing or mapping fails
      }

    } catch (err) {
      error(userLoggingLevel, '❌ [Nutrition Coach] Error in callAIForFoodOptions:', err);
      return []; // Return empty array on any other error
    }
  };

  // Helper function to extract and resolve date from input string
  const extractDateFromInput = (input: string): string | undefined => {
    const lowerInput = input.toLowerCase();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (lowerInput.includes('today')) {
      return today.toISOString().split('T')[0];
    } else if (lowerInput.includes('yesterday')) {
      return yesterday.toISOString().split('T')[0];
    } else if (lowerInput.includes('tomorrow')) {
      return tomorrow.toISOString().split('T')[0];
    }

    // Basic handling for MM-DD or YYYY-MM-DD format
    const dateMatch = lowerInput.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
    if (dateMatch) {
      const month = parseInt(dateMatch[1], 10);
      const day = parseInt(dateMatch[2], 10);
      let year = today.getFullYear(); // Default to current year

      if (dateMatch[3]) {
        year = parseInt(dateMatch[3], 10);
        if (year < 100) { // Handle 2-digit year
          year += 2000; // Assume 21st century
        }
      }

      // Basic validation
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const date = new Date(year, month - 1, day);
        // Check if the year was inferred and the date is in the future,
        // if so, assume the user meant a past year.
        if (!dateMatch[3] && date > today) {
          date.setFullYear(year - 1);
        }
        return date.toISOString().split('T')[0];
      }
    }


    return undefined; // Return undefined if no recognizable date is found
  };


  return null; // This component doesn't render anything
});

SparkyNutritionCoach.displayName = 'SparkyNutritionCoach';

export default SparkyNutritionCoach;
