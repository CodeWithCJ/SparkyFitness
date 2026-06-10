import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import chatRepository from '../models/chatRepository.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
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
vi.mock('../config/logging', () => ({ log: vi.fn() }));

// Mock the undici Agent so the Ollama path never constructs a real agent.
// (global.fetch is mocked per-test; the dispatcher option is ignored by it.)
// This suite drives the real dispatchAiRequest, so it needs the same
// transport stubs as providerDispatch.test.ts.
vi.mock('undici', () => {
  // Regular function (not arrow) so it is constructable via `new Agent(...)`.
  const Agent = vi.fn(function () {
    return { destroy: vi.fn() };
  });
  return { default: { Agent }, Agent };
});

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

// Per-family upstream response-body factories matching each provider's wire
// shape. The dispatch helper forces a tool call on anthropic (structured
// request), so its payload arrives as a tool_use input object; the text-based
// families deliver a JSON string the helper parses.
function googleBody(payload: unknown) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
  };
}
function openAiBody(payload: unknown) {
  return {
    choices: [
      { finish_reason: 'stop', message: { content: JSON.stringify(payload) } },
    ],
  };
}
function anthropicToolBody(payload: unknown) {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', name: 'unit_conversion', input: payload }],
  };
}
function ollamaBody(payload: unknown) {
  return { message: { content: JSON.stringify(payload) } };
}

function bodyFor(serviceType: string, payload: unknown) {
  switch (serviceType) {
    case 'google':
      return googleBody(payload);
    case 'anthropic':
      return anthropicToolBody(payload);
    case 'ollama':
      return ollamaBody(payload);
    default:
      return openAiBody(payload);
  }
}

function mockFetch(
  jsonBody: unknown,
  init: { ok?: boolean; status?: number } = {}
) {
  const m = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => (typeof jsonBody === 'string' ? jsonBody : ''),
    json: async () => jsonBody,
  });
  global.fetch = m as typeof global.fetch;
  return m;
}

function setProvider(
  serviceType = 'openai',
  detail: Record<string, unknown> = {}
) {
  // @ts-expect-error mocked
  chatRepository.getActiveAiServiceSetting.mockResolvedValue(
    makeAiSetting({ service_type: serviceType })
  );
  // @ts-expect-error mocked
  chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
    makeAiServiceDetail({ service_type: serviceType, ...detail })
  );
}

