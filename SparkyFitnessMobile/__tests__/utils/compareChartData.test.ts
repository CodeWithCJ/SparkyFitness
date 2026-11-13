import {
  type CompareMetricKey,
  type CompareResponse,
  type CompareSinceResponse,
  type CompareSinceResult,
  displayDots,
  overTimeData,
  pairedDots,
  scaledSeries,
  sinceChartData,
  trendLine,
} from '@workspace/shared';

function response(
  devA: Record<string, number>,
  devB: Record<string, number>,
  valuesA: Record<string, number> = {},
  valuesB: Record<string, number> = {}
): CompareResponse {
  return {
    a: { key: 'meditationMinutes', values: valuesA },
    b: { key: 'mood', values: valuesB },
    through: '2026-10-21',
    deviations: { a: devA, b: devB },
    result: { status: 'ok', n: 1, needed: 14, checks: { ownNormal: true } },
  } as CompareResponse;
}

describe('pairedDots', () => {
  it('pairs A with B one day later in day mode, timing 1', () => {
    const dots = pairedDots(
      response({ '2026-10-01': 5 }, { '2026-10-01': 99, '2026-10-02': 7 }),
      'day',
      1
    );
    expect(dots).toEqual([{ key: '2026-10-01', x: 5, y: 7 }]);
  });

  it('pairs A with B the day before at timing -1', () => {
    const dots = pairedDots(
      response({ '2026-10-02': 5 }, { '2026-10-01': 3 }),
      'day',
      -1
    );
    expect(dots).toEqual([{ key: '2026-10-02', x: 5, y: 3 }]);
  });

  it('pairs a week with B seven days later in week mode, timing 1', () => {
    const dots = pairedDots(
      response({ '2026-09-07': 2 }, { '2026-09-08': 111, '2026-09-14': 4 }),
      'week',
      1
    );
    expect(dots).toEqual([{ key: '2026-09-07', x: 2, y: 4 }]);
  });

  it('drops keys missing on either side and sorts by key', () => {
    const dots = pairedDots(
      response(
        { '2026-10-03': 3, '2026-10-01': 1, '2026-10-02': 2 },
        { '2026-10-01': 10, '2026-10-03': 30 }
      ),
      'day',
      0
    );
    expect(dots).toEqual([
      { key: '2026-10-01', x: 1, y: 10 },
      { key: '2026-10-03', x: 3, y: 30 },
    ]);
  });
});

describe('trendLine', () => {
  it('fits y = 2x + 1', () => {
    const line = trendLine([
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
    ]);
    expect(line?.slope).toBeCloseTo(2);
    expect(line?.intercept).toBeCloseTo(1);
  });

  it('returns null for one point or no x spread', () => {
    expect(trendLine([{ x: 1, y: 1 }])).toBeNull();
    expect(
      trendLine([
        { x: 1, y: 1 },
        { x: 1, y: 2 },
      ])
    ).toBeNull();
  });
});

describe('scaledSeries', () => {
  it('scales min-max to 0-1 over its own values', () => {
    const out = scaledSeries({ a: 60, b: 80, c: 70 }, ['a', 'b', 'c']);
    expect(out.map((p) => p.scaled)).toEqual([0, 1, 0.5]);
    expect(out.map((p) => p.raw)).toEqual([60, 80, 70]);
  });

  it('puts a constant series at 0.5', () => {
    const out = scaledSeries({ a: 4, b: 4 }, ['a', 'b']);
    expect(out.map((p) => p.scaled)).toEqual([0.5, 0.5]);
  });

  it('gives null for a gap', () => {
    const out = scaledSeries({ a: 1, c: 3 }, ['a', 'b', 'c']);
    expect(out[1]).toEqual({ key: 'b', scaled: null, raw: null });
  });
});

