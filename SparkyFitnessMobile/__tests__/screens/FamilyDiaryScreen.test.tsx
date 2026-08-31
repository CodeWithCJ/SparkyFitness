import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFamilyDailySummary } from '../../src/hooks';
import FamilyDiaryScreen from '../../src/screens/FamilyDiaryScreen';
import { ApiError } from '../../src/services/api/errors';
import type { FoodEntry } from '../../src/types/foodEntries';
import type { FamilyDiaryUser } from '../../src/types/familyDiary';

const familyUser: FamilyDiaryUser = {
  userId: 'family-user-id',
  displayName: 'Alex Family',
  email: 'alex@example.test',
  canCopy: true,
  accessEndDate: null,
};

const pasta: FoodEntry = {
  id: 'pasta-id',
  food_id: 'pasta-food-id',
  meal_type: 'Dinner',
  meal_type_id: 'dinner-id',
  quantity: 150,
  unit: 'g',
  serving_size: 100,
  entry_date: '2026-08-23',
  food_name: 'Family Pasta',
  calories: 180,
  protein: 6,
  carbs: 32,
  fat: 3,
};

const sauce: FoodEntry = {
  ...pasta,
  id: 'sauce-id',
  food_id: 'sauce-food-id',
  food_name: 'Tomato Sauce',
  quantity: 50,
  calories: 40,
};

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  setOptions: jest.fn(),
};

const mockInvalidateQueries = jest.fn();

jest.mock('../../src/hooks', () => ({
  useFamilyDailySummary: jest.fn(),
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('../../src/components/DateNavigator', () => {
  const { Pressable, Text, View } = require('react-native');
  return ({
    title,
    selectedDate,
    onPreviousDay,
    onNextDay,
    onToday,
    onDatePress,
    dateControls,
  }: {
    title: string;
    selectedDate: string;
    onPreviousDay: () => void;
    onNextDay: () => void;
    onToday: () => void;
    onDatePress: () => void;
    dateControls: { previousDayLabel: string; nextDayLabel: string };
  }) => (
    <View>
      <Text>{title}</Text>
      <Text>{selectedDate}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dateControls.previousDayLabel}
        onPress={onPreviousDay}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dateControls.nextDayLabel}
        onPress={onNextDay}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Today"
        onPress={onToday}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open calendar"
        onPress={onDatePress}
      />
    </View>
  );
});

jest.mock('../../src/components/CalendarSheet', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return React.forwardRef(
    (
      {
        selectedDate,
        onSelectDate,
      }: {
        selectedDate: string;
        onSelectDate: (date: string) => void;
      },
      ref: unknown
    ) => {
      React.useImperativeHandle(ref, () => ({
        present: () => undefined,
        dismiss: () => undefined,
      }));
      return (
        <View>
          <Text>{`Calendar: ${selectedDate}`}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose August 24"
            onPress={() => onSelectDate('2026-08-24')}
          />
        </View>
      );
    }
  );
});

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: { defaultValue?: string; [name: string]: unknown }
    ) =>
      (options?.defaultValue ?? key).replace(
        /\{\{(\w+)\}\}/g,
        (match, name: string) => String(options?.[name] ?? match)
      ),
    i18n: { language: 'en-US' },
  }),
}));

const mockUseFamilyDailySummary = useFamilyDailySummary as jest.MockedFunction<
  typeof useFamilyDailySummary
>;

const renderFamilyDiary = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
      }}
    >
      <FamilyDiaryScreen
        navigation={navigation as never}
        route={{
          key: 'family-diary',
          name: 'FamilyDiary',
          params: { familyUser },
        }}
      />
    </SafeAreaProvider>
  );

describe('FamilyDiaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 23));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('shows every raw family component and opens its meal', () => {
    mockUseFamilyDailySummary.mockReturnValue({
      data: { foodEntries: [pasta, sauce] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as ReturnType<typeof useFamilyDailySummary>);

    const screen = renderFamilyDiary();

    expect(screen.getByText('Family Pasta')).toBeTruthy();
    expect(screen.getByText('Tomato Sauce')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Open Dinner meal'));

    expect(navigation.navigate).toHaveBeenCalledWith('FamilyMealDetail', {
      familyUser,
      sourceDate: '2026-08-23',
      mealTypeId: 'dinner-id',
      mealTypeName: 'Dinner',
      entries: [pasta, sauce],
    });
    expect(mockUseFamilyDailySummary).toHaveBeenLastCalledWith({
      familyUserId: 'family-user-id',
      date: '2026-08-23',
    });
  });

  test('updates the source-specific query when browsing days or selecting a calendar date', () => {
    mockUseFamilyDailySummary.mockReturnValue({
      data: { foodEntries: [] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as ReturnType<typeof useFamilyDailySummary>);

    const screen = renderFamilyDiary();

    fireEvent.press(screen.getByLabelText('Previous day'));
    expect(mockUseFamilyDailySummary).toHaveBeenLastCalledWith({
      familyUserId: 'family-user-id',
      date: '2026-08-22',
    });

    fireEvent.press(screen.getByLabelText('Next day'));
    expect(mockUseFamilyDailySummary).toHaveBeenLastCalledWith({
      familyUserId: 'family-user-id',
      date: '2026-08-23',
    });

    fireEvent.press(screen.getByLabelText('Open calendar'));
    fireEvent.press(screen.getByLabelText('Choose August 24'));
    expect(mockUseFamilyDailySummary).toHaveBeenLastCalledWith({
      familyUserId: 'family-user-id',
      date: '2026-08-24',
    });
  });

  test('shows an explicit loading state', () => {
    mockUseFamilyDailySummary.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: jest.fn(),
    } as ReturnType<typeof useFamilyDailySummary>);

    expect(renderFamilyDiary().getByText('Loading family diary…')).toBeTruthy();
  });

  test('uses an explicit date-specific empty state', () => {
    mockUseFamilyDailySummary.mockReturnValue({
      data: { foodEntries: [] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as ReturnType<typeof useFamilyDailySummary>);

    expect(
      renderFamilyDiary().getByText('No food entries for this date')
    ).toBeTruthy();
  });

  test('invalidates family users when access has been revoked', () => {
    const refetch = jest.fn();
    mockUseFamilyDailySummary.mockReturnValue({
      data: undefined,
      error: new ApiError('Forbidden', 403),
      isLoading: false,
      isError: true,
      refetch,
    } as ReturnType<typeof useFamilyDailySummary>);

    const screen = renderFamilyDiary();

    expect(screen.getByText('Family diary access unavailable')).toBeTruthy();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['familyDiaryUsers'],
    });
    fireEvent.press(screen.getByText('Retry'));
    fireEvent.press(screen.getByText('Back'));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
