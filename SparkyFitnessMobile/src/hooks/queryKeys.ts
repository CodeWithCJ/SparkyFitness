export const serverConnectionQueryKey = ['serverConnection'] as const;

export const dailySummaryQueryKey = (date: string) => ['dailySummary', date] as const;

export const measurementsQueryKey = (date: string) => ['measurements', date] as const;

export const preferencesQueryKey = ['userPreferences'] as const;

export const profileQueryKey = ['userProfile'] as const;

export const waterContainersQueryKey = ['waterContainers'] as const;

export const foodsQueryKey = ['foods'] as const;

export const foodSearchQueryKey = (searchTerm: string) => ['foodSearch', searchTerm] as const;

export const mealsQueryKey = ['meals'] as const;

export const mealSearchQueryKey = (searchTerm: string) => ['mealSearch', searchTerm] as const;

export const externalProvidersQueryKey = ['externalProviders'] as const;

export const externalFoodSearchQueryKey = (providerType: string, searchTerm: string, providerId?: string) =>
  ['externalFoodSearch', providerType, searchTerm, providerId] as const;

export const mealTypesQueryKey = ['mealTypes'] as const;

export const goalsQueryKey = (date: string) => ['goals', date] as const;

export const foodVariantsQueryKey = (foodId: string) => ['foodVariants', foodId] as const;

export const measurementsRangeQueryKey = (startDate: string, endDate: string) =>
  ['measurementsRange', startDate, endDate] as const;
