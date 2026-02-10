import { apiFetch } from './apiClient';
import type { CheckInMeasurement, WaterIntake, WaterContainer, WaterIntakeResponse } from '../../types/measurements';

/**
 * Fetches measurements for a given date.
 */
export const fetchMeasurements = async (date: string): Promise<CheckInMeasurement> => {
  return apiFetch<CheckInMeasurement>({
    endpoint: `/api/measurements/check-in/${date}`,
    serviceName: 'Measurements API',
    operation: 'fetch measurements',
  });
};

/**
 * Fetches water intake for a given date.
 */
export const fetchWaterIntake = async (date: string): Promise<WaterIntake> => {
  return apiFetch<WaterIntake>({
    endpoint: `/api/measurements/water-intake/${date}`,
    serviceName: 'Measurements API',
    operation: 'fetch water intake',
  });
};

/**
 * Fetches available water containers.
 */
export const fetchWaterContainers = async (): Promise<WaterContainer[]> => {
  return apiFetch<WaterContainer[]>({
    endpoint: '/api/water-containers',
    serviceName: 'Measurements API',
    operation: 'fetch water containers',
  });
};

/**
 * Changes water intake by adding or removing a drink.
 */
export const changeWaterIntake = async (params: {
  entryDate: string;
  changeDrinks: number;
  containerId: number;
}): Promise<WaterIntakeResponse> => {
  return apiFetch<WaterIntakeResponse>({
    endpoint: '/api/measurements/water-intake',
    serviceName: 'Measurements API',
    operation: 'change water intake',
    method: 'POST',
    body: {
      entry_date: params.entryDate,
      change_drinks: params.changeDrinks,
      container_id: params.containerId,
    },
  });
};
