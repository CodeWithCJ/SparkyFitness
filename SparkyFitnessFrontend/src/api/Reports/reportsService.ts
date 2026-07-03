import { apiCall } from '@/api/api';
import { ExerciseDashboardData, ReportResponse } from '@/types/reports';

export const loadReportsData = async (
  startDate: string,
  endDate: string,
  userId?: string
): Promise<ReportResponse> => {
  const params = new URLSearchParams({
    startDate,
    endDate,
  });
  if (userId) params.append('userId', userId);
  const response = await apiCall(`/reports?${params.toString()}`, {
    method: 'GET',
  });
  return response;
}; // Closing brace for loadReportsData

export const getExerciseDashboardData = async (
  startDate: string,
  endDate: string,
  userId?: string,
  equipment: string | null = null,
  muscle: string | null = null,
  exercise: string | null = null
): Promise<ExerciseDashboardData> => {
  const params = new URLSearchParams({
    startDate,
    endDate,
  });
  if (userId) params.append('userId', userId);
  if (equipment) params.append('equipment', equipment);
  if (muscle) params.append('muscle', muscle);
  if (exercise) params.append('exercise', exercise);
  const response = await apiCall(
    `/reports/exercise-dashboard?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return response;
};
