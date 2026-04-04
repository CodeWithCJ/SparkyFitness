import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getTelegramStatus,
  generateTelegramLinkCode,
  unlinkTelegram,
} from '@/api/Integrations/telegram';
import { telegramKeys } from '@/api/keys/integrations';

/**
 * Hook to get the current Telegram link status
 */
export const useTelegramStatus = () => {
  return useQuery({
    queryKey: telegramKeys.status,
    queryFn: getTelegramStatus,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Hook to generate a new Telegram linking code
 */
export const useGenerateTelegramCode = () => {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: generateTelegramLinkCode,
    meta: {
      errorMessage: t(
        'settings.telegram.errorGeneratingCode',
        'Failed to generate linking code.'
      ),
    },
  });
};

/**
 * Hook to unlink Telegram account
 */
export const useUnlinkTelegram = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: unlinkTelegram,
    onSuccess: () => {
      // Refresh the status after successful unlinking
      queryClient.invalidateQueries({ queryKey: telegramKeys.status });
    },
    meta: {
      successMessage: t(
        'settings.telegram.successUnlink',
        'Telegram account successfully unlinked!'
      ),
      errorMessage: t(
        'settings.telegram.errorUnlink',
        'Failed to unlink Telegram account.'
      ),
    },
  });
};
