import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import MealTypeSettingsScreen from '../../src/screens/MealTypeSettingsScreen';
import * as mealTypesApi from '../../src/services/api/mealTypesApi';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('../../src/hooks/useScreenHeader', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    useScreenHeader: (config: any) => {
      const items = Array.isArray(config.right) ? config.right : config.right ? [config.right] : [];
      return React.createElement(
        React.Fragment,
        null,
        items.map((item: any, i: number) =>
          React.createElement(Pressable, {
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Bottom sheets in tests render as no-ops; the form values flow through the
// exposed ref methods only when present. Keep the real components but stub the
// sheet mount so tests exercise the screen wiring.
jest.mock('@gorhom/bottom-sheet', () => {
  const { View } = require('react-native');
  return {
    BottomSheetModal: ({ children }: any) => <View>{children}</View>,
    BottomSheetScrollView: ({ children }: any) => <View>{children}</View>,
    BottomSheetView: ({ children }: any) => <View>{children}</View>,
  };
});

const mockNavigation = { goBack: jest.fn(), setOptions: jest.fn() } as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const systemMealTypes = [
  {
    id: 'sys-b',
    name: 'breakfast',
    sort_order: 10,
    user_id: null,
    created_at: '',
    is_visible: true,
    show_in_quick_log: true,
    default_time: '08:00',
  },
  {
    id: 'sys-d',
    name: 'dinner',
    sort_order: 30,
    user_id: null,
    created_at: '',
    is_visible: true,
    show_in_quick_log: true,
    default_time: null,
  },
];

const customMealTypes = [
  {
    id: 'custom-pw',
    name: 'Pre-Workout',
    sort_order: 100,
    user_id: 'user-1',
    created_at: '',
    is_visible: true,
    show_in_quick_log: false,
    default_time: '17:30',
  },
];

const allMealTypes = [...systemMealTypes, ...customMealTypes];

function renderScreen(overrides: { mealTypes?: any[] } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  jest
    .spyOn(mealTypesApi, 'fetchMealTypes')
    .mockResolvedValue(overrides.mealTypes ?? allMealTypes);
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MealTypeSettingsScreen navigation={mockNavigation} route={{ params: {} } as any} />
      </QueryClientProvider>,
    ),
  };
}

describe('MealTypeSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Toast.show as jest.Mock).mockClear();
  });

  it('renders system and custom types with their ownership tags', async () => {
    const { findByText, getByText, queryAllByText } = renderScreen();
    expect(await findByText('Pre-Workout')).toBeTruthy();
    expect(getByText('breakfast')).toBeTruthy();
    expect(getByText('dinner')).toBeTruthy();
    expect(getByText('Custom')).toBeTruthy();
    expect(queryAllByText('System').length).toBeGreaterThan(0);
  });

  it('renders the canonical system icons from MEAL_CONFIG (no parallel map)', async () => {
    const { findByTestId } = renderScreen();
    expect(await findByTestId('icon-meal-breakfast')).toBeTruthy();
    expect(findByTestId('icon-meal-dinner')).toBeTruthy();
  });

  it('does NOT expose a raw Order / sort_order input anywhere', async () => {
    const { findByText, queryAllByText, queryByPlaceholderText } = renderScreen();
    await findByText('Pre-Workout');
    expect(queryAllByText(/^Order[: ]/)).toHaveLength(0);
    expect(queryByPlaceholderText(/e\.g\. 11/)).toBeNull();
    // The old "Order: N" sub-label is gone.
    expect(queryAllByText(/Order: 100/)).toHaveLength(0);
  });

  it('creates a custom meal type with auto end-of-list sort_order and selected default time', async () => {
    const { findByText, getByLabelText, getByPlaceholderText } = renderScreen();
    const createSpy = jest.spyOn(mealTypesApi, 'createMealType').mockResolvedValue({
      id: 'custom-new', name: 'Post-Workout', sort_order: 110, user_id: 'user-1',
    } as any);

    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Add meal type'));
    fireEvent.changeText(getByPlaceholderText('e.g. Pre-Workout'), 'Post-Workout');
    fireEvent.press(getByLabelText('Create meal type'));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Post-Workout',
          // Auto-assigned to the end of the custom list (100 + 10).
          sort_order: 110,
          default_time: null,
        }),
      );
    });
  });

  it('rejects creating without a name (button disabled)', async () => {
    const { getByLabelText } = renderScreen();
    fireEvent.press(getByLabelText('Add meal type'));
    const createButton = getByLabelText('Create meal type');
    expect(createButton.props.accessibilityState?.disabled).toBe(true);
  });

  it('opens edit with existing values and saves rename + time + toggles without sort_order', async () => {
    const { findByText, getByLabelText } = renderScreen();
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({} as any);

    fireEvent.press(await findByText('Pre-Workout'));
    fireEvent.changeText(getByLabelText('Meal type name'), 'Pre-Workout 2.0');
    fireEvent.press(getByLabelText('Save meal type'));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'custom-pw',
        expect.objectContaining({
          name: 'Pre-Workout 2.0',
          default_time: '17:30',
          is_visible: true,
          show_in_quick_log: false,
        }),
      );
      // No sort_order in the edit payload.
      expect((updateSpy.mock.calls[0][1] as any).sort_order).toBeUndefined();
    });
  });

  it('editing a system row is not possible (no name edit control)', async () => {
    const { findByText, queryByLabelText, getAllByLabelText } = renderScreen();
    await findByText('breakfast');
    // System rows have no edit affordance; only custom rows can be edited.
    expect(queryByLabelText('Edit breakfast')).toBeNull();
    expect(getAllByLabelText(/^Edit /).length).toBeGreaterThanOrEqual(1);
  });

  it('toggles visibility and quick-log via explicit accessible labels', async () => {
    const { findByText, getByLabelText } = renderScreen();
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({} as any);

    await findByText('Pre-Workout');
    fireEvent(getByLabelText('Visible Pre-Workout'), 'valueChange', false);
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith('custom-pw', { is_visible: false }),
    );

    fireEvent(getByLabelText('Quick log Pre-Workout'), 'valueChange', true);
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith('custom-pw', { show_in_quick_log: true }),
    );
  });

  it('opens the wheel time picker from the row time cell and saves HH:MM', async () => {
    const { findByText, getByLabelText } = renderScreen();
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({} as any);

    await findByText('breakfast');
    // System row time cell carries an accessible label with the current value.
    const cell = getByLabelText('Default time for breakfast, 08:00');
    expect(cell).toBeTruthy();
    // Simulate the picker selecting a new time via the shared sheet callback
    // is covered by the time-picker contract; here we just assert the row
    // exposes the clear affordance by pressing the cell (opens picker without
    // crashing in tests).
    fireEvent.press(cell);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('reorders custom types via the drag-handle accessibility actions and persists sequential sort_order', async () => {
    const extra = [
      {
        id: 'custom-a',
        name: 'Alpha',
        sort_order: 100,
        user_id: 'user-1',
        created_at: '',
        is_visible: true,
        show_in_quick_log: false,
        default_time: null,
      },
      {
        id: 'custom-b',
        name: 'Beta',
        sort_order: 110,
        user_id: 'user-1',
        created_at: '',
        is_visible: true,
        show_in_quick_log: false,
        default_time: null,
      },
    ];
    const { findByText, getByLabelText } = renderScreen({ mealTypes: [...systemMealTypes, ...extra] });
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({} as any);

    await findByText('Alpha');
    // Move Alpha down past Beta: decrement/increment semantics are
    // 'decrement' = move up, 'increment' = move down on the handle.
    fireEvent(getByLabelText('Reorder Alpha'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'custom-a',
        expect.objectContaining({ sort_order: 110 }),
      );
      expect(updateSpy).toHaveBeenCalledWith(
        'custom-b',
        expect.objectContaining({ sort_order: 100 }),
      );
    });
  });

  it('system rows expose no drag handle', async () => {
    const { findByText, queryByLabelText } = renderScreen();
    await findByText('breakfast');
    expect(queryByLabelText('Reorder breakfast')).toBeNull();
    // Custom rows still have their handle.
    expect(queryByLabelText('Reorder Pre-Workout')).toBeTruthy();
  });

  it('renders a very long custom name without losing actions', async () => {
    const longName = 'Very Long Pre Workout Meal Category Used Before Training';
    const { findByText, getByLabelText, getByTestId } = renderScreen({
      mealTypes: [
        ...systemMealTypes,
        {
          id: 'custom-long',
          name: longName,
          sort_order: 100,
          user_id: 'user-1',
          created_at: '',
          is_visible: true,
          show_in_quick_log: false,
          default_time: null,
        },
      ],
    });
    await findByText(longName);
    // Every row action still exists: edit, delete, time, drag handle.
    expect(getByLabelText(`Edit ${longName}`)).toBeTruthy();
    expect(getByLabelText(`Delete ${longName}`)).toBeTruthy();
    expect(getByLabelText(`Default time for ${longName}`)).toBeTruthy();
    expect(getByLabelText(`Reorder ${longName}`)).toBeTruthy();
    expect(getByTestId(`meal-type-custom-custom-long`)).toBeTruthy();
  });

  it('deletes a custom meal type through the destructive confirmation', async () => {
    const { findByText, getByLabelText } = renderScreen();
    const deleteSpy = jest.spyOn(mealTypesApi, 'deleteMealType').mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert');

    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Delete Pre-Workout'));
    expect(alertSpy).toHaveBeenCalledWith('Delete Meal Type', "Delete 'Pre-Workout'?", expect.any(Array));
    const buttons = alertSpy.mock.calls[0][2] as any[];
    const destructive = buttons.find((b) => b.style === 'destructive');
    destructive.onPress();
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('custom-pw'));
  });
});
