import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import Toast from 'react-native-toast-message';
import MealTypeSettingsScreen, {
  resetMealTypeDragPreview,
  useMealTypeRowDragPreviewStyle,
} from '../../src/screens/MealTypeSettingsScreen';
import { TIME_WHEEL_CONTAINER_HEIGHT, TIME_WHEEL_WRAPPER_HEIGHT } from '../../src/components/MealTypeTimeWheel';
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
        return presented ? (
          <View testID="sheet-content">
            <View
              testID="sheet-backdrop"
              onPress={() => {
                setPresented(false);
                onDismiss?.();
              }}
            />
            {children}
          </View>
        ) : null;
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

/**
 * Harness for the shared drag-preview animated-style hook: renders ONE row
 * with controllable shared values, so tests can assert the exact animated
 * style each row kind produces during a drag (active float, sibling shift,
 * commit handoff, idle). The jest reanimated mock runs useAnimatedStyle
 * synchronously and withSpring returns its target value.
 */
function DragPreviewHarness({
  rowIndex,
  active,
  panY,
  committing,
  target,
  strideList,
}: {
  rowIndex: number;
  active: number;
  panY: number;
  committing: number;
  target: number;
  strideList: number[];
}) {
  const activeDragIndex = useSharedValue(active);
  const panYValue = useSharedValue(panY);
  const committingTranslate = useSharedValue(committing);
  const targetIndex = useSharedValue(target);
  const style = useMealTypeRowDragPreviewStyle(
    rowIndex,
    activeDragIndex,
    panYValue,
    committingTranslate,
    targetIndex,
    strideList,
  );
  return <View testID="preview-row" style={style} />;
}

const UNIFORM_STRIDES = [64, 64, 64, 64, 64, 64, 64];

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

