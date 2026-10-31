import {
  layoutSeverityChart,
  monthGrid,
  shiftMonth,
  summarizeDays,
} from '../../src/utils/symptomReport';

describe('monthGrid', () => {
  it('offsets Monday-first and counts the days', () => {
    // 1 Oct 2026 is a Thursday, so three blanks precede it.
    expect(monthGrid(2026, 10)).toEqual({
      offset: 3,
      count: 31,
      first: '2026-10-01',
      last: '2026-10-31',
    });
  });

  it('handles leap Februaries and Sunday starts', () => {
    expect(monthGrid(2024, 2).count).toBe(29);
    // 1 Feb 2026 is a Sunday.
    expect(monthGrid(2026, 2).offset).toBe(6);
  });
});

describe('shiftMonth', () => {
  it('rolls across year boundaries', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
});

describe('summarizeDays', () => {
  const OCTOBER = {
    from: '2026-10-01',
    to: '2026-10-31',
    today: '2026-10-31',
    timezone: 'UTC',
  };
  const log = { started_at: null, ended_at: null };

  it('tints by the worst entry, marks free days and skips cycle entries', () => {
    const days = summarizeDays(
      [
        {
          ...log,
          entry_date: '2026-10-01',
          severity: 3,
          peak_severity: null,
          source: 'manual',
        },
        {
          ...log,
          entry_date: '2026-10-01',
          severity: 4,
          peak_severity: 9,
          source: 'manual',
        },
        {
          ...log,
          entry_date: '2026-10-02',
          severity: 2,
          peak_severity: null,
          source: 'manual',
        },
        {
          ...log,
          entry_date: '2026-10-03',
          severity: 9,
          peak_severity: null,
          source: 'cycle',
        },
        {
          ...log,
          entry_date: '2026-10-04',
          severity: null,
          peak_severity: null,
          source: 'manual',
        },
      ],
      [{ entry_date: '2026-10-02' }, { entry_date: '2026-10-05' }],
      OCTOBER
    );
    expect(days.get('2026-10-01')).toEqual({ tone: 'severe', count: 2 });
    expect(days.get('2026-10-02')).toEqual({ tone: 'mild', count: 1 });
    expect(days.has('2026-10-03')).toBe(false);
    expect(days.get('2026-10-04')?.tone).toBe('mild');
    expect(days.get('2026-10-05')).toEqual({ tone: 'free', count: 0 });
  });

  it('marks every day an episode covers and counts it on each', () => {
    const days = summarizeDays(
      [
        {
          entry_date: '2026-10-12',
          started_at: '2026-10-12T21:00:00.000Z',
          ended_at: '2026-10-14T09:30:00.000Z',
          severity: 8,
          peak_severity: 8,
          source: 'manual',
        },
        {
          ...log,
          entry_date: '2026-10-13',
          severity: 2,
          peak_severity: null,
          source: 'manual',
        },
      ],
      [{ entry_date: '2026-10-13' }],
      OCTOBER
    );
    expect(days.get('2026-10-12')).toEqual({ tone: 'severe', count: 1 });
    expect(days.get('2026-10-13')).toEqual({ tone: 'severe', count: 2 });
    expect(days.get('2026-10-14')).toEqual({ tone: 'severe', count: 1 });
    expect(days.has('2026-10-11')).toBe(false);
    expect(days.has('2026-10-15')).toBe(false);
  });

  it('runs an episode still going up to today', () => {
    const days = summarizeDays(
      [
        {
          entry_date: '2026-10-18',
          started_at: '2026-10-18T10:00:00.000Z',
          ended_at: null,
          severity: 3,
          peak_severity: 3,
          source: 'manual',
        },
      ],
      [],
      { ...OCTOBER, today: '2026-10-20' }
    );
    expect([...days.keys()]).toEqual([
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
    ]);
    expect(days.get('2026-10-19')?.tone).toBe('mild');
  });

  it('marks the days of an episode that started the month before', () => {
    const days = summarizeDays(
      [
        {
          entry_date: '2026-09-29',
          started_at: '2026-09-29T20:00:00.000Z',
          ended_at: '2026-10-02T07:00:00.000Z',
          severity: 5,
          peak_severity: 5,
          source: 'manual',
        },
      ],
      [],
      OCTOBER
    );
    expect([...days.keys()]).toEqual(['2026-10-01', '2026-10-02']);
  });

  it('reads the end day in the profile timezone', () => {
    // 02:00 UTC on the 15th is still the evening of the 14th in New York.
    const days = summarizeDays(
      [
        {
          entry_date: '2026-10-13',
          started_at: '2026-10-13T14:00:00.000Z',
          ended_at: '2026-10-15T02:00:00.000Z',
          severity: 5,
          peak_severity: 5,
          source: 'manual',
        },
      ],
      [],
      { ...OCTOBER, timezone: 'America/New_York' }
    );
    expect([...days.keys()]).toEqual(['2026-10-13', '2026-10-14']);
  });
});

describe('layoutSeverityChart', () => {
  const box = {
    width: 300,
    height: 140,
    padLeft: 26,
    padRight: 10,
    padTop: 10,
    padBottom: 24,
  };
  const base = {
    started_at: '2026-10-01T10:00:00.000Z',
    logged_at: '2026-10-01T10:00:00.000Z',
    ended_at: '2026-10-01T12:00:00.000Z',
    severity: 5,
    severity_timeline: [
      { at: '2026-10-01T10:00:00.000Z', severity: 8 },
      { at: '2026-10-01T12:00:00.000Z', severity: 2 },
    ],
    treatments: [
      {
        id: 'a',
        name_snapshot: 'Ibuprofen',
        taken_at: '2026-10-01T11:00:00.000Z',
      },
      { id: 'b', name_snapshot: 'Late', taken_at: '2026-10-02T11:00:00.000Z' },
      { id: 'c', name_snapshot: 'Untimed', taken_at: null },
    ],
  };

  it('spans the episode and keeps only in-range treatment marks', () => {
    const layout = layoutSeverityChart(base, 10, box)!;
    expect(layout.points[0].x).toBe(26);
    expect(layout.points[1].x).toBe(290);
    expect(layout.marks.map((m) => m.id)).toEqual(['a']);
    expect(layout.marks[0].x).toBeCloseTo(158);
    expect(layout.ticks.map((t) => t.value)).toEqual([0, 5, 10]);
    expect(layout.points[0].y).toBeLessThan(layout.points[1].y);
  });

  it('falls back to a single point and a 30 minute window when ongoing', () => {
    const layout = layoutSeverityChart(
      { ...base, ended_at: null, severity_timeline: [], treatments: [] },
      10,
      box
    )!;
    expect(layout.points).toHaveLength(1);
    expect(layout.endIso).toBe('2026-10-01T10:30:00.000Z');
  });

  it('returns null without readings or a numeric scale', () => {
    expect(
      layoutSeverityChart(
        { ...base, severity: null, severity_timeline: [] },
        10,
        box
      )
    ).toBeNull();
    expect(layoutSeverityChart(base, 0, box)).toBeNull();
  });
});
