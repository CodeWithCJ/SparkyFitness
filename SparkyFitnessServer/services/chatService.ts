import chatRepository from '../models/chatRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
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

import { generateText, streamText, stepCountIs } from 'ai';
import type { JSONValue, LanguageModelUsage, UIMessageChunk } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { buildChatbotTools, type ChatToolProfile } from '../ai/tools/index.js';

const MAX_AGENTIC_STEPS = 15;

// Retries per chat request on persistent provider errors. Each retry re-sends the
// full request (system + tools + history), so a high count multiplies token cost
// on a hard provider outage. 3 covers transient blips without a runaway 5×.
const MAX_PROVIDER_RETRIES = 3;

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

      // Sync active state to user_preferences
      if (serviceData.is_active !== undefined) {
        const currentPrefs =
          await preferenceRepository.getUserPreferences(authenticatedUserId);
        if (serviceData.is_active) {
          // Auto-select this service only when no provider is selected yet, so
          // the user's first enabled service powers AI features immediately.
          // Enabling a second service must not hijack an existing selection —
          // the active-provider dropdown (Settings or chat) is the authoritative
          // way to *change* the active provider; enable only toggles availability.
          if (!currentPrefs?.active_ai_service_id) {
            await preferenceRepository.updateUserPreferences(
              authenticatedUserId,
              {
                active_ai_service_id: result.id,
              }
            );
          }
        } else if (
          currentPrefs &&
          currentPrefs.active_ai_service_id === result.id
        ) {
          await preferenceRepository.updateUserPreferences(
            authenticatedUserId,
            {
              active_ai_service_id: null,
            }
          );
        }
      }

      const {
        encrypted_api_key: _encrypted_api_key,
        api_key_iv: _api_key_iv,
        api_key_tag: _api_key_tag,
        ...safeSetting
      } = result as Record<string, unknown>;
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
        'debug',
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
/**
 * Loads the per-user chat context shared by the blocking and streaming paths:
 * the system prompt (custom categories + timezone) and the in-process tool
 * registry. Everything is scoped to the authenticated user — chat tool calls
 * always act as the logged-in actor, matching the previous MCP behavior.
 */
async function prepareChatContext(
  authenticatedUserId: string,
  serviceType: string,
  chatToolProfile?: string | null
) {
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

  // Per-service chat tool profile. 'core' trims the tool surface for small/local
  // models and is only offered for Ollama; every other backend always gets the
  // full set, so a stale 'core' on a non-Ollama service can never trim it.
  const toolProfile: ChatToolProfile =
    serviceType === 'ollama' && chatToolProfile === 'core' ? 'core' : 'full';
  const tools = buildChatbotTools(authenticatedUserId, chatTz, toolProfile);
  log(
    'info',
    `Loaded ${Object.keys(tools).length} ${toolProfile} tools for chatbot: ${Object.keys(tools).join(', ')}`
  );

  return {
    systemPromptContent: getSystemPrompt(
      chatTz,
      customCategoriesList,
      toolProfile
    ),
    tools,
  };
}

