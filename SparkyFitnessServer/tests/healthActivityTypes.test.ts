import { describe, expect, it } from 'vitest';
import {
  HEALTH_ACTIVITY_TYPES,
  HEALTH_ACTIVITY_TYPE_TARGETS,
  guessHealthActivityType,
  resolveHealthActivityType,
} from '@workspace/shared';

// Apple's deprecated HKWorkoutActivityType values and the two that need
// multisport activities this app cannot write.
const HK_NEVER = new Set([14, 15, 30, 82, 83, 2998, 2999]);
// Health Connect single-movement types deprecated in favour of segments.
const HC_NEVER = new Set([
  1, 3, 6, 7, 12, 15, 17, 18, 19, 20, 21, 22, 23, 24, 30, 40, 42, 43, 49, 67,
  77,
]);
// Every HKWorkoutActivityType raw value that can be a session target.
const HK_ALL = [
  ...Array.from({ length: 84 }, (_, i) => i + 1).filter(
    (v) => v !== 81 && !HK_NEVER.has(v)
  ),
  3000,
];
// Every Health Connect exercise type that can be a session target.
const HC_ALL = Array.from({ length: 84 }, (_, i) => i).filter(
  (v) => v !== 45 && !HC_NEVER.has(v)
);

describe('health activity type targets (#1750)', () => {
  it('never targets a deprecated or unwritable type', () => {
    for (const key of HEALTH_ACTIVITY_TYPES) {
      const target = HEALTH_ACTIVITY_TYPE_TARGETS[key];
      expect(HK_NEVER.has(target.healthKit), key).toBe(false);
      expect(HC_NEVER.has(target.healthConnect), key).toBe(false);
    }
  });

  it('covers every Apple Health workout type', () => {
    const covered = new Set<number>(
      HEALTH_ACTIVITY_TYPES.map(
        (k) => HEALTH_ACTIVITY_TYPE_TARGETS[k].healthKit
      )
    );
    expect(HK_ALL.filter((v) => !covered.has(v))).toEqual([]);
  });

  it('covers every Health Connect exercise type', () => {
    const covered = new Set<number>(
      HEALTH_ACTIVITY_TYPES.map(
        (k) => HEALTH_ACTIVITY_TYPE_TARGETS[k].healthConnect
      )
    );
    expect(HC_ALL.filter((v) => !covered.has(v))).toEqual([]);
  });

  it('marks gym and studio activities indoor', () => {
    for (const key of [
      'strength_training',
      'yoga',
      'hiit',
      'pilates',
    ] as const) {
      expect(HEALTH_ACTIVITY_TYPE_TARGETS[key]).toMatchObject({ indoor: true });
    }
    expect(HEALTH_ACTIVITY_TYPE_TARGETS.walking).not.toHaveProperty('indoor');
  });

  it('keys fit the database format check', () => {
    for (const key of HEALTH_ACTIVITY_TYPES) {
      expect(key).toMatch(/^[a-z][a-z_]{1,39}$/);
    }
  });
});

describe('resolveHealthActivityType', () => {
  it('uses the stored override when it is a known key', () => {
    expect(
      resolveHealthActivityType({
        name: 'Walking into Mordor',
        category: 'Strength',
        modality: 'weight_reps',
        health_activity_type: 'walking',
      })
    ).toBe('walking');
  });

  it('ignores an unknown override and guesses instead', () => {
    expect(
      resolveHealthActivityType({
        name: 'Treadmill Walk',
        health_activity_type: 'moonwalking',
      })
    ).toBe('walking_treadmill');
  });

  it.each([
    ['Walking (Indoor)', 'walking_treadmill'],
    ['Walking pad', 'walking_treadmill'],
    ['Walking', 'walking'],
    ['Walking into Mordor', 'walking'],
    ['Treadmill Run', 'running_treadmill'],
    ['Running', 'running'],
    ['Indoor Cycling', 'cycling_indoor'],
    ['Spin class', 'cycling_indoor'],
    ['Road bike ride', 'cycling'],
    ['Rowing Machine', 'rowing_machine'],
    ['Open water swim', 'swimming_open_water'],
    ['Swimming', 'swimming_pool'],
    ['StairMaster', 'stair_climbing_machine'],
    ['Yoga', 'yoga'],
    ['HIIT', 'hiit'],
    ['Pickleball', 'pickleball'],
    ['Hiking', 'hiking'],
  ])('guesses %s as %s', (name, expected) => {
    expect(guessHealthActivityType({ name, modality: 'duration' })).toBe(
      expected
    );
  });

  it('treats set-based modalities as strength, so lifts are never cardio', () => {
    expect(
      guessHealthActivityType({ name: 'Barbell Row', modality: 'weight_reps' })
    ).toBe('strength_training');
    expect(
      guessHealthActivityType({
        name: 'Walking Lunge',
        modality: 'weight_reps',
      })
    ).toBe('strength_training');
    expect(
      guessHealthActivityType({ name: 'Crunch', modality: 'reps_only' })
    ).toBe('strength_training');
  });

  it('does not match a stem inside another word', () => {
    expect(guessHealthActivityType({ name: 'Crunches' })).toBe('other');
  });

  it('falls back on the category, then other', () => {
    expect(
      guessHealthActivityType({ name: 'Mystery', category: 'Cardio' })
    ).toBe('mixed_cardio');
    expect(guessHealthActivityType({ name: 'Mystery' })).toBe('other');
  });
});
