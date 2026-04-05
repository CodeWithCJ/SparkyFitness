import * as chatRepository from '../models/chatRepository';
import * as userRepository from '../models/userRepository';
import * as measurementRepository from '../models/measurementRepository';
import { log } from '../config/logging';
import { getDefaultModel } from '../ai/config';
import { Agent } from 'undici';
const { loadUserTimezone } = require('../utils/timezoneLoader');
const { todayInZone } = require('@workspace/shared');

export async function handleAiServiceSettings(
  action: any,
  serviceData: any,
  authenticatedUserId: any
) {
  try {
    if (action === 'save_ai_service_settings') {
      serviceData.user_id = authenticatedUserId; // Ensure user_id is set from authenticated user
      // Allow creating services without API keys - they can be added later via update
      // API key validation happens when actually using the service (in processChatMessage)
      // This enables the override workflow where users create a service and add API key later
      const result = await chatRepository.upsertAiServiceSetting(serviceData);
      if (!result) {
        throw new Error('AI service setting not found.');
      }
      const { encrypted_api_key, api_key_iv, api_key_tag, ...safeSetting } =
        result;
      return {
        message: 'AI service settings saved successfully.',
        setting: safeSetting,
      };
    }
    // Add other actions if needed in the future
    throw new Error('Unsupported action for AI service settings.');
  } catch (error) {
    log(
      'error',
      `Error handling AI service settings for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

export async function getAiServiceSettings(
  authenticatedUserId: string,
  targetUserId: string
) {
  try {
    const settings =
      await chatRepository.getAiServiceSettingsByUserId(targetUserId);
    return settings || []; // Return empty array if no settings found
  } catch (error) {
    log(
      'error',
      `Error fetching AI service settings for user ${targetUserId} by ${authenticatedUserId}:`,
      error
    );
    return []; // Return empty array on error
  }
}

export async function getActiveAiServiceSetting(
  authenticatedUserId: string,
  targetUserId: string
) {
  try {
    const setting =
      await chatRepository.getActiveAiServiceSetting(targetUserId);
    if (setting) {
      const source = setting.source || 'unknown';
      log(
        'info',
        `Active AI service setting for user ${targetUserId} (source: ${source})`
      );
    }
    return setting; // Returns null if no active setting found
  } catch (error) {
    log(
      'error',
      `Error fetching active AI service setting for user ${targetUserId} by ${authenticatedUserId}:`,
      error
    );
    return null; // Return null on error
  }
}

export async function deleteAiServiceSetting(
  authenticatedUserId: string,
  id: string
) {
  try {
    // Verify that the setting belongs to the authenticated user before deleting
    const setting = await chatRepository.getAiServiceSettingById(
      id,
      authenticatedUserId
    );
    if (!setting) {
      throw new Error('AI service setting not found.');
    }
    const success = await chatRepository.deleteAiServiceSetting(
      id,
      authenticatedUserId
    );
    if (!success) {
      throw new Error('AI service setting not found.');
    }
    return { message: 'AI service setting deleted successfully.' };
  } catch (error) {
    log(
      'error',
      `Error deleting AI service setting ${id} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

export async function clearOldChatHistory(authenticatedUserId: string) {
  try {
    await chatRepository.clearOldChatHistory(authenticatedUserId);
    return { message: 'Old chat history cleared successfully.' };
  } catch (error) {
    log(
      'error',
      `Error clearing old chat history for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

export async function getSparkyChatHistory(
  authenticatedUserId: string,
  targetUserId: string
) {
  try {
    const history = await chatRepository.getChatHistoryByUserId(targetUserId);
    return history;
  } catch (error) {
    log(
      'error',
      `Error fetching chat history for user ${targetUserId} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

export async function getSparkyChatHistoryEntry(
  authenticatedUserId: string,
  id: string
) {
  try {
    const entryOwnerId = await chatRepository.getChatHistoryEntryOwnerId(
      id,
      authenticatedUserId
    );
    if (!entryOwnerId) {
      throw new Error('Chat history entry not found.');
    }
    const entry = await chatRepository.getChatHistoryEntryById(
      id,
      authenticatedUserId
    );
    return entry;
  } catch (error) {
    log(
      'error',
      `Error fetching chat history entry ${id} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

export async function updateSparkyChatHistoryEntry(
  authenticatedUserId: any,
  id: any,
  updateData: any
) {
  try {
    const entryOwnerId = await chatRepository.getChatHistoryEntryOwnerId(id, authenticatedUserId);
    if (!entryOwnerId) {
      throw new Error('Chat history entry not found.');
    }
    if (entryOwnerId !== authenticatedUserId) {
      throw new Error(
        'Forbidden: You do not have permission to update this chat history entry.'
      );
    }
    const updatedEntry = await chatRepository.updateChatHistoryEntry(
      id,
      authenticatedUserId,
      updateData
    );
    if (!updatedEntry) {
      throw new Error(
        'Chat history entry not found or not authorized to update.'
      );
    }
    return updatedEntry;
  } catch (error) {
    log(
      'error',
      `Error updating chat history entry ${id} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

export async function deleteSparkyChatHistoryEntry(
  authenticatedUserId: string,
  id: string
) {
  try {
    const entryOwnerId = await chatRepository.getChatHistoryEntryOwnerId(id, authenticatedUserId);
    if (!entryOwnerId) {
      throw new Error('Chat history entry not found.');
    }
    if (entryOwnerId !== authenticatedUserId) {
      throw new Error(
        'Forbidden: You do not have permission to delete this chat history entry.'
      );
    }
    const success = await chatRepository.deleteChatHistoryEntry(
      id,
      authenticatedUserId
    );
    if (!success) {
      throw new Error('Chat history entry not found.');
    }
    return { message: 'Chat history entry deleted successfully.' };
  } catch (error) {
    log(
      'error',
      `Error deleting chat history entry ${id} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

export async function clearAllSparkyChatHistory(authenticatedUserId: string) {
  try {
    await chatRepository.clearAllChatHistory(authenticatedUserId);
    return { message: 'All chat history cleared successfully.' };
  } catch (error) {
    log(
      'error',
      `Error clearing all chat history for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

export async function saveSparkyChatHistory(
  authenticatedUserId: string,
  historyData: any
) {
  try {
    // Ensure the history is saved for the authenticated user
    historyData.user_id = authenticatedUserId;
    await chatRepository.saveChatMessage(
      historyData.user_id,
      historyData.content,
      historyData.messageType,
      historyData.metadata
    );
    return { message: 'Chat history saved successfully.' };
  } catch (error) {
    log(
      'error',
      `Error saving chat history for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

export async function processChatMessage(
  messages: any,
  serviceConfigId: any,
  authenticatedUserId: any
) {
  try {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Invalid messages format.');
    }
    if (!serviceConfigId) {
      // Check if serviceConfigId is provided
      throw new Error('AI service configuration ID is missing.');
    }

    const aiService = await chatRepository.getAiServiceSettingForBackend(
      serviceConfigId,
      authenticatedUserId
    );
    if (!aiService) {
      throw new Error('AI service setting not found for the provided ID.');
    }

    // Log which source was used
    const source = aiService.source || 'unknown';
    log(
      'info',
      `Processing chat message for user ${authenticatedUserId} using AI service from ${source} (ID: ${serviceConfigId})`
    );

    // Ensure API key is present, unless it's Ollama
    if (aiService.service_type !== 'ollama' && !aiService.api_key) {
      throw new Error('API key missing for selected AI service.');
    }

    let response;
    const model =
      aiService.model_name || getDefaultModel(aiService.service_type);

    // Comprehensive system prompt from old Supabase Edge Function
    // Fetch user's custom categories to provide context to the AI
    const [customCategories, chatTz] = await Promise.all([
      measurementRepository.getCustomCategories(authenticatedUserId),
      loadUserTimezone(authenticatedUserId),
    ]);
    const customCategoriesList =
      customCategories.length > 0
        ? customCategories
            .map(
              (cat) =>
                `- ${cat.name} (${cat.measurement_type}, ${cat.frequency})`
            )
            .join('\n')
        : 'None';

    const systemPromptContent = `You are Sparky, an AI nutrition/wellness Telegram coach.
Goal: Track food, exercise, measurements, and provide brief, actionable advice.
Date: ${todayInZone(chatTz)}.

**CORE RULES:**
1. **Brevity & Style:** Keep responses concise. Use Telegram HTML formatting (<b>, <i>, <code>) and emojis in the 'response' field.
2. **Context:** Use [SYSTEM CONTEXT: RECENT PROGRESS] for insights. Don't ask for data already provided.
3. **Dates:** Extract explicitly mentioned dates/times to the root 'entryDate' field ("today", "yesterday", "MM-DD", "YYYY-MM-DD"). Do NOT resolve relative dates to full dates. Omit if none.
4. **Water is NOT Food:** NEVER log water under 'log_food'. ALWAYS use 'log_water'.
5. **Images:**
   - Extract food/exercise, estimate quantity, unit, and meal_type.
   - **CRITICAL:** Always infer detailed nutrition based on the photo. Do not default to 0.
   - **MISSING DATA:** If a photo lacks clear portion size (food) or duration (exercise), output 'ask_question' intent to clarify. Do NOT guess completely ambiguous sizes.
6. **Units & Custom Names:**
   - Convert counts ("2 apples") to unit "piece". Match user units ("g", "cup"). Infer if missing.
   - For custom measurements, strictly match names from this list: ${customCategoriesList}.
7. **History Requests:** If the user asks for historical data (e.g., "what did I eat", "last 10 workouts", "my recent meals") AND the data is NOT already provided in the SYSTEM UPDATE context, you MUST return the 'request_data' intent. Set 'response' to a brief waiting message like "Один момент! 🔍 Шукаю...". If the data IS provided, use 'chat' intent to summarize it.

**OUTPUT FORMAT:**
You MUST reply with a STRICT JSON object matching this schema:

{
  "intent": "log_food" | "log_exercise" | "log_measurement" | "log_water" | "delete_measurement" | "delete_food" | "ask_question" | "chat" | "request_data",
  "data": { ... }, // Specific to intent, see below
  "entryDate": "string", // Optional
  "response": "string" // Optional for logs, REQUIRED for chat/questions/request_data. Use HTML/emojis.
}

**INTENTS & DATA SCHEMAS:**
- 'log_food': { food_name: string, quantity: number(default 1), unit: string("g"|"piece"|"cup"|etc), meal_type: string("breakfast"|"lunch"|"dinner"|"snacks"-infer from time), calories: number, protein: number, carbs: number, fat: number, ...[include any inferable micros like sugars, fiber, sodium, etc.], serving_size: number, serving_unit: string }
- 'log_exercise': { exercise_name: string, duration_minutes: number|null, distance: number|null, distance_unit: string|null }
- 'log_measurement': { measurements: [{ type: "weight"|"neck"|"waist"|"hips"|"steps"|"custom", value: number, unit: string|null, name: string|null (REQUIRED exact match if type="custom") }] }
- 'log_water': { glasses_consumed: number(default 1) }
- 'delete_measurement': { measurements: [{ type: string, value: number|null }] }
- 'delete_food': { food_name: string|null }
- 'request_data': { type: "food_history" | "exercise_history" | "measurements_history", days: "14" } // Use to fetch deep history not in context. 
- 'ask_question' / 'chat': {} // Empty data object. MUST provide 'response'.

**SPECIAL COMMAND:**
If input is "GENERATE_FOOD_OPTIONS:[food name] in [unit]", ignore standard JSON output and return ONLY a JSON array of 2-3 realistic options. Match requested unit if logical.
Schema: [{"name": "string", "calories": number, "protein": number, "carbs": number, "fat": number, "serving_size": number, "serving_unit": "string (unit ONLY)"}]`;
    const messagesForAI: any[] = [];

    // Перевіряємо, чи є в переданому масиві messages повідомлення з role 'system'.
    // Якщо є, ми беремо його (це дозволить telegramBotService динамічно формувати контекст).
    const customSystemMessage = messages.find((msg) => msg.role === 'system');

    if (customSystemMessage) {
      messagesForAI.push({
        role: 'system',
        content: customSystemMessage.content,
      });
    } else {
      messagesForAI.push({ role: 'system', content: systemPromptContent });
    }

    // Add remaining user/assistant messages (do not filter out assistant!)
    messagesForAI.push(...messages.filter((msg: any) => msg.role !== 'system'));

    // For Google AI
    const cleanSystemPrompt = systemPromptContent
      .replace(/[^\w\s\-.,!?:;()\[\]{}'"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 1000);

    switch (aiService.service_type) {
      case 'openai':
      case 'openai_compatible':
      case 'mistral':
      case 'groq':
      case 'openrouter':
      case 'custom':
        log(
          'debug',
          `[AI Service Request] Type: ${aiService.service_type}, URL: ${
            aiService.service_type === 'openai'
              ? 'https://api.openai.com/v1/chat/completions'
              : aiService.service_type === 'openai_compatible'
                ? `${aiService.custom_url}/chat/completions`
                : aiService.service_type === 'mistral'
                  ? 'https://api.mistral.ai/v1/chat/completions'
                  : aiService.service_type === 'groq'
                    ? 'https://api.groq.com/openai/v1/chat/completions'
                    : aiService.service_type === 'openrouter'
                      ? 'https://openrouter.ai/api/v1/chat/completions'
                      : aiService.custom_url
          }, Model: ${model}, API Key Provided: ${!!aiService.api_key}`
        );
        response = await fetch(
          aiService.service_type === 'openai'
            ? 'https://api.openai.com/v1/chat/completions'
            : aiService.service_type === 'openai_compatible'
              ? `${aiService.custom_url}/chat/completions`
              : aiService.service_type === 'mistral'
                ? 'https://api.mistral.ai/v1/chat/completions'
                : aiService.service_type === 'groq'
                  ? 'https://api.groq.com/openai/v1/chat/completions'
                  : aiService.service_type === 'openrouter'
                    ? 'https://openrouter.ai/api/v1/chat/completions'
                    : aiService.custom_url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(aiService.service_type === 'openrouter' && {
                'HTTP-Referer': 'https://sparky-fitness.com',
                'X-Title': 'Sparky Fitness',
              }),
              ...(aiService.api_key && {
                Authorization: `Bearer ${aiService.api_key}`,
              }),
            },
            body: JSON.stringify({
              model: model,
              messages: messagesForAI,
              temperature: 0.7,
            }),
          }
        );

        if (!response) {
          throw new Error('Fetch did not return a response object.');
        }
        break;

      case 'anthropic':
        log(
          'debug',
          `[AI Service Request] Type: Anthropic, URL: https://api.anthropic.com/v1/messages, Model: ${model}, API Key Provided: ${!!aiService.api_key}`
        );
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            ...(aiService.api_key && { 'x-api-key': aiService.api_key }),
          },
          body: JSON.stringify({
            model: model,
            max_tokens: 1000,
            messages: messagesForAI.filter((msg) => msg.role !== 'system'), // Anthropic system prompt is separate
            system: systemPromptContent,
          }),
        });

        if (!response) {
          throw new Error('Fetch did not return a response object.');
        }
        break;

      case 'google':
        const googleBody = {
          contents: messagesForAI
            .map((msg) => {
              const role = msg.role === 'assistant' ? 'model' : 'user';
              let parts = [];
              if (typeof msg.content === 'string') {
                parts.push({ text: msg.content });
              } else if (Array.isArray(msg.content)) {
                parts = msg.content
                  .map((part) => {
                    if (part.type === 'text') {
                      return { text: part.text };
                    } else if (
                      part.type === 'image_url' &&
                      part.image_url?.url
                    ) {
                      try {
                        const urlParts = part.image_url.url.split(';base64,');
                        if (urlParts.length !== 2) {
                          log(
                            'error',
                            'Invalid data URL format for image part. Expected "data:[mimeType];base64,[data]".'
                          );
                          return null;
                        }
                        const mimeTypeMatch =
                          urlParts[0].match(/^data:(.*?)(;|$)/);
                        let mimeType = '';
                        if (mimeTypeMatch && mimeTypeMatch[1]) {
                          mimeType = mimeTypeMatch[1];
                        } else {
                          log(
                            'error',
                            'Could not extract mime type from data URL prefix:',
                            urlParts[0]
                          );
                          return null;
                        }
                        const base64Data = urlParts[1];
                        return {
                          inline_data: {
                            mime_type: mimeType,
                            data: base64Data,
                          },
                        };
                      } catch (e) {
                        log('error', 'Error processing image data URL:', e);
                        return null;
                      }
                    }
                    return null;
                  })
                  .filter((part) => part !== null);
              }
              if (
                parts.length === 0 &&
                Array.isArray(msg.content) &&
                msg.content.some((part) => part.type === 'image_url')
              ) {
                parts.push({ text: '' });
              }
              return {
                parts: parts,
                role: role,
              };
            })
            .filter((content) => content.parts.length > 0),
          systemInstruction: undefined as any
        };

        if (googleBody.contents.length === 0) {
          throw new Error(
            'No valid content (text or image) found to send to Google AI.'
          );
        }

        if (cleanSystemPrompt && cleanSystemPrompt.length > 0) {
          googleBody.systemInstruction = {
            parts: [{ text: cleanSystemPrompt }],
          };
        }

        if (!aiService.api_key) {
          throw new Error('API key missing for Google AI service.');
        }
        log(
          'debug',
          `[AI Service Request] Type: Google, URL: https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=..., Model: ${model}, API Key Provided: ${!!aiService.api_key}`
        );
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiService.api_key}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(googleBody),
          }
        );

        if (!response) {
          throw new Error('Fetch did not return a response object.');
        }
        break;

      case 'ollama':
        // For Ollama, extract only the text content from the last user message
        // and send it as a string. Ollama does not support multimodal input
        // in the same way as other providers.
        const ollamaMessages = messagesForAI.map((msg) => {
          let contentString = '';
          if (Array.isArray(msg.content)) {
            const textParts = msg.content.filter(
              (part) => part.type === 'text'
            );
            if (textParts.length > 0) {
              contentString = textParts.map((part) => part.text).join(' ');
            }
            const imageParts = msg.content.filter(
              (part) => part.type === 'image_url'
            );
            if (imageParts.length > 0) {
              log(
                'warn',
                'Image data detected for Ollama service. Ollama does not support multimodal input in this format. Image data will be ignored.'
              );
            }
          } else if (typeof msg.content === 'string') {
            contentString = msg.content;
          }
          return { role: msg.role, content: contentString };
        });

        const timeout = aiService.timeout || 1200000; // Default to 1200 seconds (20 minutes)
        log('info', `Ollama chat request timeout set to ${timeout}ms`);

        // Create an undici Agent with the desired timeouts
        const ollamaAgent = new Agent({
          headersTimeout: timeout,
          bodyTimeout: timeout,
        });

        try {
          log(
            'debug',
            `[AI Service Request] Type: Ollama, URL: ${aiService.custom_url}/api/chat, Model: ${model}, API Key Provided: ${!!aiService.api_key}`
          );
          response = await fetch(`${aiService.custom_url}/api/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: model,
              messages: ollamaMessages,
              stream: false,
            }),
            // Pass the undici agent to the fetch call
            dispatcher: ollamaAgent,
          });
        } catch (error) {
          // Translate undici timeouts into a clear timeout error
          if (
            error.name === 'HeadersTimeoutError' ||
            error.name === 'BodyTimeoutError'
          ) {
            throw new Error(
              `Ollama chat request timed out after ${timeout}ms due to undici timeout.`
            );
          }
          // For network-level errors (ECONNREFUSED, ENOTFOUND, etc.) surface a 502-style error so the route returns JSON
          // Prefix with a recognizable token so the router can map to an appropriate HTTP status
          throw new Error(
            `AI service API call error: 502 - Ollama fetch error: ${error.message}`
          );
        } finally {
          // Destroy the agent to prevent resource leaks
          ollamaAgent.destroy();
        }
        break;

      default:
        const hasImage = messagesForAI.some(
          (msg) =>
            Array.isArray(msg.content) &&
            msg.content.some((part) => part.type === 'image_url')
        );
        if (hasImage) {
          throw new Error(
            `Image analysis is not supported for the selected AI service type: ${aiService.service_type}. Please select a multimodal model like Google Gemini in settings.`
          );
        }
        throw new Error(`Unsupported service type: ${aiService.service_type}`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      log(
        'error',
        `AI service API call error for ${aiService.service_type}. Status: ${response.status}, StatusText: ${response.statusText}, Content-Type: ${response.headers.get('content-type')}, Body: ${errorBody}`
      );
      throw new Error(
        `AI service API call error: ${response.status} - ${response.statusText}`
      );
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const errorBody = await response.text();
      log(
        'error',
        `AI service returned non-JSON response. Content-Type: ${contentType}, Body: ${errorBody}`
      );
      throw new Error(
        `AI service returned non-JSON response. Expected application/json but got ${contentType}. Raw Body: ${errorBody.substring(0, 200)}...`
      );
    }

    const data = await response.json();
    let content = '';

    switch (aiService.service_type) {
      case 'openai':
      case 'openai_compatible':
      case 'mistral':
      case 'groq':
      case 'openrouter':
      case 'custom':
        content =
          data.choices?.[0]?.message?.content || 'No response from AI service';
        break;
      case 'anthropic':
        content = data.content?.[0]?.text || 'No response from AI service';
        break;
      case 'google':
        content =
          data.candidates?.[0]?.content?.parts?.[0]?.text ||
          'No response from AI service';
        break;
      case 'ollama':
        content = data.message?.content || 'No response from AI service';
        break;
    }
    let responseText = content;
    let intent = null;
    let intentData = null;
    let entryDate = null;

    try {
      // Clean content from markdown code blocks if AI wrapped JSON
      const cleanContent = content
        .replace(/```json\s?/, '')
        .replace(/\s?```/, '')
        .trim();
      const parsed = JSON.parse(cleanContent);
      responseText = parsed.response || content;
      intent = parsed.intent || null;
      intentData = parsed.data || null;
      entryDate = parsed.entryDate || null;
    } catch (e) {
      log(
        'debug',
        'AI response is not JSON or could not be parsed, treating as plain text.'
      );
    }

    log('debug', `[AI RESPONSE] Parsed intent: ${intent}, data keys: ${intentData ? Object.keys(intentData).join(', ') : 'none'}`);
    if (intentData) log('debug', `[AI RESPONSE DATA] ${JSON.stringify(intentData)}`);

    return {
      content: responseText,
      text: responseText,
      intent,
      data: intentData,
      entryDate,
    };
  } catch (error) {
    log(
      'error',
      `Error processing chat message for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

export async function processFoodOptionsRequest(
  foodName: any,
  unit: any,
  authenticatedUserId: any,
  serviceConfigId: any
) {
  // Changed serviceConfig to serviceConfigId
  try {
    if (!serviceConfigId) {
      // Check if serviceConfigId is provided
      throw new Error('AI service configuration ID is missing.');
    }

    const aiService = await chatRepository.getAiServiceSettingForBackend(
      serviceConfigId,
      authenticatedUserId
    );
    if (!aiService) {
      throw new Error('AI service setting not found for the provided ID.');
    }

    // Log which source was used
    const source = aiService.source || 'unknown';
    log(
      'info',
      `Processing food options request for user ${authenticatedUserId} using AI service from ${source} (ID: ${serviceConfigId})`
    );

    // Ensure API key is present, unless it's Ollama
    if (aiService.service_type !== 'ollama' && !aiService.api_key) {
      throw new Error('API key missing for selected AI service.');
    }

    const systemPrompt = `You are Sparky, an AI nutrition and wellness coach. Your task is to generate minimum 3 realistic food options in JSON format when requested. Respond ONLY with a JSON array of FoodOption objects, including detailed nutritional information (calories, protein, carbs, fat, saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat, cholesterol, sodium, potassium, dietary_fiber, sugars, vitamin_a, vitamin_c, calcium, iron). **CRITICAL: Always provide estimated nutritional details for each food option. Do NOT default to 0 for any nutritional field if an estimation can be made.** Do NOT include any other text.
**CRITICAL: When a unit is specified in the request (e.g., 'GENERATE_FOOD_OPTIONS:apple in piece'), ensure the \`serving_unit\` in the generated \`FoodOption\` objects matches the requested unit exactly, if it's a common and logical unit for that food. If not, provide a common and realistic serving unit.**`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `GENERATE_FOOD_OPTIONS:${foodName} in ${unit}` },
    ];

    const model =
      aiService.model_name || getDefaultModel(aiService.service_type);

    let response;
    switch (aiService.service_type) {
      case 'openai':
      case 'openai_compatible':
      case 'mistral':
      case 'groq':
      case 'openrouter':
      case 'custom':
        log(
          'debug',
          `[AI Service Request] Type: ${aiService.service_type} (Food Options), URL: ${
            aiService.service_type === 'openai'
              ? 'https://api.openai.com/v1/chat/completions'
              : aiService.service_type === 'openai_compatible'
                ? `${aiService.custom_url}/chat/completions`
                : aiService.service_type === 'mistral'
                  ? 'https://api.mistral.ai/v1/chat/completions'
                  : aiService.service_type === 'groq'
                    ? 'https://api.groq.com/openai/v1/chat/completions'
                    : aiService.service_type === 'openrouter'
                      ? 'https://openrouter.ai/api/v1/chat/completions'
                      : aiService.custom_url
          }, Model: ${model}, API Key Provided: ${!!aiService.api_key}`
        );
        response = await fetch(
          aiService.service_type === 'openai'
            ? 'https://api.openai.com/v1/chat/completions'
            : aiService.service_type === 'openai_compatible'
              ? `${aiService.custom_url}/chat/completions`
              : aiService.service_type === 'mistral'
                ? 'https://api.mistral.ai/v1/chat/completions'
                : aiService.service_type === 'groq'
                  ? 'https://api.groq.com/openai/v1/chat/completions'
                  : aiService.service_type === 'openrouter'
                    ? 'https://openrouter.ai/api/v1/chat/completions'
                    : aiService.custom_url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(aiService.service_type === 'openrouter' && {
                'HTTP-Referer': 'https://sparky-fitness.com',
                'X-Title': 'Sparky Fitness',
              }),
              ...(aiService.api_key && {
                Authorization: `Bearer ${aiService.api_key}`,
              }),
            },
            body: JSON.stringify({
              model: model,
              messages: messages,
              temperature: 0.7,
            }),
          }
        );

        if (!response) {
          throw new Error('Fetch did not return a response object.');
        }
        break;

      case 'anthropic':
        log(
          'debug',
          `[AI Service Request] Type: Anthropic (Food Options), URL: https://api.anthropic.com/v1/messages, Model: ${model}, API Key Provided: ${!!aiService.api_key}`
        );
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            ...(aiService.api_key && { 'x-api-key': aiService.api_key }),
          },
          body: JSON.stringify({
            model: model,
            max_tokens: 1000,
            messages: messages.filter((msg) => msg.role !== 'system'), // Anthropic system prompt is separate
            system: systemPrompt,
          }),
        });

        if (!response) {
          throw new Error('Fetch did not return a response object.');
        }
        break;

      case 'google':
        const googleBodyFoodOptions = {
          contents: messages
            .map((msg) => {
              const role = msg.role === 'assistant' ? 'model' : 'user';
              return {
                parts: [{ text: msg.content }],
                role: role,
              };
            })
            .filter((content) => content.parts[0].text.trim() !== ''),
        };

        if (googleBodyFoodOptions.contents.length === 0) {
          throw new Error('No valid content found to send to Google AI.');
        }

        const cleanSystemPromptFoodOptions = systemPrompt
          .replace(/[^\w\s\-.,!?:;()\[\]{}'"]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 1000);

        if (
          cleanSystemPromptFoodOptions &&
          cleanSystemPromptFoodOptions.length > 0
        ) {
          googleBodyFoodOptions.systemInstruction = {
            parts: [{ text: cleanSystemPromptFoodOptions }],
          };
        }

        if (!aiService.api_key) {
          throw new Error('API key missing for Google AI service.');
        }
        log(
          'debug',
          `[AI Service Request] Type: Google (Food Options), URL: https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=..., Model: ${model}, API Key Provided: ${!!aiService.api_key}`
        );
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiService.api_key}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(googleBodyFoodOptions),
          }
        );

        if (!response) {
          throw new Error('Fetch did not return a response object.');
        }
        break;

      case 'ollama':
        // For Ollama, extract only the text content from the messages
        const ollamaMessagesFoodOptions = messages.map((msg) => {
          let contentString = '';
          if (Array.isArray(msg.content)) {
            const textParts = msg.content.filter(
              (part) => part.type === 'text'
            );
            if (textParts.length > 0) {
              contentString = textParts.map((part) => part.text).join(' ');
            }
          } else if (typeof msg.content === 'string') {
            contentString = msg.content;
          }
          return { role: msg.role, content: contentString };
        });

        const timeoutFoodOptions = aiService.timeout || 1200000; // Default to 1200 seconds (20 minutes)
        log(
          'info',
          `Ollama food options request timeout set to ${timeoutFoodOptions}ms`
        );

        // Create an undici Agent with the desired timeouts
        const ollamaAgentFoodOptions = new Agent({
          headersTimeout: timeoutFoodOptions,
          bodyTimeout: timeoutFoodOptions,
        });

        try {
          log(
            'debug',
            `[AI Service Request] Type: Ollama (Food Options), URL: ${aiService.custom_url}/api/chat, Model: ${model}, API Key Provided: ${!!aiService.api_key}`
          );
          response = await fetch(`${aiService.custom_url}/api/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: model,
              messages: ollamaMessagesFoodOptions,
              stream: false,
            }),
            // Pass the undici agent to the fetch call
            dispatcher: ollamaAgentFoodOptions,
          });
        } catch (error) {
          if (
            error.name === 'HeadersTimeoutError' ||
            error.name === 'BodyTimeoutError'
          ) {
            throw new Error(
              `Ollama food options request timed out after ${timeoutFoodOptions}ms due to undici timeout.`
            );
          }
          throw new Error(
            `AI service API call error: 502 - Ollama fetch error: ${error.message}`
          );
        } finally {
          // Destroy the agent to prevent resource leaks
          ollamaAgentFoodOptions.destroy();
        }
        break;

      default:
        throw new Error(
          `Unsupported service type for food options generation: ${aiService.service_type}`
        );
    }

    if (!response.ok) {
      const errorBody = await response.text();
      log(
        'error',
        `AI service API call error for food options (${aiService.service_type}). Status: ${response.status}, StatusText: ${response.statusText}, Content-Type: ${response.headers.get('content-type')}, Body: ${errorBody}`
      );
      throw new Error(
        `AI service API call error: ${response.status} - ${response.statusText}`
      );
    }

    const contentTypeFoodOptions = response.headers.get('content-type');
    if (
      !contentTypeFoodOptions ||
      !contentTypeFoodOptions.includes('application/json')
    ) {
      const errorBody = await response.text();
      log(
        'error',
        `AI service returned non-JSON response for food options. Content-Type: ${contentTypeFoodOptions}, Body: ${errorBody}`
      );
      throw new Error(
        `AI service returned non-JSON response for food options. Expected application/json but got ${contentTypeFoodOptions}. Raw Body: ${errorBody.substring(0, 200)}...`
      );
    }

    const data = await response.json();
    let content = '';

    switch (aiService.service_type) {
      case 'openai':
      case 'openai_compatible':
      case 'mistral':
      case 'groq':
      case 'openrouter':
      case 'custom':
        content =
          data.choices?.[0]?.message?.content || 'No response from AI service';
        break;
      case 'anthropic':
        content = data.content?.[0]?.text || 'No response from AI service';
        break;
      case 'google':
        content =
          data.candidates?.[0]?.content?.parts?.[0]?.text ||
          'No response from AI service';
        break;
      case 'ollama':
        content = data.message?.content || 'No response from AI service';
        break;
    }
    return { content };
  } catch (error) {
    log(
      'error',
      `Error processing food options request for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
