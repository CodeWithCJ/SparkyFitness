import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import chatRepository from '../models/chatRepository.js';
import { estimateFoodPhotoNutrition } from '../services/foodPhotoEstimationService.js';

vi.mock('../models/chatRepository');
vi.mock('../config/logging', () => ({ log: vi.fn() }));

const TEST_USER_ID = 'user-123';
const TEST_BASE64 = 'iVBORw0KGgoAAAANSUhEUg==';
const TEST_MIME = 'image/jpeg';

const makeGoogleSetting = (overrides: Record<string, unknown> = {}) => ({
  id: 'setting-1',
  service_name: 'My Gemini',
  service_type: 'google',
  is_active: true,
  model_name: 'gemini-2.5-flash',
  is_public: false,
  source: 'user',
  ...overrides,
});

const makeGoogleServiceDetail = (overrides: Record<string, unknown> = {}) => ({
  id: 'setting-1',
  service_type: 'google',
  model_name: 'gemini-2.5-flash',
  api_key: 'gem-key',
  custom_url: null,
  timeout: null,
  ...overrides,
});

const sampleEstimate = {
  meal_summary: 'Grilled chicken with rice',
  overall_confidence: 'high',
  confidence_reason: 'Clear, well-lit photo',
  items: [
    {
      name: 'grilled chicken breast',
      estimated_grams: 150,
      portion_description: '1 medium breast',
      preparation: 'grilled',
      calories_kcal: 250,
      protein_g: 45,
      carbs_g: 0,
      fat_g: 6,
      fiber_g: 0,
      sugar_g: 0,
      item_confidence: 'high',
      assumptions: [],
    },
  ],
  totals: {
    calories_kcal: 250,
    protein_g: 45,
    carbs_g: 0,
    fat_g: 6,
    fiber_g: 0,
    sugar_g: 0,
    total_grams: 150,
  },
  user_weight_reconciliation: '',
  clarifying_questions: [],
};

function mockFetchSuccess(payload: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(payload) }],
          },
        },
      ],
    }),
  });
}

