import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import ActiveWorkoutScreen from '../../src/screens/ActiveWorkoutScreen';
import { useActiveWorkoutAutosave } from '../../src/hooks/useActiveWorkoutAutosave';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import { __resetAppPreferencesStoreForTests } from '../../src/stores/appPreferencesStore';
import type { ActionSheetItem } from '../../src/components/ActionSheet';
import type { PresetSessionResponse } from '@workspace/shared';
import { getActiveServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));
const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: jest.fn(() => true),
}));
const mockUseIsFocused = useIsFocused as jest.MockedFunction<typeof useIsFocused>;

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({ preferences: null })),
}));

jest.mock('../../src/hooks/useExerciseImageSource', () => ({
  useExerciseImageSource: jest.fn(() => ({ getImageSource: jest.fn(() => null) })),
}));

// The real hook imports the workout update API and the screen destructures
// { flush } from it — left unmocked it would fire network on blur/finish.
jest.mock('../../src/hooks/useActiveWorkoutAutosave', () => ({
  useActiveWorkoutAutosave: jest.fn(() => ({ flush: jest.fn(async () => true) })),
}));

jest.mock('../../src/hooks/useSelectedExercise', () => ({
  useSelectedExercise: jest.fn(),
}));

jest.mock('../../src/hooks/useNavigationActionGuard', () => ({
  useNavigationActionGuard: jest.fn(() => ({
    runNavigationAction: jest.fn((action: () => void) => action()),
  })),
}));

// Keep the real useSupersetBorders (the overflow menu's candidate logic
// depends on it); only the rail's rendering is stubbed out.
jest.mock('../../src/components/ActiveWorkoutRail', () => {
  const actual = jest.requireActual('../../src/components/ActiveWorkoutRail');
  return { __esModule: true, ...actual, default: () => null };
});

jest.mock('../../src/components/ActiveWorkoutHeader', () => {
  const React = require('react');
  const { View } = require('react-native');
  const actual = jest.requireActual('../../src/components/ActiveWorkoutHeader');
  return {
    __esModule: true,
    buildExerciseProgress: actual.buildExerciseProgress,
    default: () => <View testID="header" />,
  };
});

// Accessory handles the card mock registers when a test focuses a set's RPE
// cell, keyed by set id, so tests can assert bar-action dispatch.
const mockAccessoryHandles: Record<
  string,
  { log: jest.Mock; focusField: jest.Mock; advance: jest.Mock }
> = {};

// Trigger pressables standing in for each card, driving the screen's wiring.
jest.mock('../../src/components/ActiveWorkoutExerciseCard', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => (
      <View
        testID={`card-${props.exercise.id}`}
        accessibilityLabel={`sourcePresetId:${String(props.sourcePresetId)}`}
      >
        <Pressable
          testID={`card-${props.exercise.id}-overflow`}
          onPress={() => props.onPressOverflow?.(props.exercise.id)}
        />
        {props.exercise.sets.map((set: any) => {
          const key = String(set.id);
          const registerHandle = () => {
            const handle = { log: jest.fn(), focusField: jest.fn(), advance: jest.fn() };
            mockAccessoryHandles[key] = handle;
            props.onRegisterAccessoryHandle?.(key, handle);
          };
          return (
            <React.Fragment key={key}>
              <Pressable
                testID={`focus-rpe-${key}`}
                onPress={() => {
                  registerHandle();
                  props.onActivateRpe?.(key);
                }}
              />
              <Pressable
                testID={`focus-duration-${key}`}
                onPress={() => {
                  registerHandle();
                  props.onActivateSet?.(key, 'duration');
                }}
              />
              <Pressable
                testID={`focus-distance-${key}`}
                onPress={() => {
                  registerHandle();
                  props.onActivateSet?.(key, 'distance');
                }}
              />
            </React.Fragment>
          );
        })}
      </View>
    ),
  };
});

jest.mock('../../src/components/RestPeriodSheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((_props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return null;
    }),
  };
});

jest.mock('../../src/components/WorkoutReorderList', () => ({
  __esModule: true,
  default: () => null,
}));

// Captures the custom-duration sheet's props and present args so tests can
// assert the long-workout adjust wiring and drive onSave directly.
const mockDurationSheet: {
  present: jest.Mock;
  dismiss: jest.Mock;
  props: { onSave: (minutes: number) => void } | null;
} = { present: jest.fn(), dismiss: jest.fn(), props: null };

