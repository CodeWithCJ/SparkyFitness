export const sleepScienceKeys = {
  all: ['sleepScience'] as const,
  sleepDebt: (targetUserId?: string) =>
    [...sleepScienceKeys.all, 'sleepDebt', targetUserId] as const,
  mctqStats: (targetUserId?: string) =>
    [...sleepScienceKeys.all, 'mctqStats', targetUserId] as const,
  dailyNeed: (date: string, targetUserId?: string) =>
    [...sleepScienceKeys.all, 'dailyNeed', date, targetUserId] as const,
  energyCurve: (targetUserId?: string) =>
    [...sleepScienceKeys.all, 'energyCurve', targetUserId] as const,
  chronotype: (targetUserId?: string) =>
    [...sleepScienceKeys.all, 'chronotype', targetUserId] as const,
  dataSufficiency: (targetUserId?: string) =>
    [...sleepScienceKeys.all, 'dataSufficiency', targetUserId] as const,
};
