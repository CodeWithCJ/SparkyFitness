export const mealTypeKeys = {
  all: ['mealTypes'] as const,
  lists: () => [...mealTypeKeys.all, 'list'] as const,
};

export const dailyProgressKeys = {
  all: ['dailyProgress'] as const,
  goals: (date: string) => [...dailyProgressKeys.all, 'goals', date] as const,
  steps: (date: string) => [...dailyProgressKeys.all, 'steps', date] as const,
  exercises: (date: string) =>
    [...dailyProgressKeys.all, 'exercises', date] as const,
  measurements: {
    mostRecent: (type: string) =>
      [...dailyProgressKeys.all, 'measurements', 'recent', type] as const,
  },
};

export const foodEntryKeys = {
  all: ['foodEntries'] as const,
  byDate: (date: string) => [...foodEntryKeys.all, 'date', date] as const,
};

export const foodEntryMealKeys = {
  all: ['foodEntryMeals'] as const,
  byDate: (date: string) => [...foodEntryMealKeys.all, 'date', date] as const,
  details: () => [...foodEntryMealKeys.all, 'detail'] as const,
  detail: (id: string) => [...foodEntryMealKeys.details(), id] as const,
};

export const diaryReportKeys = {
  all: ['diaryReports'] as const,
  nutritionTrends: () =>
    [...diaryReportKeys.all, 'mini-nutrition-trends'] as const,
  nutritionTrendDetail: (userId: string, startDate: string, endDate: string) =>
    [...diaryReportKeys.nutritionTrends(), userId, startDate, endDate] as const,
};

export const waterIntakeKeys = {
  all: ['waterIntake'] as const,
  daily: (date: string, userId: string) =>
    [...waterIntakeKeys.all, date, userId] as const,
  goals: (date: string, userId: string) =>
    ['goals', 'water', date, userId] as const,
};
