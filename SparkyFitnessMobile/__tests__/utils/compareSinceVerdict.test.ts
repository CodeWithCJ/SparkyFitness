import {
  sinceAlreadyChanging,
  sinceCoversLastYear,
  sinceVerdictCase,
  type CompareSinceResult,
} from '@workspace/shared';

// The since verdict cases live in shared (shared/src/compare/sinceVerdict.ts)
// so the phone and the website pick the same answer; each words it itself.

const OK: CompareSinceResult = {
  status: 'ok',
  start: '2026-04-01',
  suggestedStart: '2026-04-01',
  before: {
    from: '2025-10-08',
    to: '2026-03-31',
    days: 175,
    valueDays: 160,
    mean: 58,
  },
  since: {
    from: '2026-04-01',
    to: '2026-10-20',
    days: 203,
    valueDays: 190,
    mean: 66,
  },
  line: 70,
  diff: 8,
  low: 3,
  high: 13,
  p: 0.004,
  changed: true,
  alreadyChanging: false,
};

/** A not-enough answer with only the counts on its stretches, as the server sends it. */
function short(
  reason: 'fewBefore' | 'fewSince',
  stretch: { days: number; valueDays: number }
): CompareSinceResult {
  const before = {
    from: '2025-10-08',
    to: '2026-03-31',
    days: 175,
    valueDays: 160,
  };
  const since = {
    from: '2026-04-01',
    to: '2026-10-20',
    days: 203,
    valueDays: 190,
  };
  return {
    status: 'not_enough',
    reason,
    start: '2026-04-01',
    suggestedStart: null,
    before: reason === 'fewBefore' ? { ...before, ...stretch } : before,
    since: reason === 'fewSince' ? { ...since, ...stretch } : since,
    line: 70,
  };
}

/** A start over a year ago: since is the last year, before the year before the start. */
const LAST_YEAR: Partial<CompareSinceResult> = {
  start: '2025-03-01',
  before: { ...OK.before!, from: '2024-03-01', to: '2025-02-28' },
  since: { ...OK.since!, from: '2025-10-21', to: '2026-10-20' },
};

describe('sinceVerdictCase', () => {
  test('no start, whether the server says so or sends none', () => {
    expect(
      sinceVerdictCase({
        status: 'not_enough',
        reason: 'noStart',
        start: null,
        suggestedStart: null,
        line: 70,
      })
    ).toEqual({ kind: 'noStart' });
    expect(sinceVerdictCase({ ...OK, start: null })).toEqual({
      kind: 'noStart',
    });
  });

  test('a start under four weeks ago is about the days since, whichever stretch the server names', () => {
    for (const reason of ['fewBefore', 'fewSince'] as const) {
      const result = short(reason, { days: 20, valueDays: 18 });
      result.since = { ...result.since!, days: 20, valueDays: 18 };
      expect(sinceVerdictCase(result)).toEqual({
        kind: 'notEnough',
        start: '2026-04-01',
        side: 'since',
        detail: { kind: 'shortSince', days: 20, needed: 28 },
      });
    }
  });

  test('enough values before but too short a stretch names the 28 days', () => {
    expect(
      sinceVerdictCase(short('fewBefore', { days: 20, valueDays: 20 }))
    ).toEqual({
      kind: 'notEnough',
      start: '2026-04-01',
      side: 'before',
      detail: { kind: 'shortBefore', days: 20, needed: 28 },
    });
  });

  test('too few values on the stretch the server names', () => {
    expect(
      sinceVerdictCase(short('fewBefore', { days: 175, valueDays: 9 }))
    ).toEqual({
      kind: 'notEnough',
      start: '2026-04-01',
      side: 'before',
      detail: { kind: 'fewValues', valueDays: 9, needed: 14 },
    });
    // A short since stretch is about its values, not the days before.
    expect(
      sinceVerdictCase(short('fewSince', { days: 203, valueDays: 3 }))
    ).toEqual({
      kind: 'notEnough',
      start: '2026-04-01',
      side: 'since',
      detail: { kind: 'fewValues', valueDays: 3, needed: 14 },
    });
  });

  test('a change carries both averages and the difference', () => {
    expect(sinceVerdictCase(OK)).toEqual({
      kind: 'changed',
      start: '2026-04-01',
      lastYear: false,
      before: 58,
      since: 66,
      diff: 8,
    });
  });

  test('no clear change, with or without both averages', () => {
    expect(sinceVerdictCase({ ...OK, changed: false })).toEqual({
      kind: 'noChange',
      start: '2026-04-01',
      lastYear: false,
      averages: { before: 58, since: 66 },
    });
    // A change without an average to show reads as no clear change.
    expect(
      sinceVerdictCase({ ...OK, since: { ...OK.since!, mean: undefined } })
    ).toEqual({
      kind: 'noChange',
      start: '2026-04-01',
      lastYear: false,
      averages: null,
    });
  });

  test('a start more than a year ago compares the last year', () => {
    expect(sinceVerdictCase({ ...OK, ...LAST_YEAR })).toMatchObject({
      kind: 'changed',
      start: '2025-03-01',
      lastYear: true,
    });
    expect(
      sinceVerdictCase({ ...OK, ...LAST_YEAR, changed: false })
    ).toMatchObject({ kind: 'noChange', lastYear: true });
  });
});

describe('sinceCoversLastYear', () => {
  test('only when the since stretch no longer begins at the start', () => {
    expect(sinceCoversLastYear(OK)).toBe(false);
    expect(sinceCoversLastYear({ ...OK, ...LAST_YEAR })).toBe(true);
    expect(sinceCoversLastYear({ ...OK, start: null })).toBe(false);
  });
});

describe('sinceAlreadyChanging', () => {
  test('the way the outcome was already moving, when the server flags it', () => {
    expect(sinceAlreadyChanging({ ...OK, alreadyChanging: true })).toBe('up');
    expect(
      sinceAlreadyChanging({ ...OK, alreadyChanging: true, diff: -0.4 })
    ).toBe('down');
  });

  test('none when not flagged or without a difference', () => {
    expect(sinceAlreadyChanging(OK)).toBeNull();
    expect(
      sinceAlreadyChanging({ ...OK, alreadyChanging: true, diff: undefined })
    ).toBeNull();
  });
});
