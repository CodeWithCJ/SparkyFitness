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
    t: (key: string, fallbackOrOptions?: string | Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'foodResultCard.aiEstimate': 'تقدير آلي بثقة {{confidence}}',
        'foodUnitSelector.confidence.high': 'عالية',
        'enhancedFoodSearch.private': 'خاص',
        'enhancedFoodSearch.public': 'عام',
        'enhancedFoodSearch.family': 'العائلة',
        'mealManagement.perServing': 'لكل {{servingSize}} {{servingUnit}}',
        'units.cup': 'كوب',
      };
      const fallback =
        typeof fallbackOrOptions === 'string'
          ? fallbackOrOptions
          : typeof fallbackOrOptions?.['defaultValue'] === 'string'
            ? fallbackOrOptions['defaultValue']
            : key;
      const options =
        typeof fallbackOrOptions === 'object' ? fallbackOrOptions : {};
      return (translations[key] ?? fallback).replace(
        /{{(\w+)}}/g,
        (_, token: string) => String(options[token] ?? '')
      );
    },
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

    expect(screen.getByText('تقدير آلي بثقة عالية')).toBeInTheDocument();
    expect(screen.getByText('لكل 1 كوب')).toBeInTheDocument();
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

    expect(screen.queryByText(/تقدير آلي/)).not.toBeInTheDocument();
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
    expect(screen.getByText('خاص')).toBeInTheDocument();
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
    expect(screen.getByText('عام')).toBeInTheDocument();
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
    expect(screen.getByText('العائلة')).toBeInTheDocument();
  });
});