jest.mock('../../src/components/WorkoutDurationSheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) => {
      React.useEffect(() => {
        mockDurationSheet.props = props;
      });
      React.useImperativeHandle(ref, () => ({
        present: mockDurationSheet.present,
        dismiss: mockDurationSheet.dismiss,
      }));
      return null;
    }),
  };
});

// Captures the sheet's props each render and exposes present/dismiss spies,
// so tests can assert the imperative wiring and drive owner callbacks
// (onBack/onDismiss) directly. The present-lifecycle behavior itself is
// regression-tested in ActionSheet.test.tsx.
const mockSheet: {
  present: jest.Mock;
  dismiss: jest.Mock;
  props: {
    title: string;
    items: ActionSheetItem[];
    onBack?: () => void;
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

function makeSet(id: number, overrides?: Record<string, unknown>) {
  return {
    id,
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

function makeExercise(id: string, name: string, sets: ReturnType<typeof makeSet>[]) {
  return {
    id,
    exercise_id: `x-${id}`,
    duration_minutes: 20,
    calories_burned: 150,
    entry_date: '2026-07-01',
    notes: null,
    distance: null,
    avg_heart_rate: null,
    source: null,
    superset_group: null,
    exercise_snapshot: {
      id: `x-${id}`,
      name,
      category: 'Strength',
      images: [],
      calories_per_hour: 400,
    },
    activity_details: [],
    sets,
  } as any;
}

function makeSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: '2026-07-01',
    workout_preset_id: null,
    name: 'Push Day',
    description: null,
    notes: null,
    source: 'sparky',
    total_duration_minutes: 60,
    activity_details: [],
    exercises: [
      // Exercise A carries a server-completed set so the Clear conditional
      // is on for A only.
      makeExercise('ex-a', 'Bench Press', [
        makeSet(101, { completed_at: '2026-07-01T10:00:00.000Z' }),
        makeSet(102, { set_number: 2 }),
      ]),
      makeExercise('ex-b', 'Squat', [makeSet(201)]),
      makeExercise('ex-c', 'Deadlift', [makeSet(301)]),
    ],
  };
}

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
  addListener: jest.fn(() => jest.fn()),
} as any;
const route = { key: 'ActiveWorkout-1', name: 'ActiveWorkout', params: undefined } as any;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <QueryClientProvider client={queryClient}>
        <ActiveWorkoutScreen navigation={navigation} route={route} />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

function sheetItemKeys(): string[] {
  return (mockSheet.props?.items ?? []).map((item) => item.key);
}

function pressSheetItem(key: string) {
  const item = mockSheet.props?.items.find((i) => i.key === key);
  expect(item).toBeDefined();
  act(() => item!.onPress());
}

describe('ActiveWorkoutScreen overflow menu wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The screen's 1s elapsed tick would otherwise fire outside act().
    jest.useFakeTimers();
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
    mockSheet.props = null;
    useActiveWorkoutStore.getState().startWorkout(makeSession());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('presents the sheet titled with the exercise name and the expected items', () => {
    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('card-ex-a-overflow'));

    expect(mockSheet.present).toHaveBeenCalledTimes(1);
    expect(mockSheet.props?.title).toBe('Bench Press');
    expect(mockSheet.props?.onBack).toBeUndefined();
    expect(sheetItemKeys()).toEqual([
      'view',
      'notes',
      'superset-with',
      'replace',
      'clear',
      'remove',
    ]);
    const remove = mockSheet.props?.items.find((i) => i.key === 'remove');
    expect(remove?.destructive).toBe(true);
  });

  it('offers Clear logged sets only for exercises with a completed set', () => {
    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('card-ex-b-overflow'));

    expect(mockSheet.props?.title).toBe('Squat');
    expect(sheetItemKeys()).not.toContain('clear');
  });

  it('omits Clear logged sets for a completed cardio effort form', () => {
    __resetActiveWorkoutStoreForTests();
    const session = makeSession();
    const cardio = makeExercise('ex-d', 'Running', [
      makeSet(401, {
        completed_at: '2026-07-01T10:00:00.000Z',
        reps: null,
        weight: null,
        duration: 1800,
        distance: 5,
      }),
    ]);
    cardio.exercise_snapshot.modality = 'duration_distance';
    session.exercises.push(cardio);
    useActiveWorkoutStore.getState().startWorkout(session);
    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('card-ex-d-overflow'));

    expect(mockSheet.props?.title).toBe('Running');
    expect(sheetItemKeys()).not.toContain('clear');
  });

  it('swaps to the candidate pick list in place and back', () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('card-ex-a-overflow'));

    const pick = mockSheet.props?.items.find((i) => i.key === 'superset-with');
    expect(pick?.dismissOnPress).toBe(false);
    pressSheetItem('superset-with');

    expect(mockSheet.props?.title).toBe('Superset with…');
    expect(sheetItemKeys()).toEqual(['ex-b', 'ex-c']);
    expect(mockSheet.props?.items.map((i) => i.label)).toEqual(['Squat', 'Deadlift']);
    expect(mockSheet.props?.onBack).toBeDefined();

    act(() => mockSheet.props?.onBack?.());
    expect(mockSheet.props?.title).toBe('Bench Press');
    expect(sheetItemKeys()).toContain('superset-with');
    expect(mockSheet.props?.onBack).toBeUndefined();
  });

  it('groups the picked candidate into a superset', () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('card-ex-a-overflow'));
    pressSheetItem('superset-with');

    pressSheetItem('ex-c');

    const exercises = useActiveWorkoutStore.getState().session?.exercises ?? [];
    const a = exercises.find((e) => e.id === 'ex-a');
    const c = exercises.find((e) => e.id === 'ex-c');
    expect(a?.superset_group).not.toBeNull();
    expect(a?.superset_group).toBe(c?.superset_group);
  });

  it('clears menu state on dismiss and presents fresh for the next card', () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('card-ex-a-overflow'));
    expect(sheetItemKeys().length).toBeGreaterThan(0);

    act(() => mockSheet.props?.onDismiss?.());
    expect(sheetItemKeys()).toEqual([]);

    fireEvent.press(getByTestId('card-ex-b-overflow'));
    expect(mockSheet.present).toHaveBeenCalledTimes(2);
    expect(mockSheet.props?.title).toBe('Squat');
  });
});

