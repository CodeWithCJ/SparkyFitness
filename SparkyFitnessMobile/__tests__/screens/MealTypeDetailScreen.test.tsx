import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import MealTypeDetailScreen from '../../src/screens/MealTypeDetailScreen';
import { useDailySummary, useServerConnection, useMealTypes } from '../../src/hooks';
import { usePreferences } from '../../src/hooks/usePreferences';
import { useCopyFoodEntries } from '../../src/hooks/useCopyFoodEntries';
import type { FoodEntry } from '../../src/types/foodEntries';
import type { MealType } from '../../src/types/mealTypes';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'MealTypeDetail'>;

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
} as unknown as ScreenProps['navigation'];

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

jest.mock('../../src/hooks', () => ({
  useDailySummary: jest.fn(),
  useServerConnection: jest.fn(),
  useMealTypes: jest.fn(),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));

jest.mock('../../src/hooks/useCopyFoodEntries', () => ({
  useCopyFoodEntries: jest.fn(),
}));

jest.mock('../../src/hooks/useScreenHeader', () => {
  const ReactModule = require('react');
  const { Pressable } = require('react-native');
  return {
    useScreenHeader: (config: {
      right?: { accessibilityLabel?: string; onPress?: () => void } | { accessibilityLabel?: string; onPress?: () => void }[];
    }) => {
      const items = Array.isArray(config.right)
        ? config.right
        : config.right
          ? [config.right]
          : [];
      return ReactModule.createElement(
        ReactModule.Fragment,
        null,
        items.map((item, i) =>
          ReactModule.createElement(Pressable, {
            key: i,
            accessibilityLabel: item.accessibilityLabel,
            onPress: item.onPress,
          }),
        ),
      );
    },
  };
});

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/components/ServingAdjustSheet', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(() => <View testID="serving-sheet" />),
  };
});

jest.mock('../../src/components/CopyMealSheet', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
      ReactModule.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return <View testID="copy-sheet" />;
    }),
  };
});

jest.mock('../../src/components/FoodNutritionSummary', () => {
  const { Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name?: string }) => (
      <View testID="nutrition-summary">
        <Text>{name}</Text>
      </View>
    ),
  };
});

jest.mock('../../src/components/SwipeableFoodRow', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="food-row" /> };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

const mockUseDailySummary = useDailySummary as jest.MockedFunction<typeof useDailySummary>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;
const mockUseMealTypes = useMealTypes as jest.MockedFunction<typeof useMealTypes>;
const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;
const mockUseCopyFoodEntries = useCopyFoodEntries as jest.MockedFunction<typeof useCopyFoodEntries>;

const mealTypes: MealType[] = [
  { id: 'sys-b', name: 'breakfast', sort_order: 0, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true },
  { id: 'custom-pw', name: 'Pre-Workout', sort_order: 0, user_id: 'user1', created_at: '', is_visible: true, show_in_quick_log: true },
  // A CUSTOM category deliberately named like a system type.
  { id: 'custom-d', name: 'dinner', sort_order: 2, user_id: 'user1', created_at: '', is_visible: true, show_in_quick_log: true },
];

const entry = (id: string, meal_type_id: string, meal_type: string): FoodEntry =>
  ({ id, meal_type_id, meal_type } as FoodEntry);

const setSummary = (foodEntries: FoodEntry[]) => {
  mockUseDailySummary.mockReturnValue({
    summary: {
      foodEntries,
      exerciseEntries: [],
      goals: null,
      calorieGoal: 0,
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as never);
};

const renderScreen = (params: ScreenProps['route']['params']) => {
  mockUseMealTypes.mockReturnValue({ mealTypes, defaultMealTypeId: 'sys-b' } as never);
  mockUseServerConnection.mockReturnValue({ isConnected: true, isLoading: false } as never);
  mockUsePreferences.mockReturnValue({ preferences: {}, isLoading: false } as never);
  mockUseCopyFoodEntries.mockReturnValue({ copyMeal: jest.fn(), isPending: false } as never);
  return render(
    <MealTypeDetailScreen
      navigation={mockNavigation}
      route={{ key: 'MealTypeDetail-key', name: 'MealTypeDetail', params }}
    />,
  );
};

describe('MealTypeDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSummary([entry('1', 'custom-pw', 'Pre-Workout'), entry('2', 'sys-b', 'breakfast')]);
  });

  it('filters entries by canonical meal type id and renders the literal custom label', () => {
    const view = renderScreen({ date: '2026-01-01', mealTypeId: 'custom-pw', mealType: 'Pre-Workout' });

    expect(view.getByText('Pre-Workout')).toBeTruthy();
    expect(view.getAllByTestId('food-row')).toHaveLength(1);
  });

  it('renders the localized system label when filtering a system type by id', () => {
    const view = renderScreen({ date: '2026-01-01', mealTypeId: 'sys-b', mealType: 'breakfast' });

    expect(view.getByText('Breakfast')).toBeTruthy();
    expect(view.getAllByTestId('food-row')).toHaveLength(1);
  });

  it('falls back to the literal historical name for a deleted type', () => {
    setSummary([entry('9', 'gone-id', 'Gone Meal')]);
    const view = renderScreen({
      date: '2026-01-01',
      mealTypeId: 'gone-id',
      mealType: 'Gone Meal',
      mealLabel: 'Gone Meal',
    });

    expect(view.getByText('Gone Meal')).toBeTruthy();
    expect(view.getAllByTestId('food-row')).toHaveLength(1);
  });

  it('resolves the label from the active type when only the id is passed', () => {
    const view = renderScreen({ date: '2026-01-01', mealTypeId: 'custom-pw' });

    expect(view.getByText('Pre-Workout')).toBeTruthy();
  });

  it('renders a custom type named dinner literally and filters by its id', () => {
    setSummary([
      entry('1', 'custom-d', 'dinner'),
      entry('2', 'sys-b', 'breakfast'),
    ]);
    const view = renderScreen({ date: '2026-01-01', mealTypeId: 'custom-d', mealType: 'dinner' });

    // Literal custom name — never the localized system "Kolacja"/"Dinner".
    expect(view.getByText('dinner')).toBeTruthy();
    expect(view.queryByText('Dinner')).toBeNull();
    expect(view.getAllByTestId('food-row')).toHaveLength(1);
  });

  it('Add Food header action navigates to FoodSearch preserving the canonical mealTypeId', () => {
    const view = renderScreen({ date: '2026-01-01', mealTypeId: 'custom-pw', mealType: 'Pre-Workout' });
    fireEvent.press(view.getByLabelText('Add Food'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('FoodSearch', {
      date: '2026-01-01',
      mealTypeId: 'custom-pw',
    });
  });

  it('Add Food never passes a stale hidden/deleted id (resolvedType missing -> no id)', () => {
    const view = renderScreen({ date: '2026-01-01', mealTypeId: 'gone-id', mealType: 'Old Custom' });
    fireEvent.press(view.getByLabelText('Add Food'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('FoodSearch', {
      date: '2026-01-01',
      mealTypeId: undefined,
    });
  });

});
