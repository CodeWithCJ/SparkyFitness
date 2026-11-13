import { SINCE_START_MAX_DAYS_AGO } from './since.ts';
import {
  COMPARE_METRICS,
  offeredInMode,
  type CompareMetricKey,
} from './metrics.ts';
import {
  COMPARE_SPAN_DAYS,
  DEFAULT_COMPARE_SPAN,
  MAX_CUSTOM_DAYS,
  type CompareSpan,
  type CompareSpanMode,
} from './spans.ts';
import { addDays, compareDays, daysBetween } from '../utils/timezone.ts';

export type CompareMode = 'day' | 'week' | 'since';
export type CompareTimingChoice =
  'sameDay' | 'nextDay' | 'dayBefore' | 'sameWeek' | 'nextWeek' | 'sinceHabit';

export interface CompareQuestion {
  a: CompareMetricKey;
  b: CompareMetricKey;
  choice: CompareTimingChoice;
}

/** How a choice pairs the two: by the day or week with a lag, or before vs. since a start. */
export type CompareChoiceTiming =
  { mode: CompareSpanMode; timing: -1 | 0 | 1 } | { mode: 'since'; timing: 0 };

const TIMINGS: Record<CompareTimingChoice, CompareChoiceTiming> = {
  dayBefore: { mode: 'day', timing: -1 },
  sameDay: { mode: 'day', timing: 0 },
  nextDay: { mode: 'day', timing: 1 },
  sameWeek: { mode: 'week', timing: 0 },
  nextWeek: { mode: 'week', timing: 1 },
  sinceHabit: { mode: 'since', timing: 0 },
};

export function timingOf(choice: CompareTimingChoice): CompareChoiceTiming {
  return TIMINGS[choice];
}

/** The server leaves today out itself, so the window simply ends today. */
export function compareWindow(
  span: CompareSpan,
  mode: CompareSpanMode,
  today: string,
  custom?: { startDate: string; endDate: string } | null
): { startDate: string; endDate: string } {
  if (span === 'custom' && custom) {
    const maxDays = MAX_CUSTOM_DAYS[mode];
    const days = daysBetween(custom.startDate, custom.endDate) + 1;
    return {
      startDate:
        days > maxDays
          ? addDays(custom.endDate, -(maxDays - 1))
          : custom.startDate,
      endDate: custom.endDate,
    };
  }
  const key = span === 'custom' ? DEFAULT_COMPARE_SPAN[mode] : span;
  const days = COMPARE_SPAN_DAYS[key];
  return { startDate: addDays(today, -(days - 1)), endDate: today };
}

/** The days a since question can start on: as far back as the server takes (730 days) to yesterday. */
export function sinceStartBounds(today: string): { min: string; max: string } {
  return {
    min: addDays(today, -SINCE_START_MAX_DAYS_AGO),
    max: addDays(today, -1),
  };
}

/** A picked start kept inside those bounds, so one that has aged out is not refused. */
export function clampSinceStart(day: string, today: string): string {
  const { min, max } = sinceStartBounds(today);
  if (compareDays(day, min) < 0) return min;
  if (compareDays(day, max) > 0) return max;
  return day;
}

// Sleep is dated by the wake day, so caffeine "that night" is timing +1.
export const SUGGESTED_QUESTIONS: readonly CompareQuestion[] = [
  { a: 'timeAsleep', b: 'energy', choice: 'sameDay' },
  { a: 'meditated', b: 'mood', choice: 'sameDay' },
  { a: 'caffeine', b: 'timeAsleep', choice: 'nextDay' },
  { a: 'trainingLoad', b: 'overnightHrv', choice: 'nextDay' },
];

const MAX_RECENT = 5;

export function isCompareMetricKey(value: unknown): value is CompareMetricKey {
  return typeof value === 'string' && Object.hasOwn(COMPARE_METRICS, value);
}

function isTimingChoice(value: unknown): value is CompareTimingChoice {
  return typeof value === 'string' && Object.hasOwn(TIMINGS, value);
}

/**
 * The stored questions this build still knows. Recents are persisted on the
 * device, so a metric or timing renamed or removed since is dropped here
 * rather than reaching the copy, which would throw on it. A question whose
 * metric isn't offered in its mode (weight trend since a habit) is dropped too.
 */
export function knownCompareQuestions(stored: unknown): CompareQuestion[] {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((item: unknown): CompareQuestion[] => {
    if (typeof item !== 'object' || item === null) return [];
    const { a, b, choice } = item as Record<string, unknown>;
    if (
      !isCompareMetricKey(a) ||
      !isCompareMetricKey(b) ||
      !isTimingChoice(choice)
    ) {
      return [];
    }
    const { mode } = timingOf(choice);
    return offeredInMode(a, mode) && offeredInMode(b, mode)
      ? [{ a, b, choice }]
      : [];
  });
}

export function withRecentQuestion(
  recent: readonly CompareQuestion[],
  q: CompareQuestion
): CompareQuestion[] {
  const rest = knownCompareQuestions(recent).filter(
    (r) => !(r.a === q.a && r.b === q.b && r.choice === q.choice)
  );
  return [q, ...rest].slice(0, MAX_RECENT);
}

/** Drops any chosen metric the question's mode doesn't offer (no weekly form by the week, no weight trend since a habit started). */
export function questionForMode(
  question: Partial<CompareQuestion>,
  mode: CompareMode
): Partial<CompareQuestion> {
  const keep = (key?: CompareMetricKey) =>
    key && offeredInMode(key, mode) ? key : undefined;
  return { ...question, a: keep(question.a), b: keep(question.b) };
}

export function isAskable(q: Partial<CompareQuestion>): q is CompareQuestion {
  const { a, b, choice } = q;
  if (!a || !b || !choice || a === b) return false;
  const { mode } = timingOf(choice);
  return offeredInMode(a, mode) && offeredInMode(b, mode);
}
