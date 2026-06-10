import chatRepository from '../models/chatRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import { log } from '../config/logging.js';
import { getDefaultModel } from '../ai/config.js';
import {
  dispatchAiRequest,
  type DispatchErrorCategory,
  type ProviderConfig,
} from '../ai/providerDispatch.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  todayInZone,
  DatabaseCustomCategories,
  AiServiceSettings,
  SparkyChatHistory,
  SparkyChatHistoryMutator,
} from '@workspace/shared';
import { IncomingHttpHeaders } from 'http';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';

interface ChatMessagePart {
  type: 'text' | 'image' | 'image_url' | 'file';
  text?: string;
  content?: string;
  mimeType?: string;
  mediaType?: string;
  url?: string;
  image?: string;
  image_url?: { url: string };
}

interface ProcessedMessagePart {
  type: 'text' | 'image';
  text?: string;
  image?: string;
}

interface ChatMessage {
  role: string;
  content?: string | ChatMessagePart[];
  parts?: ChatMessagePart[];
}

import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { generateText, streamText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import path from 'path';

async function handleAiServiceSettings(
  action: string,
  serviceData: Partial<AiServiceSettings> & { api_key?: string },
  authenticatedUserId: string
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
        result as Record<string, unknown>;
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

async function getActiveAiServiceSetting(
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

async function deleteAiServiceSetting(authenticatedUserId: string, id: string) {
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
async function clearOldChatHistory(authenticatedUserId: string) {
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

async function getSparkyChatHistoryEntry(
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
async function updateSparkyChatHistoryEntry(
  authenticatedUserId: string,
  id: string,
  updateData: SparkyChatHistoryMutator
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

async function deleteSparkyChatHistoryEntry(
  authenticatedUserId: string,
  id: string
) {
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

async function clearAllSparkyChatHistory(authenticatedUserId: string) {
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
  authenticatedUserId: string,
  historyData: Partial<SparkyChatHistory> & {
    messageType?: 'user' | 'assistant';
    parts?: ChatMessagePart[];
  }
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
async function getMcpClient(reqHeaders?: IncomingHttpHeaders) {
  const mcpUrl = process.env.SPARKY_FITNESS_MCP_URL;

  if (mcpUrl) {
    const mcpEndpoint = mcpUrl.endsWith('/mcp') ? mcpUrl : `${mcpUrl}/mcp`;
    // Forward the user's authorization and cookies to MCP
    const headers: Record<string, string> = {};
    if (reqHeaders?.authorization) {
      headers['authorization'] = reqHeaders.authorization;
    }
    if (reqHeaders?.cookie) {
      headers['cookie'] = reqHeaders.cookie;
    }
    // Forward proxy headers so Better Auth accepts secure cookies over internal HTTP
    const isHttps =
      process.env.SPARKY_FITNESS_FRONTEND_URL?.startsWith('https');
    const protoHeader = reqHeaders?.['x-forwarded-proto'];
    const resolvedProto = Array.isArray(protoHeader)
      ? protoHeader[0]
      : protoHeader;
    headers['x-forwarded-proto'] =
      resolvedProto || (isHttps ? 'https' : 'http');
    const hostHeader = reqHeaders?.['x-forwarded-host'];
    const resolvedHost = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
    if (resolvedHost) {
      headers['x-forwarded-host'] = resolvedHost;
    }
    // If a server-level API key is configured, prefer it over session forwarding
    // for the server→MCP internal call (useful when cookie auth fails over plain
    // internal Docker HTTP). Mirrors the same priority logic in the stdio path.
    if (process.env.SPARKY_FITNESS_API_KEY) {
      headers['x-api-key'] = process.env.SPARKY_FITNESS_API_KEY;
    }
    log('info', `Connecting to MCP server over HTTP: ${mcpEndpoint}`);
    return await createMCPClient({
      transport: {
        type: 'http',
        url: mcpEndpoint,
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
    return await createMCPClient({
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
}

function getSystemPrompt(chatTz: string, customCategoriesList: string): string {
  return `You are Sparky, an AI nutrition and wellness coach. Your primary goal is to help users track their food, exercise, and measurements, and provide helpful advice and motivation based on their data and general health knowledge.

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
- **Maximized Nutritional Detail (CRITICAL)**: When creating or logging a food via 'sparky_manage_food' with 'create_food', you MUST populate EVERY single nutritional field (saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat, cholesterol, sodium, potassium, fiber, sugar, vitamin_a, vitamin_c, calcium, iron, gi). Do NOT default to logging only main macros (calories, protein, carbs, fat). Even if the source data or user description lacks detailed micro-nutrients, you MUST use your comprehensive biochemical and culinary knowledge to calculate and estimate realistic, scientifically sound values for every field (e.g., estimating fiber for grains, sugar for fruits, saturated fat & cholesterol for meat, sodium for prepared/seasoned dishes). Omit no fields, and do not default them to zero unless the food truly contains none of that nutrient.

## VISION SUPPORT
You are a multimodal AI. When the user provides an image (photo of food, meal, or nutrition label):
1. **Analyze it directly** using your built-in vision capabilities. You can see the images in the conversation history.
2. If you need a more structured nutritional estimate or if the image is a complex meal, you can use the 'sparky_analyze_food_image' tool as a secondary step.
3. For nutrition labels, you can use 'sparky_scan_label' to ensure high accuracy in data extraction.
4. Based on your analysis, proceed to log the entry using the appropriate tools (e.g., 'sparky_manage_food').

Be precise with data extraction and call the correct tools in the correct order.`;
}

async function processChatMessage(
  messages: ChatMessage[],
  serviceConfigId: string,
  authenticatedUserId: string,
  reqHeaders?: IncomingHttpHeaders
) {
  let mcpClient: Awaited<ReturnType<typeof getMcpClient>> | undefined;
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
    let modelInstance: Parameters<typeof generateText>[0]['model'];
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

    // Connect to MCP Server using helper function
    mcpClient = await getMcpClient(reqHeaders);

    // Load user context (categories, timezone)
    const [customCategories, chatTz] = await Promise.all([
      measurementRepository.getCustomCategories(authenticatedUserId),
      loadUserTimezone(authenticatedUserId),
    ]);

    const customCategoriesList =
      customCategories.length > 0
        ? customCategories
            .map(
              (cat: DatabaseCustomCategories) =>
                `- ${cat.name} (${cat.measurement_type}, ${cat.frequency})`
            )
            .join('\n')
        : 'None';

    const systemPromptContent = getSystemPrompt(chatTz, customCategoriesList);

    // Retrieve and filter tools from MCP server
    const allTools = await mcpClient.tools();

    // Filter developer/test tools out
    const chatbotTools: NonNullable<
      Parameters<typeof generateText>[0]['tools']
    > = {};
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

    // Map conversation history messages to CoreMessage format
    const conversationMessages = messages.map((msg: ChatMessage) => {
      // If parts or content is an array of parts (text + images), pass them through
      const partsSource =
        msg.parts && Array.isArray(msg.parts)
          ? msg.parts
          : Array.isArray(msg.content)
            ? msg.content
            : null;

      if (partsSource) {
        const parts = (partsSource as ChatMessagePart[])
          .map((part: ChatMessagePart) => {
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
            (p: ProcessedMessagePart) =>
              p.type === 'image' ||
              (p.type === 'text' && p.text && p.text.trim() !== '')
          );

        if (parts.length > 0) {
          return {
            role: (msg.role === 'assistant' ? 'assistant' : 'user') as
              | 'assistant'
              | 'user',
            content: parts,
          };
        }
      }

      return {
        role: (msg.role === 'assistant' ? 'assistant' : 'user') as
          | 'assistant'
          | 'user',
        content: typeof msg.content === 'string' ? msg.content : '',
      };
    });

    // Add the incoming message(s) to the history
    const incomingMessages = messages.map((msg: ChatMessage) => {
      if (Array.isArray(msg.parts) || Array.isArray(msg.content)) {
        const partsSource = (
          Array.isArray(msg.parts) ? msg.parts : msg.content
        ) as ChatMessagePart[];
        const parts = partsSource
          .map((part: ChatMessagePart) => {
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
            (p: ProcessedMessagePart) =>
              p.type === 'image' ||
              (p.type === 'text' && p.text && p.text.trim() !== '')
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

    const executedToolsList: Array<{
      name: string;
      args: Record<string, unknown>;
    }> = [];

    const result = await generateText({
      model: modelInstance,
      system: systemPromptContent,
      messages: conversationMessages as NonNullable<
        Parameters<typeof generateText>[0]['messages']
      >,
      tools: chatbotTools,
      stopWhen: stepCountIs(50),
      onStepFinish({ toolCalls }) {
        if (toolCalls && toolCalls.length > 0) {
          toolCalls.forEach((call) => {
            const toolCall = call as unknown as {
              toolName: string;
              args: Record<string, unknown>;
            };
            log(
              'info',
              `Agent executed tool call: ${toolCall.toolName} with args: ${JSON.stringify(toolCall.args)}`
            );
            executedToolsList.push({
              name: toolCall.toolName,
              args: toolCall.args,
            });
          });
        }
      },
    });

    // Save history dynamically to DB (replacing frontend client-side saves)
    const lastUserMsg = incomingMessages[incomingMessages.length - 1];
    const userMessageContent = Array.isArray(lastUserMsg?.content)
      ? lastUserMsg.content
          .filter((p: ChatMessagePart) => p.type === 'text')
          .map((p: ChatMessagePart) => p.text || '')
          .join(' ') || '[Image message]'
      : (lastUserMsg?.content as string) || 'Message sent';

    const userMessageParts = Array.isArray(lastUserMsg?.content)
      ? lastUserMsg.content
      : [{ type: 'text' as const, text: String(lastUserMsg?.content || '') }];

    await chatRepository
      .saveChatHistory({
        user_id: authenticatedUserId,
        content: userMessageContent,
        messageType: 'user',
        parts: userMessageParts,
      })
      .catch((err: unknown) =>
        log('error', 'Failed to save user chat history:', err)
      );

    await chatRepository
      .saveChatHistory({
        user_id: authenticatedUserId,
        content: result.text,
        messageType: 'assistant',
        parts: [{ type: 'text', text: result.text }],
      })
      .catch((err: unknown) =>
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

    if (executedToolsList.some((t) => t.name === 'sparky_manage_food')) {
      const foodCall = executedToolsList.find(
        (t) => t.name === 'sparky_manage_food'
      );
      if (foodCall && foodCall.args?.action === 'food_options') {
        actionType = 'food_options';
      }
    } else if (
      executedToolsList.some((t) => t.name === 'sparky_manage_exercise')
    ) {
      const exerciseCall = executedToolsList.find(
        (t) => t.name === 'sparky_manage_exercise'
      );
      if (exerciseCall && exerciseCall.args?.action === 'exercise_options') {
        actionType = 'exercise_options';
        // Exercise options could be processed here similarly
      }
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
  } finally {
    if (mcpClient) {
      await mcpClient.close().catch(() => {});
    }
  }
}
const FOOD_OPTIONS_PROMPT = `You are Sparky, an AI nutrition and wellness coach. Your task is to generate minimum 3 realistic food options in JSON format when requested. Respond ONLY with a JSON array of FoodOption objects, including detailed nutritional information for EVERY field (calories, protein, carbs, fat, saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat, cholesterol, sodium, potassium, dietary_fiber, sugars, vitamin_a, vitamin_c, calcium, iron). **CRITICAL: You MUST estimate and populate every single micro-nutritional field. Do NOT default to 0 or leave blank any nutritional field if a realistic scientific estimation can be made based on the food type. Use your biochemical and culinary knowledge to calculate typical distributions.** Do NOT include any other text.
**CRITICAL: When a unit is specified in the request (e.g., 'GENERATE_FOOD_OPTIONS:apple in piece'), ensure the \`serving_unit\` in the generated \`FoodOption\` objects matches the requested unit exactly, if it's a common and logical unit for that food. If not, provide a common and realistic serving unit.**`;

const FOOD_OPTIONS_TEMPERATURE = 0.7;

// 'no_ai_configured' is the only category this service mints itself; every
// dispatch failure passes its category through unchanged for the route's
// HTTP-status map.
export type FoodOptionsErrorCategory =
  | DispatchErrorCategory
  | 'no_ai_configured';

export type FoodOptionsResult =
  | { success: true; content: string }
  | { success: false; category: FoodOptionsErrorCategory; error: string };

async function processFoodOptionsRequest(
  foodName: string,
  unit: string,
  authenticatedUserId: string,
  serviceConfigId: string
): Promise<FoodOptionsResult> {
  if (!serviceConfigId) {
    return {
      success: false,
      category: 'no_ai_configured',
      error: 'AI service configuration ID is missing.',
    };
  }
  const aiService = await chatRepository.getAiServiceSettingForBackend(
    serviceConfigId,
    authenticatedUserId
  );
  if (!aiService) {
    return {
      success: false,
      category: 'no_ai_configured',
      error: 'AI service setting not found for the provided ID.',
    };
  }
  const source = aiService.source || 'unknown';
  log(
    'info',
    `Processing food options request for user ${authenticatedUserId} using AI service from ${source} (ID: ${serviceConfigId})`
  );

  // Dispatch reads everything from the decrypted backend detail. The helper
  // enforces the supported-provider, api-key, and custom-url checks and
  // reports each as a category the route maps to an HTTP status.
  const provider: ProviderConfig = {
    service_type: aiService.service_type,
    api_key: aiService.api_key ?? undefined,
    model_name: aiService.model_name ?? undefined,
    custom_url: aiService.custom_url ?? undefined,
    timeout: aiService.timeout ?? undefined,
  };

  const prompt = `${FOOD_OPTIONS_PROMPT}\n\nGENERATE_FOOD_OPTIONS:${foodName} in ${unit}`;

  const result = await dispatchAiRequest({
    provider,
    prompt,
    parseJson: true,
    temperature: FOOD_OPTIONS_TEMPERATURE,
  });

  if (!result.ok) {
    log(
      result.category === 'refused' || result.category === 'no_content'
        ? 'warn'
        : 'error',
      `Food options: ${provider.service_type} failed for user ${authenticatedUserId} (${result.category}): ${result.detail}`
    );
    return { success: false, category: result.category, error: result.detail };
  }
  return { success: true, content: result.text };
}
async function processChatMessageStream(
  messages: ChatMessage[],
  serviceConfigId: string,
  authenticatedUserId: string,
  reqHeaders?: IncomingHttpHeaders
) {
  let mcpClient: Awaited<ReturnType<typeof getMcpClient>> | undefined;
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

    let modelInstance: Parameters<typeof streamText>[0]['model'];
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

    // Connect to MCP Server using helper function
    mcpClient = await getMcpClient(reqHeaders);

    const [customCategories, chatTz] = await Promise.all([
      measurementRepository.getCustomCategories(authenticatedUserId),
      loadUserTimezone(authenticatedUserId),
    ]);

    const customCategoriesList =
      customCategories.length > 0
        ? customCategories
            .map(
              (cat: DatabaseCustomCategories) =>
                `- ${cat.name} (${cat.measurement_type}, ${cat.frequency})`
            )
            .join('\n')
        : 'None';

    const systemPromptContent = getSystemPrompt(chatTz, customCategoriesList);

    const allTools = await mcpClient.tools();
    const chatbotTools: NonNullable<Parameters<typeof streamText>[0]['tools']> =
      {};
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

    const conversationMessages = messages.map((msg: ChatMessage) => {
      // If parts or content is an array of parts (text + images), pass them through
      const partsSource = Array.isArray(msg.parts)
        ? msg.parts
        : Array.isArray(msg.content)
          ? msg.content
          : null;

      if (partsSource) {
        const parts = (partsSource as ChatMessagePart[])
          .map((part: ChatMessagePart) => {
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
            (p: ProcessedMessagePart) =>
              p.type === 'image' ||
              (p.type === 'text' && p.text && p.text.trim() !== '')
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
      `[DEBUG] AI Transmission: Preparing ${llmMessages.length} messages. Last message content structure: ${JSON.stringify(llmMessages[llmMessages.length - 1]?.content || '').substring(0, 200)}`
    );

    // Ensure the window starts with a user message (some models reject assistant-first history)
    while (llmMessages.length > 0 && llmMessages[0].role !== 'user') {
      llmMessages.shift();
    }

    const lastMsg = llmMessages[llmMessages.length - 1];
    const userMessageContent = Array.isArray(lastMsg?.content)
      ? lastMsg.content
          .filter((p: ChatMessagePart) => p.type === 'text')
          .map((p: ChatMessagePart) => p.text || '')
          .join(' ') || '[Image message]'
      : (lastMsg?.content as string) || 'Message sent';

    const result = streamText({
      model: modelInstance,
      system: systemPromptContent,
      messages: llmMessages as NonNullable<
        Parameters<typeof streamText>[0]['messages']
      >,
      tools: chatbotTools,
      stopWhen: stepCountIs(50),
      onFinish: async ({ text }) => {
        // Close MCP Client
        if (mcpClient) {
          await mcpClient.close().catch(() => {});
        }

        // Get the last user message from conversationMessages to ensure parts are captured
        const lastUserMessage = [...conversationMessages]
          .reverse()
          .find((msg) => msg.role === 'user');

        const userMessageParts = Array.isArray(lastUserMessage?.content)
          ? lastUserMessage.content
          : [
              {
                type: 'text' as const,
                text: String(lastUserMessage?.content || ''),
              },
            ];

        // Save to DB on completion
        await chatRepository
          .saveChatHistory({
            user_id: authenticatedUserId,
            content: userMessageContent,
            messageType: 'user',
            parts: userMessageParts,
          })
          .catch((err: unknown) =>
            log('error', 'Failed to save user chat history:', err)
          );

        await chatRepository
          .saveChatHistory({
            user_id: authenticatedUserId,
            content: text,
            messageType: 'assistant',
            parts: [{ type: 'text', text }],
          })
          .catch((err: unknown) =>
            log('error', 'Failed to save assistant chat history:', err)
          );
      },
    });

    return { result, mcpClient };
  } catch (error) {
    if (mcpClient) {
      await mcpClient.close().catch(() => {});
    }
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