export function getSystemPrompt(
  chatTz: string,
  customCategoriesList: string,
  profile: ChatToolProfile = 'full'
): string {
  // Vision tools (sparky_analyze_food_image, sparky_scan_label) are dropped
  // from the 'core' profile, so omit their guidance there — keeping the prompt
  // a strict subset of the full one and never pointing small/local models at
  // tools they don't have.
  const visionSupport =
    profile === 'full'
      ? `

## VISION SUPPORT
You are a multimodal AI. When the user provides an image (photo of food, meal, or nutrition label):
1. **Analyze it directly** using your built-in vision capabilities. You can see the images in the conversation history.
2. If you need a more structured nutritional estimate or if the image is a complex meal, you can use the 'sparky_analyze_food_image' tool as a secondary step.
3. For nutrition labels, you can use 'sparky_scan_label' to ensure high accuracy in data extraction.
4. Based on your analysis, proceed to log the entry using the appropriate tools (e.g., 'sparky_manage_food').`
      : '';

  return `You are Sparky, an AI nutrition and wellness coach. Your primary goal is to help users track their food, exercise, and measurements, and provide helpful advice and motivation based on their data and general health knowledge.

The current local date is ${todayInZone(chatTz)}.

When the user mentions logging food, exercise, or measurements, prioritize using the matching tools.

Here are the user's existing custom measurement categories:
${customCategoriesList}

When logging measurements or custom categories, compare user inputs to the list above. If you find a match or variations (synonyms, capitalization), use the exact category name.

For solid food items or beverages that are not water, use the 'sparky_manage_food' tool. Do NOT classify water as food. Use the 'sparky_manage_food' tool with the 'log_water' action for water intake.

## MANDATORY FOOD LOOKUP RULE
BEFORE creating any new food entry or logging food that may not exist in the database, you MUST call the 'sparky_manage_food' tool with the 'lookup_food_nutrition' action first to search for verified nutritional data. This searches internal database, user food providers, OpenFoodFacts, and other verified sources.

- If 'lookup_food_nutrition' returns nutrition data (calories > 0), use that data when calling 'sparky_manage_food' with the 'log_food' action. Do NOT override it with your own estimates.
- Only use AI-estimated nutrition if 'lookup_food_nutrition' explicitly returns no data or a zero-calorie result.
- Always tell the user the source of nutrition data (e.g., "from OpenFoodFacts", "from internal database", "AI estimate").
- If the user explicitly asks for internet search or a specific source, pass that preference to 'lookup_food_nutrition' using the provider_type parameter.
- **Nutritional detail**: When creating a food via the 'create_food' action, include any micronutrients (saturated_fat, fiber, sugar, sodium, etc.) the looked-up source provides or that you can confidently derive. Don't fabricate values you can't reasonably estimate, and don't pad unknown fields with zeros.${visionSupport}

Be precise with data extraction and call the correct tools in the correct order.`;
}

// OpenAI's 24h extended retention is only supported on the gpt-5.1+ families
// (per @ai-sdk/openai), and the adapter forwards the field without gating, so
// other models may reject it. Mirror the adapter's own family check.
const RETENTION_24H_MODEL_PREFIXES = [
  'gpt-5.1',
  'gpt-5.2',
  'gpt-5.3',
  'gpt-5.4',
  'gpt-5.5',
];

// Only the canonical 'openai' service type needs request-level providerOptions.
// The OpenAI-compatible types share the `openai` namespace via createOpenAI(), so
// gate strictly to 'openai' to avoid injecting prompt_cache_* into backends that
// may reject it. (Anthropic caches on the tools — see ai/tools/index.ts; Gemini
// auto-caches with no flag.)
export function buildChatProviderOptions(
  serviceType: string,
  userId: string,
  modelName: string
): Record<string, Record<string, JSONValue>> | undefined {
  if (serviceType !== 'openai') return undefined;
  const openai: Record<string, JSONValue> = {
    promptCacheKey: `sparky-chat-${userId}`,
  };
  if (RETENTION_24H_MODEL_PREFIXES.some((p) => modelName.startsWith(p))) {
    openai.promptCacheRetention = '24h';
  }
  return { openai };
}

interface LlmMessage {
  role: string;
  content: string | ProcessedMessagePart[];
}

// Vision images are stored as base64 data URLs and re-sent inside the context
// window on every turn until they age out, costing ~1-2K+ uncached tokens each,
// each turn. The model only needs to *see* an image on the turn it arrives; for
// earlier turns the assistant's text reply already captured the analysis. Strip
// image parts from every message except the latest user turn. A turn that was
// image-only keeps a short placeholder so it never becomes empty (some providers
// reject empty messages); turns with accompanying text just lose the image.
function stripHistoricalImages(messages: LlmMessage[]): LlmMessage[] {
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIndex = i;
      break;
    }
  }

  return messages.map((msg, index) => {
    if (index === lastUserIndex || !Array.isArray(msg.content)) {
      return msg;
    }
    const withoutImages = msg.content.filter((part) => part.type !== 'image');
    if (withoutImages.length === msg.content.length) {
      return msg;
    }
    return {
      ...msg,
      content:
        withoutImages.length > 0
          ? withoutImages
          : [{ type: 'text' as const, text: '[image omitted]' }],
    };
  });
}

