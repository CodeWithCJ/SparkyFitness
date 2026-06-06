import chatRepository from '../models/chatRepository.js';
import { log } from '../config/logging.js';
import { getDefaultVisionModel } from '../ai/config.js';
import {
  foodPhotoEstimateResponseSchema,
  type FoodPhotoEstimateErrorCode,
  type FoodPhotoEstimateResponse,
} from '@workspace/shared';

const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_TOOL_NAME = 'submit_food_estimate';
const ANTHROPIC_MAX_TOKENS = 2048;
const REQUEST_TIMEOUT_MS = 90_000;

const SUPPORTED_PROVIDERS = new Set(['google', 'openai', 'anthropic']);

// Providers whose vision APIs reject HEIC/HEIF (only Gemini accepts them).
// Caught here so the user gets a clean UNSUPPORTED_MIME_TYPE instead of an
// opaque upstream 400 surfaced as a 502.
const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif']);
const HEIC_UNSUPPORTED_PROVIDERS = new Set(['openai', 'anthropic']);

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    meal_summary: {
      type: 'string',
      description:
        "Brief one-line description of the meal as identified, e.g. 'Grilled chicken with rice and broccoli'",
    },
    overall_confidence: {
      type: 'string',
      description:
        'Overall confidence in the full estimate. Low when photo is unclear, items are ambiguous, or portions are hard to judge.',
      enum: ['high', 'medium', 'low'],
    },
    confidence_reason: {
      type: 'string',
      description:
        "Short explanation of what drove the confidence rating, especially if medium or low. Mention specific uncertainties like 'sauce ingredients unclear' or 'portion depth not visible'.",
    },
    items: {
      type: 'array',
      description:
        'Individual food items identified in the meal, broken out separately.',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              "Specific food name, e.g. 'grilled chicken thigh', 'white jasmine rice', 'steamed broccoli'",
          },
          estimated_grams: {
            type: 'number',
            description: 'Estimated weight of this item in grams',
          },
          portion_description: {
            type: 'string',
            description:
              "Human-readable portion, e.g. '1 medium thigh', '1 cup cooked', 'about 1/2 plate'",
          },
          preparation: {
            type: 'string',
            description:
              "How the item was prepared, e.g. 'grilled', 'pan-fried in oil', 'steamed', 'raw'. Empty string if not applicable.",
          },
          calories_kcal: {
            type: 'number',
            description: 'Estimated calories for this item',
          },
          protein_g: {
            type: 'number',
            description: 'Estimated protein in grams',
          },
          carbs_g: {
            type: 'number',
            description: 'Estimated total carbohydrates in grams',
          },
          fat_g: {
            type: 'number',
            description: 'Estimated total fat in grams',
          },
          fiber_g: {
            type: 'number',
            description: 'Estimated dietary fiber in grams',
          },
          sugar_g: {
            type: 'number',
            description: 'Estimated sugars in grams',
          },
          item_confidence: {
            type: 'string',
            description:
              "Confidence in this specific item's identification and portion estimate",
            enum: ['high', 'medium', 'low'],
          },
          assumptions: {
            type: 'array',
            description:
              "Key assumptions made for this item, e.g. 'assumed cooked in 1 tsp oil', 'assumed skinless', 'assumed whole milk'. Empty array if none.",
            items: { type: 'string' },
          },
        },
        required: [
          'name',
          'estimated_grams',
          'portion_description',
          'preparation',
          'calories_kcal',
          'protein_g',
          'carbs_g',
          'fat_g',
          'fiber_g',
          'sugar_g',
          'item_confidence',
          'assumptions',
        ],
        propertyOrdering: [
          'name',
          'estimated_grams',
          'portion_description',
          'preparation',
          'calories_kcal',
          'protein_g',
          'carbs_g',
          'fat_g',
          'fiber_g',
          'sugar_g',
          'item_confidence',
          'assumptions',
        ],
      },
    },
    totals: {
      type: 'object',
      description: 'Summed totals across all items',
      properties: {
        calories_kcal: { type: 'number' },
        protein_g: { type: 'number' },
        carbs_g: { type: 'number' },
        fat_g: { type: 'number' },
        fiber_g: { type: 'number' },
        sugar_g: { type: 'number' },
        total_grams: { type: 'number' },
      },
      required: [
        'calories_kcal',
        'protein_g',
        'carbs_g',
        'fat_g',
        'fiber_g',
        'sugar_g',
        'total_grams',
      ],
      propertyOrdering: [
        'calories_kcal',
        'protein_g',
        'carbs_g',
        'fat_g',
        'fiber_g',
        'sugar_g',
        'total_grams',
      ],
    },
    user_weight_reconciliation: {
      type: 'string',
      description:
        'If the user provided a total weight, explain how it was distributed across items or note any discrepancy with the visual estimate. Empty string if no weight was provided.',
    },
    clarifying_questions: {
      type: 'array',
      description:
        "Up to 3 questions that would most improve accuracy if the user answered them, e.g. 'Was the chicken cooked with oil or butter?'. Empty array if confidence is high.",
      items: { type: 'string' },
    },
  },
  required: [
    'meal_summary',
    'overall_confidence',
    'confidence_reason',
    'items',
    'totals',
    'user_weight_reconciliation',
    'clarifying_questions',
  ],
  propertyOrdering: [
    'meal_summary',
    'overall_confidence',
    'confidence_reason',
    'items',
    'totals',
    'user_weight_reconciliation',
    'clarifying_questions',
  ],
} as const;

