import { apiCall } from '@/api/api';
import type {
  UpsertWaterIntakeBody,
  WaterIntakeDayTotals,
  WaterIntakeLogEntry,
} from '@workspace/shared';

export type { WaterIntakeDayTotals, WaterIntakeLogEntry };
export type UpdateWaterPayload = UpsertWaterIntakeBody;

export const getWaterGoalForDate = async (date: string, userId: string) => {
  return apiCall(`/goals/for-date?date=${date}&userId=${userId}&adjust=true`);
};

export const getWaterIntakeForDate = async (
  date: string,
  userId: string
): Promise<WaterIntakeDayTotals | WaterIntakeDayTotals[]> => {
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
  return apiCall(`/v2/measurements/water-intake/${date}/log?userId=${userId}`);
};

export const deleteWaterIntakeLogEntry = async (logId: string) => {
  return apiCall(`/v2/measurements/water-intake/log/${logId}`, {
    method: 'DELETE',
    // Deleting a linked food entry cascades to its water log row, so a diary
    // page opened before that can still show a drink the server has already
    // dropped. Gone is the outcome the user asked for, so a 404 refreshes the
    // list instead of raising an error.
    suppress404Toast: true,
  });
};

export const updateWaterIntakeLogTime = async (
  logId: string,
  loggedAt: string
) => {
  return apiCall(`/v2/measurements/water-intake/log/${logId}`, {
    method: 'PATCH',
    body: { loggedAt },
  });
};
