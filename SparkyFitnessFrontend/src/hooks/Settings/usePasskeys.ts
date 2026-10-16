import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { passkeyKeys } from '@/api/keys/settings';
import {
  addPasskey,
  deletePasskey,
  getPasskeys,
  type PasskeyRecord,
} from '@/api/Settings/passkey';

import i18n from 'i18next';
export const usePasskeys = () => {
  return useQuery<PasskeyRecord[]>({
    queryKey: passkeyKeys.lists(),
    queryFn: getPasskeys,
    meta: {
      errorMessage: i18n.t(
        'hooks.usePasskeys.failedToFetchPasskeys',
        'Failed to fetch passkeys'
      ),
    },
  });
};

export const useAddPasskeyMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addPasskey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: passkeyKeys.lists() });
    },
    meta: {
      successMessage: i18n.t(
        'hooks.usePasskeys.passkeyRegisteredSuccessfully',
        'Passkey registered successfully!'
      ),
      errorMessage: i18n.t(
        'hooks.usePasskeys.couldNotRegisterPasskeyEnsure',
        'Could not register passkey. Ensure you are using HTTPS or localhost.'
      ),
    },
  });
};

export const useDeletePasskeyMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePasskey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: passkeyKeys.lists() });
    },
    meta: {
      successMessage: i18n.t(
        'hooks.usePasskeys.passkeyDeleted',
        'Passkey deleted.'
      ),
      errorMessage: i18n.t(
        'hooks.usePasskeys.failedToDeletePasskey',
        'Failed to delete passkey'
      ),
    },
  });
};
