import React from 'react';
import { Alert, Dimensions } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import FoodForm from '../../src/components/FoodForm';

const mockBottomSheetPicker = jest.fn();
const mockFoodUnitSelectorSheet = jest.fn();
let mockUnitSelectionPayload: any;
let mockUserAiConfigAllowed = false;
let mockActiveAiServiceSetting: any = null;
let mockUserPreferences: any = undefined;

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
          <Pressable onPress={() => props.onSelect(mockUnitSelectionPayload)}>
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

// FoodForm queries server connection + custom nutrient defs + AI service
// settings via react-query. Mock all of them as inert so the form renders
// cleanly in unit-test isolation without a QueryClientProvider.
jest.mock('../../src/hooks', () => ({
  useServerConnection: () => ({ isConnected: true, isLoading: false }),
}));
jest.mock('../../src/hooks/useCustomNutrients', () => ({
  useCustomNutrients: () => ({
    customNutrients: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('../../src/hooks/useActiveAiServiceSetting', () => ({
  useActiveAiServiceSetting: () => ({
    data: mockActiveAiServiceSetting,
    isLoading: false,
  }),
}));
jest.mock('../../src/hooks/useUserAiConfigAllowed', () => ({
  useUserAiConfigAllowed: () => ({
    data: mockUserAiConfigAllowed,
    isLoading: false,
  }),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: mockUserPreferences,
    isLoading: false,
  }),
}));

describe('FoodForm', () => {
  it('merges a label into the live draft and submits the scanned precision', () => {
    const onSubmit = jest.fn();
    const initialValues = {
      name: 'Yogurt',
      brand: 'Original brand',
      servingSize: '170',
      servingUnit: 'g',
      calories: '120',
      protein: '10',
      carbs: '8.23',
      fat: '4',
      fiber: '3',
    };
    const screen = render(
      <FoodForm initialValues={initialValues} onSubmit={onSubmit} />
    );
    fireEvent.changeText(screen.getByDisplayValue('Yogurt'), 'My unsaved name');
    fireEvent.changeText(
      screen.getByDisplayValue('Original brand'),
      'My unsaved brand'
    );
    const scan = {
      result: {
        name: 'Ignore me',
        calories: 0,
        protein: 12.345,
        fiber: null,
        serving_size: 100,
      },
      nonce: 1,
    };
    screen.rerender(
      <FoodForm
        initialValues={initialValues}
        onSubmit={onSubmit}
        nutritionLabelScan={scan}
      />
    );
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Add Food'));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: 'My unsaved name',
        brand: 'My unsaved brand',
        servingSize: '100',
        calories: '0',
        protein: '12.345',
        carbs: '8.23',
        fat: '4',
        fiber: '3',
      })
    );
    fireEvent.changeText(screen.getByDisplayValue('12.3'), '17');
    screen.rerender(
      <FoodForm
        initialValues={initialValues}
        onSubmit={onSubmit}
        nutritionLabelScan={scan}
      />
    );
    fireEvent.press(screen.getByText('Add Food'));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ protein: '17' })
    );
    screen.rerender(
      <FoodForm
        initialValues={initialValues}
        onSubmit={onSubmit}
        nutritionLabelScan={{ result: { protein: 0 }, nonce: 2 }}
      />
    );
    fireEvent.press(screen.getByText('Add Food'));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ protein: '0' })
    );
  });

  beforeEach(() => {
    mockBottomSheetPicker.mockClear();
    mockFoodUnitSelectorSheet.mockClear();
    mockUserAiConfigAllowed = false;
    mockActiveAiServiceSetting = null;
    mockUserPreferences = undefined;
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
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

  afterEach(() => {
    jest.restoreAllMocks();
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
      />
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
      />
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
      })
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
      />
    );

    fireEvent.changeText(screen.getByDisplayValue('100'), '150');

    expect(screen.getByDisplayValue('120')).toBeTruthy();
    expect(screen.getByDisplayValue('10')).toBeTruthy();
    expect(screen.getByDisplayValue('8')).toBeTruthy();
    expect(screen.getByDisplayValue('4')).toBeTruthy();
  });

  it('uses the latest serving size when auto scale is re-enabled after manual edits', () => {
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
      />
    );

    fireEvent.changeText(screen.getByDisplayValue('100'), '150');
    fireEvent(
      screen.getByLabelText('Auto Scale Nutrition'),
      'valueChange',
      true
    );
    fireEvent.changeText(screen.getByDisplayValue('150'), '200');

    expect(screen.getByDisplayValue('160')).toBeTruthy();
    expect(screen.getByDisplayValue('13.3')).toBeTruthy();
    expect(screen.getByDisplayValue('10.7')).toBeTruthy();
    expect(screen.getByDisplayValue('5.3')).toBeTruthy();
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
      />
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
      />
    );

    fireEvent.changeText(screen.getByDisplayValue('100'), '150');
    expect(screen.getByDisplayValue('180')).toBeTruthy();

    fireEvent(
      screen.getByLabelText('Auto Scale Nutrition'),
      'valueChange',
      false
    );
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
      />
    );

    const servingUnitPickerCall = mockBottomSheetPicker.mock.calls.find(
      ([props]) => props.title === 'Select Unit'
    );

    expect(servingUnitPickerCall?.[0].sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Weight',
          options: expect.any(Array),
        }),
        expect.objectContaining({
          title: 'Volume',
          options: expect.any(Array),
        }),
        expect.objectContaining({
          title: 'Quantity',
          options: expect.arrayContaining([
            expect.objectContaining({ label: 'portion', value: 'portion' }),
          ]),
        }),
      ])
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
      />
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
    expect(mockFoodUnitSelectorSheet.mock.calls[0]?.[0]?.title).toBe(
      'Select Unit'
    );
    expect(
      mockFoodUnitSelectorSheet.mock.calls[0]?.[0]?.selectedSelection
    ).toEqual({
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
    expect(
      mockFoodUnitSelectorSheet.mock.calls[0]?.[0]?.showManualUpdateBanner
    ).toBeUndefined();
  });

  it('keeps the serving-size number while updating the unit and nutrition for a compatible converted draft unit', async () => {
    mockUnitSelectionPayload = {
      kind: 'draft',
      variant: {
        serving_size: 1,
        serving_unit: 'kg',
        calories: 1200,
        protein: 100,
        carbs: 80,
        fat: 40,
      },
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
      />
    );

    fireEvent.press(screen.getByText('Use Converted Unit'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('100')).toBeTruthy();
    });
    expect(screen.getByText('kg')).toBeTruthy();
    expect(screen.getByDisplayValue('120000')).toBeTruthy();
    expect(screen.getByDisplayValue('10000')).toBeTruthy();
    expect(screen.getByDisplayValue('8000')).toBeTruthy();
    expect(screen.getByDisplayValue('4000')).toBeTruthy();
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
      />
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
      mockFoodUnitSelectorSheet.mock.calls[
        mockFoodUnitSelectorSheet.mock.calls.length - 1
      ]?.[0];
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
      })
    );
    expect(latestSelectorProps?.showManualUpdateBanner).toBeUndefined();
    expect(
      screen.getByText(
        "Can't convert between units. Update nutrition values manually."
      )
    ).toBeTruthy();
  });

  it('shows the manual-update banner in the form when requested', () => {
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
          },
          onUnitSelectionChange: jest.fn(),
        }}
        onSubmit={jest.fn()}
      />
    );

    expect(
      screen.getByText(
        "Can't convert between units. Update nutrition values manually."
      )
    ).toBeTruthy();
  });

  it('turns auto scale off for non-AI-convertible incompatible unit drafts', async () => {
    mockUnitSelectionPayload = {
      kind: 'draft',
      variant: {
        serving_size: 1,
        serving_unit: 'piece',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
      },
      requiresNutritionUpdate: true,
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
              id: 'variant-g',
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
              id: 'variant-g',
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
      />
    );

    fireEvent.press(screen.getByText('Use Converted Unit'));

    await waitFor(() => {
      expect(screen.getByLabelText('Auto Scale Nutrition').props.value).toBe(
        false
      );
    });
  });

  it('keeps auto scale on for AI-convertible incompatible unit drafts', async () => {
    mockUserAiConfigAllowed = true;
    mockActiveAiServiceSetting = { provider: 'openai' };
    mockUserPreferences = { ai_assisted_conversions: true };
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
              id: 'variant-g',
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
              id: 'variant-g',
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
      />
    );

    fireEvent.press(screen.getByText('Use Converted Unit'));

    await waitFor(() => {
      expect(screen.getByLabelText('Auto Scale Nutrition').props.value).toBe(
        true
      );
      expect(screen.getByText('Convert with AI')).toBeTruthy();
    });
  });

  it('keeps auto scale unchanged for compatible existing-unit selections', async () => {
    mockUnitSelectionPayload = {
      kind: 'existing',
      variant: {
        id: 'variant-oz',
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'oz',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
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
              id: 'variant-g',
              food_id: 'food-1',
              serving_size: 100,
              serving_unit: 'g',
              calories: 120,
              protein: 10,
              carbs: 8,
              fat: 4,
            },
            {
              id: 'variant-oz',
              food_id: 'food-1',
              serving_size: 1,
              serving_unit: 'oz',
              calories: 120,
              protein: 10,
              carbs: 8,
              fat: 4,
            },
          ],
          selectedSelection: {
            kind: 'existing',
            variant: {
              id: 'variant-g',
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
      />
    );

    fireEvent.press(screen.getByText('Use Converted Unit'));

    await waitFor(() => {
      expect(screen.getByLabelText('Auto Scale Nutrition').props.value).toBe(
        true
      );
    });
  });

  it('shows the manual-update banner and turns auto scale off when an AI-selected unit swaps to a non-AI-convertible unit', async () => {
    mockUnitSelectionPayload = {
      kind: 'draft',
      variant: {
        serving_size: 1,
        serving_unit: 'piece',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
      },
      requiresNutritionUpdate: true,
    };

    const aiCupVariant = {
      id: 'variant-cup-ai',
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'cup',
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
      source: 'ai_estimate' as const,
      ai_confidence: 'medium' as const,
    };

    const screen = render(
      <FoodForm
        showAutoScaleNutrition
        initialAutoScaleNutritionEnabled
        initialValues={{
          name: 'Greek Yogurt',
          servingSize: '1',
          servingUnit: 'cup',
          calories: '120',
          protein: '10',
          carbs: '8',
          fat: '4',
        }}
        unitSelector={{
          variants: [aiCupVariant],
          selectedSelection: {
            kind: 'existing',
            variant: aiCupVariant,
          },
          onUnitSelectionChange: jest.fn(),
        }}
        onSubmit={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText('Use Converted Unit'));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Can't convert between units. Update nutrition values manually."
        )
      ).toBeTruthy();
      expect(screen.getByLabelText('Auto Scale Nutrition').props.value).toBe(
        false
      );
    });
    expect(screen.queryByText('Convert with AI')).toBeNull();
  });

  it('shows the manual-update banner and AI button when an AI-selected unit swaps to an AI-convertible unit', async () => {
    mockUserAiConfigAllowed = true;
    mockActiveAiServiceSetting = { provider: 'openai' };
    mockUserPreferences = { ai_assisted_conversions: true };
    mockUnitSelectionPayload = {
      kind: 'draft',
      variant: {
        serving_size: 100,
        serving_unit: 'g',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
      },
      requiresNutritionUpdate: true,
    };

    const aiCupVariant = {
      id: 'variant-cup-ai',
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'cup',
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
      source: 'ai_estimate' as const,
      ai_confidence: 'medium' as const,
    };

    const screen = render(
      <FoodForm
        showAutoScaleNutrition
        initialAutoScaleNutritionEnabled
        initialValues={{
          name: 'Greek Yogurt',
          servingSize: '1',
          servingUnit: 'cup',
          calories: '120',
          protein: '10',
          carbs: '8',
          fat: '4',
        }}
        unitSelector={{
          variants: [aiCupVariant],
          selectedSelection: {
            kind: 'existing',
            variant: aiCupVariant,
          },
          onUnitSelectionChange: jest.fn(),
        }}
        onSubmit={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText('Use Converted Unit'));

    await waitFor(() => {
      // Banner text is unconditional now; the separate "Convert with AI" button
      // below is the AI affordance when the swap is eligible.
      expect(
        screen.getByText(
          "Can't convert between units. Update nutrition values manually."
        )
      ).toBeTruthy();
      expect(screen.getByLabelText('Auto Scale Nutrition').props.value).toBe(
        true
      );
      expect(screen.getByText('Convert with AI')).toBeTruthy();
    });
  });

  it('confirms before submit when the manual-update banner is showing', () => {
    const onSubmit = jest.fn();
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
          },
          onUnitSelectionChange: jest.fn(),
        }}
        onSubmit={onSubmit}
      />
    );

    fireEvent.press(screen.getByText('Add Food'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Manual Nutrition Update',
      "Can't convert between units. Update nutrition values manually before saving.",
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Save Anyway' }),
      ])
    );
    expect(onSubmit).not.toHaveBeenCalled();

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const saveAnyway = buttons.find(
      (button: { text: string }) => button.text === 'Save Anyway'
    );
    saveAnyway?.onPress?.();

    expect(onSubmit).toHaveBeenCalled();
  });

  it('keeps the serving-size number and auto scales from the converted nutrition values for mg-based compatible units', async () => {
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
      />
    );

    fireEvent.press(screen.getByText('Use Converted Unit'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('100')).toBeTruthy();
      expect(screen.getByDisplayValue('0.12')).toBeTruthy();
      expect(screen.getByDisplayValue('0.05')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByDisplayValue('100'), '200');

    expect(screen.getByDisplayValue('0.24')).toBeTruthy();
    expect(screen.getByDisplayValue('0.1')).toBeTruthy();
    expect(screen.getByDisplayValue('0.16')).toBeTruthy();
    expect(screen.getByDisplayValue('0.04')).toBeTruthy();
  });

  it('keeps the serving-size number for compatible zero-calorie foods', async () => {
    mockUnitSelectionPayload = {
      kind: 'draft',
      variant: {
        serving_size: 1,
        serving_unit: 'cup',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
    };

    const screen = render(
      <FoodForm
        initialValues={{
          name: 'Water',
          servingSize: '100',
          servingUnit: 'ml',
          calories: '0',
          protein: '0',
          carbs: '0',
          fat: '0',
        }}
        unitSelector={{
          variants: [
            {
              id: 'variant-ml',
              food_id: 'food-1',
              serving_size: 100,
              serving_unit: 'ml',
              calories: 0,
              protein: 0,
              carbs: 0,
              fat: 0,
            },
          ],
          selectedSelection: {
            kind: 'existing',
            variant: {
              id: 'variant-ml',
              food_id: 'food-1',
              serving_size: 100,
              serving_unit: 'ml',
              calories: 0,
              protein: 0,
              carbs: 0,
              fat: 0,
            },
          },
          onUnitSelectionChange: jest.fn(),
        }}
        onSubmit={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText('Use Converted Unit'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('100')).toBeTruthy();
    });
    expect(screen.getByText('cup')).toBeTruthy();
    expect(screen.getAllByDisplayValue('0').length).toBeGreaterThanOrEqual(4);
  });

  it('keeps precise values in sync when unit selection is updated from props', () => {
    const onSubmit = jest.fn();
    const existingVariant = {
      id: 'variant-1',
      food_id: 'food-1',
      serving_size: 100,
      serving_unit: 'g',
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
    };
    const selectedVariant = {
      id: 'variant-oz',
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'oz',
      calories: 120,
      protein: 10,
      carbs: 8.23,
      fat: 4,
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
          variants: [existingVariant],
          selectedSelection: {
            kind: 'existing',
            variant: existingVariant,
          },
          onUnitSelectionChange: jest.fn(),
        }}
        onSubmit={onSubmit}
      />
    );

    screen.rerender(
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
          variants: [existingVariant, selectedVariant],
          selectedSelection: {
            kind: 'existing',
            variant: selectedVariant,
          },
          onUnitSelectionChange: jest.fn(),
        }}
        onSubmit={onSubmit}
      />
    );

    fireEvent.press(screen.getByText('Add Food'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        servingSize: '1',
        servingUnit: 'oz',
        calories: '120',
        protein: '10',
        carbs: '8.23',
        fat: '4',
      })
    );
  });

  it('shows the saved AI badge when the selected unit variant is AI-estimated', () => {
    const aiVariant = {
      id: 'variant-cup-ai',
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'cup',
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
      source: 'ai_estimate' as const,
      ai_confidence: 'medium' as const,
    };

    const screen = render(
      <FoodForm
        initialValues={{
          name: 'Greek Yogurt',
          servingSize: '1',
          servingUnit: 'cup',
          calories: '120',
          protein: '10',
          carbs: '8',
          fat: '4',
        }}
        unitSelector={{
          variants: [aiVariant],
          selectedSelection: {
            kind: 'existing',
            variant: aiVariant,
          },
          onUnitSelectionChange: jest.fn(),
        }}
        onSubmit={jest.fn()}
      />
    );

    // Phase G follow-up: the AI provenance shows up as a plain confidence
    // label below the unit row (no sparkle, no "AI ·" prefix). The "AI"
    // marker + sparkle is reserved for the dropdown rows inside the sheet
    // (mirroring web), which aren't rendered while the sheet is closed.
    expect(screen.getByText(/Fair estimate/)).toBeTruthy();
    expect(screen.queryByText(/^AI$/)).toBeNull();
  });

  it('clears the AI badge after manually editing nutrition on a saved AI variant', async () => {
    const onUnitSelectionChange = jest.fn();
    const aiVariant = {
      id: 'variant-cup-ai',
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'cup',
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
      source: 'ai_estimate' as const,
      ai_confidence: 'medium' as const,
    };

    const screen = render(
      <FoodForm
        initialValues={{
          name: 'Greek Yogurt',
          servingSize: '1',
          servingUnit: 'cup',
          calories: '120',
          protein: '10',
          carbs: '8',
          fat: '4',
        }}
        unitSelector={{
          variants: [aiVariant],
          selectedSelection: {
            kind: 'existing',
            variant: aiVariant,
          },
          onUnitSelectionChange,
        }}
        onSubmit={jest.fn()}
      />
    );

    expect(screen.getByText(/Fair estimate/)).toBeTruthy();

    fireEvent.changeText(screen.getByDisplayValue('120'), '150');

    await waitFor(() => {
      expect(screen.queryByText(/Fair estimate/)).toBeNull();
    });

    expect(onUnitSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'draft',
        variant: expect.objectContaining({
          serving_unit: 'cup',
          source: 'manual',
          ai_confidence: null,
        }),
      })
    );
    const latestSheetProps =
      mockFoodUnitSelectorSheet.mock.calls[
        mockFoodUnitSelectorSheet.mock.calls.length - 1
      ]?.[0];
    expect(latestSheetProps?.selectedVariantId).toBeUndefined();
  });

  it('uses the Convert with AI label when AI estimation is available for an incompatible swap', async () => {
    mockUserAiConfigAllowed = true;
    mockActiveAiServiceSetting = { provider: 'openai' };
    mockUserPreferences = { ai_assisted_conversions: true };
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
              id: 'variant-g',
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
              id: 'variant-g',
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
      />
    );

    fireEvent.press(screen.getByText('Use Converted Unit'));

    await waitFor(() => {
      expect(screen.getByText('Convert with AI')).toBeTruthy();
    });
  });

  it('keeps the trailing decimal while typing an equivalent size', () => {
    const handleChange = jest.fn();
    function Harness() {
      const [items, setItems] = React.useState([
        { serving_size: 3, serving_unit: 'g', _clientKey: 'eq-test' },
      ]);
      return (
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
          equivalents={{
            items,
            onChange: (next) => {
              handleChange(next);
              setItems(next);
            },
          }}
          onSubmit={jest.fn()}
        />
      );
    }

    const screen = render(<Harness />);

    // Typing the decimal point must not snap the field back to the parsed
    // integer — that regression made decimals impossible to enter on Android.
    fireEvent.changeText(screen.getByDisplayValue('3'), '3.');
    expect(screen.getByDisplayValue('3.')).toBeTruthy();

    fireEvent.changeText(screen.getByDisplayValue('3.'), '3.5');
    expect(screen.getByDisplayValue('3.5')).toBeTruthy();
    expect(handleChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ serving_size: 3.5, _sizeText: '3.5' }),
    ]);
  });
});

