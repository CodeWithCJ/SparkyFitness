import { userKeys } from '@/api/keys/admin';
import { userManagementService } from '@/api/Admin/userManagementService';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useUsers = (
  searchTerm: string,
  sortBy: string,
  sortOrder: string
) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: userKeys.list({ searchTerm, sortBy, sortOrder }),
    queryFn: () => userManagementService.getUsers(searchTerm),
    meta: {
      errorTitle: t('admin.userManagement.error', 'Error'),
      errorMessage: t(
        'admin.userManagement.errorLoadingUsers',
        'Failed to fetch user data.'
      ),
    },
  });
};

export const useUpdateUserFullName = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ userId, fullName }: { userId: string; fullName: string }) =>
      userManagementService.updateUserFullName(userId, fullName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
    meta: {
      errorMessage: t('error', 'Error'),
      successMessage: (_data: unknown, variables: unknown) => {
        const { fullName: newFullName } = variables as { fullName: string };
        // Construct a clear message using the new name.
        // If newFullName is empty or null, provide a generic fallback.
        const descriptiveMessage = newFullName
          ? `User name updated to ${newFullName} successfully.`
          : 'User name updated successfully.';

        // Use the translation key, but ensure our dynamic message is used as defaultValue if needed.
        // We pass 'name' for interpolation, assuming '{{name}}' is the placeholder in the translation/defaultValue.
        return t('admin.userManagement.fullNameUpdated', {
          name: newFullName, // Pass the new name for interpolation
          defaultValue: descriptiveMessage, // Use the constructed dynamic message
        });
      },
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (userId: string) => userManagementService.deleteUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
    meta: {
      errorMessage: t('error', 'Error'),
      successMessage: t('admin.userManagement.deleteSuccess', 'User deleted.'),
    },
  });
};

export const useResetUserPassword = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ userId }: { userId: string; userName: string }) =>
      userManagementService.resetUserPassword(userId),
    meta: {
      errorMessage: t('error', 'Error'),
      successMessage: (_data: unknown, variables: unknown) => {
        const { userName } = variables as {
          userId: string;
          userName: string;
        };
        return t('admin.userManagement.resetPasswordInitiated', {
          userName: userName || 'User',
          defaultValue: `Password reset initiated for ${userName || 'User'}.`,
        });
      },
    },
  });
};

export const useUpdateUserStatus = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      isActive,
    }: {
      userId: string;
      isActive: boolean;
      userName?: string;
    }) => userManagementService.updateUserStatus(userId, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
    meta: {
      errorMessage: t('error', 'Error'),
      successMessage: (_data: unknown, variables: unknown) => {
        const { isActive, userName } = variables as {
          userId: string;
          isActive: boolean;
          userName?: string;
        };
        const actionText = isActive ? 'activate' : 'deactivate';
        const nameText = userName || 'User';
        return t('admin.userManagement.userStatusUpdated', {
          userName: nameText,
          action: actionText,
          defaultValue: `User ${nameText} ${actionText}d successfully.`,
        });
      },
    },
  });
};

export const useUpdateUserRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      role,
    }: {
      userId: string;
      role: 'user' | 'admin';
    }) => userManagementService.updateUserRole(userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
};

export const useResetUserMfa = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId }: { userId: string; userName: string }) =>
      userManagementService.resetUserMfa(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
    meta: {
      errorMessage: t('error', 'Error'),
      successMessage: (_data: unknown, variables: unknown) => {
        const { userName } = variables as {
          userId: string;
          userName: string;
        };
        return t('admin.userManagement.resetMfaSuccess', {
          userName: userName || 'User',
          defaultValue: `MFA reset successfully for ${userName || 'User'}.`,
        });
      },
    },
  });
};
