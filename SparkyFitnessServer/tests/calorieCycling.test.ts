import { describe, expect, it } from 'vitest';
import {
  applyCalorieCyclingMacroDelta,
  calorieCyclingDayType,
  calorieCyclingPattern,
  cycleDayTarget,
  cycleWeekTargets,
  isCalorieCyclingAvailable,
  parseCalorieCyclingOffsets,
  trainingRestFromOffsets,
  trainingRestOffsets,
} from '@workspace/shared';

const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);
const targetsOf = (week: ReturnType<typeof cycleWeekTargets>) =>
  week.map((day) => day.target);
/** Whole-kcal rounding of 7 days can move the week by at most 4 kcal. */
const expectWeekTotal = (
  week: ReturnType<typeof cycleWeekTargets>,
  total: number
) => expect(Math.abs(sum(targetsOf(week)) - total)).toBeLessThanOrEqual(4);

describe('cycleWeekTargets', () => {
  it('keeps the week equal to base x 7 for a training vs rest pattern', () => {
    // Mon, Wed, Fri training at +15%.
    const offsets = trainingRestOffsets([1, 3, 5], 15);
    const week = cycleWeekTargets({ baseTarget: 2600, offsets, floor: 1500 });

    expectWeekTotal(week, 2600 * 7);
    expect(week[1].target).toBeGreaterThan(2600);
    expect(week[2].target).toBeLessThan(2600);
    expect(week[1].target).toBe(week[3].target);
    expect(week.every((day) => !day.clampedToFloor)).toBe(true);
    expect(week[1].delta).toBe(week[1].target - 2600);
  });

  it('keeps the week total for a custom pattern with negative days', () => {
    const offsets = [-20, 10, 0, 10, 0, 25, -5];
    const week = cycleWeekTargets({ baseTarget: 2333, offsets, floor: null });

    expectWeekTotal(week, 2333 * 7);
    expect(week[5].target).toBe(Math.max(...targetsOf(week)));
    expect(week[0].target).toBe(Math.min(...targetsOf(week)));
  });

  it('holds low days at the floor and takes the difference from the other days', () => {
    const offsets = [-40, 40, -40, 40, -40, 40, 0];
    const week = cycleWeekTargets({ baseTarget: 1800, offsets, floor: 1500 });

    expectWeekTotal(week, 1800 * 7);
    for (const day of [0, 2, 4]) {
      expect(week[day].target).toBe(1500);
      expect(week[day].clampedToFloor).toBe(true);
    }
    expect(week.every((day) => day.target >= 1500)).toBe(true);
  });

  it('leaves every day at the base target when the base is at or below the floor', () => {
    const offsets = trainingRestOffsets([1, 3], 20);
    const week = cycleWeekTargets({ baseTarget: 1400, offsets, floor: 1500 });

    expect(targetsOf(week)).toEqual(new Array(7).fill(1400));
    expect(week.every((day) => day.delta === 0)).toBe(true);
  });

  it('leaves every day at the base target for an even pattern', () => {
    expect(
      targetsOf(
        cycleWeekTargets({
          baseTarget: 2000,
          offsets: [10, 10, 10, 10, 10, 10, 10],
          floor: 1200,
        })
      )
    ).toEqual(new Array(7).fill(2000));
    expect(
      targetsOf(
        cycleWeekTargets({
          baseTarget: 2000,
          offsets: trainingRestOffsets([], 20),
          floor: 1200,
        })
      )
    ).toEqual(new Array(7).fill(2000));
  });

  it('ignores a pattern outside the allowed range or of the wrong length', () => {
    expect(
      targetsOf(
        cycleWeekTargets({
          baseTarget: 2000,
          offsets: [50, 0, 0, 0, 0, 0, 0],
          floor: null,
        })
      )
    ).toEqual(new Array(7).fill(2000));
    expect(
      targetsOf(
        cycleWeekTargets({ baseTarget: 2000, offsets: [10, 0], floor: null })
      )
    ).toEqual(new Array(7).fill(2000));
  });

  it('cycleDayTarget returns that weekday of the week', () => {
    const offsets = trainingRestOffsets([1, 3, 5], 15);
    const week = cycleWeekTargets({ baseTarget: 2600, offsets, floor: 1500 });
    expect(
      cycleDayTarget({ baseTarget: 2600, offsets, weekday: 3, floor: 1500 })
    ).toEqual(week[3]);
  });
});

