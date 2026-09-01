import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodPhotoEstimateReviewScreen from '../../src/screens/FoodPhotoEstimateReviewScreen';
import { setPendingMealIngredientSelection } from '../../src/services/mealBuilderSelection';
import type { FoodPhotoEstimateResponse } from '@workspace/shared';

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const mockUseFocusEffect = jest.fn();
// The screen claims a food picked from the food search when it regains focus.
// These tests render it outside a navigator, so stub the hook the same way the
// MealAddScreen tests do rather than standing up a NavigationContainer.
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useFocusEffect: (callback: () => void) => mockUseFocusEffect(callback),
  };
});

// FoodForm uses useServerConnection + useCustomNutrients which call react-query.
// Mock them as inert so the form renders without a QueryClientProvider.
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

// FoodForm (rendered inside this screen) gates its inline AI estimate flow on
// these hooks. They all call react-query — without a QueryClientProvider in
// the test setup they'd crash. Mock them as inert.
jest.mock('../../src/hooks/useActiveAiServiceSetting', () => ({
  useActiveAiServiceSetting: () => ({ data: null, isLoading: false }),
}));
jest.mock('../../src/hooks/useUserAiConfigAllowed', () => ({
  useUserAiConfigAllowed: () => ({ data: false, isLoading: false }),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: undefined, isLoading: false }),
}));

