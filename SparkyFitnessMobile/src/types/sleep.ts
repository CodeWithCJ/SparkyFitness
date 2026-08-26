/**
 * One day's aggregated sleep, as returned by `GET /api/sleep/analytics`.
 *
 * The server buckets every sleep entry by `entry_date` and sums the durations, so one
 * element here can represent several sleep sessions on the same day.
 */
export interface SleepAnalyticsDay {
  /** Calendar day (`YYYY-MM-DD`), not a UTC instant. */
  date: string;
  /** Bedtime-to-waketime span in seconds, including time awake in bed. */
  totalSleepDuration: number;
  /** Seconds actually asleep, excluding awake periods. */
  timeAsleep: number;
  sleepScore: number;
  earliestBedtime: string | null;
  latestWakeTime: string | null;
  /** Percentage, `timeAsleep / totalSleepDuration`. */
  sleepEfficiency: number;
  /** Hours short of the server's 8-hour target; negative when the target is beaten. */
  sleepDebt: number;
  stagePercentages: Record<string, number>;
  awakePeriods: number;
  totalAwakeDuration: number;
}

/**
 * A single plotted bar on the Dashboard sleep trend.
 *
 * Declared as a type alias rather than an interface because victory-native's
 * `CartesianChart` requires its row type to satisfy `Record<string, unknown>`. Object
 * literal type aliases get that implicit index signature; interfaces never do, so
 * converting this to an interface breaks the chart's generic inference.
 */
export type SleepDataPoint = {
  /** Calendar day (`YYYY-MM-DD`). */
  day: string;
  hours: number;
};
