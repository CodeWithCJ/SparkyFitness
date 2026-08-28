import chatRepository from '../models/chatRepository.js';
import { log } from '../config/logging.js';
import {
  dispatchAiRequest,
  type DispatchErrorCategory,
  type JsonSchemaNode,
  type ProviderConfig,
} from '../ai/providerDispatch.js';
import { deriveAiNetworkPolicy } from '../utils/outboundUrlPolicy.js';
import { attachFoodMatches } from './foodPhotoMatchService.js';
import {
  foodPhotoEstimateResponseSchema,
  type FoodPhotoEstimateErrorCode,
  type FoodPhotoEstimateResponse,
} from '@workspace/shared';

// Gemini-shaped schema for the structured estimate. The shared dispatch helper
// rewrites it per provider (strips `additionalProperties` for Gemini's
// `responseSchema`, applies `toStrictJsonSchema` for OpenAI/Anthropic strict
// mode, sends it raw as Ollama's `format`). Typed as JsonSchemaNode so it
// satisfies dispatchAiRequest's `jsonSchema` param without a cast; final
// domain validation stays here via foodPhotoEstimateResponseSchema.
const RESPONSE_SCHEMA: JsonSchemaNode = {
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
          canonical_name: {
            type: 'string',
            description:
              "The same food as a plain, generic, searchable name: drop preparation adjectives, brands, and quantities. 'grilled chicken thigh' -> 'chicken thigh'; '1 cup white jasmine rice' -> 'jasmine rice'; 'steamed broccoli florets' -> 'broccoli'. This is used to look the item up in a food database, so keep it to the noun the food would be filed under.",
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
          'canonical_name',
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
          'canonical_name',
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
};

// Anthropic tool name / OpenAI json_schema name passed to the dispatch helper.
// The helper keys both its request builder and its tool_use extractor off this
// single value, so it only needs to be internally consistent.
const SCHEMA_NAME = 'food_photo_estimate';

// Maps every dispatch error category back to the food-photo error code the
// route already knows how to map to an HTTP status. Declared with `satisfies`
// so a future new DispatchErrorCategory is a compile error here, not a silent
// `undefined`.
const DISPATCH_ERROR_TO_CODE = {
  unsupported_provider: 'UNSUPPORTED_PROVIDER',
  api_key_missing: 'API_KEY_MISSING',
  custom_url_missing: 'NO_AI_CONFIGURED',
  unsupported_media: 'UNSUPPORTED_MIME_TYPE',
  timeout: 'TIMEOUT',
  upstream_error: 'UPSTREAM_ERROR',
  private_network_forbidden: 'PRIVATE_NETWORK_FORBIDDEN',
  refused: 'CONTENT_BLOCKED',
  truncated: 'PARSE_ERROR',
  no_content: 'CONTENT_BLOCKED',
  parse_error: 'PARSE_ERROR',
} satisfies Record<DispatchErrorCategory, FoodPhotoEstimateErrorCode>;

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
  - Give every item a canonical_name as well as its display name: the plain
    generic food noun, with preparation adjectives, brands, and quantities
    removed. It is used to look the item up in a food database.
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
  serviceConfigId?: string;
  description?: string;
  weightSlot?: string;
  actorIsAdmin?: boolean;
}

function resolveImages(input: EstimateFoodPhotoNutritionInput): PhotoImage[] {
  const raw =
    input.images && input.images.length > 0
      ? input.images
      : input.base64Image && input.mimeType
        ? [{ base64: input.base64Image, mimeType: input.mimeType }]
        : [];
  // The dispatch helper normalizes 'image/jpg' → 'image/jpeg' per provider, so
  // we only filter here and pass { base64, mimeType } straight through.
  return raw.filter(
    (img): img is PhotoImage =>
      !!img &&
      typeof img.base64 === 'string' &&
      typeof img.mimeType === 'string'
  );
}

function ensureTotals(obj: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(obj.items)) {
    const items = obj.items as Array<Record<string, unknown>>;
    if (!obj.totals || typeof obj.totals !== 'object') {
      let calories = 0;
      let protein = 0;
      let carbs = 0;
      let fat = 0;
      let fiber = 0;
      let sugar = 0;
      let totalGrams = 0;
      for (const item of items) {
        calories += Number(item.calories_kcal) || 0;
        protein += Number(item.protein_g) || 0;
        carbs += Number(item.carbs_g) || 0;
        fat += Number(item.fat_g) || 0;
        fiber += Number(item.fiber_g) || 0;
        sugar += Number(item.sugar_g) || 0;
        totalGrams += Number(item.estimated_grams) || 0;
      }
      obj.totals = {
        calories_kcal: Math.round(calories * 10) / 10,
        protein_g: Math.round(protein * 10) / 10,
        carbs_g: Math.round(carbs * 10) / 10,
        fat_g: Math.round(fat * 10) / 10,
        fiber_g: Math.round(fiber * 10) / 10,
        sugar_g: Math.round(sugar * 10) / 10,
        total_grams: Math.round(totalGrams * 10) / 10,
      };
    }
    if (obj.user_weight_reconciliation === undefined) {
      obj.user_weight_reconciliation = '';
    }
    if (!Array.isArray(obj.clarifying_questions)) {
      obj.clarifying_questions = [];
    }
    if (!obj.overall_confidence) {
      obj.overall_confidence = 'medium';
    }
    if (obj.confidence_reason === undefined) {
      obj.confidence_reason = '';
    }
    if (typeof obj.meal_summary !== 'string' && items.length > 0) {
      obj.meal_summary =
        items
          .map((i) => String(i.name || ''))
          .filter(Boolean)
          .join(', ') || 'Meal';
    }
  }
  return obj;
}

