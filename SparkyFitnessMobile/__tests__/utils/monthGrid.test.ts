import { monthGridWeeks, monthOf, shiftMonth } from '../../src/utils/monthGrid';

describe('monthGridWeeks', () => {
  it('draws whole weeks from the chosen first weekday, padded with neighbours', () => {
    // October 2026 starts on a Thursday.
    const weeks = monthGridWeeks('2026-10', 1);
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toEqual({ day: '2026-09-28', inMonth: false });
    expect(weeks[0][3]).toEqual({ day: '2026-10-01', inMonth: true });
    expect(weeks[4][6]).toEqual({ day: '2026-11-01', inMonth: false });
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('starts on Sunday when asked', () => {
    const weeks = monthGridWeeks('2026-10', 0);
    expect(weeks[0][0].day).toBe('2026-09-27');
  });

  it('needs no leading days when the month starts on the first weekday', () => {
    // June 2026 starts on a Monday.
    expect(monthGridWeeks('2026-06', 1)[0][0]).toEqual({
      day: '2026-06-01',
      inMonth: true,
    });
  });

  it('draws six weeks when the month needs them', () => {
    // March 2026 starts on a Sunday and has 31 days: Monday start -> 6 weeks.
    expect(monthGridWeeks('2026-03', 1)).toHaveLength(6);
  });
});

describe('shiftMonth', () => {
  it('crosses year ends both ways', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-10', 14)).toBe('2027-12');
  });
});

describe('monthOf', () => {
  it('names the month of a day', () => {
    expect(monthOf('2026-10-13')).toBe('2026-10');
  });
});
