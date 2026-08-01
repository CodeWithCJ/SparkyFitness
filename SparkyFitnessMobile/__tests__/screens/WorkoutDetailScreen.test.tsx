import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkoutDetailScreen from '../../src/screens/WorkoutDetailScreen';
import { usePreferences } from '../../src/hooks/usePreferences';
import type { ActionSheetItem } from '../../src/components/ActionSheet';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import type {
  ExerciseEntryResponse,
  ExerciseEntrySetResponse,
  PresetSessionResponse,
} from '@workspace/shared';

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));

jest.mock('../../src/hooks/useExerciseMutations', () => {
  const updateSession = jest.fn();
  return {
    __mockUpdateSession: updateSession,
    useDeleteWorkout: jest.fn(() => ({ confirmAndDelete: jest.fn(), isPending: false })),
    useUpdateWorkout: jest.fn(() => ({
      updateSession,
      isPending: false,
      invalidateCache: jest.fn(),
    })),
  };
});

const mockUpdateSession = jest.requireMock('../../src/hooks/useExerciseMutations')
  .__mockUpdateSession as jest.Mock;

// Force the screen-owned (custom) header so the Edit/Save header actions are
// in the tree — on the native path useScreenHeader mirrors them into
// unstable_header*Items, which the test renderer can't press.
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSTabsActive: jest.fn(() => false),
  useNativeIOSHeadersActive: jest.fn(() => false),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

jest.mock('../../src/hooks/useExerciseImageSource', () => ({
  useExerciseImageSource: jest.fn(() => ({ getImageSource: jest.fn(() => null) })),
}));

// Stub the stats query so no fetch is attempted and the exclusion plumbing
// (session.id → card → hook) is assertable.
jest.mock('../../src/hooks/useExerciseStats', () => ({
  useExerciseStats: jest.fn(() => ({ data: null })),
}));
const mockUseExerciseStats = jest.requireMock('../../src/hooks/useExerciseStats')
  .useExerciseStats as jest.Mock;

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

// The start-workout path fires notification-permission prompts and forgets
// the promise; stub them so tests stay deterministic. requireActual keeps the
// rest of the module intact for the active-workout store's imports.
jest.mock('../../src/services/notifications', () => ({
  ...jest.requireActual('../../src/services/notifications'),
  ensureNotificationPermission: jest.fn(() => Promise.resolve(true)),
  maybePromptForExactAlarmPermission: jest.fn(() => Promise.resolve()),
}));

// Captures the set long-press sheet's props each render and exposes a
// present spy, so tests can assert the imperative wiring and drive item
// onPress callbacks directly (same pattern as ActiveWorkoutScreen.test.tsx).
const mockSheet: {
  present: jest.Mock;
  dismiss: jest.Mock;
  props: {
    title: string;
    items: ActionSheetItem[];
    onDismiss?: () => void;
  } | null;
} = { present: jest.fn(), dismiss: jest.fn(), props: null };

jest.mock('../../src/components/ActionSheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) => {
      React.useEffect(() => {
        mockSheet.props = props;
      });
      React.useImperativeHandle(ref, () => ({
        present: mockSheet.present,
        dismiss: mockSheet.dismiss,
      }));
      return null;
    }),
  };
});

const mockNavigation = {
  setOptions: jest.fn(),
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  setParams: jest.fn(),
  // Returns an unsubscribe; useExerciseSetEditing subscribes to 'transitionEnd'
  // to defer add-exercise activation until the search modal finishes dismissing.
  addListener: jest.fn(() => jest.fn()),
} as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
  // The screen calls useFocusEffect directly (live-session refresh); a no-op
  // keeps rendering synchronous outside a NavigationContainer.
  useFocusEffect: jest.fn(),
}));

const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function buildSet(overrides: Partial<ExerciseEntrySetResponse> = {}): ExerciseEntrySetResponse {
  return {
    id: 101,
    set_number: 1,
    set_type: 'normal',
    reps: 10,
    weight: 60,
    duration: null,
    rest_time: 90,
    notes: null,
    rpe: null,
    completed_at: null,
    ...overrides,
  };
}

