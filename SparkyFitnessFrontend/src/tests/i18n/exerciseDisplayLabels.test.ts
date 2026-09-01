import type { TFunction } from 'i18next';
import {
  exerciseDisplayLabel,
  personalRecordLabel,
} from '@/utils/exerciseDisplayLabels';
import { translateForTest } from '@/tests/mocks/reactI18next';

const translations: Record<string, string> = {
  'exerciseDisplayNames.mixedCardio': 'Mixed cardio translated',
  'exerciseDisplayNames.walking': 'Walking translated',
  'exerciseDisplayNames.play': 'Play translated',
  'exerciseAnalytics.records.distanceBest': 'Best {{distance}} time',
  'exerciseDistances.1Mile': '1 translated mile',
};

// Resolves against the catalog above, then defers to the shared mock so
// interpolation behaves the same way it does in every other suite.
const t = ((
  key: string,
  defaultValueOrOptions: string | Record<string, unknown>
) => {
  const catalogValue = translations[key];
  const options =
    typeof defaultValueOrOptions === 'string'
      ? { defaultValue: defaultValueOrOptions }
      : defaultValueOrOptions;

  return translateForTest(key, {
    ...options,
    defaultValue: catalogValue ?? options['defaultValue'],
  });
}) as unknown as TFunction;

describe('exercise display labels', () => {
  it.each([
    ['Mixed Cardio', 'Mixed cardio translated'],
    ['Walking', 'Walking translated'],
    ['Play', 'Play translated'],
    ['David custom workout', 'David custom workout'],
  ])(
    'translates built-in value %s without changing unknown values',
    (input, expected) => {
      expect(exerciseDisplayLabel(input, t)).toBe(expected);
    }
  );

  it('can preserve a user-authored exercise name that collides with a built-in label', () => {
    expect(exerciseDisplayLabel('Walking', t, false)).toBe('Walking');
  });

  it('localizes generated personal-record suffix', () => {
    expect(personalRecordLabel('5 km Best', t)).toBe('Best 5 km time');
    expect(personalRecordLabel('1 Mile Best', t)).toBe(
      'Best 1 translated mile time'
    );
  });
});
