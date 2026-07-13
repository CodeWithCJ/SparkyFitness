import React from 'react';
import { render } from '@testing-library/react-native';
import FoodNutritionSummary from '../../src/components/FoodNutritionSummary';

jest.mock('../../src/hooks', () => ({
  useServerConnection: jest.fn(() => ({ isConnected: true, isLoading: false })),
  useCustomNutrients: jest.fn(() => ({ customNutrients: [], isLoading: false, isError: false, refetch: jest.fn() })),
}));

jest.mock('../../src/components/MacroCompositionRing', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="macro-composition-ring" />,
  };
});

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

const baseValues = {
  servingSize: 1,
  servingUnit: 'serving',
  calories: 200,
  protein: 10,
  carbs: 30,
  fat: 5,
  fiber: 10,
  sugars: 6,
};

describe('FoodNutritionSummary — Total Carbs row', () => {
  describe('default behavior (showNetCarbs off)', () => {
    it('does not render a Total Carbs row', () => {
      const { queryByText } = render(
        <FoodNutritionSummary name="Oats" values={baseValues} />,
      );
      expect(queryByText('Total Carbs')).toBeNull();
    });

    it('renders the compact verified badge when provider_verified is set', () => {
      const { getByLabelText, getByTestId } = render(
        <FoodNutritionSummary name="Verified YAZIO food" values={baseValues} provider_verified />,
      );

      expect(getByTestId('verified-badge')).toBeTruthy();
      expect(getByLabelText('Verified food')).toBeTruthy();
    });
  });

  describe('showNetCarbs on (with fiber available)', () => {
    it('injects Total Carbs at servings=1 with the unscaled carbs value', () => {
      const { getByText } = render(
        <FoodNutritionSummary
          name="Oats"
          values={baseValues}
          servings={1}
          showNetCarbs
        />,
      );
      expect(getByText('Total Carbs')).toBeTruthy();
      // 30g raw carbs * 1 serving = 30g
      expect(getByText('30g')).toBeTruthy();
    });

    it('scales the Total Carbs row value by servings (servings>1)', () => {
      const { getByText } = render(
        <FoodNutritionSummary
          name="Oats"
          values={baseValues}
          servings={2.5}
          showNetCarbs
        />,
      );
      expect(getByText('Total Carbs')).toBeTruthy();
      // 30g raw carbs * 2.5 servings = 75g
      // Previously this row was double-scaled (would have shown 187g)
      expect(getByText('75g')).toBeTruthy();
    });

    it('scales fiber, sugars, and the new Total Carbs row consistently', () => {
      // Distinct base numbers so each scaled value is unique on screen.
      const distinctValues = {
        ...baseValues,
        protein: 7,
        fat: 4,
        carbs: 30,
        fiber: 8,
        sugars: 5,
      };
      const { getByText } = render(
        <FoodNutritionSummary
          name="Oats"
          values={distinctValues}
          servings={2}
          showNetCarbs
        />,
      );
      // Fiber 8 * 2 = 16g
      expect(getByText('16g')).toBeTruthy();
      // Sugars 5 * 2 = 10g
      expect(getByText('10g')).toBeTruthy();
      // Total Carbs 30 * 2 = 60g (this was 187g under the double-scaling bug)
      expect(getByText('60g')).toBeTruthy();
    });
  });

  describe('showNetCarbs on but fiber missing', () => {
    it('does NOT inject Total Carbs (matches macro-bar fallback to total carbs)', () => {
      const valuesWithoutFiber = { ...baseValues, fiber: undefined };
      const { queryByText } = render(
        <FoodNutritionSummary
          name="Plain food"
          values={valuesWithoutFiber}
          showNetCarbs
        />,
      );
      // The macro bar in NutritionMacroCard falls back to "Carbs" with total
      // carbs in this case; we shouldn't add a redundant Total Carbs row.
      expect(queryByText('Total Carbs')).toBeNull();
    });
  });
});
