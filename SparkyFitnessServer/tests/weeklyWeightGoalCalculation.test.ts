import { describe, expect, it } from 'vitest';
import {
  computeCalorieTarget,
  formatWeeklyGoalRate,
  getGoalModeDailyAdjustment,
  getWeeklyGoalRateUnit,
  parseWeeklyGoalRate,
  userPreferencesMutatorSchema,
} from '@workspace/shared';

const baseline = {
  goalMode: 'weekly',
  calculationMethod: 'adaptive',
  customPercentage: -20,
  bmr: 1600,
  activityLevelMultiplier: 1.5,
  adaptiveTdee: 2800,
  adaptiveTdeeFallback: false,
  adaptiveTdeeDaysOfData: 60,
  weightKg: 80,
  heightCm: 180,
  age: 35,
  gender: 'male' as const,
  currentGoalCalories: 2400,
};

describe('weekly weight goals', () => {
  it.each([
    ['0,5', 'kg', 0.5],
    ['.125', 'kg', 0.125],
    ['500', 'g', 0.5],
    ['1', 'g', 0.001],
    ['2000', 'g', 2],
    ['1', 'lbs', 0.454],
    ['0,5', 'lbs', 0.227],
    ['4.409', 'lbs', 2],
    ['4.410', 'lbs', null],
    ['0.001', 'lbs', null],
    ['1e0', 'lbs', null],
    ['', 'kg', null],
    ['-', 'kg', null],
    ['0', 'kg', null],
    ['2.001', 'kg', null],
    ['0.0001', 'kg', null],
    ['500.5', 'g', null],
    ['1e2', 'g', null],
    ['Infinity', 'kg', null],
    ['-0.5', 'kg', null],
  ] as const)('parses a rate of %s %s as %s kg', (text, unit, expected) => {
    expect(parseWeeklyGoalRate(text, unit)).toBe(expected);
  });

  it('uses the profile weight unit with a kilogram fallback', () => {
    expect(getWeeklyGoalRateUnit('kg')).toBe('kg');
    expect(getWeeklyGoalRateUnit('lbs')).toBe('lbs');
    expect(getWeeklyGoalRateUnit('st_lbs')).toBe('st_lbs');
    expect(getWeeklyGoalRateUnit(undefined)).toBe('kg');
    expect(getWeeklyGoalRateUnit('unknown')).toBe('kg');
  });

  it('parses stones and pounds as one bounded rate', () => {
    expect(parseWeeklyGoalRate('0', 'st_lbs', '1')).toBe(0.454);
    expect(parseWeeklyGoalRate('0', 'st_lbs', '0,5')).toBe(0.227);
    expect(parseWeeklyGoalRate('1', 'st_lbs', '0')).toBeNull();
    expect(parseWeeklyGoalRate('0.5', 'st_lbs', '0')).toBeNull();
    expect(parseWeeklyGoalRate('0', 'st_lbs', '14')).toBeNull();
    expect(parseWeeklyGoalRate('0', 'st_lbs', '')).toBeNull();
    expect(parseWeeklyGoalRate('0', 'st_lbs', '-1')).toBeNull();
  });

  it('round trips every stored gram through each display unit without drift', () => {
    for (const unit of ['kg', 'g', 'lbs', 'st_lbs'] as const) {
      for (let grams = 1; grams <= 2000; grams += 1) {
        const kg = grams / 1000;
        const formatted = formatWeeklyGoalRate(-kg, unit, 'de-DE');
        expect(
          parseWeeklyGoalRate(formatted.amount, unit, formatted.pounds)
        ).toBe(kg);
      }
    }
  });

  it.each(['ar', 'fa'])('keeps editable numbers parseable in %s', (locale) => {
    for (const unit of ['kg', 'g', 'lbs', 'st_lbs'] as const) {
      const formatted = formatWeeklyGoalRate(-0.5, unit, locale);
      expect(
        parseWeeklyGoalRate(formatted.amount, unit, formatted.pounds)
      ).toBe(0.5);
    }
  });

  it.each([NaN, Infinity, -Infinity])(
    'ignores a non-finite stored rate %s',
    (rate) => {
      expect(getGoalModeDailyAdjustment('weekly', 20, 2800, rate)).toBe(0);
    }
  );

  it('validates gram precision and bounds at the shared preference boundary', () => {
    expect(
      userPreferencesMutatorSchema.safeParse({
        goal_mode: 'weekly',
        goal_mode_weekly_change_kg: -0.001,
      }).success
    ).toBe(true);
    for (const rate of [2.001, -2.001, 0.0001, NaN, Infinity]) {
      expect(
        userPreferencesMutatorSchema.safeParse({
          goal_mode: 'weekly',
          goal_mode_weekly_change_kg: rate,
        }).success
      ).toBe(false);
    }
    expect(
      userPreferencesMutatorSchema.parse({ goal_mode: 'cut' })
    ).not.toHaveProperty('goal_mode_weekly_change_kg');
  });

  it.each([
    { weeklyChangeKg: -0.5, target: 2371, deficit: 429, gain: false },
    { weeklyChangeKg: 0.25, target: 3014, deficit: -214, gain: true },
    { weeklyChangeKg: 0, target: 2800, deficit: 0, gain: false },
  ])('uses the signed weekly rate $weeklyChangeKg', (example) => {
    const result = computeCalorieTarget({ ...baseline, ...example });
    expect(result.finalTarget).toBe(example.target);
    expect(result.appliedDeficit).toBe(example.deficit);
    expect(result.isGainGoal).toBe(example.gain);
    expect(result.projectedWeeklyChangeKg).toBeCloseTo(
      example.weeklyChangeKg,
      2
    );
  });

  it('keeps the daily deficit constant when the TDEE baseline changes', () => {
    const low = computeCalorieTarget({ ...baseline, weeklyChangeKg: -0.5 });
    const high = computeCalorieTarget({
      ...baseline,
      adaptiveTdee: 3500,
      weeklyChangeKg: -0.5,
    });
    expect(high.finalTarget - low.finalTarget).toBe(700);
    expect(high.appliedDeficit).toBe(429);
  });

  it('applies the rate to the manually configured baseline as well', () => {
    const result = computeCalorieTarget({
      ...baseline,
      calculationMethod: 'manual',
      weeklyChangeKg: -0.5,
    });
    expect(result.finalTarget).toBe(1971);
  });

  it('shows the achievable weekly rate when the safety floor limits loss', () => {
    const result = computeCalorieTarget({
      ...baseline,
      adaptiveTdee: 2000,
      weeklyChangeKg: -2,
      calorieSafetyFloorMode: 'custom',
      calorieSafetyFloorValue: 1600,
    });
    expect(result.finalTarget).toBe(1600);
    expect(result.wasClampedToFloor).toBe(true);
    expect(result.projectedWeeklyChangeKg).toBeCloseTo(-0.4667, 4);
  });

  it('honors the configured floor for weekly manual targets', () => {
    const result = computeCalorieTarget({
      ...baseline,
      calculationMethod: 'manual',
      currentGoalCalories: 1800,
      weeklyChangeKg: -2,
      calorieSafetyFloorMode: 'custom',
      calorieSafetyFloorValue: 1600,
    });
    expect(result.finalTarget).toBe(1600);
    expect(result.wasClampedToFloor).toBe(true);
    expect(result.maxFeasibleDeficitPercent).toBeCloseTo(11.1111, 3);
  });

  it('ignores a saved weekly rate while a legacy percentage mode is selected', () => {
    const result = computeCalorieTarget({
      ...baseline,
      goalMode: 'cut',
      weeklyChangeKg: 1,
    });
    expect(result.finalTarget).toBe(2380);
    expect(result.appliedDeficit).toBe(420);
  });
});
