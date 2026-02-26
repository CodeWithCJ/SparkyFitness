import { apiCall } from '@/api/api';
import { setUserLoggingLevel } from '@/utils/userPreferences';
import {
  debug,
  info,
  warn,
  error,
  type UserLoggingLevel,
} from '@/utils/logging';
import {
  processFoodInput,
  addFoodOption,
} from '@/api/Chatbot/Chatbot_FoodHandler';
import { processExerciseInput } from '@/api/Chatbot/Chatbot_ExerciseHandler';
import { processMeasurementInput } from '@/api/Chatbot/Chatbot_MeasurementHandler';
import { processWaterInput } from '@/api/Chatbot/Chatbot_WaterHandler';
import { AIService } from '@/api/Settings/aiServiceSettingsService';
import { CoachResponse, FoodOption } from '@/types/Chatbot_types';
import { processChatInput } from '@/utils/Chatbot_utils';

export interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
}

export interface UserPreferences {
  auto_clear_history: 'never' | '7days' | 'all';
  logging_level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';
}

export const loadUserPreferences = async (): Promise<UserPreferences> => {
  const data = await apiCall(`/user-preferences`, {
    method: 'GET',
  });
  const preferences = data || {
    auto_clear_history: 'never',
    logging_level: 'WARN',
  };
  setUserLoggingLevel(preferences.logging_level);
  return preferences;
};

