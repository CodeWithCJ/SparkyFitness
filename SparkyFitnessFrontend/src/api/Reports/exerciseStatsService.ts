import { apiCall } from '@/api/api';
import type {
  ExerciseStatsSummaryResponse,
  ExerciseActivityQueryResponse,
  ExercisePRMatrixResponse,
  MatchedCoursesResponse,
  ExerciseStatsInterval,
} from '@workspace/shared';

export const loadExerciseStatsSummary = async (
  interval: ExerciseStatsInterval = 'month',
  startDate?: string | null,
  endDate?: string | null,
  userId?: string,
  unitSystem: 'metric' | 'imperial' = 'metric'
): Promise<ExerciseStatsSummaryResponse> => {
  const params = new URLSearchParams({ interval, unitSystem });
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (userId) params.append('userId', userId);

  return await apiCall(`/exercise-stats/summary?${params.toString()}`, {
    method: 'GET',
  });
};

export const queryExerciseActivities = async (filters: {
  category?: string;
  distanceStandard?: string;
  searchKeyword?: string;
  page?: number;
  pageSize?: number;
  userId?: string;
  unitSystem?: 'metric' | 'imperial';
}): Promise<ExerciseActivityQueryResponse> => {
  const params = new URLSearchParams();
  if (filters.unitSystem) params.append('unitSystem', filters.unitSystem);
  if (filters.category) params.append('category', filters.category);
  if (filters.distanceStandard && filters.distanceStandard !== 'all') {
    params.append('distanceStandard', filters.distanceStandard);
  }
  if (filters.searchKeyword)
    params.append('searchKeyword', filters.searchKeyword);
  if (filters.page) params.append('page', String(filters.page));
  if (filters.pageSize) params.append('pageSize', String(filters.pageSize));
  if (filters.userId) params.append('userId', filters.userId);

  return await apiCall(`/exercise-stats/query?${params.toString()}`, {
    method: 'GET',
  });
};

export const loadExercisePRs = async (
  userId?: string,
  unitSystem: 'metric' | 'imperial' = 'metric'
): Promise<ExercisePRMatrixResponse> => {
  const params = new URLSearchParams({ unitSystem });
  if (userId) params.append('userId', userId);
  return await apiCall(`/exercise-stats/prs?${params.toString()}`, {
    method: 'GET',
  });
};

export const loadMatchedCourses = async (
  userId?: string,
  unitSystem: 'metric' | 'imperial' = 'metric'
): Promise<MatchedCoursesResponse> => {
  const params = new URLSearchParams({ unitSystem });
  if (userId) params.append('userId', userId);
  return await apiCall(`/exercise-stats/matched-courses?${params.toString()}`, {
    method: 'GET',
  });
};
