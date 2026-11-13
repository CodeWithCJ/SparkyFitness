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

  it('allows picking another convertible unit before applying', () => {
    const onSave = jest.fn();
    const { getByText, getByLabelText } = render(
      <IngredientQuantityModal {...defaultProps} onSave={onSave} />
    );

    // Open unit picker
    fireEvent.press(getByLabelText('Change unit'));

    // Select 'oz'
    expect(getByText('oz')).toBeTruthy();
    fireEvent.press(getByText('oz'));

    // Apply
    fireEvent.press(getByText('Apply'));

    expect(onSave).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
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
