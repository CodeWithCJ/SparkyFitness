import type { FeatureChoicesResponse } from '@workspace/shared';
import { featureOnState } from '../../src/utils/featureOnState';

const choices = (
  feature_choices: FeatureChoicesResponse['feature_choices']
): FeatureChoicesResponse => ({ feature_choices });

describe.each(['medications', 'oralCare'] as const)(
  'featureOnState(%s)',
  (feature) => {
    it('is unknown until the choices have been read', () => {
      expect(featureOnState(feature, undefined)).toBe('unknown');
    });

    it('is on, the default, on a server older than Features', () => {
      expect(featureOnState(feature, null)).toBe('on');
    });

    it.each([
      ['no choice', {}, 'on'],
      ['turned on in the app', { mobile: { [feature]: true } }, 'on'],
      ['turned off in the app', { mobile: { [feature]: false } }, 'off'],
      ['turned off on the website only', { web: { [feature]: false } }, 'on'],
      [
        'another feature turned off in the app',
        { mobile: { labResults: false } },
        'on',
      ],
    ] as const)('with %s it is %s', (_label, featureChoices, expected) => {
      expect(featureOnState(feature, choices(featureChoices))).toBe(expected);
    });
  }
);
