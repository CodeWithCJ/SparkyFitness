/** The window the Health Trends pager plots, shared by every trend on it. */
export type HealthTrendDateRange = '7d' | '30d' | '90d';

/** How many days back each range covers, inclusive of today. */
export const RANGE_DAYS: Record<HealthTrendDateRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/**
 * A trend's data plus its fetch state.
 */
export type HealthTrendSeries<TPoint> = {
  data: TPoint[];
  isLoading: boolean;
  isError: boolean;
};
