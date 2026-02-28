import { profileKeys } from '@/api/keys/settings';
import {
  fetchAvatarBlob,
  UpdateProfilePayload,
  updateProfileData,
  uploadAvatarImage,
  getProfileData,
  syncTotpAfterDisable,
  toggleEmailMfa,
} from '@/api/Settings/profileService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const useAvatarQuery = (url?: string | null) => {
  return useQuery({
    queryKey: profileKeys.avatar(url!),
    queryFn: () => fetchAvatarBlob(url!),
    enabled: !!url,
  });
};

export const useProfileQuery = (userId?: string) => {
  return useQuery({
    queryKey: profileKeys.all,
    queryFn: getProfileData,
    enabled: !!userId,
    meta: {
      errorMessage: 'Failed to load profile',
    },
  });
};

export const useUpdateProfileMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<UpdateProfilePayload>) =>
      updateProfileData(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all });
    },
    meta: {
      successMessage: 'Profile updated successfully',
      errorMessage: 'Failed to update profile',
    },
  });
};

export const useUploadAvatarMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (formData: FormData) => uploadAvatarImage(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all });
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
