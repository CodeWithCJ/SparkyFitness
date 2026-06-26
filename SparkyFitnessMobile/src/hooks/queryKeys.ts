export const serverConnectionQueryKey = ['serverConnection'] as const;

export const serverConfigsQueryKey = ['serverConfigs'] as const;

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

export const foodEntryMealDetailQueryKey = (id: string) =>
  ['foodEntryMealDetail', id] as const;

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

export const exerciseStatsQueryKeyRoot = ['exerciseStats'] as const;

export const exerciseStatsQueryKey = (exerciseId: string) =>
  [...exerciseStatsQueryKeyRoot, exerciseId] as const;

export const suggestedExercisesQueryKey = ['suggestedExercises'] as const;

export const exerciseSearchQueryKey = (searchTerm: string) => ['exerciseSearch', searchTerm] as const;

export const exercisesLibraryQueryKey = (searchTerm: string) => ['exercisesLibrary', searchTerm] as const;

export const externalExerciseSearchQueryKey = (providerType: string, searchTerm: string, providerId?: string) =>
  ['externalExerciseSearch', providerType, searchTerm, providerId] as const;

export const workoutPresetsQueryKey = ['workoutPresets'] as const;

export const workoutPresetSearchQueryKey = (searchTerm: string) => ['workoutPresetSearch', searchTerm] as const;

export const workoutPresetsLibraryQueryKey = (searchTerm: string) =>
  ['workoutPresetsLibrary', searchTerm] as const;

export const activeAiServiceSettingQueryKey = ['ai-service-settings', 'active'] as const;
export const userAiConfigAllowedQueryKey = ['ai-service-settings', 'allow-user-ai-config'] as const;

export const fastingRootQueryKey = ['fasting'] as const;
export const fastingCurrentQueryKey = ['fasting', 'current'] as const;
export const fastingStatsQueryKey = ['fasting', 'stats'] as const;
export const fastingHistoryQueryKey = (limit: number, offset: number) =>
  ['fasting', 'history', limit, offset] as const;

export const customNutrientsQueryKey = ['customNutrients'] as const;
export const nutrientDisplayPreferencesQueryKey = ['nutrientDisplayPreferences'] as const;

export const chatHistoryQueryKey = ['chatHistory'] as const;
