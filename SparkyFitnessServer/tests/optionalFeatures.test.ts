import { describe, expect, it } from 'vitest';
import {
  FEATURE_CUSTOM_CATEGORIES,
  FEATURE_KEYS,
  FEATURE_PLATFORMS,
  MAX_FEATURE_CHOICES,
  featureChoicesPatchSchema,
  featureChoicesResponseSchema,
  featureChoicesSchema,
  featureStorage,
  filterByFeature,
  isFeatureEnabled,
  isFeatureEnabledAnywhere,
  isFeatureExplicitlyOff,
  isFeatureKey,
  platformFeatureChoicesSchema,
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

  it('keeps choices for the website and the mobile app', () => {
    expect(FEATURE_PLATFORMS).toEqual(['web', 'mobile']);
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
  it.each(
    FEATURE_PLATFORMS.flatMap((platform) => [
      { platform, cycleEnabled: undefined, on: false, explicitlyOff: false },
      { platform, cycleEnabled: null, on: false, explicitlyOff: false },
      { platform, cycleEnabled: true, on: true, explicitlyOff: false },
      { platform, cycleEnabled: false, on: false, explicitlyOff: true },
    ])
  )(
    '$platform, cycle_settings.enabled $cycleEnabled: on $on, explicitly off $explicitlyOff',
    ({ platform, cycleEnabled, on, explicitlyOff }) => {
      const sources = { choices: {}, cycleEnabled };
      expect(isFeatureEnabled('cycle', platform, sources)).toBe(on);
      expect(isFeatureExplicitlyOff('cycle', platform, sources)).toBe(
        explicitlyOff
      );
      expect(isFeatureEnabledAnywhere('cycle', sources)).toBe(on);
    }
  );

  it('never reads cycle from feature_choices', () => {
    const sources = {
      choices: { web: { cycle: true }, mobile: { cycle: true } },
      cycleEnabled: false,
    };
    expect(isFeatureEnabled('cycle', 'web', sources)).toBe(false);
    expect(isFeatureEnabledAnywhere('cycle', sources)).toBe(false);
    expect(
      isFeatureExplicitlyOff('cycle', 'mobile', {
        choices: { mobile: { cycle: false } },
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

describe('platformFeatureChoicesSchema', () => {
  it('accepts no choices, and well-formed keys this build does not know', () => {
    expect(platformFeatureChoicesSchema.safeParse({}).success).toBe(true);
    expect(
      platformFeatureChoicesSchema.safeParse({
        labResults: false,
        futureFeature1: true,
      }).success
    ).toBe(true);
  });

  it.each(['Bad', '1feature', 'oral-care', 'oral_care', '', 'a'.repeat(41)])(
    'rejects the key %j',
    (key) => {
      expect(
        platformFeatureChoicesSchema.safeParse({ [key]: true }).success
      ).toBe(false);
    }
  );

  it('rejects cycle, which is stored in cycle_settings and never here', () => {
    expect(
      platformFeatureChoicesSchema.safeParse({ cycle: true }).success
    ).toBe(false);
    expect(
      platformFeatureChoicesSchema.safeParse({
        labResults: false,
        cycle: false,
      }).success
    ).toBe(false);
  });

  it('rejects values that are not booleans', () => {
    expect(
      platformFeatureChoicesSchema.safeParse({ labResults: 'off' }).success
    ).toBe(false);
    expect(
      platformFeatureChoicesSchema.safeParse({ labResults: null }).success
    ).toBe(false);
  });

  it(`allows at most ${MAX_FEATURE_CHOICES} keys`, () => {
    expect(MAX_FEATURE_CHOICES).toBe(64);
    expect(platformFeatureChoicesSchema.safeParse(keys(64)).success).toBe(true);
    expect(platformFeatureChoicesSchema.safeParse(keys(65)).success).toBe(
      false
    );
  });
});

describe('featureChoicesSchema (the stored column)', () => {
  it('keeps one map per platform, either of them missing', () => {
    expect(featureChoicesSchema.safeParse({}).success).toBe(true);
    expect(
      featureChoicesSchema.safeParse({ web: { labResults: false } }).success
    ).toBe(true);
    expect(
      featureChoicesSchema.parse({
        web: { labResults: false },
        mobile: { labResults: true },
      })
    ).toEqual({ web: { labResults: false }, mobile: { labResults: true } });
  });

  it('reads only the platforms it knows', () => {
    expect(
      featureChoicesSchema.parse({ watch: { labResults: false } })
    ).toEqual({});
  });

  it('rejects cycle and malformed choices on either platform', () => {
    expect(
      featureChoicesSchema.safeParse({ web: { cycle: true } }).success
    ).toBe(false);
    expect(
      featureChoicesSchema.safeParse({ mobile: { cycle: false } }).success
    ).toBe(false);
    expect(
      featureChoicesSchema.safeParse({ mobile: { labResults: 'off' } }).success
    ).toBe(false);
    expect(featureChoicesSchema.safeParse({ web: [true] }).success).toBe(false);
  });

  it('is an optional field of the preferences row', () => {
    const field = userPreferencesSchema.shape.feature_choices;
    expect(field.safeParse(undefined).success).toBe(true);
    expect(field.safeParse({ mobile: { labResults: false } }).success).toBe(
      true
    );
    expect(field.safeParse({ web: { labResults: 'no' } }).success).toBe(false);
  });

  it('is what GET and PATCH /features answer with', () => {
    expect(
      featureChoicesResponseSchema.safeParse({
        feature_choices: { web: {}, mobile: { labResults: false } },
      }).success
    ).toBe(true);
    expect(featureChoicesResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe('featureChoicesPatchSchema', () => {
  it('changes one platform or both: true, false, and null to reset a key', () => {
    expect(
      featureChoicesPatchSchema.safeParse({
        web: { labResults: false, futureFeature: null },
      }).success
    ).toBe(true);
    expect(
      featureChoicesPatchSchema.safeParse({
        web: { labResults: false },
        mobile: { medications: true },
      }).success
    ).toBe(true);
  });

  it.each([
    ['an empty patch', {}],
    ['a platform with no keys', { web: {} }],
    ['choices without a platform', { labResults: false }],
    ['a platform it does not know', { watch: { labResults: false } }],
    ['an array', [true]],
    ['a value that is not a boolean', { mobile: { labResults: 'off' } }],
    ['a malformed key', { web: { 'Lab-Results': false } }],
  ])('rejects %s', (_label, body) => {
    expect(featureChoicesPatchSchema.safeParse(body).success).toBe(false);
  });

  it(`allows at most ${MAX_FEATURE_CHOICES} keys per platform`, () => {
    expect(
      featureChoicesPatchSchema.safeParse({
        web: keys(64, null),
        mobile: keys(64, false),
      }).success
    ).toBe(true);
    expect(featureChoicesPatchSchema.safeParse({ web: keys(65) }).success).toBe(
      false
    );
  });
});
