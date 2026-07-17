import { buildMonthGrid } from '@workspace/shared';

describe('buildMonthGrid', () => {
  it('pads a month starting mid-week to a full week, Sunday-first', () => {
    // July 2026 starts on a Wednesday.
    const grid = buildMonthGrid(2026, 7, 0);
    expect(grid.days[0]).toBe('2026-06-28'); // preceding Sunday
    expect(grid.days).toContain('2026-07-01');
    expect(grid.days.length % 7).toBe(0);
  });

  it('shifts the grid start when firstDayOfWeek is Monday', () => {
    const sundayFirst = buildMonthGrid(2026, 7, 0);
    const mondayFirst = buildMonthGrid(2026, 7, 1);
    expect(sundayFirst.gridStart).toBe('2026-06-28');
    expect(mondayFirst.gridStart).toBe('2026-06-29');
  });

  it('uses 5 weeks (35 cells) when the month fits without spilling into a 6th row', () => {
    // February 2026 starts on a Sunday and has 28 days -> fits in 4 rows,
    // still padded to a minimum of 5 full weeks (35 cells).
    const grid = buildMonthGrid(2026, 2, 0);
    expect(grid.days.length).toBe(35);
  });

  it('uses 6 weeks (42 cells) when the month spills past 5 rows', () => {
    // July 2026: starts Wednesday, 31 days -> offset(3) + 31 = 34, still <=35 -> 35 cells.
    // August 2026 starts on a Saturday (offset 6) with 31 days -> 6+31=37 > 35 -> 42 cells.
    const grid = buildMonthGrid(2026, 8, 0);
    expect(grid.days.length).toBe(42);
  });

  it('every cell is a valid, contiguous YYYY-MM-DD day string', () => {
    const grid = buildMonthGrid(2026, 7, 0);
    for (let i = 1; i < grid.days.length; i++) {
      const prev = new Date(grid.days[i - 1] + 'T00:00:00Z');
      const curr = new Date(grid.days[i] + 'T00:00:00Z');
      expect(curr.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000);
    }
    expect(grid.gridEnd).toBe(grid.days[grid.days.length - 1]);
  });
});
