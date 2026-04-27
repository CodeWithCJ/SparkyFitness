export const goalKeys = {
  all: ['goals'] as const,

  daily: {
    all: () => [...goalKeys.all, 'daily'] as const,
    byDate: (startDate: string, endDate?: string) =>
      [...goalKeys.daily.all(), startDate, endDate] as const,
  },

  presets: {
    all: () => [...goalKeys.all, 'presets'] as const,
    one: (id: string) => [...goalKeys.presets.all(), id] as const,
  },

  plans: {
    all: () => [...goalKeys.all, 'plans'] as const,
    one: (id: string) => [...goalKeys.plans.all(), id] as const,
    active: (date: string) =>
      [...goalKeys.plans.all(), 'active', date] as const,
  },
};