describe('ActiveWorkoutScreen keyboard accessory bar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
    useActiveWorkoutStore.getState().startWorkout(makeSession());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("offers Next Set on a completed set's last field instead of Log", () => {
    const { getByTestId, getByText, queryByText } = renderScreen();
    // Set 101 is server-completed; RPE is the walk's last field.
    fireEvent.press(getByTestId('focus-rpe-101'));
    expect(queryByText('Log')).toBeNull();
    fireEvent.press(getByText('Next Set'));
    expect(mockAccessoryHandles['101'].advance).toHaveBeenCalledTimes(1);
  });

  it("keeps Log (and no Next Set) on an uncompleted set's last field", () => {
    const { getByTestId, getByText, queryByText } = renderScreen();
    fireEvent.press(getByTestId('focus-rpe-102'));
    expect(queryByText('Next Set')).toBeNull();
    fireEvent.press(getByText('Log'));
    expect(mockAccessoryHandles['102'].log).toHaveBeenCalledTimes(1);
  });

  const startWithCardio = (completed: boolean) => {
    __resetActiveWorkoutStoreForTests();
    const session = makeSession();
    const cardio = makeExercise('ex-d', 'Running', [
      makeSet(401, {
        completed_at: completed ? '2026-07-01T10:00:00.000Z' : null,
        reps: null,
        weight: null,
        duration: 1800,
        distance: 5,
      }),
    ]);
    cardio.exercise_snapshot.modality = 'duration_distance';
    session.exercises.push(cardio);
    useActiveWorkoutStore.getState().startWorkout(session);
  };

  it('walks Next from a cardio duration field to distance', () => {
    startWithCardio(false);
    const { getByTestId, getByText } = renderScreen();

    fireEvent.press(getByTestId('focus-duration-401'));
    fireEvent.press(getByText('Next'));

    expect(mockAccessoryHandles['401'].focusField).toHaveBeenCalledWith('distance');
  });

  it('offers Log on an uncompleted cardio distance field, never Next Set', () => {
    startWithCardio(false);
    const { getByTestId, getByText, queryByText } = renderScreen();

    fireEvent.press(getByTestId('focus-distance-401'));

    expect(queryByText('Next')).toBeNull();
    expect(queryByText('Next Set')).toBeNull();
    fireEvent.press(getByText('Log'));
    expect(mockAccessoryHandles['401'].log).toHaveBeenCalledTimes(1);
  });

  it('ends a completed cardio bar at Done — no Next Set into a second set', () => {
    startWithCardio(true);
    const { getByTestId, queryByText } = renderScreen();

    fireEvent.press(getByTestId('focus-distance-401'));

    expect(queryByText('Next')).toBeNull();
    expect(queryByText('Next Set')).toBeNull();
    expect(queryByText('Log')).toBeNull();
  });
});

