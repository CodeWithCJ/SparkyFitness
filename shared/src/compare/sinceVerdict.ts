// Which since answer to give, and the facts its wording needs. Text-free: each app words the case
// in its own catalog, so the phone and the website cannot drift on when each answer applies.

import {
  SINCE_STRETCH_MIN_DAYS,
  SINCE_STRETCH_MIN_VALUES,
  type CompareSinceResult,
} from './since.ts';

/** Why there is no answer yet, with the counts the explanation names. */
export type SinceNotEnoughDetail =
  /** The start is too recent: `days` since it, `needed` days for an answer. */
  | { kind: 'shortSince'; days: number; needed: number }
  /** Enough values before, but the records begin only `days` before the start. */
  | { kind: 'shortBefore'; days: number; needed: number }
  /** The stretch has `valueDays` days with a value, `needed` for an answer. */
  | { kind: 'fewValues'; valueDays: number; needed: number };

/** Averages are on the outcome's stored scale; `start` is a 'YYYY-MM-DD' day. */
export type SinceVerdictCase =
  | { kind: 'noStart' }
  | {
      kind: 'notEnough';
      start: string;
      side: 'before' | 'since';
      detail: SinceNotEnoughDetail;
    }
  | {
      kind: 'changed';
      start: string;
      lastYear: boolean;
      before: number;
      since: number;
      diff: number;
    }
  | {
      kind: 'noChange';
      start: string;
      lastYear: boolean;
      averages: { before: number; since: number } | null;
    };

/**
 * A start over a year ago: the since stretch is the last year, so it no longer begins at the
 * start, and the before stretch is the year before the start.
 */
export function sinceCoversLastYear(result: CompareSinceResult): boolean {
  return (
    result.start !== null &&
    result.since !== undefined &&
    result.since.from !== result.start
  );
}

/**
 * Why a since question has no answer yet. The server needs 28 days and 14 days with a value in
 * each stretch. Before is never longer than since, so a start under 28 days ago leaves both short:
 * that is about the days since the start, whichever stretch the server named. Otherwise the named
 * stretch is short of values, or (before only) the records begin too close to the start.
 */
function notEnoughCase(
  result: CompareSinceResult,
  start: string
): SinceVerdictCase {
  const { since } = result;
  if (since !== undefined && since.days < SINCE_STRETCH_MIN_DAYS) {
    return {
      kind: 'notEnough',
      start,
      side: 'since',
      detail: {
        kind: 'shortSince',
        days: since.days,
        needed: SINCE_STRETCH_MIN_DAYS,
      },
    };
  }
  const side = result.reason === 'fewBefore' ? 'before' : 'since';
  const stretch = result[side];
  const valueDays = stretch?.valueDays ?? 0;
  const length = stretch?.days ?? 0;
  const detail: SinceNotEnoughDetail =
    side === 'before' &&
    valueDays >= SINCE_STRETCH_MIN_VALUES &&
    length < SINCE_STRETCH_MIN_DAYS
      ? { kind: 'shortBefore', days: length, needed: SINCE_STRETCH_MIN_DAYS }
      : { kind: 'fewValues', valueDays, needed: SINCE_STRETCH_MIN_VALUES };
  return { kind: 'notEnough', start, side, detail };
}

/** The since answer to give: pick a start, not enough yet, changed, or no clear change. */
export function sinceVerdictCase(result: CompareSinceResult): SinceVerdictCase {
  if (result.reason === 'noStart' || result.start === null) {
    return { kind: 'noStart' };
  }
  const { start } = result;
  if (result.status === 'not_enough') return notEnoughCase(result, start);

  const { before, since, diff } = result;
  const averages =
    before?.mean === undefined || since?.mean === undefined
      ? null
      : { before: before.mean, since: since.mean };
  const lastYear = sinceCoversLastYear(result);
  if (result.changed && averages && diff !== undefined) {
    return { kind: 'changed', start, lastYear, ...averages, diff };
  }
  return { kind: 'noChange', start, lastYear, averages };
}

/** Which way the outcome was already moving before the start, when the server flags it. */
export function sinceAlreadyChanging(
  result: CompareSinceResult
): 'up' | 'down' | null {
  const { alreadyChanging, diff } = result;
  if (!alreadyChanging || diff === undefined) return null;
  return diff > 0 ? 'up' : 'down';
}
