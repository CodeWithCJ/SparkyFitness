import type {
  CompareParams,
  CompareSinceParams,
} from '../services/api/compareApi';

export const serverConnectionQueryKey = ['serverConnection'] as const;

export const serverConfigsQueryKey = ['serverConfigs'] as const;

export const dailySummaryQueryKey = (date: string) =>
  ['dailySummary', date] as const;
/** Prefix for every date, so a mutation that moves a day's totals can invalidate without knowing which day. */
export const dailySummaryRootQueryKey = ['dailySummary'] as const;

export const familyUsersQueryKey = ['familyDiaryUsers'] as const;
export const familyCopySourceRootQueryKey = ['familyCopySource'] as const;
export const familyCopySourceQueryKey = (date: string) =>
  [...familyCopySourceRootQueryKey, date] as const;
export const familyMealTypesQueryKey = (familyUserId: string) =>
  ['familyMealTypes', familyUserId] as const;
export const familyDailySummaryQueryKey = (
  familyUserId: string,
  date: string
) => ['familyDailySummary', familyUserId, date] as const;

export const caffeineActiveRootQueryKey = ['caffeineActive'] as const;
export const caffeineActiveQueryKey = (date: string) =>
  ['caffeineActive', date] as const;

export const measurementsQueryKey = (date: string) =>
  ['measurements', date] as const;

export const preferencesQueryKey = ['userPreferences'] as const;

export const profileQueryKey = ['userProfile'] as const;

export const waterContainersQueryKey = ['waterContainers'] as const;

/** The person's NFC tags and the action each one runs. */
export const actionTagsQueryKey = ['actionTags'] as const;

/** A day's individual logged drinks — the rows behind the day's water total. */
export const waterIntakeLogQueryKey = (date: string) =>
  ['waterIntakeLog', date] as const;

export const foodsQueryKey = ['foods'] as const;

export const favoritesQueryKey = ['favorites'] as const;

export const foodSearchQueryKey = (searchTerm: string) =>
  ['foodSearch', searchTerm] as const;

export const foodsLibraryQueryKey = (searchTerm: string) =>
  ['foodsLibrary', searchTerm] as const;

export const mealsQueryKey = ['meals'] as const;

export const mealPlansQueryKey = ['mealPlans'] as const;

export const mealDetailQueryKey = (id: string) => ['mealDetail', id] as const;

export const foodEntryMealDetailQueryKey = (id: string) =>
  ['foodEntryMealDetail', id] as const;

export const recentMealsQueryKeyRoot = ['recentMeals'] as const;

export const recentMealsQueryKey = (limit: number) =>
  [...recentMealsQueryKeyRoot, limit] as const;

export const topMealsQueryKeyRoot = ['topMeals'] as const;

export const topMealsQueryKey = (limit: number) =>
  [...topMealsQueryKeyRoot, limit] as const;

export const mealSearchQueryKeyRoot = ['mealSearch'] as const;

export const mealSearchQueryKey = (searchTerm: string) =>
  [...mealSearchQueryKeyRoot, searchTerm] as const;

export const externalProvidersQueryKey = ['externalProviders'] as const;

export const externalFoodSearchQueryKey = (
  providerType: string,
  searchTerm: string,
  providerId?: string,
  autoScale?: boolean
) =>
  [
    'externalFoodSearch',
    providerType,
    searchTerm,
    providerId,
    autoScale,
  ] as const;

// First-page-only key for the "All Providers" fan-out. Kept distinct from
// externalFoodSearchQueryKey (which backs an infinite query) so the two query
// shapes do not collide in the cache.
export const allProvidersFoodSearchQueryKey = (
  providerType: string,
  searchTerm: string,
  providerId?: string,
  autoScale?: boolean
) =>
  [
    'allProvidersFoodSearch',
    providerType,
    searchTerm,
    providerId,
    autoScale,
  ] as const;

export const mealTypesQueryKey = ['mealTypes'] as const;

export const shoesQueryKey = ['shoes'] as const;
export const plateInventoryQueryKey = ['plateInventory'] as const;
export const allergenPreferencesQueryKey = ['allergenPreferences'] as const;

export const goalsQueryKey = (date: string) => ['goals', date] as const;

export const goalPresetsQueryKey = ['goalPresets'] as const;

