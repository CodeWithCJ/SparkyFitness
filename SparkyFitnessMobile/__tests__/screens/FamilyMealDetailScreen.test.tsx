import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FamilyMealDetailScreen from '../../src/screens/FamilyMealDetailScreen';
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
  serving_size: 50,
  calories: 30,
  protein: 2,
  carbs: 6,
  fat: 1,
};

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  setOptions: jest.fn(),
};

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
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
  }),
}));

const renderMealDetail = ({
  canCopy = true,
  entries = [pasta, sauce],
}: {
  canCopy?: boolean;
  entries?: FoodEntry[];
} = {}) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
      }}
    >
      <FamilyMealDetailScreen
        navigation={navigation as never}
        route={{
          key: 'family-meal-detail',
          name: 'FamilyMealDetail',
          params: {
            familyUser: { ...familyUser, canCopy },
            sourceDate: '2026-08-23',
            mealTypeId: 'dinner-id',
            mealTypeName: 'Dinner',
            entries,
          },
        }}
      />
    </SafeAreaProvider>
  );

describe('FamilyMealDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('defaults to the whole meal and can continue with all IDs', () => {
    const screen = renderMealDetail();

    fireEvent.press(screen.getByText('Continue'));

    expect(navigation.navigate).toHaveBeenCalledWith('FamilyCopyReview', {
      familyUser,
      sourceDate: '2026-08-23',
      mealTypeId: 'dinner-id',
      mealTypeName: 'Dinner',
      sourceEntries: [pasta, sauce],
      selectedEntryIds: ['pasta-id', 'sauce-id'],
    });
  });

  test('shows each raw food nutrition and updates only the aggregate for a partial selection', () => {
    const screen = renderMealDetail();

    expect(
      screen.getByText('270 kcal · P 9 g · C 48 g · F 4.5 g')
    ).toBeTruthy();
    expect(screen.getByText('30 kcal · P 2 g · C 6 g · F 1 g')).toBeTruthy();
    expect(
      screen.getByText('Selected: 300 kcal · P 11 g · C 54 g · F 5.5 g')
    ).toBeTruthy();

    const selectedSauce = screen.getByLabelText('Deselect Tomato Sauce');
    expect(selectedSauce.props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(selectedSauce);

    const deselectedSauce = screen.getByLabelText('Select Tomato Sauce');
    expect(deselectedSauce.props.accessibilityState).toEqual({
      selected: false,
    });
    expect(
      screen.getByText('Selected: 270 kcal · P 9 g · C 48 g · F 4.5 g')
    ).toBeTruthy();
    expect(screen.getByText('30 kcal · P 2 g · C 6 g · F 1 g')).toBeTruthy();

    fireEvent.press(screen.getByText('Continue'));

    expect(navigation.navigate).toHaveBeenCalledWith('FamilyCopyReview', {
      familyUser,
      sourceDate: '2026-08-23',
      mealTypeId: 'dinner-id',
      mealTypeName: 'Dinner',
      sourceEntries: [pasta, sauce],
      selectedEntryIds: ['pasta-id'],
    });
  });

  test('deselects all, disables continue, and reselects source IDs in order', () => {
    const screen = renderMealDetail();

    const deselectAll = screen.getByLabelText('Deselect all');
    expect(deselectAll.props.accessibilityState).toMatchObject({
      selected: true,
    });
    fireEvent.press(deselectAll);

    const selectAll = screen.getByLabelText('Select all');
    expect(selectAll.props.accessibilityState).toMatchObject({
      selected: false,
    });
    expect(
      screen.getByRole('button', { name: 'Continue' }).props.accessibilityState
    ).toMatchObject({ disabled: true });

    fireEvent.press(selectAll);
    fireEvent.press(screen.getByText('Continue'));
    expect(navigation.navigate).toHaveBeenCalledWith('FamilyCopyReview', {
      familyUser,
      sourceDate: '2026-08-23',
      mealTypeId: 'dinner-id',
      mealTypeName: 'Dinner',
      sourceEntries: [pasta, sauce],
      selectedEntryIds: ['pasta-id', 'sauce-id'],
    });
  });

  test('keeps diary-only access read only', () => {
    const screen = renderMealDetail({ canCopy: false });

    expect(screen.getByText('Viewing only')).toBeTruthy();
    expect(screen.queryByText('Continue')).toBeNull();
    expect(screen.queryByLabelText('Deselect Tomato Sauce')).toBeNull();
  });

  test('keeps selection controls safe for an empty meal', () => {
    const screen = renderMealDetail({ entries: [] });

    expect(
      screen.getByLabelText('Select all').props.accessibilityState
    ).toMatchObject({
      selected: false,
    });
    expect(
      screen.getByRole('button', { name: 'Continue' }).props.accessibilityState
    ).toMatchObject({ disabled: true });
    expect(
      screen.getByText('Selected: 0 kcal · P 0 g · C 0 g · F 0 g')
    ).toBeTruthy();
  });
});
