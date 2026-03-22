import { apiCall } from '@/api/api';
import { Profile } from '@/types/settings';

export interface UpdateProfilePayload {
  full_name: string;
  phone_number: string;
  date_of_birth: string | null;
  bio: string;
  gender: string | null;
}

export const updateProfileData = async (
  payload: Partial<UpdateProfilePayload>
) => {
  return apiCall('/identity/profiles', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
};

export const uploadAvatarImage = async (formData: FormData) => {
  return apiCall('/identity/profiles/avatar', {
    method: 'POST',
    body: formData,
    isFormData: true,
  });
};

export const getProfileData = async (): Promise<Profile> => {
  return apiCall('/identity/profiles', {
    method: 'GET',
  });
};

export const toggleEmailMfa = async (enabled: boolean): Promise<void> => {
  return apiCall('/identity/mfa/email-toggle', {
    method: 'POST',
    body: { enabled },
  });
};