export const weeklyGoalPlansQueryKey = ['weeklyGoalPlans'] as const;

export const goalsRangeQueryKey = (
  startDate: string,
  endDate: string,
  adjust: boolean
) => ['goalsRange', startDate, endDate, adjust] as const;

export const foodVariantsQueryKey = (foodId: string) =>
  ['foodVariants', foodId] as const;

export const measurementsRangeQueryKey = (startDate: string, endDate: string) =>
  ['measurementsRange', startDate, endDate] as const;

export const vo2MaxRangeQueryKeyRoot = ['vo2MaxRange'] as const;

export const vo2MaxRangeQueryKey = (startDate: string, endDate: string) =>
  [...vo2MaxRangeQueryKeyRoot, startDate, endDate] as const;

export const heartRateRangeQueryKeyRoot = ['heartRateRange'] as const;

export const heartRateRangeQueryKey = (startDate: string, endDate: string) =>
  [...heartRateRangeQueryKeyRoot, startDate, endDate] as const;

export const heartRateReportQueryKeyRoot = ['heartRateReport'] as const;

export const heartRateReportQueryKey = (startDate: string, endDate: string) =>
  [...heartRateReportQueryKeyRoot, startDate, endDate] as const;

export const waterIntakeRangeQueryKey = (startDate: string, endDate: string) =>
  ['waterIntakeRange', startDate, endDate] as const;

export const sleepRangeQueryKeyRoot = ['sleepRange'] as const;
export const sleepRangeQueryKey = (startDate: string, endDate: string) =>
  [...sleepRangeQueryKeyRoot, startDate, endDate] as const;

export const sleepDayQueryKeyRoot = ['sleep'] as const;
export const sleepDayQueryKey = (day: string) =>
  [...sleepDayQueryKeyRoot, 'day', day] as const;

// --- Check-in progress photos ---
/** Root, so an upload/delete can invalidate the gallery and every per-day list. */
export const checkInPhotosRootQueryKey = ['checkInPhotos'] as const;
/** Flat gallery (all photos + the weight logged that day). */
export const checkInPhotoGalleryQueryKey = [
  ...checkInPhotosRootQueryKey,
  'gallery',
] as const;
/** The photos taken on one calendar day. */
export const checkInPhotosByDateQueryKey = (date: string) =>
  [...checkInPhotosRootQueryKey, 'byDate', date] as const;

export const checkInPhotoDatesQueryKey = [
  ...checkInPhotosRootQueryKey,
  'dates',
] as const;

export const customCategoriesQueryKey = ['customCategories'] as const;
/** Root of every per-day custom-entry list; each row embeds its category info. */
export const customMeasurementsRootQueryKey = ['customMeasurements'] as const;

/** The user's own lab markers. */
export const labMarkersQueryKey = ['labMarkers'] as const;
/** The newest result of every marker. */
export const labLatestQueryKey = ['labLatest'] as const;
/** Every lab result for one marker, newest first (`builtin:<key>` or `custom:<id>`). */
export const labHistoryRootQueryKey = ['labHistory'] as const;
export const labHistoryQueryKey = (markerId: string) =>
  [...labHistoryRootQueryKey, markerId] as const;
export const customMeasurementsByDateQueryKey = (date: string) =>
  [...customMeasurementsRootQueryKey, date] as const;

/**
 * Per-field carry-forward lookup (newest value on or before the day). Separate
 * from `measurementsQueryKey`, which is strictly the day's own recorded row:
 * the editor needs both to tell an actual value from a suggestion.
 */
export const latestMeasurementsOnOrBeforeRootQueryKey = [
  'measurementsLatestOnOrBefore',
] as const;

/**
 * Per-field carry-forward lookup for one day. Date keys extend the root so
 * invalidation can target the whole family: a value saved on one day can be the
 * newest "on or before" value for every later cached day, so invalidating only
 * the saved day would leave the others serving a stale suggestion.
 */
export const latestMeasurementsOnOrBeforeQueryKey = (date: string) =>
  [...latestMeasurementsOnOrBeforeRootQueryKey, date] as const;

/**
 * Root for the per-category custom previous-value lookups. Extended by date for
 * the same reason as the standard field family above.
 */
export const latestManualCustomEntriesRootQueryKey = [
  'customMeasurementsLatestManualOnOrBefore',
] as const;