type JsonSchemaNode = {
  type?: string;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  additionalProperties?: boolean;
  propertyOrdering?: string[];
  [k: string]: unknown;
};

/**
 * Convert the Gemini-shaped RESPONSE_SCHEMA into a strict-mode JSON Schema
 * accepted by both OpenAI `response_format.json_schema` (strict: true) and
 * Anthropic tool `input_schema` (strict: true). Deep clones, recursively
 * strips `propertyOrdering` (non-standard JSON Schema, rejected in strict
 * mode) and adds `additionalProperties: false` to every object node.
 */
function toStrictJsonSchema(input: unknown): JsonSchemaNode {
  const clone: JsonSchemaNode = JSON.parse(JSON.stringify(input));
  const walk = (node: JsonSchemaNode): void => {
    if (!node || typeof node !== 'object') return;
    delete node.propertyOrdering;
    if (node.type === 'object') {
      node.additionalProperties = false;
      if (node.properties) {
        for (const child of Object.values(node.properties)) {
          walk(child);
        }
      }
    }
    if (node.items) walk(node.items);
  };
  walk(clone);
  return clone;
}

function buildPrompt(
  description: string,
  weight: string,
  imageCount: number
): string {
  const multiImage = imageCount > 1;
  const intro = multiImage
    ? `You are a nutrition estimation assistant. Analyze the ${imageCount} provided photos and return
structured nutrition data. The photos all show ONE meal, not separate meals. They may include
several angles of the same dish plus supporting context such as a menu or item description, or the
packaging or nutrition label of an ingredient. Use every photo together to identify items and
portions, prefer label or menu text when it is more specific than the plate, and do not count the
same item twice when it appears in more than one photo.`
    : `You are a nutrition estimation assistant. Analyze the meal photo and return
structured nutrition data.`;
  const visualSource = multiImage ? 'photos' : 'image';
  return `${intro}

User description (optional): "${description}"

User-provided total weight (optional): "${weight}"

Rules:

  - If the user provided a description, treat it as authoritative over what you
    see in the ${visualSource} when they conflict.
  - If the user provided a total weight, distribute it across items
    proportionally to your visual estimate, then recalculate nutrition.
  - Break mixed dishes into component ingredients when reasonable (e.g. a
    burrito → tortilla, rice, beans, meat, cheese, salsa).
  - Be explicit about assumptions (oil used, milk type, skin on/off).
  - Lower your confidence when portions are ambiguous or ingredients hidden.
  - Only ask clarifying questions that would materially change the estimate.`;
}

export interface PhotoImage {
  base64: string;
  mimeType: string;
}

