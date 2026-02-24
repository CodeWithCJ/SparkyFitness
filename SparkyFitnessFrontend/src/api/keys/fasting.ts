export const fastingKeys = {
  all: ['fasting'] as const,
  current: () => [...fastingKeys.all, 'current'] as const,
  lists: () => [...fastingKeys.all, 'list'] as const,
  list: (limit: number, offset: number) =>
    [...fastingKeys.lists(), limit, offset] as const,
  stats: () => [...fastingKeys.all, 'stats'] as const,
  ranges: () => [...fastingKeys.all, 'range'] as const,
  range: (startDate: string, endDate: string) =>
    [...fastingKeys.ranges(), startDate, endDate] as const,
};
