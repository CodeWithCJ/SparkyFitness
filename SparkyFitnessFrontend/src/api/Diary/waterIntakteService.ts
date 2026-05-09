import { apiCall } from '@/api/api';

export interface UpdateWaterPayload {
  user_id: string;
  entry_date: string;
  change_drinks: number;
  container_id: number | null;
}

export interface WaterIntakeLogEntry {
  id: string;
  user_id: string;
  entry_date: string;
  water_ml: number;
  container_id: number | null;
  container_name: string | null;
  source: string;
  created_at: string;
}

export const getWaterGoalForDate = async (date: string, userId: string) => {
  return apiCall(`/goals/for-date?date=${date}&userId=${userId}`);
};

export const getWaterIntakeForDate = async (date: string, userId: string) => {
  return apiCall(`/measurements/water-intake/${date}?userId=${userId}`);
};

export const updateWaterIntake = async (payload: UpdateWaterPayload) => {
  return apiCall('/measurements/water-intake', {
    method: 'POST',
    body: payload,
  });
};

export const getWaterIntakeLog = async (
  date: string,
  userId: string
): Promise<WaterIntakeLogEntry[]> => {
  return apiCall(`/measurements/water-intake/${date}/log?userId=${userId}`);
};

export const deleteWaterIntakeLogEntry = async (logId: string) => {
  return apiCall(`/measurements/water-intake/log/${logId}`, {
    method: 'DELETE',
  });
};
