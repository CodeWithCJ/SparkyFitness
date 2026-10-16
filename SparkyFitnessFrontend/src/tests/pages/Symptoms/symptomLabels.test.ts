import type { TFunction } from 'i18next';
import {
  BODY_REGIONS,
  BUILT_IN_OPTIONS,
  BUILT_IN_PHASE_OPTIONS,
  BUILT_IN_SYMPTOM_DEFINITIONS,
  BUILT_IN_TRIGGER_GROUPS,
  HEAD_REGIONS,
} from '@workspace/shared';
import {
  translateSymptomChoice,
  translateSymptomLabel,
} from '@/pages/Symptoms/symptomLabels';

// Answers every lookup with its key, so the key a label maps to is visible.
const keyOf = ((key: string) => key) as unknown as TFunction;
// Answers lookups with the default text, like an app with no translation.
const defaultOf = ((_key: string, fallback: string) =>
  fallback) as unknown as TFunction;

const builtInLabels = (): string[] => [
  ...Object.values(BUILT_IN_OPTIONS).flat(),
  ...Object.values(BUILT_IN_PHASE_OPTIONS).flat(),
  ...BUILT_IN_TRIGGER_GROUPS.flatMap((g) => [g.group, ...g.items]),
  ...BUILT_IN_SYMPTOM_DEFINITIONS.map((d) => d.displayName),
  ...HEAD_REGIONS.map((r) => r.label),
  ...BODY_REGIONS.map((r) => r.label),
];

describe('translateSymptomLabel', () => {
  it('gives every distinct built-in label its own catalog key', () => {
    const labels = [...new Set(builtInLabels())];
    const byKey = new Map<string, string[]>();
    for (const label of labels) {
      const key = translateSymptomLabel(keyOf, label);
      byKey.set(key, [...(byKey.get(key) ?? []), label]);
    }
    const collisions = [...byKey.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([key, group]) => `${key}: ${group.join(' | ')}`);
    expect(collisions).toEqual([]);
  });

  it('returns a label with no words unchanged', () => {
    expect(translateSymptomLabel(keyOf, '…')).toBe('…');
  });
});

describe('translateSymptomChoice', () => {
  it('translates built-in symptoms only', () => {
    const builtIn = BUILT_IN_SYMPTOM_DEFINITIONS[0]!;
    expect(translateSymptomChoice(keyOf, builtIn)).toMatch(
      /^symptoms\.builtIn\./
    );
    expect(
      translateSymptomChoice(keyOf, {
        name: 'my_own_symptom',
        displayName: builtIn.displayName,
      })
    ).toBe(builtIn.displayName);
    expect(
      translateSymptomChoice(defaultOf, {
        name: 'my_own_symptom',
        displayName: 'Pins and needles',
      })
    ).toBe('Pins and needles');
  });
});
