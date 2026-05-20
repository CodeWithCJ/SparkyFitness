import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import chatRepository from '../models/chatRepository.js';
import {
  estimateFoodPhotoNutrition,
  toStrictJsonSchema,
  RESPONSE_SCHEMA,
} from '../services/foodPhotoEstimationService.js';

vi.mock('../models/chatRepository');
vi.mock('../config/logging', () => ({ log: vi.fn() }));

const TEST_USER_ID = 'user-123';
const TEST_BASE64 = 'iVBORw0KGgoAAAANSUhEUg==';
const TEST_MIME = 'image/jpeg';

const makeSetting = (overrides: Record<string, unknown> = {}) => ({
  id: 'setting-1',
  service_name: 'My Provider',
  service_type: 'google',
  is_active: true,
  model_name: 'gemini-2.5-flash',
  is_public: false,
  source: 'user',
  ...overrides,
});

const makeServiceDetail = (overrides: Record<string, unknown> = {}) => ({
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

function mockGoogleSuccess(payload: unknown) {
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

function mockOpenAiSuccess(payload: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify(payload) },
        },
      ],
    }),
  });
}

function mockAnthropicSuccess(payload: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', name: 'submit_food_estimate', input: payload },
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
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeSetting());
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

  it('returns UNSUPPORTED_PROVIDER when active provider is not in allow-list', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeSetting({ service_type: 'mistral', source: 'global' })
    );
    const result = await estimateFoodPhotoNutrition({
      base64Image: TEST_BASE64,
      mimeType: TEST_MIME,
      userId: TEST_USER_ID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('UNSUPPORTED_PROVIDER');
      expect(result.error).toContain('mistral');
      expect(result.error).toContain('google');
      expect(result.error).toContain('openai');
      expect(result.error).toContain('anthropic');
    }
    expect(chatRepository.getAiServiceSettingForBackend).not.toHaveBeenCalled();
  });

  it('returns API_KEY_MISSING when provider setting has no api_key', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeServiceDetail({ api_key: null })
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

  it('returns the parsed estimate on Google happy path', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeServiceDetail()
    );
    mockGoogleSuccess(sampleEstimate);
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
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeServiceDetail()
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
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeServiceDetail()
    );
    const wrongShape = { ...sampleEstimate };
    // @ts-expect-error deliberately removing required field
    delete wrongShape.totals;
    mockGoogleSuccess(wrongShape);
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

  it('returns CONTENT_BLOCKED when Google returns no text part', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeServiceDetail()
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

  it('returns UPSTREAM_ERROR when provider returns 500', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeServiceDetail()
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
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeServiceDetail()
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

  it.each([
    ['TimeoutError', 'The operation was aborted due to timeout'],
    ['AbortError', 'The operation was aborted'],
  ])(
    'returns TIMEOUT when fetch rejects with %s (server treats user-cancel and timeout the same)',
    async (errorName, errorMessage) => {
      // @ts-expect-error mocked
      chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeSetting());
      // @ts-expect-error mocked
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeServiceDetail()
      );
      const err = new Error(errorMessage);
      err.name = errorName;
      global.fetch = vi.fn().mockRejectedValue(err);
      const result = await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('TIMEOUT');
      }
    }
  );

  it('calls AbortSignal.timeout(90_000) and passes the returned signal to fetch', async () => {
    // Locks in the actual contract: the 90s constant is supplied, and the signal
    // produced by AbortSignal.timeout reaches the fetch init. A regression that
    // replaces it with `new AbortController().signal` (never fires) would not
    // call the spy and would fail this test.
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeServiceDetail()
    );

    const sentinelSignal = new AbortController().signal;
    const timeoutSpy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(sentinelSignal);

    try {
      mockGoogleSuccess(sampleEstimate);
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });

      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      expect(timeoutSpy).toHaveBeenCalledWith(90_000);
      // @ts-expect-error mock typing
      const [, options] = global.fetch.mock.calls[0];
      expect((options as RequestInit).signal).toBe(sentinelSignal);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('returns UPSTREAM_ERROR when response.json throws', async () => {
    // @ts-expect-error mocked
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeSetting());
    // @ts-expect-error mocked
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeServiceDetail()
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

  describe('Google request assembly', () => {
    beforeEach(() => {
      // @ts-expect-error mocked
      chatRepository.getActiveAiServiceSetting.mockResolvedValue(makeSetting());
      // @ts-expect-error mocked
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeServiceDetail()
      );
      mockGoogleSuccess(sampleEstimate);
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

    it('sends the base64 image and mime type in the inline_data part', async () => {
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      // @ts-expect-error mock typing
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const imagePart = body.contents[0].parts.find(
        (p: { inline_data?: unknown }) => p.inline_data !== undefined
      );
      expect(imagePart).toBeDefined();
      expect(imagePart.inline_data.data).toBe(TEST_BASE64);
      expect(imagePart.inline_data.mime_type).toBe(TEST_MIME);
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

    it('uses the user-configured model_name in the Gemini URL', async () => {
      // @ts-expect-error mocked
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeServiceDetail({ model_name: 'gemini-2.5-pro' })
      );
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      // @ts-expect-error mock typing
      const [url] = global.fetch.mock.calls[0];
      expect(url).toContain('gemini-2.5-pro');
    });

    it('falls back to the central vision default when user has no model_name', async () => {
      // @ts-expect-error mocked
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeServiceDetail({ model_name: null })
      );
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      // @ts-expect-error mock typing
      const [url] = global.fetch.mock.calls[0];
      expect(url).toContain('gemini-2.5-flash');
    });
  });

  describe('OpenAI provider', () => {
    const openAiSetting = makeSetting({ service_type: 'openai' });
    const openAiDetail = makeServiceDetail({
      service_type: 'openai',
      api_key: 'sk-test',
      model_name: 'gpt-3.5-turbo',
    });

    beforeEach(() => {
      // @ts-expect-error mocked
      chatRepository.getActiveAiServiceSetting.mockResolvedValue(openAiSetting);
      // @ts-expect-error mocked
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        openAiDetail
      );
    });

    it('returns the parsed estimate on happy path', async () => {
      mockOpenAiSuccess(sampleEstimate);
      const result = await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.estimate.meal_summary).toBe('Grilled chicken with rice');
      }
    });

    it('posts to the chat completions endpoint with bearer auth and strict json_schema', async () => {
      mockOpenAiSuccess(sampleEstimate);
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      // @ts-expect-error mock typing
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(options.headers.Authorization).toBe('Bearer sk-test');
      const body = JSON.parse(options.body);
      expect(body.response_format.type).toBe('json_schema');
      expect(body.response_format.json_schema.strict).toBe(true);
      const schema = body.response_format.json_schema.schema;
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties.items.items.additionalProperties).toBe(false);
      expect(schema.properties.totals.additionalProperties).toBe(false);
    });

    it('sends the base64 image as a data URL in the image_url content part', async () => {
      mockOpenAiSuccess(sampleEstimate);
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      // @ts-expect-error mock typing
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const imagePart = body.messages[0].content.find(
        (p: { type?: string }) => p.type === 'image_url'
      );
      expect(imagePart).toBeDefined();
      expect(imagePart.image_url.url).toBe(
        `data:${TEST_MIME};base64,${TEST_BASE64}`
      );
    });

    it('uses the user-configured model_name', async () => {
      mockOpenAiSuccess(sampleEstimate);
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      // @ts-expect-error mock typing
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.model).toBe('gpt-3.5-turbo');
    });

    it('falls back to the central vision default when user has no model_name', async () => {
      // @ts-expect-error mocked
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue({
        ...openAiDetail,
        model_name: null,
      });
      mockOpenAiSuccess(sampleEstimate);
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      // @ts-expect-error mock typing
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.model).toBe('gpt-4.1-mini');
    });

    it('returns CONTENT_BLOCKED when message.refusal is set', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              finish_reason: 'stop',
              message: { refusal: "I can't help with that" },
            },
          ],
        }),
      });
      const result = await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('CONTENT_BLOCKED');
    });

    it("returns CONTENT_BLOCKED when finish_reason is 'content_filter'", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              finish_reason: 'content_filter',
              message: { content: '' },
            },
          ],
        }),
      });
      const result = await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('CONTENT_BLOCKED');
    });

    it("returns PARSE_ERROR when finish_reason is 'length' (do not safeParse partial)", async () => {
      // Provide a content string that is valid JSON but lacks required fields,
      // to prove the length-truncation path short-circuits BEFORE schema parse.
      const partial = JSON.stringify({ meal_summary: 'partial' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              finish_reason: 'length',
              message: { content: partial },
            },
          ],
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
        expect(result.error.toLowerCase()).toContain('truncated');
      }
    });
  });

  describe('Anthropic provider', () => {
    const anthropicSetting = makeSetting({ service_type: 'anthropic' });
    const anthropicDetail = makeServiceDetail({
      service_type: 'anthropic',
      api_key: 'anth-test',
      model_name: 'claude-3-5-sonnet-20241022',
    });

    beforeEach(() => {
      // @ts-expect-error mocked
      chatRepository.getActiveAiServiceSetting.mockResolvedValue(
        anthropicSetting
      );
      // @ts-expect-error mocked
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        anthropicDetail
      );
    });

    it('returns the parsed estimate on happy path', async () => {
      mockAnthropicSuccess(sampleEstimate);
      const result = await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.estimate.meal_summary).toBe('Grilled chicken with rice');
      }
    });

    it('posts to the messages endpoint with x-api-key + anthropic-version, forces tool call, max_tokens >= 2048', async () => {
      mockAnthropicSuccess(sampleEstimate);
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      // @ts-expect-error mock typing
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(options.headers['x-api-key']).toBe('anth-test');
      expect(options.headers['anthropic-version']).toBe('2023-06-01');
      const body = JSON.parse(options.body);
      expect(body.max_tokens).toBeGreaterThanOrEqual(2048);
      expect(body.tool_choice).toEqual({
        type: 'tool',
        name: 'submit_food_estimate',
      });
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].name).toBe('submit_food_estimate');
      expect(body.tools[0].strict).toBe(true);
      expect(body.tools[0].input_schema.additionalProperties).toBe(false);
      expect(
        body.tools[0].input_schema.properties.items.items.additionalProperties
      ).toBe(false);
      expect(
        body.tools[0].input_schema.properties.totals.additionalProperties
      ).toBe(false);
    });

    it('sends the base64 image and media_type in the image source block', async () => {
      mockAnthropicSuccess(sampleEstimate);
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      // @ts-expect-error mock typing
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      const imagePart = body.messages[0].content.find(
        (p: { type?: string }) => p.type === 'image'
      );
      expect(imagePart).toBeDefined();
      expect(imagePart.source.type).toBe('base64');
      expect(imagePart.source.data).toBe(TEST_BASE64);
      expect(imagePart.source.media_type).toBe(TEST_MIME);
    });

    it('uses the user-configured model_name', async () => {
      mockAnthropicSuccess(sampleEstimate);
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      // @ts-expect-error mock typing
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('falls back to the central vision default when user has no model_name', async () => {
      // @ts-expect-error mocked
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue({
        ...anthropicDetail,
        model_name: null,
      });
      mockAnthropicSuccess(sampleEstimate);
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      // @ts-expect-error mock typing
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.model).toBe('claude-haiku-4-5');
    });

    it("returns CONTENT_BLOCKED when stop_reason is 'refusal'", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ stop_reason: 'refusal', content: [] }),
      });
      const result = await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('CONTENT_BLOCKED');
    });

    it("returns CONTENT_BLOCKED when stop_reason is 'end_turn' with no tool_use block", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'I cannot help with that.' }],
        }),
      });
      const result = await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('CONTENT_BLOCKED');
    });

    it("returns PARSE_ERROR when stop_reason is 'max_tokens' (do not accept partial input)", async () => {
      const partial = { meal_summary: 'partial' };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          stop_reason: 'max_tokens',
          content: [
            { type: 'tool_use', name: 'submit_food_estimate', input: partial },
          ],
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
        expect(result.error.toLowerCase()).toContain('truncated');
      }
    });
  });
});

