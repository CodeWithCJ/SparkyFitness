export const checkInKeys = {
  all: ['checkIn'] as const,
  customCategories: () => [...checkInKeys.all, 'customCategories'] as const,
  recentCustom: () => [...checkInKeys.all, 'recentCustom'] as const,
  recentStandard: (startDate: string, endDate: string) =>
    [...checkInKeys.all, 'recentStandard', startDate, endDate] as const,
  existingCheckIn: (date: string) =>
    [...checkInKeys.all, 'existingCheckIn', date] as const,
  existingCustom: (date: string) =>
    [...checkInKeys.all, 'existingCustom', date] as const,
  mostRecent: (type: string) =>
    [...checkInKeys.all, 'mostRecent', type] as const,
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
