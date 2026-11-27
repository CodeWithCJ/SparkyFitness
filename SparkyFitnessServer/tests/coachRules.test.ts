import { describe, expect, it } from 'vitest';
import {
  BUILTIN_COACHES,
  dailyOutlook,
  mutedRuleIds,
  evaluateCoachRules,
  loggingStreak,
  mergeBuiltinRules,
  slotPartOf,
  type CoachRules,
} from '@workspace/shared';

const recovery = mergeBuiltinRules('recovery', null);

describe('slotPartOf', () => {
  it('calls a check-in before noon a morning and the rest an evening', () => {
    expect(slotPartOf('08:00')).toBe('morning');
    expect(slotPartOf('11:45')).toBe('morning');
    expect(slotPartOf('12:00')).toBe('evening');
    expect(slotPartOf('19:00')).toBe('evening');
  });
});

describe('evaluateCoachRules', () => {
  it('matches a rule when every condition holds, and says why', () => {
    const matches = evaluateCoachRules(
      recovery,
      { hours_since_strength: 20, protein_pct_of_goal: 61 },
      'evening'
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.ruleId).toBe('protein_after_strength');
    expect(matches[0]?.because).toEqual([
      { signal: 'hours_since_strength', value: 20, op: 'lte', threshold: 48 },
      { signal: 'protein_pct_of_goal', value: 61, op: 'lt', threshold: 70 },
    ]);
  });

  it('stays quiet when one condition fails', () => {
    expect(
      evaluateCoachRules(
        recovery,
        { hours_since_strength: 60, protein_pct_of_goal: 30 },
        'evening'
      )
    ).toEqual([]);
  });

  it('never matches on a signal that is null or missing', () => {
    expect(
      evaluateCoachRules(
        recovery,
        { hours_since_strength: null, protein_pct_of_goal: 10 },
        'evening'
      )
    ).toEqual([]);
    expect(
      evaluateCoachRules(recovery, { protein_pct_of_goal: 10 }, 'evening')
    ).toEqual([]);
  });

  it('applies morning rules only in the morning', () => {
    const consistency = mergeBuiltinRules('consistency', null);
    const signals = { days_since_last_log: 3, calories_pct_of_goal: 5 };
    expect(
      evaluateCoachRules(consistency, signals, 'morning').map((m) => m.ruleId)
    ).toEqual(['logging_gap']);
    expect(
      evaluateCoachRules(consistency, signals, 'evening').map((m) => m.ruleId)
    ).toEqual(['nothing_logged_today']);
  });

  it('compares directions for equality only', () => {
    const rules: CoachRules = {
      version: 1,
      rules: [
        {
          id: 'drifting',
          enabled: true,
          when: 'any',
          conditions: [
            { signal: 'weight_trend_direction', op: 'eq', value: 'away' },
          ],
        },
      ],
    };
    expect(
      evaluateCoachRules(rules, { weight_trend_direction: 'away' }, 'morning')
    ).toHaveLength(1);
    expect(
      evaluateCoachRules(rules, { weight_trend_direction: 'toward' }, 'morning')
    ).toEqual([]);
  });

  it('skips a disabled rule', () => {
    const rules = mergeBuiltinRules('recovery', {
      version: 1,
      rules: [{ id: 'protein_after_strength', enabled: false }],
    });
    expect(
      evaluateCoachRules(
        rules,
        { hours_since_strength: 1, protein_pct_of_goal: 1 },
        'evening'
      )
    ).toEqual([]);
  });
});

