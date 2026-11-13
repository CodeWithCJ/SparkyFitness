import type {
  CompareMetricKey,
  CompareSinceResponse,
  CompareSinceResult,
} from '@workspace/shared';
import { sinceMonthRows } from '@/pages/Reports/Compare/compareSinceTables';

function sinceResponse(
  habit: CompareMetricKey,
  outcome: CompareMetricKey,
  parts: {
    habitValues?: Record<string, number>;
    outcomeValues?: Record<string, number>;
    result?: Partial<CompareSinceResult>;
  } = {}
): CompareSinceResponse {
  return {
    mode: 'since',
    habit: { key: habit, values: parts.habitValues ?? {} },
    outcome: { key: outcome, values: parts.outcomeValues ?? {} },
    result: {
      status: 'ok',
      start: '2026-06-17',
      suggestedStart: null,
      before: {
        from: '2026-05-20',
        to: '2026-06-16',
        days: 28,
        valueDays: 0,
      },
      since: { from: '2026-06-17', to: '2026-07-14', days: 28, valueDays: 0 },
      line: 70,
      ...parts.result,
    },
  };
}

describe('sinceMonthRows', () => {
  it('has one row per month across both stretches, oldest first, start month marked', () => {
    const rows = sinceMonthRows(sinceResponse('meditated', 'mood'));
    expect(rows.map((r) => r.month)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(rows.map((r) => r.isStartMonth)).toEqual([false, true, false]);
  });

  it('does not count the days between the stretches', () => {
    const rows = sinceMonthRows(
      sinceResponse('meditated', 'mood', {
        habitValues: { '2025-07-05': 1, '2025-06-01': 1, '2026-07-01': 1 },
        outcomeValues: { '2025-07-05': 50, '2025-06-01': 40, '2026-07-01': 90 },
        result: {
          start: '2025-06-01',
          before: {
            from: '2024-06-01',
            to: '2025-05-31',
            days: 365,
            valueDays: 0,
          },
          since: {
            from: '2025-07-15',
            to: '2026-07-14',
            days: 365,
            valueDays: 0,
          },
        },
      })
    );
    const months = rows.map((r) => r.month);
    expect(months).not.toContain('2025-06');
    expect(months).toContain('2025-05');
    expect(months).toContain('2025-07');
    // July 2025 is half gap: its 5th is dropped, so no value is counted there.
    expect(rows.find((r) => r.month === '2025-07')?.valueDays).toBe(0);
    const july2026 = rows.find((r) => r.month === '2026-07');
    expect(july2026?.outcomeMean).toBe(90);
    expect(july2026?.valueDays).toBe(1);
    // The gap's 50 and 40 appear nowhere.
    expect(rows.reduce((n, r) => n + r.valueDays, 0)).toBe(1);
  });

  it('skips an empty before stretch', () => {
    const rows = sinceMonthRows(
      sinceResponse('meditated', 'mood', {
        outcomeValues: { '2026-06-20': 60 },
        result: {
          before: {
            from: '2026-06-17',
            to: '2026-06-16',
            days: 0,
            valueDays: 0,
          },
        },
      })
    );
    expect(rows.map((r) => r.month)).toEqual(['2026-06', '2026-07']);
  });

  it('returns no rows without a since stretch', () => {
    expect(
      sinceMonthRows(
        sinceResponse('meditated', 'mood', {
          result: { status: 'not_enough', reason: 'noStart', since: undefined },
        })
      )
    ).toEqual([]);
  });

  it('counts days done for a yes/no habit and also totals an event amount', () => {
    const yesNo = sinceMonthRows(
      sinceResponse('meditated', 'mood', {
        habitValues: { '2026-06-17': 1, '2026-06-18': 0, '2026-06-19': 1 },
      })
    ).find((r) => r.month === '2026-06');
    expect(yesNo?.habitDays).toBe(2);
    expect(yesNo?.habitTotal).toBeNull();
    expect(yesNo?.habitMean).toBeNull();

    const event = sinceMonthRows(
      sinceResponse('meditationMinutes', 'mood', {
        habitValues: { '2026-06-17': 10, '2026-06-18': 0, '2026-06-19': 25 },
      })
    ).find((r) => r.month === '2026-06');
    expect(event?.habitDays).toBe(2);
    expect(event?.habitTotal).toBe(35);
    expect(event?.habitMean).toBeNull();
  });

  it('gives a non-event habit its mean', () => {
    const row = sinceMonthRows(
      sinceResponse('timeAsleep', 'mood', {
        habitValues: { '2026-07-01': 400, '2026-07-02': 440 },
      })
    ).find((r) => r.month === '2026-07');
    expect(row?.habitMean).toBe(420);
    expect(row?.habitDays).toBeNull();
    expect(row?.habitTotal).toBeNull();
  });

  it('counts outcome values at or above the line', () => {
    const row = sinceMonthRows(
      sinceResponse('meditated', 'mood', {
        outcomeValues: { '2026-07-01': 60, '2026-07-02': 70, '2026-07-03': 80 },
      })
    ).find((r) => r.month === '2026-07');
    expect(row?.shareAtOrAbove).toBeCloseTo(2 / 3);
    expect(row?.outcomeMean).toBeCloseTo(70);
    expect(row?.valueDays).toBe(3);
  });

  it('has null outcome figures for a month with no outcome values', () => {
    const row = sinceMonthRows(sinceResponse('meditated', 'mood')).find(
      (r) => r.month === '2026-05'
    );
    expect(row?.outcomeMean).toBeNull();
    expect(row?.shareAtOrAbove).toBeNull();
    expect(row?.valueDays).toBe(0);
  });

  it('has no line share for a yes/no outcome', () => {
    const row = sinceMonthRows(
      sinceResponse('timeAsleep', 'meditated', {
        outcomeValues: { '2026-07-01': 1, '2026-07-02': 0 },
        result: { line: 0.5 },
      })
    ).find((r) => r.month === '2026-07');
    expect(row?.shareAtOrAbove).toBeNull();
    expect(row?.outcomeMean).toBe(0.5);
    expect(row?.valueDays).toBe(2);
  });
});
