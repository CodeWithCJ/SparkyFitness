import { describe, expect, it } from 'vitest';
import { addDays } from '@workspace/shared';
import {
  stabilizeAdaptiveTdee,
  type AdaptiveEstimateDay,
} from '../utils/adaptiveTdeeStability.js';

const start = '2026-01-01';
const date = (day: number) => addDays(start, day);
const rows = (
  weight: (day: number) => number | null = () => 70,
  activity: (day: number) => number = () => 0
): AdaptiveEstimateDay[] =>
  Array.from({ length: 240 }, (_, day) => ({
    dateStr: date(day),
    actualWeight: weight(day),
    calories: 2600,
    activityCalories: activity(day),
  }));

const calculate = (
  days: AdaptiveEstimateDay[],
  day: number,
  separateActivity = false
) => stabilizeAdaptiveTdee(days, 2400, separateActivity, date(day));

describe('quality of the inputs actually used by the expenditure average', () => {
  it('withholds reliable maintenance while an uncapped recovery contains older capped inputs', () => {
    const days = rows((day) => (day < 120 ? 70 : 73));
    const recovery = calculate(days, 148);
    expect(recovery.candidate?.rawTdee).toBeCloseTo(2600, 8);
    expect(recovery.confidence).toBe('HIGH');
    expect(recovery.tdee).toBeLessThan(2400);
    expect(recovery.historyReliable).toBe(false);
    expect(calculate(days, 200).historyReliable).toBe(true);
  });

  it('does not let a fresh HIGH candidate erase older LOW evidence even when their values match', () => {
    const days = rows((day) => (day >= 120 || day % 14 === 0 ? 70 : null));
    const recovered = calculate(days, 126);
    expect(recovered.confidence).toBe('HIGH');
    expect(recovered.tdee).toBe(2600);
    expect(recovered.candidate?.rawTdee).toBe(2600);
    expect(recovered.historyReliable).toBe(false);
  });

  it('keeps full expenditure and activity-separated history quality independent', () => {
    const days = rows(
      () => 70,
      (day) => (day < 120 ? 1000 : 0)
    );
    const recovered = calculate(days, 148, true);
    expect(recovered.tdee).toBe(2600);
    expect(recovered.candidate?.rawActivityAdjustedTdee).toBe(2600);
    expect(recovered.activityAdjustedTdee).toBeLessThan(2500);
    expect(recovered.historyReliable).toBe(true);
    expect(recovered.activityHistoryReliable).toBe(false);
  });

  it('can trust regular weekly measurements and their fresh held inputs', () => {
    const result = calculate(
      rows((day) => (day % 7 === 0 ? 70 : null)),
      120
    );
    expect(result.confidence).toBe('MEDIUM');
    expect(result.historyReliable).toBe(true);
    expect(result.activityHistoryReliable).toBe(true);
  });

  it.each([
    { calories: 2900, reliable: true },
    { calories: 2900.0001, reliable: false },
    { calories: 1900, reliable: true },
    { calories: 1899.9999, reliable: false },
  ])(
    'uses the exact uncapped band edges for $calories kcal',
    ({ calories, reliable }) => {
      const days = rows().map((row) => ({ ...row, calories }));
      const result = calculate(days, 120);
      expect(result.historyReliable).toBe(reliable);
      expect(result.activityHistoryReliable).toBe(reliable);
    }
  );

  it.each([
    { day: 130, reliable: true },
    { day: 131, reliable: false },
    { day: 135, reliable: false },
    { day: 169, reliable: false },
  ])(
    'evaluates freshness on each contributing day at date offset $day',
    ({ day, reliable }) => {
      const result = calculate(
        rows((index) => (index < 120 ? 70 : null)),
        day
      );
      expect(result.historyReliable).toBe(reliable);
      expect(result.activityHistoryReliable).toBe(reliable);
    }
  );

  it('does not call startup formula padding reliable evidence', () => {
    const days = rows((day) => (day >= 100 ? 70 : null)).map((row, day) => ({
      ...row,
      calories: day >= 100 ? 2600 : 0,
    }));
    const result = calculate(days, 116);
    expect(result.isFallback).toBe(false);
    expect(result.historyReliable).toBe(false);
  });

  it('fully reflects a sustained expenditure change within eight weeks of complete daily data', () => {
    const days = rows((day) => 70 + (Math.max(0, day - 120) * 300) / 6000);
    expect(calculate(days, 176).tdee).toBeCloseTo(2300, 6);
  });

  it('fully retires an old estimate within seven weeks without another weigh-in', () => {
    const result = calculate(
      rows((day) => (day < 120 ? 70 : null)),
      169
    );
    expect(result.isFallback).toBe(true);
    expect(result.tdee).toBe(2400);
    expect(result.historyReliable).toBe(false);
  });
});
