import {
  addDays,
  assessGoalForecast,
  computeWeightTrend,
  forecastGoalDate,
  summarizeWeightTrend,
} from '@workspace/shared';

const START = '2026-01-01';
const series = (weights: number[]) =>
  weights.map((weight, i) => ({ date: addDays(START, i), weight }));

describe('computeWeightTrend', () => {
  it('returns nothing for no data and ignores invalid weights', () => {
    expect(computeWeightTrend([])).toEqual([]);
    expect(computeWeightTrend([{ date: START, weight: Number.NaN }])).toEqual(
      []
    );
  });

  it('smooths a noisy series around the underlying line', () => {
    const noisy = series(Array.from({ length: 21 }, (_, i) => 80 + (i % 2)));
    const trend = computeWeightTrend(noisy);
    const last = trend[trend.length - 1]!;
    expect(last.trend).toBeGreaterThan(80.3);
    expect(last.trend).toBeLessThan(80.7);
  });

  it('interpolates missing days and keeps one point per logged day', () => {
    const trend = computeWeightTrend([
      { date: START, weight: 80 },
      { date: addDays(START, 10), weight: 78 },
    ]);
    expect(trend).toHaveLength(2);
    expect(trend[1]!.trend).toBeLessThan(80);
    expect(trend[1]!.trend).toBeGreaterThan(78);
  });
});

describe('summarizeWeightTrend / forecastGoalDate', () => {
  const losing = computeWeightTrend(
    series(Array.from({ length: 28 }, (_, i) => 90 - i * 0.1))
  );

  it('reports a weekly rate near the true slope', () => {
    const summary = summarizeWeightTrend(losing)!;
    expect(summary.weeklyRate).toBeCloseTo(-0.7, 1);
  });

  it('projects a goal date when heading toward the target', () => {
    const forecast = forecastGoalDate(losing, 85)!;
    expect(forecast.daysRemaining).toBeGreaterThan(0);
    expect(forecast.date).toBe(
      addDays(losing[losing.length - 1]!.date, forecast.daysRemaining)
    );
  });

  it('returns null when moving away, at target, or without a target', () => {
    expect(forecastGoalDate(losing, 95)).toBeNull();
    expect(forecastGoalDate(losing, null)).toBeNull();
    expect(
      forecastGoalDate(losing, losing[losing.length - 1]!.trend)
    ).toBeNull();
  });

  it('refuses to forecast from too little data', () => {
    const few = computeWeightTrend(series([90, 89.5, 89]));
    expect(summarizeWeightTrend(few)!.weeklyRate).toBeNull();
    expect(forecastGoalDate(few, 80)).toBeNull();
  });

  it('refuses forecasts more than two years out', () => {
    const slow = computeWeightTrend(
      series(Array.from({ length: 28 }, (_, i) => 90 - i * 0.005))
    );
    expect(forecastGoalDate(slow, 70)).toBeNull();
  });
});

describe('assessGoalForecast', () => {
  const trendOf = (step: number, count = 28, start = 90) =>
    computeWeightTrend(
      series(Array.from({ length: count }, (_, i) => start + i * step))
    );

  it('says why there is no forecast', () => {
    expect(assessGoalForecast([], 80).status).toBe('insufficient-data');
    expect(assessGoalForecast(trendOf(-0.1, 3), 80).status).toBe(
      'insufficient-data'
    );
    expect(assessGoalForecast(trendOf(-0.1), null).status).toBe('no-goal');
  });

  it('projects a date when heading toward the target', () => {
    const result = assessGoalForecast(trendOf(-0.1), 85);
    expect(result.status).toBe('toward-goal');
    expect(result.forecast!.daysRemaining).toBeGreaterThan(0);
  });

  it('tells moving away, holding steady and too far apart', () => {
    expect(assessGoalForecast(trendOf(-0.1), 95).status).toBe('away-from-goal');
    expect(assessGoalForecast(trendOf(0), 80).status).toBe('steady');
    expect(assessGoalForecast(trendOf(-0.02), 70).status).toBe('too-far');
  });

  it('agrees with forecastGoalDate', () => {
    const points = trendOf(-0.1);
    expect(forecastGoalDate(points, 85)).toEqual(
      assessGoalForecast(points, 85).forecast
    );
    expect(forecastGoalDate(points, 95)).toBeNull();
  });
});
