import React from 'react';
import { render } from '@testing-library/react-native';
import NutritionMacroCard from '../../src/components/NutritionMacroCard';

jest.mock('../../src/components/MacroCompositionRing', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="macro-composition-ring" />,
  };
});

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

describe('NutritionMacroCard', () => {
  const baseProps = {
    calories: 600,
    protein: 30,
    carbs: 50,
    fat: 20,
  };

  describe('default behavior (showNetCarbs not set or false)', () => {
    it('renders the Carbs label with total carbs value', () => {
      const { getByText } = render(<NutritionMacroCard {...baseProps} />);
      expect(getByText('Carbs')).toBeTruthy();
      expect(getByText('50g')).toBeTruthy();
    });

    it('ignores fiber when showNetCarbs is false', () => {
      const { getByText, queryByText } = render(
        <NutritionMacroCard {...baseProps} fiber={15} showNetCarbs={false} />,
      );
      expect(getByText('Carbs')).toBeTruthy();
      expect(getByText('50g')).toBeTruthy();
      expect(queryByText('Net Carbs')).toBeNull();
    });
  });

  describe('showNetCarbs enabled', () => {
    it('swaps label to "Net Carbs" and shows max(0, carbs - fiber)', () => {
      const { getByText, queryByText } = render(
        <NutritionMacroCard {...baseProps} fiber={15} showNetCarbs />,
      );
      expect(getByText('Net Carbs')).toBeTruthy();
      expect(getByText('35g')).toBeTruthy();
      expect(queryByText('Carbs')).toBeNull();
    });

    it('floors at zero when fiber exceeds carbs', () => {
      const { getByText } = render(
        <NutritionMacroCard
          calories={400}
          protein={20}
          carbs={10}
          fat={15}
          fiber={25}
          showNetCarbs
        />,
      );
      expect(getByText('Net Carbs')).toBeTruthy();
      expect(getByText('0g')).toBeTruthy();
    });

    it('falls back to total carbs when fiber prop is omitted', () => {
      // Defensive: opting in without fiber data should not blow up; we just
      // show the raw carbs value with the original label.
      const { getByText, queryByText } = render(
        <NutritionMacroCard {...baseProps} showNetCarbs />,
      );
      expect(getByText('Carbs')).toBeTruthy();
      expect(getByText('50g')).toBeTruthy();
      expect(queryByText('Net Carbs')).toBeNull();
    });
  });

  describe('with goal percentages (bar layout)', () => {
    it('renders the Net Carbs label in the goal-bar layout', () => {
      const { getByText } = render(
        <NutritionMacroCard
          {...baseProps}
          fiber={15}
          showNetCarbs
          goalPercentages={{ calories: 30, protein: 60, carbs: 35, fat: 50 }}
        />,
      );
      expect(getByText('Net Carbs')).toBeTruthy();
      expect(getByText('35g')).toBeTruthy();
    });
  });
});
