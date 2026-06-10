import chatRepository from '../models/chatRepository.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { log } from '../config/logging.js';
import {
  dispatchAiRequest,
  type DispatchErrorCategory,
  type JsonSchemaNode,
  type ProviderConfig,
} from '../ai/providerDispatch.js';
import {
  aiProviderRawResponseSchema,
  isAiConvertibleUnit,
  shouldOfferAiConversion,
  STRUCTURED_OUTPUT_SCHEMA,
  type AiUnitConversionRequest,
  type AiUnitConversionResponse,
} from '@workspace/shared';

export class NoAiServiceError extends Error {
  constructor() {
    super('No AI service configured for this user.');
    this.name = 'NoAiServiceError';
  }
}

export class AiConversionsDisabledError extends Error {
  constructor() {
    super('AI-assisted conversions are disabled for this user.');
    this.name = 'AiConversionsDisabledError';
  }
}

export class IncompatibleRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncompatibleRequestError';
  }
}

export class ProviderResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderResponseError';
  }
}

interface KnownVariantContext {
  amount: number;
  unit: string;
}

function buildPrompt(params: {
  foodName: string;
  brand?: string;
  fromAmount: number;
  fromUnit: string;
  toUnit: string;
  knownVariants: KnownVariantContext[];
}): string {
  const brandSegment = params.brand ? ` (brand: ${params.brand})` : '';
  const variantsSegment =
    params.knownVariants.length > 0
      ? params.knownVariants.map((v) => `- ${v.amount} ${v.unit}`).join('\n')
      : '- (none)';
  return [
    'You are estimating a food unit conversion. Respond with JSON only.',
    '',
    `Food: ${params.foodName}${brandSegment}`,
    `Convert: ${params.fromAmount} ${params.fromUnit}  →  ${params.toUnit}`,
    '',
    'Existing known servings for this food (use as anchors if relevant):',
    variantsSegment,
    '',
    'Rules:',
    '- Use typical density for this food.',
    '- If the food is generic (no brand), use a generic density estimate.',
    '- Output ONLY the JSON object — no prose, no code fences.',
    '',
    'JSON shape:',
    '{ "estimated_amount": <number>, "confidence": "high" | "medium" | "low" }',
    '',
    'Confidence guide:',
    '- high: well-known food with widely-published density (water, milk, sugar, plain flour, white rice)',
    '- medium: common foods with reasonable density estimates (yogurt, soup, sauce, oatmeal)',
    '- low: ambiguous foods, unusual cuts, or unusual unit pairs',
  ].join('\n');
}

// OpenAI `json_schema` name / Anthropic tool name passed to the dispatch helper.
const SCHEMA_NAME = 'unit_conversion';

// Deterministic numeric estimation.
const UNIT_CONVERSION_TEMPERATURE = 0;

// STRUCTURED_OUTPUT_SCHEMA is `as const` (readonly), so it needs widening to
// JsonSchemaNode; the helper deep-clones before any per-provider rewrite.
const UNIT_CONVERSION_SCHEMA =
  STRUCTURED_OUTPUT_SCHEMA as unknown as JsonSchemaNode;

// api_key_missing/custom_url_missing map to NoAiServiceError so the route
// keeps answering 404 for a half-configured service. Everything else is a 502
// carrying the dispatch detail. Declared with `satisfies` so a future new
// DispatchErrorCategory is a compile error here, not a silent `undefined`.
const DISPATCH_ERROR_TO_THROW = {
  api_key_missing: () => new NoAiServiceError(),
  custom_url_missing: () => new NoAiServiceError(),
  unsupported_provider: (d: string) => new ProviderResponseError(d),
  unsupported_media: (d: string) => new ProviderResponseError(d),
  timeout: (d: string) => new ProviderResponseError(d),
  upstream_error: (d: string) => new ProviderResponseError(d),
  refused: (d: string) => new ProviderResponseError(d),
  truncated: (d: string) => new ProviderResponseError(d),
  no_content: (d: string) => new ProviderResponseError(d),
  parse_error: (d: string) => new ProviderResponseError(d),
} satisfies Record<DispatchErrorCategory, (detail: string) => Error>;

export async function estimateUnitConversion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  params: AiUnitConversionRequest
): Promise<AiUnitConversionResponse> {
  // 1. Validate units BEFORE touching AI services. Cheap and avoids
  //    spending a provider call on an obviously-bad request.
  if (
    !isAiConvertibleUnit(params.fromUnit) ||
    !isAiConvertibleUnit(params.toUnit)
  ) {
    throw new IncompatibleRequestError(
      'Both fromUnit and toUnit must be standard weight or volume units.'
    );
  }
  if (!shouldOfferAiConversion(params.fromUnit, params.toUnit)) {
    throw new IncompatibleRequestError(
      'Units are already directly convertible; AI estimation is not needed.'
    );
  }

  // 2. Global + per-user preference checks.
  const userAiConfigAllowed =
    await globalSettingsRepository.isUserAiConfigAllowed();
  if (!userAiConfigAllowed) {
    throw new AiConversionsDisabledError();
  }

  const prefs = await preferenceRepository.getUserPreferences(userId);
  if (prefs && prefs.ai_assisted_conversions === false) {
    throw new AiConversionsDisabledError();
  }

  // 3. Resolve provider.
  const setting = await chatRepository.getActiveAiServiceSetting(userId);
  if (!setting) {
    throw new NoAiServiceError();
  }
  const aiService = await chatRepository.getAiServiceSettingForBackend(
    setting.id,
    userId
  );
  if (!aiService) {
    throw new NoAiServiceError();
  }

  const provider: ProviderConfig = {
    service_type: aiService.service_type,
    api_key: aiService.api_key ?? undefined,
    model_name: aiService.model_name ?? undefined,
    custom_url: aiService.custom_url ?? undefined,
    timeout: aiService.timeout ?? undefined,
  };

  // 4. Build prompt + dispatch. The helper owns the api-key/custom-url checks,
  // per-provider structured-output strategy, and JSON parsing.
  const result = await dispatchAiRequest({
    provider,
    prompt: buildPrompt({
      foodName: params.foodName,
      brand: params.brand,
      fromAmount: params.fromAmount,
      fromUnit: params.fromUnit,
      toUnit: params.toUnit,
      knownVariants: params.knownVariants,
    }),
    jsonSchema: UNIT_CONVERSION_SCHEMA,
    schemaName: SCHEMA_NAME,
    temperature: UNIT_CONVERSION_TEMPERATURE,
  });

  if (!result.ok) {
    log(
      result.category === 'refused' || result.category === 'no_content'
        ? 'warn'
        : 'error',
      `AI unit conversion: ${provider.service_type} failed for user ${userId} (${result.category}): ${result.detail}`
    );
    throw DISPATCH_ERROR_TO_THROW[result.category](result.detail);
  }

  // 5. Validate response shape.
  const validation = aiProviderRawResponseSchema.safeParse(result.json);
  if (!validation.success) {
    log(
      'error',
      `AI unit conversion response failed schema validation: ${JSON.stringify(validation.error.issues)}`
    );
    throw new ProviderResponseError(
      'AI response did not match expected shape.'
    );
  }

  return {
    estimatedAmount: validation.data.estimated_amount,
    confidence: validation.data.confidence,
    fromUnit: params.fromUnit,
    fromAmount: params.fromAmount,
    toUnit: params.toUnit,
  };
}

export default {
  estimateUnitConversion,
  NoAiServiceError,
  AiConversionsDisabledError,
  IncompatibleRequestError,
  ProviderResponseError,
};
