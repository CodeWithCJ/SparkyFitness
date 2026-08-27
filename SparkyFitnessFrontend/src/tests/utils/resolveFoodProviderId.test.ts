import {
  ALL_PROVIDERS_VALUE,
  resolveFoodProviderId,
  resolveSettingsFoodProviderValue,
} from '@/utils/settings';

describe('resolveFoodProviderId', () => {
  const options = [{ id: 'usda' }, { id: 'openfoodfacts' }];

  it('passes the All Providers sentinel through instead of resolving a single provider', () => {
    // Regression (#2132): the sentinel is not a real provider id, so the
    // option-list validation used to reject it and fall through to the
    // persisted default. The dropdown then snapped back to that provider and
    // the aggregated search never ran.
    expect(
      resolveFoodProviderId(ALL_PROVIDERS_VALUE, 'usda', options, false)
    ).toBe(ALL_PROVIDERS_VALUE);
  });

  it('passes the sentinel through even when it is not in the option list', () => {
    // The sentinel never appears in foodProviderOptions (that list holds real
    // active food providers), so it must not be validated against it.
    expect(options.map((o) => o.id)).not.toContain(ALL_PROVIDERS_VALUE);
    expect(
      resolveFoodProviderId(ALL_PROVIDERS_VALUE, null, options, false)
    ).toBe(ALL_PROVIDERS_VALUE);
  });

  it('does not invent the sentinel when it was not selected', () => {
    expect(resolveFoodProviderId(null, null, options, false)).not.toBe(
      ALL_PROVIDERS_VALUE
    );
  });

  it('prefers a valid explicit manual selection above everything else', () => {
    expect(resolveFoodProviderId('openfoodfacts', 'usda', options, false)).toBe(
      'openfoodfacts'
    );
  });

  it('uses the persisted default when there is no manual selection', () => {
    expect(resolveFoodProviderId(null, 'openfoodfacts', options, false)).toBe(
      'openfoodfacts'
    );
  });

  it('ignores a manual selection that is not an active option and falls through to the default', () => {
    expect(resolveFoodProviderId('fatsecret', 'usda', options, false)).toBe(
      'usda'
    );
  });

  it('ignores a persisted default that is not an active option and falls back to the first option', () => {
    // Regression: a default pointing at a now-inactive/non-food provider must
    // not be returned, or the shadcn Select renders blank (no matching item).
    expect(resolveFoodProviderId(null, 'fatsecret', options, false)).toBe(
      'usda'
    );
  });

  it('falls back to the first rendered option when nothing valid is selected', () => {
    expect(resolveFoodProviderId(null, null, options, false)).toBe('usda');
  });

  it('returns null when nothing is selectable', () => {
    expect(resolveFoodProviderId('fatsecret', 'usda', [], false)).toBeNull();
  });

  describe('persisted "All Providers" default', () => {
    it('resolves to the sentinel with no manual selection', () => {
      expect(resolveFoodProviderId(null, 'usda', options, true)).toBe(
        ALL_PROVIDERS_VALUE
      );
    });

    it('resolves to the sentinel even when no single-provider default is stored', () => {
      expect(resolveFoodProviderId(null, null, options, true)).toBe(
        ALL_PROVIDERS_VALUE
      );
    });

    it('is overridden by an explicit manual pick of a real provider', () => {
      // Peeking at one provider must win for the session; it does not clear the
      // stored default.
      expect(
        resolveFoodProviderId('openfoodfacts', 'usda', options, true)
      ).toBe('openfoodfacts');
    });

    it('degrades to the stored single provider when only one option is left', () => {
      // The dropdown hides "All Providers" below two providers, so returning the
      // sentinel would leave the Select on a value with no matching item.
      expect(resolveFoodProviderId(null, 'usda', [{ id: 'usda' }], true)).toBe(
        'usda'
      );
    });

    it('degrades to the only option when the stored single provider is no longer active', () => {
      expect(
        resolveFoodProviderId(null, 'fatsecret', [{ id: 'usda' }], true)
      ).toBe('usda');
    });

    it('returns null when the aggregated default is set but nothing is selectable', () => {
      expect(resolveFoodProviderId(null, 'usda', [], true)).toBeNull();
    });

    it('is ignored when off, even with several providers active', () => {
      expect(resolveFoodProviderId(null, 'openfoodfacts', options, false)).toBe(
        'openfoodfacts'
      );
    });
  });
});

describe('resolveSettingsFoodProviderValue', () => {
  const usda = { id: 'prov-usda' };
  const off = { id: 'prov-off' };
  const two = [usda, off];

  it('shows the sentinel when the aggregated default is on above one provider', () => {
    expect(resolveSettingsFoodProviderValue('prov-usda', two, true)).toBe(
      ALL_PROVIDERS_VALUE
    );
  });

  it('degrades to the stored provider when only one provider is left', () => {
    expect(resolveSettingsFoodProviderValue('prov-usda', [usda], true)).toBe(
      'prov-usda'
    );
  });

  it('shows the first active provider when the stored one is no longer active', () => {
    // Search resolves this state to the first active provider, so showing the
    // placeholder here would name a different provider than the one used.
    expect(resolveSettingsFoodProviderValue('prov-usda', [off], false)).toBe(
      'prov-off'
    );
  });

  it('stays empty when no default was ever stored', () => {
    // Distinct from the case above: nothing was chosen, so the placeholder is
    // the honest value rather than asserting a provider on the user's behalf.
    expect(resolveSettingsFoodProviderValue(null, two, false)).toBe('');
  });

  it('stays empty when a default is stored but no providers are active', () => {
    expect(resolveSettingsFoodProviderValue('prov-usda', [], false)).toBe('');
  });
});
