import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import FoodResultCard from '@/components/FoodSearch/FoodResultCard';
import type { Food } from '@/types/food';

jest.mock('@/components/FoodSearch/NutrientGrid', () => ({
  NutrientGrid: () => <div data-testid="nutrient-grid" />,
}));

jest.mock('@/hooks/useAllergenPreferences', () => ({
  useAllergenPreferences: () => ({ data: [] }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({
    activeUserId: 'user-1',
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

const nutrientConfig = {
  visibleNutrients: ['calories'],
  energyUnit: 'kcal' as const,
  convertEnergy: (value: number) => value,
  getEnergyUnitString: (unit: 'kcal' | 'kJ') => unit,
  customNutrients: [],
};

const createFood = (overrides: Partial<Food> = {}): Food => ({
  id: 'food-1',
  name: 'Greek Yogurt',
  is_custom: true,
  user_id: 'user-1',
  default_variant: {
    id: 'variant-1',
    serving_size: 1,
    serving_unit: 'cup',
    calories: 120,
    protein: 10,
    carbs: 8,
    fat: 4,
    source: 'ai_estimate',
    ai_confidence: 'high',
  },
  ...overrides,
});

describe('FoodResultCard', () => {
  it('renders the AI badge when the default variant is AI-estimated', () => {
    render(
      <FoodResultCard
        item={createFood()}
        nutrientConfig={nutrientConfig}
        onCardClick={jest.fn()}
      />
    );

    expect(screen.getByText(/AI Good estimate/i)).toBeInTheDocument();
  });

  it('does not render the AI badge for manual default variants', () => {
    render(
      <FoodResultCard
        item={createFood({
          default_variant: {
            id: 'variant-1',
            serving_size: 1,
            serving_unit: 'cup',
            calories: 120,
            protein: 10,
            carbs: 8,
            fat: 4,
            source: 'manual',
            ai_confidence: null,
          },
        })}
        nutrientConfig={nutrientConfig}
        onCardClick={jest.fn()}
      />
    );

    expect(screen.queryByText(/AI /i)).not.toBeInTheDocument();
  });
});
