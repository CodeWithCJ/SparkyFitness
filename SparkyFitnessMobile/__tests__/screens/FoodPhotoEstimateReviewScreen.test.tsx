import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodPhotoEstimateReviewScreen from '../../src/screens/FoodPhotoEstimateReviewScreen';
import type { FoodPhotoEstimateResponse } from '@workspace/shared';

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

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

describe('FoodPhotoEstimateReviewScreen', () => {
  const parentNavigation = { popToTop: jest.fn() };
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    getParent: jest.fn(() => parentNavigation),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    navigation.getParent.mockReturnValue(parentNavigation);
  });

  const renderScreen = (estimate = buildEstimate()) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodPhotoEstimateReviewScreen
          navigation={navigation}
          route={{
            key: 'k',
            name: 'EstimateReview' as const,
            params: {
              date: '2026-05-18',
              estimate,
              request: {},
            },
          }}
        />
      </SafeAreaProvider>,
    );

  it('navigates to LogEntry with a saveFoodPayload reflecting the prefilled totals', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Next'));

    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    const [routeName, params] = navigation.navigate.mock.calls[0];
    expect(routeName).toBe('LogEntry');
    expect(params).toEqual(
      expect.objectContaining({
        date: '2026-05-18',
        saveFoodPayload: expect.objectContaining({
          name: 'Bowl of yogurt and berries',
          brand: null,
          serving_size: 250,
          serving_unit: 'g',
          calories: 320,
          protein: 12,
          carbs: 40,
          fat: 8,
          dietary_fiber: 5,
          sugars: 14,
          provider_type: 'food_photo_estimate',
        }),
      }),
    );
  });

  it('omits dietary_fiber and sugars when those totals are 0', () => {
    const estimate = buildEstimate();
    estimate.totals.fiber_g = 0;
    estimate.totals.sugar_g = 0;
    const screen = renderScreen(estimate);

    fireEvent.press(screen.getByText('Next'));

    const [, params] = navigation.navigate.mock.calls[0];
    expect(params.saveFoodPayload.dietary_fiber).toBeUndefined();
    expect(params.saveFoodPayload.sugars).toBeUndefined();
  });

  it('converts serving size when toggling between g and oz', () => {
    const screen = renderScreen();

    // Default: 250 g — switch to oz.
    fireEvent.press(screen.getByText('ounces'));
    fireEvent.press(screen.getByText('Next'));

    const firstCall = navigation.navigate.mock.calls[0][1];
    expect(firstCall.saveFoodPayload.serving_unit).toBe('oz');
    // 250 g = 8.82 oz; rounded to 1 decimal = 8.8.
    expect(firstCall.saveFoodPayload.serving_size).toBeCloseTo(8.8, 1);

    // Toggle back to grams — should convert back.
    fireEvent.press(screen.getByText('grams'));
    fireEvent.press(screen.getByText('Next'));

    const secondCall = navigation.navigate.mock.calls[1][1];
    expect(secondCall.saveFoodPayload.serving_unit).toBe('g');
    // 8.8 oz back to g ≈ 249.5 g (rounded to 1 decimal).
    expect(secondCall.saveFoodPayload.serving_size).toBeGreaterThan(245);
    expect(secondCall.saveFoodPayload.serving_size).toBeLessThan(255);
  });

  it('cancels back to the root via getParent().popToTop()', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Cancel'));

    expect(parentNavigation.popToTop).toHaveBeenCalledTimes(1);
  });
});
