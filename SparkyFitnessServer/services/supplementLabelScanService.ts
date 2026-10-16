import chatRepository from '../models/chatRepository.js';
import { log } from '../config/logging.js';
import {
  dispatchAiRequest,
  type DispatchErrorCategory,
  type ProviderConfig,
} from '../ai/providerDispatch.js';
import { resolveAiNetworkPolicy } from '../utils/outboundUrlPolicy.js';
import {
  supplementLabelExtractionSchema,
  type SupplementLabelExtraction,
} from '@workspace/shared';

const SUPPLEMENT_LABEL_PROMPT =
  'Read the Supplement Facts panel in this photo. ' +
  'Return a JSON object with these fields: ' +
  'name (string, the product name), brand (string), ' +
  "form (one of 'tablet', 'capsule', 'softgel', 'gummy', 'powder', 'liquid'; null when not shown), " +
  "serving (string, the serving size as printed, e.g. '2 Capsules'), " +
  'ingredients (array, one entry for every line of the panel that has an amount per serving, in the order printed). ' +
  'Each ingredient has name (string, as printed, without the amount), ' +
  "amount (number, the amount PER SERVING, not the percent daily value), unit (string, as printed: 'mg', 'mcg', 'g', 'IU', 'kcal'). " +
  'Use the amount in the Amount Per Serving column, never the % Daily Value column. ' +
  'Leave out lines that only list a percent daily value, "other ingredients" and inactive ingredients. ' +
  'Use null for any field not visible. Return only the JSON object, no other text.';

// 'no_ai_configured' is the only category this service mints itself; every
// dispatch failure passes its category through unchanged for the route's
// HTTP-status map.
export type SupplementLabelScanErrorCategory =
  DispatchErrorCategory | 'no_ai_configured';

export type ExtractSupplementLabelResult =
  | { success: true; label: SupplementLabelExtraction }
  | {
      success: false;
      category: SupplementLabelScanErrorCategory;
      error: string;
    };

const FORMS = new Set([
  'tablet',
  'capsule',
  'softgel',
  'gummy',
  'powder',
  'liquid',
]);

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** A number the model wrote as a string ("1,000", "1 200", "400") is read, not rejected. */
function asAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const compact = value.replace(/[\s,\u00A0\u202F]/g, '');
  // Number('') is 0, so a blank amount must not become a measured zero.
  if (compact === '') return null;
  const n = Number(compact);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Shapes a vision model's JSON into the extraction contract: loose values are
 * coerced, and an ingredient without a name is dropped. Returns null when
 * nothing usable is left.
 */
export function normalizeSupplementLabel(
  raw: unknown
): SupplementLabelExtraction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;
  const ingredients = (
    Array.isArray(source.ingredients) ? source.ingredients : []
  ).flatMap((row: unknown) => {
    if (typeof row !== 'object' || row === null) return [];
    const item = row as Record<string, unknown>;
    const name = asText(item.name);
    return name
      ? [{ name, amount: asAmount(item.amount), unit: asText(item.unit) }]
      : [];
  });
  const form = asText(source.form)?.toLowerCase() ?? null;
  const parsed = supplementLabelExtractionSchema.safeParse({
    name: asText(source.name),
    brand: asText(source.brand),
    // A form the app does not offer is dropped rather than failing the scan.
    form: form && FORMS.has(form) ? form : null,
    serving: asText(source.serving),
    ingredients,
  });
  return parsed.success && parsed.data.ingredients.length > 0
    ? parsed.data
    : null;
}

async function extractSupplementLabel(
  base64Image: string,
  mimeType: string,
  userId: string,
  actorIsAdmin = false
): Promise<ExtractSupplementLabelResult> {
  const setting = await chatRepository.getActiveVisionAiServiceSetting(userId);
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

  const provider: ProviderConfig = {
    service_type: aiService.service_type,
    api_key: aiService.api_key ?? undefined,
    model_name: aiService.model_name ?? undefined,
    custom_url: aiService.custom_url ?? undefined,
  };

  const result = await dispatchAiRequest({
    provider,
    networkPolicy: await resolveAiNetworkPolicy(aiService, actorIsAdmin),
    prompt: SUPPLEMENT_LABEL_PROMPT,
    images: [{ base64: base64Image, mimeType }],
    parseJson: true,
  });

  if (!result.ok) {
    log(
      result.category === 'refused' || result.category === 'no_content'
        ? 'warn'
        : 'error',
      `Supplement label scan: ${provider.service_type} failed for user ${userId} (${result.category}): ${result.detail}`
    );
    return { success: false, category: result.category, error: result.detail };
  }

  const label = normalizeSupplementLabel(result.json);
  if (!label) {
    return {
      success: false,
      category: 'parse_error',
      error: 'No supplement facts could be read from the photo',
    };
  }
  return { success: true, label };
}

export { extractSupplementLabel };
export default { extractSupplementLabel };
