export const serverConnectionQueryKey = ['serverConnection'] as const;

export const dailySummaryQueryKey = (date: string) => ['dailySummary', date] as const;

export const measurementsQueryKey = (date: string) => ['measurements', date] as const;

export const preferencesQueryKey = ['userPreferences'] as const;

export const profileQueryKey = ['userProfile'] as const;

export const waterContainersQueryKey = ['waterContainers'] as const;
