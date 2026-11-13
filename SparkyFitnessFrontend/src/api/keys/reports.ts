import type { CompareQuery, CompareSinceQuery } from '@workspace/shared';

export const reportKeys = {
  all: ['reports'] as const,
  stress: {
    all: ['reports', 'stress'] as const,
    raw: (userId?: string) => ['reports', 'stress', 'raw', { userId }] as const,
  },
  core: (startDate: string, endDate: string, userId?: string) =>
    ['reports', 'core', startDate, endDate, { userId }] as const,
  calorieBalance: (startDate: string, endDate: string, userId?: string) =>
    ['reports', 'calorieBalance', startDate, endDate, { userId }] as const,
  exerciseDashboard: (
    startDate: string,
    endDate: string,
    userId?: string,
    equipment?: string | null,
    muscle?: string | null,
    exercise?: string | null
  ) =>
    [
      'reports',
      'exerciseDashboard',
      startDate,
      endDate,
      { userId, equipment, muscle, exercise },
    ] as const,
  trainingConsistency: (userId?: string) =>
    ['reports', 'trainingConsistency', { userId }] as const,
  fitnessFatigue: (userId?: string) =>
    ['reports', 'fitnessFatigue', { userId }] as const,
  runEstimates: (userId?: string) =>
    ['reports', 'runEstimates', { userId }] as const,
  alcoholWeek: (date: string, userId?: string) =>
    ['reports', 'alcoholWeek', date, { userId }] as const,
  hydrationNutritionRange: (
    startDate: string,
    endDate: string,
    userId?: string
  ) =>
    [
      'reports',
      'hydrationNutritionRange',
      startDate,
      endDate,
      { userId },
    ] as const,
  compare: (query: CompareQuery, userId?: string) =>
    [
      'reports',
      'compare',
      query.a,
      query.b,
      query.mode,
      query.timing,
      query.start,
      query.end,
      { userId },
    ] as const,
  compareSince: (query: CompareSinceQuery, userId?: string) =>
    [
      'reports',
      'compareSince',
      query.a,
      query.b,
      query.habitStart ?? null,
      query.line ?? null,
      { userId },
    ] as const,
  workoutDays: (startDate: string, endDate: string, userId?: string) =>
    ['reports', 'workoutDays', startDate, endDate, { userId }] as const,
};
