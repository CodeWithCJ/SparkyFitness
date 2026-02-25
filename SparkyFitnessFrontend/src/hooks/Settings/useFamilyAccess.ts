import { familyAccessKeys } from '@/api/keys/settings';
import {
  createFamilyAccess,
  deleteFamilyAccess,
  FamilyAccessPayload,
  findUserByEmail,
  loadFamilyAccess,
  toggleFamilyAccessActiveStatus,
  updateFamilyAccess,
} from '@/api/Settings/familyAccessService';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useFamilyAccess = (userId?: string) => {
  return useQuery({
    queryKey: familyAccessKeys.lists(),
    queryFn: () => loadFamilyAccess(),
    enabled: !!userId,
  });
};

// Nutze dies z.B. mit queryClient.fetchQuery(findUserByEmailOptions(email)) in deinem Submit-Handler
export const findUserByEmailOptions = (email: string) => ({
  queryKey: familyAccessKeys.userSearch(email),
  queryFn: () => findUserByEmail(email),
  enabled: !!email && email.includes('@'),
  staleTime: 1000 * 60 * 5, // 5 Minuten cachen
});

// --- MUTATIONS ---

export const useCreateFamilyAccessMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: createFamilyAccess,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyAccessKeys.lists() });
    },
    meta: {
      successMessage: t(
        'familyAccess.createSuccess',
        'Family access granted successfully'
      ),
      errorMessage: t(
        'familyAccess.createError',
        'Failed to grant family access'
      ),
    },
  });
};

export const useUpdateFamilyAccessMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<FamilyAccessPayload>;
    }) => updateFamilyAccess(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyAccessKeys.lists() });
    },
    meta: {
      successMessage: t(
        'familyAccess.updateSuccess',
        'Family access updated successfully'
      ),
      errorMessage: t(
        'familyAccess.updateError',
        'Failed to update family access'
      ),
    },
  });
};

export const useToggleFamilyAccessMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleFamilyAccessActiveStatus(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyAccessKeys.lists() });
    },
    meta: {
      // Message handled conditionally in component if needed, or set generic here
      successMessage: t('familyAccess.toggleSuccess', 'Access status updated'),
      errorMessage: t(
        'familyAccess.toggleError',
        'Failed to update access status'
      ),
    },
  });
};

export const useDeleteFamilyAccessMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: deleteFamilyAccess,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyAccessKeys.lists() });
    },
    meta: {
      successMessage: t(
        'familyAccess.deleteSuccess',
        'Family access removed successfully'
      ),
      errorMessage: t(
        'familyAccess.deleteError',
        'Failed to remove family access'
      ),
    },
  });
};
