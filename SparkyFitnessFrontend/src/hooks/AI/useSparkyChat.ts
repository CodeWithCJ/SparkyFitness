import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  loadUserPreferences,
  loadChatHistory,
  clearChatHistory,
} from '@/api/Chatbot/sparkyChatService';
import { chatbotKeys } from '@/api/keys/ai';

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

export const useClearChatHistoryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (clearType: 'manual' | 'all') => clearChatHistory(clearType),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: [...chatbotKeys.all, 'history'] });
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
