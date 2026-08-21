import { ALL_PROVIDERS_VALUE, resolveFoodProviderId } from '@/utils/settings';

describe('resolveFoodProviderId', () => {
  const options = [{ id: 'usda' }, { id: 'openfoodfacts' }];

  it('passes the All Providers sentinel through instead of resolving a single provider', () => {
    // Regression (#2132): the sentinel is not a real provider id, so the
    // option-list validation used to reject it and fall through to the
    // persisted default. The dropdown then snapped back to that provider and
    // the aggregated search never ran.
    expect(resolveFoodProviderId(ALL_PROVIDERS_VALUE, 'usda', options)).toBe(
      ALL_PROVIDERS_VALUE
    );
  });

  it('passes the sentinel through even when it is not in the option list', () => {
    // The sentinel never appears in foodProviderOptions (that list holds real
    // active food providers), so it must not be validated against it.
    expect(options.map((o) => o.id)).not.toContain(ALL_PROVIDERS_VALUE);
    expect(resolveFoodProviderId(ALL_PROVIDERS_VALUE, null, options)).toBe(
      ALL_PROVIDERS_VALUE
    );
  });

  it('does not invent the sentinel when it was not selected', () => {
    expect(resolveFoodProviderId(null, null, options)).not.toBe(
      ALL_PROVIDERS_VALUE
    );
  });

  it('prefers a valid explicit manual selection above everything else', () => {
    expect(resolveFoodProviderId('openfoodfacts', 'usda', options)).toBe(
      'openfoodfacts'
    );
  });

  it('uses the persisted default when there is no manual selection', () => {
    expect(resolveFoodProviderId(null, 'openfoodfacts', options)).toBe(
      'openfoodfacts'
    );
  });

  it('ignores a manual selection that is not an active option and falls through to the default', () => {
    expect(resolveFoodProviderId('fatsecret', 'usda', options)).toBe('usda');
  });

  it('ignores a persisted default that is not an active option and falls back to the first option', () => {
    // Regression: a default pointing at a now-inactive/non-food provider must
    // not be returned, or the shadcn Select renders blank (no matching item).
    expect(resolveFoodProviderId(null, 'fatsecret', options)).toBe('usda');
  });

  it('falls back to the first rendered option when nothing valid is selected', () => {
    expect(resolveFoodProviderId(null, null, options)).toBe('usda');
  });

  it('returns null when nothing is selectable', () => {
    expect(resolveFoodProviderId('fatsecret', 'usda', [])).toBeNull();
  });
});
