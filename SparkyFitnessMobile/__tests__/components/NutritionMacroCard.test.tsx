import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import NutritionMacroCard from '../../src/components/NutritionMacroCard';

jest.mock('../../src/components/MacroCompositionRing', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="macro-composition-ring" />,
  };
});

jest.mock('../../src/components/ProgressRing', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="progress-ring" />,
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
        <NutritionMacroCard {...baseProps} fiber={15} showNetCarbs={false} />
      );
      expect(getByText('Carbs')).toBeTruthy();
      expect(getByText('50g')).toBeTruthy();
      expect(queryByText('Net Carbs')).toBeNull();
    });
  });

  describe('showNetCarbs enabled', () => {
    it('swaps label to "Net Carbs" and shows max(0, carbs - fiber)', () => {
      const { getByText, queryByText } = render(
        <NutritionMacroCard {...baseProps} fiber={15} showNetCarbs />
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
        />
      );
      expect(getByText('Net Carbs')).toBeTruthy();
      expect(getByText('0g')).toBeTruthy();
    });

    it('falls back to total carbs when fiber prop is omitted', () => {
      // Defensive: opting in without fiber data should not blow up; we just
      // show the raw carbs value with the original label.
      const { getByText, queryByText } = render(
        <NutritionMacroCard {...baseProps} showNetCarbs />
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
        />
      );
      expect(getByText('Net Carbs')).toBeTruthy();
      expect(getByText('35g')).toBeTruthy();
    });

    it('renders the calorie progress ring when a calorie goal is provided', () => {
      const { getByTestId, queryByTestId } = render(
        <NutritionMacroCard
          {...baseProps}
          goalPercentages={{ calories: 30, protein: 60, carbs: 35, fat: 50 }}
          calorieGoal={2000}
        />
      );
      expect(getByTestId('progress-ring')).toBeTruthy();
      expect(queryByTestId('macro-composition-ring')).toBeNull();
    });

    it('renders the macro composition ring when no calorie goal is provided', () => {
      // Per-food screens pass goal percentages without a calorie goal; a
      // progress ring there would always render full (calories / 1).
      const { getByTestId, queryByTestId } = render(
        <NutritionMacroCard
          {...baseProps}
          goalPercentages={{ calories: 30, protein: 60, carbs: 35, fat: 50 }}
        />
      );
      expect(getByTestId('macro-composition-ring')).toBeTruthy();
      expect(queryByTestId('progress-ring')).toBeNull();
    });
  });

  describe('onMacroPress', () => {
    const goalProps = {
      ...baseProps,
      calorieGoal: 2000,
      proteinGoal: 150,
      goalPercentages: { calories: 30, protein: 20, carbs: 20, fat: 30 },
    };

    it('makes each macro row tappable and reports its key, label and goal', () => {
      const onMacroPress = jest.fn();
      const { getByTestId } = render(
        <NutritionMacroCard {...goalProps} onMacroPress={onMacroPress} />
      );
      fireEvent.press(getByTestId('macro-row-protein'));
      expect(onMacroPress).toHaveBeenCalledWith({
        key: 'protein',
        label: 'Protein',
        goal: 150,
      });
      fireEvent.press(getByTestId('macro-row-fat'));
      expect(onMacroPress).toHaveBeenLastCalledWith(
        expect.objectContaining({ key: 'fat' })
      );
    });

    it('renders no tappable rows without the handler', () => {
      const { queryByTestId } = render(<NutritionMacroCard {...goalProps} />);
      expect(queryByTestId('macro-row-protein')).toBeNull();
    });

    it('does not make the net carbs row tappable', () => {
      const { queryByTestId, getByTestId } = render(
        <NutritionMacroCard
          {...goalProps}
          showNetCarbs
          fiber={5}
          onMacroPress={jest.fn()}
        />
      );
      expect(queryByTestId('macro-row-carbs')).toBeNull();
      expect(getByTestId('macro-row-protein')).toBeTruthy();
    });
  });
});
