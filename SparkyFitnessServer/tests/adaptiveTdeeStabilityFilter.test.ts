import { describe, expect, it } from 'vitest';
import {
  addDays,
  ADAPTIVE_TDEE_STABILITY_DAYS,
  ADAPTIVE_TDEE_STABILITY_MAX_DAILY_CHANGE_KCAL,
} from '@workspace/shared';
import {
  stabilizeAdaptiveTdee,
  type AdaptiveEstimateDay,
} from '../utils/adaptiveTdeeStability.js';

const origin = '2026-11-01';
const baseline = 2500;
const rawDailyBound = 1000 / ADAPTIVE_TDEE_STABILITY_DAYS;
const displayedDailyBound = ADAPTIVE_TDEE_STABILITY_MAX_DAILY_CHANGE_KCAL;

type TraceOptions = {
  weight?: (day: number) => number | null;
  calories?: (day: number) => number;
  activity?: (day: number) => number;
};

const trace = ({
  weight = () => 70,
  calories = () => 2600,
  activity = () => 0,
}: TraceOptions = {}): AdaptiveEstimateDay[] =>
  Array.from({ length: 320 }, (_, index) => {
    const day = index - 160;
    return {
      dateStr: addDays(origin, day),
      actualWeight: weight(day),
      calories: calories(day),
      activityCalories: activity(day),
    };
  });

const onDay = (
  days: readonly AdaptiveEstimateDay[],
  day = 0,
  formula = baseline,
  separateActivity = false
) =>
  stabilizeAdaptiveTdee(days, formula, separateActivity, addDays(origin, day));

function expectDailyBound(
  days: readonly AdaptiveEstimateDay[],
  start: number,
  end: number,
  separateActivity = false,
  formula = baseline
): void {
  let previous = onDay(days, start, formula, separateActivity);
  for (let day = start + 1; day <= end; day++) {
    const result = onDay(days, day, formula, separateActivity);
    expect(Math.abs(result.tdee - previous.tdee)).toBeLessThanOrEqual(
      rawDailyBound + 1e-8
    );
    expect(
      Math.abs(result.activityAdjustedTdee - previous.activityAdjustedTdee)
    ).toBeLessThanOrEqual(rawDailyBound + 1e-8);
    expect(
      Math.abs(Math.round(result.tdee) - Math.round(previous.tdee))
    ).toBeLessThanOrEqual(displayedDailyBound);
    expect(
      Math.abs(
        Math.round(result.activityAdjustedTdee) -
          Math.round(previous.activityAdjustedTdee)
      )
    ).toBeLessThanOrEqual(displayedDailyBound);
    previous = result;
  }
}

