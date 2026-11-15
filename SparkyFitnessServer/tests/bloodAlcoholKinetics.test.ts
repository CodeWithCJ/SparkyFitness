import { describe, it, expect } from 'vitest';
import {
  bacDistributionFactor,
  bacInDisplayUnit,
  bacModelOf,
  bloodAlcoholAt,
  bloodAlcoholChartWindow,
  bloodAlcoholCurve,
  bloodAlcoholPeak,
  missingBacInputs,
  resolveBacDistributionFactor,
} from '@workspace/shared';
import type { AlcoholDose, BacBodyInputs, BacModel } from '@workspace/shared';

const HOUR = 3600 * 1000;
const t0 = Date.parse('2026-11-07T20:00:00.000Z');
const at = (hours: number) => new Date(t0 + hours * HOUR).toISOString();

const man: BacBodyInputs = {
  sex: 'male',
  ageYears: 30,
  heightCm: 180,
  weightKg: 80,
};
const woman: BacBodyInputs = {
  sex: 'female',
  ageYears: null,
  heightCm: 165,
  weightKg: 60,
};
// Widmark r for a man, 80 kg: 40 g spreads into 54.4 kg, 0.735 per mille.
const widmarkMan: BacModel = {
  distributionFactor: 0.68,
  weightKg: 80,
  eliminationRate: 0.15,
};
const oneDrink: AlcoholDose[] = [{ at: at(0), grams: 40 }];

describe('bacDistributionFactor', () => {
  it('matches the published equations for a typical man and woman', () => {
    expect(bacDistributionFactor('widmark', man)).toBe(0.68);
    expect(bacDistributionFactor('widmark', woman)).toBe(0.55);
    expect(bacDistributionFactor('watson', man)).toBeCloseTo(0.755, 3);
    expect(bacDistributionFactor('watson', woman)).toBeCloseTo(0.667, 3);
    expect(bacDistributionFactor('seidl', man)).toBeCloseTo(0.764, 3);
    expect(bacDistributionFactor('seidl', woman)).toBeCloseTo(0.662, 3);
    expect(bacDistributionFactor('forrest', man)).toBeCloseTo(0.718, 3);
    expect(bacDistributionFactor('forrest', woman)).toBeCloseTo(0.6, 3);
  });

  it('returns null instead of guessing when an input is missing', () => {
    expect(bacDistributionFactor('watson', { ...man, sex: null })).toBeNull();
    expect(
      bacDistributionFactor('seidl', { ...man, heightCm: null })
    ).toBeNull();
  });

  it('returns null for a body no formula describes, such as a mistyped weight', () => {
    expect(
      bacDistributionFactor('forrest', { ...man, weightKg: 400 })
    ).toBeNull();
  });
});

describe('resolveBacDistributionFactor', () => {
  const heavyWoman: BacBodyInputs = { ...woman, weightKg: 120 };

  it('keeps the chosen formula when it fits', () => {
    expect(resolveBacDistributionFactor('seidl', woman)).toEqual({
      formula: 'seidl',
      factor: bacDistributionFactor('seidl', woman),
      fellBackFrom: null,
    });
  });

  it('falls back to Watson when the chosen formula leaves the plausible range', () => {
    expect(bacDistributionFactor('seidl', heavyWoman)).toBeNull();
    expect(resolveBacDistributionFactor('seidl', heavyWoman)).toEqual({
      formula: 'watson',
      factor: bacDistributionFactor('watson', heavyWoman),
      fellBackFrom: 'seidl',
    });
  });

  it('does not fall back when Watson itself does not fit', () => {
    const mistyped: BacBodyInputs = { ...man, weightKg: 5 };
    expect(resolveBacDistributionFactor('watson', mistyped)).toBeNull();
    expect(resolveBacDistributionFactor('seidl', mistyped)).toBeNull();
  });

  it('returns null when an input is missing', () => {
    expect(
      resolveBacDistributionFactor('watson', { ...man, sex: null })
    ).toBeNull();
    expect(
      resolveBacDistributionFactor('seidl', { ...woman, heightCm: null })
    ).toBeNull();
  });
});

