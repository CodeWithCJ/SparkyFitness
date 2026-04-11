// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDefaultModel(serviceType: any) {
  switch (serviceType) {
    case 'openai':
    case 'openai_compatible':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'google':
      return 'gemini-pro';
    case 'mistral':
      return 'mistral-large-latest';
    case 'groq':
      return 'llama3-8b-8192';
    case 'openrouter':
      return 'google/gemma-3-27b-it:free';
    default:
      return 'gpt-3.5-turbo';
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDefaultVisionModel(serviceType: any) {
  switch (serviceType) {
    case 'openai':
    case 'openai_compatible':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'google':
      return 'gemini-2.5-flash';
    case 'mistral':
      return 'pixtral-large-latest';
    case 'groq':
      return 'llama-3.2-11b-vision-preview';
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
