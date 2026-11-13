import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import FoodFormScreen from '../../src/screens/FoodFormScreen';
import type { FoodFormProps } from '../../src/components/FoodForm';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import { useMealTypes, usePreferences } from '../../src/hooks';
import { useSaveFood } from '../../src/hooks/useSaveFood';
import { useAddFoodEntry } from '../../src/hooks/useAddFoodEntry';
import {
  useCreateFoodVariant,
  useFoodVariants,
} from '../../src/hooks/useFoodVariants';
import { setPendingMealIngredientSelection } from '../../src/services/mealBuilderSelection';
import { setPendingMealPlanSelection } from '../../src/services/mealPlanSelection';
import { consumePendingActionTagSelection } from '../../src/services/actionTagSelection';
import { consumePendingContainerLinkSelection } from '../../src/services/waterContainerLinkSelection';
import {
  createFoodVariant,
  fetchFoodVariants,
  saveFood,
  updateFood,
  updateFoodVariant,
  deleteFoodVariant,
  updateFoodEntriesSnapshot,
} from '../../src/services/api/foodsApi';
import { createFoodEntry } from '../../src/services/api/foodEntriesApi';
import type { FoodEntry } from '../../src/types/foodEntries';
import type { FoodItem, FoodVariantDetail } from '../../src/types/foods';
import type { EditableFoodPortion } from '../../src/utils/namedFoodPortions';
import type { EquivalentUnit } from '../../src/types/foodUnitVariants';

const mockPop = jest.fn((count: number) => ({
  type: 'POP',
  payload: { count },
}));
const mockPopToTop = jest.fn(() => ({ type: 'POP_TO_TOP' }));
const mockFoodForm = jest.fn();
let mockLiveQueryClient: QueryClient | undefined;
const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
} as any;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => mockNavigation,
    StackActions: {
      pop: (count: number) => mockPop(count),
      popToTop: () => mockPopToTop(),
    },
  };
});

jest.mock('../../src/hooks', () => ({
  useMealTypes: jest.fn(),
  usePreferences: jest.fn(),
}));

jest.mock('../../src/hooks/useSaveFood', () => ({
  useSaveFood: jest.fn(),
}));

jest.mock('../../src/hooks/useAddFoodEntry', () => ({
  ...jest.requireActual<typeof import('../../src/hooks/useAddFoodEntry')>(
    '../../src/hooks/useAddFoodEntry'
  ),
  useAddFoodEntry: jest.fn(),
}));

jest.mock('../../src/hooks/useFoodVariants', () => ({
  useCreateFoodVariant: jest.fn(),
  useFoodVariants: jest.fn(),
}));

jest.mock('../../src/services/mealBuilderSelection', () => ({
  setPendingMealIngredientSelection: jest.fn(),
}));

jest.mock('../../src/services/mealPlanSelection', () => ({
  ...jest.requireActual('../../src/services/mealPlanSelection'),
  setPendingMealPlanSelection: jest.fn(),
}));

// The edit path writes through foodsApi directly (not a hook), so without this
// the save hits the real client, throws for lack of a server config, and never
// reaches the post-save prompt.
jest.mock('../../src/services/api/foodsApi', () => ({
  createFoodVariant: jest.fn(() => Promise.resolve({ id: 'variant-new' })),
  deleteFoodVariant: jest.fn(() => Promise.resolve()),
  updateFoodVariant: jest.fn(() => Promise.resolve({})),
  updateFood: jest.fn(() => Promise.resolve({})),
  updateFoodEntriesSnapshot: jest.fn(() => Promise.resolve()),
  fetchFoodVariants: jest.fn(() => Promise.resolve([])),
  saveFood: jest.fn(),
}));

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  createFoodEntry: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query'
  ),
  useQueryClient: () =>
    mockLiveQueryClient ?? {
      setQueryData: jest.fn(),
      invalidateQueries: jest.fn(),
    },
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../src/components/StepperInput', () => {
  const React = require('react');
  const { TextInput } = require('react-native');
  return {
    __esModule: true,
    default: ({ value, onChangeText, onBlur }: any) => (
      <TextInput
        testID="form-quantity-input"
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
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
    React.useImperativeHandle(ref, () => ({
      present: jest.fn(),
      dismiss: jest.fn(),
    }));
    return <View testID="time-sheet" />;
  });
  MockTimeSheet.displayName = 'MockTimeSheet';
  return {
    __esModule: true,
    default: MockTimeSheet,
  };
});

let mockSubmittedFoodFormData: any;
let mockUnitSelectionResult: any;
let mockEquivalentDraft: EquivalentUnit[] = [];
let mockPortionDraft: EditableFoodPortion[] = [];
let mockCustomNutrientDraft: Record<string, number> = {};

jest.mock('../../src/components/FoodForm', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: (props: FoodFormProps) => {
      mockFoodForm(props);
      const {
        onSubmit,
        children,
        submitLabel = 'Add Food',
        unitSelector,
      } = props;
      return (
        <View>
          {props.headerChildren}
          {children}
          {unitSelector ? (
            <Pressable
              onPress={() =>
                unitSelector.onUnitSelectionChange?.(mockUnitSelectionResult)
              }
            >
              <Text>Select Converted Unit</Text>
            </Pressable>
          ) : null}
          {props.equivalents ? (
            <Pressable
              onPress={() => props.equivalents.onChange(mockEquivalentDraft)}
            >
              <Text>Apply Equivalent Fixture</Text>
            </Pressable>
          ) : null}
          {props.portions ? (
            <Pressable
              onPress={() => props.portions.onChange(mockPortionDraft)}
            >
              <Text>Apply Portion Fixture</Text>
            </Pressable>
          ) : null}
          {props.onCustomNutrientsChange ? (
            <Pressable
              onPress={() =>
                props.onCustomNutrientsChange?.(mockCustomNutrientDraft)
              }
            >
              <Text>Apply Custom Nutrient Fixture</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => onSubmit(mockSubmittedFoodFormData)}>
            <Text>{submitLabel}</Text>
          </Pressable>
        </View>
      );
    },
  };
});

const mockUseMealTypes = useMealTypes as jest.MockedFunction<
  typeof useMealTypes
>;
const mockUsePreferences = usePreferences as jest.MockedFunction<
  typeof usePreferences
>;
const mockUseSaveFood = useSaveFood as jest.MockedFunction<typeof useSaveFood>;
const mockUseAddFoodEntry = useAddFoodEntry as jest.MockedFunction<
  typeof useAddFoodEntry
>;
const mockUseCreateFoodVariant = useCreateFoodVariant as jest.MockedFunction<
  typeof useCreateFoodVariant
>;
const mockUseFoodVariants = useFoodVariants as jest.MockedFunction<
  typeof useFoodVariants
>;
const mockSetPendingMealIngredientSelection =
  setPendingMealIngredientSelection as jest.MockedFunction<
    typeof setPendingMealIngredientSelection
  >;
const mockSetPendingMealPlanSelection =
  setPendingMealPlanSelection as jest.MockedFunction<
    typeof setPendingMealPlanSelection
  >;
const mockToast = Toast as unknown as { show: jest.Mock };

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

// The edit flow can raise two Alerts: "Save nutrition" (overwrite vs new
// variant) and, after a successful save, "Update past entries?". An
// unanswered Alert leaves a pending promise and the save never completes, so
// tests must answer both. Defaults are the non-destructive choices.
function answerSyncPrompt(choice: 'keep' | 'update' = 'keep') {
  return jest
    .spyOn(Alert, 'alert')
    .mockImplementation((title, _message, buttons) => {
      const list = (buttons ?? []) as { text?: string; onPress?: () => void }[];
      const press = (text: string) =>
        list.find((b) => b.text === text)?.onPress?.();

      if (title === 'Update past entries?') {
        press(choice === 'update' ? 'Update' : "Don't Update");
        return;
      }
      if (title === 'Save nutrition' || title === 'Zapisz wartości odżywcze') {
        press('Zaktualizuj istniejący');
        press('Update existing');
        return;
      }
      // Anything else: take the first non-cancel action so the flow proceeds.
      list.find((b) => b.text && b.text !== 'Cancel')?.onPress?.();
    });
}

