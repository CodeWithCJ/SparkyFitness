import { useTranslation } from 'react-i18next';

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
  { value: 'custom', label: t('settings.aiService.serviceTypes.custom') },
];

export const getModelOptions = (serviceType: string): string[] => {
  switch (serviceType) {
    case 'openai':
    case 'openai_compatible':
      return [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo',
        'o1-preview',
        'o1-mini',
      ];
    case 'anthropic':
      return [
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
      ];
    case 'google':
      return [
        'gemini-pro',
        'gemini-pro-vision',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
      ];
    case 'mistral':
      return [
        'mistral-large-latest',
        'mistral-medium-latest',
        'mistral-small-latest',
        'open-mistral-7b',
        'open-mixtral-8x7b',
      ];
    case 'groq':
      return [
        'llama-3.1-8b-instant',
        'llama-3.3-70b-versatile',
        'meta-llama/llama-guard-4-12b',
        'whisper-large-v3',
        'whisper-large-v3-turbo',
      ];
    default:
      return [];
  }
};
