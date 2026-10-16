import {
  CAFFEINE_DAILY_LIMIT_MG,
  buildSubstancesReport,
  padSubstancePoints,
} from '../../src/utils/substancesReport';
import type { NutritionTrendPoint } from '../../src/services/api/reportsApi';

const point = (
  date: string,
  caffeine: number,
  alcohol: number,
  calories = 2000
): NutritionTrendPoint =>
  ({
    date,
    calories,
    caffeine_mg: caffeine,
    alcohol_g: alcohol,
    water_ml: 0,
  }) as NutritionTrendPoint;

describe('buildSubstancesReport', () => {
  const current = [
    point('2026-10-01', 200, 0),
    point('2026-10-02', 500, 28),
    point('2026-10-03', 0, 0),
    point('2026-10-04', 300, 14),
    point('2026-10-05', 0, 0, 0),
    point('2026-10-06', 0, 0),
    point('2026-10-07', 100, 0),
    point('2026-10-08', 0, 42),
  ];
  const report = buildSubstancesReport(current, [], Array(8).fill(null));

  it('averages caffeine over days with any and counts days over the default limit', () => {
    expect(report.caffeine.averageMg).toBe(275);
    expect(report.caffeine.daysWithCaffeine).toBe(4);
    expect(report.caffeine.limitMg).toBe(CAFFEINE_DAILY_LIMIT_MG);
    expect(report.caffeine.limitVaries).toBe(false);
    expect(report.caffeine.daysOverLimit).toBe(1);
    expect(report.caffeine.peak).toEqual({ day: '2026-10-02', mg: 500 });
  });

  it('uses the day caffeine goal instead of the default when there is one', () => {
    const withGoal = buildSubstancesReport(
      current,
      [],
      Array(8).fill({ caffeine_mg: 150 })
    );
    expect(withGoal.caffeine.limitMg).toBe(150);
    expect(withGoal.caffeine.limitVaries).toBe(false);
    expect(withGoal.caffeine.daysOverLimit).toBe(3);
  });

  it('counts each day against its own caffeine limit when the goal changes', () => {
    const mixed = buildSubstancesReport(
      [
        point('2026-10-01', 500, 0),
        point('2026-10-02', 100, 0),
        point('2026-10-03', 200, 0),
      ],
      [],
      [{ caffeine_mg: 400 }, { caffeine_mg: 400 }, { caffeine_mg: 150 }]
    );
    expect(mixed.caffeine.daysOverLimit).toBe(2);
    expect(mixed.caffeine.limitVaries).toBe(true);
    expect(mixed.caffeine.limitMg).toBe(400);
    expect(mixed.days.map((day) => day.limitMg)).toEqual([400, 400, 150]);
  });

  it('totals alcohol and counts alcohol-free days only on days something was logged', () => {
    expect(report.alcohol.totalG).toBe(84);
    expect(report.alcohol.drinkingDays).toBe(3);
    expect(report.alcohol.averagePerDrinkingDayG).toBe(28);
    // 10-05 logged nothing, so it is not an alcohol-free day.
    expect(report.alcohol.alcoholFreeDays).toBe(4);
    expect(report.alcohol.loggedDays).toBe(7);
    expect(report.alcohol.peak).toEqual({ day: '2026-10-08', g: 42 });
  });

  it('compares alcohol with the previous window', () => {
    const withPrevious = buildSubstancesReport(
      current,
      [point('2026-09-25', 0, 56)],
      Array(8).fill(null)
    );
    expect(withPrevious.alcohol.previousTotalG).toBe(56);
  });

  it('splits the window into seven-day blocks counted back from the end', () => {
    expect(report.weeks).toHaveLength(2);
    expect(report.weeks[0]).toMatchObject({
      startDate: '2026-10-02',
      endDate: '2026-10-08',
      alcoholG: 84,
    });
    expect(report.weeks[1]).toMatchObject({
      startDate: '2026-10-01',
      endDate: '2026-10-01',
      alcoholG: 0,
    });
  });

  it('has nothing to report for a window without either', () => {
    const empty = buildSubstancesReport(
      [point('2026-10-01', 0, 0)],
      [],
      [null]
    );
    expect(empty.caffeine.averageMg).toBeNull();
    expect(empty.alcohol.drinkingDays).toBe(0);
    expect(empty.caffeine.peak).toBeNull();
  });
});

describe('padSubstancePoints', () => {
  it('fills days without a row so every day of the window is present', () => {
    const padded = padSubstancePoints(
      [point('2026-10-02', 100, 0)],
      '2026-10-01',
      3
    );
    expect(padded.map((p) => p.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(padded[1].caffeine_mg).toBe(100);
    expect(padded[0].caffeine_mg).toBe(0);
  });
});
