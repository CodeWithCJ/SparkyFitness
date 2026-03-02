jest.mock("../models/chatRepository");
jest.mock("../ai/config");
jest.mock("../config/logging", () => ({ log: jest.fn() }));

const chatRepository = require("../models/chatRepository");
const { getDefaultVisionModel } = require("../ai/config");
const {
  extractNutritionFromLabel,
} = require("../services/labelScanService");

const TEST_USER_ID = "user-123";
const TEST_BASE64 = "iVBORw0KGgoAAAANSUhEUg==";
const TEST_MIME = "image/png";

const makeAiSetting = (overrides = {}) => ({
  id: "setting-1",
  service_name: "My OpenAI",
  service_type: "openai",
  is_active: true,
  model_name: "gpt-4o",
  is_public: false,
  source: "user",
  ...overrides,
});

const makeAiServiceDetail = (overrides = {}) => ({
  id: "setting-1",
  service_type: "openai",
  model_name: "gpt-4o",
  api_key: "sk-test-key",
  custom_url: null,
  timeout: null,
  ...overrides,
});

const sampleNutrition = {
  name: "Protein Bar",
  brand: "FitCo",
  serving_size: 60,
  serving_unit: "g",
  calories: 230,
  protein: 20,
  carbs: 25,
  fat: 8,
  fiber: 3,
  saturated_fat: 2.5,
  sodium: 150,
  sugars: 6,
};

function mockFetchForProvider(serviceType, nutritionData = sampleNutrition) {
  const json = JSON.stringify(nutritionData);

  let responseBody;
  switch (serviceType) {
    case "google":
      responseBody = {
        candidates: [{ content: { parts: [{ text: json }] } }],
      };
      break;
    case "openai":
    case "openai_compatible":
    case "mistral":
    case "groq":
    case "openrouter":
    case "custom":
      responseBody = {
        choices: [{ message: { content: json } }],
      };
      break;
    case "anthropic":
      responseBody = {
        content: [{ text: json }],
      };
      break;
    case "ollama":
      responseBody = {
        message: { content: json },
      };
      break;
  }

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => responseBody,
  });
}

