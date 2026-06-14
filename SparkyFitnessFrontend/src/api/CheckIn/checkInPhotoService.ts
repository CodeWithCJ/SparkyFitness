import { apiCall } from '@/api/api';

export type PhotoType = 'front' | 'back' | 'side';

export interface CheckInPhoto {
  id: string;
  user_id: string;
  check_in_measurement_id: string | null;
  entry_date: string;
  photo_type: PhotoType;
  file_path: string;
  created_at: string;
}

export const fetchCheckInPhotos = async (
  date: string
): Promise<CheckInPhoto[]> => {
  const response = await apiCall(`/measurements/check-in-photos/${date}`, {
    method: 'GET',
    suppress404Toast: true,
  });
  if (!response || !Array.isArray(response)) return [];
  return response as CheckInPhoto[];
};

export const uploadCheckInPhoto = async (
  date: string,
  type: PhotoType,
  file: File
): Promise<CheckInPhoto> => {
  const formData = new FormData();
  formData.append('photo', file);
  const response = await fetch(
    `/api/measurements/check-in-photos/${date}/${type}`,
    {
      method: 'POST',
      body: formData,
      credentials: 'include',
    }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Upload failed');
  }
  return response.json() as Promise<CheckInPhoto>;
};

export const deleteCheckInPhoto = async (id: string): Promise<void> => {
  await apiCall(`/measurements/check-in-photos/photo/${id}`, {
    method: 'DELETE',
  });
};
