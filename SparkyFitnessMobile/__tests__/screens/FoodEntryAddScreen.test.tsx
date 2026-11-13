import React, { type ComponentProps } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  findHeaderItemByAccessibilityLabel,
  pressActionByAccessibilityLabel,
} from './helpers/nativeHeaderTestUtils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import FoodEntryAddScreen from '../../src/screens/FoodEntryAddScreen';
import { FooterSaveBar } from '../../src/components/FormScreenChrome';
import { useMealTypes, useToggleFavorite } from '../../src/hooks';
import {
  useCreateFoodVariant,
  useFoodVariants,
} from '../../src/hooks/useFoodVariants';
import { useSaveFood } from '../../src/hooks/useSaveFood';
import { QueryClientProvider } from '@tanstack/react-query';
import * as foodsApi from '../../src/services/api/foodsApi';
import { useAddFoodEntry } from '../../src/hooks/useAddFoodEntry';
import { useAddFoodEntryMeal } from '../../src/hooks/useAddFoodEntryMeal';
import { setPendingMealIngredientSelection } from '../../src/services/mealBuilderSelection';
import { setPendingMealPlanSelection } from '../../src/services/mealPlanSelection';
import { consumePendingRecipeImportSelection } from '../../src/services/recipeImportSelection';
import { consumePendingActionTagSelection } from '../../src/services/actionTagSelection';
import { buildMealIngredientDraft } from '../../src/utils/mealBuilderDraft';
import type { BarcodeLookupContext } from '../../src/utils/barcodeFoods';
import { foodItemToFoodInfo, mealToFoodInfo } from '../../src/types/foodInfo';
import type { FoodInfoItem } from '../../src/types/foodInfo';
import type { FoodItem } from '../../src/types/foods';
import type { MealFood } from '../../src/types/meals';
import type {
  RootStackParamList,
  RootStackScreenProps,
} from '../../src/types/navigation';
import { useDiaryDateStore } from '../../src/stores/diaryDateStore';

jest.mock('../../src/hooks/useRecipeImport', () => ({
  ...jest.requireActual('../../src/hooks/useRecipeImport'),
  useRecipeImportAccess: () => mockRecipeScope,
}));
let mockRecipeScope: string | null = 'owner-server';
let mockUseRealStepperInput = false;
const mockRecipeClient = new (jest.requireActual(
  '@tanstack/react-query'
).QueryClient)();
const mockBarcodeSources = jest.fn();
jest.mock('../../src/components/BarcodeSources', () => ({
  __esModule: true,
  default: (props: {
    context: BarcodeLookupContext;
    onSelect: (item: FoodInfoItem, context: BarcodeLookupContext) => void;
  }) => {
    mockBarcodeSources(props);
    return null;
  },
}));

const mockPop = jest.fn((count: number) => ({
  type: 'POP',
  payload: { count },
}));
const mockPopToTop = jest.fn(() => ({ type: 'POP_TO_TOP' }));

type FoodEntryNavigation = RootStackScreenProps<'FoodEntryAdd'>['navigation'];
const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  setParams: jest.fn(),
  dispatch: jest.fn(),
  setOptions: jest.fn(),
  isFocused: jest.fn(() => true),
  addListener: jest.fn<
    ReturnType<FoodEntryNavigation['addListener']>,
    Parameters<FoodEntryNavigation['addListener']>
  >(() => jest.fn()),
} satisfies Partial<jest.Mocked<FoodEntryNavigation>>;

const mockUseFocusEffect = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => mockNavigation,
    useFocusEffect: (cb: () => void) => mockUseFocusEffect(cb),
    StackActions: {
      pop: (count: number) => mockPop(count),
      popToTop: () => mockPopToTop(),
    },
  };
});

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => mockRecipeClient,
  useQuery: jest.fn(),
}));

jest.mock('../../src/hooks', () => ({
  useNutrientDisplayPreferences: jest.fn(() => ({ preferences: [] })),
  useMealTypes: jest.fn(),
  usePreferences: jest.fn(() => ({
    preferences: undefined,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })),
  useServerConnection: jest.fn(() => ({ isConnected: true, isLoading: false })),
  useFavorites: jest.fn(() => ({
    favoriteFoods: [],
    favoriteMeals: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })),
  useToggleFavorite: jest.fn(() => ({
    toggleFavorite: jest.fn(),
    isPending: false,
  })),
}));

jest.mock('../../src/hooks/useFoodVariants', () => ({
  useFoodVariants: jest.fn(),
  useCreateFoodVariant: jest.fn(),
}));

jest.mock('../../src/hooks/useSaveFood', () => ({
  useSaveFood: jest.fn(),
}));

jest.mock('../../src/hooks/useAddFoodEntry', () => ({
  useAddFoodEntry: jest.fn(),
}));

jest.mock('../../src/hooks/useAddFoodEntryMeal', () => ({
  useAddFoodEntryMeal: jest.fn(),
}));

jest.mock('../../src/services/mealBuilderSelection', () => ({
  setPendingMealIngredientSelection: jest.fn(),
  consumePendingMealIngredientSelection: jest.fn(),
}));

jest.mock('../../src/services/mealPlanSelection', () => ({
  ...jest.requireActual('../../src/services/mealPlanSelection'),
  setPendingMealPlanSelection: jest.fn(),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../src/components/ui/Button', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      children,
      onPress,
      disabled,
      loading,
      accessibilityLabel,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      loading?: boolean;
      accessibilityLabel?: string;
    }) => (
      <Pressable
        onPress={disabled || loading ? undefined : onPress}
        accessibilityLabel={accessibilityLabel}
      >
        {typeof children === 'string' ? <Text>{children}</Text> : children}
      </Pressable>
    ),
  };
});

jest.mock('../../src/components/StepperInput', () => {
  const React = require('react');
  const { TextInput } = require('react-native');
  const ActualStepperInput = jest.requireActual<
    typeof import('../../src/components/StepperInput')
  >('../../src/components/StepperInput').default;
  return {
    __esModule: true,
    default: (
      props: ComponentProps<
        typeof import('../../src/components/StepperInput').default
      >
    ) =>
      mockUseRealStepperInput ? (
        <ActualStepperInput
          {...props}
          inputProps={{ ...props.inputProps, testID: 'quantity-input' }}
        />
      ) : (
        <TextInput
          testID="quantity-input"
          value={props.value}
          onChangeText={props.onChangeText}
          onBlur={props.onBlur}
        />
      ),
  };
});

jest.mock('../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ options, value, onSelect, renderTrigger }: any) => (
      <View>
        {renderTrigger?.({
          onPress: () => {},
          selectedOption: options.find((option: any) => option.value === value),
        })}
        {options.map((option: any) => (
          <Pressable key={option.value} onPress={() => onSelect(option.value)}>
            <Text>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

jest.mock('../../src/components/FoodUnitSelectorSheet', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ variants, onSelect, renderTrigger }: any) => (
      <View>
        {renderTrigger?.({ onPress: () => {} })}
        {variants.map((variant: any, index: number) => (
          <Pressable
            key={variant.id ?? `variant-${index}`}
            onPress={() => onSelect({ kind: 'existing', variant })}
          >
            <Text>{`${variant.serving_size} ${variant.serving_unit} (${Math.round(variant.calories)} cal)`}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() =>
            onSelect({
              kind: 'draft',
              variant: {
                serving_size: 1,
                serving_unit: 'oz',
                calories: 120,
                protein: 10,
                carbs: 8,
                fat: 4,
              },
            })
          }
        >
          <Text>Create Draft Unit</Text>
        </Pressable>
      </View>
    ),
  };
});

jest.mock('../../src/components/FoodNutritionSummary', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <Text>{name}</Text>,
    FoodNutritionHeader: ({ name }: any) => <Text>{name}</Text>,
    FoodNutrientBreakdown: () => null,
  };
});

jest.mock('../../src/components/CalendarSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockCalendarSheet = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ present: jest.fn() }));
    return <View testID="calendar-sheet" />;
  });
  MockCalendarSheet.displayName = 'MockCalendarSheet';
  return {
    __esModule: true,
    default: MockCalendarSheet,
  };
});

jest.mock('../../src/components/TimeSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockTimeSheet = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ present: jest.fn() }));
    return <View testID="time-sheet" />;
  });
  MockTimeSheet.displayName = 'MockTimeSheet';
  return {
    __esModule: true,
    default: MockTimeSheet,
  };
});

jest.mock('../../src/utils/mealBuilderDraft', () => {
  const actual = jest.requireActual('../../src/utils/mealBuilderDraft');
  return {
    ...actual,
    buildMealIngredientDraft: jest.fn(actual.buildMealIngredientDraft),
    buildMealIngredientDraftFromSavedFood: jest.fn(
      actual.buildMealIngredientDraftFromSavedFood
    ),
  };
});

const { useQuery } = jest.requireMock('@tanstack/react-query') as {
  useQuery: jest.Mock;
};
const mockUseMealTypes = useMealTypes as jest.MockedFunction<
  typeof useMealTypes
>;
const mockUseToggleFavorite = useToggleFavorite as jest.MockedFunction<
  typeof useToggleFavorite
>;
const mockUseFoodVariants = useFoodVariants as jest.MockedFunction<
  typeof useFoodVariants
>;
const mockUseCreateFoodVariant = useCreateFoodVariant as jest.MockedFunction<
  typeof useCreateFoodVariant
>;
const mockUseSaveFood = useSaveFood as jest.MockedFunction<typeof useSaveFood>;
const mockUseAddFoodEntry = useAddFoodEntry as jest.MockedFunction<
  typeof useAddFoodEntry
>;
const mockUseAddFoodEntryMeal = useAddFoodEntryMeal as jest.MockedFunction<
  typeof useAddFoodEntryMeal
>;
const mockSetPendingMealIngredientSelection =
  setPendingMealIngredientSelection as jest.MockedFunction<
    typeof setPendingMealIngredientSelection
  >;
const mockSetPendingMealPlanSelection =
  setPendingMealPlanSelection as jest.MockedFunction<
    typeof setPendingMealPlanSelection
  >;
const mockBuildMealIngredientDraft =
  buildMealIngredientDraft as jest.MockedFunction<
    typeof buildMealIngredientDraft
  >;
const mockToast = Toast as unknown as { show: jest.Mock };

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

