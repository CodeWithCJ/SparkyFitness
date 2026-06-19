import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import undici from 'undici';
import chatRepository from '../models/chatRepository.js';
import { extractNutritionFromLabel } from '../services/labelScanService.js';

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
const mockAgent = vi.mocked(undici.Agent);

const TEST_USER_ID = 'user-123';
const TEST_BASE64 = 'iVBORw0KGgoAAAANSUhEUg==';
const TEST_MIME = 'image/png';

const makeAiSetting = (overrides: Record<string, unknown> = {}) => ({
  id: 'setting-1',
  service_name: 'My OpenAI',
  service_type: 'openai',
  is_active: true,
  model_name: 'gpt-4o',
  is_public: false,
  source: 'user',
  ...overrides,
});

const makeAiServiceDetail = (overrides: Record<string, unknown> = {}) => ({
  id: 'setting-1',
  service_type: 'openai',
  model_name: 'gpt-4o',
  api_key: 'sk-test-key',
  custom_url: null,
  timeout: null,
  ...overrides,
});

const sampleNutrition = {
  name: 'Protein Bar',
  brand: 'FitCo',
  serving_size: 60,
  serving_unit: 'g',
  calories: 230,
  protein: 20,
  carbs: 25,
  fat: 8,
  fiber: 3,
  saturated_fat: 2.5,
  trans_fat: 0,
  sodium: 150,
  sugars: 6,
  cholesterol: 10,
  potassium: 200,
  calcium: 100,
  iron: 2,
  vitamin_a: 50,
  vitamin_c: null,
};

// Per-family upstream response-body factories matching each provider's wire
// shape. Label scan is unstructured (no schema/tool), so every family —
// including anthropic — delivers the payload as a JSON *string* the helper
// parses.
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
function anthropicTextBody(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}
function ollamaBody(payload: unknown) {
  return { message: { content: JSON.stringify(payload) } };
}

function bodyFor(serviceType: string, payload: unknown) {
  switch (serviceType) {
    case 'google':
      return googleBody(payload);
    case 'anthropic':
      return anthropicTextBody(payload);
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

describe('extractNutritionFromLabel', () => {
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
      'returns the parsed nutrition for $service_type',
      async ({ service_type, api_key, custom_url }) => {
        mockGetActiveSetting.mockResolvedValue(makeAiSetting({ service_type }));
        mockGetBackendSetting.mockResolvedValue(
          makeAiServiceDetail({
            service_type,
            api_key,
            custom_url: custom_url ?? null,
          })
        );
        mockFetch(bodyFor(service_type, sampleNutrition));

        const result = await extractNutritionFromLabel(
          TEST_BASE64,
          TEST_MIME,
          TEST_USER_ID
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.nutrition).toEqual(sampleNutrition);
        }
      }
    );
  });

  describe('service plumbing', () => {
    it('returns no_ai_configured when getActiveAiServiceSetting returns null', async () => {
      mockGetActiveSetting.mockResolvedValue(null);
      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID
      );
      expect(result).toEqual({
        success: false,
        category: 'no_ai_configured',
        error: 'No AI service configured',
      });
    });

    it('returns no_ai_configured when getAiServiceSettingForBackend returns null', async () => {
      mockGetActiveSetting.mockResolvedValue(makeAiSetting());
      mockGetBackendSetting.mockResolvedValue(null);
      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID
      );
      expect(result).toEqual({
        success: false,
        category: 'no_ai_configured',
        error: 'No AI service configured',
      });
    });

    it('returns api_key_missing when a non-ollama provider has no api_key', async () => {
      mockGetActiveSetting.mockResolvedValue(makeAiSetting());
      mockGetBackendSetting.mockResolvedValue(
        makeAiServiceDetail({ api_key: null })
      );
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as typeof global.fetch;
      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe('api_key_missing');
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns custom_url_missing when ollama has a blank custom_url', async () => {
      mockGetActiveSetting.mockResolvedValue(
        makeAiSetting({ service_type: 'ollama' })
      );
      mockGetBackendSetting.mockResolvedValue(
        makeAiServiceDetail({
          service_type: 'ollama',
          api_key: null,
          custom_url: '   ',
        })
      );
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as typeof global.fetch;
      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe('custom_url_missing');
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns unsupported_provider for an unknown service type', async () => {
      mockGetActiveSetting.mockResolvedValue(
        makeAiSetting({ service_type: 'unknown_provider' })
      );
      mockGetBackendSetting.mockResolvedValue(
        makeAiServiceDetail({ service_type: 'unknown_provider' })
      );
      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe('unsupported_provider');
      }
    });

    it('sends the label-scan prompt the service owns', async () => {
      mockGetActiveSetting.mockResolvedValue(makeAiSetting());
      mockGetBackendSetting.mockResolvedValue(makeAiServiceDetail());
      const m = mockFetch(openAiBody(sampleNutrition));
      await extractNutritionFromLabel(TEST_BASE64, TEST_MIME, TEST_USER_ID);
      const init = m.mock.calls[0][1] as { body: string };
      expect(init.body).toContain('Extract the nutrition facts');
    });

    it('passes the configured timeout to the Ollama agent', async () => {
      mockGetActiveSetting.mockResolvedValue(
        makeAiSetting({ service_type: 'ollama' })
      );
      mockGetBackendSetting.mockResolvedValue(
        makeAiServiceDetail({
          service_type: 'ollama',
          api_key: null,
          custom_url: 'http://localhost:11434',
          timeout: 5000,
        })
      );
      mockFetch(ollamaBody(sampleNutrition));
      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID
      );
      expect(result.success).toBe(true);
      expect(mockAgent).toHaveBeenCalledWith({
        headersTimeout: 5000,
        bodyTimeout: 5000,
      });
    });
  });

  describe('dispatch error categories', () => {
    beforeEach(() => {
      mockGetActiveSetting.mockResolvedValue(makeAiSetting());
      mockGetBackendSetting.mockResolvedValue(makeAiServiceDetail());
    });

    it('returns upstream_error when the API returns a non-OK status', async () => {
      vi.useFakeTimers();
      try {
        mockFetch('Rate limit exceeded', { ok: false, status: 429 });
        const promise = extractNutritionFromLabel(
          TEST_BASE64,
          TEST_MIME,
          TEST_USER_ID
        );
        await vi.runAllTimersAsync();
        const result = await promise;
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.category).toBe('upstream_error');
          expect(result.error).toContain('status 429');
        }
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns no_content when the AI response has no content', async () => {
      mockFetch({ choices: [{ message: { content: null } }] });
      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe('no_content');
      }
    });

    it('strips markdown code fences from the response', async () => {
      const wrappedJson =
        '```json\n' + JSON.stringify(sampleNutrition) + '\n```';
      mockFetch({
        choices: [{ finish_reason: 'stop', message: { content: wrappedJson } }],
      });
      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.nutrition).toEqual(sampleNutrition);
      }
    });

    it('returns parse_error when the response is not valid JSON', async () => {
      mockFetch({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: 'not valid json at all' },
          },
        ],
      });
      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe('parse_error');
      }
    });
  });
});