describe('mergeBuiltinRules', () => {
  it('lays the stored threshold over the catalog rule', () => {
    const merged = mergeBuiltinRules('recovery', {
      version: 1,
      rules: [
        {
          id: 'protein_after_strength',
          conditions: [
            { signal: 'hours_since_strength', op: 'lte', value: 24 },
            { signal: 'protein_pct_of_goal', op: 'lt', value: 50 },
          ],
        },
      ],
    });
    const rule = merged.rules.find((r) => r.id === 'protein_after_strength');
    expect(rule?.conditions[1]?.value).toBe(50);
    expect(rule?.enabled).toBe(true);
  });

  it('ignores a stored change for a rule the catalog no longer has', () => {
    const merged = mergeBuiltinRules('recovery', {
      version: 1,
      rules: [{ id: 'gone', enabled: false }],
    });
    expect(merged.rules.map((r) => r.id)).toEqual(
      mergeBuiltinRules('recovery', null).rules.map((r) => r.id)
    );
  });

  it('returns no rules for an unknown coach', () => {
    expect(mergeBuiltinRules('nope', null).rules).toEqual([]);
  });

  it('keeps every catalog rule inside the limits', () => {
    for (const coach of BUILTIN_COACHES) {
      expect(coach.defaultRules.length).toBeLessThanOrEqual(8);
      for (const rule of coach.defaultRules) {
        expect(rule.conditions.length).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe('loggingStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(
      loggingStreak(['2026-11-25', '2026-11-24', '2026-11-23'], '2026-11-25')
    ).toBe(3);
  });
  it('lets the streak start from yesterday', () => {
    expect(loggingStreak(['2026-11-24', '2026-11-23'], '2026-11-25')).toBe(2);
  });
  it('is zero after a gap, and with no days', () => {
    expect(loggingStreak(['2026-11-22'], '2026-11-25')).toBe(0);
    expect(loggingStreak([], '2026-11-25')).toBe(0);
  });
  it('stops at the first missing day', () => {
    expect(
      loggingStreak(['2026-11-25', '2026-11-24', '2026-11-22'], '2026-11-25')
    ).toBe(2);
  });
});

describe('rule contexts', () => {
  const rules = (when: string) =>
    ({
      version: 1,
      rules: [{ id: 'r', enabled: true, when, conditions: [] }],
    }) as unknown as CoachRules;

  it('runs a first-morning rule only at the first morning check-in', () => {
    const outlook = rules('first_morning');
    const run = (ctx: object) =>
      evaluateCoachRules(outlook, {}, { part: 'morning', ...ctx }).length;
    expect(run({ isFirstCheckinOfDay: true })).toBe(1);
    expect(run({ isFirstCheckinOfDay: false })).toBe(0);
    expect(
      evaluateCoachRules(
        outlook,
        {},
        { part: 'evening', isFirstCheckinOfDay: true }
      )
    ).toEqual([]);
  });

  it('runs a weekday rule at the first check-in on its day', () => {
    const weekly = rules('weekday');
    expect(
      evaluateCoachRules(
        weekly,
        {},
        { part: 'morning', isFirstCheckinOfDay: true, weekdayOk: true }
      )
    ).toHaveLength(1);
    expect(
      evaluateCoachRules(
        weekly,
        {},
        { part: 'morning', isFirstCheckinOfDay: true, weekdayOk: false }
      )
    ).toEqual([]);
    expect(
      evaluateCoachRules(
        weekly,
        {},
        { part: 'evening', isFirstCheckinOfDay: false, weekdayOk: true }
      )
    ).toEqual([]);
  });

  it('keeps after-workout rules out of check-ins, and check-in rules out of workouts', () => {
    const workout = rules('after_workout');
    expect(evaluateCoachRules(workout, {}, 'evening')).toEqual([]);
    expect(
      evaluateCoachRules(workout, {}, { part: 'evening', afterWorkout: true })
    ).toHaveLength(1);
    expect(
      evaluateCoachRules(
        rules('any'),
        {},
        { part: 'evening', afterWorkout: true }
      )
    ).toEqual([]);
  });

  it('compares a cycle phase by name', () => {
    const phase = {
      version: 1,
      rules: [
        {
          id: 'r',
          enabled: true,
          when: 'any',
          conditions: [{ signal: 'cycle_phase', op: 'eq', value: 'luteal' }],
        },
      ],
    } as unknown as CoachRules;
    expect(
      evaluateCoachRules(phase, { cycle_phase: 'luteal' }, 'morning')
    ).toHaveLength(1);
    expect(
      evaluateCoachRules(phase, { cycle_phase: 'follicular' }, 'morning')
    ).toEqual([]);
  });

  it('keeps a rule switched off by thumbs-down off', () => {
    const merged = mergeBuiltinRules('nutrition', {
      version: 1,
      rules: [{ id: 'water_low', enabled: false, muted: 'feedback' }],
    });
    expect(merged.rules.find((r) => r.id === 'water_low')?.enabled).toBe(false);
    expect(
      mutedRuleIds({
        version: 1,
        rules: [
          { id: 'water_low', enabled: false, muted: 'feedback' },
          { id: 'x', enabled: false },
        ],
      })
    ).toEqual(['water_low']);
  });
});

describe('dailyOutlook', () => {
  it('says to ease off after short sleep or a heavy load', () => {
    expect(
      dailyOutlook({ sleep_minutes_vs_avg: -95, training_load_ratio: 1 })
        ?.verdict
    ).toBe('easy');
    expect(
      dailyOutlook({ sleep_minutes_vs_avg: 0, training_load_ratio: 1.6 })
        ?.verdict
    ).toBe('easy');
  });
  it('says to push when load is light and sleep fine', () => {
    expect(
      dailyOutlook({ sleep_minutes_vs_avg: -10, training_load_ratio: 0.6 })
        ?.verdict
    ).toBe('push');
    expect(dailyOutlook({ training_load_ratio: 0.6 })?.verdict).toBe('push');
    expect(
      dailyOutlook({ sleep_minutes_vs_avg: -60, training_load_ratio: 0.6 })
        ?.verdict
    ).toBe('normal');
  });
  it('is normal in between, and null with nothing to go on', () => {
    expect(
      dailyOutlook({ sleep_minutes_vs_avg: -20, training_load_ratio: 1.0 })
        ?.verdict
    ).toBe('normal');
    expect(dailyOutlook({})).toBeNull();
    expect(
      dailyOutlook({ sleep_minutes_vs_avg: null, training_load_ratio: null })
    ).toBeNull();
  });
  it('lists the numbers it used', () => {
    const outlook = dailyOutlook({
      sleep_minutes_vs_avg: -100,
      training_load_ratio: 1.1,
    });
    expect(outlook?.because.map((b) => b.signal)).toEqual([
      'sleep_minutes_vs_avg',
      'training_load_ratio',
    ]);
  });
});