export interface EstimateFoodPhotoNutritionInput {
  /** One or more images for a single estimate. Preferred over base64Image/mimeType. */
  images?: PhotoImage[];
  /** Legacy single-image field; use images[]. Still accepted for backward compatibility. */
  base64Image?: string;
  /** Legacy single-image field; use images[]. Still accepted for backward compatibility. */
  mimeType?: string;
  userId: string;
  description?: string;
  weightSlot?: string;
}

// Anthropic's Messages API rejects the non-standard 'image/jpg'; normalize it
// to the canonical 'image/jpeg'. The route already rejects 'image/jpg' via its
// allow-list, so this is defense-in-depth for the independently-exported
// service rather than a currently-reachable path.
function normalizeMimeType(mimeType: string): string {
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
}

function resolveImages(input: EstimateFoodPhotoNutritionInput): PhotoImage[] {
  const raw =
    input.images && input.images.length > 0
      ? input.images
      : input.base64Image && input.mimeType
        ? [{ base64: input.base64Image, mimeType: input.mimeType }]
        : [];
  return raw
    .filter(
      (img): img is PhotoImage =>
        !!img &&
        typeof img.base64 === 'string' &&
        typeof img.mimeType === 'string'
    )
    .map((img) => ({
      base64: img.base64,
      mimeType: normalizeMimeType(img.mimeType),
    }));
}

export type EstimateFoodPhotoNutritionResult =
  | { success: true; estimate: FoodPhotoEstimateResponse }
  | { success: false; code: FoodPhotoEstimateErrorCode; error: string };

type ProviderRequest = {
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

type ProviderExtractResult =
  | { kind: 'success'; payload: unknown }
  | { kind: 'error'; code: FoodPhotoEstimateErrorCode; error: string };

function buildGoogleRequest(
  apiKey: string,
  images: PhotoImage[],
  prompt: string,
  model: string
): ProviderRequest {
  return {
    url: `${GEMINI_BASE_URL}/${model}:generateContent`,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: {
      contents: [
        {
          role: 'user',
          parts: [
            ...images.map((img) => ({
              inline_data: { mime_type: img.mimeType, data: img.base64 },
            })),
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    },
  };
}

function extractGoogleResponse(data: unknown): ProviderExtractResult {
  const d = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = d?.candidates?.[0]?.content?.parts;
  const text = parts?.find((p) => typeof p?.text === 'string')?.text;
  if (typeof text !== 'string') {
    return {
      kind: 'error',
      code: 'CONTENT_BLOCKED',
      error:
        'AI service returned no content (likely blocked by safety filters).',
    };
  }
  try {
    return { kind: 'success', payload: JSON.parse(text) };
  } catch {
    return {
      kind: 'error',
      code: 'PARSE_ERROR',
      error: 'AI service returned invalid JSON.',
    };
  }
}

function buildOpenAiRequest(
  apiKey: string,
  images: PhotoImage[],
  prompt: string,
  strictSchema: JsonSchemaNode,
  model: string
): ProviderRequest {
  return {
    url: OPENAI_ENDPOINT,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: {
      model,
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((img) => ({
              type: 'image_url',
              image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
            })),
            { type: 'text', text: prompt },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'food_photo_estimate',
          strict: true,
          schema: strictSchema,
        },
      },
    },
  };
}

function extractOpenAiResponse(data: unknown): ProviderExtractResult {
  const d = data as {
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: unknown; refusal?: unknown };
    }>;
  };
  const choice = d?.choices?.[0];
  const message = choice?.message;
  if (message?.refusal) {
    return {
      kind: 'error',
      code: 'CONTENT_BLOCKED',
      error: 'AI service refused to process the image.',
    };
  }
  const finishReason: string | undefined = choice?.finish_reason;
  if (finishReason === 'content_filter') {
    return {
      kind: 'error',
      code: 'CONTENT_BLOCKED',
      error: 'AI service blocked the response by content filter.',
    };
  }
  if (finishReason === 'length') {
    return {
      kind: 'error',
      code: 'PARSE_ERROR',
      error: 'AI service truncated the response.',
    };
  }
  const content: unknown = message?.content;
  if (typeof content !== 'string') {
    return {
      kind: 'error',
      code: 'CONTENT_BLOCKED',
      error: 'AI service returned no content.',
    };
  }
  try {
    return { kind: 'success', payload: JSON.parse(content) };
  } catch {
    return {
      kind: 'error',
      code: 'PARSE_ERROR',
      error: 'AI service returned invalid JSON.',
    };
  }
}

