import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import chatRepository from '../models/chatRepository.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { getDefaultModel } from '../ai/config.js';
import {
  estimateUnitConversion,
  NoAiServiceError,
  AiConversionsDisabledError,
  IncompatibleRequestError,
  ProviderResponseError,
} from '../services/aiUnitConversionService.js';
import { STRUCTURED_OUTPUT_SCHEMA } from '@workspace/shared';

vi.mock('../models/chatRepository');
vi.mock('../models/globalSettingsRepository.js');
vi.mock('../models/preferenceRepository');
vi.mock('../ai/config');
vi.mock('../config/logging', () => ({ log: vi.fn() }));

const TEST_USER_ID = 'user-123';

const makeAiSetting = (overrides = {}) => ({
  id: 'setting-1',
  service_name: 'My OpenAI',
  service_type: 'openai',
  is_active: true,
  model_name: 'gpt-4o-mini',
  is_public: false,
  source: 'user',
  ...overrides,
});

const makeAiServiceDetail = (overrides = {}) => ({
  id: 'setting-1',
  service_type: 'openai',
  model_name: 'gpt-4o-mini',
  api_key: 'sk-test-key',
  custom_url: null,
  timeout: null,
  ...overrides,
});

const baseRequest = {
  foodId: 'food-1',
  foodName: 'Greek yogurt',
  fromUnit: 'cup',
  fromAmount: 1,
  toUnit: 'g',
  knownVariants: [],
};

const sampleAiResponse = {
  estimated_amount: 227,
  confidence: 'medium' as const,
};

function mockOpenAiFetch(payload: unknown = sampleAiResponse) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    text: async () => '',
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }),
  });
}

describe('estimateUnitConversion', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error mocked
    getDefaultModel.mockReturnValue('gpt-4o-mini');
    // @ts-expect-error mocked
    globalSettingsRepository.isUserAiConfigAllowed.mockResolvedValue(true);
    // @ts-expect-error mocked
    preferenceRepository.getUserPreferences.mockResolvedValue({
      ai_assisted_conversions: true,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('throws IncompatibleRequestError when fromUnit is a quantity unit (piece)', async () => {
    await expect(
      estimateUnitConversion(TEST_USER_ID, {
        ...baseRequest,
        fromUnit: 'piece',
      })
    ).rejects.toBeInstanceOf(IncompatibleRequestError);
  });

  it('throws IncompatibleRequestError when units are already compatible (g → kg)', async () => {
    await expect(
      estimateUnitConversion(TEST_USER_ID, {
        ...baseRequest,
        fromUnit: 'g',
        toUnit: 'kg',
      })
    ).rejects.toBeInstanceOf(IncompatibleRequestError);
  });

  it('throws AiConversionsDisabledError when preference is off', async () => {
    // @ts-expect-error mocked
    preferenceRepository.getUserPreferences.mockResolvedValue({
      ai_assisted_conversions: false,
    });
    await expect(
      estimateUnitConversion(TEST_USER_ID, baseRequest)
    ).rejects.toBeInstanceOf(AiConversionsDisabledError);
  });

  it('throws AiConversionsDisabledError when admin disables per-user AI config', async () => {
    // @ts-expect-error mocked
    globalSettingsRepository.isUserAiConfigAllowed.mockResolvedValue(false);
    await expect(
      estimateUnitConversion(TEST_USER_ID, baseRequest)
    ).rejects.toBeInstanceOf(AiConversionsDisabledError);
  });

  it('throws NoAiServiceError when no AI service is configured', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(null);
    await expect(
      estimateUnitConversion(TEST_USER_ID, baseRequest)
    ).rejects.toBeInstanceOf(NoAiServiceError);
  });

  it('throws NoAiServiceError when non-ollama service has no api_key', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeAiSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail({ api_key: null })
    );
    await expect(
      estimateUnitConversion(TEST_USER_ID, baseRequest)
    ).rejects.toBeInstanceOf(NoAiServiceError);
  });

  it.each([
    ['ollama', null],
    ['custom', 'sk-test-key'],
    ['openai_compatible', 'sk-test-key'],
  ])(
    'throws NoAiServiceError when %s requires a custom URL but none is configured',
    async (serviceType, apiKey) => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as typeof fetch;
      // @ts-expect-error mocked
      chatRepository.getActiveAiServiceSetting.mockResolvedValue(
        makeAiSetting({ service_type: serviceType })
      );
      // @ts-expect-error mocked
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeAiServiceDetail({
          service_type: serviceType,
          api_key: apiKey,
          custom_url: '   ',
        })
      );

      await expect(
        estimateUnitConversion(TEST_USER_ID, baseRequest)
      ).rejects.toBeInstanceOf(NoAiServiceError);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it('returns parsed estimate on a successful OpenAI call', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeAiSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail()
    );
    mockOpenAiFetch();

    const result = await estimateUnitConversion(TEST_USER_ID, baseRequest);
    expect(result).toEqual({
      estimatedAmount: 227,
      confidence: 'medium',
      fromUnit: 'cup',
      fromAmount: 1,
      toUnit: 'g',
    });
  });

  it('throws ProviderResponseError when AI returns malformed JSON', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeAiSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail()
    );
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({
        choices: [{ message: { content: 'not actually json at all' } }],
      }),
    });

    await expect(
      estimateUnitConversion(TEST_USER_ID, baseRequest)
    ).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it('throws ProviderResponseError when AI response fails schema validation', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeAiSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail()
    );
    mockOpenAiFetch({
      estimated_amount: 'not a number',
      confidence: 'medium',
    });

    await expect(
      estimateUnitConversion(TEST_USER_ID, baseRequest)
    ).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it('throws ProviderResponseError when AI provider returns non-OK status', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeAiSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail()
    );
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal server error',
      json: async () => ({}),
    });

    await expect(
      estimateUnitConversion(TEST_USER_ID, baseRequest)
    ).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it('strips markdown code fences from AI response before parsing', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeAiSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail()
    );
    const fenced = `\`\`\`json\n${JSON.stringify(sampleAiResponse)}\n\`\`\``;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({ choices: [{ message: { content: fenced } }] }),
    });

    const result = await estimateUnitConversion(TEST_USER_ID, baseRequest);
    expect(result.estimatedAmount).toBe(227);
  });
});