describe('estimateFoodPhotoNutrition', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns NO_AI_CONFIGURED when getActiveAiServiceSetting returns null', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(null);
    const result = await estimateFoodPhotoNutrition({
      base64Image: TEST_BASE64,
      mimeType: TEST_MIME,
      userId: TEST_USER_ID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('NO_AI_CONFIGURED');
    }
  });

  it('returns NO_AI_CONFIGURED when getAiServiceSettingForBackend returns null', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeGoogleSetting()
    );
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(null);
    const result = await estimateFoodPhotoNutrition({
      base64Image: TEST_BASE64,
      mimeType: TEST_MIME,
      userId: TEST_USER_ID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('NO_AI_CONFIGURED');
    }
  });

  it('returns PROVIDER_NOT_GOOGLE when active setting is OpenAI from global fallback', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeGoogleSetting({ service_type: 'openai', source: 'global' })
    );
    const result = await estimateFoodPhotoNutrition({
      base64Image: TEST_BASE64,
      mimeType: TEST_MIME,
      userId: TEST_USER_ID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('PROVIDER_NOT_GOOGLE');
      expect(result.error).toContain('openai');
    }
    expect(chatRepository.getAiServiceSettingForBackend).not.toHaveBeenCalled();
  });

  it('returns API_KEY_MISSING when Google setting has no api_key', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeGoogleSetting()
    );
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeGoogleServiceDetail({ api_key: null })
    );
    const result = await estimateFoodPhotoNutrition({
      base64Image: TEST_BASE64,
      mimeType: TEST_MIME,
      userId: TEST_USER_ID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('API_KEY_MISSING');
    }
  });

  it('returns the parsed estimate on happy path', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeGoogleSetting()
    );
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeGoogleServiceDetail()
    );
    mockFetchSuccess(sampleEstimate);
    const result = await estimateFoodPhotoNutrition({
      base64Image: TEST_BASE64,
      mimeType: TEST_MIME,
      userId: TEST_USER_ID,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.estimate.meal_summary).toBe('Grilled chicken with rice');
      expect(result.estimate.totals.calories_kcal).toBe(250);
    }
  });

  it('returns PARSE_ERROR when Gemini text is not JSON', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeGoogleSetting()
    );
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeGoogleServiceDetail()
    );
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'not json at all' }] } }],
      }),
    });
    const result = await estimateFoodPhotoNutrition({
      base64Image: TEST_BASE64,
      mimeType: TEST_MIME,
      userId: TEST_USER_ID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('PARSE_ERROR');
    }
  });

  it('returns PARSE_ERROR when Gemini JSON has the wrong shape', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeGoogleSetting()
    );
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeGoogleServiceDetail()
    );
    const wrongShape = { ...sampleEstimate };
    // @ts-expect-error deliberately removing required field
    delete wrongShape.totals;
    mockFetchSuccess(wrongShape);
    const result = await estimateFoodPhotoNutrition({
      base64Image: TEST_BASE64,
      mimeType: TEST_MIME,
      userId: TEST_USER_ID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('PARSE_ERROR');
    }
  });

  it('returns CONTENT_BLOCKED when no text part is returned', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeGoogleSetting()
    );
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeGoogleServiceDetail()
    );
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [] } }],
      }),
    });
    const result = await estimateFoodPhotoNutrition({
      base64Image: TEST_BASE64,
      mimeType: TEST_MIME,
      userId: TEST_USER_ID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('CONTENT_BLOCKED');
    }
  });

  it('returns UPSTREAM_ERROR when Gemini returns 500', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeGoogleSetting()
    );
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeGoogleServiceDetail()
    );
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    });
    const result = await estimateFoodPhotoNutrition({
      base64Image: TEST_BASE64,
      mimeType: TEST_MIME,
      userId: TEST_USER_ID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('UPSTREAM_ERROR');
    }
  });

  it('returns UPSTREAM_ERROR when fetch rejects', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeGoogleSetting()
    );
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeGoogleServiceDetail()
    );
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await estimateFoodPhotoNutrition({
      base64Image: TEST_BASE64,
      mimeType: TEST_MIME,
      userId: TEST_USER_ID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('UPSTREAM_ERROR');
    }
  });

  it('returns UPSTREAM_ERROR when response.json throws', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeGoogleSetting()
    );
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeGoogleServiceDetail()
    );
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('invalid json body');
      },
    });
    const result = await estimateFoodPhotoNutrition({
      base64Image: TEST_BASE64,
      mimeType: TEST_MIME,
      userId: TEST_USER_ID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('UPSTREAM_ERROR');
    }
  });

  describe('request assembly', () => {
    beforeEach(() => {
      // @ts-expect-error mocked
      chatRepository.getActiveAiServiceSetting.mockResolvedValue(
        makeGoogleSetting()
      );
      // @ts-expect-error mocked
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeGoogleServiceDetail()
      );
      mockFetchSuccess(sampleEstimate);
    });

    it("renders weight slot as '<n> oz (approximately <g> g)' when caller supplies that string", async () => {
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
        weightSlot: '16 oz (approximately 454 g)',
      });
      // @ts-expect-error mock typing
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toContain('generativelanguage.googleapis.com');
      expect(url).not.toContain('key=');
      expect(options.headers['x-goog-api-key']).toBe('gem-key');
      const body = JSON.parse(options.body);
      const promptPart = body.contents[0].parts.find(
        (p: { text?: string }) => typeof p.text === 'string'
      );
      expect(promptPart.text).toContain('16 oz (approximately 454 g)');
      expect(body.generationConfig.responseSchema).toBeDefined();
      expect(body.generationConfig.responseMimeType).toBe('application/json');
    });

    it("renders weight slot as '<n> g' for gram input", async () => {
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
        weightSlot: '450 g',
      });
      // @ts-expect-error mock typing
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const promptPart = body.contents[0].parts.find(
        (p: { text?: string }) => typeof p.text === 'string'
      );
      expect(promptPart.text).toContain('450 g');
    });

    it('renders an empty weight slot when no weight is provided', async () => {
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      // @ts-expect-error mock typing
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const promptPart = body.contents[0].parts.find(
        (p: { text?: string }) => typeof p.text === 'string'
      );
      expect(promptPart.text).toContain(
        'User-provided total weight (optional): ""'
      );
    });

    it('pins the URL to gemini-2.5-flash even if the user setting has a different model', async () => {
      // @ts-expect-error mocked
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeGoogleServiceDetail({ model_name: 'gemini-pro' })
      );
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      // @ts-expect-error mock typing
      const [url] = global.fetch.mock.calls[0];
      expect(url).toContain('gemini-2.5-flash');
      expect(url).not.toContain('gemini-pro');
    });
  });
});
