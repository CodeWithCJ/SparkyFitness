import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FamilyCopyReviewScreen from '../../src/screens/FamilyCopyReviewScreen';
import { useCopyFamilyFoodEntries } from '../../src/hooks/useCopyFamilyFoodEntries';
import { useMealTypes } from '../../src/hooks/useMealTypes';
import { useDiaryDateStore } from '../../src/stores/diaryDateStore';
import type { FoodEntry } from '../../src/types/foodEntries';
import type { FamilyDiaryUser } from '../../src/types/familyDiary';

const familyUser: FamilyDiaryUser = {
  userId: 'member-b',
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
const copyFromFamilyAsync = jest.fn();
let onCopySuccess: ((request: unknown) => void) | undefined;

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('../../src/hooks/useMealTypes', () => ({
  useMealTypes: jest.fn(),
}));

jest.mock('../../src/hooks/useCopyFamilyFoodEntries', () => ({
  useCopyFamilyFoodEntries: jest.fn(),
}));

jest.mock('../../src/components/CalendarSheet', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return React.forwardRef(
    ({ onSelectDate }: { onSelectDate: (date: string) => void }, ref) => {
      React.useImperativeHandle(ref, () => ({
        present: jest.fn(),
        dismiss: jest.fn(),
      }));
      return React.createElement(Pressable, {
        accessibilityRole: 'button',
        accessibilityLabel: 'Choose August 25',
        onPress: () => onSelectDate('2026-08-25'),
      });
    },
  );
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: { defaultValue?: string; [name: string]: unknown },
    ) =>
      (options?.defaultValue ?? key).replace(
        /\{\{(\w+)\}\}/g,
        (match, name: string) => String(options?.[name] ?? match),
      ),
  }),
}));

const mockMealTypes = useMealTypes as jest.MockedFunction<typeof useMealTypes>;
const mockCopyMutation = useCopyFamilyFoodEntries as jest.MockedFunction<
  typeof useCopyFamilyFoodEntries
>;

function renderReview({
  selectedEntryIds = [pasta.id, sauce.id],
  mealTypes = [
    { id: 'breakfast-id', name: 'Breakfast', is_visible: true, sort_order: 1 },
    { id: 'dinner-id', name: 'Dinner', is_visible: true, sort_order: 2 },
  ],
  defaultMealTypeId = 'breakfast-id',
}: {
  selectedEntryIds?: string[];
  mealTypes?: {
    id: string;
    name: string;
    is_visible: boolean;
    sort_order: number;
  }[];
  defaultMealTypeId?: string | null;
} = {}) {
  mockMealTypes.mockReturnValue({
    mealTypes: mealTypes as never,
    defaultMealTypeId,
    isLoading: false,
    isError: false,
  });

  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
      }}
    >
      <FamilyCopyReviewScreen
        navigation={navigation as never}
        route={{
          key: 'family-copy-review',
          name: 'FamilyCopyReview',
          params: {
            familyUser,
            sourceDate: '2026-08-23',
            mealTypeId: 'dinner-id',
            mealTypeName: 'Dinner',
            sourceEntries: [pasta, sauce],
            selectedEntryIds,
          },
        }}
      />
    </SafeAreaProvider>,
  );
}

