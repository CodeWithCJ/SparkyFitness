import { apiCall } from '@/services/api';

export interface UpdateProfilePayload {
  full_name: string;
  phone_number: string;
  date_of_birth: string | null;
  bio: string;
  gender: string | null;
}

export const fetchAvatarBlob = async (url: string): Promise<Blob> => {
  const response = await apiCall(url, {
    method: 'GET',
    responseType: 'blob',
  });
  const blob = response as Blob;
  return new Blob([blob], { type: blob.type });
};

export const updateProfileData = async (payload: UpdateProfilePayload) => {
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
export interface Profile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  date_of_birth: string | null;
  bio: string | null;
  avatar_url: string | null;
  gender: string | null;
}

export const getProfileData = async (): Promise<Profile> => {
  return apiCall('/identity/profiles', {
    method: 'GET',
  });
};
