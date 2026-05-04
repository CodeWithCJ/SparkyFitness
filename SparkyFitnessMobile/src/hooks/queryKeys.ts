export const serverConnectionQueryKey = ['serverConnection'] as const;

export const dailySummaryQueryKey = (date: string) => ['dailySummary', date] as const;

export const measurementsQueryKey = (date: string) => ['measurements', date] as const;

export const preferencesQueryKey = ['userPreferences'] as const;

export const profileQueryKey = ['userProfile'] as const;

export const waterContainersQueryKey = ['waterContainers'] as const;

export const foodsQueryKey = ['foods'] as const;

export const foodSearchQueryKey = (searchTerm: string) => ['foodSearch', searchTerm] as const;

export const foodsLibraryQueryKey = (searchTerm: string) => ['foodsLibrary', searchTerm] as const;

export const mealsQueryKey = ['meals'] as const;

export const mealDetailQueryKey = (id: string) => ['mealDetail', id] as const;

export const recentMealsQueryKeyRoot = ['recentMeals'] as const;

export const recentMealsQueryKey = (limit: number) => [...recentMealsQueryKeyRoot, limit] as const;

export const mealSearchQueryKeyRoot = ['mealSearch'] as const;

export const mealSearchQueryKey = (searchTerm: string) => [...mealSearchQueryKeyRoot, searchTerm] as const;

export const externalProvidersQueryKey = ['externalProviders'] as const;

export const externalFoodSearchQueryKey = (providerType: string, searchTerm: string, providerId?: string, autoScale?: boolean) =>
  ['externalFoodSearch', providerType, searchTerm, providerId, autoScale] as const;

export const mealTypesQueryKey = ['mealTypes'] as const;

export const goalsQueryKey = (date: string) => ['goals', date] as const;

export const foodVariantsQueryKey = (foodId: string) => ['foodVariants', foodId] as const;

export const measurementsRangeQueryKey = (startDate: string, endDate: string) =>
  ['measurementsRange', startDate, endDate] as const;

export const exerciseHistoryQueryKey = ['exerciseHistory'] as const;

export const exerciseHistoryResetQueryKey = ['exerciseHistoryReset'] as const;

export const suggestedExercisesQueryKey = ['suggestedExercises'] as const;

export const exerciseSearchQueryKey = (searchTerm: string) => ['exerciseSearch', searchTerm] as const;

export const exercisesLibraryQueryKey = (searchTerm: string) => ['exercisesLibrary', searchTerm] as const;

export const externalExerciseSearchQueryKey = (providerType: string, searchTerm: string, providerId?: string) =>
  ['externalExerciseSearch', providerType, searchTerm, providerId] as const;

export const workoutPresetsQueryKey = ['workoutPresets'] as const;

export const workoutPresetSearchQueryKey = (searchTerm: string) => ['workoutPresetSearch', searchTerm] as const;

export const workoutPresetsLibraryQueryKey = (searchTerm: string) =>
  ['workoutPresetsLibrary', searchTerm] as const;
