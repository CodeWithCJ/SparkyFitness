import { buildSleepAnalytics } from '../../src/utils/sleepAnalytics';
import type { SleepEntry } from '../../src/types/sleep';

const night = (
  day: string,
  overrides: Partial<SleepEntry> = {}
): SleepEntry => ({
  id: day,
  entry_date: day,
  bedtime: `${day}T22:00:00Z`,
  wake_time: `${day}T06:00:00Z`,
  duration_in_seconds: 8 * 3600,
  time_asleep_in_seconds: 7 * 3600,
  sleep_score: null,
  source: 'test',
  deep_sleep_seconds: null,
  light_sleep_seconds: null,
  rem_sleep_seconds: null,
  awake_sleep_seconds: null,
  average_spo2_value: null,
  lowest_spo2_value: null,
  highest_spo2_value: null,
  resting_heart_rate: null,
  record_timezone: null,
  record_utc_offset_minutes: null,
  stage_events: [],
  ...overrides,
});

describe('buildSleepAnalytics', () => {
  it('averages a metric over nights that reported it only', () => {
    const analytics = buildSleepAnalytics(
      [
        night('2026-10-01', { avg_overnight_hrv: 40, sleep_score: 80 }),
        night('2026-10-02', { avg_overnight_hrv: 60 }),
        night('2026-10-03'),
      ],
      '2026-10-01',
      3
    );

    expect(analytics.nightsWithData).toBe(3);
    expect(analytics.averages.hrv).toBe(50);
    expect(analytics.averages.sleepScore).toBe(80);
    expect(analytics.averages.stress).toBeNull();
    expect(analytics.series.hrv.map((p) => p.value)).toEqual([40, 60, 0]);
  });

  it("uses each day's longest session so a nap does not replace the night", () => {
    const analytics = buildSleepAnalytics(
      [
        night('2026-10-01', {
          id: 'nap',
          duration_in_seconds: 1800,
          sleep_score: 10,
        }),
        night('2026-10-01', { id: 'main', sleep_score: 85 }),
      ],
      '2026-10-01',
      1
    );

    expect(analytics.averages.sleepScore).toBe(85);
  });

  it('averages stage seconds over nights that reported them', () => {
    const analytics = buildSleepAnalytics(
      [
        night('2026-10-01', { deep_sleep_seconds: 3600 }),
        night('2026-10-02', { deep_sleep_seconds: 5400 }),
        night('2026-10-03'),
      ],
      '2026-10-01',
      3
    );

    expect(analytics.stages.deepSeconds).toBe(4500);
    expect(analytics.stages.remSeconds).toBeNull();
  });

  it('reports no nights for an empty window', () => {
    const analytics = buildSleepAnalytics([], '2026-10-01', 7);
    expect(analytics.nightsWithData).toBe(0);
    expect(analytics.averages.hrv).toBeNull();
  });

  it('reports time asleep in hours and efficiency against time in bed', () => {
    const analytics = buildSleepAnalytics(
      [
        night('2026-10-01', {
          time_asleep_in_seconds: 7 * 3600,
          duration_in_seconds: 8 * 3600,
        }),
      ],
      '2026-10-01',
      1
    );
    expect(analytics.averages.duration).toBe(7);
    expect(analytics.efficiencyPct).toBeCloseTo(87.5);
  });

  it('has no bedtime variability until three nights are in', () => {
    const two = buildSleepAnalytics(
      [night('2026-10-01'), night('2026-10-02')],
      '2026-10-01',
      2
    );
    expect(two.bedtimeVariabilityMinutes).toBeNull();
    const three = buildSleepAnalytics(
      [night('2026-10-01'), night('2026-10-02'), night('2026-10-03')],
      '2026-10-01',
      3
    );
    expect(three.bedtimeVariabilityMinutes).toBe(0);
  });
});

describe('buildSleepAnalytics extras', () => {
  // 2026-10-02 is a Friday, 10-03 a Saturday, 10-04 a Sunday, 10-05 a Monday.
  const week = [
    night('2026-10-02', { time_asleep_in_seconds: 6 * 3600 }),
    night('2026-10-03', { time_asleep_in_seconds: 9 * 3600 }),
    night('2026-10-04', { time_asleep_in_seconds: 8 * 3600 }),
    night('2026-10-05', { time_asleep_in_seconds: 7 * 3600 }),
  ];

  it('splits time asleep into weekday and weekend nights', () => {
    const analytics = buildSleepAnalytics(week, '2026-10-02', 4);
    expect(analytics.weekdayHours).toBeCloseTo(6.5);
    expect(analytics.weekendHours).toBeCloseTo(8.5);
  });

  it('counts nights of 7h or more and finds the longest and shortest', () => {
    const analytics = buildSleepAnalytics(week, '2026-10-02', 4);
    expect(analytics.nightsWithDuration).toBe(4);
    expect(analytics.fullNights).toBe(3);
    expect(analytics.longestNight).toEqual({ day: '2026-10-03', hours: 9 });
    expect(analytics.shortestNight).toEqual({ day: '2026-10-02', hours: 6 });
  });

  it('shares the average night between the stages', () => {
    const analytics = buildSleepAnalytics(
      [
        night('2026-10-02', {
          deep_sleep_seconds: 3600,
          light_sleep_seconds: 3 * 3600,
          rem_sleep_seconds: 3600,
          awake_sleep_seconds: 3600,
        }),
      ],
      '2026-10-02',
      1
    );
    expect(analytics.stagePct.deep).toBeCloseTo(100 / 6);
    expect(analytics.stagePct.light).toBeCloseTo(50);
    const total =
      (analytics.stagePct.deep ?? 0) +
      (analytics.stagePct.light ?? 0) +
      (analytics.stagePct.rem ?? 0) +
      (analytics.stagePct.awake ?? 0);
    expect(total).toBeCloseTo(100);
  });

  it('reports wake-time consistency only with three or more nights', () => {
    expect(
      buildSleepAnalytics(week.slice(0, 2), '2026-10-02', 2)
        .wakeVariabilityMinutes
    ).toBeNull();
    expect(
      buildSleepAnalytics(week, '2026-10-02', 4).wakeVariabilityMinutes
    ).toBe(0);
  });
});
