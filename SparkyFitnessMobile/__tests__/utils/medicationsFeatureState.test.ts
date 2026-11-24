import type { FeatureChoicesResponse } from '@workspace/shared';
import { medicationsFeatureState } from '../../src/utils/medicationsFeatureState';

const choices = (
  feature_choices: FeatureChoicesResponse['feature_choices']
): FeatureChoicesResponse => ({ feature_choices });

describe('medicationsFeatureState', () => {
  it('is unknown until the choices have been read', () => {
    expect(medicationsFeatureState(undefined)).toBe('unknown');
  });

  it('is on, the default, on a server older than Features', () => {
    expect(medicationsFeatureState(null)).toBe('on');
  });

  it.each([
    ['no choice', {}, 'on'],
    ['turned on in the app', { mobile: { medications: true } }, 'on'],
    ['turned off in the app', { mobile: { medications: false } }, 'off'],
    ['turned off on the website only', { web: { medications: false } }, 'on'],
    [
      'another feature turned off in the app',
      { mobile: { labResults: false } },
      'on',
    ],
  ] as const)('with %s it is %s', (_label, featureChoices, expected) => {
    expect(medicationsFeatureState(choices(featureChoices))).toBe(expected);
  });
});