describe('finite adaptive expenditure stability', () => {
  it('learns established constant expenditure without numerical shrinkage', () => {
    const result = onDay(trace());
    expect(result.isFallback).toBe(false);
    expect(result.status).toBe('adaptive');
    expect(result.learnedDays).toBe(ADAPTIVE_TDEE_STABILITY_DAYS);
    expect(result.tdee).toBeCloseTo(2600, 9);
    expect(result.activityAdjustedTdee).toBeCloseTo(2600, 9);
    expect(result.confidence).toBe('HIGH');
    expect(result.candidate?.rawTdee).toBeCloseTo(2600, 9);
    expect(result.currentCalorieDays).toBe(28);
    expect(result.currentObservedWeightDays).toBe(28);
  });

  it('releases the first fourteen supported food days through one history input', () => {
    const days = trace({
      weight: (day) => (day >= 0 ? 70 : null),
      calories: (day) => (day >= 0 ? 4000 : 0),
    });
    expect(onDay(days, 14).isFallback).toBe(true);
    const first = onDay(days, 15);
    expect(first.isFallback).toBe(false);
    expect(first.status).toBe('learning');
    expect(first.candidate?.daysOfData).toBe(14);
    expect(first.learnedDays).toBe(1);
    expect(first.tdee).toBeCloseTo(
      2500 + 500 / ADAPTIVE_TDEE_STABILITY_DAYS,
      9
    );
    expect(onDay(days, 42).learnedDays).toBe(ADAPTIVE_TDEE_STABILITY_DAYS);
    expect(onDay(days, 42).tdee).toBeCloseTo(3000, 9);
    expectDailyBound(days, 0, 90);
  });

  it('counts learned evidence even when its value equals the formula baseline', () => {
    const result = onDay(trace({ calories: () => 2500 }));
    expect(result.isFallback).toBe(false);
    expect(result.learnedDays).toBe(ADAPTIVE_TDEE_STABILITY_DAYS);
    expect(result.tdee).toBe(2500);
  });

  it.each([1, -1])(
    'preserves a sustained %s direction within the input quantum',
    (direction) => {
      const days = trace({ weight: (day) => 70 + (direction * day) / 28 });
      const result = onDay(days);
      expect(result.candidate?.dailyWeightChangeKg).toBeCloseTo(
        direction / 28,
        12
      );
      expect(result.candidate?.rawTdee).toBeCloseTo(
        2600 - (direction * 6000) / 28,
        8
      );
      expect(result.tdee).toBeCloseTo(2600 - (direction * 6000) / 28, 3);
    }
  );

  it('uses actual dates and fitted observed endpoints for weekly measurements', () => {
    const days = trace({
      weight: (day) => (day % 7 === 0 ? 70 + day / 28 : null),
    });
    const result = onDay(days);
    expect(result.isFallback).toBe(false);
    expect(result.confidence).toBe('MEDIUM');
    expect(result.status).toBe('held');
    expect(result.candidate?.observedWeightDays).toBe(4);
    expect(result.candidate?.weightObservationSpanDays).toBe(21);
    expect(result.candidate?.dailyWeightChangeKg).toBeCloseTo(1 / 28, 12);
    expect(result.candidate?.weightChangeKg).toBeCloseTo(0.75, 12);
    expect(
      (result.candidate?.endWeightTrend ?? 0) -
        (result.candidate?.startWeightTrend ?? 0)
    ).toBeCloseTo(0.75, 12);
    expect(result.tdee).toBeCloseTo(2600 - 6000 / 28, 3);
  });

  it('can learn from two fortnight-spanning observations with appropriately low confidence', () => {
    const days = trace({
      weight: (day) => (day === -15 || day === -1 ? 70 : null),
    });
    const result = onDay(days);
    expect(result.candidate?.observedWeightDays).toBe(2);
    expect(result.candidate?.weightObservationSpanDays).toBe(14);
    expect(result.isFallback).toBe(false);
    expect(result.confidence).toBe('LOW');
    expect(result.learnedDays).toBe(1);
  });

  it('allows three fortnight-spanning observations to reach medium confidence', () => {
    const days = trace({
      weight: (day) => ([-15, -8, -1].includes(day) ? 70 : null),
    });
    expect(onDay(days).confidence).toBe('MEDIUM');
  });

  it('bounds synthetic accuracy error from a sparse bad endpoint as well as daily movement', () => {
    // True expenditure is 2600 and true weight is constant. Missing one weekly
    // reading leaves three anchors when the erroneous +1kg endpoint closes.
    const days = trace({
      weight: (day) =>
        day % 7 === 0 && day !== -21 ? 70 + (day === 0 ? 1 : 0) : null,
    });
    const first = onDay(days, 1, 2400);
    expect(first.candidate?.observedWeightDays).toBe(3);
    // Three equally spaced anchors, with +1kg only at the final anchor, fit a
    // slope of 1/14kg/day. This is observation error, not real tissue energy.
    expect(first.candidate?.rawTdee).toBeCloseTo(2600 - 6000 / 14, 8);
    const errors = Array.from({ length: 101 }, (_, day) =>
      Math.abs(onDay(days, day, 2400).tdee - 2600)
    );
    // The measured N28 peak is about 129 kcal/day. An accuracy improvement can
    // lower it; stability alone must not hide a larger error in this fixture.
    expect(Math.max(...errors)).toBeLessThanOrEqual(129);
    expect(onDay(days, 56, 2400).tdee).toBeCloseTo(2600, 9);
    expectDailyBound(days, -10, 90, false, 2400);
  });

  it('checks a synthetic refeed beside an unknown food day against known expenditure', () => {
    const weight = (day: number) =>
      70 +
      ((day > 0 ? 1000 : 0) + (day > 1 ? 1000 : 0)) / 6000 +
      (day >= 1 && day <= 7 ? 1 : 0);
    const intake = (day: number) => (day === 0 || day === 1 ? 3600 : 2600);
    // True expenditure stays 2600. Two higher-intake days change synthetic
    // tissue weight; a separate +1kg water shift lasts seven mornings.
    const complete = trace({ weight, calories: intake });
    const missing = trace({
      weight,
      calories: (day) => (day === 1 ? 0 : intake(day)),
    });
    const maximumError = (days: readonly AdaptiveEstimateDay[]) =>
      Math.max(
        ...Array.from({ length: 101 }, (_, day) =>
          Math.abs(onDay(days, day, 2400).tdee - 2600)
        )
      );
    // Case-specific engineering envelopes, not universal accuracy guarantees.
    // Current peaks are about 79 complete and 102 with the adjacent day unlogged.
    expect(maximumError(complete)).toBeLessThanOrEqual(79);
    expect(maximumError(missing)).toBeLessThanOrEqual(103);
    expect(onDay(complete, 63, 2400).tdee).toBeCloseTo(2600, 9);
    expect(onDay(missing, 63, 2400).tdee).toBeCloseTo(2600, 9);
    expectDailyBound(missing, -10, 90, false, 2400);
  });

  it('lowers only high confidence for trackers younger than six weeks', () => {
    const days = trace({ weight: (day) => (day >= -28 ? 70 : null) });
    expect(onDay(days).confidence).toBe('MEDIUM');
  });

  it('does not lose irregular observations when an internal week boundary moves', () => {
    const dates = new Set([-28, -27, -21, -14, -1]);
    const days = trace({
      weight: (day) => (dates.has(day) ? 70 : null),
      calories: () => 3000,
    });
    const first = onDay(days);
    const next = onDay(days, 1);
    expect(first.isFallback).toBe(false);
    expect(next.isFallback).toBe(false);
    expect(next.candidate).toEqual(first.candidate);
    expect(Math.abs(next.tdee - first.tdee)).toBeLessThanOrEqual(
      displayedDailyBound
    );
  });

  it('does not extrapolate weight-selected observations one day apart', () => {
    const recent = new Map([
      [-28, 70.6],
      [-22, 70.2],
      [-21, 69.6],
      [-8, 70.7],
      [-7, 70.1],
      [-1, 71],
    ]);
    const days = trace({
      weight: (day) =>
        recent.get(day) ??
        (day >= -70 && day < -28 ? 70 + (day + 28) / 28 : null),
    });
    const result = onDay(days);
    expect(result.candidate?.observedWeightDays).toBe(6);
    expect(result.candidate?.dailyWeightChangeKg).toBeGreaterThan(0);
    expect(result.candidate?.dailyWeightChangeKg).toBeLessThan(0.1);
    expect(result.candidate?.rawTdee).toBeLessThan(2600);
  });

  it.each([7, 14, 21])(
    'retains evidence across a %s-day measurement gap',
    (gap) => {
      const days = trace({ weight: (day) => (day <= 0 ? 70 : null) });
      const result = onDay(days, gap + 1);
      expect(result.isFallback).toBe(false);
      expect(result.daysSinceEstimate).toBe(gap);
      expect(result.daysSinceLastWeight).toBe(gap + 1);
      expect(result.lastWeightDate).toBe(origin);
      if (gap > 10) expect(result.confidence).toBe('LOW');
      if (gap > 14) expect(result.status).toBe('fading');
    }
  );

  it('fades to the baseline after every learned contribution expires', () => {
    const days = trace({ weight: (day) => (day <= 0 ? 70 : null) });
    const result = onDay(days, 49);
    expect(result.isFallback).toBe(true);
    expect(result.status).toBe('fallback');
    expect(result.learnedDays).toBe(0);
    expect(result.candidate).toBeNull();
    expect(result.tdee).toBe(baseline);
    expectDailyBound(days, 0, 90);
  });

  it('holds fourteen days and applies the first fade step on day fifteen', () => {
    const days = trace({ weight: (day) => (day <= 0 ? 70 : null) });
    expect(onDay(days, 15).tdee).toBeCloseTo(2600, 9);
    expect(onDay(days, 16).tdee).toBeCloseTo(
      2600 - 100 / 7 / ADAPTIVE_TDEE_STABILITY_DAYS,
      3
    );
    expect(onDay(days, 22).tdee).toBeCloseTo(
      2600 - 400 / ADAPTIVE_TDEE_STABILITY_DAYS,
      9
    );
    expect(onDay(days, 22).learnedDays).toBe(ADAPTIVE_TDEE_STABILITY_DAYS - 1);
  });

  it('reaches the continuous bound when opposite band edges replace each other', () => {
    const days = trace({ calories: (day) => (day < 0 ? 2000 : 4000) });
    const before = onDay(days, 20);
    const after = onDay(days, 21);
    expect(after.tdee - before.tdee).toBeCloseTo(rawDailyBound, 9);
    expectDailyBound(days, -10, 90);
  });

  it('gradually resumes learning after a sixty-day gap', () => {
    const days = trace({
      weight: (day) => (day <= 0 || day >= 60 ? 70 : null),
      calories: () => 4000,
    });
    expect(onDay(days, 61).isFallback).toBe(true);
    expect(onDay(days, 74).isFallback).toBe(true);
    const resumed = onDay(days, 75);
    expect(resumed.isFallback).toBe(false);
    expect(resumed.learnedDays).toBe(1);
    expect(resumed.tdee).toBeCloseTo(
      2500 + 500 / ADAPTIVE_TDEE_STABILITY_DAYS,
      9
    );
    expectDailyBound(days, 0, 120);
  });

  it('does not invent expenditure changes from new food logs without weight evidence', () => {
    const days = trace({
      weight: (day) => (day <= 0 ? 70 : null),
      calories: (day) => (day <= 0 ? 2600 : 4400),
    });
    const initial = onDay(days, 1);
    const held = onDay(days, 15);
    expect(held.candidate).toEqual(initial.candidate);
    expect(held.candidate?.avgIntake).toBe(2600);
    expect(held.tdee).toBeCloseTo(2600, 9);
  });

  it('keeps the last eligible candidate when new weight lacks enough food evidence', () => {
    const days = trace({ calories: (day) => (day <= 0 ? 2600 : 0) });
    const result = onDay(days, 20);
    expect(result.currentCalorieDays).toBe(9);
    expect(result.candidate?.daysOfData).toBe(14);
    expect(result.candidate?.calculationDate).toBe(addDays(origin, 15));
    expect(result.daysSinceEstimate).toBe(5);
    expect(result.lastWeightDate).toBe(addDays(origin, 19));
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, null])(
    'ignores invalid weight %s without interpolation',
    (weight) => {
      const result = onDay(trace({ weight: () => weight }));
      expect(result.isFallback).toBe(true);
      expect(result.candidate).toBeNull();
      expect(result.currentObservedWeightDays).toBe(0);
      expect(result.lastWeightDate).toBeUndefined();
    }
  );

  it.each([0, 199, Number.NaN, Number.POSITIVE_INFINITY])(
    'does not count invalid calorie day %s toward learning',
    (calories) => {
      const result = onDay(trace({ calories: () => calories }));
      expect(result.isFallback).toBe(true);
      expect(result.currentCalorieDays).toBe(0);
      expect(result.candidate).toBeNull();
    }
  );

  it.each([1, -1])(
    'attenuates a permanent %s kg shift without claiming to identify it',
    (shift) => {
      const days = trace({ weight: (day) => 70 + (day >= 0 ? shift : 0) });
      const values = Array.from(
        { length: 71 },
        (_, day) => onDay(days, day).tdee
      );
      const maximumArtifact = Math.max(
        ...values.map((value) => Math.abs(value - 2600))
      );
      expect(maximumArtifact).toBeCloseTo(
        6000 / ADAPTIVE_TDEE_STABILITY_DAYS,
        3
      );
      expect(values[70]).toBeCloseTo(2600, 8);
      expectDailyBound(days, 0, 90);
    }
  );

  it('bounds temporary shifts, isolated outliers, and later window exits', () => {
    for (const weight of [
      (day: number) => 70 + (day >= 0 && day < 7 ? 1 : 0),
      (day: number) => 70 + (day === 0 ? 2 : 0),
    ]) {
      const days = trace({ weight });
      expect(onDay(days, 100).tdee).toBeCloseTo(2600, 8);
      expectDailyBound(days, 0, 100);
    }
  });

  it('does not shrink symmetric noisy sustained gain or loss toward intake', () => {
    let seed = 3485;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let gainTotal = 0;
    let lossTotal = 0;
    for (let trial = 0; trial < 256; trial++) {
      const noise = Array.from({ length: 320 }, () => (random() * 2 - 1) * 0.8);
      const gain = trace({
        weight: (day) => 70 + day / 28 + noise[day + 160]!,
      });
      const loss = gain.map((day) => ({
        ...day,
        actualWeight: 140 - day.actualWeight!,
      }));
      const gainResult = onDay(gain, 0, 2600);
      const lossResult = onDay(loss, 0, 2600);
      gainTotal += gainResult.tdee;
      lossTotal += lossResult.tdee;
      expect(gainResult.tdee + lossResult.tdee).toBeCloseTo(5200, 8);
    }
    expect(Math.abs(gainTotal / 256 - (2600 - 6000 / 28))).toBeLessThan(8);
    expect(Math.abs(lossTotal / 256 - (2600 + 6000 / 28))).toBeLessThan(8);
  });

  it('subtracts recorded activity from raw energy balance before either cap', () => {
    const result = onDay(
      trace({ calories: () => 4000, activity: () => 1000 }),
      0,
      baseline,
      true
    );
    expect(result.candidate?.rawTdee).toBe(4000);
    expect(result.candidate?.averageActivityCalories).toBe(1000);
    expect(result.candidate?.rawActivityAdjustedTdee).toBe(3000);
    expect(result.tdee).toBe(3000);
    expect(result.activityAdjustedTdee).toBe(3000);
  });

  it('filters the separated baseline coherently and bounds both outputs', () => {
    const days = trace({
      calories: () => 2600,
      activity: (day) => (day < 0 ? 0 : 600),
    });
    expect(onDay(days, 100, baseline, true).activityAdjustedTdee).toBeCloseTo(
      2000,
      8
    );
    expect(onDay(days, 100, baseline, true).tdee).toBeCloseTo(2600, 8);
    expectDailyBound(days, 0, 100, true);
  });

  it('ignores invalid activity and food days in the matched activity average', () => {
    const days = trace({
      calories: (day) => (day === -1 ? 0 : 2600),
      activity: (day) =>
        day === -1 ? 9000 : day % 2 === 0 ? -100 : Number.NaN,
    });
    const result = onDay(days, 0, baseline, true);
    expect(result.candidate?.averageActivityCalories).toBe(0);
    expect(result.activityAdjustedTdee).toBe(result.tdee);
  });

  it('preserves constant expenditure through a complete-data intake change', () => {
    const days = trace({
      weight: (day) => 70 - (Math.max(0, day) * 400) / 6000,
      calories: (day) => (day < 0 ? 2600 : 2200),
    });
    const values = Array.from(
      { length: 70 },
      (_, day) => onDay(days, day).tdee
    );
    for (const value of values) expect(value).toBeCloseTo(2600, 8);
    expectDailyBound(days, 0, 100);
  });

  it('reconstructs the same finite history for full, trimmed, reversed, and repeated input', () => {
    const days = trace({
      weight: (day) => (day % 5 === 0 ? 70 + day / 50 : null),
      calories: (day) => 2600 + (day % 4) * 20,
    });
    const expected = onDay(days);
    const canonical = days.filter(
      (day) => day.dateStr >= addDays(origin, -90) && day.dateStr < origin
    );
    expect(onDay(canonical)).toEqual(expected);
    expect(onDay([...days].reverse())).toEqual(expected);
    onDay(days, 20);
    onDay(days, -20);
    expect(onDay(days)).toEqual(expected);
    expectDailyBound(days, -20, 80);
  });

  it('excludes calculation-day and future evidence from historical output', () => {
    const days = trace();
    const modified = days.map((day) =>
      day.dateStr >= origin
        ? {
            ...day,
            actualWeight: 130,
            calories: 9000,
            activityCalories: 5000,
          }
        : day
    );
    expect(onDay(modified, 0, baseline, true)).toEqual(
      onDay(days, 0, baseline, true)
    );
  });
});