/** Latest manual value per custom category on or before the day. */
export const latestManualCustomEntriesQueryKey = (date: string) =>
  [...latestManualCustomEntriesRootQueryKey, date] as const;

/** Synced workouts that may match a logged workout, and its current link. */
export const calorieLinkQueryKey = (entryId: string) =>
  ['calorieLink', entryId] as const;

export const exerciseHistoryQueryKey = ['exerciseHistory'] as const;

/** Per-exercise filtered history; extends the root so prefix invalidation covers it. */
export const exerciseHistoryForExerciseQueryKey = (exerciseId: string) =>
  [...exerciseHistoryQueryKey, exerciseId] as const;

export const exerciseHistoryResetQueryKey = ['exerciseHistoryReset'] as const;

export const exerciseStatsQueryKeyRoot = ['exerciseStats'] as const;

export const exerciseStatsQueryKey = (
  exerciseId: string,
  excludePresetEntryId?: string,
  presetId?: number
) =>
  [
    ...exerciseStatsQueryKeyRoot,
    exerciseId,
    excludePresetEntryId ?? null,
    presetId ?? null,
  ] as const;

export const workoutSessionFeedbackQueryKey = (presetEntryId: string) =>
  ['workoutSessionFeedback', presetEntryId] as const;

export const workoutCoachingSettingsQueryKey = [
  'workoutCoachingSettings',
] as const;

/** Root for adaptive suggestions; feedback saves invalidate it. */
export const workoutSuggestionsQueryKeyRoot = ['workoutSuggestions'] as const;

export const exerciseAlternativesQueryKeyRoot = [
  'exerciseAlternatives',
] as const;

export const exerciseAlternativesQueryKey = (
  exerciseId: string,
  mode: string,
  excludeIds: readonly string[]
) =>
  [
    ...exerciseAlternativesQueryKeyRoot,
    exerciseId,
    mode,
    [...excludeIds].sort().join(','),
  ] as const;

export const exerciseDetailQueryKey = (exerciseId: string) =>
  ['exerciseDetail', exerciseId] as const;

export const foodDeletionImpactQueryKey = (foodId: string) =>
  ['foodDeletionImpact', foodId] as const;

export const exerciseDeletionImpactQueryKey = (exerciseId: string) =>
  ['exerciseDeletionImpact', exerciseId] as const;

export const suggestedExercisesQueryKey = ['suggestedExercises'] as const;

export const exerciseSearchQueryKey = (searchTerm: string) =>
  ['exerciseSearch', searchTerm] as const;

export const exercisesLibraryQueryKey = (searchTerm: string) =>
  ['exercisesLibrary', searchTerm] as const;

export const externalExerciseSearchQueryKey = (
  providerType: string,
  searchTerm: string,
  providerId?: string,
  language?: string
) =>
  [
    'externalExerciseSearch',
    providerType,
    searchTerm,
    providerId,
    language,
  ] as const;

export const workoutSessionQueryKeyRoot = ['workoutSession'] as const;
export const workoutSessionQueryKey = (sessionId: string) =>
  [...workoutSessionQueryKeyRoot, sessionId] as const;

export const workoutPresetsQueryKey = ['workoutPresets'] as const;

export const workoutPresetSearchQueryKey = (searchTerm: string) =>
  ['workoutPresetSearch', searchTerm] as const;

export const workoutPresetsLibraryQueryKey = (searchTerm: string) =>
  ['workoutPresetsLibrary', searchTerm] as const;

export const workoutPlansRootQueryKey = ['workoutPlanTemplates'] as const;

export const workoutPlansQueryKey = ['workoutPlanTemplates', 'list'] as const;

export const activeWorkoutPlanQueryKey = (date: string) =>
  ['workoutPlanTemplates', 'active', date] as const;

export const activeAiServiceSettingQueryKey = [
  'ai-service-settings',
  'active',
] as const;
export const voiceServiceOptionsQueryKey = [
  'ai-service-settings',
  'voice-options',
] as const;
export const userAiConfigAllowedQueryKey = [
  'ai-service-settings',
  'allow-user-ai-config',
] as const;

