import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import chatRepository from '../models/chatRepository.js';
import { estimateFoodPhotoNutrition } from '../services/foodPhotoEstimationService.js';

vi.mock('../models/chatRepository');
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

const mockGetActiveSetting = vi.mocked(
  chatRepository.getActiveAiServiceSetting
);
const mockGetBackendSetting = vi.mocked(
  chatRepository.getAiServiceSettingForBackend
);

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

// Satisfies foodPhotoEstimateResponseSchema; reused as both the upstream
// payload and the expected parsed estimate.
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

// Per-family upstream response-body factories matching each provider's wire
// shape. google/openai/ollama deliver the payload as a JSON *string* the helper
// parses; anthropic returns the object directly in a tool_use block.
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
// The helper's extractor finds the tool block by the service's schemaName
// ('food_photo_estimate'), so the body must emit exactly that name — any
// other name mis-extracts → UPSTREAM_ERROR.
function anthropicToolBody(payload: unknown) {
  return {
    stop_reason: 'tool_use',
    content: [
      { type: 'tool_use', name: 'food_photo_estimate', input: payload },
    ],
  };
}
function ollamaBody(payload: unknown) {
  return { message: { content: JSON.stringify(payload) } };
}

type ProviderFamily = 'google' | 'openai' | 'anthropic' | 'ollama';

function familyFor(serviceType: string): ProviderFamily {
  switch (serviceType) {
    case 'google':
      return 'google';
    case 'anthropic':
      return 'anthropic';
    case 'ollama':
      return 'ollama';
    default:
      return 'openai';
  }
}