function renderScreen(
  overrides: { mealTypes?: any[]; fetchMock?: () => Promise<any[]> } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (overrides.fetchMock) {
    jest.spyOn(mealTypesApi, 'fetchMealTypes').mockImplementation(overrides.fetchMock);
  } else {
    jest
      .spyOn(mealTypesApi, 'fetchMealTypes')
      .mockResolvedValue(overrides.mealTypes ?? allMealTypes);
  }
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
    expect(getByText('Breakfast')).toBeTruthy();
    expect(getByText('Lunch')).toBeTruthy();
    expect(getByText('Dinner')).toBeTruthy();
    expect(getByText('Snacks')).toBeTruthy();
    // Raw lowercase backend identifiers are never exposed for system types.
    expect(queryByText('breakfast')).toBeNull();
    expect(queryByText('snacks')).toBeNull();
  });

  it('system display labels: canonical title-case labels + canonical accessibility', async () => {
    // Backend names are lowercase (breakfast/snacks); UI shows canonical
    // Breakfast/Snacks for system-owned rows, including accessibility.
    const { findByText, getByLabelText, queryByText } = renderScreen();
    await findByText('Breakfast');
    expect(getByLabelText('Edit Breakfast')).toBeTruthy();
    expect(getByLabelText('Visible Breakfast')).toBeTruthy();
    expect(getByLabelText('Default time for Breakfast, 08:00')).toBeTruthy();
    expect(getByLabelText('Edit Snacks')).toBeTruthy();
    expect(getByLabelText('Visible Snacks')).toBeTruthy();
    expect(queryByText('breakfast')).toBeNull();
  });

  it('custom type named "breakfast" stays literal (never canonicalized)', async () => {
    const types = [
      ...systemMealTypes,
      {
        id: 'custom-b',
        name: 'breakfast',
        sort_order: 11,
        user_id: 'u',
        created_at: '',
        is_visible: true,
        show_in_quick_log: true,
        default_time: null,
      },
    ];
    const { findByText, getAllByText, getByText, getByLabelText } = renderScreen({ mealTypes: types });
    // The custom "breakfast" renders its literal lowercase name alongside the
    // system Breakfast anchor (which keeps its canonical label). Accessibility
    // for the custom row stays literal; the system row stays canonical.
    expect(await findByText('breakfast')).toBeTruthy();
    expect(getAllByText('breakfast').length).toBeGreaterThanOrEqual(1);
    expect(getByText('Breakfast')).toBeTruthy(); // system anchor, canonical
    expect(getByLabelText('Visible breakfast')).toBeTruthy(); // custom literal
    expect(getByLabelText('Edit breakfast')).toBeTruthy(); // custom literal
    expect(getByLabelText('Reorder breakfast')).toBeTruthy(); // custom handle
    expect(getByLabelText('Visible Breakfast')).toBeTruthy(); // system canonical
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
    await findByText('Breakfast');
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

  it('main list rows expose a themed Visibility Switch (system + custom)', async () => {
    const { findByText, getByLabelText } = renderScreen();
    await findByText('Pre-Workout');
    expect(getByLabelText('Visible Breakfast')).toBeTruthy();
    expect(getByLabelText('Visible Lunch')).toBeTruthy();
    expect(getByLabelText('Visible Dinner')).toBeTruthy();
    expect(getByLabelText('Visible Snacks')).toBeTruthy();
    expect(getByLabelText('Visible Pre-Workout')).toBeTruthy();
  });

  it('Visibility Switch reconciles the cache after a successful save', async () => {
    // Mutable server state: after the update the server REALLY returns
    // is_visible false, so the onSettled refetch reconciles to false too.
    const serverState: any[] = JSON.parse(JSON.stringify(allMealTypes));
    const fetchMock = async () => serverState;
    const { findByText, getByLabelText, queryClient } = renderScreen({ fetchMock });
    jest.spyOn(mealTypesApi, 'updateMealType').mockImplementation(async (id, data) => {
      const idx = serverState.findIndex((mt) => mt.id === id);
      const updated = { ...serverState[idx], ...data };
      serverState[idx] = updated;
      return updated;
    });
    await findByText('Pre-Workout');

    // 1. Initial state: Switch is ON.
    const toggle = getByLabelText('Visible Breakfast');
    expect(toggle.props.value).toBe(true);

    // 2. Toggle off.
    fireEvent(toggle, 'valueChange', false);

    // 3. Request is the partial payload.
    await waitFor(() => {
      expect(mealTypesApi.updateMealType).toHaveBeenCalledWith('sys-b', {
        is_visible: false,
      });
    });

    // 4. After the mutation resolves the controlled Switch stays false.
    await waitFor(() => {
      expect(getByLabelText('Visible Breakfast').props.value).toBe(false);
    });

    // 5. Query cache contains is_visible false for sys-b (same client).
    await waitFor(() => {
      const cached = queryClient.getQueryData<any[]>(['mealTypes']);
      const sysB = cached?.find((mt) => mt.id === 'sys-b');
      expect(sysB?.is_visible).toBe(false);
    });
    await act(async () => {});
  });

  it('Visibility Switch rolls back on error and shows one update error', async () => {
    const { findByText, getByLabelText } = renderScreen();
    jest
      .spyOn(mealTypesApi, 'updateMealType')
      .mockRejectedValueOnce(new Error('boom'));
    await findByText('Pre-Workout');

    const toggle = getByLabelText('Visible Breakfast');
    expect(toggle.props.value).toBe(true);
    fireEvent(toggle, 'valueChange', false);

    // Optimistic off → on error the Switch returns to true.
    await waitFor(() => {
      expect(getByLabelText('Visible Breakfast').props.value).toBe(true);
    });
    // Exactly one user-facing update error.
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', text1: 'Failed to update' }),
    );
    await act(async () => {});
  });

  it('row-level default time reflects a successful save in the main list', async () => {
    // Mutable server state so the onSettled refetch keeps the new time.
    const serverState: any[] = JSON.parse(JSON.stringify(allMealTypes));
    // A real server returns a NEW array reference each fetch, which lets the
    // onSettled refetch re-render observers.
    const fetchMock = async () => JSON.parse(JSON.stringify(serverState));
    const { findByText, getByLabelText, queryAllByLabelText, queryClient } = renderScreen({ fetchMock });
    jest.spyOn(mealTypesApi, 'updateMealType').mockImplementation(async (id, data) => {
      const idx = serverState.findIndex((mt) => mt.id === id);
      // The server returns the AUTHORITATIVE stored value (e.g. normalized
      // to 18:45 after the picker committed 17:30), proving the row follows
      // the server result, not the stale pre-save cache.
      const updated = { ...serverState[idx], ...data, default_time: '18:45' };
      serverState[idx] = updated;
      return updated;
    });
    await findByText('Pre-Workout');

    fireEvent.press(getByLabelText('Default time for Pre-Workout, 17:30'));
    // Wait for the sheet to present, then press Save.
    await waitFor(() => expect(getByLabelText('Save default time')).toBeTruthy());
    fireEvent.press(getByLabelText('Save default time'));

    // The request fires with the picker's pending HH:MM.
    await waitFor(() => {
      expect(mealTypesApi.updateMealType).toHaveBeenCalledWith('custom-pw', {
        default_time: '17:30',
      });
    });
    // The main-list time text updates to the server-authoritative value without
    // pull-to-refresh.
    await waitFor(
      () => {
        const cached = queryClient.getQueryData<any[]>(['mealTypes']);
        const pw = cached?.find((mt) => mt.id === 'custom-pw');
        expect(pw?.default_time).toBe('18:45');
      },
      { timeout: 3000 },
    );
    // The cache holds 18:45; the rendered row must follow without a manual
    // pull-to-refresh.
    await waitFor(
      () => {
        expect(
          queryAllByLabelText(/Default time for Pre-Workout, 18:45/).length,
        ).toBe(1);
      },
      { timeout: 4000 },
    );
  });

  it('null initial time: Save commits exactly the visible wheel value', async () => {
    const { findByText, getByLabelText } = renderScreen();
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({
      ...customMealTypes[0],
      default_time: null,
    } as any);
    await findByText('Pre-Workout');

    // Custom-pw has 17:30; open the picker for a type WITHOUT a time (dinner).
    fireEvent.press(getByLabelText('Default time for Lunch, Not set'));
    // The wheel seeds pending with the current time; Save commits that HH:MM.
    fireEvent.press(getByLabelText('Save default time'));
    await waitFor(() => {
      const payload = updateSpy.mock.calls[0][1] as any;
      expect(payload.default_time).toMatch(/^\d{2}:\d{2}$/);
    });
    await act(async () => {});
  });

  it('rows stay clean settings rows: no timer pill icon on the main list', async () => {
    const { findByText, queryByTestId } = renderScreen();
    await findByText('Pre-Workout');
    // The nested time pill (timer icon) was removed; the time is plain text.
    expect(queryByTestId('icon-timer')).toBeNull();
  });

  it('time sheet has a large-wheel layout contract and no Selected summary card', async () => {
    const { findByText, getByLabelText, getByTestId, queryByText } = renderScreen();
    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Default time for Pre-Workout, 17:30'));
    expect(getByTestId('large-time-wheel')).toBeTruthy();
    expect(queryByText('Selected')).toBeNull();
  });

  it('dedicated sheet renders the shared wheel with the full-width layout contract and no redundant height wrapper', async () => {
    const { findByText, getByLabelText, getByTestId } = renderScreen();
    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Default time for Pre-Workout, 17:30'));
    const wheel = getByTestId('large-time-wheel');
    // The shared wheel root owns a deterministic full width + its own height.
    expect(wheel.props.style.width).toBe('100%');
    expect(wheel.props.style.alignSelf).toBe('stretch');
    expect(wheel.props.style.height).toBeGreaterThan(0);
    // No alignItems:'center' shrink wrapper around the picker (would collapse
    // the wheel columns' inherited width and blank them on device).
    expect(wheel.props.style.alignItems).not.toBe('center');
    // The shared wheel owns its own deterministic height (the single dimension
    // owner); the dedicated sheet no longer adds a redundant fixed-height
    // wrapper around it.
    expect(wheel.props.style.height).toBe(TIME_WHEEL_WRAPPER_HEIGHT);
  });

  it('create sheet has no Delete, no helper copy, no Selected box — name + large wheel in one flow', async () => {
    const { findByText, getByLabelText, getByTestId, queryByText, queryByLabelText } =
      renderScreen();
    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Add meal type'));
    expect(getByTestId('create-time-wheel')).toBeTruthy();
    expect(queryByLabelText('Delete Meal Type')).toBeNull();
    expect(queryByText(/Used to suggest this meal type/)).toBeNull();
    expect(queryByText('Selected')).toBeNull();
    expect(queryByLabelText('Clear default time')).toBeNull();
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

  it('rapid reorders (deferred): newest order B stays visible and is persisted exactly once', async () => {
    const types = [
      ...systemMealTypes,
      { id: 'a', name: 'A', sort_order: 11, user_id: 'u', created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
      { id: 'b', name: 'B', sort_order: 21, user_id: 'u', created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
    ];
    const serverState: any[] = JSON.parse(JSON.stringify(types));
    const fetchMock = async () => JSON.parse(JSON.stringify(serverState));
    const { findByText, getByLabelText, getAllByLabelText } = renderScreen({ fetchMock });

    // Deferred promises: first persistence (A) stays pending while B arrives.
    let resolveA!: (v: any) => void;
    let resolveB!: (v: any) => void;
    const pendingA = new Promise((res) => { resolveA = res; });
    const pendingB = new Promise((res) => { resolveB = res; });
    const updateSpy = jest
      .spyOn(mealTypesApi, 'updateMealType')
      .mockImplementation(async (id: string, data: any) => {
        const idx = serverState.findIndex((t) => t.id === id);
            if (id === 'a') {
          await pendingA;
          serverState[idx] = { ...serverState[idx], ...data };
          return { ...serverState[idx] };
        }
        await pendingB;
        serverState[idx] = { ...serverState[idx], ...data };
        return { ...serverState[idx] };
      });

    await findByText('A');
    // 1. Drag A down (into l_d) — first persistence request stays pending.
    fireEvent(getByLabelText('Reorder A'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await waitFor(() => expect(updateSpy.mock.calls.filter((c) => c[0] === 'a').length).toBe(1));

    // 2. Drag B up (into b_l) while A is still pending.
    fireEvent(getByLabelText('Reorder B'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });

    // 3. B is visible as the optimistic order (B sits before Lunch).
    await waitFor(() => {
      expect(getAllByLabelText(/^Default time for B(?:,| )/).length).toBeGreaterThan(0);
    });

    // 4. Resolve A's persistence (its snapshot also writes B's l_d slot).
    await act(async () => { resolveA({}); });
    // 5. A's completion must NOT clear B's newer optimistic override.
    await act(async () => {});
    expect(getAllByLabelText(/^Default time for B(?:,| )/).length).toBeGreaterThan(0);

    // 6-7. Allow B's persistence; final list/cache = B (B in b_l, A in l_d).
    await act(async () => { resolveB({}); });
    await act(async () => {});
    await act(async () => {});
    await waitFor(() => {
      // Move A -> l_d=[A,B]; move B (one decrement) -> l_d=[B,A].
      // Snapshot A writes a:21, b:22; snapshot B (newest) writes b:21, a:22.
      // The FINAL order (B before A in l_d) is persisted exactly once by
      // snapshot B — never repeated by a third worker sequence.
      const bCalls = updateSpy.mock.calls.filter((c) => c[0] === 'b').length;
      expect(bCalls).toBe(2);
      const bLast = updateSpy.mock.calls.filter((c) => c[0] === 'b').pop();
      const s = (bLast![1] as any).sort_order;
      expect(s).toBeGreaterThanOrEqual(21);
      expect(s).toBeLessThanOrEqual(29);
    });
    // 8. Unconditional write assertions for both records in BOTH snapshots.
    const aWrites = updateSpy.mock.calls.filter((c) => c[0] === 'a');
    const bWrites = updateSpy.mock.calls.filter((c) => c[0] === 'b');
    expect(aWrites.length).toBe(2); // a:21 (snapshot A), a:22 (snapshot B)
    expect(bWrites.length).toBe(2); // b:22 (snapshot A), b:21 (snapshot B)
    expect((aWrites[0][1] as any).sort_order).toBe(21);
    expect((bWrites[0][1] as any).sort_order).toBe(22);
    expect((bWrites[1][1] as any).sort_order).toBe(21);
    expect((aWrites[1][1] as any).sort_order).toBe(22);
    // 9. No third redundant persistence sequence — the write set is stable.
    await act(async () => {});
    await act(async () => {});
    expect(updateSpy.mock.calls.length).toBe(4);
    // Final server state is B's newest order: B before A in l_d (21, 22).
    expect(serverState.find((t) => t.id === 'b').sort_order).toBe(21);
    expect(serverState.find((t) => t.id === 'a').sort_order).toBe(22);
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
          // The inline wheel shows a concrete time; untouched Create saves
          // exactly the displayed HH:MM (visual state == payload state).
          default_time: expect.stringMatching(/^\d{2}:\d{2}$/),
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

  it('edit custom: name + quick log + time; payload omits is_visible and sort_order', async () => {
    const { findByText, getByLabelText, queryByLabelText, getByPlaceholderText } = renderScreen();
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({} as any);

    await findByText('Pre-Workout');
    // Visibility lives on the MAIN LIST (mockup placement), not in the sheet.
    fireEvent(getByLabelText('Visible Pre-Workout'), 'valueChange', false);
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith('custom-pw', { is_visible: false }),
    );
    updateSpy.mockClear();

    await openEditSheet({ getByLabelText, queryByLabelText }, 'Pre-Workout');
    fireEvent.changeText(getByPlaceholderText('e.g. Lunch 2.0'), 'Pre-Workout 2.0');
    fireEvent.press(getByLabelText('Save meal type'));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'custom-pw',
        expect.objectContaining({
          name: 'Pre-Workout 2.0',
          default_time: '17:30',
          show_in_quick_log: false,
        }),
      );
      const payload = updateSpy.mock.calls[0][1] as any;
      expect(payload.sort_order).toBeUndefined();
      // is_visible is NOT overwritten by a normal edit.
      expect(payload.is_visible).toBeUndefined();
    });
    await act(async () => {});
  });

  it('system edit: name display-only, no Delete, per-user quick log switch present', async () => {
    const { findByText, getByLabelText, queryByLabelText, getAllByText } = renderScreen();
    await findByText('Breakfast');
    // Visibility is on the MAIN LIST for system rows too.
    expect(getByLabelText('Visible Breakfast')).toBeTruthy();
    await openEditSheet({ getByLabelText, queryByLabelText }, 'Breakfast');
    // Display-only name (no editable TextInput); the name appears on the row
    // AND in the read-only field.
    expect(getAllByText('Breakfast').length).toBeGreaterThanOrEqual(2);
    expect(queryByLabelText('Meal type name')).toBeNull();
    expect(queryByLabelText('Delete Meal Type')).toBeNull();
    // Per-user quick log switch is present and labelled in the sheet.
    expect(getByLabelText('Quick log Breakfast')).toBeTruthy();
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
    const { findByText, getByLabelText, getAllByTestId } = renderScreen();
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

    // Dismiss without Save/Clear → no mutation. Press the sheet backdrop
    // (the mock's dismissal path) instead of firing a fake event.
    fireEvent.press(getByLabelText('Default time for Pre-Workout, 17:30'));
    fireEvent.press(getAllByTestId('sheet-backdrop')[0]);
    await act(async () => {});
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
    expect(getByLabelText(`Default time for ${longName}, Not set`)).toBeTruthy();
    expect(getByLabelText(`Reorder ${longName}`)).toBeTruthy();
    // Edit sheet exposes quick log + delete.
    fireEvent.press(getByLabelText(`Edit ${longName}`));
    expect(getByLabelText(`Quick log ${longName}`)).toBeTruthy();
    expect(getByLabelText('Delete Meal Type')).toBeTruthy();
  });

  it('both the dedicated sheet and the inline Create flow use the shared time wheel', async () => {
    const { findByText, getByLabelText, getByTestId, queryAllByTestId } = renderScreen();
    await findByText('Pre-Workout');

    // Dedicated sheet: open the picker from a row time cell.
    fireEvent.press(getByLabelText('Default time for Pre-Workout, 17:30'));
    expect(getByTestId('large-time-wheel')).toBeTruthy();
    expect(queryAllByTestId('create-time-wheel')).toHaveLength(0);

    // Close via backdrop, then open Create: the SAME wheel component renders
    // inline (one shared implementation, one scale/wrapper height).
    fireEvent.press(queryAllByTestId('sheet-backdrop')[0]);
    await act(async () => {});
    fireEvent.press(getByLabelText('Add meal type'));
    expect(getByTestId('create-time-wheel')).toBeTruthy();
    expect(queryAllByTestId('large-time-wheel')).toHaveLength(0);
  });

  it('concurrency: an earlier FAILED visibility update never rolls back a later SUCCESS (different records)', async () => {
    // Deferred promises so the two mutations truly overlap.
    const serverState: any[] = JSON.parse(JSON.stringify(allMealTypes));
    const fetchMock = async () => JSON.parse(JSON.stringify(serverState));
    const { findByText, getByLabelText, queryClient } = renderScreen({ fetchMock });

    let rejectA!: (e: Error) => void;
    let resolveB!: (v: any) => void;
    const pendingA = new Promise((_res, rej) => { rejectA = rej; });
    const pendingB = new Promise((res) => { resolveB = res; });

    const callLog: string[] = [];
    jest.spyOn(mealTypesApi, 'updateMealType').mockImplementation(async (id, data) => {
      callLog.push(id);
      const idx = serverState.findIndex((mt) => mt.id === id);
      const updated = { ...serverState[idx], ...data };
      if (id === 'sys-b') {
        await pendingA;
        serverState[idx] = updated;
        return updated;
      }
      // sys-l
      await pendingB;
      serverState[idx] = updated;
      return updated;
    });

    await findByText('Breakfast');
    // A: Breakfast visible -> false (pending)
    fireEvent(getByLabelText('Visible Breakfast'), 'valueChange', false);
    // B: Lunch visible -> false (pending)
    fireEvent(getByLabelText('Visible Lunch'), 'valueChange', false);

    // B succeeds FIRST, then A fails LATE.
    await act(async () => { resolveB({ ...systemMealTypes[1], is_visible: false }); });
    await act(async () => { rejectA(new Error('boom')); });

    await waitFor(() => {
      const cached = queryClient.getQueryData<any[]>(['mealTypes']);
      const b = cached?.find((mt) => mt.id === 'sys-b');
      const l = cached?.find((mt) => mt.id === 'sys-l');
      expect(b?.is_visible).toBe(true); // rolled back to previous
      expect(l?.is_visible).toBe(false); // B's success preserved
    });
    expect(getByLabelText('Visible Breakfast').props.value).toBe(true);
    expect(getByLabelText('Visible Lunch').props.value).toBe(false);
    await act(async () => {});
  });

  it('concurrency: same record + same field — a newer toggle wins over an older late completion', async () => {
    const serverState: any[] = JSON.parse(JSON.stringify(allMealTypes));
    const fetchMock = async () => JSON.parse(JSON.stringify(serverState));
    const { findByText, getByLabelText, queryClient } = renderScreen({ fetchMock });

    let resolveA!: (v: any) => void;
    let resolveB!: (v: any) => void;
    const pendingA = new Promise((res) => { resolveA = res; });
    const pendingB = new Promise((res) => { resolveB = res; });

    jest.spyOn(mealTypesApi, 'updateMealType').mockImplementation(async (id, data) => {
      const idx = serverState.findIndex((mt) => mt.id === id);
      const updated = { ...serverState[idx], ...data };
      if ((data as any).is_visible === false) {
        await pendingA; // A: Breakfast -> false (pending)
        // A was processed by the server BEFORE B, so its late response is a
        // STALE snapshot — it must not overwrite the server state that B
        // already advanced to true.
        return updated;
      }
      await pendingB; // B: Breakfast -> true (pending)
      serverState[idx] = updated;
      return updated;
    });

    await findByText('Breakfast');
    fireEvent(getByLabelText('Visible Breakfast'), 'valueChange', false); // A
    fireEvent(getByLabelText('Visible Breakfast'), 'valueChange', true); // B

    // B succeeds first, A resolves late — A must NOT overwrite B.
    await act(async () => { resolveB({ ...systemMealTypes[0], is_visible: true }); });
    await act(async () => { resolveA({ ...systemMealTypes[0], is_visible: false }); });

    await waitFor(() => {
      const cached = queryClient.getQueryData<any[]>(['mealTypes']);
      expect(cached?.find((mt) => mt.id === 'sys-b')?.is_visible).toBe(true);
    });
    expect(getByLabelText('Visible Breakfast').props.value).toBe(true);
    await act(async () => {});
  });

  it('concurrency: same record + different fields — both survive adversarial resolution', async () => {
    const serverState: any[] = JSON.parse(JSON.stringify(allMealTypes));
    const fetchMock = async () => JSON.parse(JSON.stringify(serverState));
    const { findByText, getByLabelText, queryClient } = renderScreen({ fetchMock });

    let resolveA!: (v: any) => void;
    let resolveB!: (v: any) => void;
    const pendingA = new Promise((res) => { resolveA = res; });
    const pendingB = new Promise((res) => { resolveB = res; });

    jest.spyOn(mealTypesApi, 'updateMealType').mockImplementation(async (id, data) => {
      const idx = serverState.findIndex((mt) => mt.id === id);
      if ('is_visible' in data) {
        await pendingA;
        // A (visibility) is a different field from B (time): the server only
        // applies is_visible and returns the CURRENT record — it does not
        // revert default_time (a real server would not undo B's field).
        serverState[idx] = { ...serverState[idx], is_visible: (data as any).is_visible };
        return { ...serverState[idx] };
      }
      await pendingB;
      // The server stores the time and returns its AUTHORITATIVE normalized
      // value (18:45) — the picker's pending HH:MM may differ in tests.
      serverState[idx] = { ...serverState[idx], ...data, default_time: '18:45' };
      return { ...serverState[idx], default_time: '18:45' };
    });

    await findByText('Pre-Workout');
    // A: Pre-Workout visibility -> false; B: Pre-Workout default_time -> 18:45
    fireEvent(getByLabelText('Visible Pre-Workout'), 'valueChange', false);
    fireEvent.press(getByLabelText('Default time for Pre-Workout, 17:30'));
    await waitFor(() => expect(getByLabelText('Save default time')).toBeTruthy());
    fireEvent.press(getByLabelText('Save default time')); // pending B (server returns 18:45)

    // Resolve in adversarial order: B (time) first, then A (visibility).
    await act(async () => {
      resolveB({ ...customMealTypes[0], default_time: '18:45' });
    });
    await act(async () => {
      resolveA({ ...customMealTypes[0], is_visible: false, default_time: '17:30' });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<any[]>(['mealTypes']);
      const pw = cached?.find((mt) => mt.id === 'custom-pw');
      expect(pw?.is_visible).toBe(false);
      expect(pw?.default_time).toBe('18:45'); // stale full-record merge must not clobber B
    });
    await act(async () => {});
  });

  it('concurrency: same record + same field + SAME value — newer success survives older failure', async () => {
    // Initial default_time = 16:00; A and B BOTH write 17:30. B succeeds,
    // A fails late. With value-based ownership A would see 17:30 in the cache
    // and restore 16:00 — with token ownership A no longer owns the field.
    const types = [
      ...systemMealTypes,
      {
        id: 'pw',
        name: 'Pre-Workout',
        sort_order: 21,
        user_id: 'u',
        created_at: '',
        is_visible: true,
        show_in_quick_log: true,
        default_time: '16:00',
      },
    ];
    const serverState: any[] = JSON.parse(JSON.stringify(types));
    const fetchMock = async () => JSON.parse(JSON.stringify(serverState));
    const { findByText, getByLabelText, getByTestId, queryAllByLabelText, queryClient } = renderScreen({
      fetchMock,
    });
    let rejectA!: (e: Error) => void;
    let resolveB!: (v: any) => void;
    const pendingA = new Promise((_res, rej) => { rejectA = rej; });
    const pendingB = new Promise((res) => { resolveB = res; });
    let updateCalls = 0;
    jest.spyOn(mealTypesApi, 'updateMealType').mockImplementation(async (id, data) => {
      const idx = serverState.findIndex((t) => t.id === id);
      if (id === 'pw' && (data as any).default_time === '17:30') {
        updateCalls += 1;
        if (updateCalls === 1) {
          await pendingA; // A pending
          throw new Error('boom'); // A fails late (must NOT restore 16:00)
        }
        await pendingB; // B pending (same value)
        serverState[idx] = { ...serverState[idx], default_time: '17:30' };
        return { ...serverState[idx] };
      }
      return { ...serverState[idx], ...(data as object) } as any;
    });

    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Default time for Pre-Workout, 16:00'));
    await waitFor(() => {
      expect(queryAllByLabelText('Save default time').length).toBeGreaterThan(0);
    });
    // Rotate the wheel to 17:30 (the date-picker mock exposes onChange).
    const picker = getByTestId('date-picker');
    fireEvent(picker, 'change', { date: new Date(2024, 0, 1, 17, 30) });
    fireEvent.press(getByLabelText('Save default time')); // A (17:30) — network starts
    await waitFor(() => expect(updateCalls).toBe(1));

    // A's Save closed the sheet; reopen it for B (same value 17:30). The
    // wheel now seeds from the optimistic cache value (17:30), so B sends
    // the same payload. B's NETWORK request is queued behind A (serialized),
    // so updateCalls stays 1 until A settles.
    fireEvent.press(getByLabelText('Default time for Pre-Workout, 17:30'));
    await waitFor(() => {
      expect(queryAllByLabelText('Save default time').length).toBeGreaterThan(0);
    });
    const picker2 = getByTestId('date-picker');
    fireEvent(picker2, 'change', { date: new Date(2024, 0, 1, 17, 30) });
    fireEvent.press(getByLabelText('Save default time')); // B optimistic; queued
    await act(async () => {});
    expect(updateCalls).toBe(1); // serialized: B's PUT waits for A

    // A fails late → no server write; B's queued request then executes.
    await act(async () => { rejectA(new Error('boom')); });
    await waitFor(() => expect(updateCalls).toBe(2));
    await act(async () => { resolveB({ ...types[0], default_time: '17:30' }); });

    await waitFor(() => {
      const cached = queryClient.getQueryData<any[]>(['mealTypes']);
      const pw = cached?.find((mt) => mt.id === 'pw');
      expect(pw?.default_time).toBe('17:30'); // A must NOT restore 16:00
    });
    expect(getByLabelText('Default time for Pre-Workout, 17:30')).toBeTruthy();
    // Exactly one error toast for the failed A.
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', text1: 'Failed to update' }),
    );
    await act(async () => {});
  });

  it('concurrency: same record + same field + SAME visibility value — newer success survives older failure', async () => {
    const serverState: any[] = JSON.parse(JSON.stringify(allMealTypes));
    const fetchMock = async () => JSON.parse(JSON.stringify(serverState));
    const { findByText, getByLabelText } = renderScreen({ fetchMock });
    let rejectA!: (e: Error) => void;
    let resolveB!: (v: any) => void;
    const pendingA = new Promise((_res, rej) => { rejectA = rej; });
    const pendingB = new Promise((res) => { resolveB = res; });
    let visCalls = 0;
    jest.spyOn(mealTypesApi, 'updateMealType').mockImplementation(async (id, data) => {
      if (id === 'sys-b' && (data as any).is_visible === false) {
        visCalls += 1;
        if (visCalls === 1) {
          await pendingA;
          throw new Error('boom'); // A (false) fails late
        }
        await pendingB;
        serverState.find((m: any) => m.id === 'sys-b')!.is_visible = false;
        return { ...serverState.find((m: any) => m.id === 'sys-b') };
      }
      return { ...serverState.find((m: any) => m.id === id), ...(data as object) } as any;
    });

    await findByText('Breakfast');
    fireEvent(getByLabelText('Visible Breakfast'), 'valueChange', false); // A pending
    await waitFor(() => expect(visCalls).toBe(1));
    fireEvent(getByLabelText('Visible Breakfast'), 'valueChange', false); // B (same value) queued
    await act(async () => {});
    expect(visCalls).toBe(1); // serialized: B's PUT waits for A

    // A fails late → no server write; B's queued request then executes.
    await act(async () => { rejectA(new Error('boom')); });
    await waitFor(() => expect(visCalls).toBe(2));
    await act(async () => {
      resolveB({ ...serverState.find((m: any) => m.id === 'sys-b') });
    });

    await waitFor(() => {
      expect(getByLabelText('Visible Breakfast').props.value).toBe(false);
    });
    await act(async () => {});
  });

  it('reorder failure with a NEWER desired order: B stays and is persisted after reconciliation', async () => {
    const types = [
      ...systemMealTypes,
      { id: 'a', name: 'A', sort_order: 11, user_id: 'u', created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
      { id: 'b', name: 'B', sort_order: 21, user_id: 'u', created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
    ];
    const serverState: any[] = JSON.parse(JSON.stringify(types));
    const fetchMock = async () => JSON.parse(JSON.stringify(serverState));
    const { findByText, getByLabelText, getAllByLabelText } = renderScreen({ fetchMock });
    let rejectA!: (e: Error) => void;
    let resolveB!: (v: any) => void;
    const pendingA = new Promise((_res, rej) => { rejectA = rej; });
    const pendingB = new Promise((res) => { resolveB = res; });
    let aCalls = 0;
    const updateSpy = jest
      .spyOn(mealTypesApi, 'updateMealType')
      .mockImplementation(async (id: string, data: any) => {
        const idx = serverState.findIndex((t) => t.id === id);
        if (id === 'a') {
          aCalls += 1;
          if (aCalls === 1) {
            await pendingA;
            throw new Error('boom'); // A persistence fails once
          }
          // A re-written by B's snapshot succeeds.
          serverState[idx] = { ...serverState[idx], ...data };
          return { ...serverState[idx] };
        }
        await pendingB;
        serverState[idx] = { ...serverState[idx], ...data };
        return { ...serverState[idx] };
      });

    await findByText('A');
    fireEvent(getByLabelText('Reorder A'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await waitFor(() => expect(aCalls).toBe(1));
    // Newer desired order arrives while A is pending.
    fireEvent(getByLabelText('Reorder B'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });

    // A fails: exactly one reorder error; B remains the desired order.
    await act(async () => { rejectA(new Error('boom')); });
    await act(async () => {});
    await act(async () => {});
    // B still visible (optimistic override preserved — stale A did not clear it).
    expect(getAllByLabelText(/^Default time for B(?:,| )/).length).toBeGreaterThan(0);
    const reorderErrors = (Toast.show as jest.Mock).mock.calls.filter(
      (c) => (c[0] as any)?.text1 === 'Failed to reorder meal types',
    ).length;
    expect(reorderErrors).toBe(1);

    // B gets persisted after reconciliation; final order B wins.
    // A failed (l_d=[A,B] snapshot) — B's newer desired order is l_d=[B,A]
    // (one decrement moves B up within l_d, before A). B is re-persisted with
    // its canonical slot after reconciliation.
    await act(async () => { resolveB({}); });
    await act(async () => {});
    await act(async () => {});
    await waitFor(() => {
      const bWrites = updateSpy.mock.calls.filter((c) => c[0] === 'b');
      // A's snapshot failed before writing b (a failed first); B's own
      // snapshot (the newest order) persists b once with its canonical slot.
      expect(bWrites.length).toBe(1);
      expect((bWrites[0][1] as any).sort_order).toBe(21);
      // Final server state reflects B's newest order: B before A in l_d.
      expect(serverState.find((t) => t.id === 'b').sort_order).toBe(21);
      expect(serverState.find((t) => t.id === 'a').sort_order).toBe(22);
    });
    await act(async () => {});
  });

  it('REAL server-write race: serialized PUTs make the newest visibility intent the final server value', async () => {
    // Initial Visible = true. A→false (older), B→true (newer). The server has
    // no version token, so only request ORDER protects newest-intent. Because
    // PUTs for the same record are serialized, the server write sequence is
    // exactly A(false) then B(true) — even if we try to resolve adversarially.
    const serverState: any[] = JSON.parse(JSON.stringify(allMealTypes));
    const fetchMock = async () => JSON.parse(JSON.stringify(serverState));
    const { findByText, getByLabelText, queryClient } = renderScreen({ fetchMock });

    let resolveA!: (v: any) => void;
    let resolveB!: (v: any) => void;
    const gateA = new Promise((res) => { resolveA = res; });
    const gateB = new Promise((res) => { resolveB = res; });
    const callLog: string[] = [];
    jest.spyOn(mealTypesApi, 'updateMealType').mockImplementation(async (id, data) => {
      callLog.push(`${id}:${(data as any).is_visible}`);
      const idx = serverState.findIndex((m) => m.id === id);
      if (callLog.length === 1) {
        // A executes first (serialized); apply its write only when it completes.
        await gateA;
        serverState[idx] = { ...serverState[idx], is_visible: (data as any).is_visible };
        return { ...serverState[idx] };
      }
      // B's PUT only starts AFTER A settled; apply B's write.
      await gateB;
      serverState[idx] = { ...serverState[idx], is_visible: (data as any).is_visible };
      return { ...serverState[idx] };
    });

    await findByText('Breakfast');
    expect(getByLabelText('Visible Breakfast').props.value).toBe(true);
    fireEvent(getByLabelText('Visible Breakfast'), 'valueChange', false); // A
    await waitFor(() => expect(callLog.length).toBe(1));
    fireEvent(getByLabelText('Visible Breakfast'), 'valueChange', true); // B (newer intent)
    // Serialized: B's PUT has NOT started while A is pending.
    await waitFor(() => expect(callLog.length).toBe(1));
    // Optimistic UI already shows B's intent (true) even though A is pending.
    await waitFor(() => {
      expect(getByLabelText('Visible Breakfast').props.value).toBe(true);
    });

    // Let A's server write commit (false), then B's (true).
    await act(async () => { resolveA({}); });
    await waitFor(() => expect(callLog.length).toBe(2));
    await act(async () => { resolveB({}); });

    // Final: newest user intent (true) is the server value, cache, and UI.
    await waitFor(() => {
      expect(serverState.find((m: any) => m.id === 'sys-b').is_visible).toBe(true);
      const cached = queryClient.getQueryData<any[]>(['mealTypes']);
      expect(cached?.find((m: any) => m.id === 'sys-b').is_visible).toBe(true);
      expect(getByLabelText('Visible Breakfast').props.value).toBe(true);
    });
    expect(callLog).toEqual(['sys-b:false', 'sys-b:true']);
    await act(async () => {});
  });

  it('REAL time-write race: serialized PUTs make the newest time the final server value', async () => {
    // Initial 16:00. A→17:30 (older), B→18:45 (newer). Final must be 18:45.
    const types = [
      ...systemMealTypes,
      {
        id: 'pw',
        name: 'Pre-Workout',
        sort_order: 21,
        user_id: 'u',
        created_at: '',
        is_visible: true,
        show_in_quick_log: true,
        default_time: '16:00',
      },
    ];
    const serverState: any[] = JSON.parse(JSON.stringify(types));
    const fetchMock = async () => JSON.parse(JSON.stringify(serverState));
    const { findByText, getByLabelText, getByTestId, queryAllByLabelText, queryClient } = renderScreen({ fetchMock });

    let resolveA!: (v: any) => void;
    let resolveB!: (v: any) => void;
    const gateA = new Promise((res) => { resolveA = res; });
    const gateB = new Promise((res) => { resolveB = res; });
    const callLog: string[] = [];
    jest.spyOn(mealTypesApi, 'updateMealType').mockImplementation(async (id, data) => {
      callLog.push((data as any).default_time);
      const idx = serverState.findIndex((t) => t.id === id);
      if (callLog.length === 1) {
        await gateA;
        serverState[idx] = { ...serverState[idx], default_time: (data as any).default_time };
        return { ...serverState[idx] };
      }
      await gateB;
      serverState[idx] = { ...serverState[idx], default_time: (data as any).default_time };
      return { ...serverState[idx] };
    });

    await findByText('Pre-Workout');
    const saveTime = async (hhmm: string) => {
      fireEvent.press(getByLabelText(/Default time for Pre-Workout/));
      await waitFor(() => {
        expect(queryAllByLabelText('Save default time').length).toBeGreaterThan(0);
      });
      const picker = getByTestId('date-picker');
      const [h, m] = hhmm.split(':').map(Number);
      fireEvent(picker, 'change', { date: new Date(2024, 0, 1, h, m) });
      fireEvent.press(getByLabelText('Save default time'));
    };

    await saveTime('17:30'); // A
    await waitFor(() => expect(callLog.length).toBe(1));
    await saveTime('18:45'); // B (newer)
    await act(async () => {});
    expect(callLog.length).toBe(1); // serialized: B's PUT waits for A

    await act(async () => { resolveA({}); });
    await waitFor(() => expect(callLog.length).toBe(2));
    await act(async () => { resolveB({}); });

    await waitFor(() => {
      expect(serverState.find((t: any) => t.id === 'pw').default_time).toBe('18:45');
      const cached = queryClient.getQueryData<any[]>(['mealTypes']);
      expect(cached?.find((t: any) => t.id === 'pw').default_time).toBe('18:45');
      expect(getByLabelText('Default time for Pre-Workout, 18:45')).toBeTruthy();
    });
    expect(callLog).toEqual(['17:30', '18:45']);
    await act(async () => {});
  });

  it('two failures reconcile to the original server state (no stranded optimistic value)', async () => {
    // Initial true. A→false (fails), B→true (fails). Both fail: ownership
    // rolls back to the true optimistic B value, and the final drain refetch
    // reconciles to the authoritative server state (true).
    const serverState: any[] = JSON.parse(JSON.stringify(allMealTypes));
    const fetchMock = async () => JSON.parse(JSON.stringify(serverState));
    const { findByText, getByLabelText, queryClient } = renderScreen({ fetchMock });

    let rejectA!: (e: Error) => void;
    let rejectB!: (e: Error) => void;
    const gateA = new Promise((_res, rej) => { rejectA = rej; });
    const gateB = new Promise((_res, rej) => { rejectB = rej; });
    const callLog: string[] = [];
    jest.spyOn(mealTypesApi, 'updateMealType').mockImplementation(async (id, data) => {
      callLog.push(`${id}:${(data as any).is_visible}`);
      if (callLog.length === 1) {
        await gateA;
        throw new Error('boom A'); // A fails — no server write
      }
      await gateB;
      throw new Error('boom B'); // B fails — no server write
    });

    await findByText('Breakfast');
    fireEvent(getByLabelText('Visible Breakfast'), 'valueChange', false); // A
    await waitFor(() => expect(callLog.length).toBe(1));
    fireEvent(getByLabelText('Visible Breakfast'), 'valueChange', true); // B
    await act(async () => {});
    expect(callLog.length).toBe(1); // serialized

    await act(async () => { rejectA(new Error('boom A')); });
    await waitFor(() => expect(callLog.length).toBe(2));
    await act(async () => { rejectB(new Error('boom B')); });

    // Both failures → cache reconciles to the original server value (true).
    await waitFor(() => {
      const cached = queryClient.getQueryData<any[]>(['mealTypes']);
      expect(cached?.find((m: any) => m.id === 'sys-b').is_visible).toBe(true);
      expect(getByLabelText('Visible Breakfast').props.value).toBe(true);
    });
    // Server never received a write (both requests failed before applying).
    expect(serverState.find((m: any) => m.id === 'sys-b').is_visible).toBe(true);
    await act(async () => {});
  });

  it('delayed cancelQueries: PUT order follows USER-INITIATION order (visibility false then true)', async () => {
    // Initial Visible = true. A→false (older), B→true (newer). A's
    // cancelQueries stays pending while B's resolves first. The queue slot
    // must be reserved synchronously at the user-action boundary, so the
    // server writes remain A(false) then B(true) — NOT B then A.
    const serverState: any[] = JSON.parse(JSON.stringify(allMealTypes));
    const fetchMock = async () => JSON.parse(JSON.stringify(serverState));
    const { findByText, getByLabelText, queryClient } = renderScreen({ fetchMock });

    // Delay A's cancelQueries; let B's resolve immediately.
    let releaseCancelA!: () => void;
    const pendingCancelA = new Promise<void>((resolve) => {
      releaseCancelA = resolve;
    });
    let cancelCalls = 0;
    jest.spyOn(queryClient, 'cancelQueries').mockImplementation(() => {
      cancelCalls += 1;
      if (cancelCalls === 1) return pendingCancelA as never; // A delayed
      return Promise.resolve() as never; // B resolves first
    });

    const callLog: string[] = [];
    jest.spyOn(mealTypesApi, 'updateMealType').mockImplementation(async (id, data) => {
      callLog.push(String((data as any).is_visible));
      const idx = serverState.findIndex((m) => m.id === id);
      // Apply the write only when the PUT actually executes (serialized).
      serverState[idx] = { ...serverState[idx], is_visible: (data as any).is_visible };
      return { ...serverState[idx] };
    });

    await findByText('Breakfast');
    expect(getByLabelText('Visible Breakfast').props.value).toBe(true);
    fireEvent(getByLabelText('Visible Breakfast'), 'valueChange', false); // A
    await waitFor(() => expect(cancelCalls).toBe(1));
    fireEvent(getByLabelText('Visible Breakfast'), 'valueChange', true); // B
    await waitFor(() => expect(cancelCalls).toBe(2));

    // B's optimistic true is visible even though A's cancel is still pending
    // and A's onMutate has not applied its optimistic value.
    await waitFor(() => {
      expect(getByLabelText('Visible Breakfast').props.value).toBe(true);
    });

    // Release A's cancel: A's guarded onMutate must NOT overwrite B's true.
    await act(async () => { releaseCancelA(); });
    await act(async () => {});
    expect(getByLabelText('Visible Breakfast').props.value).toBe(true);

    // PUT order is user-initiation order regardless of cancel completion.
    await waitFor(() => expect(callLog.length).toBe(2));
    expect(callLog).toEqual(['false', 'true']);

    // Final server/cache/UI = true (newest intent).
    await waitFor(() => {
      expect(serverState.find((m: any) => m.id === 'sys-b').is_visible).toBe(true);
      const cached = queryClient.getQueryData<any[]>(['mealTypes']);
      expect(cached?.find((m: any) => m.id === 'sys-b').is_visible).toBe(true);
      expect(getByLabelText('Visible Breakfast').props.value).toBe(true);
    });
    await act(async () => {});
  });

  it('delayed cancelQueries: PUT order follows USER-INITIATION order (time 17:30 then 18:45)', async () => {
    const types = [
      ...systemMealTypes,
      {
        id: 'pw',
        name: 'Pre-Workout',
        sort_order: 21,
        user_id: 'u',
        created_at: '',
        is_visible: true,
        show_in_quick_log: true,
        default_time: '16:00',
      },
    ];
    const serverState: any[] = JSON.parse(JSON.stringify(types));
    const fetchMock = async () => JSON.parse(JSON.stringify(serverState));
    const { findByText, getByLabelText, getByTestId, queryAllByLabelText, queryClient } = renderScreen({ fetchMock });

    let releaseCancelA!: () => void;
    const pendingCancelA = new Promise<void>((resolve) => {
      releaseCancelA = resolve;
    });
    let cancelCalls = 0;
    jest.spyOn(queryClient, 'cancelQueries').mockImplementation(() => {
      cancelCalls += 1;
      if (cancelCalls === 1) return pendingCancelA as never;
      return Promise.resolve() as never;
    });

    const callLog: string[] = [];
    jest.spyOn(mealTypesApi, 'updateMealType').mockImplementation(async (id, data) => {
      callLog.push((data as any).default_time);
      const idx = serverState.findIndex((t) => t.id === id);
      serverState[idx] = { ...serverState[idx], default_time: (data as any).default_time };
      return { ...serverState[idx] };
    });

    await findByText('Pre-Workout');
    const saveTime = async (hhmm: string) => {
      fireEvent.press(getByLabelText(/Default time for Pre-Workout/));
      await waitFor(() => {
        expect(queryAllByLabelText('Save default time').length).toBeGreaterThan(0);
      });
      const picker = getByTestId('date-picker');
      const [h, m] = hhmm.split(':').map(Number);
      fireEvent(picker, 'change', { date: new Date(2024, 0, 1, h, m) });
      fireEvent.press(getByLabelText('Save default time'));
    };

    await saveTime('17:30'); // A — cancel delayed
    await waitFor(() => expect(cancelCalls).toBe(1));
    await saveTime('18:45'); // B — cancel resolves first
    await waitFor(() => expect(cancelCalls).toBe(2));
    await act(async () => {});

    await act(async () => { releaseCancelA(); });
    await act(async () => {});

    await waitFor(() => expect(callLog.length).toBe(2));
    expect(callLog).toEqual(['17:30', '18:45']);

    await waitFor(() => {
      expect(serverState.find((t: any) => t.id === 'pw').default_time).toBe('18:45');
      const cached = queryClient.getQueryData<any[]>(['mealTypes']);
      expect(cached?.find((t: any) => t.id === 'pw').default_time).toBe('18:45');
      expect(getByLabelText('Default time for Pre-Workout, 18:45')).toBeTruthy();
    });
    await act(async () => {});
  });

  it('queue failure: an earlier failed reservation does not block the next update', async () => {
    // A PUT fails; B was reserved after A and must still execute.
    const serverState: any[] = JSON.parse(JSON.stringify(allMealTypes));
    const fetchMock = async () => JSON.parse(JSON.stringify(serverState));
    const { findByText, getByLabelText } = renderScreen({ fetchMock });

    const callLog: string[] = [];
    jest.spyOn(mealTypesApi, 'updateMealType').mockImplementation(async (id, data) => {
      const val = String((data as any).is_visible);
      callLog.push(val);
      const idx = serverState.findIndex((m) => m.id === id);
      if (callLog.length === 1) {
        throw new Error('boom A'); // A fails
      }
      serverState[idx] = { ...serverState[idx], is_visible: (data as any).is_visible };
      return { ...serverState[idx] };
    });

    await findByText('Breakfast');
    fireEvent(getByLabelText('Visible Breakfast'), 'valueChange', false); // A (will fail)
    await waitFor(() => expect(callLog.length).toBe(1));
    fireEvent(getByLabelText('Visible Breakfast'), 'valueChange', true); // B reserved after A

    // B still executes after A failed — no deadlock.
    await waitFor(() => expect(callLog.length).toBe(2));
    expect(callLog).toEqual(['false', 'true']);
    await waitFor(() => {
      expect(getByLabelText('Visible Breakfast').props.value).toBe(true);
    });
    await act(async () => {});
  });

});

describe('Meal type time wheel — visible on-device picker (device bugfix)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('dedicated sheet passes the supported picker sizing API to the wheel', async () => {
    const { findByText, getByLabelText, getByTestId } = renderScreen();
    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Default time for Pre-Workout, 17:30'));
    const picker = getByTestId('date-picker');
    expect(picker.props.timePicker).toBe(true);
    expect(picker.props.initialView).toBe('time');
    expect(picker.props.hideHeader).toBe(true);
    // 24-hour presentation (no AM/PM column) per the maintainer mockup.
    expect(picker.props.use12Hours).toBeFalsy();
    // Full-width stretch contract (the visible-on-Android fix) is on both the
    // shared wheel root and the picker style.
    expect(picker.props.style.width).toBe('100%');
    expect(picker.props.style.alignSelf).toBe('stretch');
    // Explicit supported container height.
    expect(picker.props.containerHeight).toBe(TIME_WHEEL_CONTAINER_HEIGHT);
    // Existing 17:30 seeds the wheel correctly (24h value).
    const d = picker.props.date as Date;
    expect(d.getHours()).toBe(17);
    expect(d.getMinutes()).toBe(30);
  });

  it('unset seeds the current visible time; Save without scrolling commits it', async () => {
    const { findByText, getByLabelText, getByTestId } = renderScreen();
    const updateSpy = jest
      .spyOn(mealTypesApi, 'updateMealType')
      .mockResolvedValue({} as any);
    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Default time for Lunch, Not set'));
    const picker = getByTestId('date-picker');
    const d = picker.props.date as Date;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    expect(`${hh}:${mm}`).toMatch(/^\d{2}:\d{2}$/);
    // Save WITHOUT scrolling commits exactly the visible HH:MM.
    fireEvent.press(getByLabelText('Save default time'));
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('sys-l', { default_time: `${hh}:${mm}` });
    });
    await act(async () => {});
  });

  it('wheel change updates the pending value and Save commits the changed HH:MM', async () => {
    const { findByText, getByLabelText, getByTestId } = renderScreen();
    const updateSpy = jest
      .spyOn(mealTypesApi, 'updateMealType')
      .mockResolvedValue({} as any);
    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Default time for Pre-Workout, 17:30'));
    await waitFor(() => expect(getByLabelText('Save default time')).toBeTruthy());
    // Scroll the wheel to 18:45 (drive the picker's onChange).
    act(() => {
      getByTestId('date-picker').props.onChange({
        date: new Date(2026, 7, 9, 18, 45),
      });
    });
    fireEvent.press(getByLabelText('Save default time'));
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('custom-pw', { default_time: '18:45' });
    });
    await act(async () => {});
  });

  it('Create inline wheel uses the same supported sizing; changing it updates submitted default_time', async () => {
    const { findByText, getByLabelText, getByTestId, getByPlaceholderText } =
      renderScreen();
    const createSpy = jest.spyOn(mealTypesApi, 'createMealType').mockResolvedValue({
      id: 'custom-new',
      name: 'Dessert',
      sort_order: 31,
      user_id: 'user-1',
    } as any);
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({} as any);
    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Add meal type'));
    const picker = getByTestId('date-picker');
    // Same visible wheel contract as the dedicated sheet: full-width stretch,
    // 24-hour, supported sizing.
    expect(picker.props.style.width).toBe('100%');
    expect(picker.props.style.alignSelf).toBe('stretch');
    expect(picker.props.use12Hours).toBeFalsy();
    expect(picker.props.containerHeight).toBe(TIME_WHEEL_CONTAINER_HEIGHT);
    expect(picker.props.timePicker).toBe(true);
    fireEvent.changeText(getByPlaceholderText('e.g. Lunch 2.0'), 'Dessert');
    act(() => {
      picker.props.onChange({ date: new Date(2026, 7, 9, 20, 15) });
    });
    fireEvent.press(getByLabelText('Create meal type'));
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Dessert', default_time: '20:15' }),
      );
    });
    // Quick log default (off) → follow-up update disables it for the new type.
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'custom-new',
        expect.objectContaining({ show_in_quick_log: false }),
      );
    });
    await act(async () => {});
    await act(async () => {});
  });

  it('the sheet dismisses (backdrop) without committing — no stale callback', async () => {
    const { findByText, getByLabelText, getAllByTestId } = renderScreen();
    const updateSpy = jest
      .spyOn(mealTypesApi, 'updateMealType')
      .mockResolvedValue({} as any);
    await findByText('Pre-Workout');
    fireEvent.press(getByLabelText('Default time for Pre-Workout, 17:30'));
    await waitFor(() => expect(getByLabelText('Save default time')).toBeTruthy());
    act(() => {
      getAllByTestId('date-picker')[0].props.onChange({
        date: new Date(2026, 7, 9, 12, 0),
      });
    });
    // Dismiss via the sheet backdrop — the pending wheel value must be
    // discarded and no update fired.
    fireEvent.press(getAllByTestId('sheet-backdrop')[0]);
    await act(async () => {});
    expect(updateSpy).not.toHaveBeenCalled();
    // Reopening starts from a CLEAN pending value (no stale 12:00): the row
    // still shows the original 17:30.
    fireEvent.press(getByLabelText('Default time for Pre-Workout, 17:30'));
    expect(getByLabelText('Save default time')).toBeTruthy();
    await act(async () => {});
  });
});

