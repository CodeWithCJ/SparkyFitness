import { apiCall } from './api';

export interface CustomCategory {
  id: string;
  name: string;
  measurement_type: string;
  frequency: string;
  data_type: 'numeric' | 'text';
}

export interface CustomMeasurement {
  id: string;
  category_id: string;
  value: number;
  text_value?: string;
  notes?: string;
  entry_date: string;
  entry_hour: number | null;
  entry_timestamp: string;
  custom_categories: {
    name: string;
    measurement_type: string;
    frequency: string;
  };
}

export interface CheckInMeasurement {
  id: string;
  entry_date: string;
  weight: number | null;
  neck: number | null;
  waist: number | null;
  hips: number | null;
  steps: number | null;
}

export interface CombinedMeasurement {
  id: string;
  entry_date: string;
  entry_hour: number | null;
  entry_timestamp: string;
  value: number;
  type: 'custom' | 'standard';
  display_name: string;
  display_unit: string;
  // Optional properties for custom measurements
  custom_categories?: {
    name: string;
    measurement_type: string;
    frequency: string;
  };
}

export const loadCustomCategories = async (): Promise<CustomCategory[]> => {
  return apiCall(`/measurements/custom-categories`, {
    method: 'GET',
  });
};

export const fetchRecentCustomMeasurements = async (): Promise<CustomMeasurement[]> => {
  return apiCall(`/measurements/custom-entries?limit=20&orderBy=entry_timestamp.desc&filter=value.gt.0`, {
    method: 'GET',
  });
};

export const fetchRecentStandardMeasurements = async (startDate: string, endDate: string): Promise<CheckInMeasurement[]> => {
  return apiCall(`/measurements/check-in-measurements-range/${startDate}/${endDate}`, {
    method: 'GET',
  });
};

export const deleteCustomMeasurement = async (measurementId: string): Promise<void> => {
  await apiCall(`/measurements/custom-entries/${measurementId}`, {
    method: 'DELETE',
  });
};

export const updateCheckInMeasurementField = async (payload: { id: string, field: string, value: number | null, entry_date: string }): Promise<void> => {
  await apiCall(`/measurements/check-in/${payload.id}`, {
    method: 'PUT',
    body: {
      entry_date: payload.entry_date,
      [payload.field]: payload.value,
    },
  });
};

export const loadExistingCheckInMeasurements = async (selectedDate: string): Promise<any> => {
  return apiCall(`/measurements/check-in/${selectedDate}`, {
    method: 'GET',
  });
};

export const loadExistingCustomMeasurements = async (selectedDate: string): Promise<CustomMeasurement[]> => {
  return apiCall(`/measurements/custom-entries/${selectedDate}`, {
    method: 'GET',
  });
};

export const saveCheckInMeasurements = async (payload: any): Promise<void> => {
  await apiCall('/measurements/check-in', {
    method: 'POST',
    body: payload,
  });
};

export const saveCustomMeasurement = async (payload: any): Promise<void> => {
  await apiCall('/measurements/custom-entries', {
    method: 'POST',
    body: payload,
  });
};