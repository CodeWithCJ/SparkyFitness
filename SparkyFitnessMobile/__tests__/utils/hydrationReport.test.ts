import { buildHydrationInsights } from '../../src/utils/hydrationReport';

const day = (date: string, milliliters: number) => ({
  day: date,
  milliliters,
});

describe('buildHydrationInsights', () => {
  it('leaves unlogged days out of the average and counts the logged ones', () => {
    const insights = buildHydrationInsights(
      [day('2026-10-05', 2000), day('2026-10-06', 0), day('2026-10-07', 1000)],
      [day('2026-10-02', 1000)],
      [null, null, null]
    );
    expect(insights.loggedDays).toBe(2);
    expect(insights.averageMl).toBe(1500);
    expect(insights.previousAverageMl).toBe(1000);
    expect(insights.totalMl).toBe(3000);
    expect(insights.bestDay).toEqual(day('2026-10-05', 2000));
    expect(insights.lowestDay).toEqual(day('2026-10-07', 1000));
  });

  it('counts goals met, the average percent of goal and the goal streaks', () => {
    const insights = buildHydrationInsights(
      [
        day('2026-10-01', 2000),
        day('2026-10-02', 2500),
        day('2026-10-03', 1000),
        day('2026-10-04', 2000),
        day('2026-10-05', 2200),
        day('2026-10-06', 0),
      ],
      [],
      Array(6).fill(2000)
    );
    expect(insights.daysWithGoal).toBe(5);
    expect(insights.goalsMet).toBe(4);
    expect(insights.longestGoalStreak).toBe(2);
    // The empty last day is today in progress, so it does not zero the streak.
    expect(insights.goalStreak).toBe(2);
    expect(insights.averageGoalPct).toBe(
      Math.round(((1 + 1.25 + 0.5 + 1 + 1.1) / 5) * 100)
    );
  });

  it('averages per weekday', () => {
    // 2026-10-05 and 2026-10-12 are Mondays.
    const insights = buildHydrationInsights(
      [
        day('2026-10-05', 1000),
        day('2026-10-12', 2000),
        day('2026-10-06', 500),
      ],
      [],
      [null, null, null]
    );
    expect(insights.weekdayAverages).toEqual([
      { weekday: 1, averageMl: 1500 },
      { weekday: 2, averageMl: 500 },
    ]);
  });

  it('has nothing to report for a window with no water', () => {
    const insights = buildHydrationInsights([day('2026-10-05', 0)], [], [2000]);
    expect(insights.loggedDays).toBe(0);
    expect(insights.averageMl).toBeNull();
    expect(insights.bestDay).toBeNull();
    expect(insights.goalsMet).toBe(0);
  });
});
