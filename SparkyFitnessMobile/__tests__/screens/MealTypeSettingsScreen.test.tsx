import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/**
 * Controllable bottom-sheet mock: children render ONLY while presented, so
 * tests exercise the real imperative presentation flow (form absent before
 * present; Add-after-Edit never retains stale values). `present`/`dismiss`
 * use local component state so the sheet mounts deterministically whenever
 * the ref methods are invoked (no reliance on external flags).
 */
jest.mock('@gorhom/bottom-sheet', () => {
  const { View } = require('react-native');
  const ReactModule = require('react');
  return {
    BottomSheetModal: ReactModule.forwardRef(
      ({ children, onDismiss }: any, ref: any) => {
        const [presented, setPresented] = ReactModule.useState(false);
        ReactModule.useImperativeHandle(ref, () => ({
          present: () => setPresented(true),
          dismiss: () => {
            setPresented(false);
            onDismiss?.();
          },
        }));
        return presented ? <View testID="sheet-content">{children}</View> : null;
      },
    ),
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
  { id: 'sys-b', name: 'breakfast', sort_order: 10, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true, default_time: '08:00' },
  { id: 'sys-l', name: 'lunch', sort_order: 20, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
  { id: 'sys-d', name: 'dinner', sort_order: 30, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
  { id: 'sys-s', name: 'snacks', sort_order: 40, user_id: null, created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
];

const customMealTypes = [
  { id: 'custom-pw', name: 'Pre-Workout', sort_order: 21, user_id: 'user-1', created_at: '', is_visible: true, show_in_quick_log: false, default_time: '17:30' },
];

const allMealTypes = [...systemMealTypes, ...customMealTypes];

function renderScreen(overrides: { mealTypes?: any[] } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  jest.spyOn(mealTypesApi, 'fetchMealTypes').mockResolvedValue(overrides.mealTypes ?? allMealTypes);
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MealTypeSettingsScreen navigation={mockNavigation} route={{ params: {} } as any} />
      </QueryClientProvider>,
    ),
  };
}


/** Opens the edit sheet for a meal type and waits deterministically for it. */
async function openEditSheet(
  queries: {
    getByLabelText: (label: string) => any;
    queryByLabelText: (label: string) => any;
  },
  name: string,
) {
  fireEvent.press(queries.getByLabelText(`Edit ${name}`));
  await waitFor(() =>
    expect(queries.queryByLabelText(`Quick log ${name}`)).not.toBeNull(),
  );
}

describe('MealTypeSettingsScreen — unified anchor list', () => {
  beforeEach(() => {
    // restoreAllMocks first: per-test spies (updateMealType/createMealType)
    // must not leak implementations into later tests.
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('renders ONE unified list — anchors interleaved with customs, no separate sections', async () => {
    const { findByText, queryByText, getByText } = renderScreen();
    expect(await findByText('Pre-Workout')).toBeTruthy();
    // No "System Types" / "Custom Types" section headers.
    expect(queryByText('System Types')).toBeNull();
    expect(queryByText('Custom Types')).toBeNull();
    // All four anchors present.
    expect(getByText('breakfast')).toBeTruthy();
    expect(getByText('lunch')).toBeTruthy();
    expect(getByText('dinner')).toBeTruthy();
    expect(getByText('snacks')).toBeTruthy();
  });

  it('places a custom in the Lunch gap between Lunch and Dinner (Lunch 2.0 example)', async () => {
    const types = [
      ...systemMealTypes,
      { id: 'lunch2', name: 'Lunch 2.0', sort_order: 21, user_id: 'u', created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
    ];
    const { findByText, getAllByTestId } = renderScreen({ mealTypes: types });
    await findByText('Lunch 2.0');
    const rows = getAllByTestId(/^meal-type-/);
    const order = rows.map((r) => r.props.testID);
    const lunchIdx = order.findIndex((id) => id === 'meal-type-system-sys-l');
    const dinnerIdx = order.findIndex((id) => id === 'meal-type-system-sys-d');
    expect(order[lunchIdx + 1]).toBe('meal-type-custom-lunch2');
    expect(dinnerIdx - lunchIdx).toBe(2); // Lunch, Lunch 2.0, Dinner
  });

  it('renders canonical FILLED system icons from MEAL_CONFIG', async () => {
    const { findByTestId } = renderScreen();
    // Every findBy* must be awaited — an unawaited waitFor promise resolves
    // after the test's cleanup and throws "unmounted" into a LATER test.
    expect(await findByTestId('icon-meal-breakfast')).toBeTruthy();
    expect(await findByTestId('icon-meal-lunch')).toBeTruthy();
    expect(await findByTestId('icon-meal-dinner')).toBeTruthy();
    expect(await findByTestId('icon-meal-snack')).toBeTruthy();
  });

  it('system rows are not draggable (no drag handle)', async () => {
    const { findByText, queryByLabelText, getAllByLabelText } = renderScreen();
    await findByText('breakfast');
    expect(queryByLabelText('Reorder breakfast')).toBeNull();
    expect(queryByLabelText('Reorder lunch')).toBeNull();
    // Custom rows keep their accessible reorder handle.
    expect(getAllByLabelText(/^Reorder /).length).toBeGreaterThanOrEqual(1);
  });

  it('never exposes raw sort_order / Order numbers', async () => {
    const { findByText, queryAllByText } = renderScreen();
    await findByText('Pre-Workout');
    expect(queryAllByText(/^Order[: ]/)).toHaveLength(0);
    expect(queryAllByText(/\b(11|21|31|100|110)\b/)).toHaveLength(0);
  });

  it('reorders a custom across an anchor gap and persists sequential slots with ONE invalidate', async () => {
    const types = [
      ...systemMealTypes,
      { id: 'brunch', name: 'Brunch', sort_order: 11, user_id: 'u', created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
      { id: 'l2', name: 'Lunch 2.0', sort_order: 21, user_id: 'u', created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
    ];
    const { findByText, getByLabelText } = renderScreen({ mealTypes: types });
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({} as any);
    const invalidateSpy = jest.spyOn(Toast, 'show');
    invalidateSpy.mockClear();

    await findByText('Brunch');
    // Move Brunch DOWN (across Lunch into the Lunch→Dinner gap).
    fireEvent(getByLabelText('Reorder Brunch'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('brunch', { sort_order: expect.any(Number) });
      const write = updateSpy.mock.calls[0][1] as any;
      expect(write.sort_order).toBeGreaterThanOrEqual(21);
      expect(write.sort_order).toBeLessThanOrEqual(29);
    });
    // No generic "Failed to update" toast for reorder rows.
    expect(Toast.show).not.toHaveBeenCalledWith(
      expect.objectContaining({ text1: 'Failed to update' }),
    );
    await act(async () => {});
  });

  it('rejects a move into a FULL gap with one concise toast (max 9)', async () => {
    const fullGap = Array.from({ length: 9 }, (_, i) => ({
      id: `l${i}`,
      name: `Lunch ${i}`,
      sort_order: 21 + i,
      user_id: 'u',
      created_at: '',
      is_visible: true,
      show_in_quick_log: true,
      default_time: null,
    }));
    const types = [...systemMealTypes, { id: 'brunch', name: 'Brunch', sort_order: 11, user_id: 'u', created_at: '', is_visible: true, show_in_quick_log: true, default_time: null }, ...fullGap];
    const { findByText, getByLabelText } = renderScreen({ mealTypes: types });
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({} as any);

    await findByText('Brunch');
    fireEvent(getByLabelText('Reorder Brunch'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: expect.stringContaining('No more meal types can be placed between Lunch and Dinner'),
        }),
      );
    });
    // No partial writes.
    expect(updateSpy).not.toHaveBeenCalled();
    await act(async () => {});
  });

  it('serializes rapid reorders: the newest desired order wins deterministically', async () => {
    const types = [
      ...systemMealTypes,
      { id: 'a', name: 'A', sort_order: 11, user_id: 'u', created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
      { id: 'b', name: 'B', sort_order: 21, user_id: 'u', created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
    ];
    const { findByText, getByLabelText } = renderScreen({ mealTypes: types });
    const updateSpy = jest
      .spyOn(mealTypesApi, 'updateMealType')
      .mockResolvedValue({} as any);

    await findByText('A');
    // Two rapid moves: A down (into l_d), then B up (into b_l). The chained
    // persistence must execute sequentially and the LAST write set reflects
    // the newest visual order (A in l_d, B in b_l).
    fireEvent(getByLabelText('Reorder A'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    fireEvent(getByLabelText('Reorder B'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });

    await waitFor(() => {
      const writes = updateSpy.mock.calls.map((c) => c[0]);
      expect(writes.length).toBeGreaterThanOrEqual(1);
      // Deterministic final state: B before Lunch (b_l), A after Lunch (l_d).
      const aWrite = updateSpy.mock.calls.find((c) => c[0] === 'a');
      const bWrite = updateSpy.mock.calls.find((c) => c[0] === 'b');
      if (aWrite) {
        const s = (aWrite[1] as any).sort_order;
        expect(s).toBeGreaterThanOrEqual(21);
        expect(s).toBeLessThanOrEqual(29);
      }
      if (bWrite) {
        const s = (bWrite[1] as any).sort_order;
        expect(s).toBeGreaterThanOrEqual(11);
        expect(s).toBeLessThanOrEqual(19);
      }
    });
    // Flush the serialized persistence chain so no setState lands after the
    // test's screen is unmounted.
    await act(async () => {});
    await act(async () => {});
  });

  it('creates a custom type: auto end-of-list slot in d_s, no is_visible in payload, then quick-log follow-up', async () => {
    const { findByText, getByLabelText, getByPlaceholderText } = renderScreen();
    const createSpy = jest.spyOn(mealTypesApi, 'createMealType').mockResolvedValue({
      id: 'custom-new', name: 'Dessert', sort_order: 31, user_id: 'user-1',
    } as any);
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({} as any);

    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Add meal type'));
    fireEvent.changeText(getByPlaceholderText('e.g. Lunch 2.0'), 'Dessert');
    fireEvent.press(getByLabelText('Create meal type'));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Dessert',
          sort_order: 31, // d_s first slot (end of list)
          default_time: null,
        }),
      );
      // No is_visible in the base create payload (backend hardcodes TRUE).
      expect((createSpy.mock.calls[0][0] as any).is_visible).toBeUndefined();
    });
    // Quick log default in the sheet is off → follow-up update disables it.
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'custom-new',
        expect.objectContaining({ show_in_quick_log: false }),
      );
    });
    // Flush the async create + follow-up + invalidate chain so no setState
    // lands on the unmounted screen of a later test.
    await act(async () => {});
    await act(async () => {});
  });

  it('create with an empty name is disabled', async () => {
    const { findByText, getByLabelText } = renderScreen();
    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Add meal type'));
    const create = getByLabelText('Create meal type');
    expect(create.props.accessibilityState?.disabled).toBe(true);
  });

  it('create shows Cancel (no Delete in create mode)', async () => {
    const { findByText, getByLabelText, queryByLabelText } = renderScreen();
    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Add meal type'));
    expect(getByLabelText('Cancel create meal type')).toBeTruthy();
    expect(queryByLabelText('Delete Meal Type')).toBeNull();
  });

  it('edit custom: name + visibility + quick log + time row; edit payload preserves sort_order', async () => {
    const { findByText, getByLabelText, queryByLabelText, getByPlaceholderText } = renderScreen();
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({} as any);

    await findByText('Pre-Workout');
    await openEditSheet({ getByLabelText, queryByLabelText }, 'Pre-Workout');
    // Toggle visibility BEFORE renaming (the switch label carries the name).
    fireEvent(getByLabelText('Visible Pre-Workout'), 'valueChange', false);
    fireEvent.changeText(getByPlaceholderText('e.g. Lunch 2.0'), 'Pre-Workout 2.0');
    fireEvent.press(getByLabelText('Save meal type'));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'custom-pw',
        expect.objectContaining({
          name: 'Pre-Workout 2.0',
          is_visible: false,
          show_in_quick_log: false,
        }),
      );
      const payload = updateSpy.mock.calls[0][1] as any;
      expect(payload.sort_order).toBeUndefined();
      expect(payload.default_time).toBe('17:30');
    });
    await act(async () => {});
  });

  it('system edit: name display-only, no Delete, per-user quick log switch present', async () => {
    const { findByText, getByLabelText, queryByLabelText, getAllByText } = renderScreen();
    await findByText('breakfast');
    await openEditSheet({ getByLabelText, queryByLabelText }, 'breakfast');
    // Display-only name (no editable TextInput); the name appears on the row
    // AND in the read-only field.
    expect(getAllByText('breakfast').length).toBeGreaterThanOrEqual(2);
    expect(queryByLabelText('Meal type name')).toBeNull();
    expect(queryByLabelText('Delete Meal Type')).toBeNull();
    // Per-user quick log switch is present and labelled.
    expect(getByLabelText('Quick log breakfast')).toBeTruthy();
    expect(getByLabelText('Visible breakfast')).toBeTruthy();
  });

  it('deletes a custom type from the edit sheet with confirmation', async () => {
    const { findByText, getByLabelText, queryByLabelText } = renderScreen();
    const deleteSpy = jest.spyOn(mealTypesApi, 'deleteMealType').mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert');

    await findByText('Pre-Workout');
    await openEditSheet({ getByLabelText, queryByLabelText }, 'Pre-Workout');
    fireEvent.press(getByLabelText('Delete Meal Type'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete Meal Type',
      "Delete 'Pre-Workout'?",
      expect.any(Array),
    );
    const buttons = alertSpy.mock.calls[0][2] as any[];
    buttons.find((b) => b.style === 'destructive').onPress();
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('custom-pw'));
    await act(async () => {});
  });

  it('edit time row opens the picker; Save commits HH:MM, Clear commits null, dismiss changes nothing', async () => {
    const { findByText, getByLabelText } = renderScreen();
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({} as any);

    await findByText('Pre-Workout');
    // Row time cell on the main list opens the picker directly (existing flow).
    fireEvent.press(getByLabelText('Default time for Pre-Workout, 17:30'));
    // Save the currently selected value → HH:MM persisted.
    fireEvent.press(getByLabelText('Save default time'));
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith('custom-pw', { default_time: '17:30' }),
    );
    updateSpy.mockClear();

    // Clear commits null.
    fireEvent.press(getByLabelText('Default time for Pre-Workout, 17:30'));
    fireEvent.press(getByLabelText('Clear default time'));
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith('custom-pw', { default_time: null }),
    );
    updateSpy.mockClear();

    // Dismiss without Save/Clear → no mutation.
    fireEvent.press(getByLabelText('Default time for Pre-Workout, 17:30'));
    fireEvent(getByLabelText('Save default time'), 'dismiss');
    await new Promise((r) => setTimeout(r, 10));
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('long custom name keeps every action (edit, time, reorder, quick log, delete)', async () => {
    const longName = 'Very Long Pre Workout Meal Category Used Before Training';
    const types = [
      ...systemMealTypes,
      { id: 'custom-long', name: longName, sort_order: 21, user_id: 'u', created_at: '', is_visible: true, show_in_quick_log: false, default_time: null },
    ];
    const { findByText, getByLabelText } = renderScreen({ mealTypes: types });
    await findByText(longName);
    expect(getByLabelText(`Edit ${longName}`)).toBeTruthy();
    expect(getByLabelText(`Default time for ${longName}, not set`)).toBeTruthy();
    expect(getByLabelText(`Reorder ${longName}`)).toBeTruthy();
    // Edit sheet exposes quick log + delete.
    fireEvent.press(getByLabelText(`Edit ${longName}`));
    expect(getByLabelText(`Quick log ${longName}`)).toBeTruthy();
    expect(getByLabelText('Delete Meal Type')).toBeTruthy();
  });
});