describe("extractNutritionFromLabel", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    getDefaultVisionModel.mockReturnValue("gpt-4o-mini");
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should return error when no AI service is configured", async () => {
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(null);

    const result = await extractNutritionFromLabel(
      TEST_BASE64,
      TEST_MIME,
      TEST_USER_ID,
    );

    expect(result).toEqual({
      success: false,
      error: "No AI service configured",
    });
  });

  it("should return error when API key is missing for non-ollama service", async () => {
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeAiSetting(),
    );
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail({ api_key: null }),
    );

    const result = await extractNutritionFromLabel(
      TEST_BASE64,
      TEST_MIME,
      TEST_USER_ID,
    );

    expect(result).toEqual({
      success: false,
      error: "API key missing for selected AI service.",
    });
  });

  it("should allow ollama without an API key", async () => {
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeAiSetting({ service_type: "ollama" }),
    );
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail({
        service_type: "ollama",
        api_key: null,
        model_name: "llava",
        custom_url: "http://localhost:11434",
      }),
    );
    mockFetchForProvider("ollama");

    const result = await extractNutritionFromLabel(
      TEST_BASE64,
      TEST_MIME,
      TEST_USER_ID,
    );

    expect(result.success).toBe(true);
    expect(result.nutrition).toEqual(sampleNutrition);
  });

  it("should use default vision model when model_name is not set", async () => {
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeAiSetting(),
    );
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail({ model_name: null }),
    );
    mockFetchForProvider("openai");

    await extractNutritionFromLabel(TEST_BASE64, TEST_MIME, TEST_USER_ID);

    expect(getDefaultVisionModel).toHaveBeenCalledWith("openai");
    const fetchCall = global.fetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.model).toBe("gpt-4o-mini");
  });

  it("should return error for unsupported service type", async () => {
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeAiSetting({ service_type: "unknown_provider" }),
    );
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail({ service_type: "unknown_provider" }),
    );

    const result = await extractNutritionFromLabel(
      TEST_BASE64,
      TEST_MIME,
      TEST_USER_ID,
    );

    expect(result).toEqual({
      success: false,
      error: "Unsupported service type: unknown_provider",
    });
  });

  it("should return error when API returns non-OK status", async () => {
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeAiSetting(),
    );
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail(),
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limit exceeded",
    });

    const result = await extractNutritionFromLabel(
      TEST_BASE64,
      TEST_MIME,
      TEST_USER_ID,
    );

    expect(result).toEqual({
      success: false,
      error: "AI service returned status 429",
    });
  });

  it("should return error when AI response has no content", async () => {
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeAiSetting(),
    );
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail(),
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: null } }] }),
    });

    const result = await extractNutritionFromLabel(
      TEST_BASE64,
      TEST_MIME,
      TEST_USER_ID,
    );

    expect(result).toEqual({
      success: false,
      error: "No content in AI response",
    });
  });

  it("should strip markdown code fences from response", async () => {
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeAiSetting(),
    );
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail(),
    );
    const wrappedJson = '```json\n' + JSON.stringify(sampleNutrition) + '\n```';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: wrappedJson } }],
      }),
    });

    const result = await extractNutritionFromLabel(
      TEST_BASE64,
      TEST_MIME,
      TEST_USER_ID,
    );

    expect(result.success).toBe(true);
    expect(result.nutrition).toEqual(sampleNutrition);
  });

  it("should return error when response is not valid JSON", async () => {
    chatRepository.getActiveAiServiceSetting.mockResolvedValue(
      makeAiSetting(),
    );
    chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
      makeAiServiceDetail(),
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "not valid json at all" } }],
      }),
    });

    const result = await extractNutritionFromLabel(
      TEST_BASE64,
      TEST_MIME,
      TEST_USER_ID,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  describe("provider-specific request formatting", () => {
    beforeEach(() => {
      chatRepository.getActiveAiServiceSetting.mockResolvedValue(
        makeAiSetting(),
      );
    });

    it("should send correct request format for Google", async () => {
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeAiServiceDetail({ service_type: "google", model_name: "gemini-2.5-flash" }),
      );
      mockFetchForProvider("google");

      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID,
      );

      expect(result.success).toBe(true);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toContain("generativelanguage.googleapis.com");
      expect(url).toContain("gemini-2.5-flash");
      const body = JSON.parse(options.body);
      expect(body.contents[0].parts[0].inline_data.mime_type).toBe(TEST_MIME);
      expect(body.contents[0].parts[0].inline_data.data).toBe(TEST_BASE64);
    });

    it("should send correct request format for OpenAI", async () => {
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeAiServiceDetail(),
      );
      mockFetchForProvider("openai");

      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID,
      );

      expect(result.success).toBe(true);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      expect(options.headers.Authorization).toBe("Bearer sk-test-key");
      const body = JSON.parse(options.body);
      expect(body.model).toBe("gpt-4o");
      expect(body.messages[0].content[0].image_url.url).toBe(
        `data:${TEST_MIME};base64,${TEST_BASE64}`,
      );
    });

    it("should send correct request format for Anthropic", async () => {
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeAiServiceDetail({
          service_type: "anthropic",
          model_name: "claude-3-5-sonnet-20241022",
        }),
      );
      mockFetchForProvider("anthropic");

      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID,
      );

      expect(result.success).toBe(true);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      expect(options.headers["x-api-key"]).toBe("sk-test-key");
      const body = JSON.parse(options.body);
      expect(body.messages[0].content[0].source.media_type).toBe(TEST_MIME);
      expect(body.messages[0].content[0].source.data).toBe(TEST_BASE64);
    });

    it("should use custom_url for openai_compatible provider", async () => {
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeAiServiceDetail({
          service_type: "openai_compatible",
          custom_url: "https://my-llm.example.com/v1",
        }),
      );
      mockFetchForProvider("openai_compatible");

      await extractNutritionFromLabel(TEST_BASE64, TEST_MIME, TEST_USER_ID);

      const [url] = global.fetch.mock.calls[0];
      expect(url).toBe("https://my-llm.example.com/v1/chat/completions");
    });

    it("should include OpenRouter-specific headers", async () => {
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeAiServiceDetail({ service_type: "openrouter" }),
      );
      mockFetchForProvider("openrouter");

      await extractNutritionFromLabel(TEST_BASE64, TEST_MIME, TEST_USER_ID);

      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(options.headers["HTTP-Referer"]).toBe(
        "https://sparky-fitness.com",
      );
      expect(options.headers["X-Title"]).toBe("Sparky Fitness");
    });

    it("should use correct URLs for Mistral and Groq", async () => {
      for (const [serviceType, expectedUrl] of [
        ["mistral", "https://api.mistral.ai/v1/chat/completions"],
        ["groq", "https://api.groq.com/openai/v1/chat/completions"],
      ]) {
        jest.clearAllMocks();
        chatRepository.getActiveAiServiceSetting.mockResolvedValue(
          makeAiSetting({ service_type: serviceType }),
        );
        chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
          makeAiServiceDetail({ service_type: serviceType }),
        );
        mockFetchForProvider(serviceType);

        await extractNutritionFromLabel(TEST_BASE64, TEST_MIME, TEST_USER_ID);

        const [url] = global.fetch.mock.calls[0];
        expect(url).toBe(expectedUrl);
      }
    });
  });

  describe("response parsing per provider", () => {
    beforeEach(() => {
      chatRepository.getActiveAiServiceSetting.mockResolvedValue(
        makeAiSetting(),
      );
    });

    it("should parse Google response format", async () => {
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeAiServiceDetail({ service_type: "google" }),
      );
      mockFetchForProvider("google");

      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID,
      );

      expect(result.success).toBe(true);
      expect(result.nutrition).toEqual(sampleNutrition);
    });

    it("should parse Anthropic response format", async () => {
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeAiServiceDetail({ service_type: "anthropic" }),
      );
      mockFetchForProvider("anthropic");

      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID,
      );

      expect(result.success).toBe(true);
      expect(result.nutrition).toEqual(sampleNutrition);
    });

    it("should parse Ollama response format", async () => {
      chatRepository.getAiServiceSettingForBackend.mockResolvedValue(
        makeAiServiceDetail({
          service_type: "ollama",
          api_key: null,
          custom_url: "http://localhost:11434",
        }),
      );
      mockFetchForProvider("ollama");

      const result = await extractNutritionFromLabel(
        TEST_BASE64,
        TEST_MIME,
        TEST_USER_ID,
      );

      expect(result.success).toBe(true);
      expect(result.nutrition).toEqual(sampleNutrition);
    });
  });
});
