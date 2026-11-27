import type { TFunction } from 'i18next';
import {
  COACH_SIGNALS,
  type CoachBecause,
  type CoachSignalKey,
} from '@workspace/shared';

/** The coach's display name: its own for a custom coach, else its catalog key. */
export function coachName(
  t: TFunction,
  key: string | null,
  name: string | null
): string {
  if (name) return name;
  // i18n-audit-ignore-next-line dynamic-i18n-key -- one name per built-in coach in the shared catalog
  return t(`coaches.names.${key ?? 'custom'}`, {
    defaultValue: key ? key.replace(/_/g, ' ') : 'Coach',
  });
}

export function signalLabel(t: TFunction, signal: CoachSignalKey): string {
  // i18n-audit-ignore-next-line dynamic-i18n-key -- one label per shared coach signal
  return t(`coaches.signals.${signal}`, {
    defaultValue: signal.replace(/_/g, ' '),
  });
}

export function signalUnit(t: TFunction, signal: CoachSignalKey): string {
  // i18n-audit-ignore-next-line dynamic-i18n-key -- one unit per shared signal kind
  return t(`coaches.units.${COACH_SIGNALS[signal].kind}`, {
    defaultValue: '',
  });
}

function wordLabel(t: TFunction, word: string): string {
  // i18n-audit-ignore-next-line dynamic-i18n-key -- one word per shared direction or phase
  return t(`coaches.directions.${word}`, { defaultValue: word });
}

/** "Protein (% of goal): 61%": the numbers behind a message. */
export function becauseText(
  t: TFunction,
  items: readonly CoachBecause[]
): string {
  return items
    .map((item) => {
      const value =
        typeof item.value === 'number'
          ? `${item.value}${signalUnit(t, item.signal)}`
          : wordLabel(t, item.value);
      return `${signalLabel(t, item.signal)}: ${value}`;
    })
    .join(' · ');
}

export function coachDescription(t: TFunction, key: string): string {
  // i18n-audit-ignore-next-line dynamic-i18n-key -- one description per built-in coach in the shared catalog
  return t(`coaches.descriptions.${key}`, { defaultValue: '' });
}
