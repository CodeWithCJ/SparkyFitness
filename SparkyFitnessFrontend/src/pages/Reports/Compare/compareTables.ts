import {
  addDays,
  COMPARE_METRICS,
  compareDigits,
  compareDisplayValue,
  pairedDots,
  timingOf,
  type CompareMetricKey,
  type CompareMode,
  type CompareQuestion,
  type CompareResponse,
  type CompareResult,
  type CompareTimingChoice,
} from '@workspace/shared';
import type { EnergyUnit } from '@workspace/shared';

export interface CompareDayRow {
  aKey: string;
  bKey: string;
  aRaw: number;
  aDev: number | null;
  bRaw: number;
  bDev: number | null;
}

/**
 * Whether a side has a "vs. your usual" deviation. A yes/no side by day has
 * none: its "deviation" is the raw 0/1 flag. By week it is a day count, which
 * does have one.
 */
export function hasDeviation(
  key: CompareMetricKey,
  mode: CompareMode
): boolean {
  return !(mode === 'day' && COMPARE_METRICS[key].kind === 'binary');
}

/**
 * One row per paired day (or week start), newest first. A side without a
 * deviation (`hasDeviation`) has a null one.
 */
export function dayRows(
  response: CompareResponse,
  q: CompareQuestion
): CompareDayRow[] {
  const chosen = timingOf(q.choice);
  if (chosen.mode === 'since') return [];
  const { mode, timing } = chosen;
  const shift = mode === 'week' ? 7 * timing : timing;
  const rows: CompareDayRow[] = [];
  for (const dot of pairedDots(response, mode, timing)) {
    const bKey = addDays(dot.key, shift);
    const aRaw = response.a.values[dot.key];
    const bRaw = response.b.values[bKey];
    if (aRaw === undefined || bRaw === undefined) continue;
    rows.push({
      aKey: dot.key,
      bKey,
      aRaw,
      aDev: hasDeviation(q.a, mode) ? dot.x : null,
      bRaw,
      bDev: hasDeviation(q.b, mode) ? dot.y : null,
    });
  }
  return rows.sort((p, r) => (p.aKey < r.aKey ? 1 : p.aKey > r.aKey ? -1 : 0));
}

export interface CompareTimingRow {
  choice: CompareTimingChoice;
  timing: -1 | 0 | 1;
  status: 'loading' | 'error' | 'not_enough' | 'ok';
  strength: number | null;
  method: CompareResult['method'] | null;
  linked: boolean;
  isAsked: boolean;
}

const DAY_CHOICES: readonly CompareTimingChoice[] = [
  'dayBefore',
  'sameDay',
  'nextDay',
];
const WEEK_CHOICES: readonly CompareTimingChoice[] = ['sameWeek', 'nextWeek'];

function strengthOf(
  q: CompareQuestion,
  result: CompareResult,
  energyUnit: EnergyUnit
): number | null {
  if (result.method === 'difference') {
    if (!result.binary) return null;
    const outcome = result.binary.yesKey === q.a ? q.b : q.a;
    return compareDisplayValue(outcome, result.binary.diff, energyUnit);
  }
  return result.r ?? null;
}

/** One row per timing in order; a failed or thin timing stays as its own row. */
export function timingRows(
  q: CompareQuestion,
  answers: {
    timing: -1 | 0 | 1;
    data?: CompareResponse;
    isLoading: boolean;
    isError: boolean;
  }[],
  energyUnit: EnergyUnit = 'kcal'
): CompareTimingRow[] {
  const chosen = timingOf(q.choice);
  if (chosen.mode === 'since') return [];
  const choices = chosen.mode === 'week' ? WEEK_CHOICES : DAY_CHOICES;
  return choices.map((choice) => {
    const { timing } = timingOf(choice);
    const answer = answers.find((a) => a.timing === timing);
    const base = {
      choice,
      timing,
      strength: null,
      method: null,
      linked: false,
      isAsked: choice === q.choice,
    } satisfies Omit<CompareTimingRow, 'status'>;
    if (!answer || answer.isLoading) return { ...base, status: 'loading' };
    if (answer.isError) return { ...base, status: 'error' };
    if (!answer.data) return { ...base, status: 'loading' };
    const { result } = answer.data;
    if (result.status === 'not_enough')
      return { ...base, status: 'not_enough' };
    return {
      ...base,
      status: 'ok',
      strength: strengthOf(q, result, energyUnit),
      method: result.method ?? null,
      linked: result.linked ?? false,
    };
  });
}

/** Bar widths 0-1: |r| for correlations, |diff| over the largest |diff| for differences. */
export function timingBarWidths(rows: CompareTimingRow[]): number[] {
  const maxDiff = Math.max(
    0,
    ...rows
      .filter((r) => r.method === 'difference' && r.strength !== null)
      .map((r) => Math.abs(r.strength ?? 0))
  );
  return rows.map((r) => {
    if (r.strength === null) return 0;
    if (r.method === 'difference') {
      return maxDiff === 0 ? 0 : Math.abs(r.strength) / maxDiff;
    }
    return Math.min(1, Math.abs(r.strength));
  });
}

/**
 * A timing row's strength as text, signed: r to two decimals for a
 * correlation, the gap on the outcome's display scale (already converted by
 * `timingRows`) for a difference.
 */
export function timingStrengthText(
  q: CompareQuestion,
  row: CompareTimingRow,
  locale?: string
): string {
  if (row.strength === null) return '';
  const outcome = COMPARE_METRICS[q.a].kind === 'binary' ? q.b : q.a;
  const digits = row.method === 'difference' ? compareDigits(outcome) : 2;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: 'exceptZero',
  }).format(row.strength);
}
