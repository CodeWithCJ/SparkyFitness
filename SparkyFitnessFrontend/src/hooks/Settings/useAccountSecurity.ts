import { authClient } from '@/lib/auth-client';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useChangeEmailMutation = () => {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ newEmail }: { newEmail: string }) => {
      const { data, error } = await authClient.changeEmail({ newEmail });
      if (error) throw error;
      return data;
    },
    meta: {
      successMessage: t(
        'settings.accountSecurity.emailUpdateSuccess',
        'Email update initiated. Please check your new email for confirmation.'
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
