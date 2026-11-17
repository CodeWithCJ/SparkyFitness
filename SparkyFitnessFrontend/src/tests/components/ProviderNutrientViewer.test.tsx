import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProviderNutrientViewer } from '@/components/FoodSearch/ProviderNutrientViewer';
import type { Food, FoodVariant } from '@/types/food';

// Keys set here translate to their value; every other key falls back to the
// English default, as in the shared mock.
let mockTranslations: Record<string, string> = {};
jest.mock('react-i18next', () => {
  const actual = jest.requireActual<
    typeof import('@/tests/mocks/reactI18next')
  >('@/tests/mocks/reactI18next');
  const t: typeof actual.translateForTest = (key, ...rest) =>
    mockTranslations[key] ?? actual.translateForTest(key, ...rest);
  return { ...actual, useTranslation: () => ({ t, i18n: { language: 'de' } }) };
});
jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ data: [] }),
  useUpdateCustomNutrientMutation: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));
jest.mock('@/components/Foods/CustomNutrientDialog', () => ({
  CustomNutrientDialog: () => null,
}));

const swissFood = (variant: Partial<FoodVariant>): Food => ({
  id: '',
  name: 'Buttermilch',
  is_custom: false,
  provider_type: 'swissfood',
  provider_external_id: '350031',
  default_variant: {
    serving_size: 100,
    serving_unit: 'g',
    calories: 34,
    protein: 3.4,
    carbs: 4,
    fat: 0.5,
    is_default: true,
    ...variant,
  },
});

const renderOpen = (food: Food) => {
  render(<ProviderNutrientViewer food={food} />);
  fireEvent.click(screen.getByText(/Nutrient fields reported by/));
};

const rowFor = (label: string) => screen.getByText(label).closest('div.flex');

describe('ProviderNutrientViewer', () => {
  afterEach(() => {
    mockTranslations = {};
  });

  it('badges a field from the provider map, even when its label matches no alias', () => {
    renderOpen(
      swissFood({
        provider_nutrients: { Wasser: 90.6, 'Salz (NaCl)': 0.1 },
        provider_nutrient_standard: { Wasser: 'water_ml' },
      })
    );

    expect(rowFor('Wasser')).toHaveTextContent('Standard: Water Content');
    expect(rowFor('Wasser')).not.toHaveTextContent('Add as alias');
    // Not in the map and not a standard alias: still offered as an alias.
    expect(rowFor('Salz (NaCl)')).toHaveTextContent('Add as alias');
  });

  it('does not badge a row the provider map leaves out, even if an alias matches it', () => {
    // Livsmedelsverket leaves sodium out of the map when it is derived from salt.
    renderOpen(
      swissFood({
        provider_nutrients: { 'Sodium, Na': 0, 'Salt, NaCl': 1 },
        provider_nutrient_standard: {},
      })
    );

    expect(rowFor('Sodium, Na')).not.toHaveTextContent('Standard: Sodium');
    expect(rowFor('Sodium, Na')).toHaveTextContent('Add as alias');
  });

  it('falls back to the label aliases when the provider sends no map', () => {
    renderOpen(
      swissFood({
        provider_nutrients: { Calcium: 110, Wasser: 90.6 },
      })
    );

    expect(rowFor('Calcium')).toHaveTextContent('Standard: Calcium');
    expect(rowFor('Wasser')).toHaveTextContent('Add as alias');
  });

  it('shows the standard nutrient name in the selected language', () => {
    mockTranslations = {
      'nutrition.calories': 'Kalorien',
      'nutrition.waterContent': 'Wassergehalt',
    };
    renderOpen(
      swissFood({
        provider_nutrients: { 'Energie, Kalorien': 34, Wasser: 90.6 },
        provider_nutrient_standard: {
          'Energie, Kalorien': 'calories',
          Wasser: 'water_ml',
        },
      })
    );

    expect(rowFor('Energie, Kalorien')).toHaveTextContent('Standard: Kalorien');
    expect(rowFor('Wasser')).toHaveTextContent('Standard: Wassergehalt');
  });

  it('shows the raw id for a standard nutrient it has no name for', () => {
    renderOpen(
      swissFood({
        provider_nutrients: { Spurenelement: 1 },
        provider_nutrient_standard: { Spurenelement: 'unknown_nutrient' },
      })
    );

    expect(rowFor('Spurenelement')).toHaveTextContent(
      'Standard: unknown_nutrient'
    );
  });

  it('treats an id named like an Object.prototype member as unknown', () => {
    renderOpen(
      swissFood({
        provider_nutrients: { Spurenelement: 1 },
        provider_nutrient_standard: { Spurenelement: 'toString' },
      })
    );

    expect(rowFor('Spurenelement')).toHaveTextContent('Standard: toString');
  });
});
