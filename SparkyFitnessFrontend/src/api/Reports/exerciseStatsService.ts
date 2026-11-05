import { apiCall } from '@/api/api';
import type {
  ExerciseStatsSummaryResponse,
  ExerciseActivityQueryResponse,
  ExercisePRMatrixResponse,
  MatchedCoursesResponse,
  ExerciseStatsInterval,
  StrengthSummaryResponse,
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
  startDate?: string | null;
  endDate?: string | null;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.sortBy) params.append('sortBy', filters.sortBy);
  if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);

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

// Older servers have no strength summary: the call fails quietly and the card
// stays hidden.
export const loadStrengthSummary = async (
  userId?: string
): Promise<StrengthSummaryResponse> => {
  const params = new URLSearchParams();
  if (userId) params.append('userId', userId);
  const query = params.toString();
  return await apiCall(
    `/exercise-stats/strength-summary${query ? `?${query}` : ''}`,
    { method: 'GET', suppressErrorToast: true }
  );
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
