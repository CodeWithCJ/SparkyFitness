import type { TFunction } from 'i18next';
import type { Segment } from '../components/SegmentedControl';
import { addDays, getTodayDate } from './dateUtils';

export type TrendRange = '7d' | '30d' | '90d';

export const TREND_RANGE_DAYS: Record<TrendRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/** Inclusive `YYYY-MM-DD` bounds ending on `endDate` (today by default). */
export function trendRangeBounds(
  range: TrendRange,
  endDate: string = getTodayDate()
): {
  startDate: string;
  endDate: string;
} {
  return {
    startDate: addDays(endDate, -(TREND_RANGE_DAYS[range] - 1)),
    endDate,
  };
}

export const trendRangeSegments = (t: TFunction): Segment<TrendRange>[] => [
  { key: '7d', label: t('ranges.7d', { defaultValue: '7d' }) },
  { key: '30d', label: t('ranges.30d', { defaultValue: '30d' }) },
  { key: '90d', label: t('ranges.90d', { defaultValue: '90d' }) },
];

/** A report's window: one of the presets, or two days the user picked. */
export type ReportRange = TrendRange | 'custom';

export interface CustomRange {
  startDate: string;
  endDate: string;
}

/** The longest window a custom range may cover; longer ones are cut back to their end. */
export const MAX_CUSTOM_RANGE_DAYS = 180;

export interface ReportWindow {
  startDate: string;
  endDate: string;
  /** Calendar days in the window, inclusive. */
  days: number;
  /** The preset whose chart density suits `days`, for charts that only know 7d/30d/90d. */
  chartRange: TrendRange;
}

const dayCount = (startDate: string, endDate: string): number => {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  return (
    Math.round(
      (Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000
    ) + 1
  );
};

/** Orders and bounds a picked range: not after today, at most `MAX_CUSTOM_RANGE_DAYS` long. */
export function clampCustomRange(
  from: string,
  to: string,
  today: string = getTodayDate()
): CustomRange {
  let [startDate, endDate] = from <= to ? [from, to] : [to, from];
  if (endDate > today) endDate = today;
  if (startDate > endDate) startDate = endDate;
  if (dayCount(startDate, endDate) > MAX_CUSTOM_RANGE_DAYS) {
    startDate = addDays(endDate, -(MAX_CUSTOM_RANGE_DAYS - 1));
  }
  return { startDate, endDate };
}

const chartRangeFor = (days: number): TrendRange =>
  days <= 14 ? '7d' : days <= 45 ? '30d' : '90d';

/**
 * Resolves what a report should load. A preset ends today; `custom` uses the picked days
 * and falls back to 30 days until one has been picked.
 */
export function resolveReportWindow(
  range: ReportRange,
  custom: CustomRange | null,
  today: string = getTodayDate()
): ReportWindow {
  if (range === 'custom' && custom) {
    const { startDate, endDate } = clampCustomRange(
      custom.startDate,
      custom.endDate,
      today
    );
    const days = dayCount(startDate, endDate);
    return { startDate, endDate, days, chartRange: chartRangeFor(days) };
  }
  const preset: TrendRange = range === 'custom' ? '30d' : range;
  const { startDate, endDate } = trendRangeBounds(preset, today);
  return {
    startDate,
    endDate,
    days: TREND_RANGE_DAYS[preset],
    chartRange: preset,
  };
}
