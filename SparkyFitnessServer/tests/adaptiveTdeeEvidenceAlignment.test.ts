import { describe, expect, it } from 'vitest';
import { addDays } from '@workspace/shared';
import {
  stabilizeAdaptiveTdee,
  type AdaptiveEstimateDay,
} from '../utils/adaptiveTdeeStability.js';

const start = '2026-01-01';
const date = (day: number) => addDays(start, day);
const rows = (length: number): AdaptiveEstimateDay[] =>
  Array.from({ length }, (_, day) => ({
    dateStr: date(day),
    actualWeight: 70,
    calories: 2600,
    activityCalories: 0,
  }));

/** Physical fixture, independent of the estimator's regression implementation. */
function energyBalanceRows(
  intake: (day: number) => number,
  expenditure: (day: number) => number,
  activity: (day: number) => number = () => 0,
  measured: (day: number) => boolean = () => true
): AdaptiveEstimateDay[] {
  let morningWeight = 70;
  return Array.from({ length: 150 }, (_, day) => {
    const row = {
      dateStr: date(day),
      actualWeight: measured(day) ? morningWeight : null,
      calories: intake(day),
      activityCalories: activity(day),
    };
    // A day's intake/burn changes the following morning's weight. Six thousand
    // is the fixture's specified energy density, not a copied estimator helper.
    morningWeight += (intake(day) - expenditure(day)) / 6000;
    return row;
  });
}

describe('adaptive energy evidence uses the measured weight intervals', () => {
  it('does not qualify a seven-day weight span using earlier food logs', () => {
    const days = rows(28).map((row, day) => ({
      ...row,
      actualWeight: day === 20 || day === 27 ? 70 : null,
      calories: day < 14 ? 2000 : 2600,
    }));
    const result = stabilizeAdaptiveTdee(days, 2400, false, date(28));
    expect(result.isFallback).toBe(true);
    expect(result.candidate).toBeNull();
    expect(result.tdee).toBe(2400);
  });

  it('excludes intake and activity before the first measured anchor', () => {
    const days = rows(28).map((row, day) => ({
      ...row,
      actualWeight: day === 13 || day === 27 ? 70 : null,
      calories: day < 13 ? 2000 : 2600,
      activityCalories: day < 13 ? 900 : 200,
    }));
    const result = stabilizeAdaptiveTdee(days, 2400, true, date(28));
    expect(result.candidate?.daysOfData).toBe(14);
    expect(result.candidate?.avgIntake).toBeCloseTo(2600, 8);
    expect(result.candidate?.averageActivityCalories).toBeCloseTo(200, 8);
    expect(result.candidate?.rawTdee).toBeCloseTo(2600, 8);
    expect(result.candidate?.rawActivityAdjustedTdee).toBeCloseTo(2400, 8);
  });

  it('does not use the final weigh-in day food to explain a weight already measured', () => {
    const days = rows(28).map((row, day) => ({
      ...row,
      actualWeight: day === 13 || day === 27 ? 70 : null,
      calories: day === 27 ? 9000 : 2600,
      activityCalories: day === 27 ? 2000 : 200,
    }));
    const result = stabilizeAdaptiveTdee(days, 2400, true, date(28));
    expect(result.candidate?.daysOfData).toBe(14);
    expect(result.candidate?.rawTdee).toBeCloseTo(2600, 8);
    expect(result.candidate?.rawActivityAdjustedTdee).toBeCloseTo(2400, 8);
  });

  it('recovers constant expenditure through daily measured diet transitions', () => {
    const days = energyBalanceRows(
      (day) => (day % 28 < 14 ? 2000 : 2600),
      () => 2600
    );
    for (let day = 60; day < 120; day++) {
      const candidate = stabilizeAdaptiveTdee(
        days,
        2400,
        false,
        date(day)
      ).candidate;
      expect(candidate?.rawTdee).toBeCloseTo(2600, 6);
    }
  });

  it('matches variable intake and activity to irregular measurement intervals', () => {
    const activity = (day: number) => (day % 9 < 4 ? 100 : 700);
    const days = energyBalanceRows(
      (day) => (day % 11 < 5 ? 2100 : 3100),
      (day) => 2300 + activity(day),
      activity,
      (day) => day % 7 === 0 || day % 7 === 3
    );
    for (let day = 80; day < 120; day++) {
      const candidate = stabilizeAdaptiveTdee(
        days,
        2400,
        true,
        date(day)
      ).candidate;
      expect(candidate).not.toBeNull();
      expect(candidate?.rawActivityAdjustedTdee).toBeCloseTo(2300, 6);
    }
  });

  it('renormalizes unknown food days without treating them as zero intake', () => {
    const days = rows(28).map((row, day) => ({
      ...row,
      calories: day % 2 === 0 ? 2600 : 0,
      activityCalories: day % 2 === 0 ? 100 : 900,
    }));
    const result = stabilizeAdaptiveTdee(days, 2400, true, date(28));
    expect(result.candidate?.daysOfData).toBe(14);
    expect(result.candidate?.avgIntake).toBeCloseTo(2600, 8);
    expect(result.candidate?.averageActivityCalories).toBeCloseTo(100, 8);
    expect(result.candidate?.rawActivityAdjustedTdee).toBeCloseTo(2500, 8);
  });

  it('does not overflow the weighted mean for finite huge logged intake', () => {
    const days = rows(120).map((row, day) => ({
      ...row,
      calories: day % 2 === 0 ? Number.MAX_VALUE : 200,
    }));
    const result = stabilizeAdaptiveTdee(days, 2400, false, date(120));
    expect(Number.isFinite(result.candidate?.avgIntake)).toBe(true);
    expect(result.tdee).toBe(2900);
  });
});
