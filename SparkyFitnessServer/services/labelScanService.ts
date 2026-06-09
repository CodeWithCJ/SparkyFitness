import chatRepository from '../models/chatRepository.js';
import { log } from '../config/logging.js';
import {
  dispatchAiRequest,
  type DispatchErrorCategory,
  type ProviderConfig,
} from '../ai/providerDispatch.js';

const LABEL_SCAN_PROMPT =
  'Extract the nutrition facts from this food label image. ' +
  'Return a JSON object with these fields: ' +
  'name (string), brand (string), serving_size (number), serving_unit (string), ' +
  'calories (number), protein (number in grams), carbs (number in grams), fat (number in grams), ' +
  'fiber (number in grams), saturated_fat (number in grams), trans_fat (number in grams), ' +
  'sodium (number in mg), sugars (number in grams), ' +
  'cholesterol (number in mg), potassium (number in mg), ' +
  'calcium (number in mg), iron (number in mg), vitamin_a (number in mcg), vitamin_c (number in mg). ' +
  'All numeric fields should be absolute amounts (not percent daily value), as numbers not strings. ' +
  'serving_size should be a number. ' +
  'Use null for any field not visible on the label. ' +
  'Return only the JSON object, no other text.';

// 'no_ai_configured' is the only category this service mints itself; every
// dispatch failure passes its category through unchanged for the route's
// HTTP-status map.
export type LabelScanErrorCategory = DispatchErrorCategory | 'no_ai_configured';

export type ExtractNutritionFromLabelResult =
  | { success: true; nutrition: unknown }
  | { success: false; category: LabelScanErrorCategory; error: string };

async function extractNutritionFromLabel(
  base64Image: string,
  mimeType: string,
  userId: string
): Promise<ExtractNutritionFromLabelResult> {
  const setting = await chatRepository.getActiveAiServiceSetting(userId);
  if (!setting) {
    return {
      success: false,
      category: 'no_ai_configured',
      error: 'No AI service configured',
    };
  }
  const aiService = await chatRepository.getAiServiceSettingForBackend(
    setting.id,
    userId
  );
  if (!aiService) {
    return {
      success: false,
      category: 'no_ai_configured',
      error: 'No AI service configured',
    };
  }

  // Dispatch reads everything from the decrypted backend detail. The helper
  // enforces the supported-provider, api-key, custom-url, and HEIC checks and
  // reports each as a category the route maps to an HTTP status.
  const provider: ProviderConfig = {
    service_type: aiService.service_type,
    api_key: aiService.api_key ?? undefined,
    model_name: aiService.model_name ?? undefined,
    custom_url: aiService.custom_url ?? undefined,
    timeout: aiService.timeout ?? undefined,
  };

  const result = await dispatchAiRequest({
    provider,
    prompt: LABEL_SCAN_PROMPT,
    images: [{ base64: base64Image, mimeType }],
    parseJson: true,
  });

  if (!result.ok) {
    log(
      result.category === 'refused' || result.category === 'no_content'
        ? 'warn'
        : 'error',
      `Label scan: ${provider.service_type} failed for user ${userId} (${result.category}): ${result.detail}`
    );
    return { success: false, category: result.category, error: result.detail };
  }
  return { success: true, nutrition: result.json };
}

export { extractNutritionFromLabel };
export default {
  extractNutritionFromLabel,
};
