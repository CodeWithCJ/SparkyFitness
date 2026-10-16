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

/** The VO2 max reading for a day, in ml/kg/min. */
export type Vo2MaxDataPoint = {
  day: string;
  vo2max: number;
};

/** A day's total water intake, in millilitres as the server stores it. */
export type HydrationDataPoint = {
  day: string;
  milliliters: number;
};

/**
 * A day's calorie total plus the protein/carbs/fat grams needed to break it into segments.
 * `calories` is the API's raw daily total; it drives the chart's bar height directly, with
 * the macro grams below only used to split that total into segments (see
 * `caloriesStackLayout.ts`), not to recompute it.
 */
export type CaloriesDataPoint = {
  day: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};
