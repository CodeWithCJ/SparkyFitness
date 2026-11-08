export const checkInKeys = {
  all: ['checkIn'] as const,
  customCategories: (userId?: string) =>
    [...checkInKeys.all, 'customCategories', userId] as const,
  recentCustom: () => [...checkInKeys.all, 'recentCustom'] as const,
  recentStandard: (startDate: string, endDate: string) =>
    [...checkInKeys.all, 'recentStandard', startDate, endDate] as const,
  latestCheckIn: (date: string) =>
    [...checkInKeys.all, 'latestCheckIn', date] as const,
  dayCheckIn: (date: string) =>
    [...checkInKeys.all, 'dayCheckIn', date] as const,
  existingCustom: (date: string) =>
    [...checkInKeys.all, 'existingCustom', date] as const,
  latestManualCustom: (date: string) =>
    [...checkInKeys.all, 'latestManualCustom', date] as const,
  mostRecent: (type: string) =>
    [...checkInKeys.all, 'mostRecent', type] as const,
  customEntries: (categoryId: string, userId?: string) =>
    [...checkInKeys.all, 'customEntries', categoryId, userId] as const,
  rawStressData: (userId: string, categoryId: string) =>
    [...checkInKeys.all, 'rawStressData', userId, categoryId] as const,
  // Under checkInKeys.all so the measurement mutations, which invalidate the
  // whole family, also refresh the day weights shown with the photos.
  photoGallery: () => [...checkInKeys.all, 'photoGallery'] as const,
};

export const moodKeys = {
  all: ['moods'] as const,
  lists: () => [...moodKeys.all, 'list'] as const,
  list: (startDate: string, endDate: string, userId?: string) =>
    [...moodKeys.lists(), startDate, endDate, userId] as const,
  details: () => [...moodKeys.all, 'detail'] as const,
  detail: (id: string) => [...moodKeys.details(), id] as const,
  byDate: (date: string) => [...moodKeys.all, 'byDate', date] as const,
};

export const sleepKeys = {
  all: ['sleep'] as const,
  details: (startDate: string, endDate: string) =>
    [...sleepKeys.all, 'details', startDate, endDate] as const,
};

export const mindfulnessKeys = {
  all: ['mindfulness'] as const,
  daySummary: (date: string) =>
    [...mindfulnessKeys.all, 'daySummary', date] as const,
  entries: (date?: string) =>
    [...mindfulnessKeys.all, 'entries', date] as const,
  range: (startDate: string, endDate: string) =>
    [...mindfulnessKeys.all, 'range', startDate, endDate] as const,
};

export const oralCareKeys = {
  all: ['oralCare'] as const,
  daySummary: (date: string) =>
    [...oralCareKeys.all, 'daySummary', date] as const,
  history: (startDate: string, endDate: string) =>
    [...oralCareKeys.all, 'history', startDate, endDate] as const,
};
