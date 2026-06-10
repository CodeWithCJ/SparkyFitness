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
    case 'ollama':
      return 'llava';
    default:
      return 'gpt-4o-mini';
  }
}
export { getDefaultModel };
export { getDefaultVisionModel };
export default {
  getDefaultModel,
  getDefaultVisionModel,
};