function buildAnthropicRequest(
  apiKey: string,
  images: PhotoImage[],
  prompt: string,
  strictSchema: JsonSchemaNode,
  model: string
): ProviderRequest {
  return {
    url: ANTHROPIC_ENDPOINT,
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: {
      model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      tools: [
        {
          name: ANTHROPIC_TOOL_NAME,
          description:
            'Submit the structured food-photo nutrition estimate to the application.',
          input_schema: strictSchema,
          strict: true,
        },
      ],
      tool_choice: { type: 'tool', name: ANTHROPIC_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((img) => ({
              type: 'image',
              source: {
                type: 'base64',
                media_type: img.mimeType,
                data: img.base64,
              },
            })),
            { type: 'text', text: prompt },
          ],
        },
      ],
    },
  };
}

function extractAnthropicResponse(data: unknown): ProviderExtractResult {
  const d = data as {
    stop_reason?: string;
    content?: Array<{ type?: string; name?: string; input?: unknown }>;
  };
  const stopReason = d?.stop_reason;
  const content = d?.content;

  if (stopReason === 'refusal') {
    return {
      kind: 'error',
      code: 'CONTENT_BLOCKED',
      error: 'AI service refused to process the image.',
    };
  }
  if (stopReason === 'max_tokens') {
    return {
      kind: 'error',
      code: 'PARSE_ERROR',
      error: 'AI service truncated the response.',
    };
  }
  const toolUseBlock = content?.find(
    (block) => block?.type === 'tool_use' && block?.name === ANTHROPIC_TOOL_NAME
  );
  if (stopReason === 'tool_use') {
    if (!toolUseBlock || typeof toolUseBlock.input !== 'object') {
      return {
        kind: 'error',
        code: 'UPSTREAM_ERROR',
        error: 'AI service returned a malformed tool_use block.',
      };
    }
    return { kind: 'success', payload: toolUseBlock.input };
  }
  if (stopReason === 'end_turn') {
    return {
      kind: 'error',
      code: 'CONTENT_BLOCKED',
      error: 'AI service returned no tool call (likely safety-blocked).',
    };
  }
  return {
    kind: 'error',
    code: 'UPSTREAM_ERROR',
    error: `AI service returned unexpected stop_reason '${stopReason ?? '<missing>'}'.`,
  };
}