describe('FamilyCopyReviewScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-24T10:00:00'));
    jest.clearAllMocks();
    onCopySuccess = undefined;
    copyFromFamilyAsync.mockResolvedValue(undefined);
    useDiaryDateStore.setState({
      selectedDate: '2026-08-23',
      lastKnownToday: '2026-08-24',
    });
    mockCopyMutation.mockImplementation(options => {
      onCopySuccess = options?.onSuccess as typeof onCopySuccess;
      return {
        copyFromFamily: jest.fn(),
        copyFromFamilyAsync,
        isPending: false,
      };
    });
  });

  afterEach(() => jest.useRealTimers());

  test('defaults selected quantities from the source and the target date to today', () => {
    const screen = renderReview();

    expect(screen.getByDisplayValue('150')).toBeTruthy();
    expect(screen.getByDisplayValue('50')).toBeTruthy();
    expect(screen.getByText('Mon, Aug 24')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Copy date: Mon, Aug 24' }),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Quantity for Family Pasta').props.style,
    ).toEqual({ minHeight: 44 });
    expect(screen.getByRole('button', { name: 'Dinner' }).props.style).toEqual({
      minHeight: 44,
      minWidth: 44,
    });
  });

  test('blocks zero quantities with an inline message while retaining the typed value', () => {
    const screen = renderReview();
    fireEvent.changeText(
      screen.getByLabelText('Quantity for Family Pasta'),
      '0',
    );

    expect(screen.getByDisplayValue('0')).toBeTruthy();
    expect(
      screen.getByText('Enter a quantity greater than zero.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Copy to my diary' }).props
        .accessibilityState,
    ).toEqual({ disabled: true });
    expect(
      screen.getByLabelText('Quantity for Family Pasta').props['aria-invalid'],
    ).toBe(true);
    expect(
      screen.getByLabelText('Quantity for Family Pasta').props[
        'aria-describedby'
      ],
    ).toBe('family-copy-quantity-error-pasta-id');
    const error = screen.getByText('Enter a quantity greater than zero.');
    expect(error.props.nativeID).toBe('family-copy-quantity-error-pasta-id');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(error.props.accessibilityLiveRegion).toBe('assertive');
  });

  test('recalculates nutrients once from the source serving basis', () => {
    const screen = renderReview({ selectedEntryIds: [pasta.id] });
    fireEvent.changeText(
      screen.getByLabelText('Quantity for Family Pasta'),
      '200',
    );

    expect(screen.getByText('360 kcal')).toBeTruthy();
    expect(screen.getByText('12 g protein')).toBeTruthy();
    expect(screen.getByText('64 g carbs')).toBeTruthy();
    expect(screen.getByText('6 g fat')).toBeTruthy();
  });

  test('accepts a comma decimal quantity, scales the preview once, and submits its numeric value', () => {
    const screen = renderReview({ selectedEntryIds: [pasta.id] });

    fireEvent.changeText(
      screen.getByLabelText('Quantity for Family Pasta'),
      '150,5',
    );

    expect(screen.getByText('270.9 kcal')).toBeTruthy();
    fireEvent.press(screen.getByText('Copy to my diary'));
    expect(copyFromFamilyAsync).toHaveBeenCalledWith({
      kind: 'selected',
      payload: {
        familyUserId: 'member-b',
        sourceDate: '2026-08-23',
        targetDate: '2026-08-24',
        targetMealType: 'dinner-id',
        entries: [{ entryId: 'pasta-id', quantity: 150.5 }],
      },
    });
  });

  test('uses the source canonical meal only when it exists in the signed-in meal types', () => {
    const screen = renderReview({
      mealTypes: [
        {
          id: 'breakfast-id',
          name: 'Breakfast',
          is_visible: true,
          sort_order: 1,
        },
      ],
    });

    expect(
      screen.getByRole('button', { name: 'Breakfast' }).props
        .accessibilityState,
    ).toEqual({ selected: true });
  });

  test('uses the reviewed whole-meal operation with an exact source snapshot', () => {
    const screen = renderReview();
    fireEvent.press(screen.getByText('Copy to my diary'));

    expect(copyFromFamilyAsync).toHaveBeenCalledWith({
      kind: 'whole',
      payload: {
        familyUserId: 'member-b',
        sourceDate: '2026-08-23',
        sourceMealType: 'dinner-id',
        targetDate: '2026-08-24',
        targetMealType: 'dinner-id',
        entries: [
          { entryId: 'pasta-id', quantity: 150 },
          { entryId: 'sauce-id', quantity: 50 },
        ],
      },
    });
  });

  test('uses selected-copy for a partial selection with the exact payload', () => {
    const screen = renderReview({ selectedEntryIds: [pasta.id] });
    fireEvent.press(screen.getByText('Copy to my diary'));

    expect(copyFromFamilyAsync).toHaveBeenCalledWith({
      kind: 'selected',
      payload: {
        familyUserId: 'member-b',
        sourceDate: '2026-08-23',
        targetDate: '2026-08-24',
        targetMealType: 'dinner-id',
        entries: [{ entryId: 'pasta-id', quantity: 150 }],
      },
    });
  });

  test('uses route selection order for a multi-row adjusted selected-copy payload', () => {
    const screen = renderReview({ selectedEntryIds: [sauce.id, pasta.id] });
    fireEvent.changeText(
      screen.getByLabelText('Quantity for Family Pasta'),
      '200',
    );
    fireEvent.press(screen.getByText('Copy to my diary'));

    expect(copyFromFamilyAsync).toHaveBeenCalledWith({
      kind: 'selected',
      payload: {
        familyUserId: 'member-b',
        sourceDate: '2026-08-23',
        targetDate: '2026-08-24',
        targetMealType: 'dinner-id',
        entries: [
          { entryId: 'sauce-id', quantity: 50 },
          { entryId: 'pasta-id', quantity: 200 },
        ],
      },
    });
  });

  test('disables submission when a route selection is duplicated or missing', () => {
    const duplicateSelection = renderReview({
      selectedEntryIds: [pasta.id, pasta.id],
    });
    expect(
      duplicateSelection.getByRole('button', { name: 'Copy to my diary' }).props
        .accessibilityState,
    ).toEqual({ disabled: true });

    const missingSelection = renderReview({
      selectedEntryIds: [pasta.id, 'missing-entry-id'],
    });
    expect(
      missingSelection.getByRole('button', { name: 'Copy to my diary' }).props
        .accessibilityState,
    ).toEqual({ disabled: true });
  });

  test('prevents duplicate submissions and opens the own diary only on success', () => {
    const screen = renderReview({ selectedEntryIds: [pasta.id] });
    fireEvent.changeText(
      screen.getByLabelText('Quantity for Family Pasta'),
      '200',
    );
    fireEvent.press(screen.getByText('Copy to my diary'));
    fireEvent.press(screen.getByText('Copy to my diary'));

    expect(copyFromFamilyAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue('200')).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();

    onCopySuccess?.(copyFromFamilyAsync.mock.calls[0][0]);
    expect(useDiaryDateStore.getState().selectedDate).toBe('2026-08-24');
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Diary',
      params: { selectedDate: '2026-08-24' },
    });
  });

  test('retains edited quantities and allows a retry after a copy failure', async () => {
    copyFromFamilyAsync
      .mockRejectedValueOnce(new Error('copy failed'))
      .mockResolvedValue(undefined);
    const screen = renderReview({ selectedEntryIds: [pasta.id] });
    fireEvent.changeText(
      screen.getByLabelText('Quantity for Family Pasta'),
      '200',
    );

    fireEvent.press(screen.getByText('Copy to my diary'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(copyFromFamilyAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue('200')).toBeTruthy();

    fireEvent.press(screen.getByText('Copy to my diary'));
    expect(copyFromFamilyAsync).toHaveBeenCalledTimes(2);
  });

  test('navigates to the submitted target date when the visible date changes while pending', () => {
    const screen = renderReview();
    fireEvent.press(screen.getByText('Copy to my diary'));
    const submittedRequest = copyFromFamilyAsync.mock.calls[0][0];

    fireEvent.press(screen.getByRole('button', { name: 'Choose August 25' }));
    expect(screen.getByText('Tue, Aug 25')).toBeTruthy();

    onCopySuccess?.(submittedRequest);
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Diary',
      params: { selectedDate: '2026-08-24' },
    });
  });
});
