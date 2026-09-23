import {
  FOOD_PROVIDER_TYPES,
  getProviderDisplayName,
} from '@/utils/foodProviderLabels';

describe('getProviderDisplayName', () => {
  it.each([
    ['openfoodfacts', 'Open Food Facts'],
    ['usda', 'USDA'],
    ['fatsecret', 'FatSecret'],
    ['mealie', 'Mealie'],
    ['tandoor', 'Tandoor'],
    ['yazio', 'Yazio'],
    ['norish', 'Norish'],
    ['swissfood', 'SwissFood'],
    ['nutritionix', 'Nutritionix'],
  ])('maps %s to %s', (providerType, expected) => {
    expect(getProviderDisplayName(providerType)).toBe(expected);
  });

  it('labels null as Manual', () => {
    expect(getProviderDisplayName(null)).toBe('Manual');
  });

  it('labels undefined as Manual', () => {
    expect(getProviderDisplayName()).toBe('Manual');
  });

  it('passes through unknown provider types verbatim', () => {
    expect(getProviderDisplayName('mystery')).toBe('mystery');
  });
});

describe('FOOD_PROVIDER_TYPES', () => {
  it('covers the active backend providers without legacy nutritionix', () => {
    expect(FOOD_PROVIDER_TYPES).toHaveLength(8);
    expect(FOOD_PROVIDER_TYPES).not.toContain('nutritionix');
    expect(FOOD_PROVIDER_TYPES).toContain('openfoodfacts');
    expect(FOOD_PROVIDER_TYPES).toContain('usda');
  });
});
