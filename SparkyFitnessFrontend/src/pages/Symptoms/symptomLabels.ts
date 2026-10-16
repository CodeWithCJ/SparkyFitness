import type { TFunction } from 'i18next';
import { BUILT_IN_SYMPTOM_DEFINITIONS } from '@workspace/shared';

const labelKey = (label: string): string => {
  const words = label
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((word, i) =>
      i === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join('');
};

/**
 * Display text for a built-in symptom option (location, quality, trigger,
 * relief, phase or default symptom). The English label is what is stored on
 * entries, so this only translates what is shown. Labels without a catalog
 * entry, such as options the user created, render as typed.
 */
export function translateSymptomLabel(t: TFunction, label: string): string {
  const key = labelKey(label);
  return key ? t(`symptoms.builtIn.${key}`, label) : label;
}

const BUILT_IN_SYMPTOM_NAMES = new Set(
  BUILT_IN_SYMPTOM_DEFINITIONS.map((definition) => definition.name)
);

/** Translates a symptom choice only when it is one of the built-in symptoms. */
export function translateSymptomChoice(
  t: TFunction,
  choice: { name: string; displayName: string }
): string {
  return BUILT_IN_SYMPTOM_NAMES.has(choice.name)
    ? translateSymptomLabel(t, choice.displayName)
    : choice.displayName;
}