describe('Meal type drag preview — live sibling shift (device bugfix)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('active row floats: translateY follows the finger with lift scale + shadow', () => {
    const { getByTestId } = render(
      <DragPreviewHarness
        rowIndex={1}
        active={1}
        panY={129}
        committing={0}
        target={3}
        strideList={UNIFORM_STRIDES}
      />,
    );
    const style = getByTestId('preview-row').props.style;
    expect(style.transform).toEqual([{ translateY: 129 }, { scale: 1.02 }]);
    expect(style.zIndex).toBe(10);
    expect(style.elevation).toBe(8);
  });

  it('downward drag: sibling rows between active and target shift UP one stride', () => {
    // active=1, target=3: rows 2 and 3 shift -64; row 4 stays put.
    const row2 = render(
      <DragPreviewHarness
        rowIndex={2}
        active={1}
        panY={129}
        committing={0}
        target={3}
        strideList={UNIFORM_STRIDES}
      />,
    );
    expect(row2.getByTestId('preview-row').props.style.transform).toEqual([
      { translateY: -64 },
      { scale: 1 },
    ]);
    const row3 = render(
      <DragPreviewHarness
        rowIndex={3}
        active={1}
        panY={129}
        committing={0}
        target={3}
        strideList={UNIFORM_STRIDES}
      />,
    );
    expect(row3.getByTestId('preview-row').props.style.transform).toEqual([
      { translateY: -64 },
      { scale: 1 },
    ]);
    const row4 = render(
      <DragPreviewHarness
        rowIndex={4}
        active={1}
        panY={129}
        committing={0}
        target={3}
        strideList={UNIFORM_STRIDES}
      />,
    );
    expect(row4.getByTestId('preview-row').props.style.transform).toEqual([
      { translateY: 0 },
      { scale: 1 },
    ]);
  });

  it('upward drag: rows between target and active shift DOWN one stride', () => {
    // active=3, target=1: rows 1 and 2 shift +64.
    const row1 = render(
      <DragPreviewHarness
        rowIndex={1}
        active={3}
        panY={-129}
        committing={0}
        target={1}
        strideList={UNIFORM_STRIDES}
      />,
    );
    expect(row1.getByTestId('preview-row').props.style.transform).toEqual([
      { translateY: 64 },
      { scale: 1 },
    ]);
  });

  it('crossing a system anchor: the anchor row VISUALLY shifts as a passive sibling', () => {
    // Unified [Breakfast(0) A(1) Lunch(2) B(3) Dinner(4)]; A dragged past
    // Lunch (target 3): Lunch (index 2) and B (index 3) shift up one stride.
    // The anchor participates in the preview even though it can never be
    // dragged or persisted.
    const lunch = render(
      <DragPreviewHarness
        rowIndex={2}
        active={1}
        panY={129}
        committing={0}
        target={3}
        strideList={UNIFORM_STRIDES}
      />,
    );
    expect(lunch.getByTestId('preview-row').props.style.transform).toEqual([
      { translateY: -64 },
      { scale: 1 },
    ]);
    // A row OUTSIDE the crossed range (before the active index) stays put;
    // the anchor is never the active row in the real list.
    const dinner = render(
      <DragPreviewHarness
        rowIndex={0}
        active={3}
        panY={129}
        committing={0}
        target={4}
        strideList={UNIFORM_STRIDES}
      />,
    );
    expect(dinner.getByTestId('preview-row').props.style.transform).toEqual([
      { translateY: 0 },
      { scale: 1 },
    ]);
  });

  it('commit handoff: active row keeps its FINAL translate after pan resets (no snap-back)', () => {
    // During the handoff the JS reorder is in flight; panY is already 0 but
    // committingTranslate holds the final drop offset, so the row stays put.
    const { getByTestId } = render(
      <DragPreviewHarness
        rowIndex={1}
        active={1}
        panY={0}
        committing={129}
        target={3}
        strideList={UNIFORM_STRIDES}
      />,
    );
    const style = getByTestId('preview-row').props.style;
    expect(style.transform).toEqual([{ translateY: 129 }, { scale: 1.02 }]);
    // After the new order renders, the shared values reset (active=-1) and
    // the transform returns to identity — the array order now holds the rows
    // at their preview positions, so this is a visual no-op.
    const idle = render(
      <DragPreviewHarness
        rowIndex={1}
        active={-1}
        panY={0}
        committing={0}
        target={-1}
        strideList={UNIFORM_STRIDES}
      />,
    );
    expect(idle.getByTestId('preview-row').props.style.transform).toEqual([
      { translateY: 0 },
      { scale: 1 },
    ]);
  });

  it('system rows are animated shells with NO drag handle and NO reorder accessibility actions', async () => {
    const { findByText, getByTestId, getByLabelText, queryByTestId, queryByLabelText } =
      renderScreen();
    await findByText('Pre-Workout');
    // System row renders (animated shell) with its content.
    expect(getByTestId('meal-type-system-sys-b')).toBeTruthy();
    expect(getByLabelText('Edit Breakfast')).toBeTruthy();
    // But: no drag handle, no adjustable/reorder semantics.
    expect(queryByTestId('drag-handle-sys-b')).toBeNull();
    expect(queryByLabelText('Reorder Breakfast')).toBeNull();
    // Custom rows keep the handle + Move up/down actions.
    expect(getByTestId('drag-handle-custom-pw')).toBeTruthy();
    expect(getByLabelText('Reorder Pre-Workout')).toBeTruthy();
  });

  it('full-gap drop rejection releases the frozen drag preview (CodeRabbit P1)', async () => {
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
    const types = [
      ...systemMealTypes,
      {
        id: 'brunch',
        name: 'Brunch',
        sort_order: 11,
        user_id: 'u',
        created_at: '',
        is_visible: true,
        show_in_quick_log: true,
        default_time: null,
      },
      ...fullGap,
    ];
    const { findByText, getByLabelText } = renderScreen({ mealTypes: types });
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({} as any);
    await findByText('Brunch');

    // Screen-level: the rejected drop shows one toast and writes nothing.
    // (fireEvent FIRST — the harness renders below would unmount/disconnect
    // the screen tree for further event dispatch.)
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
    expect(updateSpy).not.toHaveBeenCalled();

    // The frozen-preview state the gesture leaves behind on a rejected drop:
    const frozen = render(
      <DragPreviewHarness
        rowIndex={1}
        active={1}
        panY={0}
        committing={129}
        target={3}
        strideList={UNIFORM_STRIDES}
      />,
    );
    expect(frozen.getByTestId('preview-row').props.style.transform).toEqual([
      { translateY: 129 },
      { scale: 1.02 },
    ]);
    // resetMealTypeDragPreview is EXACTLY what the rejection path calls; after
    // it, the row's preview style returns to idle (identity transform).
    const activeDragIndex = { value: 1 };
    const panY = { value: 0 };
    const committingTranslate = { value: 129 };
    resetMealTypeDragPreview(
      activeDragIndex as any,
      panY as any,
      committingTranslate as any,
    );
    expect(committingTranslate.value).toBe(0);
    expect(activeDragIndex.value).toBe(-1);
    expect(panY.value).toBe(0);
    const idle = render(
      <DragPreviewHarness
        rowIndex={1}
        active={-1}
        panY={0}
        committing={0}
        target={-1}
        strideList={UNIFORM_STRIDES}
      />,
    );
    expect(idle.getByTestId('preview-row').props.style.transform).toEqual([
      { translateY: 0 },
      { scale: 1 },
    ]);
    await act(async () => {});
  });

  it('accessibility Move up/down still uses the SAME reorder semantics as the gesture', async () => {
    const types = [
      ...systemMealTypes,
      { id: 'a', name: 'A', sort_order: 11, user_id: 'u', created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
      { id: 'b', name: 'B', sort_order: 21, user_id: 'u', created_at: '', is_visible: true, show_in_quick_log: true, default_time: null },
    ];
    const { findByText, getByLabelText } = renderScreen({ mealTypes: types });
    const updateSpy = jest.spyOn(mealTypesApi, 'updateMealType').mockResolvedValue({} as any);
    await findByText('A');
    // Move A down (into the Lunch→Dinner gap) via the accessible action.
    fireEvent(getByLabelText('Reorder A'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('a', { sort_order: expect.any(Number) });
      const write = updateSpy.mock.calls[0][1] as any;
      expect(write.sort_order).toBeGreaterThanOrEqual(21);
      expect(write.sort_order).toBeLessThanOrEqual(29);
    });
    await act(async () => {});
  });
});
