import chatRepository from '../models/chatRepository.js';
import { log } from '../config/logging.js';
import {
  foodPhotoEstimateResponseSchema,
  type FoodPhotoEstimateErrorCode,
  type FoodPhotoEstimateResponse,
} from '@workspace/shared';

const GEMINI_VISION_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`;

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

function buildPrompt(description: string, weight: string): string {
  return `You are a nutrition estimation assistant. Analyze the meal photo and return
structured nutrition data.

User description (optional): "${description}"

User-provided total weight (optional): "${weight}"

Rules:

  - If the user provided a description, treat it as authoritative over what you
    see in the image when they conflict.
  - If the user provided a total weight, distribute it across items
    proportionally to your visual estimate, then recalculate nutrition.
  - Break mixed dishes into component ingredients when reasonable (e.g. a
    burrito → tortilla, rice, beans, meat, cheese, salsa).
  - Be explicit about assumptions (oil used, milk type, skin on/off).
  - Lower your confidence when portions are ambiguous or ingredients hidden.
  - Only ask clarifying questions that would materially change the estimate.`;
}

export interface EstimateFoodPhotoNutritionInput {
  base64Image: string;
  mimeType: string;
  userId: string;
  description?: string;
  weightSlot?: string;
}

export type EstimateFoodPhotoNutritionResult =
  | { success: true; estimate: FoodPhotoEstimateResponse }
  | { success: false; code: FoodPhotoEstimateErrorCode; error: string };

async function estimateFoodPhotoNutrition(
  input: EstimateFoodPhotoNutritionInput
): Promise<EstimateFoodPhotoNutritionResult> {
  const {
    base64Image,
    mimeType,
    userId,
    description = '',
    weightSlot = '',
  } = input;

  const setting = await chatRepository.getActiveAiServiceSetting(userId);
  if (!setting) {
    return {
      success: false,
      code: 'NO_AI_CONFIGURED',
      error: 'No AI service configured.',
    };
  }
  if (setting.service_type !== 'google') {
    return {
      success: false,
      code: 'PROVIDER_NOT_GOOGLE',
      error: `Active AI provider is '${setting.service_type}'; food-photo estimation requires Google (Gemini) in V1.`,
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
      error: 'API key missing for the active Google AI service.',
    };
  }
  const apiKey = aiService.api_key;
  const prompt = buildPrompt(description, weightSlot);

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  let response: Response;
  try {
    response = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    log(
      'error',
      `Food-photo estimation: Gemini fetch failed for user ${userId}`,
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
      `Food-photo estimation: Gemini returned ${response.status} for user ${userId}. Body: ${body ?? '<unreadable>'}`
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
      `Food-photo estimation: failed to parse Gemini response body as JSON for user ${userId}`,
      error
    );
    return {
      success: false,
      code: 'UPSTREAM_ERROR',
      error: 'AI service returned a non-JSON response.',
    };
  }

  const parts: Array<{ text?: string }> | undefined =
    // @ts-expect-error narrowed below
    data?.candidates?.[0]?.content?.parts;
  const text = parts?.find((p) => typeof p?.text === 'string')?.text;
  if (typeof text !== 'string') {
    log(
      'warn',
      `Food-photo estimation: Gemini returned no text part (likely safety-blocked) for user ${userId}`
    );
    return {
      success: false,
      code: 'CONTENT_BLOCKED',
      error:
        'AI service returned no content (likely blocked by safety filters).',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    log(
      'error',
      `Food-photo estimation: Gemini text was not valid JSON for user ${userId}`,
      error
    );
    return {
      success: false,
      code: 'PARSE_ERROR',
      error: 'AI service returned invalid JSON.',
    };
  }

  const result = foodPhotoEstimateResponseSchema.safeParse(parsed);
  if (!result.success) {
    log(
      'error',
      `Food-photo estimation: Gemini JSON failed schema validation for user ${userId}`,
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

export { estimateFoodPhotoNutrition };
export default {
  estimateFoodPhotoNutrition,
};
