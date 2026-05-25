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
  reasoning: 'Typical plain Greek yogurt density ~0.96 g/ml × 236 ml ≈ 227 g.',
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
      reasoning: sampleAiResponse.reasoning,
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
      reasoning: 'x',
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
