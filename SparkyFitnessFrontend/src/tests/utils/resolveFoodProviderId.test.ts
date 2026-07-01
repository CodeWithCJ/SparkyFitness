import { resolveFoodProviderId } from '@/utils/settings';

describe('resolveFoodProviderId', () => {
  const options = [{ id: 'usda' }, { id: 'openfoodfacts' }];

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
