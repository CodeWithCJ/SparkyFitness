import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodEntryViewScreen from '../../src/screens/FoodEntryViewScreen';
import { useProfile } from '../../src/hooks/useProfile';
import { useMealTypes } from '../../src/hooks';
import { useFoodVariants } from '../../src/hooks/useFoodVariants';
import { useUpdateFoodEntry } from '../../src/hooks/useUpdateFoodEntry';
import { useDeleteFoodEntry } from '../../src/hooks/useDeleteFoodEntry';

jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: jest.fn(),
}));

jest.mock('../../src/hooks', () => ({
  useMealTypes: jest.fn(),
}));

jest.mock('../../src/hooks/useFoodVariants', () => ({
  useFoodVariants: jest.fn(),
}));

jest.mock('../../src/hooks/useUpdateFoodEntry', () => ({
  useUpdateFoodEntry: jest.fn(),
}));

jest.mock('../../src/hooks/useDeleteFoodEntry', () => ({
  useDeleteFoodEntry: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => <View testID={`icon-${props.name}`} />,
  };
});

jest.mock('../../src/components/BottomSheetPicker', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View />,
  };
});

jest.mock('../../src/components/CalendarSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((_p: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ present: jest.fn() }));
      return <View />;
    }),
  };
});

const mockUseProfile = useProfile as jest.MockedFunction<typeof useProfile>;
const mockUseMealTypes = useMealTypes as jest.MockedFunction<typeof useMealTypes>;
const mockUseFoodVariants = useFoodVariants as jest.MockedFunction<typeof useFoodVariants>;
const mockUseUpdateFoodEntry = useUpdateFoodEntry as jest.MockedFunction<typeof useUpdateFoodEntry>;
const mockUseDeleteFoodEntry = useDeleteFoodEntry as jest.MockedFunction<typeof useDeleteFoodEntry>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

describe('FoodEntryViewScreen', () => {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    replace: jest.fn(),
  } as any;

  const baseEntry = {
    id: 'entry-1',
    food_id: 'food-1',
    user_id: 'user-1',
    meal_type: 'breakfast',
    meal_type_id: 'mt-1',
    quantity: 1,
    unit: 'cup',
    variant_id: 'variant-1',
    food_name: 'Greek Yogurt',
    brand_name: 'Sparky',
    entry_date: '2026-05-15',
    serving_size: 1,
    serving_unit: 'cup',
    calories: 100,
    protein: 15,
    carbs: 6,
    fat: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProfile.mockReturnValue({ profile: { id: 'user-1' } as any, isLoading: false, isError: false, refetch: jest.fn() } as any);
    mockUseMealTypes.mockReturnValue({
      mealTypes: [{ id: 'mt-1', name: 'breakfast', is_visible: true, sort_order: 1 }] as any,
      defaultMealTypeId: 'mt-1',
      isLoading: false,
      isError: false,
    });
    mockUseFoodVariants.mockReturnValue({
      variants: [],
      isLoading: false,
      isError: false,
    } as any);
    mockUseUpdateFoodEntry.mockReturnValue({
      updateEntry: jest.fn(),
      isPending: false,
      invalidateCache: jest.fn(),
    });
    mockUseDeleteFoodEntry.mockReturnValue({
      confirmAndDelete: jest.fn(),
      deleteEntry: jest.fn(),
      isPending: false,
      invalidateCache: jest.fn(),
    });
  });

  const renderScreen = (entry: any) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodEntryViewScreen
          navigation={navigation}
          route={{ key: 'k', name: 'FoodEntryView', params: { entry } } as any}
        />
      </SafeAreaProvider>,
    );

  it('redirects to EditLoggedMeal when the entry has food_entry_meal_id', () => {
    renderScreen({ ...baseEntry, food_entry_meal_id: 'fem-99' });
    expect(navigation.replace).toHaveBeenCalledWith('EditLoggedMeal', { foodEntryMealId: 'fem-99' });
  });

  it('does not redirect for a standalone food entry', () => {
    renderScreen(baseEntry);
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
