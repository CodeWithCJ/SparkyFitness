import { Platform } from 'react-native';
import { getAppLocale, formatLocalizedNumber } from '../../localization';
import { matchFont } from '@shopify/react-native-skia';

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });

/** Skia label font shared by the dashboard/wellness charts. */
export const makeChartFont = (fontSize: number) =>
  matchFont({ fontFamily, fontSize });

/**
 * Axis label size for the dashboard trend charts. Skia text ignores the OS font-size
 * setting, so any chart drawing its axis with React Native `<Text>` instead has to pin
 * this size and pass `allowFontScaling={false}` — otherwise its labels grow past the
 * ones beside them in the pager and truncate.
 */
export const CHART_LABEL_FONT_SIZE = 12;

export const formatXLabel7d = (day: string): string => {
  if (typeof day !== 'string') return '';
  const [year, month, d] = day.split('-').map(Number);
  const date = new Date(year, month - 1, d);
  return date.toLocaleDateString(getAppLocale(), { weekday: 'short' });
};

export const formatXLabel30d90d = (day: string): string => {
  if (typeof day !== 'string') return '';
  const [year, month, d] = day.split('-').map(Number);
  const date = new Date(year, month - 1, d);
  return date.toLocaleDateString(getAppLocale(), {
    month: 'short',
    day: 'numeric',
  });
};

export const formatTooltipDate = (day: string): string => {
  const parts = day.split('-');
  if (parts.length < 3) return day;
  const [year, month, d] = parts.map(Number);
  const date = new Date(year, (month || 1) - 1, d || 1);
  return date.toLocaleDateString(getAppLocale(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

/** Formats chart tick values according to the active application locale. */
export const formatChartYLabel = (value: number): string =>
  value >= 1000
    ? new Intl.NumberFormat(getAppLocale(), {
        notation: 'compact',
        maximumFractionDigits: 0,
      }).format(value)
    : formatLocalizedNumber(value);

export const CHART_Y_TICK_COUNT = 5;

/**
 * Heckbert's "nice numbers for graph labels": snaps `value` to the nearest 1, 2, 5, or 10
 * times a power of ten. `round` picks the closest of those candidates; the non-rounding mode
 * picks the smallest candidate that is still >= `value`, which is what a range needs so it
 * never under-covers the data it was measured from.
 */
function niceNumber(value: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
}

export type NiceYAxisScale = {
  min: number;
  max: number;
  tickValues: number[];
};

/** The fewest labeled gridlines a user needs to read the shown range at a glance. */
const MIN_TICK_VALUES = 3;

function buildNiceScale(
  minValue: number,
  safeMax: number,
  step: number
): NiceYAxisScale {
  const min = Math.floor(minValue / step) * step;
  const max = Math.ceil(safeMax / step) * step;

  const tickValues: number[] = [];
  for (let tick = min; tick <= max + step / 2; tick += step) {
    tickValues.push(Math.round(tick));
  }

  return { min, max, tickValues };
}

/** Steps one rung down the 1/2/5/10-per-decade ladder, e.g. 1000 -> 500 -> 200 -> 100. */
function niceStepBelow(step: number): number {
  const exponent = Math.floor(Math.log10(step));
  const fraction = step / 10 ** exponent;
  if (fraction > 5) return 5 * 10 ** exponent;
  if (fraction > 2) return 2 * 10 ** exponent;
  if (fraction > 1) return 1 * 10 ** exponent;
  return 5 * 10 ** (exponent - 1);
}

/**
 * A y-axis scale whose bounds and tick values are all whole numbers on a nice round step
 * (the classic 1/2/5/10-per-decade progression) rather than an arbitrary even split of the
 * data range — so a hydration goal around 2000 ml labels in 500 ml steps instead of landing
 * on something like 879.5, and a weight range spanning a fraction of a unit still labels in
 * whole units instead of decimals.
 *
 * The resolved `[min, max]` always covers `[minValue, maxValue]`, so passing it back to the
 * chart's own domain keeps every tick — including the top one — inside the plotted area. It
 * also always resolves at least `MIN_TICK_VALUES` ticks: a single reading, or a goal sitting
 * close to the data, would otherwise collapse to one or two labels — not enough for a user to
 * read the shown range at a glance — so the step keeps shrinking (and, once it can't shrink
 * below a whole number, the top of the range keeps widening instead) until there are enough.
 */
export function computeNiceYAxisScale(
  minValue: number,
  maxValue: number,
  tickCount: number = CHART_Y_TICK_COUNT
): NiceYAxisScale {
  // A flat or near-flat series still needs at least one whole-number step to label.
  const safeMax = Math.max(maxValue, minValue + 1);
  const range = niceNumber(safeMax - minValue, false);
  let step = Math.max(niceNumber(range / Math.max(tickCount - 1, 1), true), 1);

  let scale = buildNiceScale(minValue, safeMax, step);

  while (scale.tickValues.length < MIN_TICK_VALUES) {
    if (step > 1) {
      step = niceStepBelow(step);
      scale = buildNiceScale(minValue, safeMax, step);
    } else {
      scale = buildNiceScale(minValue, scale.max + step, step);
    }
  }

  return scale;
}
