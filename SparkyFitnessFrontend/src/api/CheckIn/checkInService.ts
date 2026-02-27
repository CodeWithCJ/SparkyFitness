import { apiCall } from '@/api/api';
import {
  CustomMeasurement,
  CustomCategory,
  CheckInMeasurement,
} from '@/types/checkin';

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
): Promise<CheckInMeasurement[]> => {
  return apiCall(
    `/measurements/check-in-measurements-range/${startDate}/${endDate}`,
    {
      method: 'GET',
      suppress404Toast: true,
    }
  );
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  return apiCall(`/measurements/check-in/${selectedDate}`, {
    method: 'GET',
    suppress404Toast: true,
  });
};

export const loadExistingCustomMeasurements = async (
  selectedDate: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  return apiCall(`/measurements/custom-entries/${selectedDate}`, {
    method: 'GET',
    suppress404Toast: true,
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const saveCheckInMeasurements = async (payload: any): Promise<void> => {
  await apiCall('/measurements/check-in', {
    method: 'POST',
    body: payload,
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const saveCustomMeasurement = async (payload: any): Promise<void> => {
  await apiCall('/measurements/custom-entries', {
    method: 'POST',
    body: payload,
  });
};

export const getMostRecentMeasurement = async (
  measurementType: string
): Promise<CheckInMeasurement | null> => {
  return apiCall(`/measurements/most-recent/${measurementType}`);
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
