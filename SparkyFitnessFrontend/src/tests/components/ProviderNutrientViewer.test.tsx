import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProviderNutrientViewer } from '@/components/FoodSearch/ProviderNutrientViewer';
import type { Food, FoodVariant } from '@/types/food';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
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

  it('falls back to the label aliases when the provider sends no map', () => {
    renderOpen(
      swissFood({
        provider_nutrients: { Calcium: 110, Wasser: 90.6 },
      })
    );

    expect(rowFor('Calcium')).toHaveTextContent('Standard: Calcium');
    expect(rowFor('Wasser')).toHaveTextContent('Add as alias');
  });
});
