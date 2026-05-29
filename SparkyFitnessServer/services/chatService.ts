import chatRepository from '../models/chatRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import { log } from '../config/logging.js';
import { getDefaultModel } from '../ai/config.js';
import undici from 'undici';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { todayInZone } from '@workspace/shared';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { generateText, streamText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import path from 'path';

const { Agent } = undici; // Import Agent from undici
async function handleAiServiceSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const { _encrypted_api_key, _api_key_iv, _api_key_tag, ...safeSetting } =
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

async function getAiServiceSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any
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

async function getActiveAiServiceSetting(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteAiServiceSetting(authenticatedUserId: any, id: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clearOldChatHistory(authenticatedUserId: any) {
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

async function getSparkyChatHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSparkyChatHistoryEntry(authenticatedUserId: any, id: any) {
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
async function updateSparkyChatHistoryEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  try {
    // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
    const entryOwnerId = await chatRepository.getChatHistoryEntryOwnerId(id);
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteSparkyChatHistoryEntry(authenticatedUserId: any, id: any) {
  try {
    // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
    const entryOwnerId = await chatRepository.getChatHistoryEntryOwnerId(id);
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clearAllSparkyChatHistory(authenticatedUserId: any) {
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

async function saveSparkyChatHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  historyData: any
) {
  try {
    // Ensure the history is saved for the authenticated user
    historyData.user_id = authenticatedUserId;
    await chatRepository.saveChatHistory(historyData);
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
async function processChatMessage(
  messages: any[],
  serviceConfigId: any,
  authenticatedUserId: any,
  reqHeaders?: any
) {
  try {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Invalid messages format.');
    }
    if (!serviceConfigId) {
      throw new Error('AI service configuration ID is missing.');
    }
    const aiService = await chatRepository.getAiServiceSettingForBackend(
      serviceConfigId,
      authenticatedUserId
    );
    if (!aiService) {
      throw new Error('AI service setting not found for the provided ID.');
    }

    const source = aiService.source || 'unknown';
    log(
      'info',
      `Processing chat message for user ${authenticatedUserId} using AI service from ${source} (ID: ${serviceConfigId})`
    );

    if (aiService.service_type !== 'ollama' && !aiService.api_key) {
      throw new Error('API key missing for selected AI service.');
    }

    const modelName =
      aiService.model_name || getDefaultModel(aiService.service_type);

    // Initialize Vercel AI SDK Model based on service_type
    let modelInstance: any;
    const apiKey = aiService.api_key;

    if (aiService.service_type === 'openai') {
      const provider = createOpenAI({ apiKey });
      modelInstance = provider(modelName);
    } else if (aiService.service_type === 'anthropic') {
      const provider = createAnthropic({ apiKey });
      modelInstance = provider(modelName);
    } else if (aiService.service_type === 'google') {
      const provider = createGoogleGenerativeAI({ apiKey });
      modelInstance = provider(modelName);
    } else if (
      aiService.service_type === 'ollama' ||
      aiService.service_type === 'openai_compatible' ||
      aiService.service_type === 'custom' ||
      aiService.service_type === 'mistral' ||
      aiService.service_type === 'groq' ||
      aiService.service_type === 'openrouter'
    ) {
      // Connect as OpenAI-compatible
      let baseURL = aiService.custom_url;
      if (aiService.service_type === 'ollama') {
        baseURL = `${aiService.custom_url}/v1`;
      } else if (aiService.service_type === 'groq') {
        baseURL = 'https://api.groq.com/openai/v1';
      } else if (aiService.service_type === 'openrouter') {
        baseURL = 'https://openrouter.ai/api/v1';
      } else if (aiService.service_type === 'mistral') {
        baseURL = 'https://api.mistral.ai/v1';
      }
      const provider = createOpenAI({
        baseURL,
        apiKey: apiKey || 'no-key',
      });
      modelInstance = provider.chat(modelName);
    } else {
      throw new Error(`Unsupported service type: ${aiService.service_type}`);
    }

    // Connect to MCP Server
    let mcpClient: any;
    const mcpUrl = process.env.SPARKY_FITNESS_MCP_URL;

    if (mcpUrl) {
      // Forward the user's authorization and cookies to MCP
      const headers: Record<string, string> = {};
      if (reqHeaders?.authorization) {
        headers['authorization'] = reqHeaders.authorization;
      }
      if (reqHeaders?.cookie) {
        headers['cookie'] = reqHeaders.cookie;
      }
      log('info', `Connecting to MCP server over HTTP: ${mcpUrl}`);
      mcpClient = await createMCPClient({
        transport: {
          type: 'http',
          url: mcpUrl,
          headers,
        },
      });
    } else {
      // Fallback for local Stdio transport (CLI mode / developer convenience)
      log('info', 'Connecting to MCP server via local Stdio transport');
      const indexCjsPath = path.resolve(
        process.cwd(),
        '../SparkyFitnessMCP/dist/index.cjs'
      );
      mcpClient = await createMCPClient({
        transport: new StdioClientTransport({
          command: 'node',
          args: [indexCjsPath],
          env: {
            ...process.env,
            // For n8n / external tools: use server-level API key if configured.
            // For frontend sessions: forward the user's cookie so the MCP
            // process can authenticate via the existing session.
            ...(process.env.SPARKY_FITNESS_API_KEY
              ? { SPARKY_FITNESS_API_KEY: process.env.SPARKY_FITNESS_API_KEY }
              : {
                  Authorization: reqHeaders?.authorization || '',
                  Cookie: reqHeaders?.cookie || '',
                }),
            MCP_TRANSPORT: 'stdio',
          },
        }),
      });
    }

    // Load user context (categories, timezone)
    const [customCategories, chatTz] = await Promise.all([
      measurementRepository.getCustomCategories(authenticatedUserId),
      loadUserTimezone(authenticatedUserId),
    ]);

    const customCategoriesList =
      customCategories.length > 0
        ? customCategories
            .map(
              (cat: any) =>
                `- ${cat.name} (${cat.measurement_type}, ${cat.frequency})`
            )
            .join('\n')
        : 'None';

    const systemPromptContent = `You are Sparky, an AI nutrition and wellness coach. Your primary goal is to help users track their food, exercise, and measurements, and provide helpful advice and motivation based on their data and general health knowledge.

The current local date is ${todayInZone(chatTz)}.

When the user mentions logging food, exercise, or measurements, prioritize using the matching tools.

Here are the user's existing custom measurement categories:
${customCategoriesList}

When logging measurements or custom categories, compare user inputs to the list above. If you find a match or variations (synonyms, capitalization), use the exact category name.

For solid food items or beverages that are not water, use the 'sparky_manage_food' tool. Do NOT classify water as food. Use the 'sparky_manage_water' tool for water intake.

## MANDATORY FOOD LOOKUP RULE
BEFORE creating any new food entry or logging food that may not exist in the database, you MUST call 'sparky_lookup_food_nutrition' first to search for verified nutritional data. This tool searches internal database, user food providers, OpenFoodFacts, and other verified sources.

- If 'sparky_lookup_food_nutrition' returns nutrition data (calories > 0), use that data when calling 'sparky_manage_food'. Do NOT override it with your own estimates.
- Only use AI-estimated nutrition if 'sparky_lookup_food_nutrition' explicitly returns no data or a zero-calorie result.
- Always tell the user the source of nutrition data (e.g., "from OpenFoodFacts", "from internal database", "AI estimate").
- If the user explicitly asks for internet search or a specific source, pass that preference to 'sparky_lookup_food_nutrition' using the source_preference parameter.

## VISION SUPPORT
You are a multimodal AI. When the user provides an image (photo of food, meal, or nutrition label):
1. **Analyze it directly** using your built-in vision capabilities. You can see the images in the conversation history.
2. If you need a more structured nutritional estimate or if the image is a complex meal, you can use the 'sparky_analyze_food_image' tool as a secondary step.
3. For nutrition labels, you can use 'sparky_scan_label' to ensure high accuracy in data extraction.
4. Based on your analysis, proceed to log the entry using the appropriate tools (e.g., 'sparky_manage_food').

Be precise with data extraction and call the correct tools in the correct order.`;

    // Retrieve and filter tools from MCP server
    const allTools = await mcpClient.tools();

    // Filter developer/test tools out
    const chatbotTools: Record<string, any> = {};
    for (const [key, tool] of Object.entries(allTools)) {
      const isBlocked = [
        'sparky_run_project_tests',
        'sparky_inspect_schema',
      ].includes(key);
      if (!isBlocked) {
        chatbotTools[key] = tool;
      }
    }

    // Map conversation history messages to CoreMessage format
    const conversationMessages = messages.map((msg: any) => {
      // Prioritize structured 'parts' if available (multimodal support)
      if (msg.parts && Array.isArray(msg.parts)) {
        return {
          role: msg.message_type === 'assistant' ? 'assistant' : 'user',
          content: msg.parts,
        };
      }

      // Fallback to legacy string content
      return {
        role: msg.message_type === 'assistant' ? 'assistant' : 'user',
        content: msg.content || '',
      };
    });

    // Add the incoming message(s) to the history
    const incomingMessages = messages.map((msg: any) => {
      if (Array.isArray(msg.parts) || Array.isArray(msg.content)) {
        const partsSource = Array.isArray(msg.parts) ? msg.parts : msg.content;
        const parts = partsSource
          .map((part: any) => {
            if (part.type === 'text') {
              return {
                type: 'text' as const,
                text: part.text || part.content || '',
              };
            }
            if (
              part.type === 'image' ||
              part.type === 'image_url' ||
              (part.type === 'file' &&
                (part.mimeType?.startsWith('image/') ||
                  part.mediaType?.startsWith('image/') ||
                  part.url?.startsWith('data:image/')))
            ) {
              const url = part.image_url?.url || part.image || part.url || '';
              return { type: 'image' as const, image: url };
            }
            return { type: 'text' as const, text: String(part.text || '') };
          })
          .filter(
            (p: any) =>
              p.type === 'image' || (p.type === 'text' && p.text.trim() !== '')
          );

        return {
          role: (msg.role === 'assistant' ? 'assistant' : 'user') as
            | 'assistant'
            | 'user',
          content: parts,
        };
      }

      return {
        role: (msg.role === 'assistant' ? 'assistant' : 'user') as
          | 'assistant'
          | 'user',
        content: typeof msg.content === 'string' ? msg.content : '',
      };
    });

    conversationMessages.push(...incomingMessages);

    // Filter out trailing empty assistant messages if sent by the client
    while (
      conversationMessages.length > 0 &&
      conversationMessages[conversationMessages.length - 1].role ===
        'assistant' &&
      !conversationMessages[conversationMessages.length - 1].content
    ) {
      conversationMessages.pop();
    }

    const executedToolsList: Array<{ name: string; args: any }> = [];

    const result = await generateText({
      model: modelInstance,
      system: systemPromptContent,
      messages: conversationMessages as any,
      tools: chatbotTools,
      stopWhen: stepCountIs(50),
      onStepFinish({ toolCalls }) {
        if (toolCalls && toolCalls.length > 0) {
          toolCalls.forEach((call: any) => {
            log(
              'info',
              `Agent executed tool call: ${call.toolName} with args: ${JSON.stringify(call.args)}`
            );
            executedToolsList.push({
              name: call.toolName,
              args: call.args,
            });
          });
        }
      },
    });

    // Close MCP Client Connection
    await mcpClient.close().catch(() => {});

    // Save history dynamically to DB (replacing frontend client-side saves)
    const lastUserMsg = incomingMessages[incomingMessages.length - 1];
    const userMessageContent = Array.isArray(lastUserMsg?.content)
      ? lastUserMsg.content
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join(' ') || '[Image message]'
      : (lastUserMsg?.content as string) || 'Message sent';

    await chatRepository
      .saveChatHistory({
        user_id: authenticatedUserId,
        content: userMessageContent,
        messageType: 'user',
        parts: lastUserMsg?.content,
      })
      .catch((err: any) =>
        log('error', 'Failed to save user chat history:', err)
      );

    await chatRepository
      .saveChatHistory({
        user_id: authenticatedUserId,
        content: result.text,
        messageType: 'assistant',
        parts: [{ type: 'text', text: result.text }],
      })
      .catch((err: any) =>
        log('error', 'Failed to save assistant chat history:', err)
      );

    // Determine the general action type based on executed tools
    let actionType = 'advice';
    if (executedToolsList.some((t) => t.name === 'sparky_manage_food')) {
      const logFoodCall = executedToolsList.find(
        (t) => t.name === 'sparky_manage_food' && t.args?.action === 'log_food'
      );
      actionType = logFoodCall ? 'food_added' : 'advice';
    } else if (
      executedToolsList.some((t) => t.name === 'sparky_manage_exercise')
    ) {
      actionType = 'exercise_added';
    } else if (
      executedToolsList.some((t) => t.name === 'sparky_manage_checkin')
    ) {
      actionType = 'measurement_added';
    } else if (
      executedToolsList.some((t) => t.name === 'sparky_manage_habits')
    ) {
      actionType = 'habit_logged';
    }

    return {
      content: result.text,
      action: actionType,
      executedTools: executedToolsList,
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
async function processFoodOptionsRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foodName: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unit: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      case 'google': {
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
          .replace(/[^\w\s\-.,!?:;()[\]{}'"]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 1000);
        if (
          cleanSystemPromptFoodOptions &&
          cleanSystemPromptFoodOptions.length > 0
        ) {
          // @ts-expect-error TS(2339): Property 'systemInstruction' does not exist on typ... Remove this comment to see the full error message
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
      }
      // For Ollama, extract only the text content from the messages
      case 'ollama': {
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
            // @ts-expect-error TS(2769): No overload matches this call.
            dispatcher: ollamaAgentFoodOptions,
          });
        } catch (error) {
          if (
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            error.name === 'HeadersTimeoutError' ||
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            error.name === 'BodyTimeoutError'
          ) {
            throw new Error(
              `Ollama food options request timed out after ${timeoutFoodOptions}ms due to undici timeout.`,
              { cause: error }
            );
          }
          throw new Error(
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            `AI service API call error: 502 - Ollama fetch error: ${error.message}`,
            { cause: error }
          );
        } finally {
          // Destroy the agent to prevent resource leaks
          ollamaAgentFoodOptions.destroy();
        }
        break;
      }
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
async function processChatMessageStream(
  messages: any[],
  serviceConfigId: any,
  authenticatedUserId: any,
  reqHeaders?: any
) {
  try {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Invalid messages format.');
    }
    if (!serviceConfigId) {
      throw new Error('AI service configuration ID is missing.');
    }
    const aiService = await chatRepository.getAiServiceSettingForBackend(
      serviceConfigId,
      authenticatedUserId
    );
    if (!aiService) {
      throw new Error('AI service setting not found for the provided ID.');
    }

    const apiKey = aiService.api_key;
    const modelName =
      aiService.model_name || getDefaultModel(aiService.service_type);

    log(
      'info',
      `Streaming chat message with service: ${aiService.service_type}, model: ${modelName}`
    );

    let modelInstance: any;
    if (aiService.service_type === 'openai') {
      const provider = createOpenAI({ apiKey });
      modelInstance = provider(modelName);
    } else if (aiService.service_type === 'anthropic') {
      const provider = createAnthropic({ apiKey });
      modelInstance = provider(modelName);
    } else if (aiService.service_type === 'google') {
      const provider = createGoogleGenerativeAI({ apiKey });
      modelInstance = provider(modelName);
    } else if (
      aiService.service_type === 'ollama' ||
      aiService.service_type === 'openai_compatible' ||
      aiService.service_type === 'custom' ||
      aiService.service_type === 'mistral' ||
      aiService.service_type === 'groq' ||
      aiService.service_type === 'openrouter'
    ) {
      let baseURL = aiService.custom_url;
      if (aiService.service_type === 'ollama') {
        baseURL = `${aiService.custom_url}/v1`;
      } else if (aiService.service_type === 'groq') {
        baseURL = 'https://api.groq.com/openai/v1';
      } else if (aiService.service_type === 'openrouter') {
        baseURL = 'https://openrouter.ai/api/v1';
      } else if (aiService.service_type === 'mistral') {
        baseURL = 'https://api.mistral.ai/v1';
      }
      const provider = createOpenAI({
        baseURL,
        apiKey: apiKey || 'no-key',
      });
      modelInstance = provider.chat(modelName);
    } else {
      throw new Error(`Unsupported service type: ${aiService.service_type}`);
    }

    // Connect to MCP Server
    let mcpClient: any;
    const mcpUrl = process.env.SPARKY_FITNESS_MCP_URL;

    if (mcpUrl) {
      const headers: Record<string, string> = {};
      if (reqHeaders?.authorization) {
        headers['authorization'] = reqHeaders.authorization;
      }
      if (reqHeaders?.cookie) {
        headers['cookie'] = reqHeaders.cookie;
      }
      mcpClient = await createMCPClient({
        transport: {
          type: 'http',
          url: mcpUrl,
          headers,
        },
      });
    } else {
      const indexCjsPath = path.resolve(
        process.cwd(),
        '../SparkyFitnessMCP/dist/index.cjs'
      );
      mcpClient = await createMCPClient({
        transport: new StdioClientTransport({
          command: 'node',
          args: [indexCjsPath],
          env: {
            ...process.env,
            // For n8n / external tools: use server-level API key if configured.
            // For frontend sessions: forward the user's cookie so the MCP
            // process can authenticate via the existing session.
            ...(process.env.SPARKY_FITNESS_API_KEY
              ? { SPARKY_FITNESS_API_KEY: process.env.SPARKY_FITNESS_API_KEY }
              : {
                  Authorization: reqHeaders?.authorization || '',
                  Cookie: reqHeaders?.cookie || '',
                }),
            MCP_TRANSPORT: 'stdio',
          },
        }),
      });
    }

    const [customCategories, chatTz] = await Promise.all([
      measurementRepository.getCustomCategories(authenticatedUserId),
      loadUserTimezone(authenticatedUserId),
    ]);

    const customCategoriesList =
      customCategories.length > 0
        ? customCategories
            .map(
              (cat: any) =>
                `- ${cat.name} (${cat.measurement_type}, ${cat.frequency})`
            )
            .join('\n')
        : 'None';

    const systemPromptContent = `You are Sparky, an AI nutrition and wellness coach. Your primary goal is to help users track their food, exercise, and measurements, and provide helpful advice and motivation based on their data and general health knowledge.

The current local date is ${todayInZone(chatTz)}.

When the user mentions logging food, exercise, or measurements, prioritize using the matching tools.

Here are the user's existing custom measurement categories:
${customCategoriesList}

When logging measurements or custom categories, compare user inputs to the list above. If you find a match or variations (synonyms, capitalization), use the exact category name.

For solid food items or beverages that are not water, use the 'sparky_manage_food' tool. Do NOT classify water as food. Use the 'sparky_manage_water' tool for water intake.

Be precise with data extraction, search the database first if needed, and call the correct tools.`;

    const allTools = await mcpClient.tools();
    const chatbotTools: Record<string, any> = {};
    for (const [key, tool] of Object.entries(allTools)) {
      const isBlocked = [
        'sparky_run_project_tests',
        'sparky_inspect_schema',
      ].includes(key);
      if (!isBlocked) {
        chatbotTools[key] = tool;
      }
    }
    log(
      'info',
      `Loaded ${Object.keys(chatbotTools).length} tools for chatbot: ${Object.keys(chatbotTools).join(', ')}`
    );

    const conversationMessages = messages.map((msg: any) => {
      // If parts or content is an array of parts (text + images), pass them through
      const partsSource = Array.isArray(msg.parts)
        ? msg.parts
        : Array.isArray(msg.content)
          ? msg.content
          : null;

      if (partsSource) {
        const parts = partsSource
          .map((part: any) => {
            if (part.type === 'text') {
              return { type: 'text' as const, text: part.text || '' };
            }
            if (
              part.type === 'image' ||
              part.type === 'image_url' ||
              (part.type === 'file' &&
                (part.mimeType?.startsWith('image/') ||
                  part.mediaType?.startsWith('image/') ||
                  part.url?.startsWith('data:image/')))
            ) {
              // Handle both base64 data URLs and remote URLs
              const url = part.image_url?.url || part.image || part.url || '';
              return { type: 'image' as const, image: url };
            }
            // Fallback: treat unknown parts as text
            return { type: 'text' as const, text: String(part.text || '') };
          })
          .filter(
            (p: any) =>
              p.type === 'image' || (p.type === 'text' && p.text.trim() !== '')
          );

        if (parts.length > 0) {
          return {
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: parts,
          };
        }
      }

      // If content is a plain string, use as-is
      if (typeof msg.content === 'string' && msg.content.trim() !== '') {
        return {
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        };
      }

      return {
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: '',
      };
    });

    // Filter out trailing empty assistant messages if sent by the client
    while (
      conversationMessages.length > 0 &&
      conversationMessages[conversationMessages.length - 1].role ===
        'assistant' &&
      (!conversationMessages[conversationMessages.length - 1].content ||
        (Array.isArray(
          conversationMessages[conversationMessages.length - 1].content
        ) &&
          conversationMessages[conversationMessages.length - 1].content
            .length === 0))
    ) {
      conversationMessages.pop();
    }

    // Use a sliding window of recent messages to give the LLM multi-turn context
    // ...
    const CONTEXT_WINDOW = 20;
    const llmMessages = conversationMessages.slice(-CONTEXT_WINDOW);

    log(
      'debug',
      `[DEBUG] AI Transmission: Preparing ${llmMessages.length} messages. Last message content structure: ${JSON.stringify(llmMessages[llmMessages.length - 1].content).substring(0, 200)}`
    );

    // Ensure the window starts with a user message (some models reject assistant-first history)
    while (llmMessages.length > 0 && llmMessages[0].role !== 'user') {
      llmMessages.shift();
    }

    const lastMsg = llmMessages[llmMessages.length - 1];
    const userMessageContent = Array.isArray(lastMsg?.content)
      ? lastMsg.content
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join(' ') || '[Image message]'
      : (lastMsg?.content as string) || 'Message sent';

    const result = streamText({
      model: modelInstance,
      system: systemPromptContent,
      messages: llmMessages as any,
      tools: chatbotTools,
      stopWhen: stepCountIs(50),
      onFinish: async ({ text }) => {
        // Close MCP Client
        await mcpClient.close().catch(() => {});

        // Get the last user message from conversationMessages to ensure parts are captured
        const lastUserMessage = [...conversationMessages]
          .reverse()
          .find((msg: any) => msg.role === 'user');

        // Save to DB on completion
        await chatRepository
          .saveChatHistory({
            user_id: authenticatedUserId,
            content: userMessageContent,
            messageType: 'user',
            parts: lastUserMessage?.content,
          })
          .catch((err: any) =>
            log('error', 'Failed to save user chat history:', err)
          );

        await chatRepository
          .saveChatHistory({
            user_id: authenticatedUserId,
            content: text,
            messageType: 'assistant',
            parts: [{ type: 'text', text }],
          })
          .catch((err: any) =>
            log('error', 'Failed to save assistant chat history:', err)
          );
      },
    });

    return result;
  } catch (error) {
    log(
      'error',
      `Error in processChatMessageStream for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
export { handleAiServiceSettings };
export { getAiServiceSettings };
export { getActiveAiServiceSetting };
export { deleteAiServiceSetting };
export { clearOldChatHistory };
export { getSparkyChatHistory };
export { getSparkyChatHistoryEntry };
export { updateSparkyChatHistoryEntry };
export { deleteSparkyChatHistoryEntry };
export { clearAllSparkyChatHistory };
export { saveSparkyChatHistory };
export { processChatMessage };
export { processFoodOptionsRequest };
export { processChatMessageStream };
export default {
  handleAiServiceSettings,
  getAiServiceSettings,
  getActiveAiServiceSetting,
  deleteAiServiceSetting,
  clearOldChatHistory,
  getSparkyChatHistory,
  getSparkyChatHistoryEntry,
  updateSparkyChatHistoryEntry,
  deleteSparkyChatHistoryEntry,
  clearAllSparkyChatHistory,
  saveSparkyChatHistory,
  processChatMessage,
  processFoodOptionsRequest,
  processChatMessageStream,
};