function buildExercise(
  overrides: Partial<ExerciseEntryResponse> = {},
): ExerciseEntryResponse {
  return {
    id: 'entry-1',
    exercise_id: 'ex-1',
    duration_minutes: 20,
    calories_burned: 150,
    entry_date: '2026-07-01',
    notes: null,
    distance: null,
    avg_heart_rate: null,
    source: null,
    superset_group: null,
    exercise_snapshot: {
      id: 'ex-1',
      name: 'Bench Press',
      category: 'Strength',
      images: [],
      primary_muscles: null,
      secondary_muscles: null,
      equipment: null,
      instructions: null,
      force: null,
      level: null,
      mechanic: null,
      calories_per_hour: null,
    },
    activity_details: [],
    sets: [buildSet()],
    ...overrides,
  };
}

function buildSession(
  overrides: Partial<PresetSessionResponse> = {},
): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: '2026-07-01',
    workout_preset_id: null,
    name: 'Push Day',
    description: null,
    notes: null,
    source: 'sparky',
    total_duration_minutes: 45,
    exercises: [buildExercise()],
    activity_details: [],
    ...overrides,
  };
}

describe('WorkoutDetailScreen', () => {
  const renderScreen = (session: PresetSessionResponse) => {
    const route = {
      key: 'WorkoutDetail-key',
      name: 'WorkoutDetail' as const,
      params: { session },
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <WorkoutDetailScreen navigation={mockNavigation} route={route as any} />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSheet.props = null;
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
    mockUsePreferences.mockReturnValue({
      preferences: { default_weight_unit: 'kg' },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
  });

  it('renders collapsed exercise rows and expands into the card set table', () => {
    const screen = renderScreen(buildSession());

    expect(screen.getByText('Bench Press')).toBeTruthy();
    expect(screen.getByText('1 sets · 600 kg')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Expand Bench Press'));

    expect(screen.getByText('Reps')).toBeTruthy();
    expect(screen.getByLabelText('Change metric column')).toBeTruthy();
    expect(screen.getByTestId('set-row')).toBeTruthy();
    // View mode: no live-workout editing affordances.
    expect(screen.queryByLabelText('Add set to Bench Press')).toBeNull();
    expect(screen.queryByLabelText('More options for Bench Press')).toBeNull();
  });

  it('derives done vs upcoming set states from server completed_at timestamps', () => {
    const session = buildSession({
      exercises: [
        buildExercise({
          sets: [
            buildSet({ id: 101, set_number: 1, completed_at: '2026-07-01T10:00:00.000Z' }),
            buildSet({ id: 102, set_number: 2, completed_at: null }),
          ],
        }),
      ],
    });
    const screen = renderScreen(session);

    fireEvent.press(screen.getByLabelText('Expand Bench Press'));

    // One static checkmark for the completed set; the pending set renders
    // an empty slot, and neither exposes complete/un-complete controls.
    expect(screen.getAllByTestId('icon-checkmark')).toHaveLength(1);
    expect(screen.queryByLabelText('Un-complete set 1')).toBeNull();
    expect(screen.queryByLabelText('Mark set 2 complete')).toBeNull();
  });

  it('opens the metric menu from the column header and updates the shared store', () => {
    const screen = renderScreen(buildSession());
    fireEvent.press(screen.getByLabelText('Expand Bench Press'));

    fireEvent.press(screen.getByLabelText('Change metric column'));
    fireEvent.press(screen.getByLabelText('Volume'));

    expect(useAppPreferencesStore.getState().activeWorkoutMetricColumn).toBe('volume');
  });

  it('hides the rest chip on imported (non-Sparky) workouts', () => {
    const sparky = renderScreen(buildSession());
    fireEvent.press(sparky.getByLabelText('Expand Bench Press'));
    expect(sparky.getByLabelText('Rest 1:30')).toBeTruthy();
    sparky.unmount();

    const imported = renderScreen(buildSession({ source: 'healthkit' }));
    fireEvent.press(imported.getByLabelText('Expand Bench Press'));
    expect(imported.queryByLabelText('Rest 1:30')).toBeNull();
  });

  describe('save as preset', () => {
    it('routes the header bookmark to the prefilled create form', () => {
      const session = buildSession();
      const screen = renderScreen(session);

      fireEvent.press(screen.getByLabelText('Save as preset'));

      expect(mockNavigation.navigate).toHaveBeenCalledWith('WorkoutPresetForm', {
        mode: 'create-preset',
        sourceSession: session,
      });
    });

    it('stays available for imported (non-Sparky) workouts', () => {
      const session = buildSession({ source: 'healthkit' });
      const screen = renderScreen(session);

      fireEvent.press(screen.getByLabelText('Save as preset'));

      expect(mockNavigation.navigate).toHaveBeenCalledWith('WorkoutPresetForm', {
        mode: 'create-preset',
        sourceSession: session,
      });
    });
  });

  describe('set long-press menu', () => {
    const expandAndLongPressSet = (screen: ReturnType<typeof renderScreen>) => {
      fireEvent.press(screen.getByLabelText('Expand Bench Press'));
      fireEvent(screen.getByTestId('set-row'), 'longPress');
    };

    it('presents Edit and Start-workout-here for a Sparky workout', () => {
      const screen = renderScreen(buildSession());
      expandAndLongPressSet(screen);

      expect(mockSheet.present).toHaveBeenCalled();
      expect(mockSheet.props?.title).toBe('Push Day');
      expect(mockSheet.props?.items.map(i => i.label)).toEqual([
        'Edit',
        'Start workout here',
      ]);
    });

    it('enters edit mode from the Edit item', () => {
      const screen = renderScreen(buildSession());
      expandAndLongPressSet(screen);

      const edit = mockSheet.props?.items.find(i => i.key === 'edit');
      expect(edit).toBeDefined();
      act(() => edit!.onPress());

      expect(screen.getByLabelText('Add set to Bench Press')).toBeTruthy();
    });

    it('starts the workout at the long-pressed set', () => {
      const screen = renderScreen(buildSession());
      expandAndLongPressSet(screen);

      const start = mockSheet.props?.items.find(i => i.key === 'start-here');
      expect(start).toBeDefined();
      act(() => start!.onPress());

      expect(useActiveWorkoutStore.getState().sessionId).toBe('session-1');
      expect(useActiveWorkoutStore.getState().activeSetId).toBe('101');
      expect(mockNavigation.replace).toHaveBeenCalledWith('ActiveWorkout');
    });

    it('omits Start-workout-here while this session is already live', () => {
      const session = buildSession();
      act(() => useActiveWorkoutStore.getState().startWorkout(session));
      const screen = renderScreen(session);
      expandAndLongPressSet(screen);

      expect(mockSheet.props?.items.map(i => i.key)).toEqual(['edit']);
    });

    it('does not open for imported workouts', () => {
      const screen = renderScreen(buildSession({ source: 'healthkit' }));
      expandAndLongPressSet(screen);

      expect(mockSheet.present).not.toHaveBeenCalled();
    });
  });

  describe('edit mode', () => {
    it('excludes the viewed and edited session from the stats baseline', () => {
      const screen = renderScreen(buildSession());

      // View mode: session.id reaches the stats layer so the workout being
      // viewed can't surface as its own Best.
      expect(mockUseExerciseStats).toHaveBeenCalledWith('ex-1', 'session-1');
      expect(mockUseExerciseStats).not.toHaveBeenCalledWith(null, undefined);
      mockUseExerciseStats.mockClear();

      fireEvent.press(screen.getByLabelText('Edit workout'));

      // Edit mode: same exclusion, so the workout being edited can't pollute
      // its own Last/Best/recent-sessions baseline.
      expect(mockUseExerciseStats).toHaveBeenCalledWith('ex-1', 'session-1');
    });

    it('renders edit cards and saves set_type/rpe edits through the payload', async () => {
      mockUpdateSession.mockResolvedValue(buildSession());
      const screen = renderScreen(buildSession());

      fireEvent.press(screen.getByLabelText('Edit workout'));

      // The form list renders the shared card in edit mode with its form
      // affordances.
      expect(screen.getByLabelText('Add set to Bench Press')).toBeTruthy();
      expect(screen.getByLabelText('More options for Bench Press')).toBeTruthy();

      // Tap the set number → set-type menu → Warmup.
      fireEvent.press(screen.getByLabelText('Change type for set 1'));
      fireEvent.press(screen.getByLabelText('Warmup'));

      // Inputs are always mounted in edit mode; type an RPE and blur to snap
      // it to 0.5 steps.
      const rpeInput = screen.getByLabelText('RPE');
      fireEvent.changeText(rpeInput, '8.6');
      fireEvent(rpeInput, 'blur');

      fireEvent.press(screen.getByLabelText('Save'));

      await waitFor(() => expect(mockUpdateSession).toHaveBeenCalled());
      const { payload } = mockUpdateSession.mock.calls[0][0];
      expect(payload.exercises[0].sets[0].set_type).toBe('warmup');
      expect(payload.exercises[0].sets[0].rpe).toBe(8.5);
    });

    it('keeps completed sets editable and lets you toggle completion', () => {
      const screen = renderScreen(
        buildSession({
          exercises: [
            buildExercise({
              sets: [buildSet({ completed_at: '2026-07-01T10:00:00.000Z' })],
            }),
          ],
        }),
      );

      fireEvent.press(screen.getByLabelText('Edit workout'));

      // The completed set shows a green check that now toggles completion.
      expect(screen.getByTestId('completed-badge')).toBeTruthy();
      expect(screen.getByLabelText('Un-complete set 1')).toBeTruthy();
      // The value cells stay editable (always-mounted inputs).
      expect(screen.getByLabelText('Weight')).toBeTruthy();
      expect(screen.getByLabelText('RPE')).toBeTruthy();
    });

    it('persists a completion toggle through the save payload', async () => {
      mockUpdateSession.mockResolvedValue(buildSession());
      const screen = renderScreen(
        buildSession({
          exercises: [
            buildExercise({
              sets: [buildSet({ completed_at: '2026-07-01T10:00:00.000Z' })],
            }),
          ],
        }),
      );

      fireEvent.press(screen.getByLabelText('Edit workout'));
      fireEvent.press(screen.getByLabelText('Un-complete set 1'));
      fireEvent.press(screen.getByLabelText('Save'));

      await waitFor(() => expect(mockUpdateSession).toHaveBeenCalled());
      const { payload } = mockUpdateSession.mock.calls[0][0];
      expect(payload.exercises[0].sets[0].completed_at).toBeNull();
    });
  });

  it('renders a superset rail on each grouped exercise', () => {
    const session = buildSession({
      exercises: [
        buildExercise({ id: 'entry-1', superset_group: 1 }),
        buildExercise({
          id: 'entry-2',
          exercise_id: 'ex-2',
          superset_group: 1,
          exercise_snapshot: {
            id: 'ex-2',
            name: 'Bent-over Row',
            category: 'Strength',
            images: [],
            primary_muscles: null,
            secondary_muscles: null,
            equipment: null,
            instructions: null,
            force: null,
            level: null,
            mechanic: null,
            calories_per_hour: null,
          },
          sets: [buildSet({ id: 201 })],
        }),
      ],
    });
    const screen = renderScreen(session);

    expect(screen.getByTestId('superset-rail-entry-1')).toBeTruthy();
    expect(screen.getByTestId('superset-rail-entry-2')).toBeTruthy();
  });
});
