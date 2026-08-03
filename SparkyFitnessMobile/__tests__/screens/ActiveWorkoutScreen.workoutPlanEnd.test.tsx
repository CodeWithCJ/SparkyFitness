import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ActiveWorkoutScreen from '../../src/screens/ActiveWorkoutScreen';
import { ApiError } from '../../src/services/api/errors';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import { __resetAppPreferencesStoreForTests } from '../../src/stores/appPreferencesStore';
import { updateWorkout } from '../../src/services/api/exerciseApi';
import { invalidateExerciseCache } from '../../src/hooks/invalidateExerciseCache';
import { syncExerciseSessionInCache } from '../../src/hooks/syncExerciseSessionInCache';
import { addLog } from '../../src/services/LogService';
import type {
  ExerciseEntrySetResponse,
  PresetSessionResponse,
} from '@workspace/shared';
import type { RootStackScreenProps } from '../../src/types/navigation';

// This suite drives the REAL useActiveWorkoutAutosave hook (unlike the main
// ActiveWorkoutScreen suite, which stubs { flush }), so the End-workout flow
// exercises the full path from the button through saveActiveWorkoutSession to
// the PUT and back. Only the network and cache side-effects are mocked.

jest.mock('../../src/services/api/exerciseApi', () => ({
  updateWorkout: jest.fn(),
  deleteWorkout: jest.fn(),
}));

jest.mock('../../src/hooks/invalidateExerciseCache', () => ({
  invalidateExerciseCache: jest.fn(),
}));

jest.mock('../../src/hooks/syncExerciseSessionInCache', () => ({
  syncExerciseSessionInCache: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({ preferences: null })),
}));

jest.mock('../../src/hooks/useExerciseImageSource', () => ({
  useExerciseImageSource: jest.fn(() => ({
    getImageSource: jest.fn(() => null),
  })),
}));

jest.mock('../../src/hooks/useSelectedExercise', () => ({
  useSelectedExercise: jest.fn(),
}));

jest.mock('../../src/hooks/useNavigationActionGuard', () => ({
  useNavigationActionGuard: jest.fn(() => ({
    runNavigationAction: jest.fn((action: () => void) => action()),
  })),
}));

// Keep the real useSupersetBorders; only the rail's rendering is stubbed out.
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

// Minimal card stand-ins: the suite completes sets through the store, so the
// card only needs to render without touching the network.
jest.mock('../../src/components/ActiveWorkoutExerciseCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => <View testID={`card-${props.exercise.id}`} />,
  };
});

jest.mock('../../src/components/RestPeriodSheet', () => {
  const React = require('react');
  const Component = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: jest.fn(),
      dismiss: jest.fn(),
    }));
    return null;
  });
  Component.displayName = 'RestPeriodSheet';
  return {
    __esModule: true,
    default: Component,
  };
});

jest.mock('../../src/components/WorkoutReorderList', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../src/components/WorkoutDurationSheet', () => {
  const React = require('react');
  const Component = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: jest.fn(),
      dismiss: jest.fn(),
    }));
    return null;
  });
  Component.displayName = 'WorkoutDurationSheet';
  return {
    __esModule: true,
    default: Component,
  };
});

jest.mock('../../src/components/ActionSheet', () => {
  const React = require('react');
  const Component = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: jest.fn(),
      dismiss: jest.fn(),
    }));
    return null;
  });
  Component.displayName = 'ActionSheet';
  return {
    __esModule: true,
    default: Component,
  };
});

const mockUpdateWorkout = updateWorkout as jest.MockedFunction<
  typeof updateWorkout
>;
const mockInvalidate = invalidateExerciseCache as jest.MockedFunction<
  typeof invalidateExerciseCache
>;
const mockSyncCache = syncExerciseSessionInCache as jest.MockedFunction<
  typeof syncExerciseSessionInCache
>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

function makeSet(
  id: number,
  overrides?: Partial<ExerciseEntrySetResponse>,
): ExerciseEntrySetResponse {
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
    is_pr: false,
    ...overrides,
  };
}

function makeSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: '2026-07-01',
    workout_preset_id: null,
    name: 'Plan Day',
    description: null,
    notes: null,
    source: 'Workout Plan',
    total_duration_minutes: 60,
    activity_details: [],
    exercises: [
      {
        id: 'ex-a',
        exercise_id: 'x-ex-a',
        duration_minutes: 20,
        calories_burned: 150,
        entry_date: '2026-07-01',
        notes: null,
        distance: null,
        avg_heart_rate: null,
        source: 'Workout Plan',
        superset_group: null,
        exercise_snapshot: {
          id: 'x-ex-a',
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
          calories_per_hour: 400,
        },
        activity_details: [],
        // Both sets start uncompleted so completeActiveSet logs the first one.
        sets: [makeSet(101), makeSet(102, { set_number: 2 })],
      },
    ],
  };
}

type ActiveWorkoutProps = RootStackScreenProps<'ActiveWorkout'>;

const mockReplace = jest.fn();

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  replace: mockReplace,
  canGoBack: jest.fn(() => true),
  addListener: jest.fn(() => jest.fn()),
} as unknown as ActiveWorkoutProps['navigation'];

const route: ActiveWorkoutProps['route'] = {
  key: 'ActiveWorkout-1',
  name: 'ActiveWorkout',
  params: undefined,
};

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

