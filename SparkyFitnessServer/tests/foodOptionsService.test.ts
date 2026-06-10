import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import undici from 'undici';
import chatRepository from '../models/chatRepository.js';
import { processFoodOptionsRequest } from '../services/chatService.js';

vi.mock('../models/chatRepository');
vi.mock('../models/measurementRepository');
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

const mockGetBackendSetting = vi.mocked(
  chatRepository.getAiServiceSettingForBackend
);
const mockAgent = vi.mocked(undici.Agent);

const TEST_USER_ID = 'user-123';
const TEST_CONFIG_ID = 'setting-1';
const TEST_FOOD = 'apple';
const TEST_UNIT = 'piece';

const makeAiServiceDetail = (overrides: Record<string, unknown> = {}) => ({
  id: TEST_CONFIG_ID,
  service_type: 'openai',
  model_name: 'gpt-4o',
  api_key: 'sk-test-key',
  custom_url: null,
  timeout: null,
  source: 'user',
  ...overrides,
});

const sampleFoodOptions = [
  {
    name: 'Apple',
    serving_size: 1,
    serving_unit: 'piece',
    calories: 95,
    protein: 0.5,
    carbs: 25,
    fat: 0.3,
  },
  {
    name: 'Large Apple',
    serving_size: 1,
    serving_unit: 'piece',
    calories: 116,
    protein: 0.6,
    carbs: 31,
    fat: 0.4,
  },
];

// Per-family upstream response-body factories matching each provider's wire
// shape. Food options is unstructured (no schema/tool), so every family —
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

function runFoodOptions() {
  return processFoodOptionsRequest(
    TEST_FOOD,
    TEST_UNIT,
    TEST_USER_ID,
    TEST_CONFIG_ID
  );
}