// Token budget for the conversation-history window. A token budget is steadier
// than a fixed message count: 20 short turns and 20 turns full of long pastes or
// tool dumps cost wildly different amounts, and a count can't tell them apart.
const CONTEXT_TOKEN_BUDGET = 6000;
// Flat per-image cost. A base64 data URL is tens of KB of characters but bills as
// roughly a fixed number of vision tokens, so char-based estimation would
// massively overcount it. Past images are already stripped, so in practice this
// only covers the current turn's image (which is always kept regardless).
const IMAGE_TOKEN_ESTIMATE = 1500;
// Rough English chars-per-token, plus a small fixed per-message structural cost
// (role markers, delimiters) so a long run of tiny messages still bounds.
const CHARS_PER_TOKEN = 4;
const PER_MESSAGE_OVERHEAD = 4;

function estimateMessageTokens(
  content: string | ProcessedMessagePart[]
): number {
  if (typeof content === 'string') {
    return PER_MESSAGE_OVERHEAD + Math.ceil(content.length / CHARS_PER_TOKEN);
  }
  let total = PER_MESSAGE_OVERHEAD;
  for (const part of content) {
    total +=
      part.type === 'image'
        ? IMAGE_TOKEN_ESTIMATE
        : Math.ceil((part.text?.length ?? 0) / CHARS_PER_TOKEN);
  }
  return total;
}

// Keep the most recent messages whose estimated tokens fit the budget, walking
// newest-first. The final (current-turn) message is always kept even if it alone
// blows the budget — we never drop the user's actual question.
function trimToTokenBudget(
  messages: LlmMessage[],
  budget: number
): LlmMessage[] {
  let used = 0;
  let startIndex = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateMessageTokens(messages[i].content);
    const isCurrentTurn = i === messages.length - 1;
    if (!isCurrentTurn && used + cost > budget) {
      break;
    }
    used += cost;
    startIndex = i;
  }
  return messages.slice(startIndex);
}

