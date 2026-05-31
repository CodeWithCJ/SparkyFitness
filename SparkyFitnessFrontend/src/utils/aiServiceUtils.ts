export interface ServiceType {
  value: string;
  label: string;
}

export const getServiceTypes = (t: (key: string) => string): ServiceType[] => [
  { value: 'openai', label: t('settings.aiService.serviceTypes.openai') },
  {
    value: 'openai_compatible',
    label: t('settings.aiService.serviceTypes.openaiCompatible'),
  },
  {
    value: 'anthropic',
    label: t('settings.aiService.serviceTypes.anthropic'),
  },
  { value: 'google', label: t('settings.aiService.serviceTypes.google') },
  { value: 'mistral', label: t('settings.aiService.serviceTypes.mistral') },
  { value: 'groq', label: t('settings.aiService.serviceTypes.groq') },
  { value: 'ollama', label: t('settings.aiService.serviceTypes.ollama') },
  {
    value: 'openrouter',
    label: t('settings.aiService.serviceTypes.openrouter'),
  },
  { value: 'custom', label: t('settings.aiService.serviceTypes.custom') },
];

export const getModelOptions = (serviceType: string): string[] => {
  switch (serviceType) {
    case 'openai':
    case 'openai_compatible':
      return [
        'gpt-4o',
        'gpt-4o-mini',
        'o1',
        'o1-mini',
        'o3-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo',
      ];
    case 'anthropic':
      return [
        'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
      ];
    case 'google':
      return [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite-preview-02-05',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-pro',
      ];
    case 'mistral':
      return [
        'mistral-large-latest',
        'pixtral-12b-2409',
        'pixtral-large-latest',
        'mistral-medium-latest',
        'mistral-small-latest',
        'open-mistral-7b',
        'open-mixtral-8x7b',
      ];
    case 'groq':
      return [
        'deepseek-r1-distill-llama-70b',
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'llama-3.2-11b-vision-preview',
        'meta-llama/llama-guard-4-12b',
      ];
    case 'openrouter':
      return [
        'google/gemini-2.5-flash',
        'google/gemini-2.5-pro',
        'deepseek/deepseek-r1:free',
        'deepseek/deepseek-r1',
        'deepseek/deepseek-chat',
        'anthropic/claude-3.7-sonnet',
        'google/gemma-3-27b-it:free',
        'google/gemma-2-9b-it:free',
        'meta-llama/llama-3.2-3b-instruct:free',
        'meta-llama/llama-3.1-8b-instruct:free',
        'qwen/qwen-2.5-72b-instruct:free',
        'meta-llama/llama-3.1-405b:free',
      ];
    default:
      return [];
  }
};
