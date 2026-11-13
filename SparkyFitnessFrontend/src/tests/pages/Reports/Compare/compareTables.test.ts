import type {
  CompareQuestion,
  CompareResponse,
  CompareResult,
} from '@workspace/shared';
import {
  dayRows,
  hasDeviation,
  timingBarWidths,
  timingRows,
  type CompareTimingRow,
} from '@/pages/Reports/Compare/compareTables';

function response(
  q: CompareQuestion,
  parts: {
    aValues?: Record<string, number>;
    bValues?: Record<string, number>;
    devA?: Record<string, number>;
    devB?: Record<string, number>;
    result?: Partial<CompareResult>;
  } = {}
): CompareResponse {
  return {
    a: { key: q.a, values: parts.aValues ?? {} },
    b: { key: q.b, values: parts.bValues ?? {} },
    through: '2026-10-21',
    deviations: { a: parts.devA ?? {}, b: parts.devB ?? {} },
    result: {
      status: 'ok',
      n: 30,
      needed: 14,
      checks: { ownNormal: true },
      ...parts.result,
    },
  };
}

const NEXT_DAY: CompareQuestion = {
  a: 'timeAsleep',
  b: 'energy',
  choice: 'nextDay',
};

describe('dayRows', () => {
  it("pairs A's day with B's next day for nextDay", () => {
    const rows = dayRows(
      response(NEXT_DAY, {
        aValues: { '2026-10-01': 420 },
        bValues: { '2026-10-02': 7 },
        devA: { '2026-10-01': -10 },
        devB: { '2026-10-02': 1.5 },
      }),
      NEXT_DAY
    );
    expect(rows).toEqual([
      {
        aKey: '2026-10-01',
        bKey: '2026-10-02',
        aRaw: 420,
        aDev: -10,
        bRaw: 7,
        bDev: 1.5,
      },
    ]);
  });

  it('pairs weeks seven days apart for nextWeek', () => {
    const q: CompareQuestion = { ...NEXT_DAY, choice: 'nextWeek' };
    const rows = dayRows(
      response(q, {
        aValues: { '2026-10-05': 400 },
        bValues: { '2026-10-12': 6 },
        devA: { '2026-10-05': 5 },
        devB: { '2026-10-12': -1 },
      }),
      q
    );
    expect(rows.map((r) => [r.aKey, r.bKey])).toEqual([
      ['2026-10-05', '2026-10-12'],
    ]);
  });

  it('gives a yes/no side no deviation', () => {
    const q: CompareQuestion = {
      a: 'meditated',
      b: 'energy',
      choice: 'sameDay',
    };
    const rows = dayRows(
      response(q, {
        aValues: { '2026-10-01': 1 },
        bValues: { '2026-10-01': 5 },
        devA: { '2026-10-01': 1 },
        devB: { '2026-10-01': 0.5 },
      }),
      q
    );
    expect(rows[0]?.aDev).toBeNull();
    expect(rows[0]?.bDev).toBe(0.5);
  });

  it('sorts newest first', () => {
    const q: CompareQuestion = { ...NEXT_DAY, choice: 'sameDay' };
    const rows = dayRows(
      response(q, {
        aValues: { '2026-10-01': 1, '2026-10-03': 3, '2026-10-02': 2 },
        bValues: { '2026-10-01': 1, '2026-10-03': 3, '2026-10-02': 2 },
        devA: { '2026-10-01': 1, '2026-10-03': 3, '2026-10-02': 2 },
        devB: { '2026-10-01': 1, '2026-10-03': 3, '2026-10-02': 2 },
      }),
      q
    );
    expect(rows.map((r) => r.aKey)).toEqual([
      '2026-10-03',
      '2026-10-02',
      '2026-10-01',
    ]);
  });
});

describe('hasDeviation', () => {
  it('leaves out only a yes/no side by day', () => {
    expect(hasDeviation('meditated', 'day')).toBe(false);
    expect(hasDeviation('meditated', 'week')).toBe(true);
    expect(hasDeviation('energy', 'day')).toBe(true);
    expect(hasDeviation('bedtime', 'week')).toBe(true);
  });
});

describe('timingRows', () => {
  const okAnswer = (timing: -1 | 0 | 1, r: number) => ({
    timing,
    data: response(NEXT_DAY, {
      result: { r, method: 'pearson', linked: true },
    }),
    isLoading: false,
    isError: false,
  });

  it('orders the day before, the same day and the next day and marks the asked one', () => {
    const rows = timingRows(NEXT_DAY, [
      okAnswer(1, 0.3),
      okAnswer(-1, 0.1),
      okAnswer(0, 0.2),
    ]);
    expect(rows.map((r) => r.choice)).toEqual([
      'dayBefore',
      'sameDay',
      'nextDay',
    ]);
    expect(rows.map((r) => r.isAsked)).toEqual([false, false, true]);
    expect(rows.map((r) => r.strength)).toEqual([0.1, 0.2, 0.3]);
    expect(rows[0]?.linked).toBe(true);
  });

  it('keeps a failed or not-enough timing as its own row', () => {
    const q: CompareQuestion = { ...NEXT_DAY, choice: 'sameDay' };
    const rows = timingRows(q, [
      { timing: -1, isLoading: false, isError: true },
      {
        timing: 0,
        data: response(q, { result: { r: 0.4, method: 'spearman' } }),
        isLoading: false,
        isError: false,
      },
      {
        timing: 1,
        data: response(q, { result: { status: 'not_enough' } }),
        isLoading: false,
        isError: false,
      },
    ]);
    expect(rows.map((r) => r.status)).toEqual(['error', 'ok', 'not_enough']);
    expect(rows.map((r) => r.isAsked)).toEqual([false, true, false]);
    expect(rows[0]?.strength).toBeNull();
  });

  it('reports a difference on the display scale', () => {
    const q: CompareQuestion = { a: 'meditated', b: 'mood', choice: 'sameDay' };
    const rows = timingRows(q, [
      {
        timing: 0,
        data: response(q, {
          result: {
            method: 'difference',
            binary: {
              yesKey: 'meditated',
              yesMean: 0,
              noMean: 0,
              yesCount: 5,
              noCount: 5,
              diff: -10,
            },
          },
        }),
        isLoading: false,
        isError: false,
      },
    ]);
    expect(rows.find((r) => r.choice === 'sameDay')?.strength).toBe(-1);
  });
});

describe('timingBarWidths', () => {
  const row = (
    method: CompareTimingRow['method'],
    strength: number | null
  ): CompareTimingRow => ({
    choice: 'sameDay',
    timing: 0,
    status: strength === null ? 'error' : 'ok',
    strength,
    method,
    linked: false,
    isAsked: false,
  });

  it('scales differences to the largest', () => {
    expect(
      timingBarWidths([
        row('difference', -2),
        row('difference', 1),
        row('difference', null),
      ])
    ).toEqual([1, 0.5, 0]);
  });

  it('uses |r| for correlations', () => {
    expect(
      timingBarWidths([row('pearson', -0.4), row('spearman', 0.2)])
    ).toEqual([0.4, 0.2]);
  });
});
