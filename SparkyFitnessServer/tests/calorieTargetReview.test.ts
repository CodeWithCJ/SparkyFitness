import { describe, expect, it } from 'vitest';
import {
  reviewCalorieTarget,
  targetForRate,
  type CalorieTargetReviewInput,
} from '@workspace/shared';

const base: CalorieTargetReviewInput = {
  maintenanceKcal: 2400,
  maintenanceReliable: true,
  daysLogged: 26,
  windowDays: 28,
  averageIntakeKcal: 1950,
  dailyWeightChangeKg: -0.0714,
  currentTargetKcal: 1900,
  desiredKgPerWeek: null,
  floorKcal: 1500,
};

describe('targetForRate', () => {
  it('turns a weekly rate into calories a day at the app energy density', () => {
    expect(Math.round(targetForRate(2400, -0.5))).toBe(1971);
    expect(targetForRate(2400, 0)).toBe(2400);
  });
});

describe('reviewCalorieTarget', () => {
  it('reports the rate the target implies and the rate seen', () => {
    const review = reviewCalorieTarget(base);
    expect(review.impliedKgPerWeek).toBe(-0.58);
    expect(review.observedKgPerWeek).toBe(-0.5);
    expect(review.adherencePercent).toBe(103);
    expect(review.followedTarget).toBe(true);
    expect(review.status).toBe('on_track');
  });

  it('is off track when the weight trend differs by more than 0.25 kg a week', () => {
    const review = reviewCalorieTarget({
      ...base,
      averageIntakeKcal: 2300,
      dailyWeightChangeKg: -0.0143,
    });
    expect(review.observedKgPerWeek).toBe(-0.1);
    expect(review.followedTarget).toBe(false);
    expect(review.status).toBe('off_track');
  });

  it('does not judge while the estimate is still learning', () => {
    expect(
      reviewCalorieTarget({ ...base, maintenanceReliable: false }).status
    ).toBe('learning');
  });

  it('does not judge when too few days were logged', () => {
    expect(reviewCalorieTarget({ ...base, daysLogged: 12 }).status).toBe(
      'low_logging'
    );
  });

  it('says so when there is no saved target, and still gives options', () => {
    const review = reviewCalorieTarget({ ...base, currentTargetKcal: null });
    expect(review.status).toBe('no_target');
    expect(review.impliedKgPerWeek).toBeNull();
    expect(review.options.map((o) => o.kgPerWeek)).toEqual([
      -0.75, -0.5, -0.25, 0, 0.25,
    ]);
  });

  it('suggests the target for a desired rate and the change from today', () => {
    const review = reviewCalorieTarget({ ...base, desiredKgPerWeek: -0.5 });
    expect(review.suggestion).toMatchObject({
      kgPerWeek: -0.5,
      calories: 1970,
      changeKcal: 70,
      belowFloor: false,
    });
  });

  it('flags options under the floor and leaves the floor off when null', () => {
    const low = reviewCalorieTarget({
      ...base,
      maintenanceKcal: 1800,
      desiredKgPerWeek: -0.75,
    });
    expect(low.suggestion?.belowFloor).toBe(true);
    expect(low.options.find((o) => o.kgPerWeek === -0.75)?.belowFloor).toBe(
      true
    );
    const off = reviewCalorieTarget({
      ...base,
      maintenanceKcal: 1800,
      floorKcal: null,
      desiredKgPerWeek: -0.75,
    });
    expect(off.suggestion?.belowFloor).toBe(false);
  });
});