describe('FoodFormScreen', () => {
  const navigation = mockNavigation;

  it('opens the label scanner over the existing edit session without saving', () => {
    const params = {
      mode: 'edit-food',
      item: {
        id: 'food-1',
        name: 'Yogurt',
        source: 'local',
        barcode: '012345678905',
      },
      initialValues: { name: 'Yogurt', calories: '120' },
      foodId: 'food-1',
      variantId: 'variant-1',
      returnKey: 'FoodDetail-key',
    };
    const screen = renderScreen(params);
    fireEvent.press(screen.getByText('Scan nutrition label'));
    expect(navigation.navigate).toHaveBeenCalledWith('FoodScan', {
      mode: 'capture-label',
      returnKey: 'FoodForm-key',
    });
    expect(mockSaveFoodAsync).not.toHaveBeenCalled();
    expect(mockCreateVariant).not.toHaveBeenCalled();
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  const mockSaveFoodAsync = jest.fn();
  const mockAddEntry = jest.fn();
  const mockInvalidateCache = jest.fn();
  const mockCreateVariant = jest.fn();

  const renderScreen = (params: any) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodFormScreen
          navigation={navigation}
          route={
            {
              key: 'FoodForm-key',
              name: 'FoodForm',
              params,
            } as any
          }
        />
      </SafeAreaProvider>
    );

  const renderFailedEntryRetry = () => {
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      notes: '',
      caffeineMg: '',
      waterMl: '',
      alcoholG: '',
    };
    const state: {
      food: FoodItem | null;
      rows: FoodVariantDetail[];
      failure:
        'metadata-response' | 'variant-write' | 'variant-response' | null;
    } = { food: null, rows: [], failure: null };
    let createdFoods = 0;
    jest.mocked(saveFood).mockImplementation(async (payload) => {
      const foodId = `food-${++createdFoods}`;
      const variant: FoodVariantDetail = {
        ...payload,
        id: `reference-${foodId}`,
        food_id: foodId,
      };
      state.rows.push(variant);
      state.food = {
        id: foodId,
        name: payload.name,
        brand: payload.brand,
        notes: payload.notes,
        barcode: payload.barcode,
        is_quick_food: payload.is_quick_food,
        is_custom: true,
        default_variant: variant,
      };
      return state.food;
    });
    mockSaveFoodAsync.mockImplementation(
      (...args: Parameters<typeof saveFood>) => saveFood(...args)
    );
    jest
      .mocked(fetchFoodVariants)
      .mockImplementation(async (foodId) =>
        state.rows.filter((row) => row.food_id === foodId)
      );
    jest.mocked(updateFood).mockImplementation(async (foodId, payload) => {
      if (state.food?.id !== foodId) throw new Error('Unknown food');
      state.food = { ...state.food, ...payload };
      if (state.failure === 'metadata-response') {
        state.failure = null;
        throw new Error('metadata response lost after commit');
      }
      return state.food;
    });
    jest.mocked(updateFoodVariant).mockImplementation(async (id, payload) => {
      if (state.failure === 'variant-write') {
        state.failure = null;
        throw new Error('variant write failed');
      }
      const variant = { ...payload, id };
      state.rows = state.rows.map((row) => (row.id === id ? variant : row));
      if (state.food?.default_variant.id === id)
        state.food = { ...state.food, default_variant: variant };
      if (state.failure === 'variant-response') {
        state.failure = null;
        throw new Error('variant response lost after commit');
      }
      return variant;
    });
    jest
      .mocked(createFoodEntry)
      .mockRejectedValueOnce(new Error('entry write failed'))
      .mockImplementation(async (payload) => {
        const variant = state.rows.find((row) => row.id === payload.variant_id);
        if (!variant) throw new Error('Unknown serving');
        return {
          id: 'entry-1',
          food_id: payload.food_id,
          variant_id: payload.variant_id,
          quantity: payload.quantity,
          unit: payload.unit,
          entry_date: payload.entry_date,
          meal_type: 'breakfast',
          serving_size: variant.serving_size,
          serving_unit: variant.serving_unit,
          calories: variant.calories,
          custom_nutrients: variant.custom_nutrients,
        };
      });
    mockUseAddFoodEntry.mockImplementation(
      jest.requireActual<typeof import('../../src/hooks/useAddFoodEntry')>(
        '../../src/hooks/useAddFoodEntry'
      ).useAddFoodEntry
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    mockLiveQueryClient = queryClient;
    const screen = render(
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <FoodFormScreen
            navigation={navigation}
            route={{
              key: 'FoodForm-key',
              name: 'FoodForm',
              params: {
                mode: 'create-food',
                date: '2026-04-23',
                barcode: '1234567890123',
              },
            }}
          />
        </SafeAreaProvider>
      </QueryClientProvider>
    );
    return { screen, state };
  };

  const expectFailedEntry = () =>
    waitFor(() =>
      expect(mockToast.show).toHaveBeenCalledWith(
        expect.objectContaining({ text1: 'Failed to add food' })
      )
    );

  const expectFailedRetry = () =>
    waitFor(() =>
      expect(mockToast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          text1: 'Could not save all portions. Try saving again.',
        })
      )
    );

  beforeEach(async () => {
    await act(async () => {
      await initializeI18n('en');
      await i18n.changeLanguage('en');
    });
    jest.clearAllMocks();
    answerSyncPrompt('keep');
    mockFoodForm.mockClear();
    mockPortionDraft = [];
    mockEquivalentDraft = [];
    mockCustomNutrientDraft = {};
    jest.mocked(fetchFoodVariants).mockResolvedValue([]);
    mockSubmittedFoodFormData = {
      name: 'Custom Meal Food',
      brand: 'Brand Co',
      servingSize: '100',
      servingUnit: 'g',
      calories: '200',
      protein: '10',
      carbs: '20',
      fat: '5',
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
    mockUnitSelectionResult = {
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
    mockUseMealTypes.mockReturnValue({
      mealTypes: [
        { id: 'meal-1', name: 'breakfast', is_visible: true, sort_order: 1 },
      ] as any,
      defaultMealTypeId: 'meal-1',
      isLoading: false,
      isError: false,
    });
    mockUsePreferences.mockReturnValue({
      preferences: {
        auto_scale_online_imports: false,
      } as any,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseSaveFood.mockReturnValue({
      saveFood: jest.fn(),
      saveFoodAsync: mockSaveFoodAsync,
      isPending: false,
      isSaved: false,
    });
    mockUseCreateFoodVariant.mockReturnValue({
      createVariant: mockCreateVariant,
      isPending: false,
    });
    mockUseFoodVariants.mockReturnValue({
      variants: undefined,
      isLoading: false,
      isError: false,
    });
    mockUseAddFoodEntry.mockImplementation((options) => ({
      addEntry: (input: any) => {
        mockAddEntry(input);
        options?.onSuccess?.({ entry_date: '2026-04-23' } as any);
      },
      isPending: false,
      invalidateCache: mockInvalidateCache,
    }));
  });

  afterEach(() => {
    mockLiveQueryClient?.clear();
    mockLiveQueryClient = undefined;
  });

  it.each(['create-food', 'edit-food'] as const)(
    'leaves %s after confirming named portions while unrelated refetches are pending',
    async (mode) => {
      const reference: FoodVariantDetail = {
        id: 'grams',
        food_id: 'food-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
      };
      let rows = [reference];
      mockSaveFoodAsync.mockResolvedValue({
        id: 'food-1',
        name: 'Custom Meal Food',
        brand: 'Brand Co',
        is_custom: true,
        default_variant: reference,
      });
      mockUseFoodVariants.mockReturnValue({
        variants: rows,
        isLoading: false,
        isError: false,
      });
      mockPortionDraft = [{ name: 'packet', amount: 150, unit: 'g' }];
      jest.mocked(fetchFoodVariants).mockImplementation(async () => rows);
      jest.mocked(createFoodVariant).mockImplementation(async (payload) => {
        const row = { ...payload, id: 'packet' };
        rows = [...rows, row];
        return row;
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
      });
      mockLiveQueryClient = queryClient;
      let finishMealsRefetch: (() => void) | undefined;
      const pendingMeals = new Promise<string[]>((resolve) => {
        finishMealsRefetch = () => resolve(['refreshed meal']);
      });
      let refetchPending = false;
      await queryClient.fetchQuery({
        queryKey: ['meals'],
        queryFn: () =>
          refetchPending ? pendingMeals : Promise.resolve(['existing meal']),
      });
      refetchPending = true;

      const params: React.ComponentProps<
        typeof FoodFormScreen
      >['route']['params'] =
        mode === 'create-food'
          ? { mode, pickerMode: 'library' }
          : {
              mode,
              foodId: 'food-1',
              variantId: 'grams',
              returnKey: 'FoodDetail-key',
              initialValues: mockSubmittedFoodFormData,
              customNutrients: null,
              item: {
                id: 'food-1',
                name: 'Custom Meal Food',
                brand: 'Brand Co',
                source: 'local',
                servingSize: 100,
                servingUnit: 'g',
                calories: 200,
                protein: 10,
                carbs: 20,
                fat: 5,
                originalItem: {},
              },
            };
      const screen = renderScreen(params);
      try {
        fireEvent.press(screen.getByText('Apply Portion Fixture'));
        fireEvent.press(screen.getByText('Save'));

        await waitFor(() =>
          expect(queryClient.getQueryState(['meals'])?.fetchStatus).toBe(
            'fetching'
          )
        );
        expect(queryClient.getQueryData(['foodVariants', 'food-1'])).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: 'packet',
              serving_unit: 'packet (150 g)',
              calories: 300,
            }),
          ])
        );
        await waitFor(() =>
          expect(
            mode === 'create-food' ? navigation.dispatch : navigation.goBack
          ).toHaveBeenCalled()
        );
        expect(queryClient.getQueryState(['meals'])?.fetchStatus).toBe(
          'fetching'
        );
        expect(queryClient.getQueryData(['meals'])).toEqual(['existing meal']);
        expect(updateFoodEntriesSnapshot).not.toHaveBeenCalled();
      } finally {
        await act(async () => {
          finishMealsRefetch?.();
          await pendingMeals;
        });
      }
    }
  );

  it.each([true, false])(
    'reuses a saved manual food after a failed log with portions: %s',
    async (withPortions) => {
      mockSubmittedFoodFormData = {
        ...mockSubmittedFoodFormData,
        notes: '',
        caffeineMg: '',
        waterMl: '',
        alcoholG: '',
      };
      const reference: FoodVariantDetail = {
        id: 'grams',
        food_id: 'food-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
      };
      const savedFoods: FoodItem[] = [];
      let rows: FoodVariantDetail[] = [];
      jest.mocked(saveFood).mockImplementation(async () => {
        const foodId = `food-${savedFoods.length + 1}`;
        const variant = {
          ...reference,
          id: savedFoods.length === 0 ? 'grams' : `grams-${foodId}`,
          food_id: foodId,
        };
        const saved = {
          id: foodId,
          name: 'Custom Meal Food',
          brand: 'Brand Co',
          is_custom: true,
          default_variant: variant,
        };
        savedFoods.push(saved);
        rows = [...rows, variant];
        return saved;
      });
      mockSaveFoodAsync.mockImplementation(
        (...args: Parameters<typeof saveFood>) => saveFood(...args)
      );
      jest
        .mocked(fetchFoodVariants)
        .mockImplementation(async (foodId) =>
          rows.filter((row) => row.food_id === foodId)
        );
      jest.mocked(createFoodVariant).mockImplementation(async (payload) => {
        const row = { ...payload, id: `variant-${rows.length}` };
        rows = [...rows, row];
        return row;
      });
      const entry: FoodEntry = {
        id: 'entry-1',
        food_id: 'food-1',
        variant_id: 'grams',
        meal_type: 'breakfast',
        meal_type_id: 'meal-1',
        quantity: 100,
        unit: 'g',
        entry_date: '2026-04-23',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
      };
      jest
        .mocked(createFoodEntry)
        .mockRejectedValueOnce(new Error('offline'))
        .mockImplementation(async (payload) => ({
          ...entry,
          food_id: payload.food_id,
          variant_id: payload.variant_id,
          quantity: payload.quantity,
          unit: payload.unit,
          entry_date: payload.entry_date,
        }));
      mockUseAddFoodEntry.mockImplementation(
        jest.requireActual<typeof import('../../src/hooks/useAddFoodEntry')>(
          '../../src/hooks/useAddFoodEntry'
        ).useAddFoodEntry
      );
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
      });
      mockLiveQueryClient = queryClient;
      const screen = render(
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider initialMetrics={{ insets, frame }}>
            <FoodFormScreen
              navigation={navigation}
              route={{
                key: 'FoodForm-key',
                name: 'FoodForm',
                params: { mode: 'create-food', date: '2026-04-23' },
              }}
            />
          </SafeAreaProvider>
        </QueryClientProvider>
      );
      mockEquivalentDraft = [{ serving_size: 1, serving_unit: 'serving' }];
      fireEvent.press(screen.getByText('Apply Equivalent Fixture'));
      fireEvent.press(screen.getByText('Add Food'));
      await waitFor(() =>
        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({ text1: 'Failed to add food' })
        )
      );
      expect(rows).toEqual([reference]);
      expect(navigation.dispatch).not.toHaveBeenCalled();

      if (withPortions) {
        mockPortionDraft = [{ name: 'packet', amount: 150, unit: 'g' }];
        fireEvent.press(screen.getByText('Apply Portion Fixture'));
      }
      fireEvent.press(screen.getByText('Add Food'));
      await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());

      expect(savedFoods.map((food) => food.id)).toEqual(['food-1']);
      expect(saveFood).toHaveBeenCalledTimes(1);
      expect(mockSaveFoodAsync).not.toHaveBeenCalled();
      expect(rows.map((row) => row.serving_unit)).toEqual([
        'g',
        ...(withPortions ? ['packet (150 g)'] : []),
        'serving',
      ]);
      expect(rows.find((row) => row.serving_unit === 'serving')).toMatchObject({
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
      });
      expect(createFoodEntry).toHaveBeenLastCalledWith(
        expect.objectContaining({ food_id: 'food-1', variant_id: 'grams' })
      );
    }
  );

  it.each([
    { barcode: '9876543210987', initiallySaved: true },
    { barcode: '', initiallySaved: false },
  ])(
    'updates barcode and library choice on a saved-food retry: $barcode / $initiallySaved',
    async ({ barcode, initiallySaved }) => {
      const { screen, state } = renderFailedEntryRetry();
      fireEvent(
        screen.getByLabelText('Save to Database'),
        'valueChange',
        initiallySaved
      );
      fireEvent.press(screen.getByText('Add Food'));
      await expectFailedEntry();
      expect(state.food).toMatchObject({
        barcode: '1234567890123',
        is_quick_food: !initiallySaved,
      });

      fireEvent.changeText(
        screen.getByPlaceholderText('012345678905'),
        barcode
      );
      fireEvent(
        screen.getByLabelText('Save to Database'),
        'valueChange',
        !initiallySaved
      );
      fireEvent.press(screen.getByText('Add Food'));
      await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());

      expect(saveFood).toHaveBeenCalledTimes(1);
      expect(updateFood).toHaveBeenLastCalledWith(
        'food-1',
        { barcode: barcode || null, is_quick_food: initiallySaved },
        undefined
      );
      expect(state.food).toMatchObject({
        barcode: barcode || null,
        is_quick_food: initiallySaved,
      });
      expect(createFoodEntry).toHaveBeenLastCalledWith(
        expect.objectContaining({
          food_id: 'food-1',
          variant_id: 'reference-food-1',
        })
      );
      expect(updateFoodVariant).not.toHaveBeenCalled();
    }
  );

  it.each(['variant-write', 'metadata-response'] as const)(
    'restores reverted metadata after a saved-food retry fails at %s',
    async (failure) => {
      const { screen, state } = renderFailedEntryRetry();
      const originalData = { ...mockSubmittedFoodFormData };
      fireEvent.press(screen.getByText('Add Food'));
      await expectFailedEntry();

      mockSubmittedFoodFormData = {
        ...originalData,
        name: 'Changed food',
        brand: 'Changed brand',
        notes: 'Changed note',
        calories: '300',
      };
      fireEvent.changeText(
        screen.getByPlaceholderText('012345678905'),
        '9876543210987'
      );
      fireEvent(
        screen.getByLabelText('Save to Database'),
        'valueChange',
        false
      );
      state.failure = failure;
      fireEvent.press(screen.getByText('Add Food'));
      await expectFailedRetry();
      expect(state.food).toMatchObject({
        name: 'Changed food',
        brand: 'Changed brand',
        notes: 'Changed note',
      });
      expect(navigation.dispatch).not.toHaveBeenCalled();

      mockSubmittedFoodFormData = { ...originalData, calories: '300' };
      fireEvent.changeText(
        screen.getByPlaceholderText('012345678905'),
        '1234567890123'
      );
      fireEvent(screen.getByLabelText('Save to Database'), 'valueChange', true);
      fireEvent.press(screen.getByText('Add Food'));
      await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());

      expect(state.food).toMatchObject({
        name: originalData.name,
        brand: originalData.brand,
        notes: null,
        barcode: '1234567890123',
        is_quick_food: false,
      });
      expect(state.rows).toEqual([
        expect.objectContaining({
          id: 'reference-food-1',
          calories: 300,
        }),
      ]);
      expect(updateFood).toHaveBeenCalledTimes(2);
      expect(saveFood).toHaveBeenCalledTimes(1);
      expect(createFoodEntry).toHaveBeenLastCalledWith(
        expect.objectContaining({ food_id: 'food-1' })
      );
    }
  );

  it('restores reverted serving, nutrition and custom nutrients after a lost saved-food retry response', async () => {
    const { screen, state } = renderFailedEntryRetry();
    const originalData = { ...mockSubmittedFoodFormData };
    mockCustomNutrientDraft = { iodine: 2 };
    fireEvent.press(screen.getByText('Apply Custom Nutrient Fixture'));
    fireEvent.press(screen.getByText('Add Food'));
    await expectFailedEntry();

    mockSubmittedFoodFormData = {
      ...originalData,
      servingSize: '50',
      servingUnit: 'ml',
      calories: '300',
    };
    mockCustomNutrientDraft = { iodine: 3 };
    fireEvent.press(screen.getByText('Apply Custom Nutrient Fixture'));
    state.failure = 'variant-response';
    fireEvent.press(screen.getByText('Add Food'));
    await expectFailedRetry();
    expect(state.rows).toEqual([
      expect.objectContaining({
        serving_size: 50,
        serving_unit: 'ml',
        calories: 300,
        custom_nutrients: { iodine: 3 },
      }),
    ]);

    mockSubmittedFoodFormData = originalData;
    mockCustomNutrientDraft = { iodine: 2 };
    fireEvent.press(screen.getByText('Apply Custom Nutrient Fixture'));
    fireEvent.press(screen.getByText('Add Food'));
    await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());

    expect(state.rows).toEqual([
      expect.objectContaining({
        id: 'reference-food-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        custom_nutrients: { iodine: 2 },
      }),
    ]);
    expect(updateFoodVariant).toHaveBeenCalledTimes(2);
    expect(saveFood).toHaveBeenCalledTimes(1);
    expect(createFoodVariant).not.toHaveBeenCalled();
    expect(createFoodEntry).toHaveBeenLastCalledWith(
      expect.objectContaining({
        food_id: 'food-1',
        variant_id: 'reference-food-1',
        unit: 'g',
      })
    );
  });

  it.each([
    { change: 'unchanged', edited: false, renamed: false },
    { change: 'nutrition', edited: true, renamed: false },
    { change: 'unit with a lost response', edited: true, renamed: true },
  ])(
    'keeps the selected nondefault serving after retry: $change',
    async ({ edited, renamed }) => {
      const reference: FoodVariantDetail = {
        id: 'grams',
        food_id: 'food-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
      };
      const selected: FoodVariantDetail = {
        ...reference,
        id: 'cup',
        serving_size: 1,
        serving_unit: 'cup (250 ml)',
        calories: 400,
      };
      jest.mocked(saveFood).mockResolvedValue({
        id: 'food-1',
        name: 'Custom Meal Food',
        brand: 'Brand Co',
        is_custom: true,
        default_variant: reference,
      });
      mockSaveFoodAsync.mockImplementation(
        (...args: Parameters<typeof saveFood>) => saveFood(...args)
      );
      let rows = [reference, selected];
      let responseLost = false;
      jest.mocked(fetchFoodVariants).mockImplementation(async () => rows);
      jest.mocked(updateFoodVariant).mockImplementation(async (id, payload) => {
        const row = { ...payload, id };
        rows = rows.map((current) => (current.id === id ? row : current));
        if (renamed && !responseLost) {
          responseLost = true;
          throw new Error('response lost after commit');
        }
        return row;
      });
      jest.mocked(createFoodVariant).mockImplementation(async (payload) => {
        const row = { ...payload, id: 'bottle' };
        rows = [...rows, row];
        return row;
      });
      jest
        .mocked(createFoodEntry)
        .mockRejectedValueOnce(new Error('offline'))
        .mockImplementation(async (payload) => ({
          id: 'entry-1',
          food_id: payload.food_id,
          variant_id: payload.variant_id,
          quantity: payload.quantity,
          unit: payload.unit,
          entry_date: payload.entry_date,
          meal_type: 'breakfast',
          serving_size: 1,
          calories: 400,
        }));
      mockSubmittedFoodFormData = {
        ...mockSubmittedFoodFormData,
        servingSize: '1',
        servingUnit: 'cup (250 ml)',
        calories: '400',
        notes: '',
        caffeineMg: '',
        waterMl: '',
        alcoholG: '',
      };
      mockUseAddFoodEntry.mockImplementation(
        jest.requireActual<typeof import('../../src/hooks/useAddFoodEntry')>(
          '../../src/hooks/useAddFoodEntry'
        ).useAddFoodEntry
      );
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
      });
      mockLiveQueryClient = queryClient;
      const screen = render(
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider initialMetrics={{ insets, frame }}>
            <FoodFormScreen
              navigation={navigation}
              route={{
                key: 'FoodForm-key',
                name: 'FoodForm',
                params: {
                  mode: 'create-food',
                  date: '2026-04-23',
                  barcode: '1234567890123',
                },
              }}
            />
          </SafeAreaProvider>
        </QueryClientProvider>
      );
      fireEvent.press(screen.getByText('Add Food'));
      await waitFor(() =>
        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({ text1: 'Failed to add food' })
        )
      );
      expect(createFoodEntry).toHaveBeenLastCalledWith(
        expect.objectContaining({
          food_id: 'food-1',
          variant_id: 'cup',
          unit: 'cup (250 ml)',
        })
      );
      if (edited)
        mockSubmittedFoodFormData = {
          ...mockSubmittedFoodFormData,
          calories: '500',
        };
      if (renamed) {
        mockSubmittedFoodFormData = {
          ...mockSubmittedFoodFormData,
          servingSize: '100',
          servingUnit: 'ml',
        };
        mockPortionDraft = [{ name: 'bottle', amount: 150, unit: 'ml' }];
        fireEvent.press(screen.getByText('Apply Portion Fixture'));
      }
      fireEvent.press(screen.getByText('Add Food'));
      if (renamed) {
        await waitFor(() =>
          expect(mockToast.show).toHaveBeenCalledWith(
            expect.objectContaining({
              text1: 'Could not save all portions. Try saving again.',
            })
          )
        );
        expect(navigation.dispatch).not.toHaveBeenCalled();
        fireEvent.press(screen.getByText('Add Food'));
      }
      await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());
      expect(saveFood).toHaveBeenCalledTimes(1);
      expect(createFoodEntry).toHaveBeenLastCalledWith(
        expect.objectContaining({
          food_id: 'food-1',
          variant_id: 'cup',
          unit: renamed ? 'ml' : 'cup (250 ml)',
        })
      );
      expect(rows.find((row) => row.id === 'grams')).toEqual(reference);
      expect(rows.find((row) => row.id === 'cup')).toMatchObject({
        calories: edited ? 500 : 400,
      });
      if (!edited) expect(updateFoodVariant).not.toHaveBeenCalled();
      if (renamed)
        expect(rows.find((row) => row.id === 'bottle')).toMatchObject({
          serving_unit: 'bottle (150 ml)',
          calories: 750,
        });
      else expect(createFoodVariant).not.toHaveBeenCalled();
    }
  );

  it.each(['ml', 'cup'])(
    'rejects incompatible new Create portions before writes for %s',
    async (servingUnit) => {
      let rows: FoodVariantDetail[] = [];
      mockSaveFoodAsync.mockImplementation(
        async (payload: Parameters<typeof saveFood>[0]) => {
          const reference: FoodVariantDetail = {
            id: 'grams',
            food_id: 'food-1',
            serving_size: payload.serving_size,
            serving_unit: payload.serving_unit,
            calories: payload.calories,
            protein: payload.protein,
            carbs: payload.carbs,
            fat: payload.fat,
          };
          rows = [reference];
          return {
            id: 'food-1',
            name: payload.name,
            brand: payload.brand,
            is_custom: true,
            default_variant: reference,
          };
        }
      );
      jest.mocked(fetchFoodVariants).mockImplementation(async () => rows);
      jest.mocked(createFoodVariant).mockImplementation(async (payload) => {
        const row = { ...payload, id: 'packet' };
        rows = [...rows, row];
        return row;
      });
      const screen = renderScreen({
        mode: 'create-food',
        pickerMode: 'library',
      });
      mockPortionDraft = [{ name: 'packet', amount: 150, unit: 'g' }];
      fireEvent.press(screen.getByText('Apply Portion Fixture'));
      mockSubmittedFoodFormData = { ...mockSubmittedFoodFormData, servingUnit };
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() =>
        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            text1:
              'Select a gram or milliliter serving that matches your new portions.',
          })
        )
      );
      expect(mockSaveFoodAsync).not.toHaveBeenCalled();
      expect(updateFood).not.toHaveBeenCalled();
      expect(updateFoodVariant).not.toHaveBeenCalled();
      expect(createFoodVariant).not.toHaveBeenCalled();
      expect(navigation.dispatch).not.toHaveBeenCalled();
      expect(rows).toEqual([]);
      mockSubmittedFoodFormData = {
        ...mockSubmittedFoodFormData,
        servingUnit: 'g',
      };
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());
      expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
      expect(rows.map((row) => row.serving_unit)).toEqual([
        'g',
        'packet (150 g)',
      ]);
    }
  );

  it.each([
    { servingUnit: 'ml', draft: false },
    { servingUnit: 'cup', draft: true },
  ])(
    'rejects incompatible new portions before writes for $servingUnit and saves after correction',
    async ({ servingUnit, draft }) => {
      const reference: FoodVariantDetail = {
        id: 'grams',
        food_id: 'food-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
      };
      const importedPortion: FoodVariantDetail = {
        ...reference,
        id: 'imported',
        serving_size: 1,
        serving_unit: 'packet (150 g)',
        calories: 777,
        source: 'imported',
      };
      let rows = [reference, importedPortion];
      mockUseFoodVariants.mockReturnValue({
        variants: rows,
        isLoading: false,
        isError: false,
      });
      jest.mocked(fetchFoodVariants).mockImplementation(async () => rows);
      jest.mocked(updateFoodVariant).mockImplementation(async (id, payload) => {
        const row = { ...payload, id };
        rows = rows.map((current) => (current.id === id ? row : current));
        return row;
      });
      const createVariant = async (
        payload: Parameters<typeof createFoodVariant>[0]
      ) => {
        const row = { ...payload, id: `variant-${rows.length}` };
        rows = [...rows, row];
        return row;
      };
      jest.mocked(createFoodVariant).mockImplementation(createVariant);
      mockCreateVariant.mockImplementation(createVariant);
      const initialValues = { ...mockSubmittedFoodFormData };
      mockSubmittedFoodFormData = {
        ...initialValues,
        name: 'Updated food',
        calories: '240',
        servingUnit,
      };
      const preservedPortion: EditableFoodPortion = {
        id: 'imported',
        name: 'packet',
        amount: 150,
        unit: 'g',
        preserveNutrition: true,
      };
      mockPortionDraft = [
        preservedPortion,
        { name: 'bottle', amount: 150, unit: 'g' },
      ];
      const screen = renderScreen({
        mode: 'edit-food',
        foodId: 'food-1',
        variantId: 'grams',
        returnKey: 'FoodDetail-key',
        initialValues,
        customNutrients: null,
        item: {
          id: 'food-1',
          name: 'Custom Meal Food',
          brand: 'Brand Co',
          source: 'local',
          servingSize: 100,
          servingUnit: 'g',
          calories: 200,
          protein: 10,
          carbs: 20,
          fat: 5,
          originalItem: {},
        },
      });
      fireEvent.press(screen.getByText('Apply Portion Fixture'));
      if (draft) {
        mockUnitSelectionResult = {
          kind: 'draft',
          variant: { ...reference, id: undefined, serving_unit: servingUnit },
        };
        await act(async () => {
          fireEvent.press(screen.getByText('Select Converted Unit'));
        });
      }
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() =>
        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            text1:
              'Select a gram or milliliter serving that matches your new portions.',
          })
        )
      );
      expect(updateFood).not.toHaveBeenCalled();
      expect(updateFoodVariant).not.toHaveBeenCalled();
      expect(createFoodVariant).not.toHaveBeenCalled();
      expect(mockCreateVariant).not.toHaveBeenCalled();
      expect(deleteFoodVariant).not.toHaveBeenCalled();
      expect(updateFoodEntriesSnapshot).not.toHaveBeenCalled();
      expect(navigation.dispatch).not.toHaveBeenCalled();
      expect(navigation.goBack).not.toHaveBeenCalled();
      expect(rows).toEqual([reference, importedPortion]);

      if (draft) {
        mockUnitSelectionResult = { kind: 'existing', variant: reference };
        await act(async () => {
          fireEvent.press(screen.getByText('Select Converted Unit'));
        });
        mockSubmittedFoodFormData = {
          ...mockSubmittedFoodFormData,
          servingUnit: 'g',
        };
      } else {
        mockPortionDraft = [
          preservedPortion,
          { name: 'bottle', amount: 150, unit: 'ml' },
        ];
        fireEvent.press(screen.getByText('Apply Portion Fixture'));
      }
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
      expect(rows.find((row) => row.id === 'grams')).toMatchObject({
        serving_unit: draft ? 'g' : 'ml',
        calories: 240,
      });
      expect(
        rows.find((row) => row.serving_unit.startsWith('bottle'))
      ).toMatchObject({
        serving_unit: draft ? 'bottle (150 g)' : 'bottle (150 ml)',
        calories: 360,
      });
      expect(rows.find((row) => row.id === 'imported')).toEqual(
        importedPortion
      );
      expect(updateFoodEntriesSnapshot).not.toHaveBeenCalled();
    }
  );

  it.each(['edit-food', 'adjust-entry-nutrition'] as const)(
    'clears custom nutrients when a converted unit comes from a variant without them (%s)',
    async (mode) => {
      const cup: FoodVariantDetail = {
        id: 'cup',
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'cup',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
        custom_nutrients: { Zinc: 3 },
      };
      mockUseFoodVariants.mockReturnValue({
        variants: [cup],
        isLoading: false,
        isError: false,
      });
      const screen = renderScreen({
        mode,
        foodId: 'food-1',
        variantId: 'cup',
        returnKey: 'FoodDetail-key',
        initialValues: { ...mockSubmittedFoodFormData },
        customNutrients: { Zinc: 3 },
        availableUnitVariants: [cup],
        selectedUnitSelection: { kind: 'existing', variant: cup },
        item: {
          id: 'food-1',
          name: 'Custom Meal Food',
          source: 'local',
          servingSize: 1,
          servingUnit: 'cup',
          calories: 200,
          protein: 10,
          carbs: 20,
          fat: 5,
          originalItem: {},
        },
      });
      expect(mockFoodForm).toHaveBeenLastCalledWith(
        expect.objectContaining({ customNutrients: { Zinc: 3 } })
      );
      // Converted from a gram variant that has no custom nutrients.
      mockUnitSelectionResult = {
        kind: 'draft',
        variant: {
          ...cup,
          id: undefined,
          serving_size: 1,
          serving_unit: 'oz',
          custom_nutrients: {},
        },
      };
      await act(async () => {
        fireEvent.press(screen.getByText('Select Converted Unit'));
      });
      expect(mockFoodForm).toHaveBeenLastCalledWith(
        expect.objectContaining({ customNutrients: {} })
      );
    }
  );

  it('updates equivalent units with the saved custom nutrients when overwriting in adjust mode', async () => {
    const grams: FoodVariantDetail = {
      id: 'grams',
      food_id: 'food-1',
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
      custom_nutrients: { Zinc: 3 },
    };
    const slice: FoodVariantDetail = {
      ...grams,
      id: 'slice',
      serving_size: 1,
      serving_unit: 'slice',
    };
    mockUseFoodVariants.mockReturnValue({
      variants: [grams, slice],
      isLoading: false,
      isError: false,
    });
    jest
      .spyOn(Alert, 'alert')
      .mockImplementation((title, _message, buttons) => {
        const list = (buttons ?? []) as {
          text?: string;
          onPress?: () => void;
        }[];
        const label =
          title === 'Save nutrition' ? 'Update existing' : "Don't Update";
        list.find((b) => b.text === label)?.onPress?.();
      });
    const screen = renderScreen({
      mode: 'adjust-entry-nutrition',
      foodId: 'food-1',
      variantId: 'grams',
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
      initialValues: { ...mockSubmittedFoodFormData },
      // Only the custom nutrient differs from the stored variant.
      customNutrients: { Zinc: 5 },
      availableUnitVariants: [grams, slice],
      selectedUnitSelection: { kind: 'existing', variant: grams },
    });
    fireEvent(
      screen.getByLabelText('Save nutrition for future use'),
      'valueChange',
      true
    );
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() =>
      expect(updateFoodVariant).toHaveBeenCalledWith(
        'slice',
        expect.objectContaining({
          serving_size: 1,
          serving_unit: 'slice',
          custom_nutrients: { Zinc: 5 },
        })
      )
    );
    expect(updateFoodVariant).toHaveBeenCalledWith(
      'grams',
      expect.objectContaining({ custom_nutrients: { Zinc: 5 } })
    );
  });

  it('creates draft equivalent units once, on the new variant, when saving as new', async () => {
    const grams: FoodVariantDetail = {
      id: 'grams',
      food_id: 'food-1',
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
    };
    mockUseFoodVariants.mockReturnValue({
      variants: [grams],
      isLoading: false,
      isError: false,
    });
    jest.mocked(fetchFoodVariants).mockResolvedValue([grams]);
    mockCreateVariant.mockResolvedValue({
      ...grams,
      id: 'grams-new',
      calories: 240,
    });
    jest
      .mocked(createFoodVariant)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ...grams, id: 'sibling' });
    jest
      .spyOn(Alert, 'alert')
      .mockImplementation((title, _message, buttons) => {
        const list = (buttons ?? []) as {
          text?: string;
          onPress?: () => void;
        }[];
        const label =
          title === 'Save nutrition'
            ? 'Save as new'
            : title === 'Update past entries?'
              ? "Don't Update"
              : undefined;
        (label
          ? list.find((b) => b.text === label)
          : list.find((b) => b.text && b.text !== 'Cancel')
        )?.onPress?.();
      });
    const initialValues = { ...mockSubmittedFoodFormData };
    mockSubmittedFoodFormData = { ...initialValues, calories: '240' };
    mockEquivalentDraft = [
      { serving_size: 1, serving_unit: 'serving' },
      { serving_size: 2, serving_unit: 'slice' },
    ];
    const screen = renderScreen({
      mode: 'edit-food',
      foodId: 'food-1',
      variantId: 'grams',
      returnKey: 'FoodDetail-key',
      initialValues,
      customNutrients: null,
      item: {
        id: 'food-1',
        name: 'Custom Meal Food',
        source: 'local',
        servingSize: 100,
        servingUnit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
        originalItem: {},
      },
    });
    fireEvent.press(screen.getByText('Apply Equivalent Fixture'));
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(mockToast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'Some equivalent units could not be saved',
        })
      )
    );
    expect(mockCreateVariant).toHaveBeenCalledTimes(1);
    expect(createFoodVariant).toHaveBeenCalledTimes(2);
    expect(createFoodVariant).toHaveBeenCalledWith(
      expect.objectContaining({ food_id: 'food-1', serving_unit: 'slice' })
    );
    expect(mockToast.show).not.toHaveBeenCalledWith(
      expect.objectContaining({ text1: 'Could not update food' })
    );
  });

  it('waits for named portions before leaving and retries using the same created food', async () => {
    let rows: FoodVariantDetail[] = [
      {
        id: 'grams',
        food_id: 'saved-food-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
      },
    ];
    mockSaveFoodAsync.mockResolvedValue({
      id: 'saved-food-1',
      name: 'Custom Meal Food',
      brand: 'Brand Co',
      is_custom: true,
      default_variant: rows[0],
    });
    mockPortionDraft = [{ name: 'packet', amount: 150, unit: 'g' }];
    jest.mocked(fetchFoodVariants).mockImplementation(async () => rows);
    jest
      .mocked(createFoodVariant)
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(async (payload) => {
        const row = { ...payload, id: 'packet' };
        rows = [...rows, row];
        return row;
      });
    const screen = renderScreen({ mode: 'create-food', pickerMode: 'library' });
    fireEvent.press(screen.getByText('Apply Portion Fixture'));
    expect(createFoodVariant).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(mockToast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          text1: 'Could not save all portions. Try saving again.',
        })
      )
    );
    expect(navigation.dispatch).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());
    expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      food_id: 'saved-food-1',
      serving_size: 1,
      serving_unit: 'packet (150 g)',
      calories: 300,
    });
  });

  it('recalculates saved named portions after editing metric nutrition and preserves hidden nutrients', async () => {
    const reference: FoodVariantDetail = {
      id: 'grams',
      food_id: 'food-1',
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
      polyunsaturated_fat: 2,
      glycemic_index: 'low',
      custom_nutrients: { iodine: 2 },
    };
    let rows: FoodVariantDetail[] = [
      reference,
      {
        ...reference,
        id: 'packet',
        serving_size: 1,
        serving_unit: 'packet (150 g)',
        calories: 300,
        protein: 15,
        carbs: 30,
        fat: 7.5,
        polyunsaturated_fat: 3,
        custom_nutrients: { iodine: 3 },
      },
    ];
    mockUseFoodVariants.mockReturnValue({
      variants: rows,
      isLoading: false,
      isError: false,
    });
    jest.mocked(fetchFoodVariants).mockImplementation(async () => rows);
    jest.mocked(updateFoodVariant).mockImplementation(async (id, payload) => {
      const row = { ...payload, id };
      rows = rows.map((current) => (current.id === id ? row : current));
      return row;
    });
    const initialValues = { ...mockSubmittedFoodFormData };
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      calories: '240',
    };
    const screen = renderScreen({
      mode: 'edit-food',
      foodId: 'food-1',
      variantId: 'grams',
      returnKey: 'FoodDetail-key',
      initialValues,
      customNutrients: { iodine: 2 },
      item: {
        id: 'food-1',
        name: 'Custom Meal Food',
        brand: 'Brand Co',
        source: 'local',
        servingSize: 100,
        servingUnit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
        originalItem: {},
      },
    });
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === 'packet')).toMatchObject({
      calories: 360,
      polyunsaturated_fat: 3,
      glycemic_index: 'low',
      custom_nutrients: { iodine: 3 },
    });
  });

  it('returns the gram reference after removing the currently selected named portion', async () => {
    const reference: FoodVariantDetail = {
      id: 'grams',
      food_id: 'food-1',
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
      is_default: true,
    };
    const packet: FoodVariantDetail = {
      ...reference,
      id: 'packet',
      is_default: false,
      serving_size: 1,
      serving_unit: 'packet (150 g)',
      calories: 300,
      protein: 15,
      carbs: 30,
      fat: 7.5,
    };
    let rows = [reference, packet];
    mockUseFoodVariants.mockReturnValue({
      variants: rows,
      isLoading: false,
      isError: false,
    });
    jest.mocked(fetchFoodVariants).mockImplementation(async () => rows);
    jest.mocked(deleteFoodVariant).mockImplementation(async (id) => {
      rows = rows.filter((row) => row.id !== id);
      return {};
    });
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      servingSize: '1',
      servingUnit: 'packet (150 g)',
      calories: '300',
      protein: '15',
      carbs: '30',
      fat: '7.5',
    };
    const screen = renderScreen({
      mode: 'edit-food',
      foodId: 'food-1',
      variantId: 'packet',
      returnKey: 'FoodDetail-key',
      initialValues: mockSubmittedFoodFormData,
      customNutrients: null,
      item: {
        id: 'food-1',
        name: 'Custom Meal Food',
        brand: 'Brand Co',
        source: 'local',
        servingSize: 1,
        servingUnit: 'packet (150 g)',
        calories: 300,
        protein: 15,
        carbs: 30,
        fat: 7.5,
        originalItem: {},
      },
    });
    fireEvent.press(screen.getByText('Apply Portion Fixture'));
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(navigation.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          params: expect.objectContaining({
            updatedSelectedVariantId: 'grams',
            updatedItem: expect.objectContaining({
              servingUnit: 'g',
              servingSize: 100,
            }),
          }),
        }),
      })
    );
  });

  it.each([
    {
      change: 'added',
      behavior: 'preserves a named portion added by a later refetch',
    },
    {
      change: 'removed',
      behavior:
        'deletes an explicitly removed portion omitted by a later refetch',
    },
  ])('$behavior', async ({ change }) => {
    const reference: FoodVariantDetail = {
      id: 'grams',
      food_id: 'food-1',
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
      is_default: true,
    };
    const packet: FoodVariantDetail = {
      ...reference,
      id: 'packet',
      is_default: false,
      serving_size: 1,
      serving_unit: 'packet (150 g)',
      calories: 300,
      protein: 15,
      carbs: 30,
      fat: 7.5,
    };
    let rows = [reference, packet];
    mockUseFoodVariants.mockReturnValue({
      variants: change === 'added' ? [reference] : rows,
      isLoading: false,
      isError: false,
    });
    jest.mocked(fetchFoodVariants).mockImplementation(async () => rows);
    jest.mocked(deleteFoodVariant).mockImplementation(async (id) => {
      rows = rows.filter((row) => row.id !== id);
      return {};
    });
    const params: React.ComponentProps<
      typeof FoodFormScreen
    >['route']['params'] = {
      mode: 'edit-food',
      foodId: 'food-1',
      variantId: 'grams',
      returnKey: 'FoodDetail-key',
      initialValues: mockSubmittedFoodFormData,
      customNutrients: null,
      item: {
        id: 'food-1',
        name: 'Custom Meal Food',
        brand: 'Brand Co',
        source: 'local',
        servingSize: 100,
        servingUnit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
        originalItem: {},
      },
    };
    const screen = renderScreen(params);
    if (change === 'removed') {
      fireEvent.press(screen.getByText('Apply Portion Fixture'));
    }
    mockUseFoodVariants.mockReturnValue({
      variants: change === 'added' ? rows : [reference],
      isLoading: false,
      isError: false,
    });
    screen.rerender(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodFormScreen
          navigation={navigation}
          route={{ key: 'FoodForm-key', name: 'FoodForm', params }}
        />
      </SafeAreaProvider>
    );

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(rows).toEqual(
      change === 'added' ? [reference, packet] : [reference]
    );
    expect(updateFoodEntriesSnapshot).not.toHaveBeenCalled();
  });

  it.each(['update', 'remove'])(
    'reconciles previously saved equivalents on a changed retry: %s',
    async (action) => {
      let rows: FoodVariantDetail[] = [
        {
          id: 'grams',
          food_id: 'saved-food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 200,
          protein: 10,
          carbs: 20,
          fat: 5,
        },
      ];
      mockSaveFoodAsync.mockResolvedValue({
        id: 'saved-food-1',
        name: 'Custom Meal Food',
        brand: 'Brand Co',
        is_custom: true,
        default_variant: rows[0],
      });
      mockPortionDraft = [{ name: 'packet', amount: 150, unit: 'g' }];
      mockEquivalentDraft = [
        { serving_size: 1, serving_unit: 'serving' },
        { serving_size: 1, serving_unit: 'piece' },
      ];
      let failPiece = true;
      jest.mocked(fetchFoodVariants).mockImplementation(async () => rows);
      jest.mocked(createFoodVariant).mockImplementation(async (payload) => {
        if (payload.serving_unit === 'piece' && failPiece)
          throw new Error('offline');
        const row = { ...payload, id: payload.serving_unit };
        rows = [...rows, row];
        return row;
      });
      jest.mocked(updateFoodVariant).mockImplementation(async (id, payload) => {
        const row = { ...payload, id };
        rows = rows.map((current) => (current.id === id ? row : current));
        return row;
      });
      jest.mocked(deleteFoodVariant).mockImplementation(async (id) => {
        rows = rows.filter((row) => row.id !== id);
        return {};
      });
      const screen = renderScreen({
        mode: 'create-food',
        pickerMode: 'library',
      });
      fireEvent.press(screen.getByText('Apply Portion Fixture'));
      fireEvent.press(screen.getByText('Apply Equivalent Fixture'));
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() =>
        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            text1: 'Could not save all portions. Try saving again.',
          })
        )
      );
      mockSubmittedFoodFormData = {
        ...mockSubmittedFoodFormData,
        calories: '400',
      };
      if (action === 'remove') {
        mockEquivalentDraft = [{ serving_size: 1, serving_unit: 'piece' }];
        fireEvent.press(screen.getByText('Apply Equivalent Fixture'));
      }
      failPiece = false;
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());
      expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
      if (action === 'remove')
        expect(rows.some((row) => row.serving_unit === 'serving')).toBe(false);
      else
        expect(
          rows.find((row) => row.serving_unit === 'serving')?.calories
        ).toBe(400);
    }
  );

  it.each(['packet', 'Packet'])(
    'preserves baseline %s and equivalent nutrition when creating another portion',
    async (name) => {
      const reference: FoodVariantDetail = {
        id: 'grams',
        food_id: 'food-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
      };
      const existingPortion: FoodVariantDetail = {
        ...reference,
        id: 'packet',
        serving_size: 1,
        serving_unit: `${name} (150 g)`,
        calories: 777,
        custom_nutrients: { iodine: 42 },
        source: 'imported',
        ai_confidence: null,
      };
      const existingEquivalent: FoodVariantDetail = {
        ...reference,
        id: 'serving',
        serving_size: 1,
        serving_unit: name === 'packet' ? 'serving' : 'Serving',
        calories: 888,
        custom_nutrients: { iodine: 84 },
        source: 'ai_estimate',
        ai_confidence: 'high',
      };
      let rows = [reference, existingPortion, existingEquivalent];
      mockSaveFoodAsync.mockResolvedValue({
        id: 'food-1',
        name: 'Custom Meal Food',
        brand: 'Brand Co',
        is_custom: true,
        default_variant: reference,
      });
      jest.mocked(fetchFoodVariants).mockImplementation(async () => rows);
      jest.mocked(createFoodVariant).mockImplementation(async (payload) => {
        const row = { ...payload, id: `variant-${rows.length}` };
        rows = [...rows, row];
        return row;
      });
      jest.mocked(updateFoodVariant).mockImplementation(async (id, payload) => {
        const row = { ...payload, id };
        rows = rows.map((current) => (current.id === id ? row : current));
        return row;
      });
      mockPortionDraft = [
        { name: 'packet', amount: 150, unit: 'g' },
        { name: 'bottle', amount: 200, unit: 'g' },
      ];
      mockEquivalentDraft = [{ serving_size: 1, serving_unit: 'serving' }];
      const screen = renderScreen({
        mode: 'create-food',
        pickerMode: 'library',
        barcode: '1234567890123',
      });
      fireEvent.press(screen.getByText('Apply Portion Fixture'));
      fireEvent.press(screen.getByText('Apply Equivalent Fixture'));
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());
      expect(rows).toHaveLength(4);
      expect(rows.find((row) => row.id === 'packet')).toEqual(existingPortion);
      expect(rows.find((row) => row.id === 'serving')).toEqual(
        existingEquivalent
      );
      expect(
        rows.find((row) => row.serving_unit === 'bottle (200 g)')
      ).toMatchObject({ food_id: 'food-1', calories: 400 });
      expect(new Set(rows.map((row) => row.food_id))).toEqual(
        new Set(['food-1'])
      );
      expect(updateFoodVariant).not.toHaveBeenCalled();
      expect(deleteFoodVariant).not.toHaveBeenCalled();
      expect(updateFoodEntriesSnapshot).not.toHaveBeenCalled();
    }
  );

  it('preserves unrelated existing variants when saving a barcode returns an existing food', async () => {
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      calories: '100',
    };
    const reference: FoodVariantDetail = {
      id: 'grams',
      food_id: 'saved-food-1',
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
    };
    const unrelated = [
      {
        ...reference,
        id: 'piece',
        serving_size: 1,
        serving_unit: 'piece',
        calories: 75,
      },
      {
        ...reference,
        id: 'bottle',
        serving_size: 1,
        serving_unit: 'bottle (500 ml)',
        calories: 500,
      },
    ];
    let rows: FoodVariantDetail[] = [reference, ...unrelated];
    mockSaveFoodAsync.mockResolvedValue({
      id: 'saved-food-1',
      name: 'Custom Meal Food',
      brand: 'Brand Co',
      is_custom: true,
      default_variant: reference,
    });
    mockPortionDraft = [{ name: 'packet', amount: 150, unit: 'g' }];
    jest.mocked(fetchFoodVariants).mockImplementation(async () => rows);
    jest.mocked(createFoodVariant).mockImplementation(async (payload) => {
      const row = { ...payload, id: 'packet' };
      rows = [...rows, row];
      return row;
    });
    jest.mocked(deleteFoodVariant).mockImplementation(async (id) => {
      rows = rows.filter((row) => row.id !== id);
      return {};
    });
    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'library',
      barcode: '1234567890123',
    });
    fireEvent.press(screen.getByText('Apply Portion Fixture'));
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());
    expect(rows).toHaveLength(4);
    expect(rows.find((row) => row.id === 'packet')?.calories).toBe(300);
    expect(
      rows.filter((row) => unrelated.some((original) => original.id === row.id))
    ).toEqual(unrelated);
  });

  it('saves a custom food, stores a pending ingredient draft, and pops back in meal-builder mode', async () => {
    mockSaveFoodAsync.mockResolvedValue({
      id: 'saved-food-1',
      name: 'Custom Meal Food',
      brand: 'Brand Co',
      is_custom: true,
      default_variant: {
        id: 'saved-variant-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
      },
    });

    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
      returnDepth: 2,
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockSetPendingMealIngredientSelection).toHaveBeenCalledWith({
      ingredient: expect.objectContaining({
        food_id: 'saved-food-1',
        variant_id: 'saved-variant-1',
        quantity: 100,
        unit: 'g',
      }),
    });
    expect(mockAddEntry).not.toHaveBeenCalled();
    expect(navigation.dispatch).toHaveBeenCalledWith({
      type: 'POP',
      payload: { count: 2 },
    });
  });

  it('saves a custom food and returns it to the meal-plan editor', async () => {
    mockSaveFoodAsync.mockResolvedValue({
      id: 'saved-food-1',
      name: 'Custom Meal Food',
      brand: 'Brand Co',
      is_custom: true,
      default_variant: {
        id: 'saved-variant-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
      },
    });
    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-plan',
      returnDepth: 2,
      mealPlanTarget: {
        dayOfWeek: 3,
        mealTypeId: 'lunch',
        mealTypeName: 'Lunch',
        assignmentIndex: 2,
      },
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() =>
      expect(mockSetPendingMealPlanSelection).toHaveBeenCalledWith({
        assignmentIndex: 2,
        assignment: expect.objectContaining({
          item_type: 'food',
          day_of_week: 3,
          meal_type_id: 'lunch',
          food_id: 'saved-food-1',
          variant_id: 'saved-variant-1',
          quantity: 100,
          unit: 'g',
          nutrition: {
            servingSize: 100,
            calories: 200,
            protein: 10,
            carbs: 20,
            fat: 5,
          },
        }),
      })
    );
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('hands a new food back to the NFC tag form instead of logging it', async () => {
    consumePendingActionTagSelection();
    mockSaveFoodAsync.mockResolvedValue({
      id: 'saved-food-1',
      name: 'Custom Meal Food',
      brand: 'Brand Co',
      is_custom: true,
      default_variant: {
        id: 'saved-variant-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
      },
    });
    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'action-tag',
      returnDepth: 2,
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() =>
      expect(mockNavigation.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'POP' })
      )
    );
    expect(consumePendingActionTagSelection()).toEqual({
      kind: 'food',
      foodId: 'saved-food-1',
      variantId: 'saved-variant-1',
      name: 'Custom Meal Food',
      quantity: 100,
      unit: 'g',
    });
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('links a new food to the water container instead of logging it', async () => {
    consumePendingContainerLinkSelection();
    mockSaveFoodAsync.mockResolvedValue({
      id: 'saved-food-1',
      name: 'Custom Meal Food',
      brand: 'Brand Co',
      is_custom: true,
      default_variant: {
        id: 'saved-variant-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
      },
    });
    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'container-link',
      returnDepth: 2,
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() =>
      expect(consumePendingContainerLinkSelection()).toEqual({
        foodId: 'saved-food-1',
        variantId: 'saved-variant-1',
        foodName: 'Custom Meal Food',
        quantity: 100,
      })
    );
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('keeps the normal save-and-log flow outside meal-builder mode and pops to top on success', async () => {
    const screen = renderScreen({
      mode: 'create-food',
      date: '2026-04-23',
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockAddEntry).toHaveBeenCalledWith({
        saveFoodPayload: expect.objectContaining({
          name: 'Custom Meal Food',
          brand: 'Brand Co',
          serving_size: 100,
          serving_unit: 'g',
          is_custom: true,
          is_quick_food: false,
          is_default: true,
          barcode: null,
          provider_type: null,
        }),
        createEntryPayload: {
          meal_type_id: 'meal-1',
          quantity: 100,
          unit: 'g',
          entry_date: '2026-04-23',
          entry_time: null,
        },
      });
    });
    expect(mockInvalidateCache).toHaveBeenCalledWith('2026-04-23');
    expect(navigation.dispatch).toHaveBeenCalledWith({ type: 'POP_TO_TOP' });
    expect(mockSetPendingMealIngredientSelection).not.toHaveBeenCalled();
  });

  it('hides the logging block and the barcode field in meal-builder mode', () => {
    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
      barcode: '0123456789',
    });

    expect(screen.queryByText('Date')).toBeNull();
    expect(screen.queryByText('Meal')).toBeNull();
    expect(screen.queryByText('Save to Database')).toBeNull();
    expect(screen.queryByText('Barcode')).toBeNull();
    expect(screen.queryByText('Scan with camera')).toBeNull();
    expect(screen.queryByTestId('calendar-sheet')).toBeNull();
  });

  it('renders the logging controls and the barcode field with a pre-filled value in normal mode', () => {
    const screen = renderScreen({
      mode: 'create-food',
      barcode: '0123456789',
    });

    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Meal')).toBeTruthy();
    expect(screen.getByText('Time')).toBeTruthy();
    expect(screen.getByText('Save to Database')).toBeTruthy();
    expect(screen.getByText('Barcode')).toBeTruthy();
    expect(screen.getByText('Scan with camera')).toBeTruthy();
    expect(screen.getByDisplayValue('0123456789')).toBeTruthy();
    expect(screen.getByText(/100 g per serving/)).toBeTruthy();
    expect(screen.getByTestId('calendar-sheet')).toBeTruthy();
    expect(screen.getByTestId('time-sheet')).toBeTruthy();
  });

  it('pre-fills entry time for today and passes it when logging a new food', async () => {
    const screen = renderScreen({
      mode: 'create-food',
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockAddEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          createEntryPayload: expect.objectContaining({
            entry_time: expect.stringMatching(/^([01]\d|2[0-3]):[0-5]\d$/),
          }),
        })
      );
    });
  });

  it('respects mealTypeId passed in navigation params', async () => {
    mockUseMealTypes.mockReturnValue({
      mealTypes: [
        {
          id: 'meal-1',
          name: 'Breakfast',
          default_time: '08:00',
          user_id: null,
          is_visible: true,
          created_at: '',
          updated_at: '',
          display_order: 1,
        },
        {
          id: 'meal-2',
          name: 'Lunch',
          default_time: '12:30',
          user_id: null,
          is_visible: true,
          created_at: '',
          updated_at: '',
          display_order: 2,
        },
      ],
      defaultMealTypeId: 'meal-1',
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = renderScreen({
      mode: 'create-food',
      mealTypeId: 'meal-2',
      date: '2000-01-01',
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockAddEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          createEntryPayload: expect.objectContaining({
            meal_type_id: 'meal-2',
            entry_time: '12:30',
          }),
        })
      );
    });
  });

  it('falls back to defaultMealTypeId if passed mealTypeId is not in visible mealTypes', async () => {
    mockUseMealTypes.mockReturnValue({
      mealTypes: [
        {
          id: 'meal-1',
          name: 'Breakfast',
          default_time: '08:00',
          user_id: null,
          is_visible: true,
          created_at: '',
          updated_at: '',
          display_order: 1,
        },
      ],
      defaultMealTypeId: 'meal-1',
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = renderScreen({
      mode: 'create-food',
      mealTypeId: 'hidden-meal',
      date: '2000-01-01',
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockAddEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          createEntryPayload: expect.objectContaining({
            meal_type_id: 'meal-1',
            entry_time: '08:00',
          }),
        })
      );
    });
  });

  it('preserves route-provided mealTypeId and notifies user while meal types are loading', async () => {
    mockUseMealTypes.mockReturnValue({
      mealTypes: [],
      defaultMealTypeId: null,
      isLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = renderScreen({
      mode: 'create-food',
      mealTypeId: 'meal-2',
      date: '2000-01-01',
    });

    fireEvent.press(screen.getByText('Add Food'));

    expect(mockToast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        text1: 'Loading...',
      })
    );
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('notifies user and blocks save when meal types lookup fails', async () => {
    mockUseMealTypes.mockReturnValue({
      mealTypes: [],
      defaultMealTypeId: null,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch: jest.fn(),
    });

    const screen = renderScreen({
      mode: 'create-food',
      mealTypeId: 'meal-2',
      date: '2000-01-01',
    });

    fireEvent.press(screen.getByText('Add Food'));

    expect(mockToast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        text1: 'Error',
      })
    );
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('allows save when background meal-types refetch errors but cached meal exists', async () => {
    mockUseMealTypes.mockReturnValue({
      mealTypes: [
        {
          id: 'meal-1',
          name: 'Breakfast',
          default_time: '08:00',
          user_id: null,
          is_visible: true,
          created_at: '',
          updated_at: '',
          display_order: 1,
        },
      ],
      defaultMealTypeId: 'meal-1',
      isLoading: false,
      isError: true,
      error: new Error('Background refetch error'),
      refetch: jest.fn(),
    });

    const screen = renderScreen({
      mode: 'create-food',
      mealTypeId: 'meal-1',
      date: '2000-01-01',
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockAddEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          createEntryPayload: expect.objectContaining({
            meal_type_id: 'meal-1',
            entry_time: '08:00',
          }),
        })
      );
    });
  });

  it('clears entry time when Clear is pressed', async () => {
    const screen = renderScreen({
      mode: 'create-food',
      entryTime: '14:30',
      date: '2000-01-01',
    });

    expect(screen.getByText('Clear')).toBeTruthy();
    fireEvent.press(screen.getByText('Clear'));
    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockAddEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          createEntryPayload: expect.objectContaining({
            entry_time: null,
          }),
        })
      );
    });
  });

  it('sets entry time to now when Now is pressed', async () => {
    const screen = renderScreen({
      mode: 'create-food',
      entryTime: '08:00',
      date: '2000-01-01',
    });

    fireEvent.press(screen.getByText('Now'));
    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockAddEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          createEntryPayload: expect.objectContaining({
            entry_time: expect.stringMatching(/^([01]\d|2[0-3]):[0-5]\d$/),
          }),
        })
      );
    });
  });

  it('renders the barcode field in library mode without the logging controls', () => {
    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'library',
    });

    expect(screen.queryByText('Date')).toBeNull();
    expect(screen.queryByText('Save to Database')).toBeNull();
    expect(screen.getByText('Barcode')).toBeTruthy();
    expect(screen.getByText('Scan with camera')).toBeTruthy();
  });

  it('saves a typed barcode with the new food in library mode', async () => {
    mockSaveFoodAsync.mockResolvedValue({ id: 'lib-food-1' });

    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'library',
    });

    fireEvent.changeText(
      screen.getByPlaceholderText('012345678905'),
      '0123456789012'
    );
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      // Second argument is the optional image payload — undefined when the
      // user added no photos, which keeps the request plain JSON.
      expect(mockSaveFoodAsync).toHaveBeenCalledWith(
        expect.objectContaining({ barcode: '0123456789012' }),
        undefined
      );
    });
  });

  it('blocks save and toasts when the barcode is not 8-14 digits', () => {
    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'library',
    });

    fireEvent.changeText(screen.getByPlaceholderText('012345678905'), '12345');
    fireEvent.press(screen.getByText('Save'));

    expect(mockSaveFoodAsync).not.toHaveBeenCalled();
    expect(mockToast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', text1: 'Invalid barcode' })
    );
  });

  it('navigates to FoodScan in capture-barcode mode when Scan with camera is pressed', () => {
    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'library',
    });

    fireEvent.press(screen.getByText('Scan with camera'));

    expect(navigation.navigate).toHaveBeenCalledWith('FoodScan', {
      mode: 'capture-barcode',
      returnKey: 'FoodForm-key',
    });
  });

  it('enables auto scale for meal-builder and adjust-nutrition flows only', () => {
    renderScreen({
      mode: 'create-food',
      barcode: '0123456789',
    });

    const createModeCall =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(createModeCall?.showAutoScaleNutrition).toBe(false);

    renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
    });

    const mealBuilderCall =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(mealBuilderCall?.showAutoScaleNutrition).toBe(true);
    expect(mealBuilderCall?.initialAutoScaleNutritionEnabled).toBe(false);

    renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
    });

    const adjustModeCall =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(adjustModeCall?.showAutoScaleNutrition).toBe(true);
    expect(adjustModeCall?.initialAutoScaleNutritionEnabled).toBe(false);
    expect(adjustModeCall?.submitLabel).toBe('Save');
  });

  it('passes a true auto-scale default through when the shared preference is enabled', () => {
    mockUsePreferences.mockReturnValue({
      preferences: {
        auto_scale_online_imports: true,
      } as any,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
    });

    const mealBuilderCall =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(mealBuilderCall?.showAutoScaleNutrition).toBe(true);
    expect(mealBuilderCall?.initialAutoScaleNutritionEnabled).toBe(true);

    renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
    });

    const adjustModeCall =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(adjustModeCall?.showAutoScaleNutrition).toBe(true);
    expect(adjustModeCall?.initialAutoScaleNutritionEnabled).toBe(true);
  });

  it('keeps auto scale off until shared preferences finish loading', () => {
    mockUsePreferences.mockReturnValue({
      preferences: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
    });

    const mealBuilderCall =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(mealBuilderCall?.showAutoScaleNutrition).toBe(true);
    expect(mealBuilderCall?.initialAutoScaleNutritionEnabled).toBe(false);

    renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
    });

    const adjustModeCall =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(adjustModeCall?.showAutoScaleNutrition).toBe(true);
    expect(adjustModeCall?.initialAutoScaleNutritionEnabled).toBe(false);
  });

  it('passes unit selection through the adjust nutrition return flow', async () => {
    mockCreateVariant.mockResolvedValue({
      id: 'variant-oz',
      food_id: 'food-1',
      serving_size: 100,
      serving_unit: 'oz',
      calories: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
    });
    // Mimic FoodForm's behavior of updating form.servingUnit after the user
    // picks a different unit in the selector.
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      servingUnit: 'oz',
    };

    const screen = renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
      foodId: 'food-1',
      variantId: 'variant-1',
      customNutrients: null,
      availableUnitVariants: [
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
      selectedUnitSelection: {
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
    });

    fireEvent.press(screen.getByText('Select Converted Unit'));
    // Variant creation is deferred until submit.
    expect(mockCreateVariant).not.toHaveBeenCalled();

    // Phase F: "Save nutrition for future use" gates the variant POST in
    // adjust-entry-nutrition mode. Toggle it ON to keep the variant-creation
    // pathway under test; the no-toggle case has its own test below.
    fireEvent(
      screen.getByLabelText('Save nutrition for future use'),
      'valueChange',
      true
    );
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockCreateVariant).toHaveBeenCalledWith(
        expect.objectContaining({
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'oz',
          calories: 200,
          protein: 10,
          carbs: 20,
          fat: 5,
        })
      );
    });

    expect(navigation.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          params: {
            adjustedValues: mockSubmittedFoodFormData,
            adjustedUnitSelection: {
              kind: 'existing',
              variant: expect.objectContaining({
                id: 'variant-oz',
                serving_unit: 'oz',
              }),
            },
            // The picked unit's variant has no custom nutrients, so none carry over.
            adjustedCustomNutrients: {},
          },
        },
        source: 'FoodEntryAdd-key',
      })
    );
  });

  it('ignores a second save press while adjust-nutrition writes are in flight', async () => {
    let resolveCreate: (variant: unknown) => void;
    mockCreateVariant.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      servingUnit: 'oz',
    };

    const screen = renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
      foodId: 'food-1',
      variantId: 'variant-1',
      customNutrients: null,
      availableUnitVariants: [
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
      selectedUnitSelection: {
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
    });

    fireEvent.press(screen.getByText('Select Converted Unit'));
    fireEvent(
      screen.getByLabelText('Save nutrition for future use'),
      'valueChange',
      true
    );

    fireEvent.press(screen.getByText('Save'));
    fireEvent.press(screen.getByText('Save'));

    // The second press must not start a second variant POST.
    expect(mockCreateVariant).toHaveBeenCalledTimes(1);

    resolveCreate!({
      id: 'variant-oz',
      food_id: 'food-1',
      serving_size: 100,
      serving_unit: 'oz',
      calories: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
    });

    await waitFor(() => {
      expect(navigation.dispatch).toHaveBeenCalledTimes(1);
    });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockCreateVariant).toHaveBeenCalledTimes(1);
  });

  it('defers local manual-only unit creation until submit', async () => {
    mockUnitSelectionResult = {
      kind: 'draft',
      variant: {
        serving_size: 1,
        serving_unit: 'cup',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
      requiresNutritionUpdate: true,
    };
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      servingSize: '1',
      servingUnit: 'cup',
      calories: '45',
      protein: '4',
      carbs: '6',
      fat: '1',
    };
    mockCreateVariant.mockResolvedValue({
      id: 'variant-cup',
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'cup',
      calories: 45,
      protein: 4,
      carbs: 6,
      fat: 1,
    });

    const screen = renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
      foodId: 'food-1',
      variantId: 'variant-1',
      customNutrients: null,
      availableUnitVariants: [
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
      selectedUnitSelection: {
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
    });

    fireEvent.press(screen.getByText('Select Converted Unit'));
    expect(mockCreateVariant).not.toHaveBeenCalled();

    // Phase F: variant POST gated on the "Save nutrition for future use"
    // toggle in adjust-entry-nutrition mode. Flip it ON to keep the
    // create-variant pathway under test.
    fireEvent(
      screen.getByLabelText('Save nutrition for future use'),
      'valueChange',
      true
    );
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockCreateVariant).toHaveBeenCalledWith({
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'cup',
        calories: 45,
        protein: 4,
        carbs: 6,
        fat: 1,
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
        custom_nutrients: {},
        source: undefined,
        ai_confidence: undefined,
      });
    });

    expect(navigation.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          params: {
            adjustedValues: mockSubmittedFoodFormData,
            adjustedUnitSelection: {
              kind: 'existing',
              variant: expect.objectContaining({
                id: 'variant-cup',
                serving_unit: 'cup',
              }),
            },
            adjustedCustomNutrients: {},
          },
        },
        source: 'FoodEntryAdd-key',
      })
    );
  });

  // Phase F6 regression: the AI / manual unit-conversion draft persists as a
  // food_variants row ONLY when the user explicitly opts to "save for future
  // use" in the adjust-entry-nutrition flow. The entry itself still records
  // the chosen unit + nutrition inline.
  it('skips the variant POST in adjust-entry-nutrition mode when the save-for-future-use toggle is off', async () => {
    mockUnitSelectionResult = {
      kind: 'draft',
      variant: {
        serving_size: 1,
        serving_unit: 'cup',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
      requiresNutritionUpdate: true,
    };
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      servingSize: '1',
      servingUnit: 'cup',
      calories: '45',
      protein: '4',
      carbs: '6',
      fat: '1',
    };

    const screen = renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
      foodId: 'food-1',
      variantId: 'variant-1',
      customNutrients: null,
      availableUnitVariants: [
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
      selectedUnitSelection: {
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
    });

    fireEvent.press(screen.getByText('Select Converted Unit'));
    // Toggle stays OFF — default state. No need to interact with it.
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(navigation.dispatch).toHaveBeenCalled();
    });
    // The defining assertion: no variant POST when the toggle is off.
    expect(mockCreateVariant).not.toHaveBeenCalled();
    // Draft unit selection still propagates back so the caller can display
    // the correct unit/nutrition ??? callers handle draft vs existing safely.
    expect(navigation.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          params: expect.objectContaining({
            adjustedUnitSelection: expect.objectContaining({ kind: 'draft' }),
          }),
        }),
      })
    );
  });

  it('blocks submit when the name is missing', () => {
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      name: '   ',
    };

    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
    });

    fireEvent.press(screen.getByText('Add Food'));

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Missing name',
      text2: 'Please enter a food name.',
    });
    expect(mockSaveFoodAsync).not.toHaveBeenCalled();
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('blocks submit when the serving size is invalid', () => {
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      servingSize: '0',
    };

    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
    });

    fireEvent.press(screen.getByText('Add Food'));

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Invalid serving size',
      text2: 'Serving size must be greater than zero.',
    });
    expect(mockSaveFoodAsync).not.toHaveBeenCalled();
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('enables the rich selector for imported create-food flows with a source serving', () => {
    renderScreen({
      mode: 'create-food',
      barcode: '0123456789',
      providerType: 'openfoodfacts',
      initialFood: {
        name: 'Imported Yogurt',
        brand: 'Brand Co',
        servingSize: '56',
        servingUnit: 'g',
        calories: '60',
        protein: '5',
        carbs: '7',
        fat: '1.5',
      },
    });

    const call =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(call?.unitSelector?.variants).toEqual([
      expect.objectContaining({
        id: '__create-form-source-variant__',
        serving_size: 56,
        serving_unit: 'g',
        calories: 60,
      }),
    ]);
  });

  it('keeps the plain grouped picker for blank manual create-food flows', () => {
    renderScreen({
      mode: 'create-food',
      pickerMode: 'library',
    });

    const call =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(call?.unitSelector).toBeUndefined();
  });

  it('enables the rich selector when editing a saved local food', () => {
    mockUseFoodVariants.mockReturnValue({
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
      ] as any,
      isLoading: false,
      isError: false,
    });

    renderScreen({
      mode: 'edit-food',
      item: {
        id: 'food-1',
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: 100,
        servingUnit: 'g',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
        source: 'local',
        originalItem: {} as any,
      },
      initialValues: {
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
      },
      returnKey: 'FoodDetail-key',
      foodId: 'food-1',
      variantId: 'variant-1',
      customNutrients: null,
    });

    const call =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(call?.unitSelector?.variants).toEqual([
      expect.objectContaining({
        id: 'variant-1',
        serving_unit: 'g',
      }),
    ]);
  });

  it('passes an incompatible draft selection through the unit selector in adjust mode', () => {
    renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
      availableUnitVariants: [
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
      selectedUnitSelection: {
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
    });

    const call =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(call?.unitSelector?.selectedSelection).toEqual(
      expect.objectContaining({
        kind: 'draft',
        requiresNutritionUpdate: true,
      })
    );
  });

  it('returns the newly selected saved variant to the detail screen without mutating it', async () => {
    mockUnitSelectionResult = {
      kind: 'existing',
      variant: {
        id: 'variant-2',
        food_id: 'food-1',
        serving_size: 2,
        serving_unit: 'cup',
        calories: 200,
        protein: 30,
        carbs: 12,
        fat: 0,
      },
    };
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      name: 'Greek Yogurt',
      brand: 'Brand Co',
      servingSize: '2',
      servingUnit: 'cup',
      calories: '200',
      protein: '30',
      carbs: '12',
      fat: '0',
    };

    mockUseFoodVariants.mockReturnValue({
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
        {
          id: 'variant-2',
          food_id: 'food-1',
          serving_size: 2,
          serving_unit: 'cup',
          calories: 200,
          protein: 30,
          carbs: 12,
          fat: 0,
        },
      ] as any,
      isLoading: false,
      isError: false,
    });

    const screen = renderScreen({
      mode: 'edit-food',
      item: {
        id: 'food-1',
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: 100,
        servingUnit: 'g',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
        source: 'local',
        originalItem: {} as any,
      },
      initialValues: {
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
      },
      returnKey: 'FoodDetail-key',
      foodId: 'food-1',
      variantId: 'variant-1',
      customNutrients: { omega3: 1 },
    });

    fireEvent.press(screen.getByText('Select Converted Unit'));
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(navigation.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: {
            params: expect.objectContaining({
              updatedSelectedVariantId: 'variant-2',
              updatedItem: expect.objectContaining({
                variantId: 'variant-2',
                calories: 200,
                servingSize: 2,
                servingUnit: 'cup',
              }),
            }),
          },
          source: 'FoodDetail-key',
        })
      );
    });
    expect(mockCreateVariant).not.toHaveBeenCalled();
  });

  it('asks before touching past diary entries, and leaves them alone by default', async () => {
    // Diary entries hold a nutrition snapshot from when they were logged, so a
    // library edit must not silently rewrite history. Prompted on every save,
    // matching web, because one form saves nutrition, name, brand and photo
    // together.
    const alertSpy = answerSyncPrompt('keep');
    mockUseFoodVariants.mockReturnValue({
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
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as any);
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      name: 'Greek Yogurt',
      brand: 'Brand Co',
      servingSize: '100',
      servingUnit: 'g',
      calories: '999',
      protein: '10',
      carbs: '8',
      fat: '4',
    };

    const screen = renderScreen({
      mode: 'edit-food',
      item: {
        id: 'food-1',
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: 100,
        servingUnit: 'g',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
        source: 'local',
        originalItem: {},
      },
      initialValues: {
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
      },
      returnKey: 'FoodDetail-key',
      foodId: 'food-1',
      variantId: 'variant-1',
    });

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(navigation.goBack).toHaveBeenCalled();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Update past entries?',
      expect.any(String),
      expect.any(Array),
      expect.any(Object)
    );
    // Declining must leave history untouched.
    expect(updateFoodEntriesSnapshot).not.toHaveBeenCalled();
  });

  it('syncs past entries only when the user opts in', async () => {
    answerSyncPrompt('update');
    mockUseFoodVariants.mockReturnValue({
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
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as any);
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      name: 'Greek Yogurt',
      brand: 'Brand Co',
      servingSize: '100',
      servingUnit: 'g',
      calories: '999',
      protein: '10',
      carbs: '8',
      fat: '4',
    };

    const screen = renderScreen({
      mode: 'edit-food',
      item: {
        id: 'food-1',
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: 100,
        servingUnit: 'g',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
        source: 'local',
        originalItem: {},
      },
      initialValues: {
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
      },
      returnKey: 'FoodDetail-key',
      foodId: 'food-1',
      variantId: 'variant-1',
    });

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      // Nutrition-only: this save left the food's photos alone, so the
      // prompt never offered to touch entry photos and must not sync them.
      expect(updateFoodEntriesSnapshot).toHaveBeenCalledWith(
        'food-1',
        undefined,
        false
      );
    });
  });

  function buildEquivalentEditParams(count: number) {
    const variants = Array.from({ length: count + 1 }, (_, index) => ({
      id: `variant-${index}`,
      food_id: 'food-1',
      serving_size: index === 0 ? 100 : index + 1,
      serving_unit: index === 0 ? 'g' : `unit-${index}`,
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
      is_default: index === 0,
    }));
    mockUseFoodVariants.mockReturnValue({
      variants: variants as any,
      isLoading: false,
      isError: false,
    });
    mockEquivalentDraft = variants.slice(1).map((variant: any, index) => ({
      ...variant,
      serving_size: variant.serving_size + 0.5 + index,
    }));
    return {
      mode: 'edit-food',
      item: {
        id: 'food-1',
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: 100,
        servingUnit: 'g',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
        source: 'local',
        originalItem: {} as any,
      },
      initialValues: {
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
      },
      returnKey: 'FoodDetail-key',
      foodId: 'food-1',
      variantId: 'variant-0',
      customNutrients: null,
    };
  }

  it.each([
    ['en', 0],
    ['en', 1],
    ['en', 2],
    ['pl', 0],
    ['pl', 1],
    ['pl', 2],
    ['pl', 5],
    ['pl', 22],
    ['pl', 25],
  ])(
    'uses the real EditFood save path for %s with %i changed equivalent rows',
    async (language, count) => {
      const normalizedLanguage = language as 'en' | 'pl';
      const expected =
        normalizedLanguage === 'en'
          ? count === 0
            ? 'Saved'
            : `Saved · ${count} equivalent ${count === 1 ? 'unit' : 'units'} updated`
          : count === 0
            ? 'Zapisano'
            : count === 1
              ? 'Zapisano · zaktualizowano 1 równoważną jednostkę'
              : [2, 22].includes(count)
                ? `Zapisano · zaktualizowano ${count} równoważne jednostki`
                : `Zapisano · zaktualizowano ${count} równoważnych jednostek`;
      await act(async () => {
        await i18n.changeLanguage(normalizedLanguage);
      });
      const screen = renderScreen(buildEquivalentEditParams(count));
      if (count > 0) {
        await act(async () => {
          fireEvent.press(screen.getByText('Apply Equivalent Fixture'));
        });
      }
      await act(async () => {
        fireEvent.press(screen.getByText('Save'));
      });
      await waitFor(() =>
        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'success',
          text1: expected,
        })
      );
      screen.unmount();
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  );

  it('refuses to save edit-food submissions while the variants query is still loading', async () => {
    mockUseFoodVariants.mockReturnValue({
      variants: undefined,
      isLoading: true,
      isError: false,
    });
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      name: 'Greek Yogurt',
      brand: 'Brand Co',
      servingSize: '100',
      servingUnit: 'g',
      calories: '120',
      protein: '10',
      carbs: '8',
      fat: '4',
    };

    const screen = renderScreen({
      mode: 'edit-food',
      item: {
        id: 'food-1',
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: 100,
        servingUnit: 'g',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
        source: 'local',
        originalItem: {} as any,
      },
      initialValues: {
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
      },
      returnKey: 'FoodDetail-key',
      foodId: 'food-1',
      variantId: 'variant-1',
    });

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockToast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      );
    });
    expect(mockCreateVariant).not.toHaveBeenCalled();
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });
});
