import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import FoodForm from '../../src/components/FoodForm';

const mockBottomSheetPicker = jest.fn();
const mockFoodUnitSelectorSheet = jest.fn();
let mockUnitSelectionPayload: any;

jest.mock('../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => {
      mockBottomSheetPicker(props);
      return (
        <View>
          {props.renderTrigger?.({
            onPress: () => {},
            selectedOption: { label: 'g', value: 'g' },
          })}
        </View>
      );
    },
  };
});

jest.mock('../../src/components/FoodUnitSelectorSheet', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => {
      mockFoodUnitSelectorSheet(props);
      return (
        <View>
          {props.renderTrigger?.({ onPress: () => {} })}
          <Pressable
            onPress={() => props.onSelect(mockUnitSelectionPayload)}
          >
            <Text>Use Converted Unit</Text>
          </Pressable>
        </View>
      );
    },
  };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

describe('FoodForm', () => {
  beforeEach(() => {
    mockBottomSheetPicker.mockClear();
    mockFoodUnitSelectorSheet.mockClear();
    mockUnitSelectionPayload = {
      kind: 'draft',
      variant: {
        serving_size: 1,
        serving_unit: 'oz',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
      },
    };
  });

  it('scales nutrition values when auto scale is enabled and serving size changes', () => {
    const screen = render(
      <FoodForm
        showAutoScaleNutrition
        initialAutoScaleNutritionEnabled
        initialValues={{
          name: 'Greek Yogurt',
          servingSize: '100',
          servingUnit: 'g',
          calories: '120',
          protein: '10',
          carbs: '8.23',
          fat: '4',
          fiber: '',
        }}
        onSubmit={jest.fn()}
      />,
    );

    fireEvent.changeText(screen.getByDisplayValue('100'), '150');

    expect(screen.getByDisplayValue('180')).toBeTruthy();
    expect(screen.getByDisplayValue('15')).toBeTruthy();
    expect(screen.getByDisplayValue('12.3')).toBeTruthy();
    expect(screen.getByDisplayValue('6')).toBeTruthy();
  });

  it('submits precise scaled nutrition values even when the display is rounded', () => {
    const onSubmit = jest.fn();
    const screen = render(
      <FoodForm
        showAutoScaleNutrition
        initialAutoScaleNutritionEnabled
        initialValues={{
          name: 'Greek Yogurt',
          servingSize: '100',
          servingUnit: 'g',
          calories: '120',
          protein: '10',
          carbs: '8.23',
          fat: '4',
        }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.changeText(screen.getByDisplayValue('100'), '150');
    fireEvent.press(screen.getByText('Add Food'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        servingSize: '150',
        calories: '180',
        protein: '15',
        carbs: '12.345',
        fat: '6',
      }),
    );
  });

  it('leaves nutrition values unchanged when auto scale is disabled', () => {
    const screen = render(
      <FoodForm
        showAutoScaleNutrition
        initialValues={{
          name: 'Greek Yogurt',
          servingSize: '100',
          servingUnit: 'g',
          calories: '120',
          protein: '10',
          carbs: '8',
          fat: '4',
        }}
        onSubmit={jest.fn()}
      />,
    );

    fireEvent.changeText(screen.getByDisplayValue('100'), '150');

    expect(screen.getByDisplayValue('120')).toBeTruthy();
    expect(screen.getByDisplayValue('10')).toBeTruthy();
    expect(screen.getByDisplayValue('8')).toBeTruthy();
    expect(screen.getByDisplayValue('4')).toBeTruthy();
  });

  it('hides auto scale by default', () => {
    const screen = render(
      <FoodForm
        initialValues={{
          name: 'Greek Yogurt',
          servingSize: '100',
          servingUnit: 'g',
          calories: '120',
          protein: '10',
          carbs: '8',
          fat: '4',
        }}
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.queryByLabelText('Auto Scale Nutrition')).toBeNull();
  });

  it('initializes auto scale from the provided default and still allows local toggle changes', () => {
    const screen = render(
      <FoodForm
        showAutoScaleNutrition
        initialAutoScaleNutritionEnabled
        initialValues={{
          name: 'Greek Yogurt',
          servingSize: '100',
          servingUnit: 'g',
          calories: '120',
          protein: '10',
          carbs: '8',
          fat: '4',
        }}
        onSubmit={jest.fn()}
      />,
    );

    fireEvent.changeText(screen.getByDisplayValue('100'), '150');
    expect(screen.getByDisplayValue('180')).toBeTruthy();

    fireEvent(screen.getByLabelText('Auto Scale Nutrition'), 'valueChange', false);
    fireEvent.changeText(screen.getByDisplayValue('150'), '200');

    expect(screen.getByDisplayValue('180')).toBeTruthy();
  });

  it('passes grouped serving-unit sections to the picker', () => {
    render(
      <FoodForm
        initialValues={{
          name: 'Greek Yogurt',
          servingSize: '100',
          servingUnit: 'g',
          calories: '120',
          protein: '10',
          carbs: '8',
          fat: '4',
        }}
        onSubmit={jest.fn()}
      />,
    );

    const servingUnitPickerCall = mockBottomSheetPicker.mock.calls.find(
      ([props]) => props.title === 'Select Unit',
    );

    expect(servingUnitPickerCall?.[0].sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Weight', options: expect.any(Array) }),
        expect.objectContaining({ title: 'Volume', options: expect.any(Array) }),
        expect.objectContaining({
          title: 'Quantity',
          options: expect.arrayContaining([
            expect.objectContaining({ label: 'portion', value: 'portion' }),
          ]),
        }),
      ]),
    );
  });

  it('uses the unit selector sheet when conversion options are provided', async () => {
    const onUnitSelectionChange = jest.fn((selection) => ({
      kind: 'existing',
      variant: {
        ...selection.variant,
        id: 'variant-oz',
      },
    }));

    const screen = render(
      <FoodForm
        initialValues={{
          name: 'Greek Yogurt',
          servingSize: '100',
          servingUnit: 'g',
          calories: '120',
          protein: '10',
          carbs: '8',
          fat: '4',
        }}
        unitSelector={{
          variants: [
            {
              id: 'variant-1',
              food_id: 'food-1',
              serving_size: 100,
              serving_unit: 'g',
              calories: 120,
              protein: 10,
              carbs: 8,
              fat: 4,
            },
          ],
          selectedSelection: {
            kind: 'existing',
            variant: {
              id: 'variant-1',
              food_id: 'food-1',
              serving_size: 100,
              serving_unit: 'g',
              calories: 120,
              protein: 10,
              carbs: 8,
              fat: 4,
            },
          },
          onUnitSelectionChange,
        }}
        onSubmit={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByText('Use Converted Unit'));

    expect(onUnitSelectionChange).toHaveBeenCalledWith({
      kind: 'draft',
      variant: {
        serving_size: 1,
        serving_unit: 'oz',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
      },
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('1')).toBeTruthy();
    });
    expect(screen.getByText('oz')).toBeTruthy();
    expect(mockFoodUnitSelectorSheet).toHaveBeenCalled();
    expect(mockFoodUnitSelectorSheet.mock.calls[0]?.[0]?.title).toBe('Select Unit');
    expect(mockFoodUnitSelectorSheet.mock.calls[0]?.[0]?.selectedSelection).toEqual({
      kind: 'existing',
      variant: {
        id: 'variant-1',
        food_id: 'food-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
      },
    });
  });

  it('keeps current nutrition values and passes only saved variants when selecting an incompatible unit', async () => {
    mockUnitSelectionPayload = {
      kind: 'draft',
      variant: {
        serving_size: 1,
        serving_unit: 'cup',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
      },
      requiresNutritionUpdate: true,
    };

    const screen = render(
      <FoodForm
        initialValues={{
          name: 'Greek Yogurt',
          servingSize: '100',
          servingUnit: 'g',
          calories: '120',
          protein: '10',
          carbs: '8',
          fat: '4',
        }}
        unitSelector={{
          variants: [
            {
              id: 'variant-1',
              food_id: 'food-1',
              serving_size: 100,
              serving_unit: 'g',
              calories: 120,
              protein: 10,
              carbs: 8,
              fat: 4,
            },
          ],
          selectedSelection: {
            kind: 'existing',
            variant: {
              id: 'variant-1',
              food_id: 'food-1',
              serving_size: 100,
              serving_unit: 'g',
              calories: 120,
              protein: 10,
              carbs: 8,
              fat: 4,
            },
          },
          onUnitSelectionChange: jest.fn(),
        }}
        onSubmit={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByText('Use Converted Unit'));

    await waitFor(() => {
      expect(screen.getByText('cup')).toBeTruthy();
    });

    expect(screen.getByDisplayValue('120')).toBeTruthy();
    expect(screen.getByDisplayValue('10')).toBeTruthy();
    expect(screen.getByDisplayValue('8')).toBeTruthy();
    expect(screen.getByDisplayValue('4')).toBeTruthy();

    const latestSelectorProps =
      mockFoodUnitSelectorSheet.mock.calls[mockFoodUnitSelectorSheet.mock.calls.length - 1]?.[0];
    expect(latestSelectorProps?.variants).toEqual([
      expect.objectContaining({
        id: 'variant-1',
        serving_unit: 'g',
      }),
    ]);
    expect(latestSelectorProps?.selectedSelection).toEqual(
      expect.objectContaining({
        kind: 'draft',
        variant: expect.objectContaining({
          id: '__food-form-draft-unit__',
          serving_unit: 'cup',
        }),
        requiresNutritionUpdate: true,
      }),
    );
  });

  it('preserves small nonzero nutrition values when auto scaling an mg-based compatible unit', async () => {
    mockUnitSelectionPayload = {
      kind: 'draft',
      variant: {
        serving_size: 1,
        serving_unit: 'mg',
        calories: 0.0012,
        protein: 0.0005,
        carbs: 0.0008,
        fat: 0.0002,
      },
    };

    const screen = render(
      <FoodForm
        showAutoScaleNutrition
        initialAutoScaleNutritionEnabled
        initialValues={{
          name: 'Greek Yogurt',
          servingSize: '100',
          servingUnit: 'g',
          calories: '120',
          protein: '10',
          carbs: '8',
          fat: '4',
        }}
        unitSelector={{
          variants: [
            {
              id: 'variant-1',
              food_id: 'food-1',
              serving_size: 100,
              serving_unit: 'g',
              calories: 120,
              protein: 10,
              carbs: 8,
              fat: 4,
            },
          ],
          selectedSelection: {
            kind: 'existing',
            variant: {
              id: 'variant-1',
              food_id: 'food-1',
              serving_size: 100,
              serving_unit: 'g',
              calories: 120,
              protein: 10,
              carbs: 8,
              fat: 4,
            },
          },
          onUnitSelectionChange: jest.fn(),
        }}
        onSubmit={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByText('Use Converted Unit'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('0.0012')).toBeTruthy();
      expect(screen.getByDisplayValue('0.0005')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByDisplayValue('1'), '2');

    expect(screen.getByDisplayValue('0.0024')).toBeTruthy();
    expect(screen.getByDisplayValue('0.001')).toBeTruthy();
    expect(screen.getByDisplayValue('0.0016')).toBeTruthy();
    expect(screen.getByDisplayValue('0.0004')).toBeTruthy();
  });
});
