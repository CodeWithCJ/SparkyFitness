import { userKeys } from '@/api/keys/admin';
import {
  UpdateProfilePayload,
  updateProfileData,
  uploadAvatarImage,
  getProfileData,
  syncTotpAfterDisable,
  toggleEmailMfa,
} from '@/api/Settings/profileService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const useProfileQuery = (userId?: string) => {
  return useQuery({
    queryKey: userKeys.profile(userId!),
    queryFn: getProfileData,
    enabled: !!userId,
    meta: {
      errorMessage: 'Failed to load profile',
    },
  });
};

export const useUpdateProfileMutation = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<UpdateProfilePayload>) =>
      updateProfileData(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.profile(userId) });
    },
    meta: {
      successMessage: 'Profile updated successfully',
      errorMessage: 'Failed to update profile',
    },
  });
};

export const useUploadAvatarMutation = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (formData: FormData) => uploadAvatarImage(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.profile(userId) });
    },
    meta: {
      successMessage: 'Profile picture updated successfully',
      errorMessage: 'Failed to upload profile picture',
    },
  });
};

export const useSyncTotpMutation = () => {
  return useMutation({
    mutationFn: syncTotpAfterDisable,
  });
};

export const useToggleEmailMfaMutation = () => {
  return useMutation({
    mutationFn: toggleEmailMfa,
  });
};
