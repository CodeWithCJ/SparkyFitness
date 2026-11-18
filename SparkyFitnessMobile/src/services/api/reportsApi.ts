import type {
  ExerciseDashboardSummary,
  RunningEstimatesResponse,
  FitnessFatigueResponse,
  TrainingCalendarResponse,
  TrainingConsistency,
  TrainingLoad,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

export interface NutritionTrendPoint {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat: number;
  polyunsaturated_fat: number;
  monounsaturated_fat: number;
  trans_fat: number;
  cholesterol: number;
  sodium: number;
  potassium: number;
  dietary_fiber: number;
  sugars: number;
  vitamin_a: number;
  vitamin_c: number;
  calcium: number;
  iron: number;
  caffeine_mg: number;
  water_ml: number;
  alcohol_g: number;
  [customNutrient: string]: string | number;
}

export const fetchNutritionTrends = (
  startDate: string,
  endDate: string
): Promise<NutritionTrendPoint[]> =>
  apiFetch<NutritionTrendPoint[]>({
    endpoint: `/api/reports/mini-nutrition-trends?startDate=${encodeURIComponent(
      startDate
    )}&endDate=${encodeURIComponent(endDate)}`,
    serviceName: 'Reports API',
    operation: 'fetch nutrition trends',
  });

export const fetchExerciseDashboard = (
  startDate: string,
  endDate: string
): Promise<ExerciseDashboardSummary> =>
  apiFetch<ExerciseDashboardSummary>({
    endpoint: `/api/reports/exercise-dashboard?startDate=${encodeURIComponent(
      startDate
    )}&endDate=${encodeURIComponent(endDate)}`,
    serviceName: 'Reports API',
    operation: 'fetch exercise dashboard',
  });

export const fetchTrainingConsistency = (): Promise<TrainingConsistency> =>
  apiFetch<TrainingConsistency>({
    endpoint: '/api/reports/training-consistency',
    serviceName: 'Reports API',
    operation: 'fetch training consistency',
  });

export const fetchTrainingLoad = (): Promise<TrainingLoad> =>
  apiFetch<TrainingLoad>({
    endpoint: '/api/reports/training-load',
    serviceName: 'Reports API',
    operation: 'fetch training load',
  });

export const fetchFitnessFatigue = (): Promise<FitnessFatigueResponse> =>
  apiFetch<FitnessFatigueResponse>({
    endpoint: '/api/reports/fitness-fatigue',
    serviceName: 'Reports API',
    operation: 'fetch fitness and fatigue',
  });

export const fetchRunEstimates = (): Promise<RunningEstimatesResponse> =>
  apiFetch<RunningEstimatesResponse>({
    endpoint: '/api/reports/run-estimates',
    serviceName: 'Reports API',
    operation: 'fetch running estimates',
  });

export const fetchTrainingCalendar = (
  start: string,
  end: string
): Promise<TrainingCalendarResponse> =>
  apiFetch<TrainingCalendarResponse>({
    endpoint: `/api/reports/training-calendar?start=${encodeURIComponent(
      start
    )}&end=${encodeURIComponent(end)}`,
    serviceName: 'Reports API',
    operation: 'fetch training calendar',
  });