describe('missingBacInputs', () => {
  it('asks only for what the chosen formula uses', () => {
    const empty: BacBodyInputs = {
      sex: null,
      ageYears: null,
      heightCm: null,
      weightKg: null,
    };
    expect(missingBacInputs('widmark', empty)).toEqual(['sex', 'weight']);
    expect(missingBacInputs('seidl', empty)).toEqual([
      'sex',
      'weight',
      'height',
    ]);
    expect(missingBacInputs('watson', empty)).toEqual([
      'sex',
      'weight',
      'height',
      'age',
    ]);
  });

  it('does not ask a woman for her age under Watson, whose female equation has none', () => {
    expect(missingBacInputs('watson', woman)).toEqual([]);
  });
});

describe('bloodAlcoholAt', () => {
  it('is zero before the first drink and without a usable model', () => {
    expect(bloodAlcoholAt(oneDrink, widmarkMan, at(-1))).toBe(0);
    expect(bloodAlcoholAt(oneDrink, widmarkMan, at(0))).toBe(0);
    expect(bloodAlcoholAt(oneDrink, null, at(1))).toBe(0);
    expect(bloodAlcoholAt([], widmarkMan, at(1))).toBe(0);
  });

  it('follows Widmark once the drink is absorbed: dose / (r x W) minus elimination', () => {
    // 40 / 54.4 = 0.735, less 3 h x 0.15 = 0.285.
    expect(bloodAlcoholAt(oneDrink, widmarkMan, at(3))).toBeCloseTo(0.285, 2);
  });

  it('falls in a straight line after absorption (zero-order elimination)', () => {
    const drop =
      bloodAlcoholAt(oneDrink, widmarkMan, at(2)) -
      bloodAlcoholAt(oneDrink, widmarkMan, at(3));
    expect(drop).toBeCloseTo(0.15, 2);
  });

  it('never goes negative and stays at zero once the alcohol is gone', () => {
    expect(bloodAlcoholAt(oneDrink, widmarkMan, at(6))).toBe(0);
    expect(bloodAlcoholAt(oneDrink, widmarkMan, at(30))).toBe(0);
  });

  it('adds drinks taken while alcohol is still present', () => {
    const twoDrinks: AlcoholDose[] = [...oneDrink, { at: at(1), grams: 40 }];
    expect(bloodAlcoholAt(twoDrinks, widmarkMan, at(3))).toBeCloseTo(
      0.735 * 2 - 0.45,
      2
    );
  });

  it('ignores invalid drinks', () => {
    const noisy = [
      ...oneDrink,
      { at: 'not a time', grams: 40 },
      { at: at(1), grams: 0 },
      { at: at(1), grams: -5 },
    ];
    expect(bloodAlcoholAt(noisy, widmarkMan, at(3))).toBe(
      bloodAlcoholAt(oneDrink, widmarkMan, at(3))
    );
  });
});

describe('bloodAlcoholCurve', () => {
  it('agrees with bloodAlcoholAt at every sample, whatever times are asked for', () => {
    const curve = bloodAlcoholCurve(oneDrink, widmarkMan, at(-0.5), at(6), 7);
    for (const point of curve) {
      expect(point.permille).toBe(
        bloodAlcoholAt(oneDrink, widmarkMan, point.t)
      );
    }
  });

  it('rises during absorption, then falls', () => {
    const peak = bloodAlcoholPeak(oneDrink, widmarkMan, at(0), at(6));
    expect(peak).not.toBeNull();
    const peakHours = (Date.parse(peak!.at) - t0) / HOUR;
    expect(peakHours).toBeGreaterThan(0.25);
    expect(peakHours).toBeLessThan(1.5);
    expect(peak!.permille).toBeLessThan(0.735);
  });

  it('samples each drink time, so a rise never starts before the drink', () => {
    // 21:07 falls between ten-minute grid points.
    const second = at(1 + 7 / 60);
    const doses: AlcoholDose[] = [...oneDrink, { at: second, grams: 20 }];
    const curve = bloodAlcoholCurve(doses, widmarkMan, at(0), at(3));
    const secondMs = Date.parse(second);
    const atDrink = curve.find((point) => point.t === secondMs);
    expect(atDrink?.permille).toBe(bloodAlcoholAt(doses, widmarkMan, secondMs));
    // Before the second drink the curve matches the first drink alone.
    for (const point of curve.filter((p) => p.t <= secondMs)) {
      expect(point.permille).toBe(
        bloodAlcoholAt(oneDrink, widmarkMan, point.t)
      );
    }
  });

  it('returns nothing for an inverted window', () => {
    expect(bloodAlcoholCurve(oneDrink, widmarkMan, at(2), at(1))).toEqual([]);
  });
});

