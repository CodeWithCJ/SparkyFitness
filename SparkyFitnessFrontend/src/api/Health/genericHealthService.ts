import { apiCall } from '@/api/api';
import {
  DailyHealthMetrics,
  HeartRateEntries,
  HrvEntries,
  RespirationEntries,
  Spo2Entries,
  VitalsEntries,
  ExerciseEntryLaps,
  ExerciseEntryGpsPoints,
} from '@workspace/shared';

export const fetchDailyHealthMetrics = async (
  startDate: string,
  endDate?: string,
  userId?: string
): Promise<DailyHealthMetrics[]> => {
  const params = new URLSearchParams({
    startDate,
    endDate: endDate || startDate,
  });
  if (userId) params.append('userId', userId);
  const response = await apiCall<{ data: DailyHealthMetrics[] }>(
    `/generic-health/metrics?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return response?.data || [];
};

export const fetchHeartRateEntries = async (
  startDate: string,
  endDate?: string,
  userId?: string
): Promise<HeartRateEntries[]> => {
  const params = new URLSearchParams({
    startDate,
    endDate: endDate || startDate,
  });
  if (userId) params.append('userId', userId);
  const response = await apiCall<{ data: HeartRateEntries[] }>(
    `/generic-health/heart-rate?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return response?.data || [];
};

export const fetchHrvEntries = async (
  startDate: string,
  endDate?: string,
  userId?: string
): Promise<HrvEntries[]> => {
  const params = new URLSearchParams({
    startDate,
    endDate: endDate || startDate,
  });
  if (userId) params.append('userId', userId);
  const response = await apiCall<{ data: HrvEntries[] }>(
    `/generic-health/hrv?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return response?.data || [];
};

export const fetchRespirationEntries = async (
  startDate: string,
  endDate?: string,
  userId?: string
): Promise<RespirationEntries[]> => {
  const params = new URLSearchParams({
    startDate,
    endDate: endDate || startDate,
  });
  if (userId) params.append('userId', userId);
  const response = await apiCall<{ data: RespirationEntries[] }>(
    `/generic-health/respiration?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return response?.data || [];
};

export const fetchSpo2Entries = async (
  startDate: string,
  endDate?: string,
  userId?: string
): Promise<Spo2Entries[]> => {
  const params = new URLSearchParams({
    startDate,
    endDate: endDate || startDate,
  });
  if (userId) params.append('userId', userId);
  const response = await apiCall<{ data: Spo2Entries[] }>(
    `/generic-health/spo2?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return response?.data || [];
};

export const fetchVitalsEntries = async (
  startDate: string,
  endDate?: string,
  userId?: string
): Promise<VitalsEntries[]> => {
  const params = new URLSearchParams({
    startDate,
    endDate: endDate || startDate,
  });
  if (userId) params.append('userId', userId);
  const response = await apiCall<{ data: VitalsEntries[] }>(
    `/generic-health/vitals?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return response?.data || [];
};

export const fetchWorkoutLaps = async (
  exerciseEntryId: string
): Promise<ExerciseEntryLaps[]> => {
  const response = await apiCall<{ data: ExerciseEntryLaps[] }>(
    `/generic-health/workout-laps/${exerciseEntryId}`,
    { method: 'GET' }
  );
  return response?.data || [];
};

export const fetchWorkoutGpsPoints = async (
  exerciseEntryId: string
): Promise<ExerciseEntryGpsPoints[]> => {
  const response = await apiCall<{ data: ExerciseEntryGpsPoints[] }>(
    `/generic-health/workout-gps/${exerciseEntryId}`,
    { method: 'GET' }
  );
  return response?.data || [];
};