describe('calorie cycling settings', () => {
  it('is available only when exercise calories are not added back', () => {
    expect(
      isCalorieCyclingAvailable({ calorie_goal_adjustment_mode: 'fixed' })
    ).toBe(true);
    expect(
      isCalorieCyclingAvailable({ calorie_goal_adjustment_mode: 'adaptive' })
    ).toBe(true);
    expect(
      isCalorieCyclingAvailable({
        calorie_goal_adjustment_mode: 'dynamic',
        goal_mode_calculation_method: 'adaptive',
        adaptive_activity_separate: false,
      })
    ).toBe(true);
    expect(
      isCalorieCyclingAvailable({
        calorie_goal_adjustment_mode: 'dynamic',
        goal_mode_calculation_method: 'manual',
      })
    ).toBe(false);
    expect(
      isCalorieCyclingAvailable({
        calorie_goal_adjustment_mode: 'dynamic',
        goal_mode_calculation_method: 'adaptive',
        adaptive_activity_separate: true,
      })
    ).toBe(false);
    expect(
      isCalorieCyclingAvailable({ calorie_goal_adjustment_mode: 'tdee' })
    ).toBe(false);
    expect(
      isCalorieCyclingAvailable({ calorie_goal_adjustment_mode: 'smart' })
    ).toBe(false);
  });

  it('has a pattern only when switched on with uneven days', () => {
    expect(
      calorieCyclingPattern({
        calorie_cycling_mode: 'off',
        calorie_cycling_offsets: [0, 10, 0, 0, 0, 0, 0],
      })
    ).toBeNull();
    expect(
      calorieCyclingPattern({
        calorie_cycling_mode: 'custom',
        calorie_cycling_offsets: [0, 0, 0, 0, 0, 0, 0],
      })
    ).toBeNull();
    expect(
      calorieCyclingPattern({
        calorie_cycling_mode: 'training_rest',
        calorie_cycling_offsets: ['0', '15', '0', '15', '0', '15', '0'],
      })
    ).toEqual([0, 15, 0, 15, 0, 15, 0]);
  });

  it('parses only 7 whole percentages within range', () => {
    expect(parseCalorieCyclingOffsets([0, 1, 2, 3, 4, 5, 6])).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(parseCalorieCyclingOffsets([0, 1.5, 2, 3, 4, 5, 6])).toBeNull();
    expect(parseCalorieCyclingOffsets([0, -41, 2, 3, 4, 5, 6])).toBeNull();
    expect(parseCalorieCyclingOffsets(null)).toBeNull();
  });

  it('round-trips a training vs rest pattern', () => {
    const offsets = trainingRestOffsets([1, 3, 5], 15);
    expect(offsets).toEqual([0, 15, 0, 15, 0, 15, 0]);
    expect(trainingRestFromOffsets(offsets)).toEqual({
      trainingDays: [1, 3, 5],
      percent: 15,
    });
  });

  it('labels the day and moves carbs, then fat only once carbs run out', () => {
    expect(calorieCyclingDayType(120)).toBe('high');
    expect(calorieCyclingDayType(-80)).toBe('low');
    expect(calorieCyclingDayType(0)).toBe('even');
    const day = (carbs: number, fat: number, protein = 150) => ({
      protein,
      carbs,
      fat,
    });
    expect(applyCalorieCyclingMacroDelta(day(250, 60), 200)).toEqual(
      day(300, 60)
    );
    expect(applyCalorieCyclingMacroDelta(day(250, 60), -100)).toEqual(
      day(225, 60)
    );
    // 500 kcal off a day with 20 g of carbs: carbs cover 80 kcal, the other
    // 420 kcal come off fat (46.7 g), so the macros still fit the calories.
    expect(applyCalorieCyclingMacroDelta(day(20, 70), -500)).toEqual(
      day(0, 23.3)
    );
    // Past carbs and fat, the rest comes off protein: 0 g carbs and 10 g fat
    // cover 90 kcal, the other 410 kcal take 102.5 g of protein.
    expect(applyCalorieCyclingMacroDelta(day(0, 10), -500)).toEqual(
      day(0, 0, 47.5)
    );
    expect(applyCalorieCyclingMacroDelta(day(0, 0, 50), -500)).toEqual(
      day(0, 0, 0)
    );
  });
});
