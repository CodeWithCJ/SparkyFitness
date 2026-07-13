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

export const fetchCheckInPhotoDates = async (): Promise<string[]> => {
  const response = await apiCall('/measurements/check-in-photos/dates', {
    method: 'GET',
    suppress404Toast: true,
  });
  if (!response || !Array.isArray(response)) return [];
  return response as string[];
};

export const uploadCheckInPhoto = async (
  date: string,
  type: PhotoType,
  file: File
): Promise<CheckInPhoto> => {
  const formData = new FormData();
  formData.append('photo', file);
  // Routed through apiCall (not a raw fetch) so it shares the app's API base
  // URL, cookie auth, and error handling. isFormData keeps apiCall from forcing
  // a JSON Content-Type, letting the browser set the multipart boundary.
  const response = await apiCall(
    `/measurements/check-in-photos/${date}/${type}`,
    {
      method: 'POST',
      body: formData,
      isFormData: true,
    }
  );
  return response as CheckInPhoto;
};

export const deleteCheckInPhoto = async (id: string): Promise<void> => {
  await apiCall(`/measurements/check-in-photos/photo/${id}`, {
    method: 'DELETE',
  });
};
