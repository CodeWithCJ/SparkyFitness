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

// The first entry in each list is the recommended default — the cheapest model
// that handles SparkyFitness's tasks well. Keep that ordering when refreshing,
// since ServiceForm surfaces modelOptions[0] as the recommendation.
export const getModelOptions = (serviceType: string): string[] => {
  switch (serviceType) {
    case 'openai':
    case 'openai_compatible':
      return [
        'gpt-4o-mini',
        'gpt-5.4-mini',
        'gpt-5.4-nano',
        'gpt-4.1-mini',
        'gpt-4o',
        'gpt-5.4',
      ];
    case 'anthropic':
      return ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-8'];
    case 'google':
      return [
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.5-pro',
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
      ];
    case 'mistral':
      return [
        'mistral-small-latest',
        'mistral-medium-latest',
        'mistral-large-latest',
      ];
    case 'groq':
      return [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'openai/gpt-oss-20b',
        'openai/gpt-oss-120b',
      ];
    case 'openrouter':
      return [
        'google/gemini-2.5-flash',
        'google/gemini-2.5-flash-lite',
        'google/gemini-3.5-flash',
        'anthropic/claude-haiku-4.5',
        'anthropic/claude-sonnet-4.6',
        'deepseek/deepseek-chat',
        'meta-llama/llama-3.1-8b-instruct:free',
      ];
    default:
      return [];
  }
};
