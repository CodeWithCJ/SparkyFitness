import { apiCall } from './api';

export interface CustomCategory {
  id: string;
  name: string;
  display_name?: string | null;
  measurement_type: string;
  frequency: string;
  data_type: string;
}

export interface CustomMeasurement {
  id: string;
  category_id: string;
  value: string | number;
  notes?: string;
  entry_date: string;
  entry_hour: number | null;
  entry_timestamp: string;
  custom_categories: {
    name: string;
    display_name?: string | null;
    measurement_type: string;
    frequency: string;
    data_type: string;
  };
}

export interface StressDataPoint {
  time: string;
  stress_level: number;
}

export const getCustomCategories = async (userId: string): Promise<CustomCategory[]> => {
  return apiCall(`/measurements/custom-categories?userId=${userId}`, {
    method: 'GET',
  });
};

export const getCustomMeasurements = async (userId: string): Promise<CustomMeasurement[]> => {
  return apiCall(`/measurements/custom-entries?userId=${userId}`, {
    method: 'GET',
  });
};

export const getCustomMeasurementsForDate = async (userId: string, date: string): Promise<CustomMeasurement[]> => {
  return apiCall(`/measurements/custom-entries/${userId}/${date}`, {
    method: 'GET',
  });
};

export const saveCustomMeasurement = async (measurementData: any): Promise<CustomMeasurement> => {
  return apiCall('/measurements/custom-entries', {
    method: 'POST', // Always use POST for new entries, backend will handle upsert logic
    body: measurementData,
  });
};

export const deleteCustomMeasurement = async (measurementId: string): Promise<void> => {
  return apiCall(`/measurements/custom-entries/${measurementId}`, {
    method: 'DELETE',
  });
};

export const getRawStressData = async (userId: string): Promise<StressDataPoint[]> => {
  const categories = await getCustomCategories(userId);
  const rawStressCategory = categories.find(cat => cat.name === 'Raw Stress Data');

  if (!rawStressCategory) {
    console.warn('Raw Stress Data category not found.');
    return [];
  }
  console.log('Identified rawStressCategory:', rawStressCategory);

  const customMeasurements: CustomMeasurement[] = await apiCall(
    `/measurements/custom-entries?userId=${userId}&category_id=${rawStressCategory.id}`,
    {
      method: 'GET',
    }
  );

  let allStressDataPoints: StressDataPoint[] = [];
  console.log('Custom measurements received for raw stress data:', customMeasurements);

  customMeasurements.forEach(measurement => {
    try {
      if (typeof measurement.value === 'string') {
        const parsedValue: StressDataPoint[] = JSON.parse(measurement.value);
        allStressDataPoints = allStressDataPoints.concat(parsedValue);
      }
    } catch (error) {
      console.error('Error parsing stress data point:', error);
    }
  });

  return allStressDataPoints;
};
