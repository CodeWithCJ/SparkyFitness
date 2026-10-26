import { describe, expect, it } from 'vitest';
import {
  MIN_BASELINE_NIGHTS,
  computeFitnessFatigue,
  computeReadiness,
  WARMUP_DAYS,
  percentMaxFloors,
  type LoadSession,
} from '@workspace/shared';

const TODAY = '2026-10-13';
const day = (offset: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const run = (offset: number, minutes: number, hr: number | null = 150) => ({
  day: day(offset),
  durationMinutes: minutes,
  avgHeartRate: hr,
});
// Steady training: 40 minutes at a moderate effort every second day.
const steady = (from: number, to: number): LoadSession[] =>
  Array.from({ length: Math.floor((to - from) / 2) + 1 }, (_, i) =>
    run(from + i * 2, 40)
  );

describe('computeFitnessFatigue', () => {
  it('has no curve without sessions', () => {
    const result = computeFitnessFatigue([], TODAY);
    expect(result).toEqual({ points: [], today: null, status: 'noData' });
  });

  it('covers every day up to today, oldest first', () => {
    const { points } = computeFitnessFatigue(
      [run(-3, 30)],
      TODAY,
      percentMaxFloors(190),
      30
    );
    expect(points).toHaveLength(30);
    expect(points[0]?.day).toBe(day(-29));
    expect(points[29]?.day).toBe(TODAY);
  });

  it('is still learning in the first three weeks', () => {
    const result = computeFitnessFatigue(
      steady(-10, 0),
      TODAY,
      percentMaxFloors(190)
    );
    expect(result.status).toBe('learning');
  });

  it('is tired after a hard block on top of an easy base', () => {
    const base = steady(-80, -8);
    const block = [-6, -5, -4, -3, -2, -1, 0].map((d) => run(d, 90, 175));
    const result = computeFitnessFatigue(
      [...base, ...block],
      TODAY,
      percentMaxFloors(190)
    );
    expect(result.status).toBe('tired');
    expect(result.today!.form).toBeLessThan(0);
    expect(result.today!.fatigue).toBeGreaterThan(result.today!.fitness);
  });

  it('is fresh after a week of rest following a steady block', () => {
    const result = computeFitnessFatigue(
      steady(-80, -8),
      TODAY,
      percentMaxFloors(190)
    );
    expect(result.status).toBe('fresh');
    expect(result.today!.form).toBeGreaterThan(0);
  });

  it('lets fatigue fall faster than fitness once training stops', () => {
    const { points } = computeFitnessFatigue(
      steady(-80, -8),
      TODAY,
      percentMaxFloors(190)
    );
    const stop = points.find((p) => p.day === day(-8))!;
    const now = points[points.length - 1]!;
    expect(now.fatigue / stop.fatigue).toBeLessThan(now.fitness / stop.fitness);
  });

  it('ignores sessions outside the window', () => {
    const result = computeFitnessFatigue([run(-200, 60), run(5, 60)], TODAY);
    expect(result.status).toBe('noData');
  });
});

describe('computeReadiness', () => {
  const fresh = computeFitnessFatigue(
    steady(-80, -8),
    TODAY,
    percentMaxFloors(190)
  );
  const learning = computeFitnessFatigue(
    steady(-10, 0),
    TODAY,
    percentMaxFloors(190)
  );

  it('has no score without any data', () => {
    const result = computeReadiness({ fitnessFatigue: learning });
    expect(result).toMatchObject({ score: null, level: 'noData' });
  });

  it('uses just sleep when the curve is still learning', () => {
    const result = computeReadiness({
      fitnessFatigue: learning,
      sleepHours: 4,
    });
    expect(result.factors).toEqual({ sleep: 50 });
    expect(result.score).toBe(50);
    expect(result.weakest).toBe('sleep');
  });

  it('is high when fresh, rested and the watch metrics are at baseline', () => {
    const result = computeReadiness({
      fitnessFatigue: fresh,
      sleepHours: 8,
      restingHeartRate: 52,
      restingHeartRateBaseline: 52,
      hrv: 60,
      hrvBaseline: 60,
    });
    expect(result.level).toBe('high');
    expect(result.weakest).toBeNull();
  });

  it('drops with a raised resting heart rate and a low HRV', () => {
    const result = computeReadiness({
      fitnessFatigue: fresh,
      sleepHours: 8,
      restingHeartRate: 60,
      restingHeartRateBaseline: 52,
      hrv: 40,
      hrvBaseline: 60,
    });
    expect(result.factors.restingHeartRate).toBeLessThan(50);
    expect(result.factors.hrv).toBeLessThan(50);
    expect(result.level).not.toBe('high');
  });

  it('does not penalise a higher HRV or a lower resting heart rate', () => {
    const result = computeReadiness({
      fitnessFatigue: fresh,
      restingHeartRate: 48,
      restingHeartRateBaseline: 52,
      hrv: 80,
      hrvBaseline: 60,
    });
    expect(result.factors.restingHeartRate).toBe(100);
    expect(result.factors.hrv).toBe(100);
  });

  it('respects a custom sleep need', () => {
    const result = computeReadiness({
      fitnessFatigue: learning,
      sleepHours: 6,
      sleepNeedHours: 6,
    });
    expect(result.factors.sleep).toBe(100);
  });

  describe('watch baselines', () => {
    const base = {
      fitnessFatigue: fresh,
      sleepHours: 8,
      restingHeartRate: 52,
      restingHeartRateBaseline: 52,
    };

    it('leaves HRV out when the baseline has too few nights', () => {
      const result = computeReadiness({
        ...base,
        hrv: 20,
        hrvBaseline: 70,
        hrvBaselineNights: MIN_BASELINE_NIGHTS - 1,
      });
      expect(result.factors.hrv).toBeUndefined();
      expect(result.vitals?.hrv).toBeUndefined();
      expect(result.level).toBe('high');
    });

    it('leaves resting heart rate out when the baseline has too few nights', () => {
      const result = computeReadiness({
        ...base,
        restingHeartRate: 80,
        restingHeartRateBaselineNights: 2,
      });
      expect(result.factors.restingHeartRate).toBeUndefined();
      expect(result.level).toBe('high');
    });

    it('still caps the score on a real HRV drop with enough nights', () => {
      const result = computeReadiness({
        ...base,
        hrv: 41,
        hrvBaseline: 68,
        hrvBaselineNights: MIN_BASELINE_NIGHTS,
      });
      expect(result.factors.hrv).toBe(0);
      expect(result.score).toBe(69);
      expect(result.level).toBe('moderate');
      expect(result.weakest).toBe('hrv');
      expect(result.vitals?.hrv).toEqual({
        current: 41,
        baseline: 68,
        nights: MIN_BASELINE_NIGHTS,
      });
    });

    it('leaves the factor out when there is no baseline', () => {
      const result = computeReadiness({ ...base, hrv: 41, hrvBaseline: null });
      expect(result.factors.hrv).toBeUndefined();
      expect(result.vitals?.hrv).toBeUndefined();
    });

    it('trusts a baseline whose night count is unknown', () => {
      const result = computeReadiness({ ...base, hrv: 41, hrvBaseline: 68 });
      expect(result.factors.hrv).toBe(0);
      expect(result.vitals?.hrv).toEqual({ current: 41, baseline: 68 });
    });
  });
});

describe('computeFitnessFatigue warm-up', () => {
  it('starts an established trainer near steady state, not at zero', () => {
    // The same load every day, so fitness and fatigue both converge to it.
    const history = Array.from({ length: 90 + WARMUP_DAYS }, (_, i) =>
      run(-i, 40)
    );
    const { points, today } = computeFitnessFatigue(history, TODAY);
    expect(points).toHaveLength(90);
    expect(points[0]?.fitness).toBeGreaterThan(0);
    // Form is within 5% of fitness, not the ~-12% a zero start would leave.
    expect(Math.abs((today?.form ?? 99) / (today?.fitness ?? 1))).toBeLessThan(
      0.05
    );
  });
});
