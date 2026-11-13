import { describe, expect, it } from 'vitest';
import {
  NO_ADAPTIVE_ADJUSTMENT,
  applyAdaptiveLoadFactor,
  decideAdaptiveAdjustment,
  shouldSuggestVariation,
  type ExerciseCoachingSignal,
} from '@workspace/shared';
import { buildCoachingSignal } from '../services/adaptiveWorkoutService.js';
import type { RecentPerformanceRow } from '../models/workoutFeedbackRepository.js';

function signal(
  overrides: Partial<ExerciseCoachingSignal> = {}
): ExerciseCoachingSignal {
  return {
    exercise_id: 'ex',
    last_performed_date: '2026-09-24',
    days_since_last_performed: 2,
    last_difficulty: null,
    last_pain: null,
    too_easy_streak: 0,
    too_hard_streak: 0,
    pain_streak: 0,
    avg_rpe: null,
    avg_rir: null,
    sessions_in_variation_window: 1,
    ...overrides,
  };
}

describe('decideAdaptiveAdjustment', () => {
  it('changes nothing without a signal, feedback, or when it is stale', () => {
    expect(decideAdaptiveAdjustment(null)).toBe(NO_ADAPTIVE_ADJUSTMENT);
    expect(decideAdaptiveAdjustment(signal())).toBe(NO_ADAPTIVE_ADJUSTMENT);
    expect(
      decideAdaptiveAdjustment(
        signal({ last_pain: 'exercise', days_since_last_performed: 30 })
      )
    ).toBe(NO_ADAPTIVE_ADJUSTMENT);
  });

  it('pain in the exercise: lighter, never heavier, and offers alternatives', () => {
    const result = decideAdaptiveAdjustment(
      signal({ last_pain: 'exercise', pain_streak: 1, too_easy_streak: 3 })
    );
    expect(result).toMatchObject({
      kind: 'reduce',
      loadFactor: 0.9,
      blockIncrease: true,
      addIncrement: false,
      suggestAlternative: true,
      reason: 'pain_reported',
    });
  });

  it('repeated pain says so', () => {
    expect(
      decideAdaptiveAdjustment(
        signal({ last_pain: 'exercise', pain_streak: 2 })
      ).reason
    ).toBe('pain_repeated');
  });

  it('unspecified session pain holds load', () => {
    expect(
      decideAdaptiveAdjustment(
        signal({ last_pain: 'session', last_difficulty: 'too_easy' })
      )
    ).toMatchObject({
      kind: 'hold',
      blockIncrease: true,
      reason: 'session_pain',
    });
  });

  it('too hard holds, twice in a row reduces', () => {
    expect(
      decideAdaptiveAdjustment(
        signal({ last_difficulty: 'too_hard', too_hard_streak: 1 })
      )
    ).toMatchObject({ kind: 'hold', reason: 'too_hard', loadFactor: 1 });
    expect(
      decideAdaptiveAdjustment(
        signal({ last_difficulty: 'too_hard', too_hard_streak: 2 })
      )
    ).toMatchObject({
      kind: 'reduce',
      reason: 'too_hard_repeated',
      loadFactor: 0.9,
    });
  });

  it('high logged effort holds only when there is no explicit answer', () => {
    expect(decideAdaptiveAdjustment(signal({ avg_rpe: 9.5 })).reason).toBe(
      'high_effort'
    );
    expect(decideAdaptiveAdjustment(signal({ avg_rir: 0 })).reason).toBe(
      'high_effort'
    );
    expect(
      decideAdaptiveAdjustment(
        signal({ avg_rpe: 10, last_difficulty: 'just_right' })
      )
    ).toBe(NO_ADAPTIVE_ADJUSTMENT);
  });

  it('low logged effort adds a step only when there is no explicit answer', () => {
    expect(decideAdaptiveAdjustment(signal({ avg_rpe: 7 }))).toMatchObject({
      kind: 'increase',
      addIncrement: true,
      reason: 'low_effort',
    });
    expect(decideAdaptiveAdjustment(signal({ avg_rpe: 6 })).reason).toBe(
      'low_effort'
    );
    expect(decideAdaptiveAdjustment(signal({ avg_rir: 3 })).reason).toBe(
      'low_effort'
    );
    // Just above the line, and anything the lifter answered, change nothing.
    expect(decideAdaptiveAdjustment(signal({ avg_rpe: 7.5 }))).toBe(
      NO_ADAPTIVE_ADJUSTMENT
    );
    expect(
      decideAdaptiveAdjustment(
        signal({ avg_rpe: 6, last_difficulty: 'too_hard' })
      ).reason
    ).toBe('too_hard');
    expect(
      decideAdaptiveAdjustment(
        signal({ avg_rpe: 6, last_difficulty: 'just_right' })
      )
    ).toBe(NO_ADAPTIVE_ADJUSTMENT);
  });

  it('too easy needs two in a row before adding load', () => {
    expect(
      decideAdaptiveAdjustment(
        signal({ last_difficulty: 'too_easy', too_easy_streak: 1 })
      )
    ).toBe(NO_ADAPTIVE_ADJUSTMENT);
    expect(
      decideAdaptiveAdjustment(
        signal({ last_difficulty: 'too_easy', too_easy_streak: 2 })
      )
    ).toMatchObject({
      kind: 'increase',
      addIncrement: true,
      reason: 'too_easy_repeated',
    });
  });
});

