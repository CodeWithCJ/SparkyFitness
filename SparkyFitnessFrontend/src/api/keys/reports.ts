export const reportKeys = {
  all: ['reports'] as const,
  stress: {
    all: ['reports', 'stress'] as const,
    raw: (userId?: string) => ['reports', 'stress', 'raw', { userId }] as const,
  },
  core: (startDate: string, endDate: string, userId?: string) =>
    ['reports', 'core', startDate, endDate, { userId }] as const,
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
};