describe('processFoodOptionsRequest', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

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
      'returns the raw JSON text for $service_type',
      async ({ service_type, api_key, custom_url }) => {
        mockGetBackendSetting.mockResolvedValue(
          makeAiServiceDetail({
            service_type,
            api_key,
            custom_url: custom_url ?? null,
          })
        );
        mockFetch(bodyFor(service_type, sampleFoodOptions));

        const result = await runFoodOptions();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.content).toBe(JSON.stringify(sampleFoodOptions));
        }
      }
    );
  });

  describe('request shape', () => {
    it('sends openai a single user message with the combined prompt and temperature 0.7', async () => {
      mockGetBackendSetting.mockResolvedValue(makeAiServiceDetail());
      const m = mockFetch(openAiBody(sampleFoodOptions));
      await runFoodOptions();
      const init = m.mock.calls[0][1] as { body: string };
      const body = JSON.parse(init.body);
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toContain('You are Sparky');
      expect(body.messages[0].content).toContain(
        'GENERATE_FOOD_OPTIONS:apple in piece'
      );
      expect(body.temperature).toBe(0.7);
    });

    it('authenticates google via header (not URL key) and requests JSON output', async () => {
      mockGetBackendSetting.mockResolvedValue(
        makeAiServiceDetail({ service_type: 'google', api_key: 'gem-key' })
      );
      const m = mockFetch(googleBody(sampleFoodOptions));
      await runFoodOptions();
      const [url, init] = m.mock.calls[0] as [
        string,
        { headers: Record<string, string>; body: string },
      ];
      expect(url).not.toContain('?key=');
      expect(init.headers['x-goog-api-key']).toBe('gem-key');
      const body = JSON.parse(init.body);
      expect(body.generationConfig.temperature).toBe(0.7);
      expect(body.generationConfig.responseMimeType).toBe('application/json');
    });

    it('sends anthropic temperature 0.7 and max_tokens 2048 with no system field', async () => {
      mockGetBackendSetting.mockResolvedValue(
        makeAiServiceDetail({ service_type: 'anthropic', api_key: 'anth-key' })
      );
      const m = mockFetch(anthropicTextBody(sampleFoodOptions));
      await runFoodOptions();
      const init = m.mock.calls[0][1] as { body: string };
      const body = JSON.parse(init.body);
      expect(body.temperature).toBe(0.7);
      expect(body.max_tokens).toBe(2048);
      expect(body).not.toHaveProperty('system');
    });

    it('sends ollama requests to /api/chat with temperature 0.7', async () => {
      mockGetBackendSetting.mockResolvedValue(
        makeAiServiceDetail({
          service_type: 'ollama',
          api_key: null,
          custom_url: 'http://localhost:11434',
        })
      );
      const m = mockFetch(ollamaBody(sampleFoodOptions));
      await runFoodOptions();
      const [url, init] = m.mock.calls[0] as [string, { body: string }];
      expect(url).toBe('http://localhost:11434/api/chat');
      const body = JSON.parse(init.body);
      expect(body.options.temperature).toBe(0.7);
    });

    it('passes the configured timeout to the Ollama agent', async () => {
      mockGetBackendSetting.mockResolvedValue(
        makeAiServiceDetail({
          service_type: 'ollama',
          api_key: null,
          custom_url: 'http://localhost:11434',
          timeout: 5000,
        })
      );
      mockFetch(ollamaBody(sampleFoodOptions));
      const result = await runFoodOptions();
      expect(result.success).toBe(true);
      expect(mockAgent).toHaveBeenCalledWith({
        headersTimeout: 5000,
        bodyTimeout: 5000,
      });
    });

    it('defaults the Ollama agent timeout to 120000ms when unset', async () => {
      mockGetBackendSetting.mockResolvedValue(
        makeAiServiceDetail({
          service_type: 'ollama',
          api_key: null,
          custom_url: 'http://localhost:11434',
          timeout: null,
        })
      );
      mockFetch(ollamaBody(sampleFoodOptions));
      const result = await runFoodOptions();
      expect(result.success).toBe(true);
      expect(mockAgent).toHaveBeenCalledWith({
        headersTimeout: 120000,
        bodyTimeout: 120000,
      });
    });
  });

  describe('service plumbing', () => {
    it('returns no_ai_configured when serviceConfigId is empty', async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as typeof global.fetch;
      const result = await processFoodOptionsRequest(
        TEST_FOOD,
        TEST_UNIT,
        TEST_USER_ID,
        ''
      );
      expect(result).toEqual({
        success: false,
        category: 'no_ai_configured',
        error: 'AI service configuration ID is missing.',
      });
      expect(mockGetBackendSetting).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns no_ai_configured when getAiServiceSettingForBackend returns null', async () => {
      mockGetBackendSetting.mockResolvedValue(null);
      const result = await runFoodOptions();
      expect(result).toEqual({
        success: false,
        category: 'no_ai_configured',
        error: 'AI service setting not found for the provided ID.',
      });
    });

    it('returns api_key_missing when a non-ollama provider has no api_key', async () => {
      mockGetBackendSetting.mockResolvedValue(
        makeAiServiceDetail({ api_key: null })
      );
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as typeof global.fetch;
      const result = await runFoodOptions();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe('api_key_missing');
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns custom_url_missing when ollama has no custom_url', async () => {
      mockGetBackendSetting.mockResolvedValue(
        makeAiServiceDetail({
          service_type: 'ollama',
          api_key: null,
          custom_url: null,
        })
      );
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as typeof global.fetch;
      const result = await runFoodOptions();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe('custom_url_missing');
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns unsupported_provider for an unknown service type', async () => {
      mockGetBackendSetting.mockResolvedValue(
        makeAiServiceDetail({ service_type: 'unknown_provider' })
      );
      const result = await runFoodOptions();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe('unsupported_provider');
      }
    });
  });

  describe('dispatch error categories', () => {
    beforeEach(() => {
      mockGetBackendSetting.mockResolvedValue(makeAiServiceDetail());
    });

    it('returns upstream_error when the API returns a non-OK status', async () => {
      mockFetch('Rate limit exceeded', { ok: false, status: 429 });
      const result = await runFoodOptions();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe('upstream_error');
        expect(result.error).toContain('status 429');
      }
    });

    it('returns no_content when the AI response has no content', async () => {
      mockFetch({ choices: [{ message: { content: null } }] });
      const result = await runFoodOptions();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe('no_content');
      }
    });

    it('returns parse_error when the response is not valid JSON', async () => {
      mockFetch({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: 'Here are some great apple options!' },
          },
        ],
      });
      const result = await runFoodOptions();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.category).toBe('parse_error');
      }
    });

    it('accepts code-fenced JSON and returns the raw text fences included', async () => {
      const wrappedJson =
        '```json\n' + JSON.stringify(sampleFoodOptions) + '\n```';
      mockFetch({
        choices: [{ finish_reason: 'stop', message: { content: wrappedJson } }],
      });
      const result = await runFoodOptions();
      expect(result.success).toBe(true);
      if (result.success) {
        // The helper strips fences only for the parse check; `content` is the
        // provider text verbatim.
        expect(result.content).toBe(wrappedJson);
      }
    });
  });
});