function normalizeEstimatePayload(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  if (Array.isArray(raw)) {
    if (raw.length === 1 && typeof raw[0] === 'object' && raw[0] !== null) {
      return normalizeEstimatePayload(raw[0]);
    }
    if (
      raw.every(
        (item) => typeof item === 'object' && item !== null && 'name' in item
      )
    ) {
      return ensureTotals({ items: raw });
    }
    return raw;
  }
  const obj = { ...(raw as Record<string, unknown>) };
  if ('meal_summary' in obj || 'items' in obj) {
    return ensureTotals(obj);
  }
  const wrapperKeys = [
    'food_photo_estimate',
    'response',
    'data',
    'result',
    'estimate',
    'output',
  ];
  for (const key of wrapperKeys) {
    if (obj[key] && typeof obj[key] === 'object') {
      return normalizeEstimatePayload(obj[key]);
    }
  }
  const keys = Object.keys(obj);
  if (
    keys.length === 1 &&
    typeof obj[keys[0]] === 'object' &&
    obj[keys[0]] !== null
  ) {
    return normalizeEstimatePayload(obj[keys[0]]);
  }
  return ensureTotals(obj);
}

// The vision model writes ingredient names in lower case ("penne pasta").
// That name is what the review card, the meal builder, and every food created
// from the estimate end up showing, so title-case it once here instead of in
// each client. `canonical_name` is deliberately left alone — it is the
// food-database search term, not display text.
const TITLE_CASE_MINOR_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'de',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'without',
]);

function titleCaseFoodName(value: string): string {
  let wordIndex = 0;
  return value
    .split(/(\s+)/)
    .map((part) => {
      if (part === '' || /^\s+$/.test(part)) return part;
      const isFirstWord = wordIndex === 0;
      wordIndex += 1;
      // A word the model already capitalised (a brand, an acronym) is left
      // exactly as written.
      if (/[A-Z]/.test(part)) return part;
      if (
        !isFirstWord &&
        TITLE_CASE_MINOR_WORDS.has(part.replace(/[^a-z]/g, ''))
      ) {
        return part;
      }
      // Capitalise after a hyphen or slash too: "sun-dried" -> "Sun-Dried".
      return part.replace(
        /(^|[-/])([a-z])/g,
        (_match, separator: string, letter: string) =>
          separator + letter.toUpperCase()
      );
    })
    .join('');
}

function titleCaseItemNames(
  estimate: FoodPhotoEstimateResponse
): FoodPhotoEstimateResponse {
  return {
    ...estimate,
    items: estimate.items.map((item) => ({
      ...item,
      name: titleCaseFoodName(item.name),
    })),
  };
}

export type EstimateFoodPhotoNutritionResult =
  | { success: true; estimate: FoodPhotoEstimateResponse }
  | { success: false; code: FoodPhotoEstimateErrorCode; error: string };

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

  const aiService = input.serviceConfigId
    ? await chatRepository.getAiServiceSettingForBackend(
        input.serviceConfigId,
        userId
      )
    : await (async () => {
        const setting =
          await chatRepository.getActiveVisionAiServiceSetting(userId);
        return setting
          ? chatRepository.getAiServiceSettingForBackend(setting.id, userId)
          : null;
      })();

  if (!aiService) {
    return {
      success: false,
      code: 'NO_AI_CONFIGURED',
      error: 'No AI service configured.',
    };
  }

  // Dispatch reads everything from the decrypted backend detail. The helper
  // enforces the supported-provider, api-key, custom-url, and HEIC checks and
  // reports each as a category we map back to a food-photo error code.
  const provider: ProviderConfig = {
    service_type: aiService.service_type,
    api_key: aiService.api_key ?? undefined,
    model_name: aiService.model_name ?? undefined,
    custom_url: aiService.custom_url ?? undefined,
  };

  const result = await dispatchAiRequest({
    provider,
    networkPolicy: deriveAiNetworkPolicy(
      aiService,
      Boolean(input.actorIsAdmin)
    ),
    prompt: buildPrompt(description, weightSlot, images.length),
    images,
    jsonSchema: RESPONSE_SCHEMA,
    schemaName: SCHEMA_NAME,
  });

  if (!result.ok) {
    const code = DISPATCH_ERROR_TO_CODE[result.category];
    log(
      code === 'CONTENT_BLOCKED' ? 'warn' : 'error',
      `Food-photo estimation: ${provider.service_type} failed for user ${userId} (${result.category}): ${result.detail}`
    );
    return { success: false, code, error: result.detail };
  }

  const normalized = normalizeEstimatePayload(result.json);
  const parsed = foodPhotoEstimateResponseSchema.safeParse(normalized);
  if (!parsed.success) {
    log(
      'error',
      `Food-photo estimation: ${provider.service_type} JSON failed schema validation for user ${userId}. Raw response: ${result.text.slice(0, 2000)}`,
      parsed.error.issues
    );
    return {
      success: false,
      code: 'PARSE_ERROR',
      error: 'AI service returned an unexpected response shape.',
    };
  }

  // Enrich with food-database matches. Additive only: existing fields, and
  // therefore what an older client displays, are never touched. A matching
  // failure is swallowed inside the service so it can never cost the user an
  // estimate they already paid an AI call for.
  const enriched = await attachFoodMatches(userId, parsed.data);
  // After matching, so the search terms the matcher sees are the model's own.
  return { success: true, estimate: titleCaseItemNames(enriched) };
}

export { estimateFoodPhotoNutrition };
export default {
  estimateFoodPhotoNutrition,
};
