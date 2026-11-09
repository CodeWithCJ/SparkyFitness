import { describe, expect, it } from 'vitest';
import {
  FEATURE_CUSTOM_CATEGORIES,
  FEATURE_KEYS,
  MAX_FEATURE_CHOICES,
  featureChoicesPatchSchema,
  featureChoicesSchema,
  featureStorage,
  filterByFeature,
  isFeatureEnabled,
  isFeatureExplicitlyOff,
  isFeatureKey,
  userPreferencesSchema,
  type FeatureKey,
} from '@workspace/shared';

function keys(count: number, value: boolean | null = true) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`feature${index}`, value])
  );
}

describe('optional features registry', () => {
  it('lists cycle, stored in cycle_settings', () => {
    expect(FEATURE_KEYS).toEqual(['cycle']);
    expect(featureStorage('cycle')).toBe('cycleSettings');
  });

  it('recognises only its own keys', () => {
    expect(isFeatureKey('cycle')).toBe(true);
    expect(isFeatureKey('labResults')).toBe(false);
    // Inherited object members are not features.
    expect(isFeatureKey('toString')).toBe(false);
    expect(isFeatureKey('__proto__')).toBe(false);
  });

  it('names the reproductive categories health sync stores for cycle', () => {
    expect(FEATURE_CUSTOM_CATEGORIES.cycle).toEqual([
      'menstruation_flow',
      'menstruation_period',
      'ovulation_test',
      'cervical_mucus',
      'intermenstrual_bleeding',
    ]);
  });
});

describe('cycle on and off', () => {
  it.each([
    { cycleEnabled: undefined, enabled: false, explicitlyOff: false },
    { cycleEnabled: null, enabled: false, explicitlyOff: false },
    { cycleEnabled: true, enabled: true, explicitlyOff: false },
    { cycleEnabled: false, enabled: false, explicitlyOff: true },
  ])(
    'cycle_settings.enabled $cycleEnabled: on $enabled, explicitly off $explicitlyOff',
    ({ cycleEnabled, enabled, explicitlyOff }) => {
      const sources = { choices: {}, cycleEnabled };
      expect(isFeatureEnabled('cycle', sources)).toBe(enabled);
      expect(isFeatureExplicitlyOff('cycle', sources)).toBe(explicitlyOff);
    }
  );

  it('never reads cycle from feature_choices', () => {
    const sources = { choices: { cycle: true }, cycleEnabled: false };
    expect(isFeatureEnabled('cycle', sources)).toBe(false);
    expect(
      isFeatureExplicitlyOff('cycle', {
        choices: { cycle: false },
        cycleEnabled: null,
      })
    ).toBe(false);
  });
});

describe('filterByFeature', () => {
  const items: { id: string; feature?: FeatureKey }[] = [
    { id: 'diary' },
    { id: 'cycle', feature: 'cycle' },
  ];

  it('keeps items with no feature and those whose feature is on', () => {
    expect(filterByFeature(items, () => true).map((item) => item.id)).toEqual([
      'diary',
      'cycle',
    ]);
    expect(filterByFeature(items, () => false).map((item) => item.id)).toEqual([
      'diary',
    ]);
  });
});

describe('featureChoicesSchema', () => {
  it('accepts no choices, and well-formed keys this build does not know', () => {
    expect(featureChoicesSchema.safeParse({}).success).toBe(true);
    expect(
      featureChoicesSchema.safeParse({
        labResults: false,
        futureFeature1: true,
      }).success
    ).toBe(true);
  });

  it.each(['Bad', '1feature', 'oral-care', 'oral_care', '', 'a'.repeat(41)])(
    'rejects the key %j',
    (key) => {
      expect(featureChoicesSchema.safeParse({ [key]: true }).success).toBe(
        false
      );
    }
  );

  it('rejects values that are not booleans', () => {
    expect(featureChoicesSchema.safeParse({ labResults: 'off' }).success).toBe(
      false
    );
    expect(featureChoicesSchema.safeParse({ labResults: null }).success).toBe(
      false
    );
  });

  it(`allows at most ${MAX_FEATURE_CHOICES} keys`, () => {
    expect(MAX_FEATURE_CHOICES).toBe(64);
    expect(featureChoicesSchema.safeParse(keys(64)).success).toBe(true);
    expect(featureChoicesSchema.safeParse(keys(65)).success).toBe(false);
  });

  it('is an optional field of the preferences row', () => {
    const field = userPreferencesSchema.shape.feature_choices;
    expect(field.safeParse(undefined).success).toBe(true);
    expect(field.safeParse({ labResults: false }).success).toBe(true);
    expect(field.safeParse({ labResults: 'no' }).success).toBe(false);
  });
});

describe('featureChoicesPatchSchema', () => {
  it('takes true, false, and null to reset a key', () => {
    expect(
      featureChoicesPatchSchema.safeParse({
        labResults: false,
        medications: true,
        futureFeature: null,
      }).success
    ).toBe(true);
  });

  it('rejects an empty patch, an array and non-boolean values', () => {
    expect(featureChoicesPatchSchema.safeParse({}).success).toBe(false);
    expect(featureChoicesPatchSchema.safeParse([true]).success).toBe(false);
    expect(
      featureChoicesPatchSchema.safeParse({ labResults: 'off' }).success
    ).toBe(false);
  });

  it(`allows at most ${MAX_FEATURE_CHOICES} keys`, () => {
    expect(featureChoicesPatchSchema.safeParse(keys(64, null)).success).toBe(
      true
    );
    expect(featureChoicesPatchSchema.safeParse(keys(65)).success).toBe(false);
  });
});