async function estimateFoodPhotoNutrition(
  input: EstimateFoodPhotoNutritionInput
): Promise<EstimateFoodPhotoNutritionResult> {
  const { userId, description = '', weightSlot = '' } = input;
  const images = resolveImages(input);
  if (images.length === 0) {
    return {
      success: false,
      code: 'INVALID_REQUEST',
      error: 'At least one image is required.',
    };
  }

  const setting = await chatRepository.getActiveAiServiceSetting(userId);
  if (!setting) {
    return {
      success: false,
      code: 'NO_AI_CONFIGURED',
      error: 'No AI service configured.',
    };
  }
  if (!SUPPORTED_PROVIDERS.has(setting.service_type)) {
    return {
      success: false,
      code: 'UNSUPPORTED_PROVIDER',
      error: `Active AI provider is '${setting.service_type}'; food-photo estimation requires one of: ${[...SUPPORTED_PROVIDERS].join(', ')}.`,
    };
  }
  const aiService = await chatRepository.getAiServiceSettingForBackend(
    setting.id,
    userId
  );
  if (!aiService) {
    return {
      success: false,
      code: 'NO_AI_CONFIGURED',
      error: 'No AI service configured.',
    };
  }
  if (!aiService.api_key) {
    return {
      success: false,
      code: 'API_KEY_MISSING',
      error: 'API key missing for the active AI service.',
    };
  }
  const apiKey = aiService.api_key;
  const prompt = buildPrompt(description, weightSlot, images.length);
  const providerType = aiService.service_type;
  const model = aiService.model_name || getDefaultVisionModel(providerType);

  if (
    HEIC_UNSUPPORTED_PROVIDERS.has(providerType) &&
    images.some((img) => HEIC_MIME_TYPES.has(img.mimeType))
  ) {
    return {
      success: false,
      code: 'UNSUPPORTED_MIME_TYPE',
      error: `The active AI provider (${providerType}) does not support HEIC/HEIF images. Please use JPEG, PNG, or WebP.`,
    };
  }

  let request: ProviderRequest;
  switch (providerType) {
    case 'google':
      request = buildGoogleRequest(apiKey, images, prompt, model);
      break;
    case 'openai':
      request = buildOpenAiRequest(
        apiKey,
        images,
        prompt,
        toStrictJsonSchema(RESPONSE_SCHEMA),
        model
      );
      break;
    case 'anthropic':
      request = buildAnthropicRequest(
        apiKey,
        images,
        prompt,
        toStrictJsonSchema(RESPONSE_SCHEMA),
        model
      );
      break;
    default:
      // Defensive: SUPPORTED_PROVIDERS gate above should make this unreachable.
      return {
        success: false,
        code: 'UNSUPPORTED_PROVIDER',
        error: `Active AI provider is '${providerType}'; food-photo estimation requires one of: ${[...SUPPORTED_PROVIDERS].join(', ')}.`,
      };
  }

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      log(
        'warn',
        `Food-photo estimation: ${providerType} timed out after ${REQUEST_TIMEOUT_MS}ms for user ${userId}`
      );
      return {
        success: false,
        code: 'TIMEOUT',
        error: `AI service did not respond within ${REQUEST_TIMEOUT_MS / 1000}s.`,
      };
    }
    log(
      'error',
      `Food-photo estimation: ${providerType} fetch failed for user ${userId}`,
      error
    );
    return {
      success: false,
      code: 'UPSTREAM_ERROR',
      error: 'Failed to reach the AI service.',
    };
  }

  if (!response.ok) {
    let body: string | undefined;
    try {
      body = await response.text();
    } catch {
      body = undefined;
    }
    log(
      'error',
      `Food-photo estimation: ${providerType} returned ${response.status} for user ${userId}. Body: ${body ?? '<unreadable>'}`
    );
    return {
      success: false,
      code: 'UPSTREAM_ERROR',
      error: `AI service returned status ${response.status}.`,
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    log(
      'error',
      `Food-photo estimation: failed to parse ${providerType} response body as JSON for user ${userId}`,
      error
    );
    return {
      success: false,
      code: 'UPSTREAM_ERROR',
      error: 'AI service returned a non-JSON response.',
    };
  }

  let extracted: ProviderExtractResult;
  switch (providerType) {
    case 'google':
      extracted = extractGoogleResponse(data);
      break;
    case 'openai':
      extracted = extractOpenAiResponse(data);
      break;
    case 'anthropic':
      extracted = extractAnthropicResponse(data);
      break;
    default:
      extracted = {
        kind: 'error',
        code: 'UPSTREAM_ERROR',
        error: 'Unsupported provider in response extraction.',
      };
  }

  if (extracted.kind === 'error') {
    if (extracted.code === 'CONTENT_BLOCKED') {
      log(
        'warn',
        `Food-photo estimation: ${providerType} blocked or returned no content for user ${userId}`
      );
    } else {
      log(
        'error',
        `Food-photo estimation: ${providerType} extraction failed for user ${userId} (${extracted.code})`
      );
    }
    return { success: false, code: extracted.code, error: extracted.error };
  }

  const result = foodPhotoEstimateResponseSchema.safeParse(extracted.payload);
  if (!result.success) {
    log(
      'error',
      `Food-photo estimation: ${providerType} JSON failed schema validation for user ${userId}`,
      result.error.issues
    );
    return {
      success: false,
      code: 'PARSE_ERROR',
      error: 'AI service returned an unexpected response shape.',
    };
  }

  return { success: true, estimate: result.data };
}

export { estimateFoodPhotoNutrition, toStrictJsonSchema, RESPONSE_SCHEMA };
export default {
  estimateFoodPhotoNutrition,
};
