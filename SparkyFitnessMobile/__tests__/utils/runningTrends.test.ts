import {
  buildRunningTrends,
  isRunningActivity,
  startOfWeek,
  toWeekStart,
  type RunningTrendsActivity,
} from '@workspace/shared';

const run = (
  entryDate: string,
  distanceMeters: number | null,
  extra: Partial<RunningTrendsActivity> = {}
): RunningTrendsActivity => ({
  exerciseName: 'Morning Run',
  category: 'running',
  entryDate,
  durationMinutes: distanceMeters ? distanceMeters / 200 : 30,
  distanceMeters,
  avgHeartRate: null,
  ...extra,
});

// Sunday 2026-09-27: its week starts on Monday 2026-09-21.
const TODAY = '2026-09-27';

describe('startOfWeek', () => {
  it('finds the Monday or Sunday that opens the week', () => {
    expect(startOfWeek('2026-09-27')).toBe('2026-09-21');
    expect(startOfWeek('2026-09-21')).toBe('2026-09-21');
    expect(startOfWeek('2026-09-27', 0)).toBe('2026-09-27');
    expect(startOfWeek('2026-09-26', 0)).toBe('2026-09-20');
  });
});

describe('toWeekStart and any first day of the week', () => {
  it('reads a stored preference and falls back to Monday', () => {
    expect(toWeekStart(0)).toBe(0);
    expect(toWeekStart(6)).toBe(6);
    expect(toWeekStart(7)).toBe(1);
    expect(toWeekStart(undefined)).toBe(1);
    expect(toWeekStart('1')).toBe(1);
    expect(toWeekStart(null, 0)).toBe(0);
  });

  it('opens the week on whichever day was chosen', () => {
    // Wednesday 2026-09-23.
    expect(startOfWeek('2026-09-23', 3)).toBe('2026-09-23');
    expect(startOfWeek('2026-09-22', 3)).toBe('2026-09-16');
    expect(startOfWeek('2026-09-23', 6)).toBe('2026-09-19');
  });
});

describe('isRunningActivity', () => {
  it('counts runs only', () => {
    expect(isRunningActivity(run('2026-09-26', 5000))).toBe(true);
    expect(
      isRunningActivity(
        run('2026-09-26', 5000, { exerciseName: 'Indoor Bike', category: null })
      )
    ).toBe(false);
    expect(
      isRunningActivity(
        run('2026-09-26', 5000, {
          exerciseName: 'Evening Walk',
          category: 'walking',
        })
      )
    ).toBe(false);
  });
});

describe('buildRunningTrends', () => {
  it('always returns the full window, oldest week first', () => {
    const trends = buildRunningTrends([], { today: TODAY, weeks: 12 });
    expect(trends.weeks).toHaveLength(12);
    expect(trends.weeks[11]!.weekStart).toBe('2026-09-21');
    expect(trends.weeks[0]!.weekStart).toBe('2026-07-06');
    expect(trends.totalRuns).toBe(0);
    expect(trends.weekVsAveragePercent).toBeNull();
  });

  it('sums each week and finds the longest run', () => {
    const trends = buildRunningTrends(
      [
        run('2026-09-22', 5000),
        run('2026-09-26', 12000),
        run('2026-09-15', 8000),
      ],
      { today: TODAY }
    );
    expect(trends.weeks[11]!.distanceMeters).toBe(17000);
    expect(trends.weeks[11]!.runs).toBe(2);
    expect(trends.weeks[11]!.longestRunMeters).toBe(12000);
    expect(trends.weeks[10]!.distanceMeters).toBe(8000);
    expect(trends.thisWeekMeters).toBe(17000);
    expect(trends.longestRunMeters).toBe(12000);
    expect(trends.totalRuns).toBe(3);
  });

  it('ignores walks, rides, runs with no distance, and anything outside the window', () => {
    const trends = buildRunningTrends(
      [
        run('2026-09-24', 5000, { exerciseName: 'Bike', category: 'cycling' }),
        run('2026-09-24', null),
        run('2026-09-24', 50),
        run('2026-01-01', 10000),
        run('2026-10-05', 10000),
      ],
      { today: TODAY }
    );
    expect(trends.totalRuns).toBe(0);
    expect(trends.thisWeekMeters).toBe(0);
  });

  it('compares this week with the average of the four before it', () => {
    const trends = buildRunningTrends(
      [
        run('2026-08-25', 10000),
        run('2026-09-01', 10000),
        run('2026-09-08', 10000),
        run('2026-09-15', 10000),
        run('2026-09-23', 15000),
      ],
      { today: TODAY }
    );
    expect(trends.previousFourWeekAverageMeters).toBe(10000);
    expect(trends.weekVsAveragePercent).toBeCloseTo(50, 5);
  });

  it('measures efficiency as distance per minute per heartbeat, on longer runs with a heart rate', () => {
    const trends = buildRunningTrends(
      [
        run('2026-09-22', 6000, { durationMinutes: 30, avgHeartRate: 150 }),
        // Too short to say anything.
        run('2026-09-23', 2000, { durationMinutes: 10, avgHeartRate: 170 }),
        // A sensor glitch.
        run('2026-09-24', 5000, { durationMinutes: 30, avgHeartRate: 20 }),
      ],
      { today: TODAY }
    );
    expect(trends.weeks[11]!.efficiency).toBeCloseTo(6000 / 30 / 150, 6);
  });

  it('reports the efficiency change between the earlier and later half', () => {
    const activities: RunningTrendsActivity[] = [];
    // Earlier half: 10 km in 60 min at 150 bpm. Later half: the same effort,
    // 10% faster.
    for (const day of ['2026-07-08', '2026-07-22', '2026-08-05']) {
      activities.push(
        run(day, 10000, { durationMinutes: 60, avgHeartRate: 150 })
      );
    }
    for (const day of ['2026-08-26', '2026-09-09', '2026-09-23']) {
      activities.push(
        run(day, 11000, { durationMinutes: 60, avgHeartRate: 150 })
      );
    }
    const trends = buildRunningTrends(activities, { today: TODAY });
    expect(trends.efficiencyChangePercent).toBeCloseTo(10, 5);
  });

  it('gives no efficiency change without readings in both halves', () => {
    const trends = buildRunningTrends(
      [run('2026-09-22', 6000, { durationMinutes: 30, avgHeartRate: 150 })],
      { today: TODAY }
    );
    expect(trends.efficiencyChangePercent).toBeNull();
  });

  it('can start weeks on Sunday', () => {
    const trends = buildRunningTrends([run('2026-09-27', 5000)], {
      today: TODAY,
      weekStartsOn: 0,
    });
    expect(trends.weeks[11]!.weekStart).toBe('2026-09-27');
    expect(trends.thisWeekMeters).toBe(5000);
  });
});
