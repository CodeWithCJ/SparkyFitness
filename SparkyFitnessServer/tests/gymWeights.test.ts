import { describe, expect, it } from 'vitest';
import { gymWeightStepsFor, snapToWeightStep } from '@workspace/shared';

const gym = {
  weight_unit: 'kg' as const,
  dumbbells: [2, 4, 6, 8, 10, 12.5],
  machine_stacks: [{ exercise_id: 'leg-press', weights: [5, 11.5, 18, 24.5] }],
};

describe('gym weight steps', () => {
  it("prefers the machine's own stack, then dumbbells for dumbbell work", () => {
    expect(gymWeightStepsFor(gym, 'leg-press', 'machine', 'kg')).toEqual([
      5, 11.5, 18, 24.5,
    ]);
    expect(gymWeightStepsFor(gym, 'curl', ['dumbbell'], 'kg')).toEqual(
      gym.dumbbells
    );
    expect(gymWeightStepsFor(gym, 'squat', 'barbell', 'kg')).toBeNull();
    expect(gymWeightStepsFor(null, 'curl', 'dumbbell', 'kg')).toBeNull();
  });

  it('converts steps to the lifter unit', () => {
    const lbs = gymWeightStepsFor(gym, 'curl', 'Dumbbell', 'lbs')!;
    expect(lbs[0]).toBeCloseTo(4.409, 2);
  });

  it('snaps up for increases and down for deloads, clamped to the ends', () => {
    expect(snapToWeightStep(13.5, [5, 11.5, 18], 'up')).toBe(18);
    expect(snapToWeightStep(13.5, [5, 11.5, 18], 'down')).toBe(11.5);
    expect(snapToWeightStep(11.5, [5, 11.5, 18], 'up')).toBe(11.5);
    expect(snapToWeightStep(30, [5, 11.5, 18], 'up')).toBe(18);
    expect(snapToWeightStep(2, [5, 11.5, 18], 'down')).toBe(5);
    expect(snapToWeightStep(13.5, null, 'up')).toBe(13.5);
  });
});
