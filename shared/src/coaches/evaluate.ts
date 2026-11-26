import { getBuiltinCoach } from './catalog.ts';
import type {
  CoachBecause,
  CoachCondition,
  CoachRule,
  CoachRuleOverrides,
  CoachRules,
  CoachRuleWhen,
} from './rules.ts';
import type { CoachSignalSnapshot } from './signals.ts';

/** `HH:MM` before 12:00 is a morning check-in, otherwise an evening one. */
export function slotPartOf(time: string): 'morning' | 'evening' {
  const hour = Number.parseInt(time.slice(0, 2), 10);
  return hour < 12 ? 'morning' : 'evening';
}

/** What a check-in (or a new workout) is, for the rules that depend on it. */
export interface CoachEvaluationContext {
  part: 'morning' | 'evening';
  /** The first check-in of the person's day. */
  isFirstCheckinOfDay?: boolean;
  /** Today is the weekday this coach was set to run on. */
  weekdayOk?: boolean;
  /** Evaluating for a new workout, not a check-in. */
  afterWorkout?: boolean;
}

function compare(
  op: CoachCondition['op'],
  actual: number | string,
  expected: number | string
): boolean {
  if (typeof actual === 'number' && typeof expected === 'number') {
    switch (op) {
      case 'lt':
        return actual < expected;
      case 'lte':
        return actual <= expected;
      case 'gt':
        return actual > expected;
      case 'gte':
        return actual >= expected;
      case 'eq':
        return actual === expected;
    }
  }
  // Words (a direction, a cycle phase) only compare for equality.
  return op === 'eq' && actual === expected;
}

export interface CoachRuleMatch {
  ruleId: string;
  because: CoachBecause[];
  rule: CoachRule;
}

function whenApplies(
  when: CoachRuleWhen,
  context: CoachEvaluationContext
): boolean {
  if (context.afterWorkout) return when === 'after_workout';
  switch (when) {
    case 'any':
      return true;
    case 'morning':
    case 'evening':
      return when === context.part;
    case 'first_morning':
      return context.part === 'morning' && context.isFirstCheckinOfDay === true;
    case 'weekday':
      return context.isFirstCheckinOfDay === true && context.weekdayOk === true;
    case 'after_workout':
      return false;
  }
}

/** Rules that match this snapshot at a check-in or a new workout. A condition
 * on a signal that is null or missing never matches. `context` may be just
 * the part of the day. */
export function evaluateCoachRules(
  rules: CoachRules,
  signals: CoachSignalSnapshot,
  context: CoachEvaluationContext | 'morning' | 'evening'
): CoachRuleMatch[] {
  const ctx: CoachEvaluationContext =
    typeof context === 'string' ? { part: context } : context;
  const matches: CoachRuleMatch[] = [];
  for (const rule of rules.rules) {
    if (!rule.enabled || !whenApplies(rule.when, ctx)) continue;
    const because: CoachBecause[] = [];
    const allMet = rule.conditions.every((condition) => {
      const actual = signals[condition.signal];
      if (actual === null || actual === undefined) return false;
      if (!compare(condition.op, actual, condition.value)) return false;
      because.push({
        signal: condition.signal,
        value: actual,
        op: condition.op,
        threshold: condition.value,
      });
      return true;
    });
    if (allMet) matches.push({ ruleId: rule.id, because, rule });
  }
  return matches;
}

/** The catalog's rules with the user's stored changes laid over them. A
 * change for a rule the catalog no longer has is ignored; a rule switched off
 * by thumbs-down stays off until the person turns it on. */
export function mergeBuiltinRules(
  key: string,
  stored: CoachRuleOverrides | null | undefined
): CoachRules {
  const coach = getBuiltinCoach(key);
  const overrides = new Map(stored?.rules.map((rule) => [rule.id, rule]));
  const rules: CoachRule[] = (coach?.defaultRules ?? []).map((rule) => {
    const override = overrides.get(rule.id);
    return {
      ...rule,
      conditions: override?.conditions ?? [...rule.conditions],
      enabled: override?.enabled ?? rule.enabled,
    };
  });
  return { version: 1, rules };
}

/** Rule ids a person's thumbs-down switched off. */
export function mutedRuleIds(
  stored: CoachRuleOverrides | null | undefined
): string[] {
  return (stored?.rules ?? [])
    .filter((rule) => rule.muted === 'feedback' && rule.enabled === false)
    .map((rule) => rule.id);
}