describe('fixed-unit expenditure arithmetic', () => {
  it('preserves both displayed bounds for the reported fractional step vector', () => {
    const days = trace({
      calories: (day) => (day < 0 ? 1700.235294117647 : 4000.2745098039227),
    });
    const before = onDay(days, 20, 2565.25, true);
    const after = onDay(days, 21, 2565.25, true);
    expect({
      full: Math.round(after.tdee) - Math.round(before.tdee),
      separated:
        Math.round(after.activityAdjustedTdee) -
        Math.round(before.activityAdjustedTdee),
    }).toEqual({ full: 35, separated: 35 });
    // Independent closed-form daily OLS kernel: t*(28-t)/3654, t=1..27.
    // Cap each candidate to2065.25..3065.25 and sum its integer input units.
    expect(Math.abs(before.tdee - 2365.67425)).toBeLessThanOrEqual(0.0005);
    expect(Math.abs(after.tdee - 2401.388535714286)).toBeLessThanOrEqual(
      0.0005
    );
    expect(after.tdee - before.tdee).toBeCloseTo(rawDailyBound, 9);
  });

  it.each([2565.25, 2565.25049, 2565.24951, 2500.4996, 2500.5004])(
    'bounds both rounded paths at fractional baseline %s through changes and expiry',
    (formula) => {
      for (const direction of [1, -1]) {
        const days = trace({
          weight: (day) => (day <= 50 ? 70 : null),
          calories: (day) =>
            day < 0 === direction > 0 ? 1700.235294117647 : 4000.2745098039227,
          activity: (day) => (day < 10 ? 123.456789 : 333.333333),
        });
        expectDailyBound(days, -10, 120, true, formula);
      }
    }
  );

  it('keeps raw diagnostics precise while quantizing only the bounded inputs', () => {
    const intake = 2600.123456789;
    const result = onDay(trace({ calories: () => intake }), 0, 2565.25049);
    expect(result.candidate?.avgIntake).toBe(intake);
    expect(result.candidate?.rawTdee).toBe(intake);
    expect(result.tdee).toBe(2600.123);
    expect(Math.abs(result.tdee - intake)).toBeLessThanOrEqual(0.0005);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, Number.MAX_SAFE_INTEGER])(
    'rejects a baseline outside the exact integer-sum domain: %s',
    (formula) => {
      expect(() => onDay(trace(), 0, formula)).toThrow(RangeError);
    }
  );
});