describe('FoodForm sodium entry unit', () => {
  const baseValues = {
    name: 'Oatcakes',
    servingSize: '100',
    servingUnit: 'g',
    calories: '450',
    protein: '10',
    carbs: '60',
    fat: '18',
    sodium: '400',
  };

  beforeEach(() => {
    mockBottomSheetPicker.mockClear();
  });

  const renderForm = (
    props: Partial<React.ComponentProps<typeof FoodForm>> = {}
  ) => {
    const onSubmit = jest.fn();
    const screen = render(
      <FoodForm initialValues={baseValues} onSubmit={onSubmit} {...props} />
    );
    fireEvent.press(screen.getByText('Show more nutrients ▾'));
    return { screen, onSubmit };
  };

  const selectSodiumUnit = (unit: 'sodium_mg' | 'salt_g') => {
    const call = mockBottomSheetPicker.mock.calls
      .filter(([props]) => props.title === 'Enter sodium as')
      .at(-1);
    expect(call).toBeDefined();
    act(() => call![0].onSelect(unit));
  };

  it('shows sodium in mg by default and submits it unchanged', () => {
    const { screen, onSubmit } = renderForm();

    expect(screen.getByLabelText('Sodium (mg)').props.value).toBe('400');
    expect(screen.getByText('sodium')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Sodium (mg)'), '250');
    fireEvent.press(screen.getByText('Add Food'));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ sodium: '250' })
    );
  });

  it('offers sodium (mg) and salt (g) as the entry units', () => {
    renderForm();

    const call = mockBottomSheetPicker.mock.calls.find(
      ([props]) => props.title === 'Enter sodium as'
    );
    expect(call![0].value).toBe('sodium_mg');
    expect(call![0].options).toEqual([
      { value: 'sodium_mg', label: 'Sodium (mg)' },
      { value: 'salt_g', label: 'Salt (g)' },
    ]);
  });

  it('switching to salt shows the stored sodium as grams of salt', () => {
    const { screen } = renderForm();

    selectSodiumUnit('salt_g');

    expect(screen.getByLabelText('Salt (g)').props.value).toBe('1');
    expect(screen.getByText('salt')).toBeTruthy();
    expect(screen.queryByLabelText('Sodium (mg)')).toBeNull();
  });

  it('stores a salt entry as sodium at 400 mg per gram', () => {
    const { screen, onSubmit } = renderForm();

    selectSodiumUnit('salt_g');
    fireEvent.changeText(screen.getByLabelText('Salt (g)'), '0.9');
    fireEvent.press(screen.getByText('Add Food'));

    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ sodium: '360' })
    );
  });

  it('accepts a comma decimal and rounds sodium to 0.1 mg', () => {
    const { screen, onSubmit } = renderForm();

    selectSodiumUnit('salt_g');
    fireEvent.changeText(screen.getByLabelText('Salt (g)'), '0,123');
    fireEvent.press(screen.getByText('Add Food'));

    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ sodium: '49.2' })
    );
  });

  it('keeps the salt text as typed, trailing decimal included', () => {
    const { screen } = renderForm();

    selectSodiumUnit('salt_g');
    fireEvent.changeText(screen.getByLabelText('Salt (g)'), '0.');
    expect(screen.getByLabelText('Salt (g)').props.value).toBe('0.');

    fireEvent.changeText(screen.getByLabelText('Salt (g)'), '0.50');
    expect(screen.getByLabelText('Salt (g)').props.value).toBe('0.50');
  });

  it('focusing and leaving an untouched salt field does not change sodium', () => {
    const { screen, onSubmit } = renderForm({
      initialValues: { ...baseValues, sodium: '123' },
    });

    selectSodiumUnit('salt_g');
    const input = screen.getByLabelText('Salt (g)');
    expect(input.props.value).toBe('0.31');

    fireEvent(input, 'focus');
    fireEvent(input, 'blur');
    selectSodiumUnit('sodium_mg');

    expect(screen.getByLabelText('Sodium (mg)').props.value).toBe('123');
    fireEvent.press(screen.getByText('Add Food'));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ sodium: '123' })
    );
  });

  it('clearing the salt field clears sodium', () => {
    const { screen, onSubmit } = renderForm();

    selectSodiumUnit('salt_g');
    fireEvent.changeText(screen.getByLabelText('Salt (g)'), '');
    fireEvent.press(screen.getByText('Add Food'));

    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ sodium: '' })
    );
  });

  it('switching back to mg shows the sodium the salt entry produced', () => {
    const { screen, onSubmit } = renderForm();

    selectSodiumUnit('salt_g');
    fireEvent.changeText(screen.getByLabelText('Salt (g)'), '0.25');
    selectSodiumUnit('sodium_mg');

    expect(screen.getByLabelText('Sodium (mg)').props.value).toBe('100');
    fireEvent.changeText(screen.getByLabelText('Sodium (mg)'), '120');
    fireEvent.press(screen.getByText('Add Food'));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ sodium: '120' })
    );
  });

  it('follows auto-scaled sodium while salt is the entry unit', () => {
    const { screen, onSubmit } = renderForm({
      showAutoScaleNutrition: true,
      initialAutoScaleNutritionEnabled: true,
    });

    selectSodiumUnit('salt_g');
    fireEvent.changeText(screen.getByLabelText('Salt (g)'), '0.5');
    fireEvent.changeText(screen.getByDisplayValue('100'), '200');

    expect(screen.getByLabelText('Salt (g)').props.value).toBe('1');
    fireEvent.press(screen.getByText('Add Food'));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ servingSize: '200', sodium: '400' })
    );
  });

  it('ignores a salt keystroke that leaves the amount unreadable', () => {
    const { screen, onSubmit } = renderForm();

    selectSodiumUnit('salt_g');
    fireEvent.changeText(screen.getByLabelText('Salt (g)'), '1.5');
    fireEvent.changeText(screen.getByLabelText('Salt (g)'), '1..5');

    expect(screen.getByLabelText('Salt (g)').props.value).toBe('1.5');
    fireEvent.press(screen.getByText('Add Food'));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ sodium: '600' })
    );
  });

  it('keeps the stored sodium when the first salt keystroke is malformed', () => {
    const { screen, onSubmit } = renderForm();

    selectSodiumUnit('salt_g');
    fireEvent.changeText(screen.getByLabelText('Salt (g)'), '1..');

    expect(screen.getByLabelText('Salt (g)').props.value).toBe('1');
    fireEvent.press(screen.getByText('Add Food'));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ sodium: '400' })
    );
  });

  it.each(['.', ','])(
    'lets a salt amount start with a bare %s separator',
    (separator) => {
      const { screen, onSubmit } = renderForm();

      selectSodiumUnit('salt_g');
      fireEvent.changeText(screen.getByLabelText('Salt (g)'), separator);
      expect(screen.getByLabelText('Salt (g)').props.value).toBe(separator);

      fireEvent.changeText(screen.getByLabelText('Salt (g)'), `${separator}5`);
      expect(screen.getByLabelText('Salt (g)').props.value).toBe(
        `${separator}5`
      );
      fireEvent.press(screen.getByText('Add Food'));
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ sodium: '200' })
      );
    }
  );

  describe('layout by window width', () => {
    const withWindow = (width: number, fontScale = 1) =>
      jest.spyOn(Dimensions, 'get').mockReturnValue({
        width,
        height: 800,
        scale: 2,
        fontScale,
      });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('puts the unit picker under the sodium input on a 320 dp screen', () => {
      withWindow(320);
      const { screen } = renderForm();

      const controls = screen.getByTestId('sodium-field-controls');
      expect(controls.props.className).not.toContain('flex-row');
      expect(
        screen.getByLabelText('Sodium (mg)').props.className
      ).not.toContain('flex-1');
      expect(screen.getByText('sodium')).toBeTruthy();
    });

    it('keeps the unit picker beside the input on a wide screen', () => {
      withWindow(412);
      const { screen } = renderForm();

      const controls = screen.getByTestId('sodium-field-controls');
      expect(controls.props.className).toContain('flex-row');
      expect(screen.getByLabelText('Sodium (mg)').props.className).toContain(
        'flex-1'
      );
    });

    it('stacks the picker on a wide screen when the font is scaled up', () => {
      withWindow(412, 1.3);
      const { screen } = renderForm();

      expect(
        screen.getByTestId('sodium-field-controls').props.className
      ).not.toContain('flex-row');
    });
  });
});