async function processChatMessage(
  messages: ChatMessage[],
  serviceConfigId: string,
  userId: string,
  authenticatedUserId: string
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
      userId
    );
    if (!aiService) {
      throw new Error('AI service setting not found for the provided ID.');
    }

    const source = aiService.source || 'unknown';
    log(
      'info',
      `Processing chat message for user ${userId} using AI service from ${source} (ID: ${serviceConfigId})`
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
      aiService.service_type === 'openrouter' ||
      aiService.service_type === 'xai'
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
      } else if (aiService.service_type === 'xai') {
        baseURL = 'https://api.x.ai/v1';
      }
      const provider = createOpenAI({
        baseURL,
        apiKey: apiKey || 'no-key',
      });
      modelInstance = provider.chat(modelName);
    } else {
      throw new Error(`Unsupported service type: ${aiService.service_type}`);
    }

    const { systemPromptContent, tools } = await prepareChatContext(
      authenticatedUserId,
      aiService.service_type,
      aiService.chat_tool_profile
    );

    const chatProviderOptions = buildChatProviderOptions(
      aiService.service_type,
      authenticatedUserId,
      modelName
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

    // Filter out trailing empty assistant messages if sent by the client
    while (
      conversationMessages.length > 0 &&
      conversationMessages[conversationMessages.length - 1].role ===
        'assistant' &&
      !conversationMessages[conversationMessages.length - 1].content
    ) {
      conversationMessages.pop();
    }

    // Mirror the streaming path's context-window controls so the non-streaming
    // route doesn't resend historical images or overflow the context budget.
    const strippedMessages = stripHistoricalImages(conversationMessages);
    const llmMessages = trimToTokenBudget(
      strippedMessages,
      CONTEXT_TOKEN_BUDGET
    );

    // Ensure the window starts with a user message (some models reject assistant-first history)
    while (llmMessages.length > 0 && llmMessages[0].role !== 'user') {
      llmMessages.shift();
    }

    const executedToolsList: Array<{
      name: string;
      args: Record<string, unknown>;
    }> = [];

    const result = await generateText({
      model: modelInstance,
      system: systemPromptContent,
      messages: llmMessages as NonNullable<
        Parameters<typeof generateText>[0]['messages']
      >,
      tools,
      providerOptions: chatProviderOptions,
      stopWhen: stepCountIs(MAX_AGENTIC_STEPS),
      maxRetries: MAX_PROVIDER_RETRIES,
      onStepFinish({ toolCalls, toolResults }) {
        if (toolCalls && toolCalls.length > 0) {
          toolCalls.forEach((call) => {
            log(
              'info',
              `Agent executed tool call: ${call.toolName} with args: ${JSON.stringify(call.input)}`
            );
            executedToolsList.push({
              name: call.toolName,
              args: call.input as Record<string, unknown>,
            });
          });
        }
        if (toolResults && toolResults.length > 0) {
          const sizes = toolResults
            .map((r) => `${r.toolName}=${String(r.output ?? '').length}c`)
            .join(' ');
          log('info', `[chat] tool result sizes: ${sizes}`);
        }
      },
    });

    const usage = result.totalUsage ?? result.usage;
    log(
      'info',
      `[chat] provider=${aiService.service_type} model=${modelName} cacheReadTokens=${usage?.inputTokenDetails?.cacheReadTokens ?? 0} inputTokens=${usage?.inputTokens ?? 0} noCacheTokens=${usage?.inputTokenDetails?.noCacheTokens ?? 0} cacheWriteTokens=${usage?.inputTokenDetails?.cacheWriteTokens ?? 0} outputTokens=${usage?.outputTokens ?? 0} totalTokens=${usage?.totalTokens ?? 0}`
    );

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
        user_id: userId,
        content: userMessageContent,
        messageType: 'user',
        parts: userMessageParts,
      })
      .catch((err: unknown) =>
        log('error', 'Failed to save user chat history:', err)
      );

    if (result.text.trim()) {
      await chatRepository
        .saveChatHistory({
          user_id: userId,
          content: result.text,
          messageType: 'assistant',
          parts: [{ type: 'text', text: result.text }],
        })
        .catch((err: unknown) =>
          log('error', 'Failed to save assistant chat history:', err)
        );
    } else {
      log(
        'warn',
        `Skipping empty assistant chat history for user ${userId} (finishReason: ${result.finishReason})`
      );
    }

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
    log('error', `Error processing chat message for user ${userId}:`, error);
    throw error;
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
const EMPTY_RESPONSE_ERROR_TEXT =
  'The AI service returned an empty response. Please try again.';

// Some providers (notably Gemini via MALFORMED_FUNCTION_CALL) end a tool-calling
// turn with finishReason 'error' and an empty completion instead of a thrown
// error, so the stream closes cleanly and clients render nothing. Inject an
// explicit error chunk so the UI surfaces a failure instead of staying silent.
function withEmptyCompletionGuard(
  stream: ReadableStream<UIMessageChunk>
): ReadableStream<UIMessageChunk> {
  let sawContent = false;
  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (
          chunk.type === 'text-delta' ||
          chunk.type === 'reasoning-delta' ||
          chunk.type.startsWith('tool-')
        ) {
          sawContent = true;
        }
        if (
          chunk.type === 'finish' &&
          (chunk.finishReason === 'error' || !sawContent)
        ) {
          controller.enqueue({
            type: 'error',
            errorText: EMPTY_RESPONSE_ERROR_TEXT,
          });
        }
        controller.enqueue(chunk);
      },
    })
  );
}

// Shape provider usage into the keys @assistant-ui/react-ai-sdk's
// getThreadMessageTokenUsage reads off the streamed message metadata, so the
// chat UI can surface per-message token counts. cacheReadTokens is the
// cached-input figure; the adapter's normalizeUsage drops undefined fields, so
// providers reporting partial or no usage stay safe.
//
// Nest under `custom`: assistant-ui's fromThreadMessageLike normalization keeps
// only known metadata keys (`custom`, `steps`, `unstable_*`, ...) and discards
// unknown top-level keys, so a bare `{ usage }` would be stripped before it
// reaches the thread message. `metadata.custom.usage` survives, and the adapter
// reads exactly that path.
export function mapUsageToMetadata(u: LanguageModelUsage) {
  return {
    custom: {
      usage: {
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        totalTokens: u.totalTokens,
        cachedInputTokens: u.inputTokenDetails?.cacheReadTokens,
      },
    },
  };
}