describe('ActiveWorkoutScreen persistent rest bar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
    useActiveWorkoutStore.getState().startWorkout(makeSession());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the bar up while no rest is running, showing the on-deck set', () => {
    const { getByText, getByLabelText } = renderScreen();

    // Set 101 is server-completed, so the cursor starts on Bench Press set 2
    // with the rest state 'ready' — the bar must still be there.
    expect(getByText('Bench Press · Set 2')).toBeTruthy();
    expect(getByLabelText('Complete set')).toBeTruthy();
  });

  it('completes the cursor set from the bar and starts the next rest', () => {
    const { getByLabelText } = renderScreen();

    fireEvent.press(getByLabelText('Complete set'));

    const store = useActiveWorkoutStore.getState();
    expect(store.completedSetIds['102']).toBeTruthy();
    expect(store.activeSetId).toBe('201');
    expect(store.rest.state).toBe('resting');
  });

  it('hides the bar once every set is complete', () => {
    // Completing the final set leaves no next step, so the store lands on
    // 'ready' with a null cursor rather than starting a last rest.
    act(() => {
      const store = useActiveWorkoutStore.getState();
      store.completeSet('102');
      store.completeSet('201');
      store.completeSet('301');
    });

    const { queryByLabelText } = renderScreen();

    expect(queryByLabelText('Complete set')).toBeNull();
    expect(queryByLabelText('Skip rest')).toBeNull();
  });
});