// Surface every option (flattening sections) as a Pressable so tests can select
// units by tapping their displayed label (e.g. "g", "oz").
jest.mock('../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ options, sections, value, onSelect, renderTrigger }: any) => {
      const flat: { label: string; value: any }[] = sections
        ? sections.flatMap((s: any) => s.options)
        : (options ?? []);
      return (
        <View>
          {renderTrigger?.({
            onPress: () => {},
            selectedOption: flat.find((o) => o.value === value),
          })}
          {flat.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => onSelect(option.value)}
            >
              <Text>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      );
    },
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

  /**
   * The screen now opens on the editable ingredient list. These cases cover the
   * single-food path, so they switch to "One food" first.
   */
  const renderCombined = (estimate = buildEstimate()) => {
    const screen = renderScreen(estimate);
    fireEvent.press(screen.getByText('One food'));
    return screen;
  };

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
      </SafeAreaProvider>
    );

  it('navigates to LogEntry with a saveFoodPayload reflecting the prefilled totals', () => {
    const screen = renderCombined();

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
      })
    );
  });

  it('omits dietary_fiber and sugars when those totals are 0', () => {
    const estimate = buildEstimate();
    estimate.totals.fiber_g = 0;
    estimate.totals.sugar_g = 0;
    const screen = renderCombined(estimate);

    fireEvent.press(screen.getByText('Next'));

    const [, params] = navigation.navigate.mock.calls[0];
    expect(params.saveFoodPayload.dietary_fiber).toBeUndefined();
    expect(params.saveFoodPayload.sugars).toBeUndefined();
  });

  it('converts serving size when toggling between g and oz', () => {
    const screen = renderCombined();

    // Default: 250 g — switch to oz.
    fireEvent.press(screen.getByText('oz'));
    fireEvent.press(screen.getByText('Next'));

    const firstCall = navigation.navigate.mock.calls[0][1];
    expect(firstCall.saveFoodPayload.serving_unit).toBe('oz');
    // 250 g = 8.82 oz; rounded to 1 decimal = 8.8.
    expect(firstCall.saveFoodPayload.serving_size).toBeCloseTo(8.8, 1);

    // Toggle back to grams — should convert back.
    fireEvent.press(screen.getByText('g'));
    fireEvent.press(screen.getByText('Next'));

    const secondCall = navigation.navigate.mock.calls[1][1];
    expect(secondCall.saveFoodPayload.serving_unit).toBe('g');
    // 8.8 oz back to g ≈ 249.5 g (rounded to 1 decimal).
    expect(secondCall.saveFoodPayload.serving_size).toBeGreaterThan(245);
    expect(secondCall.saveFoodPayload.serving_size).toBeLessThan(255);
  });

  it('cancels back to the root via getParent().popToTop()', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('Cancel'));

    expect(parentNavigation.popToTop).toHaveBeenCalledTimes(1);
  });

  it('opens on the editable ingredient list, not the single-food form', () => {
    const screen = renderScreen();
    // Defaults to the option that also saves a reusable meal.
    expect(
      screen.getAllByText('Ingredients + reusable meal').length
    ).toBeGreaterThan(0);
    expect(screen.getByText('Ingredients only')).toBeTruthy();
    expect(screen.getByText('One food')).toBeTruthy();
  });

  it('asks the server to save a reusable meal by default', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Next'));

    const [, params] = navigation.navigate.mock.calls[0];
    expect(params.mode).toBe('grouped');
    expect(params.saveAsMeal).toBe(true);
    expect(params.mealName).toBe('Bowl of yogurt and berries');
  });

  it('logs ingredients without a template when "Ingredients only" is picked', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Ingredients only'));
    fireEvent.press(screen.getByText('Next'));

    const [, params] = navigation.navigate.mock.calls[0];
    // Same grouped diary row, but nothing added to the Meals library.
    expect(params.mode).toBe('grouped');
    expect(params.saveAsMeal).toBe(false);
  });

  it('sends grouped items built from the detected ingredients', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Next'));

    const [routeName, params] = navigation.navigate.mock.calls[0];
    expect(routeName).toBe('LogEntry');
    expect(params.mode).toBe('grouped');
    expect(params.ingredients).toHaveLength(1);
  });

  it('converts each ingredient to per-100g nutrition with the grams on quantity', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Next'));

    const [, params] = navigation.navigate.mock.calls[0];
    const [first] = params.ingredients;
    expect(first.source).toBe('new');
    expect(first.food.serving_size).toBe(100);
    expect(first.food.serving_unit).toBe('g');
    // The AI reported 100 kcal for a 170 g portion, so the stored food is
    // 100/1.7 = 58.82 kcal per 100 g and the entry logs the 170 g eaten.
    expect(first.quantity).toBe(170);
    expect(first.food.calories).toBeCloseTo(58.82, 2);
    expect(first.food.protein).toBeCloseTo(10.59, 2);
  });

  it('logs the plate as one whole serving by default', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Next'));

    const [, params] = navigation.navigate.mock.calls[0];
    expect(params.servingSize).toBe(1);
    expect(params.servingUnit).toBe('serving');
    expect(params.totalServings).toBe(1);
    expect(params.consumedQuantity).toBe(1);
  });

  it('splits the dish into servings and previews only what was eaten', () => {
    const screen = renderScreen();

    fireEvent.changeText(screen.getByLabelText('Total servings'), '4');
    fireEvent.changeText(screen.getByLabelText('Servings eaten'), '1');
    fireEvent.press(screen.getByText('Next'));

    const [, params] = navigation.navigate.mock.calls[0];
    expect(params.totalServings).toBe(4);
    expect(params.consumedQuantity).toBe(1);
    // The ingredients still describe the whole dish — the server applies the
    // portion — but the recap the next screen shows is the quarter eaten.
    expect(params.ingredients[0].quantity).toBe(170);
    expect(params.nutrition.calories).toBeCloseTo(100 / 4, 5);
  });

  it('derives the yield from a measured total and serving size', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('ml'));
    fireEvent.changeText(screen.getByLabelText('Total amount (ml)'), '2000');
    fireEvent.changeText(screen.getByLabelText('One serving is (ml)'), '250');
    fireEvent.changeText(screen.getByLabelText('You ate (ml)'), '250');
    fireEvent.press(screen.getByText('Next'));

    const [, params] = navigation.navigate.mock.calls[0];
    expect(params.servingUnit).toBe('ml');
    expect(params.servingSize).toBe(250);
    expect(params.totalServings).toBe(8);
    expect(params.consumedQuantity).toBe(250);
    // 250 / (250 x 8) = an eighth of the batch.
    expect(params.nutrition.calories).toBeCloseTo(100 / 8, 5);
  });

  it('blocks Next when the dish total is left blank', () => {
    const screen = renderScreen();

    fireEvent.changeText(screen.getByLabelText('Total servings'), '');
    fireEvent.press(screen.getByText('Next'));

    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('adds a food picked from the food search and logs it by id', () => {
    const screen = renderScreen();

    setPendingMealIngredientSelection({
      ingredient: {
        food_id: 'food-1',
        variant_id: 'variant-1',
        food_name: 'Whole milk',
        brand: null,
        quantity: 2,
        unit: 'cup',
        serving_size: 1,
        serving_unit: 'cup',
        calories: 150,
        protein: 8,
        carbs: 12,
        fat: 8,
      },
    });
    // The screen claims the pick when it regains focus after the picker pops.
    act(() => {
      mockUseFocusEffect.mock.calls.at(-1)?.[0]();
    });

    expect(screen.getByText('Whole milk')).toBeTruthy();

    fireEvent.press(screen.getByText('Next'));
    const [, params] = navigation.navigate.mock.calls[0];
    const picked = params.ingredients.find(
      (item: { source: string }) => item.source === 'existing'
    );
    // Logged against the real food at the amount picked, in its own unit — a
    // food measured in cups has no grams to convert to per-100 g.
    expect(picked).toMatchObject({
      source: 'existing',
      food_id: 'food-1',
      variant_id: 'variant-1',
      quantity: 2,
      unit: 'cup',
    });
  });

  it('blocks Next when every ingredient was removed', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('Remove Greek yogurt'));
    fireEvent.press(screen.getByText('Next'));

    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('renders an old-server estimate that carries no item_id or match', () => {
    const estimate = buildEstimate();
    expect(estimate.items[0].item_id).toBeUndefined();
    expect(estimate.items[0].match).toBeUndefined();

    const screen = renderScreen(estimate);
    expect(screen.getByText(/Greek yogurt/)).toBeTruthy();
  });

  describe('switching to One food (PR #2282 review)', () => {
    it('keeps the model plate total when the ingredients were not touched', () => {
      // estimate.totals is the model's own figure for the whole plate and can
      // exceed the sum of the itemised rows, so an untouched draft must not
      // replace it with the row sum.
      const screen = renderCombined();

      fireEvent.press(screen.getByText('Next'));

      const [, params] = navigation.navigate.mock.calls[0];
      expect(params.saveFoodPayload.calories).toBe(320);
      expect(params.saveFoodPayload.serving_size).toBe(250);
    });
  });
});