describe('toStrictJsonSchema', () => {
  it('adds additionalProperties: false to every object node (root, items[], totals)', () => {
    const strict = toStrictJsonSchema(RESPONSE_SCHEMA as never);
    expect(strict.additionalProperties).toBe(false);
    expect(strict.properties?.items?.items?.additionalProperties).toBe(false);
    expect(strict.properties?.totals?.additionalProperties).toBe(false);
  });

  it('recursively strips propertyOrdering from every node', () => {
    const strict = toStrictJsonSchema(RESPONSE_SCHEMA as never);
    expect(strict.propertyOrdering).toBeUndefined();
    expect(strict.properties?.items?.items?.propertyOrdering).toBeUndefined();
    expect(strict.properties?.totals?.propertyOrdering).toBeUndefined();
  });

  it('does not mutate the source RESPONSE_SCHEMA', () => {
    const before = JSON.stringify(RESPONSE_SCHEMA);
    toStrictJsonSchema(RESPONSE_SCHEMA as never);
    expect(JSON.stringify(RESPONSE_SCHEMA)).toBe(before);
  });

  it('every key in properties appears in required (strict-mode invariant)', () => {
    const check = (node: {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
      items?: unknown;
    }): void => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'object' && node.properties) {
        const propKeys = Object.keys(node.properties);
        const requiredSet = new Set(node.required ?? []);
        for (const key of propKeys) {
          expect(requiredSet.has(key)).toBe(true);
        }
        for (const value of Object.values(node.properties)) {
          check(value as never);
        }
      }
      if (node.items) check(node.items as never);
    };
    check(RESPONSE_SCHEMA as never);
  });
});