function bodyFor(serviceType: string, payload: unknown) {
  switch (familyFor(serviceType)) {
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

function capturedBody(m: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = m.mock.calls[0];
  const init = call[1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

// The prompt-building tests run against google, where the prompt lives in the
// last (text) part of the request body.
function googlePromptText(body: Record<string, unknown>): string {
  const parts = (body.contents as Array<{ parts: Array<{ text?: string }> }>)[0]
    .parts;
  return parts.find((p) => typeof p.text === 'string')?.text ?? '';
}

describe('estimateFoodPhotoNutrition', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Each entry sets the backend detail used for dispatch. The provider comes
  // from the backend mock, not the active-setting mock.
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

  describe('all-provider happy path', () => {
    it.each(PROVIDER_CASES)(
      'returns the parsed estimate for $service_type',
      async ({ service_type, api_key, custom_url }) => {
        mockGetActiveSetting.mockResolvedValue(makeSetting({ service_type }));
        mockGetBackendSetting.mockResolvedValue(
          makeServiceDetail({
            service_type,
            api_key,
            custom_url: custom_url ?? null,
          })
        );
        mockFetch(bodyFor(service_type, sampleEstimate));

        const result = await estimateFoodPhotoNutrition({
          base64Image: TEST_BASE64,
          mimeType: TEST_MIME,
          userId: TEST_USER_ID,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.estimate.meal_summary).toBe(
            'Grilled chicken with rice'
          );
          expect(result.estimate.totals.calories_kcal).toBe(250);
        }
      }
    );
  });

  describe('service plumbing', () => {
    it('returns INVALID_REQUEST when no image is supplied', async () => {
      const result = await estimateFoodPhotoNutrition({
        images: [],
        userId: TEST_USER_ID,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('INVALID_REQUEST');
      }
    });

    it('returns NO_AI_CONFIGURED when getActiveAiServiceSetting returns null', async () => {
      mockGetActiveSetting.mockResolvedValue(null);
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
      mockGetActiveSetting.mockResolvedValue(makeSetting());
      mockGetBackendSetting.mockResolvedValue(null);
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

    it('returns API_KEY_MISSING when a non-ollama provider has no api_key', async () => {
      mockGetActiveSetting.mockResolvedValue(makeSetting());
      mockGetBackendSetting.mockResolvedValue(
        makeServiceDetail({ api_key: null })
      );
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as typeof global.fetch;
      const result = await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('API_KEY_MISSING');
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('prompt building (service-owned)', () => {
    beforeEach(() => {
      mockGetActiveSetting.mockResolvedValue(makeSetting());
      mockGetBackendSetting.mockResolvedValue(makeServiceDetail());
    });

    it('renders the weight slot the caller supplies', async () => {
      const m = mockFetch(googleBody(sampleEstimate));
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
        weightSlot: '16 oz (approximately 454 g)',
      });
      expect(googlePromptText(capturedBody(m))).toContain(
        '16 oz (approximately 454 g)'
      );
    });

    it('renders an empty weight slot when no weight is provided', async () => {
      const m = mockFetch(googleBody(sampleEstimate));
      await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      expect(googlePromptText(capturedBody(m))).toContain(
        'User-provided total weight (optional): ""'
      );
    });

    it('keeps the singular prompt for a single image', async () => {
      const m = mockFetch(googleBody(sampleEstimate));
      await estimateFoodPhotoNutrition({
        images: [{ base64: 'aW1n', mimeType: 'image/jpeg' }],
        userId: TEST_USER_ID,
      });
      const prompt = googlePromptText(capturedBody(m));
      expect(prompt).toContain('Analyze the meal photo');
      expect(prompt).not.toContain('ONE meal');
    });

    it('tells the model multiple images are one meal when given several', async () => {
      const m = mockFetch(googleBody(sampleEstimate));
      await estimateFoodPhotoNutrition({
        images: [
          { base64: 'aW1nMQ==', mimeType: 'image/jpeg' },
          { base64: 'aW1nMg==', mimeType: 'image/jpeg' },
        ],
        userId: TEST_USER_ID,
      });
      const prompt = googlePromptText(capturedBody(m));
      expect(prompt).toContain('2 provided photos');
      expect(prompt).toContain('ONE meal');
    });
  });

  describe('dispatch category → food-photo code mapping', () => {
    function mockGoogle() {
      mockGetActiveSetting.mockResolvedValue(makeSetting());
      mockGetBackendSetting.mockResolvedValue(makeServiceDetail());
    }
    function mockOpenAi() {
      mockGetActiveSetting.mockResolvedValue(
        makeSetting({ service_type: 'openai' })
      );
      mockGetBackendSetting.mockResolvedValue(
        makeServiceDetail({ service_type: 'openai', api_key: 'sk-test' })
      );
    }

    const estimate = () =>
      estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });

    it.each([['TimeoutError'], ['AbortError']])(
      'maps a %s fetch rejection → TIMEOUT',
      async (errorName) => {
        mockGoogle();
        const err = new Error('aborted');
        err.name = errorName;
        global.fetch = vi.fn().mockRejectedValue(err) as typeof global.fetch;
        const result = await estimate();
        expect(result.success).toBe(false);
        if (!result.success) expect(result.code).toBe('TIMEOUT');
      }
    );

    it('maps a non-2xx upstream response → UPSTREAM_ERROR', async () => {
      mockGoogle();
      mockFetch('Internal server error', { ok: false, status: 500 });
      const result = await estimate();
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('UPSTREAM_ERROR');
    });

    it('maps an openai refusal → CONTENT_BLOCKED', async () => {
      mockOpenAi();
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          choices: [
            { finish_reason: 'stop', message: { refusal: "I can't help" } },
          ],
        }),
      }) as typeof global.fetch;
      const result = await estimate();
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('CONTENT_BLOCKED');
    });

    it('maps an empty response body → CONTENT_BLOCKED', async () => {
      // Today's extractors only reject non-string content, so an empty string
      // would fall through to JSON.parse('') → PARSE_ERROR. The helper treats
      // empty/whitespace as no_content, which we map to CONTENT_BLOCKED.
      mockOpenAi();
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          choices: [{ finish_reason: 'stop', message: { content: '' } }],
        }),
      }) as typeof global.fetch;
      const result = await estimate();
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('CONTENT_BLOCKED');
    });

    it('maps invalid JSON → PARSE_ERROR', async () => {
      mockOpenAi();
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          choices: [
            { finish_reason: 'stop', message: { content: 'not json at all' } },
          ],
        }),
      }) as typeof global.fetch;
      const result = await estimate();
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('PARSE_ERROR');
    });

    it("maps finish_reason 'length' (truncated) → PARSE_ERROR", async () => {
      mockOpenAi();
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          choices: [
            {
              finish_reason: 'length',
              message: { content: '{"meal_summary":"partial"}' },
            },
          ],
        }),
      }) as typeof global.fetch;
      const result = await estimate();
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('PARSE_ERROR');
    });

    it('rejects HEIC to anthropic with UNSUPPORTED_MIME_TYPE before any upstream call', async () => {
      mockGetActiveSetting.mockResolvedValue(
        makeSetting({ service_type: 'anthropic' })
      );
      mockGetBackendSetting.mockResolvedValue(
        makeServiceDetail({ service_type: 'anthropic', api_key: 'anth-key' })
      );
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as typeof global.fetch;
      const result = await estimateFoodPhotoNutrition({
        images: [{ base64: 'aGVsbG8=', mimeType: 'image/heic' }],
        userId: TEST_USER_ID,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('UNSUPPORTED_MIME_TYPE');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('maps a blank custom_url on ollama → NO_AI_CONFIGURED', async () => {
      mockGetActiveSetting.mockResolvedValue(
        makeSetting({ service_type: 'ollama' })
      );
      mockGetBackendSetting.mockResolvedValue(
        makeServiceDetail({
          service_type: 'ollama',
          api_key: null,
          custom_url: '   ',
        })
      );
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as typeof global.fetch;
      const result = await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('NO_AI_CONFIGURED');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('domain validation', () => {
    it('returns PARSE_ERROR when the provider payload fails the Zod schema', async () => {
      mockGetActiveSetting.mockResolvedValue(makeSetting());
      mockGetBackendSetting.mockResolvedValue(makeServiceDetail());
      const wrongShape: Record<string, unknown> = { ...sampleEstimate };
      delete wrongShape.totals;
      mockFetch(googleBody(wrongShape));
      const result = await estimateFoodPhotoNutrition({
        base64Image: TEST_BASE64,
        mimeType: TEST_MIME,
        userId: TEST_USER_ID,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('PARSE_ERROR');
    });
  });
});
