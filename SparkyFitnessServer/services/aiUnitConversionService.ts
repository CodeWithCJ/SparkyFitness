import chatRepository from '../models/chatRepository.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { log } from '../config/logging.js';
import { getDefaultModel } from '../ai/config.js';
import {
  aiProviderRawResponseSchema,
  isAiConvertibleUnit,
  shouldOfferAiConversion,
  type AiUnitConversionRequest,
  type AiUnitConversionResponse,
} from '@workspace/shared';
import undici from 'undici';

const { Agent } = undici;

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
    '{ "estimated_amount": <number>, "confidence": "high" | "medium" | "low", "reasoning": "<one short sentence>" }',
    '',
    'Confidence guide:',
    '- high: well-known food with widely-published density (water, milk, sugar, plain flour, white rice)',
    '- medium: common foods with reasonable density estimates (yogurt, soup, sauce, oatmeal)',
    '- low: ambiguous foods, unusual cuts, or unusual unit pairs',
  ].join('\n');
}

interface ProviderConfig {
  service_type: string;
  api_key?: string;
  model_name?: string;
  custom_url?: string;
  timeout?: number;
}

async function callProvider(
  aiService: ProviderConfig,
  prompt: string
): Promise<string> {
  const model = aiService.model_name || getDefaultModel(aiService.service_type);
  const apiKey = aiService.api_key;
  let response: Response;

  switch (aiService.service_type) {
    case 'google':
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );
      break;
    case 'openai':
    case 'openai_compatible':
    case 'mistral':
    case 'groq':
    case 'openrouter':
    case 'custom': {
      const url =
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
                  : (aiService.custom_url as string);
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(aiService.service_type === 'openrouter' && {
            'HTTP-Referer': 'https://sparky-fitness.com',
            'X-Title': 'Sparky Fitness',
          }),
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });
      break;
    }
    case 'anthropic':
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey as string,
        },
        body: JSON.stringify({
          model,
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      break;
    case 'ollama': {
      const timeout = aiService.timeout || 120000;
      const ollamaAgent = new Agent({
        headersTimeout: timeout,
        bodyTimeout: timeout,
      });
      try {
        response = await fetch(`${aiService.custom_url}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            format: 'json',
          }),
          // @ts-expect-error undici dispatcher option is not in fetch DOM types
          dispatcher: ollamaAgent,
        });
      } finally {
        ollamaAgent.destroy();
      }
      break;
    }
    default:
      throw new ProviderResponseError(
        `Unsupported AI service type: ${aiService.service_type}`
      );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    log(
      'error',
      `AI unit conversion provider error: ${aiService.service_type} status=${response.status} body=${errorBody}`
    );
    throw new ProviderResponseError(
      `AI service returned status ${response.status}`
    );
  }

  const data = await response.json();
  let content: string | undefined;
  switch (aiService.service_type) {
    case 'google':
      content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      break;
    case 'openai':
    case 'openai_compatible':
    case 'mistral':
    case 'groq':
    case 'openrouter':
    case 'custom':
      content = data?.choices?.[0]?.message?.content;
      break;
    case 'anthropic':
      content = data?.content?.[0]?.text;
      break;
    case 'ollama':
      content = data?.message?.content;
      break;
  }

  if (!content) {
    throw new ProviderResponseError('AI provider returned no content.');
  }
  // Strip markdown code fences if any provider wrapped the JSON anyway.
  return content
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}

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
  if (aiService.service_type !== 'ollama' && !aiService.api_key) {
    throw new NoAiServiceError();
  }

  // 4. Build prompt + call provider.
  const prompt = buildPrompt({
    foodName: params.foodName,
    brand: params.brand,
    fromAmount: params.fromAmount,
    fromUnit: params.fromUnit,
    toUnit: params.toUnit,
    knownVariants: params.knownVariants,
  });

  const rawContent = await callProvider(aiService, prompt);

  // 5. Parse and validate response shape.
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err) {
    log(
      'error',
      `AI unit conversion JSON parse error. Raw: ${rawContent.slice(0, 500)}`,
      err
    );
    throw new ProviderResponseError('AI response was not valid JSON.');
  }

  const validation = aiProviderRawResponseSchema.safeParse(parsed);
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
    reasoning: validation.data.reasoning,
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
