import type { TFunction } from 'i18next';
import {
  COACH_SIGNALS,
  type CoachBecause,
  type CoachCondition,
  type CoachSignalKey,
} from '@workspace/shared';

export function coachName(
  t: TFunction,
  key: string | null,
  name: string | null
) {
  if (name) return name;
  return t(`coaches.names.${key ?? 'custom'}`, key ?? 'Coach');
}

export function coachDescription(t: TFunction, key: string | null) {
  return t(`coaches.descriptions.${key ?? 'custom'}`, '');
}

export function signalLabel(t: TFunction, signal: CoachSignalKey) {
  return t(`coaches.signals.${signal}`, signal);
}

export function opLabel(t: TFunction, op: CoachCondition['op']) {
  return t(`coaches.ops.${op}`, op);
}

/** The unit a signal's number is shown in. */
export function signalUnit(t: TFunction, signal: CoachSignalKey): string {
  const kind = COACH_SIGNALS[signal].kind;
  return t(`coaches.units.${kind}`, '');
}

export function ruleTitle(
  t: TFunction,
  coachKey: string | null,
  ruleId: string
) {
  return t(`coaches.rules.${coachKey ?? 'custom'}.${ruleId}`, ruleId);
}

/** "protein % of goal 61%": one number behind a message. */
export function becauseText(t: TFunction, items: readonly CoachBecause[]) {
  return items
    .map((item) => {
      const value =
        typeof item.value === 'number'
          ? `${item.value}${signalUnit(t, item.signal)}`
          : t(`coaches.directions.${item.value}`, item.value);
      return `${signalLabel(t, item.signal)}: ${value}`;
    })
    .join(' · ');
}
