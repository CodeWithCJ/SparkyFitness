import type { ZodError } from 'zod';
import { addDays, todayInZone } from '@workspace/shared';
import { formatZodError } from './errors.js';

// Helpers for multi-action tools that publish one flat input schema (every
// action's arguments) but parse each action with a `.strict()` schema. A model
// that sends an argument meant for another action (#3340, #3713) would
// otherwise get a bare "Unrecognized key" error and often burn its step budget
// guessing. The rules:
//
// - A key is reconciled only when its meaning is preserved: a date that is
//   today on an action that always answers for today, or a date range ending
//   today that is the same thing as a trailing window. A key that would change
//   the answer is never dropped (maintainer review on #3341).
// - Anything else is rejected with the keys the chosen action does accept, so
//   the retry can succeed on the first try.

type Args = Record<string, unknown>;

interface ActionUnion {
  options: ReadonlyArray<unknown>;
}

/**
 * The keys an action of a discriminated union accepts besides `action`, or
 * null when the action is unknown or an option is not a plain object schema.
 */
export function acceptedActionKeys(
  union: ActionUnion,
  action: unknown
): string[] | null {
  for (const option of union.options) {
    const shape = (option as { shape?: Record<string, unknown> }).shape;
    const literal = (shape?.action as { value?: unknown } | undefined)?.value;
    if (shape && literal === action) {
      return Object.keys(shape).filter((key) => key !== 'action');
    }
  }
  return null;
}

/**
 * A VALIDATION error that, when the call carried keys the action rejects,
 * names the keys that action accepts. Rejected date keys also get the user's
 * current date, since a model often assumes its own (UTC) day.
 */
export function formatActionZodError(
  error: ZodError,
  union: ActionUnion,
  action: unknown,
  tz: string
): string {
  const base = formatZodError(error);
  const unknownKeys = error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys' ? issue.keys : []
  );
  const accepted =
    unknownKeys.length > 0 ? acceptedActionKeys(union, action) : null;
  if (!accepted) return base;
  const parts = [
    accepted.length === 0
      ? `Action '${String(action)}' takes no parameters besides action.`
      : `Action '${String(action)}' accepts only: ${accepted.join(', ')}.`,
    'Call again without the other keys only if the answer still fits what the user asked; otherwise tell the user this action does not support them.',
  ];
  if (unknownKeys.some((key) => key.includes('date'))) {
    parts.push(`Today is ${todayInZone(tz)} in the user's timezone.`);
  }
  return `${base}\n\nSuggestion: ${parts.join(' ')}`;
}

/** A real calendar day as YYYY-MM-DD (rejects 2026-13-45 and 2026-02-31). */
const isDay = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

/** Whole days from `from` to `to`, counting both ends. */
function inclusiveDays(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

/**
 * Drops each of `keys` whose value is today's date, for an action that always
 * answers for today, so the key cannot change the result.
 */
export function dropTodayDates(args: Args, keys: string[], tz: string): void {
  const today = todayInZone(tz);
  for (const key of keys) {
    if (args[key] === today) delete args[key];
  }
}

/**
 * For an action that takes a trailing `window_days` ending today: a
 * start_date..end_date range ending today (end_date may be omitted) is the
 * same request. It becomes the window when none was given, or is dropped when
 * it matches the given one. A range that ends on another day, falls outside
 * `bounds`, or disagrees with window_days is left for validation to reject.
 */
export function rangeToWindow(
  args: Args,
  tz: string,
  bounds: { min: number; max: number }
): void {
  if (!('start_date' in args) && !('end_date' in args)) return;
  const today = todayInZone(tz);
  if ((args.end_date ?? today) !== today) return;
  if (!('start_date' in args)) {
    delete args.end_date;
    return;
  }
  if (!isDay(args.start_date)) return;
  const span = inclusiveDays(args.start_date, today);
  if (!Number.isInteger(span) || span < bounds.min || span > bounds.max) {
    return;
  }
  if (args.window_days === undefined) {
    args.window_days = span;
  } else if (Number(args.window_days) !== span) {
    return;
  }
  delete args.start_date;
  delete args.end_date;
}

// Longest window_days turned into a date range: ten years. Anything longer is
// left for validation to reject instead of becoming an unbounded scan.
const MAX_WINDOW_TO_RANGE_DAYS = 3660;

/**
 * For an action that takes a start_date..end_date range: `window_days` with
 * no dates is the range of that many days ending today. It is dropped when
 * the dates given are exactly that range (a missing end_date counts as today).
 */
export function windowToRange(args: Args, tz: string): void {
  if (!('window_days' in args)) return;
  const days = Number(args.window_days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_WINDOW_TO_RANGE_DAYS) {
    return;
  }
  const today = todayInZone(tz);
  const start = addDays(today, -(days - 1));
  if (!('start_date' in args) && !('end_date' in args)) {
    args.start_date = start;
    args.end_date = today;
  } else if (args.start_date !== start || (args.end_date ?? today) !== today) {
    return;
  }
  delete args.window_days;
}

/**
 * Names of the keys whose value differs between a snapshot and the reconciled
 * args, for logging. Values are left out: some (search_keyword) are user text.
 */
export function changedKeys(before: Args, after: Args): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => before[key] !== after[key]
  );
}