describe('bloodAlcoholChartWindow', () => {
  const day = {
    startMs: Date.parse('2026-11-07T00:00:00.000Z'),
    endMs: Date.parse('2026-11-08T00:00:00.000Z'),
  };
  const drinkAt = (iso: string): AlcoholDose => ({ at: iso, grams: 40 });

  it('spans from before the first drink to after the estimate is back at zero', () => {
    const window = bloodAlcoholChartWindow(oneDrink, widmarkMan, day, at(0));
    expect(window).not.toBeNull();
    expect(window!.from).toBe(t0 - 0.5 * HOUR);
    expect(window!.to).toBeGreaterThan(t0 + 4 * HOUR);
    expect(window!.to).toBeLessThan(t0 + 6 * HOUR);
  });

  it('reaches to now while the day is today, but not on a past day', () => {
    const morning = [drinkAt('2026-11-07T08:00:00.000Z')];
    const evening = Date.parse('2026-11-07T20:00:00.000Z');
    expect(bloodAlcoholChartWindow(morning, widmarkMan, day, evening)!.to).toBe(
      evening
    );
    const later = Date.parse('2026-11-09T20:00:00.000Z');
    expect(
      bloodAlcoholChartWindow(morning, widmarkMan, day, later)!.to
    ).toBeLessThan(Date.parse('2026-11-07T14:00:00.000Z'));
  });

  it('follows a late evening past midnight', () => {
    const late = [drinkAt('2026-11-07T23:00:00.000Z')];
    const window = bloodAlcoholChartWindow(late, widmarkMan, day, day.startMs);
    expect(window!.to).toBeGreaterThan(day.endMs + 3 * HOUR);
  });

  it('starts at most 12 h before the day, so an old drink cannot squash the curve', () => {
    const doses = [
      drinkAt('2026-11-06T04:00:00.000Z'),
      drinkAt('2026-11-07T10:00:00.000Z'),
    ];
    const window = bloodAlcoholChartWindow(doses, widmarkMan, day, day.startMs);
    expect(window!.from).toBe(day.startMs - 12 * HOUR);
    expect(window!.to).toBeGreaterThan(Date.parse('2026-11-07T14:00:00.000Z'));
  });

  it('is null without drinks or a model', () => {
    expect(bloodAlcoholChartWindow([], widmarkMan, day, at(0))).toBeNull();
    expect(bloodAlcoholChartWindow(oneDrink, null, day, at(0))).toBeNull();
  });
});

describe('bacModelOf and bacInDisplayUnit', () => {
  it('builds a model only from a response that has an estimate', () => {
    expect(
      bacModelOf({
        distribution_factor: 0.7,
        weight_kg: 80,
        elimination_rate: 0.15,
      })
    ).toEqual({ distributionFactor: 0.7, weightKg: 80, eliminationRate: 0.15 });
    expect(
      bacModelOf({
        distribution_factor: null,
        weight_kg: 80,
        elimination_rate: 0.15,
      })
    ).toBeNull();
  });

  it('shows per mille as percent by dividing by ten', () => {
    expect(bacInDisplayUnit(0.5, 'percent')).toBe(0.05);
    expect(bacInDisplayUnit(0.5, 'permille')).toBe(0.5);
  });
});
