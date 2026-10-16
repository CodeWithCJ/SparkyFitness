import { addDays, catchUpFor, dayOfWeek } from '@workspace/shared';

const schedule = (endDay: string | null) => ({
  runDays: [1, 3, 5],
  startDay: null,
  endDay,
});
// A Monday.
const today = '2026-11-02';

describe('catchUpFor', () => {
  it('fits with no goal day, no run days or nothing left', () => {
    const base = { total: 10, next: 0, today, doneToday: false };
    expect(dayOfWeek(today)).toBe(1);
    expect(catchUpFor({ ...base, schedule: schedule(null) })).toEqual({
      state: 'fits',
    });
    expect(
      catchUpFor({
        ...base,
        schedule: { runDays: [], startDay: null, endDay: addDays(today, 30) },
      })
    ).toEqual({ state: 'fits' });
    expect(
      catchUpFor({ ...base, next: 10, schedule: schedule(addDays(today, 30)) })
    ).toEqual({ state: 'fits' });
  });

  it('fits when the last workout lands on or before the goal day', () => {
    // 9 workouts on Mon/Wed/Fri from Monday: the 9th is Friday of week 3.
    const end = addDays(today, 18);
    expect(
      catchUpFor({
        total: 9,
        next: 0,
        schedule: schedule(end),
        today,
        doneToday: false,
      })
    ).toEqual({ state: 'fits' });
  });

  it('skips the fewest workouts that make it fit', () => {
    const end = addDays(today, 18);
    // Two days late (11 workouts): skipping two brings the 9th slot back.
    const result = catchUpFor({
      total: 11,
      next: 0,
      schedule: schedule(end),
      today,
      doneToday: false,
    });
    expect(result).toMatchObject({ state: 'skip', skip: 2, next: 2 });
  });

  it('says so when it is too far behind', () => {
    const end = addDays(today, 18);
    const result = catchUpFor({
      total: 20,
      next: 0,
      schedule: schedule(end),
      today,
      doneToday: false,
    });
    expect(result).toEqual({ state: 'tooFar', late: expect.any(Number) });
    expect((result as { late: number }).late).toBeGreaterThan(3);
  });

  it('never skips the last workout', () => {
    const result = catchUpFor({
      total: 3,
      next: 2,
      schedule: schedule(addDays(today, -1)),
      today,
      doneToday: false,
    });
    expect(result.state).toBe('tooFar');
  });
});
