import { resolveFoodProviderId } from '@/utils/settings';

describe('resolveFoodProviderId', () => {
  const options = [{ id: 'usda' }, { id: 'openfoodfacts' }];

  it('prefers an explicit manual selection above everything else', () => {
    expect(resolveFoodProviderId('fatsecret', 'usda', options)).toBe(
      'fatsecret'
    );
  });

  it('uses the persisted default when there is no manual selection', () => {
    expect(resolveFoodProviderId(null, 'openfoodfacts', options)).toBe(
      'openfoodfacts'
    );
  });

  it('falls back to the first rendered option when no default is set', () => {
    // Regression: the fallback must come from the filtered option list, not the
    // raw provider list, so it can never resolve to an id with no SelectItem
    // (which renders the dropdown blank).
    expect(resolveFoodProviderId(null, null, options)).toBe('usda');
  });

  it('returns null when nothing is selectable', () => {
    expect(resolveFoodProviderId(null, null, [])).toBeNull();
  });
});
