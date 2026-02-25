import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { passkeyKeys } from '@/api/keys/settings';
import { addPasskey, deletePasskey, getPasskeys } from '@/api/Settings/passkey';

export const usePasskeys = () => {
  return useQuery({
    queryKey: passkeyKeys.lists(),
    queryFn: getPasskeys,
    meta: {
      errorMessage: 'Failed to fetch passkeys',
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
      successMessage: 'Passkey registered successfully!',
      errorMessage:
        'Could not register passkey. Ensure you are using HTTPS or localhost.',
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
      successMessage: 'Passkey deleted.',
      errorMessage: 'Failed to delete passkey',
    },
  });
};
