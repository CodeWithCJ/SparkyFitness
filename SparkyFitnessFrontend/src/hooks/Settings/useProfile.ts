import { userKeys } from '@/api/keys/admin';
import {
  UpdateProfilePayload,
  updateProfileData,
  uploadAvatarImage,
  getProfileData,
  toggleEmailMfa,
} from '@/api/Settings/profileService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import i18n from 'i18next';
export const useProfileQuery = (userId?: string) => {
  return useQuery({
    queryKey: userKeys.profile(userId!),
    queryFn: getProfileData,
    enabled: !!userId,
    meta: {
      errorMessage: i18n.t(
        'hooks.useProfile.failedToLoadProfile',
        'Failed to load profile'
      ),
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
      successMessage: i18n.t(
        'hooks.useProfile.profileUpdatedSuccessfully',
        'Profile updated successfully'
      ),
      errorMessage: i18n.t(
        'hooks.useProfile.failedToUpdateProfile',
        'Failed to update profile'
      ),
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
      successMessage: i18n.t(
        'hooks.useProfile.profilePictureUpdatedSuccessfully',
        'Profile picture updated successfully'
      ),
      errorMessage: i18n.t(
        'hooks.useProfile.failedToUploadProfilePicture',
        'Failed to upload profile picture'
      ),
    },
  });
};

export const useToggleEmailMfaMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: toggleEmailMfa,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.refetchQueries({ queryKey: ['users'], type: 'all' });
    },
  });
};