describe('applyAdaptiveLoadFactor', () => {
  it('rounds down to a loadable step', () => {
    expect(applyAdaptiveLoadFactor(100, 0.9, 'kg')).toBe(90);
    expect(applyAdaptiveLoadFactor(225, 0.9, 'lbs')).toBe(200);
    expect(applyAdaptiveLoadFactor(62.5, 0.9, 'kg')).toBe(55);
  });

  it('always drops at least one step', () => {
    expect(applyAdaptiveLoadFactor(10, 0.9, 'kg')).toBe(7.5);
    expect(applyAdaptiveLoadFactor(20, 0.9, 'lbs')).toBe(15);
  });

  it('leaves weights it cannot reduce alone', () => {
    expect(applyAdaptiveLoadFactor(2, 0.9, 'kg')).toBe(2);
    expect(applyAdaptiveLoadFactor(0, 0.9, 'kg')).toBe(0);
    expect(applyAdaptiveLoadFactor(100, 1, 'kg')).toBe(100);
  });
});

describe('shouldSuggestVariation', () => {
  it('suggests swapping an accessory done nearly every session', () => {
    const busy = signal({ sessions_in_variation_window: 6 });
    expect(shouldSuggestVariation(busy, 'isolation')).toBe(true);
    expect(shouldSuggestVariation(busy, null)).toBe(true);
  });

  it('leaves compound lifts, painful exercises and infrequent ones alone', () => {
    expect(
      shouldSuggestVariation(
        signal({ sessions_in_variation_window: 8 }),
        'Compound'
      )
    ).toBe(false);
    expect(
      shouldSuggestVariation(
        signal({ sessions_in_variation_window: 8, last_pain: 'session' }),
        'isolation'
      )
    ).toBe(false);
    expect(
      shouldSuggestVariation(signal({ sessions_in_variation_window: 5 }), null)
    ).toBe(false);
  });
});

describe('buildCoachingSignal', () => {
  function row(overrides: Partial<RecentPerformanceRow>): RecentPerformanceRow {
    return {
      exercise_id: 'ex',
      exercise_entry_id: 'e',
      entry_date: '2026-09-24',
      exercise_difficulty: null,
      exercise_pain: null,
      session_difficulty: null,
      session_pain: null,
      session_pain_targeted: false,
      avg_rpe: null,
      avg_rir: null,
      ...overrides,
    };
  }

  it('returns null without history', () => {
    expect(buildCoachingSignal('ex', [], 0, '2026-09-26')).toBeNull();
  });

  it('prefers the exercise answer over the session answer and counts streaks', () => {
    const result = buildCoachingSignal(
      'ex',
      [
        row({
          entry_date: '2026-09-24',
          exercise_difficulty: 'too_easy',
          session_difficulty: 'too_hard',
        }),
        row({ entry_date: '2026-09-20', session_difficulty: 'too_easy' }),
        row({ entry_date: '2026-09-16', session_difficulty: 'too_hard' }),
      ],
      3,
      '2026-09-26'
    );
    expect(result).toMatchObject({
      last_performed_date: '2026-09-24',
      days_since_last_performed: 2,
      last_difficulty: 'too_easy',
      too_easy_streak: 2,
      too_hard_streak: 0,
      sessions_in_variation_window: 3,
    });
  });

  it('attributes session pain only when no exercise was named', () => {
    const untargeted = buildCoachingSignal(
      'ex',
      [row({ session_pain: true })],
      1,
      '2026-09-26'
    );
    expect(untargeted?.last_pain).toBe('session');

    const elsewhere = buildCoachingSignal(
      'ex',
      [row({ session_pain: true, session_pain_targeted: true })],
      1,
      '2026-09-26'
    );
    expect(elsewhere?.last_pain).toBeNull();

    const here = buildCoachingSignal(
      'ex',
      [
        row({
          exercise_pain: true,
          session_pain: true,
          session_pain_targeted: true,
        }),
        row({ entry_date: '2026-09-20', exercise_pain: true }),
      ],
      1,
      '2026-09-26'
    );
    expect(here).toMatchObject({ last_pain: 'exercise', pain_streak: 2 });
  });

  it('breaks a streak on the first session without that answer', () => {
    const result = buildCoachingSignal(
      'ex',
      [
        row({ exercise_difficulty: 'too_hard' }),
        row({ entry_date: '2026-09-20' }),
        row({ entry_date: '2026-09-16', exercise_difficulty: 'too_hard' }),
      ],
      1,
      '2026-09-26'
    );
    expect(result?.too_hard_streak).toBe(1);
  });

  it('treats two entries on one day as one workout', () => {
    const result = buildCoachingSignal(
      'ex',
      [
        row({ entry_date: '2026-09-24', exercise_difficulty: 'too_hard' }),
        row({ entry_date: '2026-09-24', exercise_pain: true }),
        row({ entry_date: '2026-09-20', exercise_difficulty: 'too_hard' }),
      ],
      2,
      '2026-09-26'
    );
    expect(result).toMatchObject({
      last_difficulty: 'too_hard',
      last_pain: 'exercise',
      too_hard_streak: 2,
      pain_streak: 1,
    });
  });

  it('carries the last session effort averages', () => {
    const result = buildCoachingSignal(
      'ex',
      [row({ avg_rpe: 9.25, avg_rir: 1 })],
      1,
      '2026-09-26'
    );
    expect(result).toMatchObject({ avg_rpe: 9.25, avg_rir: 1 });
  });
});