export const fastingRootQueryKey = ['fasting'] as const;
export const fastingCurrentQueryKey = ['fasting', 'current'] as const;
export const fastingStatsQueryKey = ['fasting', 'stats'] as const;
export const fastingHistoryQueryKey = (limit: number, offset: number) =>
  ['fasting', 'history', limit, offset] as const;
export const fastingPreferencesQueryKey = ['fasting', 'preferences'] as const;
export const fastingRangeQueryKey = (startDate: string, endDate: string) =>
  ['fasting', 'range', startDate, endDate] as const;

export const customNutrientsQueryKey = ['customNutrients'] as const;
export const nutrientGoalPreferencesQueryKey = [
  'nutrientGoalPreferences',
] as const;
export const nutrientDisplayPreferencesQueryKey = [
  'nutrientDisplayPreferences',
] as const;

export const chatHistoryQueryKey = ['chatHistory'] as const;

export const nutritionTrendsQueryKey = (startDate: string, endDate: string) =>
  ['nutritionTrends', startDate, endDate] as const;

/** Every cached food-entry range, whatever its days. */
export const foodEntriesRangeRootQueryKey = ['foodEntriesRange'] as const;

export const foodEntriesRangeQueryKey = (startDate: string, endDate: string) =>
  ['foodEntriesRange', startDate, endDate] as const;

export const exerciseDashboardQueryKey = (startDate: string, endDate: string) =>
  ['exerciseDashboard', startDate, endDate] as const;

export const trainingConsistencyQueryKey = () =>
  ['trainingConsistency'] as const;

export const trainingLoadRootQueryKey = ['trainingLoad'] as const;

export const trainingLoadQueryKey = (today: string) =>
  [...trainingLoadRootQueryKey, today] as const;

export const runEstimatesQueryKey = (today: string) =>
  ['runEstimates', today] as const;
export const fitnessFatigueQueryKey = (today: string) =>
  ['fitnessFatigue', today] as const;

export const cardioSessionsQueryKey = (
  startDate: string,
  endDate: string,
  unitSystem: 'metric' | 'imperial'
) => ['cardioSessions', startDate, endDate, unitSystem] as const;

export const personalRecordsQueryKey = (unitSystem: 'metric' | 'imperial') =>
  ['personalRecords', unitSystem] as const;

export const cardioSessionDetailQueryKey = (
  part: 'entry' | 'gps' | 'hrZones' | 'distanceSeries',
  exerciseEntryId: string
) => ['cardioSessionDetail', part, exerciseEntryId] as const;

export const heartRateSamplesQueryKey = (startDate: string, endDate: string) =>
  ['heartRateSamples', startDate, endDate] as const;

// --- Cycle & Pregnancy ---
export const cycleSettingsQueryKey = ['cycleSettings'] as const;
export const cycleLogQueryKey = (date: string) => ['cycleLog', date] as const;
export const cycleLogsRangeQueryKey = (start: string, end: string) =>
  ['cycleLogsRange', start, end] as const;
export const cyclesQueryKey = ['cycles'] as const;
export const cycleOverviewQueryKey = ['cycleOverview'] as const;
export const cycleInsightsQueryKey = ['cycleInsights'] as const;
export const cycleFertilityQueryKey = ['cycleFertility'] as const;
export const cycleTestsQueryKey = ['cycleTests'] as const;
export const cycleCorrelationsQueryKey = ['cycleCorrelations'] as const;

export const pregnancyCurrentQueryKey = ['pregnancyCurrent'] as const;
export const pregnancyOverviewQueryKey = ['pregnancyOverview'] as const;
export const pregnancyChecklistQueryKey = ['pregnancyChecklist'] as const;
export const pregnancyPhotosQueryKey = ['pregnancyPhotos'] as const;

export const moodEntriesRootQueryKey = ['moodEntries'] as const;
export const moodEntriesQueryKey = (startDate: string, endDate: string) =>
  ['moodEntries', startDate, endDate] as const;
export const moodRatingsSupportQueryKey = [
  'moodEntries',
  'ratingsSupport',
] as const;
export const moodCheckinsSupportQueryKey = [
  'moodEntries',
  'checkinsSupport',
] as const;
export const moodCheckinsQueryKey = (date: string) =>
  ['moodEntries', 'checkins', date] as const;
export const moodLegacyDayQueryKey = (date: string) =>
  ['moodEntries', 'legacyDay', date] as const;
