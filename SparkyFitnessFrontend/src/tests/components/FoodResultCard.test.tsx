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

  it('renders the provider verified badge for verified foods', () => {
    render(
      <FoodResultCard
        item={createFood({
          provider_type: 'yazio',
          provider_external_id: 'yazio-pretzel-1',
          provider_verified: true,
        })}
        nutrientConfig={nutrientConfig}
        onCardClick={jest.fn()}
      />
    );

    const badge = screen.getByTestId('provider-verified-badge');
    expect(badge).toHaveAccessibleName('Verified food');
    expect(badge).not.toHaveTextContent(/Verified/i);
    expect(badge.querySelector('svg')).toBeInTheDocument();
  });

  it('renders provider serving descriptions with gram amounts', () => {
    render(
      <FoodResultCard
        item={createFood({
          default_variant: {
            id: 'variant-1',
            serving_size: 1,
            serving_unit: 'whole',
            serving_description: '1 whole (20 g)',
            calories: 50,
            protein: 1,
            carbs: 10,
            fat: 1,
          },
        })}
        nutrientConfig={nutrientConfig}
        onCardClick={jest.fn()}
      />
    );

    expect(screen.getByText('Per 1 whole (20 g)')).toBeInTheDocument();
  });

  it('renders Private badge for meals owned by active user', () => {
    render(
      <FoodResultCard
        item={{
          id: 'meal-1',
          user_id: 'user-1',
          name: 'My Meal',
          is_public: false,
        }}
        isMeal={true}
        nutrientConfig={nutrientConfig}
        onCardClick={jest.fn()}
      />
    );
    expect(screen.getByText(/Private/i)).toBeInTheDocument();
  });

  it('renders Public badge for meals marked is_public', () => {
    render(
      <FoodResultCard
        item={{
          id: 'meal-1',
          user_id: 'user-1',
          name: 'Some Meal',
          is_public: true,
        }}
        isMeal={true}
        nutrientConfig={nutrientConfig}
        onCardClick={jest.fn()}
      />
    );
    expect(screen.getByText(/Public/i)).toBeInTheDocument();
  });

  it('renders Family badge for meals owned by other user', () => {
    render(
      <FoodResultCard
        item={{
          id: 'meal-1',
          user_id: 'user-2',
          name: 'Some Meal',
          is_public: false,
        }}
        isMeal={true}
        nutrientConfig={nutrientConfig}
        onCardClick={jest.fn()}
      />
    );
    expect(screen.getByText(/Family/i)).toBeInTheDocument();
  });
});
