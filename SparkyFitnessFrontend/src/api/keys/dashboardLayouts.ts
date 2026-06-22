export const dashboardLayoutKeys = {
  all: ['dashboardLayouts'] as const,
  byPage: (pageKey: string) => [...dashboardLayoutKeys.all, pageKey] as const,
};
