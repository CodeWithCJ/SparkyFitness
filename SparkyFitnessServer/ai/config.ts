// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDefaultModel(serviceType: any) {
  switch (serviceType) {
    case 'openai':
    case 'openai_compatible':
      return 'gpt-4o-mini';
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
    case 'meta':
      return 'muse-spark-1.1';
    case 'ollama':
      return 'llama3.2';
    default:
      return 'gpt-4o-mini';
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDefaultVisionModel(serviceType: any) {
  switch (serviceType) {
    case 'openai':
    case 'openai_compatible':
      return 'gpt-4.1-mini';
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
    case 'meta':
      return 'muse-spark-1.1';
    case 'ollama':
      return 'llava';
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
    case 'meta':
      // Muse Spark's OpenAI-compatible endpoint (auth is Bearer api_key).
      return 'https://api.meta.ai/v1';
    default:
      return customUrl ?? undefined;
  }
}
export { getDefaultModel };
export { getDefaultVisionModel };
export { getOpenAiCompatibleBaseUrl };
export default {
  getDefaultModel,
  getDefaultVisionModel,
  getOpenAiCompatibleBaseUrl,
};