export const loadChatHistory = async (
  autoClearHistory: string
): Promise<Message[]> => {
  const params = new URLSearchParams({
    autoClearHistory,
  });
  const data = await apiCall(`/chat/sparky-chat-history?${params.toString()}`, {
    method: 'GET',
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((item: any) => {
    const timestamp = new Date(item.created_at);
    if (isNaN(timestamp.getTime())) {
      error('ERROR', `Invalid timestamp from DB: ${item.created_at}`); // Changed UserLoggingLevel.ERROR to 'ERROR'
    }
    return {
      id: item.id,
      content: item.content,
      isUser: item.message_type === 'user',
      timestamp: timestamp,
      metadata: item.metadata,
    };
  });
};

export const saveMessageToHistory = async (
  content: string,
  messageType: 'user' | 'assistant',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any
): Promise<void> => {
  await apiCall(`/chat/save-history`, {
    method: 'POST',
    body: { content, messageType, metadata },
  });
};

export const clearChatHistory = async (
  clearType: 'manual' | 'all'
): Promise<void> => {
  await apiCall(
    `/chat/${clearType === 'all' ? 'clear-all-history' : 'clear-old-history'}`,
    {
      method: 'POST',
      body: {}, // No body needed, user is identified by JWT
    }
  );
};

export const processUserInput = async (
  input: string,
  image: File | null,
  transactionId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastBotMessageMetadata: any,
  userLoggingLevel: UserLoggingLevel,
  formatDateInUserTimezone: (date: string | Date, formatStr?: string) => string,
  activeAIServiceSetting: AIService | null,
  messages: Message[],
  userDate: string
): Promise<CoachResponse> => {
  try {
    // Check if the current input is a follow-up to a previous food options prompt
    if (
      lastBotMessageMetadata?.foodOptions &&
      typeof input === 'string' &&
      !isNaN(parseInt(input))
    ) {
      const optionIndex = parseInt(input) - 1; // Convert to 0-based index
      info(
        userLoggingLevel,
        `[${transactionId}] Processing food option selection:`,
        optionIndex,
        lastBotMessageMetadata
      );
      return await addFoodOption(
        optionIndex,
        lastBotMessageMetadata,
        formatDateInUserTimezone,
        userLoggingLevel,
        transactionId
      );
    }

    let imageData = null;
    if (image) {
      imageData = await fileToBase64(image);
    }

    if (!activeAIServiceSetting) {
      throw new Error('Active AI service setting is missing.');
    }
    const aiResponse = await getAIResponse(
      input,
      imageData,
      transactionId,
      userLoggingLevel,
      activeAIServiceSetting as AIService,
      messages,
      userDate
    );

    // If the service returned an error (action: 'none'), return it directly
    if (aiResponse.action === 'none') {
      return aiResponse;
    }

    let parsedResponse: {
      intent: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any;
      response?: string;
      entryDate?: string;
    };
    try {
      const jsonMatch = aiResponse.response.match(/```json\n([\s\S]*?)\n```/);
      let jsonString = jsonMatch ? jsonMatch[1] : aiResponse.response;
      jsonString = stripJsonComments(jsonString); // Strip comments before parsing

      parsedResponse = JSON.parse(jsonString);
      info(
        userLoggingLevel,
        `[${transactionId}] Parsed AI response:`,
        parsedResponse
      );
    } catch (jsonError) {
      error(
        userLoggingLevel,
        `[${transactionId}] Failed to parse AI response as JSON:`,
        jsonError
      );
      return {
        action: 'advice',
        response:
          aiResponse.response || 'Sorry, I had trouble understanding that.',
      };
    }

    const determinedEntryDate = parsedResponse.entryDate
      ? extractDateFromInput(parsedResponse.entryDate, userDate)
      : extractDateFromInput(input, userDate);
    info(
      userLoggingLevel,
      `[${transactionId}] Determined entry date:`,
      determinedEntryDate
    );

    switch (parsedResponse.intent) {
      case 'log_food': {
        const foodResponse = await processFoodInput(
          parsedResponse.data,
          determinedEntryDate,
          formatDateInUserTimezone,
          userLoggingLevel,
          transactionId
        );

        if (
          foodResponse.action === 'none' &&
          foodResponse.metadata?.is_fallback
        ) {
          info(
            userLoggingLevel,
            `[${transactionId}] Food not found in DB, requesting AI options...`
          );
          const { foodName, unit, mealType, quantity, entryDate } =
            foodResponse.metadata;

          const foodOptions = await callAIForFoodOptions(
            foodName,
            unit,
            userLoggingLevel,
            activeAIServiceSetting as AIService
          );

          if (foodOptions.length > 0) {
            info(
              userLoggingLevel,
              `[${transactionId}] Received AI food options:`,
              foodOptions
            );
            const optionsResponse = foodOptions
              .map(
                (option: FoodOption, index: number) =>
                  `${index + 1}. ${option.name} (~${Math.round(option.calories || 0)} calories per ${option.serving_size}${option.serving_unit})`
              )
              .join('\n');

            return {
              action: 'food_options',
              response: `I couldn't find "${foodName}" in the database. Here are a few options. Please select one by number:\n\n${optionsResponse}`,
              metadata: {
                foodOptions: foodOptions,
                mealType: mealType,
                quantity: quantity,
                unit: unit,
                entryDate: entryDate,
              },
            };
          } else {
            error(
              userLoggingLevel,
              `[${transactionId}] Failed to generate food options via AI.`
            );
            return {
              action: 'none',
              response: `Sorry, I couldn't find "${foodName}" in the database and had trouble generating suitable options using the AI service. Please check your AI service configuration in settings or try a different food.`,
            };
          }
        } else {
          return foodResponse;
        }
      }

      case 'log_exercise':
        return await processExerciseInput(
          parsedResponse.data,
          determinedEntryDate,
          formatDateInUserTimezone,
          userLoggingLevel
        );
      case 'log_measurement':
      case 'log_measurements':
        return await processMeasurementInput(
          parsedResponse.data,
          determinedEntryDate,
          formatDateInUserTimezone,
          userLoggingLevel
        );
      case 'log_water': {
        // Map AI's glasses_consumed to quantity for processWaterInput
        const waterData = parsedResponse.data;
        if (waterData && waterData.glasses_consumed !== undefined) {
          waterData.quantity = waterData.glasses_consumed;
          delete waterData.glasses_consumed; // Remove the old key if necessary
        }
        return await processWaterInput(
          waterData,
          determinedEntryDate,
          formatDateInUserTimezone,
          userLoggingLevel,
          transactionId
        );
      }
      case 'ask_question':
      case 'chat':
        return await processChatInput(
          parsedResponse.data || {},
          parsedResponse.response,
          userLoggingLevel
        );
      default:
        warn(
          userLoggingLevel,
          `[${transactionId}] Unrecognized AI intent:`,
          parsedResponse.intent
        );
        return {
          action: 'none',
          response:
            parsedResponse.response ||
            "I'm not sure how to handle that request. Can you please rephrase?",
        };
    }
  } catch (err) {
    error(
      userLoggingLevel,
      `[${transactionId}] Error in processUserInput:`,
      err
    );
    return {
      action: 'none',
      response: 'An unexpected error occurred while processing your request.',
    };
  }
};

interface ChatBotNutrition {
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_dietary_fiber: number;
}
export const getTodaysNutrition = async (
  date: string
): Promise<ChatBotNutrition> => {
  const params = new URLSearchParams({ date });
  return apiCall(`/food-entries/nutrition/today?${params.toString()}`, {
    method: 'GET',
  });
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

const getAIResponse = async (
  input: string,
  imageData: string | null = null,
  transactionId: string,
  userLoggingLevel: UserLoggingLevel,
  activeAIServiceSetting: AIService,
  messages: Message[],
  userDate: string
): Promise<CoachResponse> => {
  try {
    debug(
      userLoggingLevel,
      `[${transactionId}] Calling getAIResponse with input:`,
      input
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messagesToSend: any[] = [];
    // Add previous messages for context, limiting to the last 10 for brevity
    const historyLimit = 10;
    const recentMessages = messages.slice(-historyLimit);

    recentMessages.forEach((msg) => {
      if (msg.isUser) {
        messagesToSend.push({
          role: 'user',
          content: [{ type: 'text', text: msg.content }],
        });
      } else {
        messagesToSend.push({
          role: 'assistant',
          content: [{ type: 'text', text: msg.content }],
        });
      }
    });

    // Add the current user message
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userMessageContent: any[] = [];
    if (input.trim()) {
      userMessageContent.push({ type: 'text', text: input.trim() });
    }
    if (imageData) {
      userMessageContent.push({
        type: 'image_url',
        image_url: { url: imageData },
      });
    }

    if (userMessageContent.length > 0) {
      messagesToSend.push({ role: 'user', content: userMessageContent });
    } else {
      return {
        action: 'none',
        response: 'Please provide text or an image.',
      };
    }

    const response = await apiCall('/chat', {
      method: 'POST',
      body: {
        messages: messagesToSend,
        service_config_id: activeAIServiceSetting.id,
        user_date: userDate,
      },
    });

    return {
      action: 'advice',
      response: response.content,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    error(userLoggingLevel, `[${transactionId}] Error in getAIResponse:`, err);
    if (err.message && err.message.includes('503')) {
      return {
        action: 'none',
        response:
          'The AI service is currently overloaded. Please try again in a few moments.',
      };
    }
    return {
      action: 'none',
      response:
        err.message ||
        'An unexpected error occurred while trying to get an AI response.',
    };
  }
};

const callAIForFoodOptions = async (
  foodName: string,
  unit: string,
  userLoggingLevel: UserLoggingLevel,
  activeAIServiceSetting: AIService
): Promise<FoodOption[]> => {
  try {
    const response = await apiCall('/chat/food-options', {
      method: 'POST',
      body: { foodName, unit, service_config_id: activeAIServiceSetting.id }, // Pass service_config_id
    });

    const aiResponseContent = response?.content;

    if (!aiResponseContent) {
      error(userLoggingLevel, 'No content received from AI for food options.');
      return [];
    }

    let foodOptionsJsonString = aiResponseContent;
    const jsonMatch = aiResponseContent.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      foodOptionsJsonString = jsonMatch[1];
    }

    try {
      const rawFoodOptions = JSON.parse(foodOptionsJsonString);

      const foodOptions: FoodOption[] = (
        Array.isArray(rawFoodOptions) ? rawFoodOptions : []
      )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((rawOption: any) => {
          debug(userLoggingLevel, 'Raw AI food option received:', rawOption);
          const mappedOption: FoodOption = {
            name: rawOption.food_name || rawOption.name || 'Unknown Food',
            calories: rawOption.calories || 0,
            protein: rawOption.macros?.protein || rawOption.protein || 0,
            carbs: rawOption.macros?.carbs || rawOption.carbs || 0,
            fat: rawOption.macros?.fat || rawOption.fat || 0,
            serving_size: parseFloat(rawOption.serving_size) || 1,
            serving_unit: rawOption.serving_unit || 'serving',
            saturated_fat:
              rawOption.macros?.saturated_fat || rawOption.saturated_fat,
            polyunsaturated_fat:
              rawOption.polyunsaturated_fat || rawOption.polyunsaturated_fat,
            monounsaturated_fat:
              rawOption.monounsaturated_fat || rawOption.monounsaturated_fat,
            trans_fat: rawOption.trans_fat || rawOption.trans_fat,
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
          debug(userLoggingLevel, 'Mapped food option:', mappedOption);
          return mappedOption;
        });

      if (
        foodOptions.every(
          (option) =>
            typeof option.name === 'string' &&
            typeof option.calories === 'number' &&
            typeof option.protein === 'number' &&
            typeof option.carbs === 'number' &&
            typeof option.fat === 'number' &&
            typeof option.serving_size === 'number' &&
            typeof option.serving_unit === 'string'
        )
      ) {
        return foodOptions;
      } else {
        error(
          userLoggingLevel,
          'Mapped food options failed validation:',
          foodOptions
        );
        return [];
      }
    } catch (jsonParseError) {
      error(
        userLoggingLevel,
        'Failed to parse or map JSON response for food options:',
        jsonParseError,
        foodOptionsJsonString
      );
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    error(userLoggingLevel, 'Error in callAIForFoodOptions:', err);
    return [];
  }
};

const extractDateFromInput = (
  input: string,
  userDate: string
): string | undefined => {
  const lowerInput = input.toLowerCase();
  const today = new Date(userDate); // Use user's date
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

  const dateMatch = lowerInput.match(
    /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/
  );
  if (dateMatch) {
    const month = parseInt(dateMatch[1], 10);
    const day = parseInt(dateMatch[2], 10);
    let year = today.getFullYear();

    if (dateMatch[3]) {
      year = parseInt(dateMatch[3], 10);
      if (year < 100) {
        year += 2000;
      }
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(year, month - 1, day);
      if (!dateMatch[3] && date > today) {
        date.setFullYear(year - 1);
      }
      return date.toISOString().split('T')[0];
    }
  }
  return undefined;
};

// Function to strip comments from a JSON string
function stripJsonComments(jsonString: string): string {
  // Remove single-line comments (// ...)
  let strippedString = jsonString.replace(/\/\/.*$/gm, '');
  // Remove multi-line comments (/* ... */)
  strippedString = strippedString.replace(/\/\*[\s\S]*?\*\//g, '');
  return strippedString;
}