describe('ActiveWorkoutScreen finish flow with a failing flush', () => {
  let alertSpy: jest.SpyInstance;

  function lastAlertButton(label: string): { onPress?: () => void } {
    const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    const button = (call?.[2] ?? []).find((b: { text?: string }) => b.text === label);
    expect(button).toBeDefined();
    return button;
  }

  function lastAlertTitle(): string | undefined {
    return alertSpy.mock.calls[alertSpy.mock.calls.length - 1]?.[0];
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
    useActiveWorkoutStore.getState().startWorkout(makeSession());
    (useActiveWorkoutAutosave as jest.Mock).mockReturnValue({
      flush: jest.fn(async () => false),
    });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function endWorkoutIntoFailedSaveAlert(getByText: (text: string) => unknown) {
    fireEvent.press(getByText('End Workout') as any);
    expect(lastAlertTitle()).toBe('End workout?');
    await act(async () => {
      lastAlertButton('End Workout').onPress?.();
    });
    expect(lastAlertTitle()).toBe('Could not save your workout');
  }

  it('asks for a second confirmation before discarding unsaved changes', async () => {
    const { getByText } = renderScreen();
    await endWorkoutIntoFailedSaveAlert(getByText);

    act(() => lastAlertButton('Discard changes').onPress?.());

    // The mis-tap-prone button must not clear anything on its own.
    expect(lastAlertTitle()).toBe('Discard unsaved changes?');
    expect(useActiveWorkoutStore.getState().session).not.toBeNull();
    expect(navigation.goBack).not.toHaveBeenCalled();

    act(() => lastAlertButton('Discard').onPress?.());
    expect(useActiveWorkoutStore.getState().session).toBeNull();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('keeps the workout when the second confirmation is cancelled', async () => {
    const { getByText } = renderScreen();
    await endWorkoutIntoFailedSaveAlert(getByText);

    act(() => lastAlertButton('Discard changes').onPress?.());
    const cancel = lastAlertButton('Cancel');
    act(() => cancel.onPress?.());

    expect(useActiveWorkoutStore.getState().session).not.toBeNull();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

describe('ActiveWorkoutScreen finish success celebration', () => {
  let alertSpy: jest.SpyInstance;

  function lastAlertButton(label: string): { onPress?: () => void } {
    const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    const button = (call?.[2] ?? []).find((b: { text?: string }) => b.text === label);
    expect(button).toBeDefined();
    return button;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
    (useActiveWorkoutAutosave as jest.Mock).mockReturnValue({
      flush: jest.fn(async () => true),
    });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function endWorkout(getByText: (text: string) => unknown) {
    fireEvent.press(getByText('End Workout') as any);
    await act(async () => {
      lastAlertButton('End Workout').onPress?.();
    });
  }

  it('replaces to WorkoutComplete with a snapshot taken before clearing the store', async () => {
    useActiveWorkoutStore.getState().startWorkout(makeSession(), {
      createdByLiveStart: true,
      plannedSetValues: [[{ weight: 80, reps: 5, duration: null }]],
      sourcePresetId: 42,
      sourceServerConfigId: 'config-1',
    });
    act(() => useActiveWorkoutStore.getState().completeSet('102'));
    const { getByText } = renderScreen();

    await endWorkout(getByText);

    expect(navigation.replace).toHaveBeenCalledTimes(1);
    const [routeName, params] = navigation.replace.mock.calls[0];
    expect(routeName).toBe('WorkoutComplete');
    expect(params.session.id).toBe('session-1');
    // Both the live completion and the server-seeded one ride the snapshot.
    expect(params.completedSetIds['102']).toBeTruthy();
    expect(params.completedSetIds['101']).toBeTruthy();
    expect(params.prSetIds).toEqual({});
    expect(typeof params.finishedAt).toBe('number');
    // The update-preset prompt inputs ride the same pre-clear snapshot.
    expect(params.sourcePresetId).toBe(42);
    expect(params.sourceServerConfigId).toBe('config-1');
    expect(params.plannedSetValues).toEqual({ '101': { weight: 80, reps: 5, duration: null } });
    expect(useActiveWorkoutStore.getState().session).toBeNull();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('skips the celebration and exits as before when no sets were completed', async () => {
    const session = makeSession();
    session.exercises[0].sets[0].completed_at = null;
    useActiveWorkoutStore.getState().startWorkout(session);
    const { getByText } = renderScreen();

    await endWorkout(getByText);

    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalled();
    expect(useActiveWorkoutStore.getState().session).toBeNull();
  });
});

describe('ActiveWorkoutScreen long-workout duration adjust', () => {
  const MIN = 60_000;
  let alertSpy: jest.SpyInstance;
  let startedAtAtFlush: number | null | undefined;

  function lastAlertButton(label: string): { onPress?: () => void } {
    const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    const button = (call?.[2] ?? []).find((b: { text?: string }) => b.text === label);
    expect(button).toBeDefined();
    return button;
  }

  function lastAlertTitle(): string | undefined {
    return alertSpy.mock.calls[alertSpy.mock.calls.length - 1]?.[0];
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
    useActiveWorkoutStore.getState().startWorkout(makeSession());
    startedAtAtFlush = undefined;
    (useActiveWorkoutAutosave as jest.Mock).mockReturnValue({
      // Snapshots startedAt at flush time — the finish flow clears the store
      // right after, so this is the value the duration payload was built from.
      flush: jest.fn(async () => {
        startedAtAtFlush = useActiveWorkoutStore.getState().startedAt;
        return true;
      }),
    });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  /** Complete '102' 5 min in, then '201' 12 h later: active 5 min, span 12h 5m. */
  function completeSetsAroundLongBreak(): { start: number; lastCompletedAt: number } {
    const start = useActiveWorkoutStore.getState().startedAt!;
    const lastCompletedAt = start + 725 * MIN;
    act(() => {
      jest.setSystemTime(start + 5 * MIN);
      useActiveWorkoutStore.getState().completeSet('102');
      jest.setSystemTime(lastCompletedAt);
      useActiveWorkoutStore.getState().completeSet('201');
    });
    return { start, lastCompletedAt };
  }

  async function endWorkout(getByText: (text: string) => unknown) {
    fireEvent.press(getByText('End Workout') as any);
    expect(lastAlertTitle()).toBe('End workout?');
    await act(async () => {
      lastAlertButton('End Workout').onPress?.();
    });
  }

  it('finishes directly when the workout has no long gap', async () => {
    const start = useActiveWorkoutStore.getState().startedAt!;
    act(() => {
      jest.setSystemTime(start + 2 * MIN);
      useActiveWorkoutStore.getState().completeSet('102');
      jest.setSystemTime(start + 4 * MIN);
      useActiveWorkoutStore.getState().completeSet('201');
    });
    const { getByText } = renderScreen();

    await endWorkout(getByText);

    expect(lastAlertTitle()).toBe('End workout?');
    expect(startedAtAtFlush).toBe(start);
    expect(navigation.replace).toHaveBeenCalledWith(
      'WorkoutComplete',
      expect.objectContaining({ finishedAt: expect.any(Number) }),
    );
  });

  it('offers the gap-clamped active time and rebases on accept', async () => {
    const { lastCompletedAt } = completeSetsAroundLongBreak();
    const { getByText } = renderScreen();

    await endWorkout(getByText);
    expect(lastAlertTitle()).toBe('Adjust workout duration?');

    await act(async () => {
      lastAlertButton('Log 5 min').onPress?.();
    });

    expect(startedAtAtFlush).toBe(lastCompletedAt - 5 * MIN);
    expect(useActiveWorkoutStore.getState().session).toBeNull();
    expect(navigation.replace).toHaveBeenCalledWith('WorkoutComplete', expect.anything());
  });

  it('keeps the full span when the user declines', async () => {
    const { start } = completeSetsAroundLongBreak();
    const { getByText } = renderScreen();

    await endWorkout(getByText);

    await act(async () => {
      lastAlertButton('Keep 12h 5m').onPress?.();
    });

    expect(startedAtAtFlush).toBe(start);
    expect(navigation.replace).toHaveBeenCalledWith('WorkoutComplete', expect.anything());
  });

  it('opens the custom sheet capped at the span and finishes with the picked value', async () => {
    const { lastCompletedAt } = completeSetsAroundLongBreak();
    const { getByText } = renderScreen();

    await endWorkout(getByText);

    act(() => {
      lastAlertButton('Custom…').onPress?.();
    });
    expect(mockDurationSheet.present).toHaveBeenCalledWith(5, 725);

    await act(async () => {
      mockDurationSheet.props?.onSave(20);
    });

    expect(startedAtAtFlush).toBe(lastCompletedAt - 20 * MIN);
    expect(navigation.replace).toHaveBeenCalledWith('WorkoutComplete', expect.anything());
  });
});

describe('ActiveWorkoutScreen stale deep link guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('auto-pops when the hydrated store has no session', () => {
    jest.spyOn(useActiveWorkoutStore.persist, 'hasHydrated').mockReturnValue(true);

    renderScreen();

    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('waits for hydration before popping, and keeps a restored session', () => {
    jest.spyOn(useActiveWorkoutStore.persist, 'hasHydrated').mockReturnValue(false);
    let finishHydration: (() => void) | undefined;
    jest
      .spyOn(useActiveWorkoutStore.persist, 'onFinishHydration')
      .mockImplementation(((cb: () => void) => {
        finishHydration = cb;
        return () => {};
      }) as any);

    // A cold-start Live Activity tap lands here before rehydration finishes.
    renderScreen();
    expect(navigation.goBack).not.toHaveBeenCalled();

    // Hydration restores the live workout — the screen must stay put.
    act(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      finishHydration?.();
    });
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('pops once hydration completes with no session', () => {
    jest.spyOn(useActiveWorkoutStore.persist, 'hasHydrated').mockReturnValue(false);
    let finishHydration: (() => void) | undefined;
    jest
      .spyOn(useActiveWorkoutStore.persist, 'onFinishHydration')
      .mockImplementation(((cb: () => void) => {
        finishHydration = cb;
        return () => {};
      }) as any);

    renderScreen();
    expect(navigation.goBack).not.toHaveBeenCalled();

    act(() => finishHydration?.());
    expect(navigation.goBack).toHaveBeenCalled();
  });
});

describe('ActiveWorkoutScreen source preset server-config guard', () => {
  /** Flush the config-check promise chain into the effect's state update. */
  async function flushConfigCheck() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  /** Re-render with a fresh element so the mocked useIsFocused() is re-read. */
  function rerenderScreen(rerender: (ui: React.ReactElement) => void) {
    rerender(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ActiveWorkoutScreen navigation={navigation} route={route} />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockUseIsFocused.mockReturnValue(true);
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('passes sourcePresetId to the stats query when the active server matches', async () => {
    mockGetActiveServerConfig.mockResolvedValue({
      id: 'config-1',
      url: 'https://example.com',
      apiKey: 'key',
    });
    useActiveWorkoutStore.getState().startWorkout(makeSession(), {
      sourcePresetId: 42,
      sourceServerConfigId: 'config-1',
    });
    const { getByTestId } = renderScreen();
    await flushConfigCheck();

    expect(getByTestId('card-ex-a').props.accessibilityLabel).toBe(
      'sourcePresetId:42',
    );
  });

  it('withholds sourcePresetId when the active server no longer matches the one the workout started on', async () => {
    // Preset ids can collide across servers, so a config switched since the
    // workout started must not scope stats to a same-numbered foreign preset.
    mockGetActiveServerConfig.mockResolvedValue({
      id: 'other-config',
      url: 'https://other.example.com',
      apiKey: 'key',
    });
    useActiveWorkoutStore.getState().startWorkout(makeSession(), {
      sourcePresetId: 42,
      sourceServerConfigId: 'config-1',
    });
    const { getByTestId } = renderScreen();
    await flushConfigCheck();

    expect(getByTestId('card-ex-a').props.accessibilityLabel).toBe(
      'sourcePresetId:undefined',
    );
  });

  it('withholds sourcePresetId for a workout that was not started from a preset', async () => {
    useActiveWorkoutStore.getState().startWorkout(makeSession());
    const { getByTestId } = renderScreen();
    await flushConfigCheck();

    expect(getByTestId('card-ex-a').props.accessibilityLabel).toBe(
      'sourcePresetId:undefined',
    );
    expect(mockGetActiveServerConfig).not.toHaveBeenCalled();
  });

  it('re-verifies and clears the stale presetId when the active server changes after an initial successful validation', async () => {
    mockGetActiveServerConfig.mockResolvedValue({
      id: 'config-1',
      url: 'https://example.com',
      apiKey: 'key',
    });
    useActiveWorkoutStore.getState().startWorkout(makeSession(), {
      sourcePresetId: 42,
      sourceServerConfigId: 'config-1',
    });
    const { getByTestId, rerender } = renderScreen();
    await flushConfigCheck();
    expect(getByTestId('card-ex-a').props.accessibilityLabel).toBe(
      'sourcePresetId:42',
    );

    // The user backgrounds this screen (e.g. to Server Settings) and switches
    // the active server. sourcePresetId/sourceServerConfigId are fixed for
    // the whole session, so only the focus transition can catch this — the
    // screen never unmounts.
    mockUseIsFocused.mockReturnValue(false);
    rerenderScreen(rerender);
    await flushConfigCheck();
    // Blurred: the previously-verified id must not linger on screen.
    expect(getByTestId('card-ex-a').props.accessibilityLabel).toBe(
      'sourcePresetId:undefined',
    );

    mockGetActiveServerConfig.mockResolvedValue({
      id: 'other-config',
      url: 'https://other.example.com',
      apiKey: 'key',
    });
    mockUseIsFocused.mockReturnValue(true);
    rerenderScreen(rerender);
    await flushConfigCheck();

    // Refocused against a different server: re-verification must fail, not
    // resurrect the stale, now-foreign preset id 42.
    expect(getByTestId('card-ex-a').props.accessibilityLabel).toBe(
      'sourcePresetId:undefined',
    );
  });

  it('leaves sourcePresetId withheld without throwing when the config lookup rejects', async () => {
    mockGetActiveServerConfig.mockRejectedValue(new Error('storage unavailable'));
    useActiveWorkoutStore.getState().startWorkout(makeSession(), {
      sourcePresetId: 42,
      sourceServerConfigId: 'config-1',
    });

    const { getByTestId } = renderScreen();
    await flushConfigCheck();

    expect(getByTestId('card-ex-a').props.accessibilityLabel).toBe(
      'sourcePresetId:undefined',
    );
  });
});
