import { api } from '@/api/api';
import { authClient } from '@/lib/auth-client';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useChangeEmailMutation = () => {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({
      newEmail,
      currentPassword,
    }: {
      newEmail: string;
      currentPassword?: string;
    }) => {
      return api.post('/identity/update-email', {
        body: { newEmail, currentPassword },
      });
    },
    meta: {
      successMessage: t(
        'settings.accountSecurity.emailUpdateSuccess',
        'Email updated successfully.'
      ),
      errorMessage: t(
        'settings.accountSecurity.emailUpdateError',
        'Failed to update email'
      ),
    },
  });
};

export const useChangePasswordMutation = () => {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (
      payload: Parameters<typeof authClient.changePassword>[0]
    ) => {
      const { data, error } = await authClient.changePassword(payload);
      if (error) throw error;
      return data;
    },
    meta: {
      successMessage: t(
        'settings.accountSecurity.passwordUpdateSuccess',
        'Password updated successfully'
      ),
      errorMessage: t(
        'settings.accountSecurity.passwordUpdateError',
        'Failed to update password'
      ),
    },
  });
};
