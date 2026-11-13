import { describe, expect, it } from 'vitest';
import { computeDailyWeightTrend, computeWeightTrend } from '@workspace/shared';

describe('computeDailyWeightTrend', () => {
  const samples = [
    { date: '2026-03-01', weight: 80 },
    { date: '2026-03-05', weight: 84 },
  ];

  it('returns every day between weigh-ins', () => {
    const daily = computeDailyWeightTrend(samples);
    expect(daily.map((p) => p.date)).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
    ]);
    // Interpolated 80,81,82,83,84, trailing mean.
    expect(daily[0]!.trend).toBeCloseTo(80);
    expect(daily[4]!.trend).toBeCloseTo(82);
  });

  it('returns nothing without a valid weigh-in', () => {
    expect(computeDailyWeightTrend([])).toEqual([]);
    expect(
      computeDailyWeightTrend([{ date: '2026-03-01', weight: 0 }])
    ).toEqual([]);
  });

  it('leaves computeWeightTrend output unchanged', () => {
    expect(computeWeightTrend(samples)).toEqual([
      { date: '2026-03-01', weight: 80, trend: 80 },
      { date: '2026-03-05', weight: 84, trend: 82 },
    ]);
  });
});