/**
 * Per-provider request-body shape assertions. Each provider has its own
 * structured-output mechanism; these tests pin down what we send in the
 * outbound `fetch` body so a refactor can't silently break a provider path.
 *
 * Pattern: mock chatRepository to return a service for the given provider,
 * stub `global.fetch` to capture the request, run an estimate, then assert
 * the captured body against the documented per-provider shape.
 */
describe('per-provider request body shapes', () => {
  const originalFetch = global.fetch;

  function captureFetch(
    payload: unknown = { estimated_amount: 227, confidence: 'medium' }
  ): ReturnType<typeof vi.fn> {
    const captureMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(payload) } }],
        // Anthropic uses content[0].text; mock both shapes — the service
        // picks whichever matches the provider via its existing extractor.
        content: [{ text: JSON.stringify(payload) }],
        // Google extractor reads candidates[0].content.parts[0].text
        candidates: [
          { content: { parts: [{ text: JSON.stringify(payload) }] } },
        ],
        // Ollama extractor reads message.content
        message: { content: JSON.stringify(payload) },
      }),
    });
    global.fetch = captureMock as typeof global.fetch;
    return captureMock;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error mocked
    getDefaultModel.mockReturnValue('default-model');
    // @ts-expect-error mocked
    globalSettingsRepository.isUserAiConfigAllowed.mockResolvedValue(true);
    // @ts-expect-error mocked
    preferenceRepository.getUserPreferences.mockResolvedValue({
      ai_assisted_conversions: true,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function setProvider(
    serviceType: string,
    detail: Partial<{ custom_url: string; model_name: string }> = {}
  ) {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeAiSetting({ service_type: serviceType, ...detail })
    );
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail({ service_type: serviceType, ...detail })
    );
  }

  function bodyFromCall(captureMock: ReturnType<typeof vi.fn>): {
    url: string;
    body: Record<string, unknown>;
  } {
    const call = captureMock.mock.calls[0];
    return {
      url: call[0] as string,
      body: JSON.parse((call[1] as { body: string }).body) as Record<
        string,
        unknown
      >,
    };
  }

  it('OpenAI sends strict json_schema with STRUCTURED_OUTPUT_SCHEMA', async () => {
    setProvider('openai');
    const captureMock = captureFetch();
    await estimateUnitConversion(TEST_USER_ID, baseRequest);
    const { url, body } = bodyFromCall(captureMock);
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'unit_conversion',
        strict: true,
        schema: STRUCTURED_OUTPUT_SCHEMA,
      },
    });
  });

  it('Groq mirrors OpenAI strict json_schema body', async () => {
    setProvider('groq');
    const captureMock = captureFetch();
    await estimateUnitConversion(TEST_USER_ID, baseRequest);
    const { url, body } = bodyFromCall(captureMock);
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'unit_conversion',
        strict: true,
        schema: STRUCTURED_OUTPUT_SCHEMA,
      },
    });
    expect(body.provider).toBeUndefined();
  });

  it('OpenRouter sends strict json_schema AND provider.require_parameters', async () => {
    setProvider('openrouter');
    const captureMock = captureFetch();
    await estimateUnitConversion(TEST_USER_ID, baseRequest);
    const { url, body } = bodyFromCall(captureMock);
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'unit_conversion',
        strict: true,
        schema: STRUCTURED_OUTPUT_SCHEMA,
      },
    });
    expect(body.provider).toEqual({ require_parameters: true });
  });

  it('Mistral keeps basic json_object mode (no strict schema)', async () => {
    setProvider('mistral');
    const captureMock = captureFetch();
    await estimateUnitConversion(TEST_USER_ID, baseRequest);
    const { url, body } = bodyFromCall(captureMock);
    expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('Custom uses basic json_object mode + the user-supplied URL as-is', async () => {
    setProvider('custom', { custom_url: 'https://example.local/api/foo' });
    const captureMock = captureFetch();
    await estimateUnitConversion(TEST_USER_ID, baseRequest);
    const { url, body } = bodyFromCall(captureMock);
    expect(url).toBe('https://example.local/api/foo');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('openai_compatible uses basic json_object + appends /chat/completions', async () => {
    setProvider('openai_compatible', {
      custom_url: 'https://example.local/v1',
    });
    const captureMock = captureFetch();
    await estimateUnitConversion(TEST_USER_ID, baseRequest);
    const { url, body } = bodyFromCall(captureMock);
    expect(url).toBe('https://example.local/v1/chat/completions');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('Google Gemini sends generationConfig.responseSchema (without additionalProperties)', async () => {
    // Older pattern is the one foodPhotoEstimationService uses — newer
    // `responseFormat.text.{mimeType, schema}` is rejected by the v1beta
    // REST endpoint with a 400 in live testing.
    //
    // Gemini's `responseSchema` is an OpenAPI subset that doesn't accept
    // `additionalProperties`. We strip it before sending. The shared
    // STRUCTURED_OUTPUT_SCHEMA stays canonical; the strip happens at the
    // call site.
    setProvider('google');
    const captureMock = captureFetch();
    await estimateUnitConversion(TEST_USER_ID, baseRequest);
    const { url, body } = bodyFromCall(captureMock);
    expect(url).toContain(
      'https://generativelanguage.googleapis.com/v1beta/models/'
    );
    const config = body.generationConfig as {
      responseMimeType?: string;
      responseSchema?: Record<string, unknown>;
    };
    expect(config.responseMimeType).toBe('application/json');
    expect(config.responseSchema).toEqual({
      type: STRUCTURED_OUTPUT_SCHEMA.type,
      properties: STRUCTURED_OUTPUT_SCHEMA.properties,
      required: STRUCTURED_OUTPUT_SCHEMA.required,
    });
    expect(config.responseSchema?.additionalProperties).toBeUndefined();
  });

  it('Anthropic sends output_config.format json_schema (NOT tool_use)', async () => {
    setProvider('anthropic');
    const captureMock = captureFetch();
    await estimateUnitConversion(TEST_USER_ID, baseRequest);
    const { url, body } = bodyFromCall(captureMock);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(body.output_config).toEqual({
      format: {
        type: 'json_schema',
        schema: STRUCTURED_OUTPUT_SCHEMA,
      },
    });
    expect(body.tools).toBeUndefined();
  });

  it('Ollama sends schema-as-format-value + temperature 0 + stream false', async () => {
    setProvider('ollama', { custom_url: 'http://localhost:11434' });
    const captureMock = captureFetch();
    await estimateUnitConversion(TEST_USER_ID, baseRequest);
    const { url, body } = bodyFromCall(captureMock);
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(body.format).toEqual(STRUCTURED_OUTPUT_SCHEMA);
    expect(body.stream).toBe(false);
    expect((body.options as { temperature: number }).temperature).toBe(0);
  });
});
