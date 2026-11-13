import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import IngredientQuantityModal from '../../src/components/IngredientQuantityModal';
import type { MealFood } from '../../src/types/meals';

jest.mock('uniwind', () => ({
  useCSSVariable: () => ['#0284c7', '#e5e7eb'],
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

const mockUseFoodVariants = jest.fn();
jest.mock('../../src/hooks/useFoodVariants', () => ({
  useFoodVariants: (...args: any[]) => mockUseFoodVariants(...args),
}));

describe('IngredientQuantityModal', () => {
  const mockIngredient: MealFood = {
    id: 'food-1',
    food_id: 'food-1',
    food_name: 'Grilled Chicken',
    brand: 'Healthy Eats',
    serving_size: 100,
    serving_unit: 'g',
    quantity: 160,
    unit: 'g',
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
  };

  const defaultProps = {
    visible: true,
    ingredient: mockIngredient,
    onClose: jest.fn(),
    onSave: jest.fn(),
    onRemove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFoodVariants.mockReturnValue({
      variants: [],
      isLoading: false,
      isError: false,
    });
  });

  it('renders ingredient name, brand, unit and initial quantity', () => {
    const { getByText, getByDisplayValue } = render(
      <IngredientQuantityModal {...defaultProps} />
    );

    expect(getByText('Grilled Chicken')).toBeTruthy();
    expect(getByText('Healthy Eats')).toBeTruthy();
    expect(getByText('g')).toBeTruthy();
    expect(getByDisplayValue('160')).toBeTruthy();
  });

  it('calls onSave with updated quantity when Apply is pressed', () => {
    const onSave = jest.fn();
    const { getByText, getByDisplayValue } = render(
      <IngredientQuantityModal {...defaultProps} onSave={onSave} />
    );

    const input = getByDisplayValue('160');
    fireEvent.changeText(input, '200');

    fireEvent.press(getByText('Apply'));

    expect(onSave).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        quantity: 200,
        unit: 'g',
      })
    );
  });

  it('offers saved portions only and keeps the picked variant id', () => {
    mockUseFoodVariants.mockReturnValue({
      variants: [
        {
          id: 'variant-oz',
          food_id: 'food-1',
          serving_size: 1,
          serving_unit: 'oz',
          calories: 47,
          protein: 8.8,
          carbs: 0,
          fat: 1,
        },
      ],
      isLoading: false,
      isError: false,
    });
    const onSave = jest.fn();
    const { getByText, getByLabelText, queryByText } = render(
      <IngredientQuantityModal {...defaultProps} onSave={onSave} />
    );

    fireEvent.press(getByLabelText('Change unit'));

    // A unit converted on the fly has no variant id, so it is not offered.
    expect(queryByText('Standard Units')).toBeNull();
    fireEvent.press(getByText('1 oz'));
    fireEvent.press(getByText('Apply'));

    // 160 g is about 5.64 oz (divided by 28.35 g per oz, not multiplied).
    expect(onSave).toHaveBeenCalledWith(
      5.64,
      expect.objectContaining({
        quantity: 5.64,
        calories: 47,
        variant_id: 'variant-oz',
        unit: 'oz',
        serving_unit: 'oz',
      })
    );
  });

  it('calls onRemove and onClose when Remove from Meal is pressed', () => {
    const onRemove = jest.fn();
    const onClose = jest.fn();
    const { getByText } = render(
      <IngredientQuantityModal
        {...defaultProps}
        onRemove={onRemove}
        onClose={onClose}
      />
    );

    fireEvent.press(getByText('Remove from Meal'));

    expect(onRemove).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Cancel is pressed', () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <IngredientQuantityModal {...defaultProps} onClose={onClose} />
    );

    fireEvent.press(getByText('Cancel'));

    expect(onClose).toHaveBeenCalled();
  });
});
