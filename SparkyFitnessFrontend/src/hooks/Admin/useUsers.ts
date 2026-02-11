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
    queryFn: () => userManagementService.getUsers(),
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
  return useMutation({
    mutationFn: ({ userId, fullName }: { userId: string; fullName: string }) =>
      userManagementService.updateUserFullName(userId, fullName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => userManagementService.deleteUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
};

// Mutation: Passwort zurücksetzen
export const useResetUserPassword = () => {
  return useMutation({
    mutationFn: (userId: string) =>
      userManagementService.resetUserPassword(userId),
  });
};

export const useUpdateUserStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      userManagementService.updateUserStatus(userId, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => userManagementService.resetUserMfa(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
};
