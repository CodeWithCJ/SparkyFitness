function getDefaultModel(serviceType?: string | null): string {
  switch (serviceType) {
    case 'openai':
    case 'openai_compatible':
      return 'gpt-4o-mini';
    case 'opencode_go':
      return 'glm-5.3-flash';
    case 'anthropic':
      return 'claude-sonnet-4-6';
    case 'google':
      return 'gemini-2.5-flash';
    case 'mistral':
      return 'mistral-small-latest';
    case 'groq':
      return 'llama-3.3-70b-versatile';
    case 'openrouter':
      return 'google/gemini-2.5-flash';
    case 'xai':
      return 'grok-4.3';
    case 'perplexity':
      return 'fast';
    case 'meta':
      return 'muse-spark-1.1';
    case 'ollama':
      return 'llama3.2';
    default:
      return 'gpt-4o-mini';
  }
}

function getDefaultVisionModel(serviceType?: string | null): string {
  switch (serviceType) {
    case 'openai':
    case 'openai_compatible':
      return 'gpt-4.1-mini';
    case 'opencode_go':
      return 'glm-5.3-flash';
    case 'anthropic':
      return 'claude-haiku-4-5';
    case 'google':
      return 'gemini-2.5-flash';
    case 'mistral':
      return 'mistral-small-latest';
    case 'groq':
      return 'meta-llama/llama-4-scout-17b-16e-instruct';
    case 'openrouter':
      return 'google/gemini-2.5-flash';
    case 'xai':
      return 'grok-4.3';
    case 'perplexity':
      return 'fast';
    case 'meta':
      return 'muse-spark-1.1';
    case 'ollama':
      return 'gemma4';
    default:
      return 'gpt-4o-mini';
  }
}
// Resolves the base URL for OpenAI-compatible providers. The AI SDK (chat
// service) appends `/chat/completions` itself; the raw-request dispatcher
// appends it explicitly. Providers that expect a user-supplied endpoint
// ('openai_compatible', 'custom') fall through to `customUrl` unchanged.
function getOpenAiCompatibleBaseUrl(
  serviceType: string,
  customUrl?: string | null
): string | undefined {
  switch (serviceType) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'ollama':
      // Ollama is the one family member whose base is derived from customUrl;
      // guard so a missing URL yields undefined rather than "undefined/v1".
      return customUrl ? `${customUrl}/v1` : undefined;
    case 'mistral':
      return 'https://api.mistral.ai/v1';
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'xai':
      return 'https://api.x.ai/v1';
    case 'perplexity':
      return 'https://api.perplexity.ai/v1';
    case 'meta':
      // Muse Spark's OpenAI-compatible endpoint (auth is Bearer api_key).
      return 'https://api.meta.ai/v1';
    case 'opencode_go':
      return 'https://opencode.ai/inference/go/openai/v1';
    default:
      return customUrl ?? undefined;
  }
}
const PERPLEXITY_PRESET_MAP = new Map<string, string>([
  ['sonar', 'fast'],
  ['sonar-pro', 'low'],
  ['sonar-reasoning', 'medium'],
  ['sonar-reasoning-pro', 'high'],
  ['fast', 'fast'],
  ['low', 'low'],
  ['medium', 'medium'],
  ['high', 'high'],
  ['xhigh', 'xhigh'],
]);

function getPerplexityPreset(modelName?: string | null): string | undefined {
  if (!modelName) return 'fast';
  return PERPLEXITY_PRESET_MAP.get(modelName.toLowerCase());
}

export { getDefaultModel };
export { getDefaultVisionModel };
export { getOpenAiCompatibleBaseUrl };
export { getPerplexityPreset };
export default {
  getDefaultModel,
  getDefaultVisionModel,
  getOpenAiCompatibleBaseUrl,
  getPerplexityPreset,
};