export const customMoodsQueryKey = ['customMoods'] as const;

export const symptomEntriesQueryKey = (fromDate: string, toDate: string) =>
  ['symptomEntries', fromDate, toDate] as const;
export const symptomEntriesRootQueryKey = ['symptomEntries'] as const;
// Overlapping lists get their own key: the same range without the flag holds
// fewer entries (the history screen's 30 days can match a calendar month).
export const symptomEntriesDetailedQueryKey = (
  fromDate: string,
  toDate: string,
  overlapping = false
) =>
  overlapping
    ? (['symptomEntries', 'detailed', fromDate, toDate, 'overlapping'] as const)
    : (['symptomEntries', 'detailed', fromDate, toDate] as const);
export const symptomOngoingQueryKey = ['symptomOngoing'] as const;
export const symptomDefinitionsQueryKey = ['symptomDefinitions'] as const;
export const symptomOptionsQueryKey = ['symptomOptions'] as const;
export const symptomFreeDaysQueryKey = (fromDate: string, toDate: string) =>
  ['symptomFreeDays', fromDate, toDate] as const;

// --- Medications ---
export const medicationsRootQueryKey = ['medications'] as const;
export const medicationsListQueryKey = (opts?: { activeOnly?: boolean }) =>
  ['medications', 'list', opts ?? {}] as const;
export const medicationDetailQueryKey = (id: string) =>
  ['medications', 'detail', id] as const;
export const medicationEntriesQueryKey = (opts?: {
  fromDate?: string;
  toDate?: string;
  medicationId?: string;
}) => ['medications', 'entries', opts ?? {}] as const;
// GLP-1 keys live under the medications root so invalidateMedicationEntryCaches
// (a dose or injection changes the merged entries feed) refreshes them too.
export const glp1PensQueryKey = (medicationId: string) =>
  ['medications', 'glp1', 'pens', medicationId] as const;
export const glp1InjectionsQueryKey = (medicationId: string) =>
  ['medications', 'glp1', 'injections', medicationId] as const;
export const glp1TitrationQueryKey = (medicationId: string) =>
  ['medications', 'glp1', 'titration', medicationId] as const;
export const glp1SerumCurveQueryKey = (medicationId: string) =>
  ['medications', 'glp1', 'serumCurve', medicationId] as const;
export const glp1SiteSuggestionQueryKey = (medicationId: string) =>
  ['medications', 'glp1', 'siteSuggestion', medicationId] as const;

/** Autocomplete source for the live workout's gym / location prompt. */
export const workoutLocationsQueryKey = ['workoutLocations'] as const;

export const runningTrendsQueryKey = (startDate: string, endDate: string) =>
  ['cardioSessions', 'runningTrends', startDate, endDate] as const;

export const runningRecordsQueryKey = () =>
  ['cardioSessions', 'runningRecords'] as const;

/** The person's run program and place in it (server-backed). */
export const runProgramQueryKey = ['runProgram'] as const;
/** The person's running fitness tests and the paces they gave (server-backed). */
export const fitnessTestsQueryKey = ['fitnessTests'] as const;

/** The person's weekly running distance target and race (server-backed). */
export const runGoalsQueryKey = ['runGoals'] as const;
/** The person's own saved run programs. */
export const customRunProgramsQueryKey = ['customRunPrograms'] as const;

export const heartRateZonesQueryKey = ['heartRateZones'] as const;

/** The person's saved routes (summaries). */
export const routesQueryKey = ['routes'] as const;

/** Whether the server can generate routes (a routing engine is configured). */
export const routeGenerationCapabilitiesQueryKey = [
  'routeGeneration',
  'capabilities',
] as const;

/** One saved route with its points and cues. */
export const routeQueryKey = (id: string) => ['routes', id] as const;

/** One Compare answer: the two metrics, how they are paired, and the window. */
export const compareQueryKey = (p: CompareParams) =>
  ['compare', p.a, p.b, p.mode, p.timing, p.start, p.end] as const;

/** One since-a-habit-started answer: the habit, the outcome, the start and the line (null = the server's pick). */
export const compareSinceQueryKey = (p: CompareSinceParams) =>
  ['compare', 'since', p.a, p.b, p.habitStart, p.line] as const;