describe('FoodEntryAddScreen', () => {
  const navigation = mockNavigation as typeof mockNavigation &
    FoodEntryNavigation;

  const mockSaveFoodAsync = jest.fn();
  const mockAddEntry = jest.fn();
  const mockAddEntryAsync = jest.fn();
  const mockInvalidateCache = jest.fn();
  const mockAddMeal = jest.fn();
  const mockInvalidateMealCache = jest.fn();
  const mockCreateVariant = jest.fn();

  const baseLocalItem = {
    id: 'food-1',
    name: 'Greek Yogurt',
    brand: 'Sparky',
    servingSize: 1,
    servingUnit: 'cup',
    calories: 100,
    protein: 15,
    carbs: 6,
    fat: 0,
    variantId: 'variant-1',
    source: 'local' as const,
    originalItem: {
      id: 'food-1',
      name: 'Greek Yogurt',
    },
  };

  const baseExternalItem = {
    id: 'external-1',
    name: 'Protein Bar',
    brand: 'Remote Brand',
    servingSize: 1,
    servingUnit: 'bar',
    calories: 200,
    protein: 20,
    carbs: 22,
    fat: 7,
    source: 'external' as const,
    originalItem: {
      id: 'external-1',
      name: 'Protein Bar',
    },
  };

  const baseMealItem = {
    id: 'meal-1',
    name: 'Breakfast Meal',
    brand: null,
    servingSize: 1,
    servingUnit: 'serving',
    calories: 450,
    protein: 25,
    carbs: 40,
    fat: 18,
    source: 'meal' as const,
    originalItem: {
      id: 'meal-1',
      name: 'Breakfast Meal',
      foods: [],
    },
  };

  const renderScreen = (params: any) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodEntryAddScreen
          navigation={navigation}
          route={
            {
              key: 'FoodEntryAdd-key',
              name: 'FoodEntryAdd',
              params,
            } as any
          }
        />
      </SafeAreaProvider>
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockRecipeScope = 'owner-server';
    mockUseRealStepperInput = false;
    mockNavigation.isFocused.mockReturnValue(true);
    mockRecipeClient.clear();
    mockRecipeClient.setQueryData(['userProfile'], { id: 'owner' });
    useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    mockUseMealTypes.mockReturnValue({
      mealTypes: [
        { id: 'meal-1', name: 'breakfast', is_visible: true, sort_order: 1 },
      ] as any,
      defaultMealTypeId: 'meal-1',
      isLoading: false,
      isError: false,
    });
    mockUseFoodVariants.mockImplementation((foodId, options) => ({
      variants:
        foodId === 'food-1' && options?.enabled !== false
          ? ([
              {
                id: 'variant-1',
                food_id: 'food-1',
                serving_size: 1,
                serving_unit: 'cup',
                calories: 100,
                protein: 15,
                carbs: 6,
                fat: 0,
              },
            ] as any)
          : undefined,
      isLoading: false,
      isError: false,
    }));
    mockUseCreateFoodVariant.mockReturnValue({
      createVariant: mockCreateVariant,
      isPending: false,
    });
    mockUseSaveFood.mockReturnValue({
      saveFood: jest.fn(),
      saveFoodAsync: mockSaveFoodAsync,
      isPending: false,
      isSaved: false,
    });
    mockUseAddFoodEntry.mockImplementation((options) => ({
      addEntry: (input: any) => {
        mockAddEntry(input);
        options?.onSuccess?.({ entry_date: '2026-04-23' } as any);
      },
      addEntryAsync: async (input: any) => {
        mockAddEntryAsync(input);
        options?.onSuccess?.({ entry_date: '2026-04-23' } as any);
        return { id: 'entry-1' } as any;
      },
      isPending: false,
      invalidateCache: mockInvalidateCache,
    }));
    mockUseAddFoodEntryMeal.mockImplementation((options) => ({
      addMeal: (input: any) => {
        mockAddMeal(input);
        options?.onSuccess?.();
      },
      isPending: false,
      invalidateCache: mockInvalidateMealCache,
    }));
  });

  it('opens the exact missing-nutrition Mealie recipe as an ingredient meal without logging food', () => {
    const screen = renderScreen({
      item: {
        ...baseExternalItem,
        provider_type: 'mealie',
        provider_external_id: 'rice / beans',
        recipe_has_nutrition: false,
        recipeProviderId: 'personal-provider',
        recipeImportScope: 'owner-server',
      },
    });
    fireEvent.press(screen.getByText('Import ingredients as a meal'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('RecipeImport', {
      providerId: 'personal-provider',
      recipeSlug: 'rice / beans',
      scope: 'owner-server',
    });
    expect(mockAddEntry).not.toHaveBeenCalled();
    expect(mockAddMeal).not.toHaveBeenCalled();
  });

  it('does not offer the recipe handoff after the owner changes', () => {
    const screen = renderScreen({
      item: {
        ...baseExternalItem,
        provider_type: 'mealie',
        provider_external_id: 'rice',
        recipe_has_nutrition: false,
        recipeProviderId: 'personal-provider',
        recipeImportScope: 'previous-owner',
      },
    });
    expect(screen.queryByText('Import ingredients as a meal')).toBeNull();
  });
  it('logs an imported cooked batch as an ordinary 450g portion worth 600kcal', () => {
    const item = mealToFoodInfo({
      id: 'cooked-meal',
      user_id: 'owner',
      name: 'Cooked rice',
      description: null,
      is_public: false,
      serving_size: 450,
      serving_unit: 'g',
      total_servings: 4,
      created_at: '2026-11-04',
      updated_at: '2026-11-04',
      foods: [
        {
          id: 'ingredient',
          food_id: 'rice',
          variant_id: 'rice-variant',
          food_name: 'Dry rice',
          brand: null,
          quantity: 600,
          unit: 'g',
          serving_size: 100,
          serving_unit: 'g',
          calories: 400,
          protein: 10,
          carbs: 80,
          fat: 2,
        },
      ],
    });
    expect(item.servingSize).toBe(450);
    expect(item.calories).toBe(600);
    const screen = renderScreen({ item });
    fireEvent.press(screen.getByText('Add Meal'));
    expect(mockAddMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_template_id: 'cooked-meal',
        quantity: 450,
        unit: 'g',
      })
    );
  });

  it('preserves the source mass through the actual recipe food picker', async () => {
    mockUseFoodVariants.mockReturnValue({
      variants: undefined,
      isLoading: false,
      isError: false,
    });
    const screen = renderScreen({
      item: { ...baseLocalItem, servingSize: 100, servingUnit: 'g' },
      pickerMode: 'meal-builder',
      recipeImportTarget: {
        draftKey: 'draft',
        ingredientId: 'rice',
        quantity: 0.6,
        unit: 'kg',
      },
    });
    expect(screen.getByDisplayValue('600')).toBeTruthy();
  });

  it('converts a late equivalent recipe variant exactly once before returning it', () => {
    consumePendingRecipeImportSelection();
    mockUseFoodVariants.mockReturnValue({
      variants: undefined,
      isLoading: true,
      isError: false,
    });
    const params = {
      item: { ...baseLocalItem, servingSize: 1, servingUnit: 'kg' },
      recipeImportTarget: {
        draftKey: 'draft',
        ingredientId: 'rice',
        quantity: 0.8,
        unit: 'kg',
      },
    };
    const screen = renderScreen(params);
    expect(screen.getByDisplayValue('0.8')).toBeTruthy();
    const nutrition = { calories: 100, protein: 15, carbs: 6, fat: 0 };
    mockUseFoodVariants.mockReturnValue({
      variants: [
        {
          id: 'grams',
          food_id: 'food-1',
          serving_size: 1000,
          serving_unit: 'g',
          ...nutrition,
        },
        {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 1,
          serving_unit: 'kg',
          ...nutrition,
        },
      ],
      isLoading: false,
      isError: false,
    });
    screen.rerender(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodEntryAddScreen
          navigation={navigation}
          route={{ key: 'FoodEntryAdd-key', name: 'FoodEntryAdd', params }}
        />
      </SafeAreaProvider>
    );
    expect(screen.getByDisplayValue('800')).toBeTruthy();
    fireEvent.press(screen.getByText('Add Food'));
    expect(consumePendingRecipeImportSelection()).toMatchObject({
      ingredient: { quantity: 800, unit: 'g', variant_id: 'grams' },
    });
  });

  it.each([
    { sourceUnit: 'kg', edited: undefined, expected: '600' },
    { sourceUnit: 'kg', edited: '0.8', expected: '800' },
    { sourceUnit: null, edited: '37', expected: '37' },
    { sourceUnit: null, edited: '.', expected: '.' },
    { sourceUnit: null, edited: undefined, expected: '' },
  ])(
    'keeps the recipe amount while a food without a default serving loads ($sourceUnit, $edited)',
    ({ sourceUnit, edited, expected }) => {
      // Search returns a default-variant projection with null columns when none is marked default.
      const food = {
        id: 'food-1',
        name: 'Rice without a default serving',
        brand: null,
        is_custom: false,
        default_variant: {
          id: undefined,
          serving_size: null,
          serving_unit: null,
          calories: null,
          protein: null,
          carbs: null,
          fat: null,
        },
      } as unknown as FoodItem;
      const item = foodItemToFoodInfo(food);
      expect(item.servingUnit).toBeNull();
      mockUseFoodVariants.mockReturnValue({
        variants: undefined,
        isLoading: true,
        isError: false,
      });
      const params = {
        item,
        recipeImportTarget: {
          draftKey: 'draft',
          ingredientId: 'rice',
          quantity: 0.6,
          unit: sourceUnit,
        },
      };
      const screen = renderScreen(params);
      expect(screen.getByTestId('quantity-input').props.value).toBe('0.6');
      if (edited !== undefined)
        fireEvent.changeText(screen.getByTestId('quantity-input'), edited);
      mockUseFoodVariants.mockReturnValue({
        variants: [
          {
            id: 'grams',
            food_id: 'food-1',
            serving_size: 100,
            serving_unit: 'g',
            calories: 400,
            protein: 8,
            carbs: 80,
            fat: 2,
          },
        ],
        isLoading: false,
        isError: false,
      });
      screen.rerender(
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <FoodEntryAddScreen
            navigation={navigation}
            route={{ key: 'FoodEntryAdd-key', name: 'FoodEntryAdd', params }}
          />
        </SafeAreaProvider>
      );
      expect(screen.getByTestId('quantity-input').props.value).toBe(expected);
      if (expected === '' || expected === '.') {
        fireEvent.press(screen.getByText('Add Food'));
        expect(mockBuildMealIngredientDraft).not.toHaveBeenCalled();
      }
    }
  );

  it('preserves an explicit edit when the first variant cannot initialize a source amount', () => {
    mockUseFoodVariants.mockReturnValue({
      variants: undefined,
      isLoading: true,
      isError: false,
    });
    const params = {
      item: {
        ...baseLocalItem,
        variantId: undefined,
        servingSize: 100,
        servingUnit: 'g',
      },
      recipeImportTarget: {
        draftKey: 'draft',
        ingredientId: 'rice',
        quantity: null,
        unit: null,
      },
    };
    const screen = renderScreen(params);
    fireEvent.changeText(screen.getByTestId('quantity-input'), '37');
    mockUseFoodVariants.mockReturnValue({
      variants: [
        {
          id: 'grams',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 400,
          protein: 8,
          carbs: 80,
          fat: 2,
        },
      ],
      isLoading: false,
      isError: false,
    });
    screen.rerender(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodEntryAddScreen
          navigation={navigation}
          route={{ key: 'FoodEntryAdd-key', name: 'FoodEntryAdd', params }}
        />
      </SafeAreaProvider>
    );
    expect(screen.getByDisplayValue('37')).toBeTruthy();
  });

  it.each([
    'profile',
    'scope',
    'cache-clear',
    'same-owner',
    'ordinary',
  ] as const)(
    'checks the initiating recipe owner before a new external save after %s',
    async (change) => {
      consumePendingRecipeImportSelection();
      mockSaveFoodAsync.mockResolvedValue({
        id: 'saved',
        default_variant: { id: 'saved-variant' },
      });
      const params = {
        item: baseExternalItem,
        pickerMode: 'meal-builder' as const,
        ...(change === 'ordinary'
          ? {}
          : {
              recipeImportTarget: {
                draftKey: 'draft',
                ingredientId: 'bar',
                quantity: 2,
                unit: 'bar',
              },
            }),
      };
      const screen = renderScreen(params);
      act(() => {
        if (change === 'profile' || change === 'ordinary')
          mockRecipeClient.setQueryData(['userProfile'], { id: 'other-owner' });
        if (change === 'cache-clear') {
          mockRecipeClient.clear();
          mockRecipeClient.setQueryData(['userProfile'], { id: 'owner' });
        }
        if (change === 'same-owner')
          mockRecipeClient.setQueryData(['userProfile'], { id: 'owner' });
      });
      if (change === 'scope') mockRecipeScope = 'other-owner-server';
      screen.rerender(
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <FoodEntryAddScreen
            navigation={navigation}
            route={{ key: 'FoodEntryAdd-key', name: 'FoodEntryAdd', params }}
          />
        </SafeAreaProvider>
      );
      fireEvent.press(screen.getByText('Add Food'));
      if (change === 'same-owner' || change === 'ordinary') {
        await waitFor(() => expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1));
        await waitFor(() =>
          expect(navigation.dispatch).toHaveBeenCalledTimes(1)
        );
      } else {
        expect(mockSaveFoodAsync).not.toHaveBeenCalled();
        expect(navigation.dispatch).not.toHaveBeenCalled();
        expect(consumePendingRecipeImportSelection()).toBeNull();
      }
      mockSaveFoodAsync.mockReset();
    }
  );

  it.each(['owner-server', 'replacement-owner-server'])(
    'explains how to recover a recipe picker mounted without an owner before %s loads',
    (loadedScope) => {
      consumePendingRecipeImportSelection();
      mockRecipeScope = null;
      mockRecipeClient.clear();
      const params = {
        item: baseExternalItem,
        pickerMode: 'meal-builder' as const,
        recipeImportTarget: {
          draftKey: 'draft',
          ingredientId: 'bar',
          quantity: 2,
          unit: 'bar',
        },
      };
      const screen = renderScreen(params);
      const recovery =
        'Reopen the recipe import review and choose this ingredient again.';
      expect(screen.getByText(recovery)).toBeTruthy();
      expect(screen.UNSAFE_getByType(FooterSaveBar).props.disabled).toBe(true);
      fireEvent.press(screen.getByText('Add Food'));
      expect(mockSaveFoodAsync).not.toHaveBeenCalled();
      act(() => {
        mockRecipeClient.setQueryData(['userProfile'], {
          id: loadedScope === 'owner-server' ? 'owner' : 'replacement-owner',
        });
        mockRecipeClient.setQueryData(['serverConfigs'], {
          activeConfig: { id: 'server', url: 'https://example.test' },
        });
      });
      mockRecipeScope = loadedScope;
      screen.rerender(
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <FoodEntryAddScreen
            navigation={navigation}
            route={{ key: 'FoodEntryAdd-key', name: 'FoodEntryAdd', params }}
          />
        </SafeAreaProvider>
      );
      expect(screen.getByText(recovery)).toBeTruthy();
      expect(screen.UNSAFE_getByType(FooterSaveBar).props.disabled).toBe(true);
      fireEvent.press(screen.getByText('Add Food'));
      expect(mockSaveFoodAsync).not.toHaveBeenCalled();
      expect(navigation.dispatch).not.toHaveBeenCalled();
      expect(consumePendingRecipeImportSelection()).toBeNull();
    }
  );

  it.each(['same-owner-reauthentication', 'replacement-profile'] as const)(
    'renders recipe recovery and rejects a captured Add callback synchronously after %s',
    (change) => {
      consumePendingRecipeImportSelection();
      const screen = renderScreen({
        item: baseExternalItem,
        pickerMode: 'meal-builder',
        recipeImportTarget: {
          draftKey: 'draft',
          ingredientId: 'bar',
          quantity: 2,
          unit: 'bar',
        },
      });
      expect(screen.UNSAFE_getByType(FooterSaveBar).props.disabled).toBe(false);
      const addBeforeIdentityChange = screen.UNSAFE_getByType(FooterSaveBar)
        .props.onPress as () => void;
      act(() => {
        if (change === 'same-owner-reauthentication') mockRecipeClient.clear();
        mockRecipeClient.setQueryData(['userProfile'], {
          id:
            change === 'same-owner-reauthentication' ? 'owner' : 'other-owner',
        });
        addBeforeIdentityChange();
      });
      expect(mockSaveFoodAsync).not.toHaveBeenCalled();
      expect(screen.UNSAFE_getByType(FooterSaveBar).props.disabled).toBe(true);
      expect(
        screen.getByText(
          'Reopen the recipe import review and choose this ingredient again.'
        )
      ).toBeTruthy();
      expect(navigation.dispatch).not.toHaveBeenCalled();
      expect(consumePendingRecipeImportSelection()).toBeNull();
    }
  );

  it('keeps an ordinary external food selection available without recipe identity', async () => {
    mockRecipeScope = null;
    mockSaveFoodAsync.mockResolvedValue({
      id: 'saved',
      default_variant: { id: 'saved-variant' },
    });
    const screen = renderScreen({
      item: baseExternalItem,
      pickerMode: 'meal-builder',
    });
    expect(screen.UNSAFE_getByType(FooterSaveBar).props.disabled).toBe(false);
    expect(
      screen.queryByText(
        'Reopen the recipe import review and choose this ingredient again.'
      )
    ).toBeNull();
    fireEvent.press(screen.getByText('Add Food'));
    await waitFor(() =>
      expect(mockSetPendingMealIngredientSelection).toHaveBeenCalledTimes(1)
    );
    expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
    mockSaveFoodAsync.mockReset();
  });

  it.each([
    {
      action: 'add',
      sourceUnit: 'g',
      quantity: 200,
      servingSize: 100,
      initialUnit: 'g',
      before: '250',
      after: '250',
    },
    {
      action: 'remove',
      sourceUnit: 'g',
      quantity: 200,
      servingSize: 100,
      initialUnit: 'g',
      before: '150',
      after: '150',
    },
    {
      action: 'add',
      sourceUnit: null,
      quantity: null,
      servingSize: 100,
      initialUnit: 'g',
      before: '50',
      after: '50',
    },
    {
      action: 'remove',
      sourceUnit: null,
      quantity: null,
      servingSize: 100,
      initialUnit: 'g',
      before: '50',
      after: '50',
    },
    {
      action: 'add',
      sourceUnit: 'kg',
      quantity: 0.6,
      servingSize: 1,
      initialUnit: 'kg',
      before: '1',
      after: '1000',
    },
    {
      action: 'remove',
      sourceUnit: 'kg',
      quantity: 0.6,
      servingSize: 1,
      initialUnit: 'kg',
      before: '0.5',
      after: '500',
    },
  ])(
    'preserves an actual $action stepper edit while the first recipe variant loads ($sourceUnit)',
    ({
      action,
      sourceUnit,
      quantity,
      servingSize,
      initialUnit,
      before,
      after,
    }) => {
      mockUseRealStepperInput = true;
      mockUseFoodVariants.mockReturnValue({
        variants: undefined,
        isLoading: true,
        isError: false,
      });
      const params = {
        item: {
          ...baseLocalItem,
          variantId: undefined,
          servingSize,
          servingUnit: initialUnit,
        },
        recipeImportTarget: {
          draftKey: 'draft',
          ingredientId: 'rice',
          quantity,
          unit: sourceUnit,
        },
      };
      const screen = renderScreen(params);
      fireEvent.press(screen.getByTestId(`icon-${action}`));
      expect(screen.getByTestId('quantity-input').props.value).toBe(before);
      mockUseFoodVariants.mockReturnValue({
        variants: [
          {
            id: 'grams',
            food_id: 'food-1',
            serving_size: 100,
            serving_unit: 'g',
            calories: 400,
            protein: 8,
            carbs: 80,
            fat: 2,
          },
        ],
        isLoading: false,
        isError: false,
      });
      screen.rerender(
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <FoodEntryAddScreen
            navigation={navigation}
            route={{ key: 'FoodEntryAdd-key', name: 'FoodEntryAdd', params }}
          />
        </SafeAreaProvider>
      );
      expect(screen.getByTestId('quantity-input').props.value).toBe(after);
    }
  );

  it('retains the ordinary actual stepper amount through food selection', () => {
    mockUseRealStepperInput = true;
    const screen = renderScreen({
      item: baseLocalItem,
      pickerMode: 'meal-builder',
    });
    fireEvent.press(screen.getByTestId('icon-add'));
    expect(screen.getByTestId('quantity-input').props.value).toBe('1.5');
    fireEvent.press(screen.getByTestId('icon-remove'));
    expect(screen.getByTestId('quantity-input').props.value).toBe('1');
    fireEvent.press(screen.getByText('Add Food'));
    expect(mockSetPendingMealIngredientSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredient: expect.objectContaining({ quantity: 1, unit: 'cup' }),
      })
    );
  });

  it.each(['meal-builder', undefined] as const)(
    'returns the recipe ingredient to its draft without diary or NFC writes (%s)',
    async (pickerMode) => {
      consumePendingRecipeImportSelection();
      consumePendingActionTagSelection();
      const target = {
        draftKey: 'recipe-draft',
        ingredientId: 'yogurt',
        quantity: 2,
        unit: 'cup',
      };
      const screen = renderScreen({
        item: baseLocalItem,
        pickerMode,
        recipeImportTarget: target,
        returnDepth: 3,
      });

      fireEvent.press(screen.getByText('Add Food'));

      await waitFor(() =>
        expect(consumePendingRecipeImportSelection()).toEqual({
          target,
          ingredient: expect.objectContaining({
            food_id: 'food-1',
            variant_id: 'variant-1',
            quantity: 2,
            unit: 'cup',
          }),
        })
      );
      expect(navigation.dispatch).toHaveBeenCalledWith({
        type: 'POP',
        payload: { count: 3 },
      });
      expect(consumePendingActionTagSelection()).toBeNull();
      expect(mockSetPendingMealIngredientSelection).not.toHaveBeenCalled();
      expect(mockAddEntry).not.toHaveBeenCalled();
    }
  );

  it.each(['handler', 'effect'] as const)(
    'retains edited recipe amounts through the %s variant path',
    async (path) => {
      const variants = [
        {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 100,
          protein: 15,
          carbs: 6,
          fat: 0,
        },
        {
          id: 'grams-two',
          food_id: 'food-1',
          serving_size: 50,
          serving_unit: 'g',
          calories: 70,
          protein: 15,
          carbs: 6,
          fat: 0,
        },
        {
          id: 'kilos',
          food_id: 'food-1',
          serving_size: 1,
          serving_unit: 'kg',
          calories: 900,
          protein: 15,
          carbs: 6,
          fat: 0,
        },
      ];
      mockUseFoodVariants.mockReturnValue({
        variants: path === 'handler' ? variants : undefined,
        isLoading: false,
        isError: false,
      });
      const params = {
        item: { ...baseLocalItem, servingSize: 100, servingUnit: 'g' },
        pickerMode: 'meal-builder' as const,
        recipeImportTarget: {
          draftKey: 'draft',
          ingredientId: 'rice',
          quantity: 600,
          unit: 'g',
        },
      };
      const screen = renderScreen(params);
      fireEvent.changeText(screen.getByDisplayValue('600'), '800');
      if (path === 'handler') {
        fireEvent.press(screen.getAllByText('50 g (70 cal)')[0]);
        expect(screen.getByDisplayValue('800')).toBeTruthy();
        fireEvent.press(screen.getAllByText('1 kg (900 cal)')[0]);
      } else {
        // Saved variants arrive from the existing API hook after the amount was edited.
        mockUseFoodVariants.mockReturnValue({
          variants: [{ ...variants[2], id: 'variant-1' }],
          isLoading: false,
          isError: false,
        });
        screen.rerender(
          <SafeAreaProvider initialMetrics={{ insets, frame }}>
            <FoodEntryAddScreen
              navigation={navigation}
              route={{ key: 'FoodEntryAdd-key', name: 'FoodEntryAdd', params }}
            />
          </SafeAreaProvider>
        );
      }
      expect(screen.getByDisplayValue('0.8')).toBeTruthy();
    }
  );
  it.each([
    'current',
    'ordinary',
    'blur',
    'unmount',
    'cache-clear',
    'profile',
  ] as const)(
    'keeps real shared save-hook notifications current after %s',
    async (departure) => {
      mockUseSaveFood.mockImplementation(
        jest.requireActual<typeof import('../../src/hooks/useSaveFood')>(
          '../../src/hooks/useSaveFood'
        ).useSaveFood
      );
      let fail!: (error: Error) => void;
      const save = jest.spyOn(foodsApi, 'saveFood').mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            fail = reject;
          })
      );
      const view = render(
        <QueryClientProvider client={mockRecipeClient}>
          <SafeAreaProvider initialMetrics={{ insets, frame }}>
            <FoodEntryAddScreen
              navigation={navigation}
              route={{
                key: 'FoodEntryAdd-key',
                name: 'FoodEntryAdd',
                params: {
                  item: baseExternalItem,
                  pickerMode: 'meal-builder',
                  ...(departure === 'ordinary'
                    ? {}
                    : {
                        recipeImportTarget: {
                          draftKey: 'draft',
                          ingredientId: 'bar',
                          quantity: 2,
                          unit: 'bar',
                        },
                      }),
                },
              }}
            />
          </SafeAreaProvider>
        </QueryClientProvider>
      );
      fireEvent.press(view.getByText('Add Food'));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      act(() => {
        if (departure === 'blur') {
          mockNavigation.isFocused.mockReturnValue(false);
          for (const [event, listener] of mockNavigation.addListener.mock.calls)
            if (event === 'blur')
              listener({ type: 'blur', target: 'FoodEntryAdd-key' });
        }
        if (departure === 'cache-clear') mockRecipeClient.clear();
        if (departure === 'profile')
          mockRecipeClient.setQueryData(['userProfile'], { id: 'other-owner' });
      });
      if (departure === 'unmount') view.unmount();
      await act(async () => fail(new Error('save rejected')));
      if (departure === 'current' || departure === 'ordinary')
        expect(Toast.show).toHaveBeenCalledWith(
          expect.objectContaining({ text1: 'Failed to save food' })
        );
      else expect(Toast.show).not.toHaveBeenCalled();
      save.mockRestore();
      if (departure !== 'unmount') view.unmount();
    }
  );

  it.each([
    'blur',
    'refocus',
    'unmount',
    'cache-clear',
    'target-replacement',
    'owner-replacement',
  ] as const)(
    'discards a recipe selection whose external save completes after %s',
    async (departure) => {
      consumePendingRecipeImportSelection();
      let finish: (value: unknown) => void = () => {};
      mockSaveFoodAsync.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      const screen = renderScreen({
        item: baseExternalItem,
        pickerMode: 'meal-builder',
        recipeImportTarget: {
          draftKey: 'draft',
          ingredientId: 'bar',
          quantity: 2,
          unit: 'bar',
        },
      });
      fireEvent.press(screen.getByText('Add Food'));
      expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
      act(() => {
        if (departure === 'blur' || departure === 'refocus')
          for (const [event, listener] of mockNavigation.addListener.mock.calls)
            if (event === 'blur')
              listener({ type: 'blur', target: 'FoodEntryAdd-key' });
        mockNavigation.isFocused.mockReturnValue(
          departure !== 'blur' && departure !== 'unmount'
        );
      });
      if (
        departure === 'owner-replacement' ||
        departure === 'target-replacement'
      ) {
        if (departure === 'owner-replacement') mockRecipeScope = 'other-owner';
        screen.rerender(
          <SafeAreaProvider initialMetrics={{ insets, frame }}>
            <FoodEntryAddScreen
              navigation={navigation}
              route={{
                key: 'FoodEntryAdd-key',
                name: 'FoodEntryAdd',
                params: {
                  item: baseExternalItem,
                  pickerMode: 'meal-builder',
                  recipeImportTarget: {
                    draftKey:
                      departure === 'target-replacement'
                        ? 'new-draft'
                        : 'draft',
                    ingredientId: 'bar',
                    quantity: 2,
                    unit: 'bar',
                  },
                },
              }}
            />
          </SafeAreaProvider>
        );
      }
      if (departure === 'unmount') screen.unmount();
      if (departure === 'cache-clear') {
        act(() => {
          mockNavigation.isFocused.mockReturnValue(true);
          mockRecipeClient.clear();
        });
      }
      await act(async () => {
        finish({ id: 'saved', default_variant: { id: 'saved-variant' } });
      });
      expect(navigation.dispatch).not.toHaveBeenCalled();
      expect(consumePendingRecipeImportSelection()).toBeNull();
    }
  );

  it.each([false, true])(
    'invalidates a pending recipe save only after committed target replacement (%s)',
    async (replace) => {
      consumePendingRecipeImportSelection();
      let finish: (value: unknown) => void = () => {};
      mockSaveFoodAsync.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      const target = {
        draftKey: 'draft-a',
        ingredientId: 'bar',
        quantity: 2,
        unit: 'bar',
      };
      const view = (recipeImportTarget: typeof target) => (
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <FoodEntryAddScreen
            navigation={navigation}
            route={{
              key: 'FoodEntryAdd-key',
              name: 'FoodEntryAdd',
              params: {
                item: baseExternalItem,
                pickerMode: 'meal-builder',
                recipeImportTarget,
              },
            }}
          />
        </SafeAreaProvider>
      );
      const screen = render(view(target));
      fireEvent.press(screen.getByText('Add Food'));
      expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
      if (replace) screen.rerender(view({ ...target, draftKey: 'draft-b' }));
      screen.rerender(view({ ...target }));
      expect(navigation.isFocused()).toBe(true);
      await act(async () =>
        finish({ id: 'saved-food', default_variant: { id: 'saved-variant' } })
      );
      if (replace) {
        expect(navigation.dispatch).not.toHaveBeenCalled();
        expect(consumePendingRecipeImportSelection()).toBeNull();
      } else {
        expect(navigation.dispatch).toHaveBeenCalledTimes(1);
        expect(consumePendingRecipeImportSelection()).toMatchObject({
          target,
          ingredient: { food_id: 'saved-food', variant_id: 'saved-variant' },
        });
      }
    }
  );

  it('returns a persisted recipe candidate override without creating another local variant', async () => {
    consumePendingRecipeImportSelection();
    mockUseFoodVariants.mockReturnValue({
      variants: undefined,
      isLoading: false,
      isError: false,
    });
    const variant = {
      id: 'mapped-variant',
      food_id: 'food-1',
      serving_size: 100,
      serving_unit: 'g',
      calories: 100,
      protein: 1,
      carbs: 2,
      fat: 3,
    };
    const target = {
      draftKey: 'draft',
      ingredientId: 'rice',
      quantity: 600,
      unit: 'g',
    };
    const screen = renderScreen({
      item: {
        ...baseLocalItem,
        variantId: variant.id,
        servingSize: 100,
        servingUnit: 'g',
      },
      pickerMode: 'meal-builder',
      recipeImportTarget: target,
      selectedVariantOverride: variant,
    });
    fireEvent.press(screen.getByText('Add Food'));
    expect(mockCreateVariant).not.toHaveBeenCalled();
    expect(consumePendingRecipeImportSelection()).toMatchObject({
      target,
      ingredient: {
        food_id: 'food-1',
        variant_id: 'mapped-variant',
        quantity: 600,
        unit: 'g',
      },
    });
    expect(navigation.dispatch).toHaveBeenCalledTimes(1);
  });
  it('keeps incomplete recipe amount input across same-unit variants and requires input for incompatible units', () => {
    const variants = [
      {
        id: 'variant-1',
        food_id: 'food-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 100,
        protein: 1,
        carbs: 2,
        fat: 3,
      },
      {
        id: 'other-g',
        food_id: 'food-1',
        serving_size: 50,
        serving_unit: 'g',
        calories: 70,
        protein: 1,
        carbs: 2,
        fat: 3,
      },
      {
        id: 'volume',
        food_id: 'food-1',
        serving_size: 100,
        serving_unit: 'ml',
        calories: 120,
        protein: 1,
        carbs: 2,
        fat: 3,
      },
    ];
    mockUseFoodVariants.mockReturnValue({
      variants,
      isLoading: false,
      isError: false,
    });
    const screen = renderScreen({
      item: { ...baseLocalItem, servingSize: 100, servingUnit: 'g' },
      recipeImportTarget: {
        draftKey: 'draft',
        ingredientId: 'rice',
        quantity: 600,
        unit: 'g',
      },
    });
    fireEvent.changeText(screen.getByDisplayValue('600'), '.');
    fireEvent.press(screen.getAllByText('50 g (70 cal)')[0]);
    expect(screen.getByTestId('quantity-input').props.value).toBe('.');
    fireEvent.changeText(screen.getByTestId('quantity-input'), '800');
    fireEvent.press(screen.getAllByText('100 ml (120 cal)')[0]);
    expect(screen.getByTestId('quantity-input').props.value).toBe('');
    fireEvent.press(screen.getByText('Add Food'));
    expect(mockBuildMealIngredientDraft).not.toHaveBeenCalled();
  });
  it('requires an explicit amount when source volume cannot become the selected mass', () => {
    mockUseFoodVariants.mockReturnValue({
      variants: undefined,
      isLoading: false,
      isError: false,
    });
    const screen = renderScreen({
      item: { ...baseLocalItem, servingSize: 100, servingUnit: 'g' },
      pickerMode: 'meal-builder',
      recipeImportTarget: {
        draftKey: 'draft',
        ingredientId: 'milk',
        quantity: 250,
        unit: 'ml',
      },
    });
    expect(screen.queryByDisplayValue('250')).toBeNull();
    expect(screen.queryByDisplayValue('100')).toBeNull();
    fireEvent.press(screen.getByText('Add Food'));
    expect(mockBuildMealIngredientDraft).not.toHaveBeenCalled();
  });

  it.each(['meal-builder', 'meal-plan', undefined] as const)(
    'switches barcode source with a fresh item and preserves %s return context',
    (pickerMode) => {
      const barcodeLookup: BarcodeLookupContext = {
        barcode: '1234567890123',
        providerId: 'local',
      };
      const mealPlanTarget = {
        dayOfWeek: 2,
        mealTypeId: 'meal-1',
        mealTypeName: 'Breakfast',
      };
      renderScreen({
        item: baseLocalItem,
        barcodeLookup,
        date: '2026-04-23',
        mealTypeId: 'meal-1',
        pickerMode,
        returnDepth: 2,
        mealPlanTarget,
        entryNotes: 'Keep my note',
        entryTime: '08:15',
      });
      const nextItem: FoodInfoItem = {
        ...baseExternalItem,
        provider_type: 'example',
        provider_external_id: 'external-1',
        originalItem: {
          name: baseExternalItem.name,
          brand: null,
          is_custom: false,
          default_variant: {
            serving_size: 1,
            serving_unit: 'bar',
            calories: 200,
            protein: 20,
            carbs: 22,
            fat: 7,
            is_default: true,
          },
        },
      };
      const nextContext = { ...barcodeLookup, providerId: 'provider-two' };
      const props = mockBarcodeSources.mock.calls.at(-1)?.[0] as {
        onSelect: (item: FoodInfoItem, context: BarcodeLookupContext) => void;
      };
      props.onSelect(nextItem, nextContext);
      expect(mockNavigation.replace).toHaveBeenCalledWith('FoodEntryAdd', {
        item: nextItem,
        barcodeLookup: nextContext,
        date: '2026-04-23',
        mealTypeId: 'meal-1',
        pickerMode,
        returnDepth: 2,
        mealPlanTarget,
        entryNotes: 'Keep my note',
        entryTime: '08:15',
      });
      expect(mockSaveFoodAsync).not.toHaveBeenCalled();
      expect(mockAddEntry).not.toHaveBeenCalled();
    }
  );

  describe('entry time after switching barcode source', () => {
    let previousDiaryDate: string;

    beforeEach(() => {
      previousDiaryDate = useDiaryDateStore.getState().selectedDate;
      mockUseMealTypes.mockReturnValue({
        ...mockUseMealTypes(),
        mealTypes: [
          {
            id: 'meal-1',
            name: 'Breakfast target',
            user_id: 'test-user',
            created_at: '2020-01-01T00:00:00Z',
            is_visible: true,
            show_in_quick_log: true,
            sort_order: 1,
            default_time: '08:00',
          },
          {
            id: 'meal-2',
            name: 'Lunch target',
            user_id: 'test-user',
            created_at: '2020-01-01T00:00:00Z',
            is_visible: true,
            show_in_quick_log: true,
            sort_order: 2,
            default_time: '12:30',
          },
        ],
      });
    });

    afterEach(() => {
      useDiaryDateStore.getState().setSelectedDate(previousDiaryDate);
    });

    const switchToLocalSource = (screen: ReturnType<typeof render>) => {
      const props = mockBarcodeSources.mock.lastCall?.[0] as {
        onSelect: (item: FoodInfoItem, context: BarcodeLookupContext) => void;
      };
      props.onSelect(baseLocalItem, {
        barcode: '1234567890123',
        providerId: 'local',
      });
      const params = mockNavigation.replace.mock.lastCall?.[1] as
        RootStackParamList['FoodEntryAdd'] | undefined;
      if (!params)
        throw new Error('Source switch did not replace the add screen');
      screen.unmount();
      return renderScreen(params);
    };

    const renderBarcodeEntry = (entryTime?: string) =>
      renderScreen({
        item: baseExternalItem,
        barcodeLookup: { barcode: '1234567890123', providerId: 'provider-one' },
        date: '2020-04-23',
        mealTypeId: 'meal-1',
        entryTime,
      });

    it('recalculates an untouched automatic time when the meal changes after a source switch', () => {
      const screen = switchToLocalSource(renderBarcodeEntry());
      fireEvent.press(screen.getByText('Lunch target'));
      fireEvent.press(screen.getByText('Add Food'));
      expect(mockAddEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          createEntryPayload: expect.objectContaining({ entry_time: '12:30' }),
        })
      );
    });

    it('fills an untouched time when a past entry changes to today after a source switch', () => {
      mockUseMealTypes.mockReturnValue({
        ...mockUseMealTypes(),
        mealTypes: mockUseMealTypes().mealTypes.map((mealType) => ({
          ...mealType,
          default_time: null,
        })),
      });
      const screen = switchToLocalSource(renderBarcodeEntry());
      fireEvent.press(screen.getByText('Use Today'));
      fireEvent.press(screen.getByText('Add Food'));
      expect(mockAddEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          createEntryPayload: expect.objectContaining({
            entry_time: expect.stringMatching(/^([01]\d|2[0-3]):[0-5]\d$/),
          }),
        })
      );
    });

    it('keeps an explicitly selected time through a source switch and meal/date changes', () => {
      const screen = switchToLocalSource(renderBarcodeEntry('09:45'));
      fireEvent.press(screen.getByText('Lunch target'));
      fireEvent.press(screen.getByText('Use Today'));
      fireEvent.press(screen.getByText('Add Food'));
      expect(mockAddEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          createEntryPayload: expect.objectContaining({ entry_time: '09:45' }),
        })
      );
    });

    it('keeps an intentional clear as a null entry time after a source switch and meal/date changes', () => {
      const initialScreen = renderBarcodeEntry();
      fireEvent.press(initialScreen.getByText('Clear'));
      const screen = switchToLocalSource(initialScreen);
      fireEvent.press(screen.getByText('Lunch target'));
      fireEvent.press(screen.getByText('Use Today'));
      fireEvent.press(screen.getByText('Add Food'));
      expect(mockAddEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          createEntryPayload: expect.objectContaining({ entry_time: null }),
        })
      );
    });
  });

  it('stores a pending ingredient and pops back for local foods in meal-builder mode', async () => {
    const screen = renderScreen({
      item: baseLocalItem,
      pickerMode: 'meal-builder',
      returnDepth: 2,
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockSetPendingMealIngredientSelection).toHaveBeenCalledWith({
        ingredient: expect.objectContaining({
          food_id: 'food-1',
          variant_id: 'variant-1',
          quantity: 1,
          unit: 'cup',
        }),
        ingredientIndex: undefined,
      });
    });
    expect(navigation.dispatch).toHaveBeenCalledWith({
      type: 'POP',
      payload: { count: 2 },
    });
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('saves external foods first and then stores the ingredient draft in meal-builder mode', async () => {
    mockSaveFoodAsync.mockResolvedValue({
      id: 'saved-food-1',
      name: 'Protein Bar',
      brand: 'Remote Brand',
      is_custom: false,
      default_variant: {
        id: 'saved-variant-1',
        serving_size: 1,
        serving_unit: 'bar',
        calories: 200,
        protein: 20,
        carbs: 22,
        fat: 7,
      },
    });

    const screen = renderScreen({
      item: baseExternalItem,
      pickerMode: 'meal-builder',
      returnDepth: 3,
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockSetPendingMealIngredientSelection).toHaveBeenCalledWith({
      ingredient: expect.objectContaining({
        food_id: 'saved-food-1',
        variant_id: 'saved-variant-1',
        quantity: 1,
      }),
      ingredientIndex: undefined,
    });
    expect(navigation.dispatch).toHaveBeenCalledWith({
      type: 'POP',
      payload: { count: 3 },
    });
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('preserves converted nutrition when first adding an external converted unit to a meal', async () => {
    mockSaveFoodAsync.mockResolvedValue({
      id: 'saved-food-1',
      name: 'Protein Bar',
      brand: 'Remote Brand',
      is_custom: false,
      default_variant: {
        id: 'saved-variant-1',
        serving_size: 1,
        serving_unit: 'bar',
        calories: 200,
        protein: 20,
        carbs: 22,
        fat: 7,
      },
    });
    mockCreateVariant.mockResolvedValue({
      id: 'saved-variant-oz',
      food_id: 'saved-food-1',
      serving_size: '1',
      serving_unit: 'oz',
      calories: undefined,
      protein: undefined,
      carbs: undefined,
      fat: undefined,
    });

    const screen = renderScreen({
      item: baseExternalItem,
      pickerMode: 'meal-builder',
      adjustedValues: {
        name: 'Protein Bar',
        brand: 'Remote Brand',
        servingSize: '1',
        servingUnit: 'oz',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
        fiber: '',
        saturatedFat: '',
        sodium: '',
        sugars: '',
        transFat: '',
        potassium: '',
        calcium: '',
        iron: '',
        cholesterol: '',
        vitaminA: '',
        vitaminC: '',
      },
      adjustedUnitSelection: {
        kind: 'draft',
        variant: {
          serving_size: 1,
          serving_unit: 'oz',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        },
      },
    });

    await waitFor(() => {
      expect(navigation.setParams).toHaveBeenCalledWith({
        adjustedValues: undefined,
        adjustedUnitSelection: undefined,
      });
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockCreateVariant).toHaveBeenCalledTimes(1);
    });

    expect(mockSetPendingMealIngredientSelection).toHaveBeenCalledWith({
      ingredient: expect.objectContaining({
        food_id: 'saved-food-1',
        variant_id: 'saved-variant-oz',
        quantity: 1,
        unit: 'oz',
        serving_size: 1,
        serving_unit: 'oz',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
      }),
      ingredientIndex: undefined,
    });
  });

  it('does not pop when saving an external food fails and relies on the save-food toast', async () => {
    mockSaveFoodAsync.mockImplementation(async () => {
      mockToast.show({
        type: 'error',
        text1: 'Failed to save food',
        text2: 'Please try again.',
      });
      throw new Error('save failed');
    });

    const screen = renderScreen({
      item: baseExternalItem,
      pickerMode: 'meal-builder',
      returnDepth: 1,
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Failed to save food',
      text2: 'Please try again.',
    });
    expect(mockToast.show).not.toHaveBeenCalledWith({
      type: 'error',
      text1: 'Failed to add food',
      text2: 'Please try again.',
    });
    expect(mockSetPendingMealIngredientSelection).not.toHaveBeenCalled();
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  it('shows a fallback toast when draft building fails after an external save succeeds', async () => {
    mockSaveFoodAsync.mockResolvedValue({
      id: 'saved-food-1',
      name: 'Protein Bar',
      brand: 'Remote Brand',
      is_custom: false,
      default_variant: {
        id: 'saved-variant-1',
        serving_size: 1,
        serving_unit: 'bar',
        calories: 200,
        protein: 20,
        carbs: 22,
        fat: 7,
      },
    });
    mockBuildMealIngredientDraft.mockImplementationOnce(() => {
      throw new Error('bad draft');
    });

    const screen = renderScreen({
      item: baseExternalItem,
      pickerMode: 'meal-builder',
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Failed to add food',
      text2: 'Please try again.',
    });
    expect(mockSetPendingMealIngredientSelection).not.toHaveBeenCalled();
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  it('shows an error when a meal is selected in meal-builder mode', () => {
    const screen = renderScreen({
      item: baseMealItem,
      pickerMode: 'meal-builder',
    });

    fireEvent.press(screen.getByText('Add Meal'));

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Meals not supported here',
      text2: 'Select a food instead of another meal.',
    });
  });

  it('returns a local food assignment to the meal-plan editor', async () => {
    const screen = renderScreen({
      item: baseLocalItem,
      pickerMode: 'meal-plan',
      returnDepth: 2,
      mealPlanTarget: {
        dayOfWeek: 2,
        mealTypeId: 'lunch',
        mealTypeName: 'Lunch',
        assignmentIndex: 0,
      },
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockSetPendingMealPlanSelection).toHaveBeenCalledWith({
        assignmentIndex: 0,
        assignment: expect.objectContaining({
          item_type: 'food',
          day_of_week: 2,
          meal_type_id: 'lunch',
          meal_type: 'Lunch',
          food_id: 'food-1',
          variant_id: 'variant-1',
          quantity: 1,
          unit: 'cup',
          nutrition: {
            servingSize: 1,
            calories: 100,
            protein: 15,
            carbs: 6,
            fat: 0,
          },
        }),
      });
    });
    expect(navigation.dispatch).toHaveBeenCalledWith({
      type: 'POP',
      payload: { count: 2 },
    });
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('returns a reusable meal assignment to the meal-plan editor', () => {
    const screen = renderScreen({
      item: baseMealItem,
      pickerMode: 'meal-plan',
      returnDepth: 2,
      mealPlanTarget: {
        dayOfWeek: 4,
        mealTypeId: 'dinner',
        mealTypeName: 'Dinner',
        assignmentIndex: 1,
      },
    });

    fireEvent.press(screen.getByText('Add Meal'));

    expect(mockSetPendingMealPlanSelection).toHaveBeenCalledWith({
      assignmentIndex: 1,
      assignment: expect.objectContaining({
        item_type: 'meal',
        day_of_week: 4,
        meal_type_id: 'dinner',
        meal_type: 'Dinner',
        meal_id: 'meal-1',
        meal_name: 'Breakfast Meal',
        quantity: 1,
        unit: 'serving',
        nutrition: {
          servingSize: 1,
          calories: 450,
          protein: 25,
          carbs: 40,
          fat: 18,
        },
      }),
    });
    expect(mockToast.show).not.toHaveBeenCalledWith(
      expect.objectContaining({ text1: 'Meals not supported here' })
    );
  });

  it('hands a food and its amount back to the NFC tag form', async () => {
    consumePendingActionTagSelection();
    const screen = renderScreen({
      item: baseLocalItem,
      pickerMode: 'action-tag',
      returnDepth: 2,
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() =>
      expect(navigation.dispatch).toHaveBeenCalledWith({
        type: 'POP',
        payload: { count: 2 },
      })
    );
    expect(consumePendingActionTagSelection()).toEqual({
      kind: 'food',
      foodId: 'food-1',
      variantId: 'variant-1',
      name: 'Greek Yogurt',
      quantity: 1,
      unit: 'cup',
    });
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('hands a gram-based meal back to the NFC tag form in its own unit', () => {
    consumePendingActionTagSelection();
    const screen = renderScreen({
      item: { ...baseMealItem, servingSize: 200, servingUnit: 'g' },
      pickerMode: 'action-tag',
      returnDepth: 2,
    });

    fireEvent.press(screen.getByText('Add Meal'));

    expect(consumePendingActionTagSelection()).toEqual(
      expect.objectContaining({
        kind: 'meal',
        mealId: 'meal-1',
        name: 'Breakfast Meal',
        unit: 'g',
      })
    );
    expect(mockAddMeal).not.toHaveBeenCalled();
    expect(mockToast.show).not.toHaveBeenCalledWith(
      expect.objectContaining({ text1: 'Meals not supported here' })
    );
  });

  it('hides diary-only controls in meal-builder mode', () => {
    const screen = renderScreen({
      item: baseLocalItem,
      pickerMode: 'meal-builder',
    });

    expect(screen.queryByText('Date')).toBeNull();
    expect(screen.queryByText('Meal')).toBeNull();
  });

  it('hides diary-only controls in meal-plan mode', () => {
    const screen = renderScreen({
      item: baseLocalItem,
      pickerMode: 'meal-plan',
      mealPlanTarget: {
        dayOfWeek: 1,
        mealTypeId: 'meal-1',
        mealTypeName: 'Breakfast',
      },
    });

    expect(screen.queryByText('Date')).toBeNull();
    expect(screen.queryByText('Meal')).toBeNull();
  });

  it('preserves the saved quantity when editing a meal ingredient draft', () => {
    const screen = renderScreen({
      item: {
        ...baseLocalItem,
        originalItem: {
          food_id: 'food-1',
          variant_id: 'variant-1',
          quantity: 2.5,
        },
      },
      pickerMode: 'meal-builder',
    });

    expect(screen.getByDisplayValue('2.5')).toBeTruthy();
  });

  it('pre-selects a mealTypeId passed through navigation and sends it in the payload', () => {
    // Two visible meal types; the route pins the custom one.
    mockUseMealTypes.mockReturnValue({
      mealTypes: [
        { id: 'meal-1', name: 'breakfast', is_visible: true, sort_order: 1 },
        {
          id: 'custom-pw',
          name: 'Pre-Workout',
          is_visible: true,
          sort_order: 0,
        },
      ] as any,
      defaultMealTypeId: 'meal-1',
      isLoading: false,
      isError: false,
    });

    const screen = renderScreen({
      item: baseMealItem,
      date: '2026-05-15',
      mealTypeId: 'custom-pw',
    });

    fireEvent.press(screen.getByText('Add Meal'));

    expect(mockAddMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_type_id: 'custom-pw',
        meal_type: 'Pre-Workout',
      })
    );
  });

  it('keeps a custom category named Lunch distinct from the system lunch', () => {
    // A CUSTOM category named "Lunch" (user-owned) stays its own option with
    // its own canonical id; the system "lunch" keeps its id. Both render the
    // same English label, so the distinction is asserted via the payload id.
    mockUseMealTypes.mockReturnValue({
      mealTypes: [
        {
          id: 'sys-l',
          name: 'lunch',
          user_id: null,
          is_visible: true,
          sort_order: 1,
        },
        {
          id: 'custom-l',
          name: 'Lunch',
          user_id: 'user1',
          is_visible: true,
          sort_order: 0,
        },
      ] as any,
      defaultMealTypeId: 'sys-l',
      isLoading: false,
      isError: false,
    });

    const screen = renderScreen({
      item: baseMealItem,
      date: '2026-05-15',
      mealTypeId: 'custom-l',
    });

    fireEvent.press(screen.getByText('Add Meal'));

    expect(mockAddMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_type_id: 'custom-l',
        meal_type: 'Lunch',
      })
    );
  });

  it('dispatches addMeal when logging a meal item (not addEntry)', () => {
    mockUseFoodVariants.mockReturnValueOnce({
      variants: [],
      isLoading: false,
      isError: false,
    } as any);

    const screen = renderScreen({
      item: baseMealItem,
      date: '2026-05-15',
    });

    fireEvent.press(screen.getByText('Add Meal'));

    expect(mockAddMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_template_id: 'meal-1',
        meal_type: 'breakfast',
        meal_type_id: 'meal-1',
        entry_date: '2026-05-15',
        name: 'Breakfast Meal',
        quantity: 1,
        unit: 'serving',
      })
    );
    expect(mockAddMeal.mock.calls[0][0]).not.toHaveProperty('foods');
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('logs a meal with customizedFoods passed through navigation params', () => {
    mockUseFoodVariants.mockReturnValueOnce({
      variants: [],
      isLoading: false,
      isError: false,
    } as any);

    const customizedFoods: MealFood[] = [
      {
        id: 'mf-1',
        meal_id: 'meal-1',
        food_id: 'food-1',
        name: 'Oats',
        food_name: 'Oats',
        brand: null,
        quantity: 50,
        unit: 'g',
        serving_size: 100,
        serving_unit: 'g',
        calories: 389,
        protein: 16.9,
        carbs: 66.3,
        fat: 6.9,
      },
    ];

    const screen = renderScreen({
      item: {
        ...baseMealItem,
        originalItem: {
          id: 'meal-1',
          name: 'Breakfast Meal',
          foods: customizedFoods,
        },
      },
      customizedFoods,
      date: '2026-05-15',
    });

    fireEvent.press(screen.getByText('Add Meal'));

    expect(mockAddMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_template_id: 'meal-1',
        foods: [
          expect.objectContaining({
            food_id: 'food-1',
            quantity: 50,
            unit: 'g',
          }),
        ],
      })
    );
  });

  it('resets edits from the meal screen back to the saved ingredients', () => {
    const oats: MealFood = {
      id: 'mf-1',
      meal_id: 'meal-1',
      food_id: 'food-1',
      name: 'Oats',
      food_name: 'Oats',
      brand: null,
      quantity: 100,
      unit: 'g',
      serving_size: 100,
      serving_unit: 'g',
      calories: 389,
      protein: 16.9,
      carbs: 66.3,
      fat: 6.9,
    };

    const screen = renderScreen({
      item: {
        ...baseMealItem,
        originalItem: {
          id: 'meal-1',
          name: 'Breakfast Meal',
          foods: [oats],
        },
      },
      customizedFoods: [{ ...oats, quantity: 50 }],
      date: '2026-05-15',
    });

    expect(screen.getByText('50 g')).toBeTruthy();
    fireEvent.press(screen.getByText('Reset'));
    expect(screen.queryByText('Reset')).toBeNull();
    // The list shows the saved amount again, matching what will be logged.
    expect(screen.queryByText('50 g')).toBeNull();
    expect(screen.getByText('100 g')).toBeTruthy();

    fireEvent.press(screen.getByText('Add Meal'));

    // The saved meal is logged as it is, so no ingredient list is sent.
    expect(mockAddMeal.mock.calls[0][0].foods).toBeUndefined();
  });

  it('allows adjusting ingredient quantity via modal before logging', () => {
    mockUseFoodVariants.mockReturnValueOnce({
      variants: [],
      isLoading: false,
      isError: false,
    } as any);

    const initialFoods: MealFood[] = [
      {
        id: 'mf-1',
        meal_id: 'meal-1',
        food_id: 'food-1',
        name: 'Rolled Oats',
        food_name: 'Rolled Oats',
        brand: null,
        quantity: 100,
        unit: 'g',
        serving_size: 100,
        serving_unit: 'g',
        calories: 389,
        protein: 16.9,
        carbs: 66.3,
        fat: 6.9,
      },
    ];

    const screen = renderScreen({
      item: {
        ...baseMealItem,
        originalItem: {
          id: 'meal-1',
          name: 'Breakfast Meal',
          foods: initialFoods,
        },
      },
      date: '2026-05-15',
    });

    fireEvent.press(screen.getByText('Rolled Oats'));

    const stepperInput = screen.getByDisplayValue('100');
    fireEvent.changeText(stepperInput, '150');

    fireEvent.press(screen.getByText('Apply'));

    fireEvent.press(screen.getByText('Add Meal'));

    expect(mockAddMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_template_id: 'meal-1',
        foods: [
          expect.objectContaining({
            food_id: 'food-1',
            quantity: 150,
            unit: 'g',
          }),
        ],
      })
    );
  });

  it('allows switching an ingredient to a saved portion before logging', () => {
    // food-1's saved variants (beforeEach) include "1 cup" (variant-1). Only
    // saved portions are offered: logging re-reads nutrition by variant id.

    const initialFoods: MealFood[] = [
      {
        id: 'mf-1',
        meal_id: 'meal-1',
        food_id: 'food-1',
        name: 'Rolled Oats',
        food_name: 'Rolled Oats',
        brand: null,
        quantity: 100,
        unit: 'g',
        serving_size: 100,
        serving_unit: 'g',
        calories: 389,
        protein: 16.9,
        carbs: 66.3,
        fat: 6.9,
      },
    ];

    const screen = renderScreen({
      item: {
        ...baseMealItem,
        originalItem: {
          id: 'meal-1',
          name: 'Breakfast Meal',
          foods: initialFoods,
        },
      },
      date: '2026-05-15',
    });

    fireEvent.press(screen.getByText('Rolled Oats'));

    fireEvent.press(screen.getByLabelText('Change unit'));

    expect(screen.queryByText('oz')).toBeNull();
    fireEvent.press(screen.getByText('1 cup'));

    fireEvent.press(screen.getByText('Apply'));

    fireEvent.press(screen.getByText('Add Meal'));

    expect(mockAddMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_template_id: 'meal-1',
        foods: [
          expect.objectContaining({
            food_id: 'food-1',
            variant_id: 'variant-1',
            quantity: 1,
            unit: 'cup',
            serving_unit: 'cup',
          }),
        ],
      })
    );
  });

  it('allows removing an ingredient from a meal before logging', () => {
    mockUseFoodVariants.mockReturnValueOnce({
      variants: [],
      isLoading: false,
      isError: false,
    } as any);

    const initialFoods: MealFood[] = [
      {
        id: 'mf-1',
        meal_id: 'meal-1',
        food_id: 'food-1',
        name: 'Rolled Oats',
        food_name: 'Rolled Oats',
        brand: null,
        quantity: 100,
        unit: 'g',
        serving_size: 100,
        serving_unit: 'g',
        calories: 389,
        protein: 16.9,
        carbs: 66.3,
        fat: 6.9,
      },
      {
        id: 'mf-2',
        meal_id: 'meal-1',
        food_id: 'food-2',
        name: 'Whole Milk',
        food_name: 'Whole Milk',
        brand: null,
        quantity: 200,
        unit: 'ml',
        serving_size: 200,
        serving_unit: 'ml',
        calories: 122,
        protein: 6.8,
        carbs: 9.6,
        fat: 6.6,
      },
    ];

    const screen = renderScreen({
      item: {
        ...baseMealItem,
        originalItem: {
          id: 'meal-1',
          name: 'Breakfast Meal',
          foods: initialFoods,
        },
      },
      date: '2026-05-15',
    });

    fireEvent.press(screen.getByText('Whole Milk'));

    fireEvent.press(screen.getByText('Remove from Meal'));

    fireEvent.press(screen.getByText('Add Meal'));

    expect(mockAddMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_template_id: 'meal-1',
        foods: [
          expect.objectContaining({
            food_id: 'food-1',
            quantity: 100,
          }),
        ],
      })
    );
    expect(mockAddMeal.mock.calls[0][0].foods).toHaveLength(1);
  });

  it('does not offer removing the only ingredient of a meal', () => {
    const screen = renderScreen({
      item: {
        ...baseMealItem,
        originalItem: {
          id: 'meal-1',
          name: 'Breakfast Meal',
          foods: [
            {
              id: 'mf-1',
              meal_id: 'meal-1',
              food_id: 'food-1',
              name: 'Rolled Oats',
              food_name: 'Rolled Oats',
              brand: null,
              quantity: 100,
              unit: 'g',
              serving_size: 100,
              serving_unit: 'g',
              calories: 389,
              protein: 16.9,
              carbs: 66.3,
              fat: 6.9,
            },
          ],
        },
      },
      date: '2026-05-15',
    });

    fireEvent.press(screen.getByText('Rolled Oats'));

    expect(screen.getByText('Apply')).toBeTruthy();
    expect(screen.queryByText('Remove from Meal')).toBeNull();
  });

  it('sends the entry note when logging a meal item', () => {
    // Meals build their payload through buildFoodEntryMealPayload, which used
    // to have no notes field — so the note field was editable but discarded.
    mockUseFoodVariants.mockReturnValueOnce({
      variants: [],
      isLoading: false,
      isError: false,
    } as any);

    const screen = renderScreen({
      item: baseMealItem,
      date: '2026-05-15',
    });

    fireEvent.changeText(
      screen.getByLabelText('Note for this entry'),
      'half portion'
    );
    fireEvent.press(screen.getByText('Add Meal'));

    expect(mockAddMeal).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'half portion' })
    );
  });

  it('preserves numeric-string meal quantities and serving units when reopening an ingredient draft', () => {
    const screen = renderScreen({
      item: {
        ...baseLocalItem,
        originalItem: {
          food_id: 'food-1',
          variant_id: 'variant-1',
          quantity: '2.5',
          unit: '',
          serving_unit: 'oz',
          calories: '120',
          protein: '10',
          carbs: '8',
          fat: '4',
        },
      },
      pickerMode: 'meal-builder',
    });

    expect(screen.getByDisplayValue('2.5')).toBeTruthy();
  });

  it('keeps the normal log-entry path and diary controls outside meal-builder mode', () => {
    const screen = renderScreen({
      item: baseLocalItem,
      date: '2026-04-23',
    });

    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Meal')).toBeTruthy();
    expect(screen.getByText(/· 1 cup per serving/)).toBeTruthy();

    fireEvent.press(screen.getByText('Add Food'));

    expect(mockAddEntry).toHaveBeenCalledWith({
      saveFoodPayload: undefined,
      createEntryPayload: {
        meal_type_id: 'meal-1',
        quantity: 1,
        unit: 'cup',
        entry_date: '2026-04-23',
        entry_time: null,
        notes: null,
        food_id: 'food-1',
        variant_id: 'variant-1',
      },
    });
    expect(mockSetPendingMealIngredientSelection).not.toHaveBeenCalled();
  });

  it('returns to the diary root after a plain log-entry add', () => {
    // Regression: the log-entry success handler must fall through to
    // popToTop when no returnDepth param is set — reading the defaulted
    // `returnDepth` local (?? 1) instead turned every plain add into a
    // one-screen pop.
    const screen = renderScreen({
      item: baseLocalItem,
      date: '2026-04-23',
    });

    fireEvent.press(screen.getByText('Add Food'));

    expect(mockPopToTop).toHaveBeenCalledTimes(1);
    expect(mockPop).not.toHaveBeenCalled();
    expect(navigation.dispatch).toHaveBeenCalledWith({ type: 'POP_TO_TOP' });
  });

  it('pops back one screen after an add launched with a basket returnDepth', () => {
    const screen = renderScreen({
      item: baseLocalItem,
      date: '2026-04-23',
      returnDepth: 1,
    });

    fireEvent.press(screen.getByText('Add Food'));

    expect(mockPop).toHaveBeenCalledWith(1);
    expect(mockPopToTop).not.toHaveBeenCalled();
  });

  it('returns to the diary root after a plain meal add', () => {
    const screen = renderScreen({
      item: baseMealItem,
      date: '2026-04-23',
    });

    fireEvent.press(screen.getByText('Add Meal'));

    expect(mockInvalidateMealCache).toHaveBeenCalled();
    expect(mockPopToTop).toHaveBeenCalledTimes(1);
    expect(mockPop).not.toHaveBeenCalled();
  });

  it('pops back one screen after a meal add launched with a basket returnDepth', () => {
    const screen = renderScreen({
      item: baseMealItem,
      date: '2026-04-23',
      returnDepth: 1,
    });

    fireEvent.press(screen.getByText('Add Meal'));

    expect(mockPop).toHaveBeenCalledWith(1);
    expect(mockPopToTop).not.toHaveBeenCalled();
  });

  it('shows grams for a grouped local portion instead of only the named unit', () => {
    mockUseFoodVariants.mockReturnValueOnce({
      variants: [
        {
          id: 'variant-piece',
          food_id: 'food-1',
          serving_size: 1,
          serving_unit: 'piece',
          calories: 100,
          protein: 15,
          carbs: 6,
          fat: 0,
        },
        {
          id: 'variant-grams',
          food_id: 'food-1',
          serving_size: 15,
          serving_unit: 'g',
          calories: 100,
          protein: 15,
          carbs: 6,
          fat: 0,
        },
      ],
      isLoading: false,
      isError: false,
    } as any);

    const screen = renderScreen({
      item: {
        ...baseLocalItem,
        servingUnit: 'piece',
        variantId: 'variant-piece',
      },
      date: '2026-04-23',
    });

    expect(screen.getByText('piece (15 g)')).toBeTruthy();
    expect(screen.getByText(/piece \(15 g\) per serving/)).toBeTruthy();
  });

  it('keeps a 100 g reference available alongside a named local portion', () => {
    mockUseFoodVariants.mockReturnValue({
      variants: [
        {
          id: 'variant-portion',
          food_id: 'food-1',
          serving_size: 1,
          serving_unit: 'portion',
          serving_description: 'portion (150 g)',
          calories: 180,
          protein: 15,
          carbs: 6,
          fat: 0,
        },
        {
          id: 'variant-reference',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          serving_description: '100 g',
          calories: 120,
          protein: 10,
          carbs: 4,
          fat: 0,
        },
        {
          id: 'variant-portion-grams',
          food_id: 'food-1',
          serving_size: 150,
          serving_unit: 'g',
          serving_description: '150 g',
          calories: 180,
          protein: 15,
          carbs: 6,
          fat: 0,
        },
      ],
      isLoading: false,
      isError: false,
    } as any);

    const screen = renderScreen({
      item: {
        ...baseLocalItem,
        servingSize: 100,
        servingUnit: 'g',
        servingDescription: '100 g',
        calories: 120,
        protein: 10,
        carbs: 4,
        fat: 0,
        variantId: 'variant-reference',
      },
      date: '2026-04-23',
    });

    expect(screen.getByLabelText('Select Serving')).toBeTruthy();
    expect(screen.getByText('1 portion (150 g) (180 cal)')).toBeTruthy();
    expect(screen.getByText('100 g (120 cal)')).toBeTruthy();
  });

  it('keeps converted local units in the adjust flow and logs the returned variant', async () => {
    const screen = renderScreen({
      item: baseLocalItem,
      date: '2026-04-23',
      adjustedValues: {
        name: 'Greek Yogurt',
        brand: 'Sparky',
        servingSize: '1',
        servingUnit: 'oz',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
        fiber: '',
        saturatedFat: '',
        sodium: '',
        sugars: '',
        transFat: '',
        potassium: '',
        calcium: '',
        iron: '',
        cholesterol: '',
        vitaminA: '',
        vitaminC: '',
      },
      adjustedUnitSelection: {
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
      },
    });

    await waitFor(() => {
      expect(navigation.setParams).toHaveBeenCalledWith({
        adjustedValues: undefined,
        adjustedUnitSelection: undefined,
      });
    });

    fireEvent.press(screen.getByText('Add Food'));

    expect(mockAddEntry).toHaveBeenCalledWith({
      saveFoodPayload: undefined,
      createEntryPayload: expect.objectContaining({
        meal_type_id: 'meal-1',
        quantity: 1,
        unit: 'oz',
        entry_date: '2026-04-23',
        food_id: 'food-1',
        variant_id: 'variant-oz',
        serving_size: 1,
        serving_unit: 'oz',
        calories: 120,
      }),
    });
    expect(screen.queryByText('Create Draft Unit')).toBeNull();
  });

  it('switches a saved external draft unit into the local logging flow', async () => {
    mockSaveFoodAsync.mockResolvedValue({
      id: 'saved-food-1',
      name: 'Protein Bar',
      brand: 'Remote Brand',
      is_custom: false,
      default_variant: {
        id: 'saved-variant-1',
        serving_size: 1,
        serving_unit: 'bar',
        calories: 200,
        protein: 20,
        carbs: 22,
        fat: 7,
      },
    });
    mockCreateVariant.mockResolvedValue({
      id: 'saved-variant-oz',
      food_id: 'saved-food-1',
      serving_size: 1,
      serving_unit: 'oz',
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
    });

    const screen = renderScreen({
      item: baseExternalItem,
      date: '2026-04-23',
      adjustedValues: {
        name: 'Protein Bar',
        brand: 'Remote Brand',
        servingSize: '1',
        servingUnit: 'oz',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
        fiber: '',
        saturatedFat: '',
        sodium: '',
        sugars: '',
        transFat: '',
        potassium: '',
        calcium: '',
        iron: '',
        cholesterol: '',
        vitaminA: '',
        vitaminC: '',
      },
      adjustedUnitSelection: {
        kind: 'draft',
        variant: {
          serving_size: 1,
          serving_unit: 'oz',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        },
      },
    });

    await waitFor(() => {
      expect(navigation.setParams).toHaveBeenCalledWith({
        adjustedValues: undefined,
        adjustedUnitSelection: undefined,
      });
    });

    expect(screen.getByText(/1 oz per serving/)).toBeTruthy();

    pressActionByAccessibilityLabel(screen, navigation, 'Save Food');

    await waitFor(() => {
      expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mockCreateVariant).toHaveBeenCalledWith({
        food_id: 'saved-food-1',
        serving_size: 1,
        serving_unit: 'oz',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
        dietary_fiber: undefined,
        saturated_fat: undefined,
        polyunsaturated_fat: undefined,
        monounsaturated_fat: undefined,
        sodium: undefined,
        sugars: undefined,
        trans_fat: undefined,
        potassium: undefined,
        calcium: undefined,
        iron: undefined,
        cholesterol: undefined,
        vitamin_a: undefined,
        vitamin_c: undefined,
        caffeine_mg: 0,
        water_ml: 0,
        alcohol_g: 0,
        glycemic_index: undefined,
        custom_nutrients: undefined,
        source: undefined,
        ai_confidence: undefined,
      });
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockAddEntry).toHaveBeenCalledWith({
        saveFoodPayload: undefined,
        createEntryPayload: {
          meal_type_id: 'meal-1',
          quantity: 1,
          unit: 'oz',
          entry_date: '2026-04-23',
          entry_time: null,
          notes: null,
          food_id: 'saved-food-1',
          variant_id: 'saved-variant-oz',
        },
      });
    });
    expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
    expect(mockAddEntryAsync).not.toHaveBeenCalled();
  });

  it('chains save and create-variant when an external converted unit is selected', async () => {
    const screen = renderScreen({
      item: baseExternalItem,
      date: '2026-04-23',
      adjustedValues: {
        name: 'Protein Bar',
        brand: 'Remote Brand',
        servingSize: '1',
        servingUnit: 'oz',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
        fiber: '',
        saturatedFat: '',
        sodium: '',
        sugars: '',
        transFat: '',
        potassium: '',
        calcium: '',
        iron: '',
        cholesterol: '',
        vitaminA: '',
        vitaminC: '',
      },
      adjustedUnitSelection: {
        kind: 'draft',
        variant: {
          serving_size: 1,
          serving_unit: 'oz',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        },
      },
    });

    await waitFor(() => {
      expect(navigation.setParams).toHaveBeenCalledWith({
        adjustedValues: undefined,
        adjustedUnitSelection: undefined,
      });
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockAddEntryAsync).toHaveBeenCalledWith({
        saveFoodPayload: expect.objectContaining({
          name: 'Protein Bar',
          brand: 'Remote Brand',
          serving_size: 1,
          serving_unit: 'bar',
          calories: 200,
          protein: 20,
          carbs: 22,
          fat: 7,
        }),
        saveThenCreateVariantPayload: expect.objectContaining({
          serving_size: 1,
          serving_unit: 'oz',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        }),
        createEntryPayload: {
          meal_type_id: 'meal-1',
          quantity: 1,
          unit: 'oz',
          entry_date: '2026-04-23',
          entry_time: null,
          notes: null,
        },
      });
    });
  });

  describe('draft adjustedUnitSelection handling', () => {
    // Use a stable variants array so the useFoodVariants mock doesn't create a
    // new array reference on every render (which would cause the adjustedUnitSelection
    // useEffect to loop via the localUnitVariants dependency).
    const stableVariants = [
      {
        id: 'variant-1',
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'cup',
        calories: 100,
        protein: 15,
        carbs: 6,
        fat: 0,
      },
    ];

    beforeEach(() => {
      mockUseFoodVariants.mockImplementation((foodId, options) => ({
        variants:
          foodId === 'food-1' && options?.enabled !== false
            ? (stableVariants as any)
            : undefined,
        isLoading: false,
        isError: false,
      }));
    });

    const draftAdjustedValues = {
      name: 'Greek Yogurt',
      brand: 'Sparky',
      servingSize: '30',
      servingUnit: 'mg',
      calories: '50',
      protein: '5',
      carbs: '3',
      fat: '2',
      fiber: '',
      saturatedFat: '',
      transFat: '',
      sodium: '',
      sugars: '',
      potassium: '',
      cholesterol: '',
      calcium: '',
      iron: '',
      vitaminA: '',
      vitaminC: '',
    };

    // A local food switched to oz, an unsaved unit, picked for an NFC tag.
    const pickConvertedUnitForTag = async (
      extraParams: Record<string, unknown> = {}
    ) => {
      consumePendingActionTagSelection();
      mockCreateVariant.mockResolvedValue({
        id: 'variant-oz-new',
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'oz',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
      });
      const screen = renderScreen({
        item: baseLocalItem,
        pickerMode: 'action-tag',
        returnDepth: 2,
        adjustedValues: {
          name: 'Greek Yogurt',
          brand: 'Sparky',
          servingSize: '1',
          servingUnit: 'oz',
          calories: '120',
          protein: '10',
          carbs: '8',
          fat: '4',
          fiber: '',
          saturatedFat: '',
          sodium: '',
          sugars: '',
          transFat: '',
          potassium: '',
          calcium: '',
          iron: '',
          cholesterol: '',
          vitaminA: '',
          vitaminC: '',
        },
        adjustedUnitSelection: {
          kind: 'draft',
          variant: {
            serving_size: 1,
            serving_unit: 'oz',
            calories: 120,
            protein: 10,
            carbs: 8,
            fat: 4,
          },
        },
        ...extraParams,
      });

      await waitFor(() => {
        expect(navigation.setParams).toHaveBeenCalledWith(
          expect.objectContaining({
            adjustedValues: undefined,
            adjustedUnitSelection: undefined,
          })
        );
      });

      fireEvent.press(screen.getByText('Add Food'));
      await waitFor(() => expect(mockCreateVariant).toHaveBeenCalledTimes(1));
    };

    it('saves a converted unit as a serving before handing a local food to the NFC tag form', async () => {
      await pickConvertedUnitForTag();

      await waitFor(() =>
        expect(navigation.dispatch).toHaveBeenCalledWith({
          type: 'POP',
          payload: { count: 2 },
        })
      );
      expect(mockCreateVariant).toHaveBeenCalledWith(
        expect.objectContaining({
          food_id: 'food-1',
          serving_size: 1,
          serving_unit: 'oz',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        })
      );
      expect(consumePendingActionTagSelection()).toEqual(
        expect.objectContaining({
          kind: 'food',
          foodId: 'food-1',
          variantId: 'variant-oz-new',
          unit: 'oz',
        })
      );
      expect(mockAddEntry).not.toHaveBeenCalled();
    });

    it('drops the NFC tag pick when the screen was left while the serving saved', async () => {
      navigation.isFocused.mockReturnValueOnce(false);

      await pickConvertedUnitForTag();

      await waitFor(() => expect(navigation.isFocused).toHaveBeenCalled());
      expect(navigation.dispatch).not.toHaveBeenCalled();
      expect(consumePendingActionTagSelection()).toBeNull();
    });

    // The saved cup serving with its nutrition adjusted to `calories`.
    const pickAdjustedServingForTag = async (
      calories: string,
      extraParams: Record<string, unknown> = {}
    ) => {
      consumePendingActionTagSelection();
      const screen = renderScreen({
        item: baseLocalItem,
        pickerMode: 'action-tag',
        returnDepth: 2,
        adjustedValues: {
          ...draftAdjustedValues,
          servingSize: '1',
          servingUnit: 'cup',
          calories,
          protein: '15',
          carbs: '6',
          fat: '0',
          caffeineMg: '',
          waterMl: '',
          alcoholG: '',
        },
        ...extraParams,
      });

      await waitFor(() => {
        expect(navigation.setParams).toHaveBeenCalledWith(
          expect.objectContaining({ adjustedValues: undefined })
        );
      });

      fireEvent.press(screen.getByText('Add Food'));
    };

    it('refuses an NFC tag pick whose saved serving had its nutrition changed here', async () => {
      await pickAdjustedServingForTag('150');

      await waitFor(() =>
        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            text1: "Choose one of this food's servings",
          })
        )
      );
      expect(navigation.dispatch).not.toHaveBeenCalled();
      expect(mockCreateVariant).not.toHaveBeenCalled();
      expect(consumePendingActionTagSelection()).toBeNull();
    });

    it('refuses an NFC tag pick whose saved serving had only a custom nutrient changed here', async () => {
      await pickAdjustedServingForTag('100', {
        adjustedCustomNutrients: { omega3: 2 },
      });

      await waitFor(() =>
        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            text1: "Choose one of this food's servings",
          })
        )
      );
      expect(navigation.dispatch).not.toHaveBeenCalled();
      expect(consumePendingActionTagSelection()).toBeNull();
    });

    it('saves adjusted custom nutrients on the serving made for an NFC tag', async () => {
      await pickConvertedUnitForTag({ adjustedCustomNutrients: { omega3: 2 } });

      expect(mockCreateVariant).toHaveBeenCalledWith(
        expect.objectContaining({
          serving_unit: 'oz',
          custom_nutrients: { omega3: 2 },
        })
      );
    });

    it('hands the saved serving to the NFC tag form when adjusted nutrition was saved to it', async () => {
      await pickAdjustedServingForTag('100');

      await waitFor(() =>
        expect(navigation.dispatch).toHaveBeenCalledWith({
          type: 'POP',
          payload: { count: 2 },
        })
      );
      expect(consumePendingActionTagSelection()).toEqual(
        expect.objectContaining({
          kind: 'food',
          variantId: 'variant-1',
          unit: 'cup',
        })
      );
    });

    it('preserves real selectedVariantId for local foods when draft is returned', async () => {
      // Regression: draft branch was calling setSelectedVariantId(draftId) for
      // local foods, poisoning save payloads with a non-persisted variant ID.
      const screen = renderScreen({
        item: baseLocalItem,
        date: '2026-04-23',
        adjustedValues: draftAdjustedValues,
        adjustedUnitSelection: {
          kind: 'draft',
          variant: {
            id: 'FORM_DRAFT_UNIT_ID',
            serving_size: 30,
            serving_unit: 'mg',
            calories: 50,
            protein: 5,
            carbs: 3,
            fat: 2,
          },
        },
      });

      await waitFor(() => {
        expect(navigation.setParams).toHaveBeenCalledWith({
          adjustedValues: undefined,
          adjustedUnitSelection: undefined,
        });
      });

      fireEvent.press(screen.getByText('Add Food'));

      await waitFor(() => {
        expect(mockAddEntry).toHaveBeenCalledWith(
          expect.objectContaining({
            createEntryPayload: expect.objectContaining({
              variant_id: 'variant-1', // real persisted ID, not 'FORM_DRAFT_UNIT_ID'
            }),
          })
        );
      });
    });

    it('updates selectedVariantId for external foods when draft is returned', async () => {
      // External foods don't have persisted variant IDs, so draft ID update is correct.
      const screen = renderScreen({
        item: baseExternalItem,
        date: '2026-04-23',
        adjustedValues: {
          ...draftAdjustedValues,
          name: 'Protein Bar',
          brand: 'Remote Brand',
        },
        adjustedUnitSelection: {
          kind: 'draft',
          variant: {
            id: 'EXTERNAL_DRAFT_VARIANT_ID',
            serving_size: 30,
            serving_unit: 'mg',
            calories: 50,
            protein: 5,
            carbs: 3,
            fat: 2,
          },
        },
      });

      await waitFor(() => {
        expect(navigation.setParams).toHaveBeenCalledWith({
          adjustedValues: undefined,
          adjustedUnitSelection: undefined,
        });
      });

      // For external foods the screen should render without crash
      expect(screen.getByText('Add Food')).toBeTruthy();
    });

    it('passes displayValues-based selectedUnitSelection when re-opening AdjustNutrition after draft return', async () => {
      // After receiving a draft unit back, re-opening AdjustNutrition should pass
      // selectedUnitSelection whose variant nutrition matches the current displayValues
      // (the adjusted values), not the original DB variant's nutrition.
      const screen = renderScreen({
        item: baseLocalItem,
        date: '2026-04-23',
        adjustedValues: draftAdjustedValues,
        adjustedUnitSelection: {
          kind: 'draft',
          variant: {
            id: undefined,
            serving_size: 30,
            serving_unit: 'mg',
            calories: 50,
            protein: 5,
            carbs: 3,
            fat: 2,
          },
        },
      });

      await waitFor(() => {
        expect(navigation.setParams).toHaveBeenCalledWith({
          adjustedValues: undefined,
          adjustedUnitSelection: undefined,
        });
      });

      // Find and press the nutrition edit (pencil) button
      pressActionByAccessibilityLabel(screen, navigation, 'Adjust nutrition');
      expect(navigation.navigate).toHaveBeenCalledWith(
        'FoodForm',
        expect.objectContaining({
          selectedUnitSelection: expect.objectContaining({
            variant: expect.objectContaining({
              serving_unit: 'mg',
              calories: 50,
            }),
          }),
        })
      );
    });
  });

  describe('favorite star', () => {
    // The toggle updates the favorites cache optimistically, so `isFavorite`
    // flips the instant the first tap lands. A second tap before the first
    // settles therefore sends the OPPOSITE operation, and the two writes can
    // reach the server out of order — leaving it in the state opposite the
    // user's last tap. Gating the star on its own in-flight mutation closes it.
    it('disables the favorite star while a toggle is already in flight', () => {
      mockUseToggleFavorite.mockReturnValue({
        toggleFavorite: jest.fn(),
        isPending: true,
      });

      renderScreen({ item: baseLocalItem, mealType: 'breakfast' });

      const star = findHeaderItemByAccessibilityLabel(
        navigation,
        'Add to favorites'
      );
      expect(star).toBeDefined();
      expect(star?.disabled).toBe(true);
    });

    it('leaves the favorite star enabled when no toggle is in flight', () => {
      mockUseToggleFavorite.mockReturnValue({
        toggleFavorite: jest.fn(),
        isPending: false,
      });

      renderScreen({ item: baseLocalItem, mealType: 'breakfast' });

      const star = findHeaderItemByAccessibilityLabel(
        navigation,
        'Add to favorites'
      );
      expect(star?.disabled).toBe(false);
    });

    it('does not disable unrelated header actions while a toggle is in flight', () => {
      mockUseToggleFavorite.mockReturnValue({
        toggleFavorite: jest.fn(),
        isPending: true,
      });

      renderScreen({ item: baseLocalItem, mealType: 'breakfast' });

      // The gate is scoped to the star: an in-flight favorite toggle must not
      // block editing or saving.
      const edit = findHeaderItemByAccessibilityLabel(
        navigation,
        'Adjust nutrition'
      );
      expect(edit?.disabled).toBe(false);
    });
  });
});
