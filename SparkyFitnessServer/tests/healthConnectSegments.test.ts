import { describe, expect, it } from 'vitest';
import {
  HC_SEGMENT,
  healthConnectSegmentFor,
  isSegmentAllowedInSession,
} from '@workspace/shared';

// Health Connect exercise (session) types used below.
const STRENGTH_TRAINING = 70;
const WALKING = 79;
const HIIT = 36;
const RUNNING = 56;
const SWIMMING_POOL = 74;

describe('Health Connect segment rules (#1750, androidx ExerciseSegment)', () => {
  it('lets universal sessions hold any segment', () => {
    expect(isSegmentAllowedInSession(HC_SEGMENT.BENCH_PRESS, HIIT)).toBe(true);
    expect(isSegmentAllowedInSession(HC_SEGMENT.YOGA, 0)).toBe(true);
  });

  it('lets any session hold the universal segments', () => {
    for (const segment of [
      HC_SEGMENT.OTHER_WORKOUT,
      HC_SEGMENT.REST,
      HC_SEGMENT.PAUSE,
      HC_SEGMENT.STRETCHING,
    ]) {
      expect(isSegmentAllowedInSession(segment, WALKING)).toBe(true);
    }
  });

  it('allows strength movements only in strength-type sessions', () => {
    expect(
      isSegmentAllowedInSession(HC_SEGMENT.BENCH_PRESS, STRENGTH_TRAINING)
    ).toBe(true);
    expect(isSegmentAllowedInSession(HC_SEGMENT.BENCH_PRESS, WALKING)).toBe(
      false
    );
    expect(isSegmentAllowedInSession(HC_SEGMENT.WALKING, RUNNING)).toBe(true);
    expect(
      isSegmentAllowedInSession(HC_SEGMENT.SWIMMING_FREESTYLE, SWIMMING_POOL)
    ).toBe(true);
  });
});

describe('healthConnectSegmentFor', () => {
  it.each([
    ['Barbell Bench Press', HC_SEGMENT.BENCH_PRESS],
    ['Barbell Back Squat', HC_SEGMENT.SQUAT],
    ['Bulgarian Split Squat', HC_SEGMENT.LUNGE],
    ['Romanian Deadlift', HC_SEGMENT.DEADLIFT],
    ['Barbell Overhead Press', HC_SEGMENT.BARBELL_SHOULDER_PRESS],
    ['Dumbbell Shoulder Press', HC_SEGMENT.SHOULDER_PRESS],
    ['Lat Pulldown', HC_SEGMENT.LAT_PULL_DOWN],
    ['Pull-Up', HC_SEGMENT.PULL_UP],
    ['Lying Leg Curl', HC_SEGMENT.LEG_CURL],
    ['Hammer Curl', HC_SEGMENT.ARM_CURL],
    ['Dumbbell Lateral Raise', HC_SEGMENT.DUMBBELL_LATERAL_RAISE],
    ['Plank', HC_SEGMENT.PLANK],
  ])('maps %s', (name, expected) => {
    expect(
      healthConnectSegmentFor(
        { name, modality: 'weight_reps' },
        STRENGTH_TRAINING
      )
    ).toBe(expected);
  });

  it('writes an unmatched loaded lift as weightlifting', () => {
    expect(
      healthConnectSegmentFor(
        { name: 'Landmine 180', modality: 'weight_reps' },
        STRENGTH_TRAINING
      )
    ).toBe(HC_SEGMENT.WEIGHTLIFTING);
  });

  it('falls back to other workout when the session does not allow the movement', () => {
    expect(
      healthConnectSegmentFor(
        { name: 'Bench Press', modality: 'weight_reps' },
        WALKING
      )
    ).toBe(HC_SEGMENT.OTHER_WORKOUT);
    expect(
      healthConnectSegmentFor(
        { name: 'Push-Up', modality: 'reps_only' },
        STRENGTH_TRAINING
      )
    ).toBe(HC_SEGMENT.OTHER_WORKOUT);
  });
});
