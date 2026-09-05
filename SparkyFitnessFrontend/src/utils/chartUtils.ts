/**
 * Chart utilities for improving readability
 * Implements auto-scaling y-axis with smart domain calculation
 * Addresses Issue #144: Improve plot readability
 */

import type { MouseHandlerDataParam, TickItem, XAxisProps } from 'recharts';
import type { ChartScaleMode } from '@workspace/shared';

export interface ChartDataPoint {
  [key: string]: number | string | boolean | null | undefined;
  date?: string;
  entry_date?: string;
}

/**
 * Calculate smart Y-axis domain for better chart readability
 * @param data Array of data points
 * @param dataKey The key to extract values from
 * @param options Configuration options
 * @returns [min, max] domain array or undefined for auto-scaling
 */
export function calculateSmartYAxisDomain(
  data: ChartDataPoint[],
  dataKey: string,
  options: {
    marginPercent?: number; // Default: 10% margin
    useZeroBaseline?: boolean; // Force zero baseline
    minRangeThreshold?: number; // If range is small relative to max, use zero baseline
    forceMin?: number; // Force a specific minimum value for the Y-axis
  } = {}
): [number, number] | [number, string] | undefined {
  const { marginPercent = 0.1, useZeroBaseline = false, forceMin } = options;

  if (!data || data.length === 0) {
    return undefined;
  }

  // Extract valid numeric values
  const values = data
    .map((item) => (typeof item[dataKey] === 'number' ? item[dataKey] : null))
    .filter((val): val is number => val !== null && !isNaN(val));

  if (values.length === 0) {
    return undefined;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  // If all values are the same, use a small range around the value
  if (range === 0) {
    const value = values[0];
    if (value) {
      return value === 0 ? [0, 1] : [value * 0.95, value * 1.05];
    }
  }

  // Use min-max with margin for better visibility of trends
  const margin = range * marginPercent;
  let domainMin = min - margin;
  const domainMax = max + margin;

  if (forceMin !== undefined) {
    domainMin = forceMin;
  } else if (useZeroBaseline) {
    domainMin = Math.min(0, domainMin); // Ensure it starts at 0 or below if useZeroBaseline is true
  } else {
    // If not using zero baseline, and min is positive, ensure domainMin doesn't go negative
    if (min >= 0 && domainMin < 0) {
      domainMin = 0;
    }
  }

  return [domainMin, domainMax];
}

/**
 * Filter out current incomplete day from nutrition data
 * @param data Array of nutrition data points
 * @param currentDate Current date string (YYYY-MM-DD)
 * @returns Filtered data array excluding current day
 */
export function excludeIncompleteDay<T extends ChartDataPoint>(
  data: T[],
  currentDate: string
): T[] {
  if (!data || data.length === 0) {
    return data;
  }

  const today = new Date(currentDate).toDateString();

  return data.filter((item) => {
    const itemDate = item.date || item.entry_date;
    if (!itemDate) return true;

    // Convert item date to same format for comparison
    const itemDateObj = new Date(itemDate);
    return itemDateObj.toDateString() !== today;
  });
}

/**
 * Get chart configuration for different metric types
 * @param dataKey The metric key
 * @returns Configuration object with scaling preferences
 */
export function getChartConfig(dataKey: string) {
  const weightMetrics = [
    'weight',
    'neck',
    'waist',
    'hips',
    'height',
    'body_fat_percentage',
    'muscle_mass_kg',
    'bone_mass_kg',
    'body_water_percentage',
    'bmr',
  ];
  const nutritionMetrics = ['calories', 'protein', 'carbs', 'fat'];
  const vitaminMetrics = ['vitamin_a', 'vitamin_c', 'calcium', 'iron'];

  if (weightMetrics.includes(dataKey.toLowerCase())) {
    return {
      useSmartScaling: true,
      excludeIncompleteDay: false,
      useZeroBaseline: false, // Explicitly set to false for weight charts
      marginPercent: 0.05, // Smaller margin for body measurements
      minRangeThreshold: 0.2, // More likely to use min-max scaling
      forceMin: undefined as unknown, // Will be set dynamically in MeasurementChartsGrid
    };
  }

  if (nutritionMetrics.includes(dataKey.toLowerCase())) {
    return {
      useSmartScaling: true,
      excludeIncompleteDay: false,
      marginPercent: 0.1,
      minRangeThreshold: 0.3,
    };
  }

  if (vitaminMetrics.includes(dataKey.toLowerCase())) {
    return {
      useSmartScaling: true,
      excludeIncompleteDay: false,
      marginPercent: 0.15, // Larger margin for micronutrients
      minRangeThreshold: 0.4,
    };
  }

  // Default configuration
  return {
    useSmartScaling: true,
    excludeIncompleteDay: false,
    marginPercent: 0.1,
    minRangeThreshold: 0.3,
  };
}

/* -------------------------------------------------------------------------- */
/*  Time-scaled date axes                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Sync group shared by the charts on the Reports page, so hovering one of them
 * highlights the matching date on all the others.
 *
 * The value is deliberately the historical `nutrition-charts` string even
 * though the group now spans sleep, measurements and body battery too: every
 * chart in a group has to agree on it, so renaming is an all-at-once change
 * that belongs in its own commit rather than riding along with this one.
 */
export const REPORTS_CHART_SYNC_ID = 'nutrition-charts';

/**
 * Smallest value an all-digit string may have before it is read as epoch
 * milliseconds. 1e11 ms is 1973-03-03 — far below anything this app plots, and
 * far above the two shapes that would otherwise be silently misread: a compact
 * `YYYYMMDD` day (~2.0e7, which would land in 1970) and a bare year (~2.0e3).
 */
const MIN_EPOCH_MS = 1e11;

const CALENDAR_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The only string shapes we hand to `new Date`: a calendar day, optionally
 * followed by a time and offset.
 *
 * `new Date` falls back to a very lenient parser when a string is not ISO, and
 * that parser invents dates out of ordinary categorical labels — `new Date`
 * turns `'Week 3'` into 2001-02-28. On a non-date axis that would silently
 * mis-sync every tooltip, so anything that is not plainly ISO is refused.
 */
const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Parses whatever a chart axis hands us into epoch milliseconds.
 *
 * Returns `null` rather than a `0` sentinel when the value is not a date, so
 * callers can tell "the epoch" apart from "not a date at all".
 */
export function parseDateToTimestamp(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // Recharts stringifies numeric axis labels, so a timestamp comes back as
  // e.g. "1767225600000". Only accept digit strings that are plausibly epoch
  // milliseconds — see MIN_EPOCH_MS for what this is protecting against.
  if (/^\d+$/.test(trimmed)) {
    const asNumber = Number(trimmed);
    return asNumber >= MIN_EPOCH_MS ? asNumber : null;
  }

  if (!ISO_DATE_PATTERN.test(trimmed)) {
    return null;
  }

  // A bare calendar day is pinned to *local* midnight on purpose:
  // `formatDateInUserTimezone` recognises a local-midnight Date as a literal
  // day and skips timezone projection, so the tick label always reads back as
  // the day that was stored, whatever timezone the viewer or their preference
  // is in.
  const parsed = new Date(
    CALENDAR_DAY_PATTERN.test(trimmed) ? trimmed + 'T00:00:00' : trimmed
  );
  const timestamp = parsed.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export type WithTimestamp<T> = T & { timestamp: number | null };

/**
 * Attaches a numeric `timestamp` to each row so a chart can lay it out on a
 * continuous time axis.
 *
 * Rows come back in chronological order either way. On a categorical axis the
 * array order *is* the axis order, so a date series handed over in insertion
 * order would draw its points out of sequence — which is a bug, not a caller
 * preference worth preserving.
 *
 * The modes differ only in what happens to a row we cannot date: `time` needs a
 * coordinate and drops it, `point` keeps it at the end. The timestamp is
 * attached in both modes, because tooltip synchronisation matches on it.
 */
export function prepareTimeChartData<T extends object>(
  data: readonly T[] | null | undefined,
  chartScaleMode: ChartScaleMode,
  dateKey: string = 'date'
): WithTimestamp<T>[] {
  if (!data || data.length === 0) {
    return [];
  }

  const prepared: WithTimestamp<T>[] = data.map((item) => ({
    ...item,
    // Rows arrive as ordinary typed interfaces, which carry no index
    // signature; this cast is what lets one be read by a runtime key name.
    timestamp: parseDateToTimestamp((item as Record<string, unknown>)[dateKey]),
  }));

  if (chartScaleMode === 'time') {
    return prepared
      .filter(
        (item): item is WithTimestamp<T> & { timestamp: number } =>
          item.timestamp !== null
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  // Sort is stable, so undateable rows keep their relative order at the end.
  return prepared.sort((a, b) => {
    if (a.timestamp === null) {
      return b.timestamp === null ? 0 : 1;
    }
    if (b.timestamp === null) {
      return -1;
    }
    return a.timestamp - b.timestamp;
  });
}

/**
 * Builds a tick formatter that renders both axis shapes — the numeric
 * timestamps of `time` mode and the raw day strings of `point` mode — through
 * the same date formatter, so the labels read identically either way.
 *
 * `formatDate` is the app's `formatDateInUserTimezone`; it is injected rather
 * than imported to keep this module free of React context.
 */
export function createDateTickFormatter(
  formatDate: (date: Date | string, formatStr?: string) => string,
  pattern: string = 'MMM dd'
): (value: unknown) => string {
  return (value) => {
    if (typeof value === 'number') {
      return formatDate(new Date(value), pattern);
    }
    if (typeof value === 'string' && value.trim()) {
      return formatDate(value, pattern);
    }
    return '';
  };
}

export interface TimeXAxisOptions {
  chartScaleMode: ChartScaleMode;
  /** Normally `formatDateInUserTimezone` from `usePreferences()`. */
  formatDate: (date: Date | string, formatStr?: string) => string;
  /** date-fns pattern for tick labels. */
  pattern?: string;
  /** Row property holding the raw day string, used in `point` mode. */
  dateKey?: string;
  /** Row property written by `prepareTimeChartData`, used in `time` mode. */
  timestampKey?: string;
}

export type TimeXAxisProps = Pick<
  XAxisProps,
  'type' | 'dataKey' | 'domain' | 'scale' | 'tickFormatter'
>;

/**
 * XAxis props for the current scale mode, ready to spread onto `<XAxis />`.
 *
 * `point` mode deliberately omits `domain` and `scale` instead of passing
 * `undefined`: spreading an explicit `undefined` would wipe out any value the
 * call site set for itself.
 */
export function getTimeXAxisProps(options: TimeXAxisOptions): TimeXAxisProps {
  const {
    chartScaleMode,
    formatDate,
    pattern,
    dateKey = 'date',
    timestampKey = 'timestamp',
  } = options;

  const tickFormatter = createDateTickFormatter(formatDate, pattern);

  if (chartScaleMode === 'time') {
    return {
      type: 'number',
      dataKey: timestampKey,
      domain: ['dataMin', 'dataMax'],
      scale: 'time',
      tickFormatter,
    };
  }

  return {
    type: 'category',
    dataKey: dateKey,
    tickFormatter,
  };
}

/**
 * Width cap, in pixels, for bars sitting on a continuous time axis.
 *
 * On a categorical axis Recharts derives bar width from the band it owns, which
 * is one slot per entry. A time axis has no bands, so it falls back to the
 * smallest gap between *axis ticks* — and a time scale only emits about five of
 * those, whatever the data. That makes the implied band roughly a fifth of the
 * plot, and bars come out around 80px wide, overlapping their neighbours.
 *
 * Capping the width fixes it without breaking alignment: Recharts positions a
 * bar on a numeric axis at `scaled - bandSize / 2 + offset`, and the offset it
 * computes keeps a narrowed bar centred on its own data point.
 */
export const TIME_AXIS_MAX_BAR_SIZE = 24;

/**
 * The `maxBarSize` a bar chart should use for the current scale mode.
 *
 * Returns `undefined` in `point` mode so the categorical layout keeps sizing
 * bars the way it always has — capping there would visibly thin the bars of a
 * short range, which is a regression rather than a fix.
 */
export function getTimeAwareMaxBarSize(
  chartScaleMode: ChartScaleMode
): number | undefined {
  return chartScaleMode === 'time' ? TIME_AXIS_MAX_BAR_SIZE : undefined;
}

export type TimeSyncMethod = (
  ticks: ReadonlyArray<TickItem>,
  param: MouseHandlerDataParam
) => number;

/**
 * Builds a Recharts `syncMethod` that pairs points up by *date* rather than by
 * position in the data array.
 *
 * Recharts' own `syncMethod="value"` compares labels with `String(a) === b`, so
 * it only lines up charts sampled on exactly the same days. Series here are
 * not: weight might be logged twice a week against daily calories. This matches
 * the nearest point in time instead.
 *
 * Call it once per chart and memoise the result with `useMemo(..., [])` — it
 * runs on every mouse move for every chart in the sync group, and it keeps a
 * parse cache that is only worth anything if the function survives re-renders.
 */
export function createTimeSyncMethod(): TimeSyncMethod {
  // Axis labels repeat on every mouse move, and parsing one is a regex plus a
  // Date construction. Cache by raw value; the key space is bounded by the
  // number of distinct dates on screen.
  const timestampCache = new Map<string | number, number | null>();

  const parse = (value: unknown): number | null => {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return parseDateToTimestamp(value);
    }
    const cached = timestampCache.get(value);
    if (cached !== undefined) {
      return cached;
    }
    const parsed = parseDateToTimestamp(value);
    timestampCache.set(value, parsed);
    return parsed;
  };

  return (ticks, param) => {
    if (!ticks || ticks.length === 0) {
      return -1;
    }

    const target = parse(param?.activeLabel);

    if (target === null) {
      // Nothing hovered, or an axis that is not dates at all. Defer to the
      // index Recharts already worked out rather than guessing a position.
      const fallback = param?.activeTooltipIndex ?? param?.activeIndex;
      return typeof fallback === 'number' &&
        fallback >= 0 &&
        fallback < ticks.length
        ? fallback
        : -1;
    }

    let closestIndex = -1;
    let smallestDiff = Infinity;

    for (let i = 0; i < ticks.length; i++) {
      const tickTimestamp = parse(ticks[i]?.value);
      if (tickTimestamp === null) {
        continue;
      }
      const diff = Math.abs(tickTimestamp - target);
      if (diff < smallestDiff) {
        smallestDiff = diff;
        closestIndex = i;
      }
    }

    // -1 means "nothing to highlight", which Recharts handles by clearing the
    // synced tooltip. That is the honest answer when this chart carries no
    // dated ticks; returning 0 would light up an unrelated first point.
    return closestIndex;
  };
}
