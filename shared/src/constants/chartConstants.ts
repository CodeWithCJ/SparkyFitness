/**
 * Constants shared by the report/analytics charts.
 */

/**
 * How a chart lays out its date axis.
 *
 * - `time`: the axis is a continuous time scale, so the horizontal distance
 *   between two points is proportional to the elapsed time between them. Gaps
 *   in the data (a week without a weigh-in) show up as gaps in the chart.
 * - `point`: the axis is categorical, so every recorded entry gets the same
 *   width regardless of when it happened. Gaps are invisible, which reads
 *   better for sparse or irregularly logged series.
 */
export const CHART_SCALE_MODES = ["time", "point"] as const;

export type ChartScaleMode = (typeof CHART_SCALE_MODES)[number];

/**
 * Time-proportional is the honest default: an evenly spaced axis over unevenly
 * spaced entries visually flattens plateaus and exaggerates streaks.
 */
export const DEFAULT_CHART_SCALE_MODE: ChartScaleMode = "time";