describe('overTimeData', () => {
  it('uses the union of keys in date order with each side own range', () => {
    const data = overTimeData(
      response(
        {},
        {},
        { '2026-10-02': 10, '2026-10-01': 30 },
        {
          '2026-10-02': 60,
          '2026-10-03': 80,
        }
      )
    );
    expect(data.rows.map((r) => r.key)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(data.rows.map((r) => r.a)).toEqual([1, 0, null]);
    expect(data.rows.map((r) => r.b)).toEqual([null, 0, 1]);
    expect(data.aRange).toEqual({ min: 10, max: 30 });
    expect(data.bRange).toEqual({ min: 60, max: 80 });
  });

  it('has null ranges when a side has no values', () => {
    const data = overTimeData(response({}, {}));
    expect(data.rows).toEqual([]);
    expect(data.aRange).toBeNull();
  });
});

describe('displayDots', () => {
  it('shows mood on the 1-10 scale and leaves other metrics alone', () => {
    const dots = [{ key: '2026-10-01', x: 20, y: 30 }];
    expect(displayDots(dots, { a: 'mood', b: 'energy' })).toEqual([
      { key: '2026-10-01', x: 2, y: 30 },
    ]);
    expect(displayDots(dots, { a: 'energy', b: 'mood' })).toEqual([
      { key: '2026-10-01', x: 20, y: 3 },
    ]);
  });
});

describe('sinceChartData', () => {
  const stretch = (from: string, to: string, days: number) => ({
    from,
    to,
    days,
    valueDays: days,
  });

  function sinceResponse(
    result: Partial<CompareSinceResult>,
    values: Record<string, number>,
    outcome: CompareMetricKey = 'mood'
  ): CompareSinceResponse {
    return {
      mode: 'since',
      habit: { key: 'workoutMinutes', values: {} },
      outcome: { key: outcome, values },
      result: {
        status: 'ok',
        start: '2026-09-04',
        suggestedStart: '2026-09-04',
        before: stretch('2026-09-01', '2026-09-03', 3),
        since: stretch('2026-09-04', '2026-09-06', 3),
        line: 70,
        ...result,
      },
    };
  }

  it('lays the outcome on a day axis from before to since, in display scale', () => {
    const data = sinceChartData(
      sinceResponse(
        {},
        { '2026-09-01': 60, '2026-09-03': 70, '2026-09-05': 80 }
      )
    );
    expect(data.rows.map((r) => r.day)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
    expect(data.rows.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(data.rows.map((r) => r.value)).toEqual([6, null, 7, null, 8, null]);
    expect(data.rows.every((r) => r.line === 7)).toBe(true);
    expect(data.line).toBe(7);
    expect(data.before).toEqual({ from: 0, to: 2 });
    expect(data.since).toEqual({ from: 3, to: 5 });
    expect(data.start).toBe(3);
  });

  it('skips an empty before stretch and starts at the since one', () => {
    const data = sinceChartData(
      sinceResponse(
        { before: stretch('2026-09-04', '2026-09-03', 0) },
        { '2026-09-05': 80 }
      )
    );
    expect(data.rows.map((r) => r.day)).toEqual([
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
    expect(data.before).toBeNull();
    expect(data.since).toEqual({ from: 0, to: 2 });
    expect(data.start).toBe(0);
  });

  it('marks a start older than the since stretch, leaving the gap unshaded', () => {
    const data = sinceChartData(
      sinceResponse(
        {
          start: '2026-09-02',
          before: stretch('2026-08-30', '2026-09-01', 3),
          since: stretch('2026-09-04', '2026-09-06', 3),
        },
        { '2026-09-03': 50 }
      )
    );
    expect(data.rows).toHaveLength(8);
    expect(data.start).toBe(3);
    expect(data.before).toEqual({ from: 0, to: 2 });
    expect(data.since).toEqual({ from: 5, to: 7 });
  });

  it('has nothing to draw without a since stretch', () => {
    const data = sinceChartData(
      sinceResponse(
        {
          status: 'not_enough',
          reason: 'noStart',
          start: null,
          suggestedStart: null,
          before: undefined,
          since: undefined,
          line: 0,
        },
        {}
      )
    );
    expect(data).toEqual({
      rows: [],
      before: null,
      since: null,
      start: null,
      line: null,
    });
  });

  it('draws no line for a yes/no outcome', () => {
    const data = sinceChartData(
      sinceResponse(
        { line: 1 },
        { '2026-09-01': 1, '2026-09-04': 0 },
        'meditated'
      )
    );
    expect(data.line).toBeNull();
    expect(data.rows.every((r) => r.line === null)).toBe(true);
    expect(data.rows[0].value).toBe(1);
  });
});
