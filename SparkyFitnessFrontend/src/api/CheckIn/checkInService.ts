import { apiCall } from '@/api/api';
import { CustomMeasurement, CustomCategory } from '@/types/checkin';
import {
  CheckInMeasurementsResponse,
  checkInMeasurementsResponseSchema,
  UpdateCheckInMeasurementsRequest,
} from '@workspace/shared';
import z from 'zod';

export const loadCustomCategories = async (
  userId?: string
): Promise<CustomCategory[]> => {
  const url = userId
    ? `/measurements/custom-categories?userId=${userId}`
    : '/measurements/custom-categories';
  return apiCall(url, {
    method: 'GET',
  });
};

export const fetchRecentCustomMeasurements = async (): Promise<
  CustomMeasurement[]
> => {
  return apiCall('/measurements/custom-entries', {
    params: { limit: 20, orderBy: 'entry_timestamp.desc' },
  });
};

export const fetchRecentStandardMeasurements = async (
  startDate: string,
  endDate: string
): Promise<CheckInMeasurementsResponse[]> => {
  const response = await apiCall(
    `/measurements/check-in-measurements-range/${startDate}/${endDate}`,
    {
      method: 'GET',
      suppress404Toast: true,
    }
  );
  return z.array(checkInMeasurementsResponseSchema).parse(response);
};

export const deleteCustomMeasurement = async (id: string): Promise<void> => {
  await apiCall(`/measurements/custom-entries/${id}`, { method: 'DELETE' });
};

export const updateCheckInMeasurementField = async (payload: {
  id: string;
  field: string;
  value: number | null;
  entry_date: string;
}): Promise<void> => {
  await apiCall(`/measurements/check-in/${payload.id}`, {
    method: 'PUT',
    body: {
      entry_date: payload.entry_date,
      [payload.field]: payload.value,
    },
  });
};

export const loadExistingCheckInMeasurements = async (
  selectedDate: string
): Promise<CheckInMeasurementsResponse | null> => {
  const response = await apiCall(`/measurements/check-in/${selectedDate}`, {
    method: 'GET',
    suppress404Toast: true,
  });
  // if there are no entries the backend returns an empty object
  if (!response || Object.keys(response).length === 0) {
    return null;
  }
  return checkInMeasurementsResponseSchema.parse(response);
};

export const loadExistingCustomMeasurements = async (
  selectedDate: string
): Promise<CustomMeasurement[]> => {
  return apiCall(`/measurements/custom-entries/${selectedDate}`, {
    method: 'GET',
    suppress404Toast: true,
  });
};

export const saveCheckInMeasurements = async (
  payload: UpdateCheckInMeasurementsRequest
): Promise<void> => {
  await apiCall('/measurements/check-in', {
    method: 'POST',
    body: payload,
  });
};

export const saveCustomMeasurement = async (
  payload: Partial<CustomMeasurement>
): Promise<void> => {
  await apiCall('/measurements/custom-entries', {
    method: 'POST',
    body: payload,
  });
};

export const getMostRecentMeasurement = async (
  measurementType: string
): Promise<CheckInMeasurementsResponse | null> => {
  const response = await apiCall(
    `/measurements/most-recent/${measurementType}`
  );

  // if there are no entries the backend returns an empty object
  if (!response || Object.keys(response).length === 0) {
    return null;
  }
  return checkInMeasurementsResponseSchema.parse(response);
};

export const fetchCustomEntries = async (
  categoryId: string,
  userId?: string
) => {
  const params = new URLSearchParams({ category_id: categoryId });
  if (userId) params.append('userId', userId);

  return apiCall(`/measurements/custom-entries?${params.toString()}`, {
    method: 'GET',
  });
};
