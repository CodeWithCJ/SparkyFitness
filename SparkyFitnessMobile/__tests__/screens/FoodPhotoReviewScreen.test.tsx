import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodPhotoReviewScreen from '../../src/screens/FoodPhotoReviewScreen';
import { useAddFoodEntry } from '../../src/hooks/useAddFoodEntry';
import { useMealTypes } from '../../src/hooks/useMealTypes';
import type { FoodPhotoEstimateResponse } from '@workspace/shared';

jest.mock('../../src/hooks/useAddFoodEntry', () => ({
  useAddFoodEntry: jest.fn(),
}));
jest.mock('../../src/hooks/useMealTypes', () => ({
  useMealTypes: jest.fn(),
}));
jest.mock('../../src/services/haptics', () => ({
  fireSuccessHaptic: jest.fn(),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

// Stub the bottom-sheet picker — we only need to surface the trigger to
// confirm selectedMealTypeId is wired in. The test doesn't change the meal
// from the default.
jest.mock('../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ renderTrigger }: any) =>
      renderTrigger
        ? renderTrigger({ onPress: jest.fn(), selectedOption: undefined })
        : null,
  };
});

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function buildEstimate(): FoodPhotoEstimateResponse {
  return {
    meal_summary: 'Bowl of yogurt and berries',
    overall_confidence: 'medium',
    confidence_reason: 'Some occluded portions.',
    items: [
      {
        name: 'Greek yogurt',
        estimated_grams: 170,
        portion_description: '1 cup',
        preparation: 'plain',
        calories_kcal: 100,
        protein_g: 18,
        carbs_g: 6,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 6,
        item_confidence: 'high',
        assumptions: [],
      },
    ],
    totals: {
      calories_kcal: 320,
      protein_g: 12,
      carbs_g: 40,
      fat_g: 8,
      fiber_g: 5,
      sugar_g: 14,
      total_grams: 250,
    },
    user_weight_reconciliation: '',
    clarifying_questions: [],
  };
}

describe('FoodPhotoReviewScreen', () => {
  const navigation = { popToTop: jest.fn(), goBack: jest.fn() } as any;
  const addEntryAsync = jest.fn().mockResolvedValue(undefined);
  const invalidateCache = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useMealTypes as jest.Mock).mockReturnValue({
      mealTypes: [
        { id: 'mt-1', name: 'Breakfast', is_visible: true, sort_order: 1 },
        { id: 'mt-2', name: 'Lunch', is_visible: true, sort_order: 2 },
      ],
      defaultMealTypeId: 'mt-1',
      isLoading: false,
      isError: false,
    });
    (useAddFoodEntry as jest.Mock).mockReturnValue({
      addEntryAsync,
      isPending: false,
      invalidateCache,
    });
  });

  const renderScreen = (estimate = buildEstimate()) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodPhotoReviewScreen
          navigation={navigation}
          route={{
            key: 'k',
            name: 'FoodPhotoReview' as const,
            params: {
              date: '2026-05-18',
              estimate,
              request: {},
            },
          }}
        />
      </SafeAreaProvider>,
    );

  it('saves with the totals → SaveFoodPayload mapping plus 1-serving food shape', async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Save estimate'));

    await waitFor(() => {
      expect(addEntryAsync).toHaveBeenCalledTimes(1);
    });

    const [input] = addEntryAsync.mock.calls[0];
    expect(input.saveFoodPayload).toEqual({
      name: 'Bowl of yogurt and berries',
      brand: null,
      serving_size: 1,
      serving_unit: 'serving',
      calories: 320,
      protein: 12,
      carbs: 40,
      fat: 8,
      // optional fields: fiber + sugar are >0 so they are forwarded
      dietary_fiber: 5,
      sugars: 14,
      provider_type: 'food_photo_estimate',
    });
    // Critical: must NOT set is_quick_food (would hide from library).
    expect(input.saveFoodPayload.is_quick_food).toBeUndefined();
    // Must use sugars (plural), dietary_fiber (long form), brand: null,
    // and the SaveFoodPayload must not contain a `total_grams` field.
    expect(input.saveFoodPayload.total_grams).toBeUndefined();
    expect(input.saveFoodPayload.fiber).toBeUndefined();
    expect(input.saveFoodPayload.sugar).toBeUndefined();

    expect(input.createEntryPayload).toEqual({
      quantity: 1,
      unit: 'serving',
      meal_type_id: 'mt-1',
      entry_date: '2026-05-18',
    });
  });

  it('omits dietary_fiber and sugars when those totals are 0', async () => {
    const estimate = buildEstimate();
    estimate.totals.fiber_g = 0;
    estimate.totals.sugar_g = 0;
    const screen = renderScreen(estimate);

    fireEvent.press(screen.getByText('Save estimate'));

    await waitFor(() => {
      expect(addEntryAsync).toHaveBeenCalledTimes(1);
    });
    const [input] = addEntryAsync.mock.calls[0];
    expect(input.saveFoodPayload.dietary_fiber).toBeUndefined();
    expect(input.saveFoodPayload.sugars).toBeUndefined();
  });

  it('invalidates the daily summary cache for the entry date on success', async () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Save estimate'));

    await waitFor(() => {
      expect(invalidateCache).toHaveBeenCalledWith('2026-05-18');
    });
  });

  it('prefills calorie / macro inputs from estimate.totals', () => {
    const screen = renderScreen();
    // FormInput is rendered with `value` prop bound to state; jest renderer
    // exposes the prop on the host TextInput node via getByDisplayValue.
    expect(screen.getByDisplayValue('320')).toBeTruthy();
    expect(screen.getByDisplayValue('12')).toBeTruthy();
    expect(screen.getByDisplayValue('40')).toBeTruthy();
  });
});
