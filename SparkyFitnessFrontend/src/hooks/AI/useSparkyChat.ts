import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  loadUserPreferences,
  loadChatHistory,
  saveMessageToHistory,
  clearChatHistory,
  processUserInput,
  getTodaysNutrition,
} from '@/api/Chatbot/sparkyChatService';
import { UserLoggingLevel } from '@/utils/logging';
import { chatbotKeys } from '@/api/keys/ai';
import { AIService } from '@/types/settings';

export const useChatPreferencesQuery = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: chatbotKeys.preferences(),
    queryFn: () => loadUserPreferences(),
    meta: {
      errorMessage: t(
        'chat.errorLoadingPreferences',
        'Failed to load chat preferences.'
      ),
    },
  });
};

export const useChatHistoryQuery = (
  autoClearSetting: string,
  enabled: boolean
) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: chatbotKeys.history(autoClearSetting),
    queryFn: () => loadChatHistory(autoClearSetting),
    enabled,
    meta: {
      errorMessage: t(
        'chat.errorLoadingHistory',
        'Failed to load chat history.'
      ),
    },
  });
};

export const useTodaysNutritionQuery = (date: string, enabled: boolean) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: chatbotKeys.todaysNutrition(date),
    queryFn: () => getTodaysNutrition(date),
    enabled,
    meta: {
      errorMessage: t(
        'chat.errorLoadingNutrition',
        "Failed to load today's nutrition."
      ),
    },
  });
};

export const useSaveMessageMutation = (autoClearSetting: string) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      content,
      messageType,
      metadata,
    }: {
      content: string;
      messageType: 'user' | 'assistant';
      metadata?: unknown;
    }) => saveMessageToHistory(content, messageType, metadata),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: chatbotKeys.history(autoClearSetting),
      });
    },
    meta: {
      errorMessage: t(
        'chat.errorSavingMessage',
        'Failed to save message to history.'
      ),
    },
  });
};

export const useClearChatHistoryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (clearType: 'manual' | 'all') => clearChatHistory(clearType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatbotKeys.all });
    },
    meta: {
      successMessage: t(
        'chat.successClearingHistory',
        'Chat history cleared successfully.'
      ),
      errorMessage: t(
        'chat.errorClearingHistory',
        'Failed to clear chat history.'
      ),
    },
  });
};

interface ProcessUserInputParams {
  input: string;
  image: File | null;
  transactionId: string;
  lastBotMessageMetadata: unknown;
  userLoggingLevel: UserLoggingLevel;
  formatDateInUserTimezone: (date: string | Date, formatStr?: string) => string;
  activeAIServiceSetting: AIService | null;
  messages: unknown[];
  userDate: string;
}

export const useProcessUserInputMutation = () => {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (params: ProcessUserInputParams) =>
      processUserInput(
        params.input,
        params.image,
        params.transactionId,
        params.lastBotMessageMetadata,
        params.userLoggingLevel,
        params.formatDateInUserTimezone,
        params.activeAIServiceSetting,
        params.messages as never[],
        params.userDate
      ),
    meta: {
      errorMessage: t(
        'chat.errorProcessingInput',
        'Failed to process message.'
      ),
    },
  });
};
