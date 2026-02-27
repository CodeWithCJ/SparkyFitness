import { apiCall } from '@/api/api';

export interface UpdateWaterPayload {
  user_id: string;
  entry_date: string;
  change_drinks: number;
  container_id: number | null;
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
