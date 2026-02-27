import { api } from '@/api/api';
import { FastingLog } from '@/types/fasting';

interface FastingStats {
  total_completed_fasts: string; // Postgres returns bigints as strings sometimes
  total_minutes_fasted: string;
  average_duration_minutes: string;
}

export const startFast = async (
  startTime: Date,
  targetEndTime: Date,
  fastingType: string
): Promise<FastingLog> => {
  const response = await api.post('/fasting/start', {
    body: {
      start_time: startTime.toISOString(),
      target_end_time: targetEndTime.toISOString(),
      fasting_type: fastingType,
    },
  });
  return response;
};

export const endFast = async (
  id: string,
  startTime: Date,
  endTime: Date,
  weight?: number,
  mood?: { value: number; notes: string }
): Promise<FastingLog> => {
  const response = await api.post('/fasting/end', {
    body: {
      id,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      weight,
      mood,
    },
  });
  return response;
};

export const getCurrentFast = async (): Promise<FastingLog | null> => {
  const response = await api.get('/fasting/current');
  return response;
};

export const getFastingHistory = async (
  limit: number = 20,
  offset: number = 0
): Promise<FastingLog[]> => {
  const response = await api.get('/fasting/history', {
    params: { limit, offset },
  });
  return response || [];
};

export const getFastingStats = async (): Promise<FastingStats> => {
  const response = await api.get('/fasting/stats');
  return response;
};

// Get fasting logs within a date range (inclusive)
export const getFastingDataRange = async (
  startDate: string,
  endDate: string
): Promise<FastingLog[]> => {
  const response = await api.get(
    `/fasting/history/range/${startDate}/${endDate}`
  );
  return response || [];
};

export const updateFast = async (
  id: string,
  updates: Partial<FastingLog>
): Promise<FastingLog> => {
  const response = await api.put(`/fasting/${id}`, { body: updates });
  return response;
};
