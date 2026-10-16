import {
  FOOD_PROVIDER_TYPES,
  getProviderDisplayName,
} from '@/utils/foodProviderLabels';

describe('getProviderDisplayName', () => {
  it.each<[string, string]>([
    ['openfoodfacts', 'Open Food Facts'],
    ['usda', 'USDA'],
    ['fatsecret', 'FatSecret'],
    ['mealie', 'Mealie'],
    ['tandoor', 'Tandoor'],
    ['yazio', 'Yazio'],
    ['norish', 'Norish'],
    ['swissfood', 'SwissFood'],
    ['canadian-nutrient-file', 'Canadian Nutrient File'],
    ['livsmedelsverket', 'Swedish Food Agency (Livsmedelsverket)'],
    ['nutritionix', 'Nutritionix'],
  ])('maps %s to %s', (providerType: string, expected: string) => {
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
    expect(FOOD_PROVIDER_TYPES).toHaveLength(10);
    expect(FOOD_PROVIDER_TYPES).not.toContain('nutritionix');
    expect(FOOD_PROVIDER_TYPES).toContain('openfoodfacts');
    expect(FOOD_PROVIDER_TYPES).toContain('usda');
    expect(FOOD_PROVIDER_TYPES).toContain('canadian-nutrient-file');
    expect(FOOD_PROVIDER_TYPES).toContain('livsmedelsverket');
  });
});