function capturedBody(m: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = m.mock.calls[0][1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('estimateUnitConversion', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('throws NoAiServiceError when getAiServiceSettingForBackend returns null', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeAiSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(null);
    await expect(
      estimateUnitConversion(TEST_USER_ID, baseRequest)
    ).rejects.toBeInstanceOf(NoAiServiceError);
  });

  it('throws NoAiServiceError when non-ollama service has no api_key', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as typeof fetch;
    setProvider('openai', { api_key: null });
    await expect(
      estimateUnitConversion(TEST_USER_ID, baseRequest)
    ).rejects.toBeInstanceOf(NoAiServiceError);
    expect(fetchSpy).not.toHaveBeenCalled();
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
      setProvider(serviceType, { api_key: apiKey, custom_url: '   ' });

      await expect(
        estimateUnitConversion(TEST_USER_ID, baseRequest)
      ).rejects.toBeInstanceOf(NoAiServiceError);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it('returns parsed estimate on a successful OpenAI call', async () => {
    setProvider();
    mockFetch(openAiBody(sampleAiResponse));

    const result = await estimateUnitConversion(TEST_USER_ID, baseRequest);
    expect(result).toEqual({
      estimatedAmount: 227,
      confidence: 'medium',
      fromUnit: 'cup',
      fromAmount: 1,
      toUnit: 'g',
    });
  });

  // Each entry sets the backend detail used for dispatch; the per-provider
  // request-body shapes themselves are owned by providerDispatch.test.ts.
  const PROVIDER_CASES: {
    service_type: string;
    api_key: string | null;
    custom_url?: string;
  }[] = [
    { service_type: 'google', api_key: 'gem-key' },
    { service_type: 'openai', api_key: 'sk-test' },
    { service_type: 'anthropic', api_key: 'anth-key' },
    { service_type: 'mistral', api_key: 'mistral-key' },
    { service_type: 'groq', api_key: 'groq-key' },
    { service_type: 'openrouter', api_key: 'or-key' },
    {
      service_type: 'openai_compatible',
      api_key: 'oc-key',
      custom_url: 'https://example.local/v1',
    },
    {
      service_type: 'custom',
      api_key: 'custom-key',
      custom_url: 'https://example.local/api/foo',
    },
    {
      service_type: 'ollama',
      api_key: null,
      custom_url: 'http://localhost:11434',
    },
  ];

  it.each(PROVIDER_CASES)(
    'returns the parsed estimate for $service_type',
    async ({ service_type, api_key, custom_url }) => {
      setProvider(service_type, { api_key, custom_url: custom_url ?? null });
      mockFetch(bodyFor(service_type, sampleAiResponse));

      const result = await estimateUnitConversion(TEST_USER_ID, baseRequest);
      expect(result).toEqual({
        estimatedAmount: 227,
        confidence: 'medium',
        fromUnit: 'cup',
        fromAmount: 1,
        toUnit: 'g',
      });
    }
  );

  it('sends the prompt, temperature 0, and the unit_conversion schema to OpenAI', async () => {
    setProvider();
    const m = mockFetch(openAiBody(sampleAiResponse));
    await estimateUnitConversion(TEST_USER_ID, baseRequest);

    const body = capturedBody(m);
    const messages = body.messages as Array<{ content: string }>;
    expect(messages[0].content).toContain('Greek yogurt');
    expect(messages[0].content).toContain('1 cup  →  g');
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'unit_conversion',
        strict: true,
        schema: STRUCTURED_OUTPUT_SCHEMA,
      },
    });
  });

  it('sends temperature 0 via options and the schema as format to Ollama', async () => {
    setProvider('ollama', {
      api_key: null,
      custom_url: 'http://localhost:11434',
    });
    const m = mockFetch(ollamaBody(sampleAiResponse));
    await estimateUnitConversion(TEST_USER_ID, baseRequest);

    const body = capturedBody(m);
    expect(body.options).toEqual({ temperature: 0 });
    expect(body.format).toEqual(STRUCTURED_OUTPUT_SCHEMA);
  });

  it('throws ProviderResponseError when AI returns malformed JSON', async () => {
    setProvider();
    mockFetch({
      choices: [{ message: { content: 'not actually json at all' } }],
    });

    await expect(
      estimateUnitConversion(TEST_USER_ID, baseRequest)
    ).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it('throws ProviderResponseError when AI response fails schema validation', async () => {
    setProvider();
    mockFetch(
      openAiBody({ estimated_amount: 'not a number', confidence: 'medium' })
    );

    await expect(
      estimateUnitConversion(TEST_USER_ID, baseRequest)
    ).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it('throws ProviderResponseError when AI provider returns non-OK status', async () => {
    setProvider();
    mockFetch('internal server error', { ok: false, status: 500 });

    await expect(
      estimateUnitConversion(TEST_USER_ID, baseRequest)
    ).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it('throws ProviderResponseError (not NoAiServiceError) when the request times out', async () => {
    setProvider();
    const err = new Error('aborted');
    err.name = 'TimeoutError';
    global.fetch = vi.fn().mockRejectedValue(err) as typeof global.fetch;

    await expect(
      estimateUnitConversion(TEST_USER_ID, baseRequest)
    ).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it('strips markdown code fences from AI response before parsing', async () => {
    setProvider();
    const fenced = `\`\`\`json\n${JSON.stringify(sampleAiResponse)}\n\`\`\``;
    mockFetch({
      choices: [{ finish_reason: 'stop', message: { content: fenced } }],
    });

    const result = await estimateUnitConversion(TEST_USER_ID, baseRequest);
    expect(result.estimatedAmount).toBe(227);
  });
});
