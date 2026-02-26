export const chatbotKeys = {
  all: ['chatbot'] as const,
  history: (autoClearSetting: string) =>
    [...chatbotKeys.all, 'history', autoClearSetting] as const,
  preferences: () => [...chatbotKeys.all, 'preferences'] as const,
  todaysNutrition: (date: string) =>
    [...chatbotKeys.all, 'todaysNutrition', date] as const,
};
