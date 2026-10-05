import { apiCall } from '@/api/api';
import { ExerciseDashboardData, ReportResponse } from '@/types/reports';
import type {
  AlcoholWeekResponse,
  HydrationNutritionRangeResponse,
  TrainingConsistency,
  WorkoutDaysResponse,
} from '@workspace/shared';

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

export const getTrainingConsistency = async (
  userId?: string
): Promise<TrainingConsistency> => {
  const params = new URLSearchParams();
  if (userId) params.append('userId', userId);
  const query = params.toString();
  return apiCall(`/reports/training-consistency${query ? `?${query}` : ''}`, {
    method: 'GET',
  });
};

export const getAlcoholWeekReport = async (
  date: string,
  userId?: string
): Promise<AlcoholWeekResponse> => {
  const params = new URLSearchParams({ date });
  if (userId) params.append('userId', userId);
  const response = await apiCall(
    `/v2/reports/alcohol-week?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return response;
};

/** Days with logged workouts (and counts) — the workout heatmap source. */
export const getWorkoutDays = async (
  startDate: string,
  endDate: string,
  userId?: string
): Promise<WorkoutDaysResponse> => {
  const params = new URLSearchParams({ start: startDate, end: endDate });
  if (userId) params.append('userId', userId);
  return apiCall(`/v2/reports/workout-days?${params.toString()}`, {
    method: 'GET',
  });
};

export const getHydrationNutritionRange = async (
  startDate: string,
  endDate: string,
  userId?: string
): Promise<HydrationNutritionRangeResponse> => {
  const params = new URLSearchParams({ start: startDate, end: endDate });
  if (userId) params.append('userId', userId);
  const response = await apiCall(
    `/v2/reports/hydration-nutrition-range?${params.toString()}`,
    {
      method: 'GET',
    }
  );
  return response;
};
