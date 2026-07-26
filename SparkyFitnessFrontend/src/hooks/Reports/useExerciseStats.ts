import { useQuery } from '@tanstack/react-query';
import {
  loadExerciseStatsSummary,
  queryExerciseActivities,
  loadExercisePRs,
  loadMatchedCourses,
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
