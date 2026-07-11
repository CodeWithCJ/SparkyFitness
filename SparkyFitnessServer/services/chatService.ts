import chatRepository from '../models/chatRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { log } from '../config/logging.js';
import { getDefaultModel } from '../ai/config.js';
import {
  dispatchAiRequest,
  requiresApiKey,
  type DispatchErrorCategory,
  type ProviderConfig,
} from '../ai/providerDispatch.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { TtlCache } from '../utils/ttlCache.js';
import {
  assertOutboundUrlShapeAndLiteralAllowed,
  createGuardedFetch,
  deriveAiNetworkPolicy,
  OutboundUrlBlockedError,
  requiresUserSuppliedAiUrl,
} from '../utils/outboundUrlPolicy.js';
import {
  todayInZone,
  DatabaseCustomCategories,
  AiServiceSettings,
  SparkyChatHistory,
  SparkyChatHistoryMutator,
  TestAiServiceConnectionRequest,
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
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_AGENTIC_STEPS = 15;
// Tighter agent-loop ceiling for the 'core' profile (small/local models with
// no prompt cache): every step re-processes the full prefix from scratch, so
// 15 runaway steps on a confused 3B model is pure token burn. Core-profile
// flows are simple log/read round-trips; 8 steps covers lookup → log → confirm
// with room to spare.
const CORE_PROFILE_MAX_AGENTIC_STEPS = 8;

// Sampling temperature for the 'core' tool profile — resolved only for
// self-hosted services the user flagged as small/local (see
// prepareChatContext). Small models emit noticeably steadier tool-call JSON at
// a low temperature, and this chat is tool-orchestration first, prose second.
// Cloud providers and full-profile self-hosted services keep their
// provider-tuned defaults (no temperature set).
const CORE_PROFILE_CHAT_TEMPERATURE = 0.2;

// Retries per chat request on persistent provider errors. Each retry re-sends the
// full request (system + tools + history), so a high count multiplies token cost
// on a hard provider outage. 3 covers transient blips without a runaway 5×.
const MAX_PROVIDER_RETRIES = 3;
// A single retry for core-profile (cache-less local) backends: with no prompt
// cache each retry re-processes the entire prefix, and a struggling local
// server rarely recovers on the 3rd identical attempt anyway.
const CORE_PROFILE_MAX_PROVIDER_RETRIES = 1;

// Hard wall-clock cap on one chat request (the agent loop as a whole is
// unbounded otherwise — the chat path never had a timeout, unlike
// providerDispatch.ts). Generous: a slow local model streaming a long answer
// with several tool round-trips can legitimately take minutes.
const CHAT_REQUEST_TIMEOUT_MS = 5 * 60_000;

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
// Per-user cache of the two DB lookups behind every chat turn. Timezone and
// custom categories change rarely (settings edits), so a short TTL keeps a
// multi-turn conversation from re-querying both on each message while a
// settings change still lands within a minute. Never cache auth/permission
// state or secrets here.
const chatContextInputsCache = new TtlCache<{
  chatTz: string;
  customCategoriesList: string;
}>(60_000);

async function prepareChatContext(
  authenticatedUserId: string,
  serviceType: string,
  chatToolProfile?: string | null
) {
  const { chatTz, customCategoriesList } =
    await chatContextInputsCache.getOrLoad(authenticatedUserId, async () => {
      const [customCategories, tz] = await Promise.all([
        measurementRepository.getCustomCategories(authenticatedUserId),
        loadUserTimezone(authenticatedUserId),
      ]);
      return {
        chatTz: tz,
        customCategoriesList:
          customCategories.length > 0
            ? customCategories
                .map(
                  (cat: DatabaseCustomCategories) =>
                    `- ${cat.name} (${cat.measurement_type}, ${cat.frequency})`
                )
                .join('\n')
            : 'None',
      };
    });

  // Per-service chat tool profile. 'core' trims the tool surface for small/local
  // models and is honored for every self-hosted service type (ollama,
  // openai_compatible, custom) — the backends with weak models and no prompt
  // cache, where the 35-tool block is the dominant per-turn token cost. Cloud
  // provider types always get the full set, so a stale 'core' there can never
  // trim it. The default stays 'full' everywhere: openai_compatible/custom can
  // point at powerful endpoints, and silently dropping 15 tools would degrade
  // answer quality for those users.
  const toolProfile: ChatToolProfile =
    requiresUserSuppliedAiUrl(serviceType) && chatToolProfile === 'core'
      ? 'core'
      : 'full';
  const tools = buildChatbotTools(authenticatedUserId, chatTz, toolProfile);
  log(
    'info',
    `Loaded ${Object.keys(tools).length} ${toolProfile} tools for chatbot: ${Object.keys(tools).join(', ')}`
  );

  // Ollama's default server-side context window is 4096 tokens and overflow is
  // truncated *silently* (it chops the prompt head, mangling tool schemas and
  // the system prompt — looks like a "dumb model"). We connect over the
  // OpenAI-compatible endpoint, which ignores a per-request num_ctx, so we can
  // only warn. The 'full' profile is the risky combo; 'core' is the mitigation.
  if (serviceType === 'ollama' && toolProfile === 'full') {
    log(
      'warn',
      `Ollama chat is using the 'full' tool profile (${Object.keys(tools).length} tools), which plus the system prompt and history usually exceeds Ollama's default 4096-token context and gets truncated silently. Raise it (OLLAMA_CONTEXT_LENGTH=16384 or num_ctx in the Modelfile) and/or switch this service to the 'core' tool profile.`
    );
  }

  return {
    systemPromptContent: getSystemPrompt(
      chatTz,
      customCategoriesList,
      toolProfile
    ),
    tools,
    toolProfile,
  };
}

// INVARIANT — keep the request prefix (system prompt + tool schemas) stable
// across turns. Prompt caching (Anthropic breakpoint, OpenAI cache key, Gemini
// auto-cache) and Ollama's KV-cache reuse only kick in when a new request is a
// byte-for-byte prefix extension of the previous one. So this prompt must NOT
// embed per-request values (timestamps, request ids, live totals, entry
// counts). The only inputs here are the day string (changes at most once a day)
// and the user's custom-category list (changes only when they edit categories);
// both are acceptable. If a future feature needs per-turn context, inject it as
// a message, never into this system prompt.
export function getSystemPrompt(
  chatTz: string,
  customCategoriesList: string,
  profile: ChatToolProfile = 'full'
): string {
  const fileName = profile === 'core' ? 'chatbot-core.md' : 'chatbot-full.md';
  const filePath = path.join(__dirname, '../prompts', fileName);
  const template = readFileSync(filePath, 'utf-8').trim();

  // Replace placeholders dynamically
  return template
    .replace(/\${today}/g, todayInZone(chatTz))
    .replace(/\${customCategories}/g, customCategoriesList);
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
// Tighter history window for the 'core' profile, which is only resolved for
// Ollama services the user has flagged as small/local (see prepareChatContext).
// Their context window is often just 4096-8192 tokens, so a smaller *intact*
// history beats a larger one that Ollama silently truncates. Cloud providers
// and full-profile Ollama keep the full CONTEXT_TOKEN_BUDGET.
const CORE_PROFILE_CONTEXT_TOKEN_BUDGET = 2000;
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

// ---------------------------------------------------------------------------
// Helpers shared by the blocking (processChatMessage) and streaming
// (processChatMessageStream) paths. These blocks used to be duplicated in
// both functions and drifted; keep changes here so both paths stay in sync.
// ---------------------------------------------------------------------------

// The service-setting fields the provider factory needs.
interface ChatAiServiceConfig {
  service_type: string;
  api_key?: string | null;
  custom_url?: string | null;
}

// Resolves the AI SDK model instance for a chat service: native adapters for
// openai/anthropic/google, and the OpenAI-compatible base-URL ladder for
// everything else. Self-hosted types get the SSRF-guarded fetch.
function createChatModelInstance(
  aiService: ChatAiServiceConfig,
  modelName: string,
  networkPolicy: ReturnType<typeof deriveAiNetworkPolicy>
): Parameters<typeof generateText>[0]['model'] {
  const apiKey = aiService.api_key ?? undefined;

  if (aiService.service_type === 'openai') {
    return createOpenAI({ apiKey })(modelName);
  }
  if (aiService.service_type === 'anthropic') {
    return createAnthropic({ apiKey })(modelName);
  }
  if (aiService.service_type === 'google') {
    return createGoogleGenerativeAI({ apiKey })(modelName);
  }
  if (
    aiService.service_type === 'ollama' ||
    aiService.service_type === 'openai_compatible' ||
    aiService.service_type === 'custom' ||
    aiService.service_type === 'mistral' ||
    aiService.service_type === 'groq' ||
    aiService.service_type === 'openrouter' ||
    aiService.service_type === 'xai'
  ) {
    // Connect as OpenAI-compatible
    let baseURL = aiService.custom_url ?? undefined;
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
    const providerOptions: Parameters<typeof createOpenAI>[0] = {
      baseURL,
      apiKey: apiKey || 'no-key',
    };
    if (requiresUserSuppliedAiUrl(aiService.service_type)) {
      providerOptions.fetch = createGuardedFetch(networkPolicy);
    }
    return createOpenAI(providerOptions).chat(modelName);
  }
  throw new Error(`Unsupported service type: ${aiService.service_type}`);
}

// Maps one client message part to a CoreMessage part; unknown parts fall back
// to text.
function mapMessagePart(part: ChatMessagePart): ProcessedMessagePart {
  if (part.type === 'text') {
    return { type: 'text' as const, text: part.text || part.content || '' };
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
}

// Maps client chat messages (parts arrays or plain strings) to CoreMessages.
function toCoreMessages(messages: ChatMessage[]): LlmMessage[] {
  return messages.map((msg) => {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    const partsSource = Array.isArray(msg.parts)
      ? msg.parts
      : Array.isArray(msg.content)
        ? (msg.content as ChatMessagePart[])
        : null;

    if (partsSource) {
      const parts = partsSource
        .map(mapMessagePart)
        .filter(
          (p) =>
            p.type === 'image' ||
            (p.type === 'text' && p.text && p.text.trim() !== '')
        );
      if (parts.length > 0) {
        return { role, content: parts };
      }
    }

    if (typeof msg.content === 'string' && msg.content.trim() !== '') {
      return { role, content: msg.content };
    }
    return { role, content: '' };
  });
}

// Applies the context-window controls in order: drop trailing empty assistant
// messages some clients send, strip historical images, trim to the profile's
// token budget, and ensure the window starts with a user message (some models
// reject assistant-first history).
function buildLlmWindow(
  conversationMessages: LlmMessage[],
  toolProfile: ChatToolProfile
): LlmMessage[] {
  const msgs = [...conversationMessages];
  while (
    msgs.length > 0 &&
    msgs[msgs.length - 1].role === 'assistant' &&
    (!msgs[msgs.length - 1].content ||
      (Array.isArray(msgs[msgs.length - 1].content) &&
        msgs[msgs.length - 1].content.length === 0))
  ) {
    msgs.pop();
  }

  const llmMessages = trimToTokenBudget(
    stripHistoricalImages(msgs),
    toolProfile === 'core'
      ? CORE_PROFILE_CONTEXT_TOKEN_BUDGET
      : CONTEXT_TOKEN_BUDGET
  );

  while (llmMessages.length > 0 && llmMessages[0].role !== 'user') {
    llmMessages.shift();
  }
  return llmMessages;
}

// Derives the display text and parts for saving a user message to history.
function describeUserMessage(msg?: LlmMessage): {
  content: string;
  parts: ChatMessagePart[];
} {
  const content = Array.isArray(msg?.content)
    ? msg.content
        .filter((p: ChatMessagePart) => p.type === 'text')
        .map((p: ChatMessagePart) => p.text || '')
        .join(' ') || '[Image message]'
    : (msg?.content as string) || 'Message sent';
  const parts: ChatMessagePart[] = Array.isArray(msg?.content)
    ? msg.content
    : [{ type: 'text' as const, text: String(msg?.content || '') }];
  return { content, parts };
}

async function processChatMessage(
  messages: ChatMessage[],
  serviceConfigId: string,
  userId: string,
  authenticatedUserId: string,
  actorIsAdmin = false
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

    if (requiresApiKey(aiService.service_type) && !aiService.api_key) {
      throw new Error('API key missing for selected AI service.');
    }

    const modelName =
      aiService.model_name || getDefaultModel(aiService.service_type);
    const networkPolicy = deriveAiNetworkPolicy(aiService, actorIsAdmin);

    const modelInstance = createChatModelInstance(
      aiService,
      modelName,
      networkPolicy
    );

    const { systemPromptContent, tools, toolProfile } =
      await prepareChatContext(
        authenticatedUserId,
        aiService.service_type,
        aiService.chat_tool_profile
      );

    const chatProviderOptions = buildChatProviderOptions(
      aiService.service_type,
      authenticatedUserId,
      modelName
    );

    // Map conversation history messages to CoreMessage format, then apply the
    // shared context-window controls (image strip, token budget, user-first).
    const conversationMessages = toCoreMessages(messages);
    const llmMessages = buildLlmWindow(conversationMessages, toolProfile);

    const executedToolsList: Array<{
      name: string;
      args: Record<string, unknown>;
    }> = [];
    const toolOutputs: string[] = [];

    const result = await generateText({
      model: modelInstance,
      system: systemPromptContent,
      messages: llmMessages as NonNullable<
        Parameters<typeof generateText>[0]['messages']
      >,
      tools,
      providerOptions: chatProviderOptions,
      // Low temperature only for small local models (core profile); cloud and
      // full-profile Ollama keep provider defaults.
      ...(toolProfile === 'core' && {
        temperature: CORE_PROFILE_CHAT_TEMPERATURE,
      }),
      // Tighter step/retry ceilings for cache-less core-profile backends,
      // where every step and retry re-processes the full prefix.
      stopWhen: stepCountIs(
        toolProfile === 'core'
          ? CORE_PROFILE_MAX_AGENTIC_STEPS
          : MAX_AGENTIC_STEPS
      ),
      maxRetries:
        toolProfile === 'core'
          ? CORE_PROFILE_MAX_PROVIDER_RETRIES
          : MAX_PROVIDER_RETRIES,
      abortSignal: AbortSignal.timeout(CHAT_REQUEST_TIMEOUT_MS),
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
          toolResults.forEach((r) => {
            if (r.output && typeof r.output === 'string') {
              toolOutputs.push(r.output);
            }
          });
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
    const { content: userMessageContent, parts: userMessageParts } =
      describeUserMessage(
        conversationMessages[conversationMessages.length - 1]
      );

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

    let finalContent = result.text.trim();
    if (!finalContent) {
      if (executedToolsList.length > 0) {
        const lastTool = executedToolsList[executedToolsList.length - 1];
        if (lastTool.name === 'sparky_manage_food') {
          if (lastTool.args?.action === 'log_water') {
            finalContent = "I've logged your water intake.";
          } else {
            finalContent = "I've logged that food for you.";
          }
        } else if (lastTool.name === 'sparky_manage_exercise') {
          finalContent = "I've logged your exercise.";
        } else if (lastTool.name === 'sparky_manage_checkin') {
          if (lastTool.args?.action === 'log_mood') {
            finalContent = "I've recorded your mood.";
          } else if (lastTool.args?.action === 'log_sleep') {
            finalContent = "I've logged your sleep.";
          } else if (lastTool.args?.action === 'log_biometrics') {
            finalContent = "I've updated your biometrics.";
          } else if (lastTool.args?.action === 'log_fasting') {
            finalContent = "I've logged your fasting window.";
          } else {
            finalContent = "I've updated your wellness diary.";
          }
        } else {
          finalContent = "I've recorded that for you!";
        }
        log(
          'info',
          `[chat] LLM returned empty text; generated generic fallback confirmation: "${finalContent}"`
        );
      } else {
        finalContent = EMPTY_RESPONSE_ERROR_TEXT;
      }
    }

    if (finalContent) {
      await chatRepository
        .saveChatHistory({
          user_id: userId,
          content: finalContent,
          messageType: 'assistant',
          parts: [{ type: 'text', text: finalContent }],
        })
        .catch((err: unknown) =>
          log('error', 'Failed to save assistant chat history:', err)
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
      content: finalContent,
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
  serviceConfigId: string,
  actorIsAdmin = false
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
    networkPolicy: deriveAiNetworkPolicy(aiService, actorIsAdmin),
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

// Minimal completion used only to confirm a provider config actually works.
const TEST_CONNECTION_PROMPT = 'Reply with the single word: OK.';
// A short timeout so an unreachable custom URL fails in ~15s rather than hanging
// for the 90s/120s dispatch defaults. Retry behavior is safe: only HTTP 429 is
// retried; timeouts and 401/403 return immediately.
const TEST_CONNECTION_TIMEOUT_MS = 15_000;
// Types without preset models point at user-hosted servers with no reliable
// default, so a blank effective model would let dispatch substitute a
// meaningless getDefaultModel default the UI never intends.
const NO_PRESET_SERVICE_TYPES = new Set([
  'ollama',
  'openai_compatible',
  'custom',
]);

export type TestConnectionResult =
  | { ok: true }
  | { ok: false; category: DispatchErrorCategory; detail: string };

function statusError(message: string, statusCode: number): Error {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = statusCode;
  return err;
}

/**
 * Run a minimal live completion against a provider config to verify it works,
 * without persisting anything. Returns `{ ok: true }` or `{ ok: false, category,
 * detail }`; the route returns HTTP 200 for both so the UI can show a friendly,
 * category-specific toast. Throws (with `.statusCode`) only for the security
 * gates the UI never legitimately triggers. See routes/chatRoutes for gate #1.
 */
async function testAiServiceConnection(
  payload: TestAiServiceConnectionRequest,
  userId: string,
  isAdmin: boolean
): Promise<TestConnectionResult> {
  const serviceType = payload.service_type;
  let apiKey = payload.api_key?.trim() || undefined;
  let customUrl = payload.custom_url?.trim() || undefined;
  let modelName = payload.model_name?.trim() || undefined;

  // Stored-key fallback: the api_key field is blank by design on edit (the key
  // is encrypted server-side and never sent to the browser), so a test on a
  // saved service must reuse the stored, decrypted key.
  if (payload.id && !apiKey) {
    const stored = await chatRepository.getDecryptedAiServiceSettingById(
      payload.id,
      userId
    );
    if (stored) {
      // Gate #2 (global-key protection): /chat is authenticate-only and the RLS
      // SELECT policy returns every is_public row to any authenticated user, so
      // a non-admin must not be able to make the server decrypt the operator's
      // global key and POST it to an attacker-supplied custom_url.
      if (stored.is_public && !isAdmin) {
        throw statusError(
          'Only administrators can test global AI service settings.',
          403
        );
      }
      // Gate #3 (provider-mismatch protection): only reuse the stored key when
      // the stored row's provider matches the requested one. Switching a saved
      // OpenAI service to 'custom' and leaving the key blank must NOT send the
      // stored OpenAI key to a different provider/URL.
      if (stored.service_type === serviceType) {
        apiKey = stored.api_key ?? undefined;
        customUrl = customUrl ?? stored.custom_url ?? undefined;
        modelName = modelName ?? stored.model_name ?? undefined;
      }
    }
  }

  // Gate #4 (SSRF): a test fires an outbound POST to the effective custom URL, so
  // a non-admin must not aim it at a private/internal address (localhost, RFC1918,
  // link-local, cloud metadata). The URL is validated post-fallback so a stored
  // value is checked too. Admins (trusted operator) and the ALLOW_PRIVATE_NETWORK_AI
  // opt-in bypass this, keeping self-hosted setups like local Ollama working.
  if (customUrl) {
    const networkPolicy = deriveAiNetworkPolicy({ source: 'user' }, isAdmin);
    try {
      assertOutboundUrlShapeAndLiteralAllowed(customUrl, networkPolicy);
    } catch (error) {
      // Policy denials (private/internal address) are 403; a URL fetch could
      // never use (malformed, wrong scheme, credentials) is a plain 400.
      throw statusError(
        error instanceof Error
          ? error.message
          : 'Custom AI service URLs must be public http(s) endpoints. Private or internal addresses are not allowed.',
        error instanceof OutboundUrlBlockedError ? 403 : 400
      );
    }
  }

  // Validate after fallback: a no-preset type with a blank effective model would
  // otherwise dispatch with a meaningless getDefaultModel default.
  if (NO_PRESET_SERVICE_TYPES.has(serviceType) && !modelName) {
    throw statusError('A model name is required for this service type.', 400);
  }

  const provider: ProviderConfig = {
    service_type: serviceType,
    api_key: apiKey,
    model_name: modelName,
    custom_url: customUrl,
  };

  const result = await dispatchAiRequest({
    provider,
    networkPolicy: deriveAiNetworkPolicy(
      { is_public: false, source: 'user' },
      isAdmin
    ),
    prompt: TEST_CONNECTION_PROMPT,
    temperature: 0,
    timeoutMs: TEST_CONNECTION_TIMEOUT_MS,
  });

  if (!result.ok) {
    log(
      'warn',
      `Test connection: ${serviceType} failed for user ${userId} (${result.category}): ${result.detail}`
    );
    return { ok: false, category: result.category, detail: result.detail };
  }
  return { ok: true };
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
  authenticatedUserId: string,
  actorIsAdmin = false
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

    const modelName =
      aiService.model_name || getDefaultModel(aiService.service_type);
    const networkPolicy = deriveAiNetworkPolicy(aiService, actorIsAdmin);

    log(
      'info',
      `Streaming chat message with service: ${aiService.service_type}, model: ${modelName}`
    );

    const modelInstance = createChatModelInstance(
      aiService,
      modelName,
      networkPolicy
    );

    const { systemPromptContent, tools, toolProfile } =
      await prepareChatContext(
        authenticatedUserId,
        aiService.service_type,
        aiService.chat_tool_profile
      );

    const chatProviderOptions = buildChatProviderOptions(
      aiService.service_type,
      authenticatedUserId,
      modelName
    );

    // Map client messages to CoreMessage format, then apply the shared
    // context-window controls (image strip, token budget, user-first).
    const conversationMessages = toCoreMessages(messages);
    const llmMessages = buildLlmWindow(conversationMessages, toolProfile);

    log(
      'debug',
      `[DEBUG] AI Transmission: Preparing ${llmMessages.length} messages. Last message content structure: ${JSON.stringify(llmMessages[llmMessages.length - 1]?.content || '').substring(0, 200)}`
    );

    const { content: userMessageContent } = describeUserMessage(
      llmMessages[llmMessages.length - 1]
    );

    const result = streamText({
      model: modelInstance,
      system: systemPromptContent,
      messages: llmMessages as NonNullable<
        Parameters<typeof streamText>[0]['messages']
      >,
      tools,
      providerOptions: chatProviderOptions,
      // Low temperature only for small local models (core profile); cloud and
      // full-profile Ollama keep provider defaults.
      ...(toolProfile === 'core' && {
        temperature: CORE_PROFILE_CHAT_TEMPERATURE,
      }),
      // Tighter step/retry ceilings for cache-less core-profile backends,
      // where every step and retry re-processes the full prefix.
      stopWhen: stepCountIs(
        toolProfile === 'core'
          ? CORE_PROFILE_MAX_AGENTIC_STEPS
          : MAX_AGENTIC_STEPS
      ),
      maxRetries:
        toolProfile === 'core'
          ? CORE_PROFILE_MAX_PROVIDER_RETRIES
          : MAX_PROVIDER_RETRIES,
      abortSignal: AbortSignal.timeout(CHAT_REQUEST_TIMEOUT_MS),
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
export { testAiServiceConnection };
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
  testAiServiceConnection,
  processChatMessageStream,
};