async function processChatMessageStream(
  messages: ChatMessage[],
  serviceConfigId: string,
  userId: string,
  authenticatedUserId: string
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
      userId
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
      aiService.service_type === 'openrouter' ||
      aiService.service_type === 'xai'
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
      } else if (aiService.service_type === 'xai') {
        baseURL = 'https://api.x.ai/v1';
      }
      const provider = createOpenAI({
        baseURL,
        apiKey: apiKey || 'no-key',
      });
      modelInstance = provider.chat(modelName);
    } else {
      throw new Error(`Unsupported service type: ${aiService.service_type}`);
    }

    const { systemPromptContent, tools } = await prepareChatContext(
      authenticatedUserId,
      aiService.service_type,
      aiService.chat_tool_profile
    );

    const chatProviderOptions = buildChatProviderOptions(
      aiService.service_type,
      authenticatedUserId,
      modelName
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

    // Drop images from earlier turns first so the token budget reflects what is
    // actually sent; the current user turn keeps its image so live vision
    // analysis still works.
    const strippedMessages = stripHistoricalImages(conversationMessages);

    // Token-budgeted sliding window of recent messages to give the LLM multi-turn
    // context without an unpredictable, count-based blow-up.
    const llmMessages = trimToTokenBudget(
      strippedMessages,
      CONTEXT_TOKEN_BUDGET
    );

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
      tools,
      providerOptions: chatProviderOptions,
      stopWhen: stepCountIs(MAX_AGENTIC_STEPS),
      maxRetries: MAX_PROVIDER_RETRIES,
      onStepFinish({ toolResults }) {
        if (toolResults && toolResults.length > 0) {
          const sizes = toolResults
            .map((r) => `${r.toolName}=${String(r.output ?? '').length}c`)
            .join(' ');
          log('info', `[chat] tool result sizes: ${sizes}`);
        }
      },
      onFinish: async ({ text, finishReason, usage, totalUsage }) => {
        const observedUsage = totalUsage ?? usage;
        log(
          'info',
          `[chat] provider=${aiService.service_type} model=${modelName} cacheReadTokens=${observedUsage?.inputTokenDetails?.cacheReadTokens ?? 0} inputTokens=${observedUsage?.inputTokens ?? 0} noCacheTokens=${observedUsage?.inputTokenDetails?.noCacheTokens ?? 0} cacheWriteTokens=${observedUsage?.inputTokenDetails?.cacheWriteTokens ?? 0} outputTokens=${observedUsage?.outputTokens ?? 0} totalTokens=${observedUsage?.totalTokens ?? 0}`
        );

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
            user_id: userId,
            content: userMessageContent,
            messageType: 'user',
            parts: userMessageParts,
          })
          .catch((err: unknown) =>
            log('error', 'Failed to save user chat history:', err)
          );

        if (!text.trim()) {
          log(
            'warn',
            `Skipping empty assistant chat history for user ${userId} (finishReason: ${finishReason})`
          );
          return;
        }

        await chatRepository
          .saveChatHistory({
            user_id: userId,
            content: text,
            messageType: 'assistant',
            parts: [{ type: 'text', text }],
          })
          .catch((err: unknown) =>
            log('error', 'Failed to save assistant chat history:', err)
          );
      },
    });

    return {
      stream: withEmptyCompletionGuard(
        result.toUIMessageStream({
          messageMetadata: ({ part }) =>
            part.type === 'finish'
              ? mapUsageToMetadata(part.totalUsage)
              : undefined,
        })
      ),
    };
  } catch (error) {
    log(
      'error',
      `Error in processChatMessageStream for user ${userId}:`,
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
