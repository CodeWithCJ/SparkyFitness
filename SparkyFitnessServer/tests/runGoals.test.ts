import { describe, expect, it } from 'vitest';
import { buildRunGoalProgress } from '@workspace/shared';

// 2026-10-15 is a Thursday; with weeks starting Monday the week is 12th-18th.
const TODAY = '2026-10-15';
const run = (day: string, km: number, name = 'Running') => ({
  day,
  exerciseName: name,
  distanceKm: km,
});

describe('buildRunGoalProgress', () => {
  it("totals only this week's runs", () => {
    const progress = buildRunGoalProgress(
      [
        run('2026-10-11', 20), // last week
        run('2026-10-12', 5),
        run('2026-10-14', 7.5, 'Treadmill Run'),
        run('2026-10-13', 10, 'Cycling'),
        run('2026-10-13', 4, 'Walking'),
      ],
      TODAY,
      1,
      { weeklyDistanceKm: 30, raceDate: null }
    );
    expect(progress.week_start).toBe('2026-10-12');
    expect(progress.week_end).toBe('2026-10-18');
    expect(progress.week_distance_km).toBe(12.5);
    expect(progress.run_count).toBe(2);
    expect(progress.weekly_percent).toBe(42);
  });

  it('spreads what is left over the days remaining, today included', () => {
    const progress = buildRunGoalProgress([run('2026-10-12', 10)], TODAY, 1, {
      weeklyDistanceKm: 30,
      raceDate: null,
    });
    expect(progress.days_left_in_week).toBe(4);
    expect(progress.daily_needed_km).toBe(5);
  });

  it('needs nothing more once the target is reached, and may pass 100%', () => {
    const progress = buildRunGoalProgress([run('2026-10-12', 36)], TODAY, 1, {
      weeklyDistanceKm: 30,
      raceDate: null,
    });
    expect(progress.weekly_percent).toBe(120);
    expect(progress.daily_needed_km).toBeNull();
  });

  it('follows the first day of the week', () => {
    // Weeks starting Sunday: the 11th belongs to this week.
    const progress = buildRunGoalProgress([run('2026-10-11', 8)], TODAY, 0, {
      weeklyDistanceKm: null,
      raceDate: null,
    });
    expect(progress.week_start).toBe('2026-10-11');
    expect(progress.week_distance_km).toBe(8);
    expect(progress.weekly_percent).toBeNull();
    expect(progress.daily_needed_km).toBeNull();
  });

  it('counts the days to the race, 0 on the day and negative after', () => {
    const goals = (raceDate: string) => ({ weeklyDistanceKm: null, raceDate });
    expect(
      buildRunGoalProgress([], TODAY, 1, goals('2026-11-15')).race_days_left
    ).toBe(31);
    expect(
      buildRunGoalProgress([], TODAY, 1, goals(TODAY)).race_days_left
    ).toBe(0);
    expect(
      buildRunGoalProgress([], TODAY, 1, goals('2026-10-10')).race_days_left
    ).toBe(-5);
    expect(
      buildRunGoalProgress([], TODAY, 1, {
        weeklyDistanceKm: null,
        raceDate: null,
      }).race_days_left
    ).toBeNull();
  });

  it('ignores entries without a distance', () => {
    const progress = buildRunGoalProgress(
      [{ day: '2026-10-13', exerciseName: 'Running', distanceKm: null }],
      TODAY,
      1,
      { weeklyDistanceKm: 10, raceDate: null }
    );
    expect(progress.run_count).toBe(0);
    expect(progress.weekly_percent).toBe(0);
  });
});