describe('ActiveWorkoutScreen workout-plan end-to-end save', () => {
  let alertSpy: jest.SpyInstance;

  function lastAlertButton(label: string): { onPress?: () => void } {
    const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    const button = (call?.[2] ?? []).find(
      (b: { text?: string }) => b.text === label,
    );
    expect(button).toBeDefined();
    return button;
  }

  function lastAlertTitle(): string | undefined {
    return alertSpy.mock.calls[alertSpy.mock.calls.length - 1]?.[0];
  }

  function getStore() {
    return useActiveWorkoutStore.getState();
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function pressEndWorkout(getByText: (text: string) => unknown) {
    fireEvent.press(getByText('End Workout') as any);
    expect(lastAlertTitle()).toBe('End workout?');
    await act(async () => {
      lastAlertButton('End Workout').onPress?.();
    });
  }

  it('ends a Workout Plan session through the real autosave flush, saving via PUT and navigating to WorkoutComplete', async () => {
    // Start a Workout Plan session and log one set through a real store action.
    act(() => {
      getStore().startWorkout(makeSession());
      getStore().completeActiveSet();
    });
    expect(getStore().hasUnsavedChanges).toBe(true);

    // Spy on applyServerSession: the flush folds the server response back
    // into the store before the End flow clears it. Capturing the call proves
    // the response (with the persisted completed_at) was accepted, not just
    // that the PUT was sent.
    const originalApply = getStore().applyServerSession;
    const applySpy = jest.fn(originalApply);
    useActiveWorkoutStore.setState({ applyServerSession: applySpy });
    try {
      // Capture the completed_at the store sends in the PUT payload, so we
      // can verify it survives the server echo → applyServerSession →
      // WorkoutComplete nav-params round-trip.
      let sentCompletedAt: string | null | undefined;
      // The server echoes a 200 with an INDEPENDENT object (a deep copy, not
      // a reference into the store) that carries the saved completed_at on
      // the completed set — mirroring what the real backend persists.
      mockUpdateWorkout.mockImplementation(async (_sessionId, payload) => {
        const serverSession = JSON.parse(
          JSON.stringify(getStore().session),
        ) as PresetSessionResponse;
        const sentSet = (
          payload as {
            exercises: {
              sets: { id?: number; completed_at: string | null }[];
            }[];
          }
        ).exercises[0].sets[0];
        sentCompletedAt = sentSet?.completed_at;
        if (sentSet?.completed_at) {
          serverSession.exercises[0].sets[0].completed_at =
            sentSet.completed_at;
        }
        return serverSession;
      });

      const { getByText } = renderScreen();
      await pressEndWorkout(getByText);

      // The final flush hit the PUT with the completed set.
      expect(mockUpdateWorkout).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          exercises: [
            expect.objectContaining({
              sets: [
                expect.objectContaining({
                  reps: 10,
                  weight: 60,
                  completed_at: expect.any(String),
                }),
                expect.anything(),
              ],
            }),
          ],
        }),
      );
      expect(mockSyncCache).toHaveBeenCalled();

      // The store accepted the server response before the workout was
      // cleared: applyServerSession was handed the response with the saved
      // completed_at on the completed set.
      expect(applySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'session-1',
          exercises: [
            expect.objectContaining({
              sets: [
                expect.objectContaining({
                  completed_at: expect.any(String),
                }),
                expect.anything(),
              ],
            }),
          ],
        }),
        expect.any(Number),
        expect.any(Array),
      );

      // No failure warning, and the celebration screen replaced the stack.
      expect(
        alertSpy.mock.calls.some(
          call => call[0] === 'Could not save your workout',
        ),
      ).toBe(false);
      expect(mockReplace).toHaveBeenCalledTimes(1);
      const [routeName, params] = mockReplace.mock.calls[0];
      expect(routeName).toBe('WorkoutComplete');
      expect(params.session.id).toBe('session-1');
      expect(params.session.source).toBe('Workout Plan');
      expect(params.completedSetIds['101']).toBeTruthy();

      // The completed_at that the store sent in the PUT payload survived the
      // server echo → applyServerSession → WorkoutComplete params round-trip.
      expect(params.session.exercises[0].sets[0].completed_at).toBe(
        sentCompletedAt,
      );

      // The store is neither dirty nor still holding the session.
      expect(getStore().session).toBeNull();
      expect(getStore().hasUnsavedChanges).toBe(false);
    } finally {
      useActiveWorkoutStore.setState({ applyServerSession: originalApply });
    }
  });

  it('keeps the local session and warns when the final PUT is rejected with 409', async () => {
    act(() => {
      getStore().startWorkout(makeSession());
      getStore().completeActiveSet();
    });

    // The server rejects the nested update for the plan session (409).
    mockUpdateWorkout.mockRejectedValue(
      new ApiError(
        'Request failed',
        409,
        JSON.stringify({
          message:
            'Nested exercise editing is only supported for manual, sparky, or workout plan sessions.',
        }),
      ),
    );

    const { getByText } = renderScreen();
    await pressEndWorkout(getByText);

    // The failure alert is shown, not the celebration.
    expect(lastAlertTitle()).toBe('Could not save your workout');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();

    // Local data survives: the session and its unsaved completion stay put.
    expect(getStore().session).not.toBeNull();
    expect(getStore().hasUnsavedChanges).toBe(true);
    expect(getStore().completedSetIds['101']).toBeTruthy();

    // The autosave failure was logged with the captured session source and the
    // ApiError status/body — not an Axios-shaped response.
    expect(mockAddLog).toHaveBeenCalledWith(
      'Active workout autosave failed',
      'ERROR',
      [
        'sessionId: session-1',
        'session source: Workout Plan',
        'status: 409',
        expect.stringContaining(
          'Nested exercise editing is only supported for manual, sparky, or workout plan sessions.',
        ),
      ],
    );
    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});
