import { useQuery } from '@tanstack/react-query';
import {
  loadExerciseStatsSummary,
  queryExerciseActivities,
  loadExercisePRs,
  loadMatchedCourses,
  loadStrengthSummary,
} from '@/api/Reports/exerciseStatsService';

export const useExerciseStatsSummary = (
  interval: 'day' | 'week' | 'month' | 'year' = 'month',
  startDate?: string | null,
  endDate?: string | null,
  userId?: string,
  unitSystem: 'metric' | 'imperial' = 'metric'
) => {
  return useQuery({
    queryKey: [
      'exerciseStatsSummary',
      interval,
      startDate,
      endDate,
      userId,
      unitSystem,
    ],
    queryFn: () =>
      loadExerciseStatsSummary(
        interval,
        startDate,
        endDate,
        userId,
        unitSystem
      ),
  });
};

export const useExercisePRs = (
  userId?: string,
  unitSystem: 'metric' | 'imperial' = 'metric'
) => {
  return useQuery({
    queryKey: ['exercisePRs', userId, unitSystem],
    queryFn: () => loadExercisePRs(userId, unitSystem),
  });
};

export const useStrengthSummary = (userId?: string) => {
  return useQuery({
    queryKey: ['strengthSummary', userId],
    queryFn: () => loadStrengthSummary(userId),
    retry: false,
  });
};

export const useExerciseActivities = (
  startDate?: string | null,
  endDate?: string | null,
  userId?: string,
  unitSystem: 'metric' | 'imperial' = 'metric',
  page = 1
) => {
  return useQuery({
    queryKey: [
      'exerciseActivities',
      startDate,
      endDate,
      userId,
      unitSystem,
      page,
    ],
    queryFn: () =>
      queryExerciseActivities({
        startDate,
        endDate,
        userId,
        unitSystem,
        page,
        pageSize: 50,
        sortBy: 'entry_date',
        sortOrder: 'desc',
      }),
  });
};

export const useMatchedCourses = (
  userId?: string,
  unitSystem: 'metric' | 'imperial' = 'metric'
) => {
  return useQuery({
    queryKey: ['matchedCourses', userId, unitSystem],
    queryFn: () => loadMatchedCourses(userId, unitSystem),
  });
};

export { queryExerciseActivities };
