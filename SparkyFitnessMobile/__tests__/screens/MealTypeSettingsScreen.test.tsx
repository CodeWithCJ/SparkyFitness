import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert, type AlertButton } from 'react-native';
import Toast from 'react-native-toast-message';
import MealTypeSettingsScreen from '../../src/screens/MealTypeSettingsScreen';
import * as mealTypesApi from '../../src/services/api/mealTypesApi';
import type { MealType } from '../../src/types/mealTypes';
import type { NavigationProp } from '@react-navigation/native';

// Controllable bottom-sheet mock: children render ONLY while presented, so
// tests verify the actual imperative presentation (form absent before
// present(), hidden after dismiss). `forceSet` lets tests drive dismissal
// from outside (mirrors backdrop/swipe close) and triggers a real re-render.
const mockSheetState = {
  presented: false,
  forceSet: (_v: boolean) => {},
};
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const BottomSheetModal = React.forwardRef(
    ({ children }: { children: React.ReactNode }, ref: any) => {
      const [shown, setShown] = React.useState(false);
      React.useEffect(() => {
        mockSheetState.forceSet = setShown;
        mockSheetState.presented = shown;
      }, [shown]);
      React.useImperativeHandle(ref, () => ({
        present: () => setShown(true),
        dismiss: () => setShown(false),
      }));
      return shown ? <View>{children}</View> : null;
    },
  );
  BottomSheetModal.displayName = 'BottomSheetModal';
  return {
    BottomSheetModal,
    BottomSheetScrollView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    BottomSheetView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

// Wheel picker: no native rendering in jest; the onChange handler receives a
// Date we can drive directly.
jest.mock('react-native-ui-datepicker', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      onChange,
      testID,
    }: {
      onChange?: (params: { date: Date }) => void;
      testID?: string;
    }) => (
      <View testID={testID ?? 'date-picker'}>
        <Text
          testID="picker-driver"
          onPress={() => {
            const d = new Date();
            d.setHours(9, 15, 0, 0);
            onChange?.({ date: d });
          }}
        >
          pick
        </Text>
      </View>
    ),
  };
});

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
  const ReactModule = require('react');
  const { Pressable } = require('react-native');
  return {
    useScreenHeader: (config: {
      right?:
        | { accessibilityLabel?: string; onPress?: () => void }
        | { accessibilityLabel?: string; onPress?: () => void }[];
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockNavigation = { goBack: jest.fn(), setOptions: jest.fn() } as unknown as NavigationProp<never>;
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

function renderScreen(overrides: { mealTypes?: MealType[] } = {}) {
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
    mockSheetState.presented = false;
    mockSheetState.forceSet = () => {};
    (Toast.show as jest.Mock).mockClear();
  });

  it('renders system and custom types with their ownership tags', async () => {
    const { findByText, getByText, queryAllByText } = renderScreen();
    expect(await findByText('Pre-Workout')).toBeTruthy();
    expect(getByText('breakfast')).toBeTruthy();
    expect(getByText('dinner')).toBeTruthy();
    expect(getByText('Custom')).toBeTruthy();
    await findByText('dinner');
    expect(queryAllByText('System').length).toBeGreaterThan(0);
  });

  it('renders the canonical system icons from MEAL_CONFIG (no parallel map)', async () => {
    const { findByTestId, findByText } = renderScreen();
    expect(await findByTestId('icon-meal-breakfast')).toBeTruthy();
    await findByText('dinner');
    expect(findByTestId('icon-meal-dinner')).toBeTruthy();
  });

  it('does NOT expose a raw Order / sort_order input or any Visibility UI', async () => {
    const { findByText, queryAllByText, queryByLabelText, queryByPlaceholderText } =
      renderScreen();
    await findByText('Pre-Workout');
    expect(queryAllByText(/^Order[: ]/)).toHaveLength(0);
    expect(queryByPlaceholderText(/e\.g\. 11/)).toBeNull();
    expect(queryAllByText(/Order: 100/)).toHaveLength(0);
    // Visibility is intentionally not user-configurable on mobile.
    expect(queryByLabelText(/^Visible/)).toBeNull();
    expect(queryAllByText(/^Visible$/)).toHaveLength(0);
  });

  it('creates a custom meal type with auto end-of-list sort_order and selected default time', async () => {
    const { findByText, getByLabelText, getByPlaceholderText } = renderScreen();
    const createSpy = jest
      .spyOn(mealTypesApi, 'createMealType')
      .mockResolvedValue({ id: 'custom-new', name: 'Post-Workout' } as MealType);

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
      // Backend hardcodes is_visible=TRUE on create and does not read it from
      // the body — the mobile create payload omits it (matches web).
      expect(createSpy.mock.calls[0][0].is_visible).toBeUndefined();
    });
  });

  it('create with Quick log off applies it via one follow-up update', async () => {
    const { findByText, getByLabelText, getByPlaceholderText } = renderScreen();
    const createSpy = jest
      .spyOn(mealTypesApi, 'createMealType')
      .mockResolvedValue({ id: 'custom-new', name: 'Post-Workout' } as MealType);
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({ id: 'x', name: 'x' } as MealType);

    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Add meal type'));
    fireEvent.changeText(getByPlaceholderText('e.g. Pre-Workout'), 'Post-Workout');
    // Quick log defaults ON; turn it off.
    fireEvent(getByLabelText('Quick log'), 'valueChange', false);
    fireEvent.press(getByLabelText('Create meal type'));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalledWith(
        'custom-new',
        expect.objectContaining({ show_in_quick_log: false }),
      );
    });
  });

  it('rejects creating without a name (button disabled)', async () => {
    const { findByText, getByLabelText } = renderScreen();
    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Add meal type'));
    const createButton = getByLabelText('Create meal type');
    expect(createButton.props.accessibilityState?.disabled).toBe(true);
  });

  it('opens edit with existing values and saves rename + time + quick-log without sort_order or is_visible', async () => {
    const { findByText, getByLabelText } = renderScreen();
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({ id: 'x', name: 'x' } as MealType);

    fireEvent.press(await findByText('Pre-Workout'));
    fireEvent.changeText(getByLabelText('Meal type name'), 'Pre-Workout 2.0');
    fireEvent.press(getByLabelText('Save meal type'));

    await waitFor(() => {
      const payload = updateSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(updateSpy).toHaveBeenCalledWith(
        'custom-pw',
        expect.objectContaining({
          name: 'Pre-Workout 2.0',
          default_time: '17:30',
          show_in_quick_log: false,
        }),
      );
      // Normal edits must never overwrite hidden/server-side state.
      expect(payload.sort_order).toBeUndefined();
      expect(payload.is_visible).toBeUndefined();
    });
  });

  it('editing a system row is not possible (no edit affordance)', async () => {
    const { findByText, queryByLabelText, getAllByLabelText } = renderScreen();
    await findByText('breakfast');
    expect(queryByLabelText('Edit breakfast')).toBeNull();
    expect(getAllByLabelText(/^Edit /).length).toBeGreaterThanOrEqual(1);
  });

  it('toggles quick-log via explicit accessible labels', async () => {
    const { findByText, getByLabelText } = renderScreen();
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({ id: 'x', name: 'x' } as MealType);

    await findByText('Pre-Workout');
    fireEvent(getByLabelText('Quick log Pre-Workout'), 'valueChange', true);
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith('custom-pw', { show_in_quick_log: true }),
    );
  });

  it('opens the wheel time picker, saves the selected HH:MM', async () => {
    const { findByText, getByLabelText, getByTestId } = renderScreen();
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({ id: 'x', name: 'x' } as MealType);

    await findByText('breakfast');
    // System row time cell carries an accessible label with the current value.
    fireEvent.press(getByLabelText('Default time for breakfast, 08:00'));
    // The wheel is presented (bottom sheet mounts its children).
    expect(getByTestId('picker-driver')).toBeTruthy();
    // Drive the wheel to 09:15 and press Save.
    fireEvent.press(getByTestId('picker-driver'));
    fireEvent.press(getByLabelText('Save default time'));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(
        'sys-b',
        expect.objectContaining({ default_time: '09:15' }),
      ),
    );
  });

  it('time picker Clear sends default_time: null', async () => {
    const { findByText, getByLabelText, getByTestId } = renderScreen();
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({ id: 'x', name: 'x' } as MealType);

    await findByText('breakfast');
    fireEvent.press(getByLabelText('Default time for breakfast, 08:00'));
    expect(getByTestId('picker-driver')).toBeTruthy();
    fireEvent.press(getByLabelText('Clear default time'));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(
        'sys-b',
        expect.objectContaining({ default_time: null }),
      ),
    );
  });

  it('time picker dismiss without action does not call update', async () => {
    const { findByText, getByLabelText, getByTestId } = renderScreen();
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({ id: 'x', name: 'x' } as MealType);

    await findByText('breakfast');
    fireEvent.press(getByLabelText('Default time for breakfast, 08:00'));
    expect(getByTestId('picker-driver')).toBeTruthy();
    // Dismiss (simulate the sheet closing without Save/Clear).
    mockSheetState.forceSet(false);

    // Re-render to reflect the hidden sheet; no mutation should have fired.
    await waitFor(() => expect(updateSpy).not.toHaveBeenCalled());
  });

  it('reorders custom types via accessibility actions: Alpha 100 / Beta 110 -> Beta 100 / Alpha 110 with one invalidate', async () => {
    const extra = [
      {
        id: 'custom-a',
        name: 'Alpha',
        sort_order: 100,
        user_id: 'user-1',
        created_at: '',
        is_visible: true,
        show_in_quick_log: true,
        default_time: null,
      },
      {
        id: 'custom-b',
        name: 'Beta',
        sort_order: 110,
        user_id: 'user-1',
        created_at: '',
        is_visible: true,
        show_in_quick_log: true,
        default_time: null,
      },
    ];
    const { findByText, getByLabelText, queryClient } = renderScreen({
      mealTypes: [...systemMealTypes, ...extra],
    });
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({ id: 'x', name: 'x' } as MealType);
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await findByText('Alpha');
    fireEvent(getByLabelText('Reorder Alpha'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });

    await waitFor(() => {
      // Beta moves up to 100, Alpha down to 110 — correct IDs + payloads.
      expect(updateSpy).toHaveBeenCalledWith('custom-a', { sort_order: 110 });
      expect(updateSpy).toHaveBeenCalledWith('custom-b', { sort_order: 100 });
    });
    await waitFor(() => {
      // Exactly ONE final invalidate after both writes succeed.
      const reorderCalls = invalidateSpy.mock.calls.filter(
        (call) => (call[0] as { queryKey?: unknown[] })?.queryKey?.[0] === 'mealTypes',
      );
      expect(reorderCalls.length).toBe(1);
    });
  });

  it('reorder partial failure: exactly one reorder error, override reconciled, single refetch', async () => {
    const extra = [
      {
        id: 'custom-a',
        name: 'Alpha',
        sort_order: 100,
        user_id: 'user-1',
        created_at: '',
        is_visible: true,
        show_in_quick_log: true,
        default_time: null,
      },
      {
        id: 'custom-b',
        name: 'Beta',
        sort_order: 110,
        user_id: 'user-1',
        created_at: '',
        is_visible: true,
        show_in_quick_log: true,
        default_time: null,
      },
    ];
    const { findByText, getByLabelText, queryClient } = renderScreen({
      mealTypes: [...systemMealTypes, ...extra],
    });
    // First write succeeds, second rejects.
    const updateSpy = jest
      .spyOn(mealTypesApi, 'updateMealType')
      .mockResolvedValueOnce({ id: 'custom-a', name: 'Alpha' } as MealType)
      .mockRejectedValueOnce(new Error('boom'));
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    await findByText('Alpha');
    fireEvent(getByLabelText('Reorder Alpha'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('custom-a', { sort_order: 110 });
      expect(updateSpy).toHaveBeenCalledWith('custom-b', { sort_order: 100 });
    });
    await waitFor(() => {
      // Exactly one reorder-specific error toast.
      const errors = (Toast.show as jest.Mock).mock.calls.filter(
        (call) => (call[0] as { text1?: string })?.text1 === 'Failed to reorder meal types',
      );
      expect(errors.length).toBe(1);
      // Failure reconciles: refetch happens (invalidate fired) so the UI is
      // not stuck with the stale optimistic order.
      expect(
        invalidateSpy.mock.calls.some(
          (call) => (call[0] as { queryKey?: unknown[] })?.queryKey?.[0] === 'mealTypes',
        ),
      ).toBe(true);
    });
  });

  it('system rows expose no drag handle but do expose quick-log and time', async () => {
    const { findByText, queryByLabelText, getByLabelText } = renderScreen();
    await findByText('breakfast');
    expect(queryByLabelText('Reorder breakfast')).toBeNull();
    expect(getByLabelText('Quick log breakfast')).toBeTruthy();
    expect(getByLabelText('Default time for breakfast, 08:00')).toBeTruthy();
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
          show_in_quick_log: true,
          default_time: null,
        },
      ],
    });
    await findByText(longName);
    expect(getByLabelText(`Edit ${longName}`)).toBeTruthy();
    expect(getByLabelText(`Delete ${longName}`)).toBeTruthy();
    expect(getByLabelText(`Default time for ${longName}`)).toBeTruthy();
    expect(getByLabelText(`Reorder ${longName}`)).toBeTruthy();
    expect(getByLabelText(`Quick log ${longName}`)).toBeTruthy();
    expect(getByTestId(`meal-type-custom-custom-long`)).toBeTruthy();
  });

  it('deletes a custom meal type through the destructive confirmation', async () => {
    const { findByText, getByLabelText } = renderScreen();
    const deleteSpy = jest.spyOn(mealTypesApi, 'deleteMealType').mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert');

    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Delete Pre-Workout'));
    expect(alertSpy).toHaveBeenCalledWith('Delete Meal Type', "Delete 'Pre-Workout'?", expect.any(Array));
    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
    const destructive = buttons.find((b) => b.style === 'destructive');
    destructive.onPress();
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('custom-pw'));
  });

  it('Add form does not retain previous Edit values (reset between modes)', async () => {
    const { findByText, getByLabelText, getByPlaceholderText, queryByText } = renderScreen();
    await findByText('Pre-Workout');

    // Open Edit: loads existing values.
    fireEvent.press(getByLabelText('Edit Pre-Workout'));
    const nameInput = getByPlaceholderText('e.g. Pre-Workout');
    expect(nameInput.props.value).toBe('Pre-Workout');

    // Dismiss, then open Add: must not retain the edited values.
    mockSheetState.forceSet(false);
    fireEvent.press(getByLabelText('Add meal type'));
    const addInput = getByPlaceholderText('e.g. Pre-Workout');
    expect(addInput.props.value).toBe('');
    expect(queryByText('Edit Meal Type')).toBeNull();
    expect(queryByText('Add Meal Type')).toBeTruthy();
  });
});
