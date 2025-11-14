import { apiCall } from './api';

export interface CustomCategory {
  id: string;
  name: string;
  display_name?: string | null;
  measurement_type: string;
  frequency: string;
  data_type: 'numeric' | 'text';
}

export interface CustomMeasurement {
  id: string;
  category_id: string;
  value: string | number;
  entry_date: string;
  entry_hour: number | null;
  entry_timestamp: string;
  notes?: string;
  custom_categories: {
    name: string;
    display_name?: string | null;
    measurement_type: string;
    frequency: string;
    data_type: 'numeric' | 'text';
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
  height: number | null;
  body_fat_percentage: number | null;
  updated_at: string; // Add updated_at for sorting
}

export interface CombinedMeasurement {
  id: string;
  entry_date: string;
  entry_hour: number | null;
  entry_timestamp: string;
  value: string | number;
  type: 'custom' | 'standard';
  display_name: string;
  display_unit: string;
  custom_categories?: any;
}

export const loadCustomCategories = async (): Promise<CustomCategory[]> => {
  return apiCall('/measurements/custom-categories');
};

export const fetchRecentCustomMeasurements = async (): Promise<CustomMeasurement[]> => {
  return apiCall('/measurements/custom-entries', {
    params: { limit: 20, orderBy: 'entry_timestamp.desc' }
  });
};

export const fetchRecentStandardMeasurements = async (startDate: string, endDate: string): Promise<CheckInMeasurement[]> => {
  return apiCall(`/measurements/check-in-measurements-range/${startDate}/${endDate}`, {
    method: 'GET',
    suppress404Toast: true,
  });
};

export const deleteCustomMeasurement = async (id: string): Promise<void> => {
  await apiCall(`/measurements/custom-entries/${id}`, { method: 'DELETE' });
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
    suppress404Toast: true,
  });
};

export const loadExistingCustomMeasurements = async (selectedDate: string): Promise<any> => {
  return apiCall(`/measurements/custom-entries/${selectedDate}`, {
    method: 'GET',
    suppress404Toast: true,
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

export const getMostRecentMeasurement = async (measurementType: string): Promise<CheckInMeasurement | null> => {
  return apiCall(`/measurements/most-recent/${measurementType}`);
};
