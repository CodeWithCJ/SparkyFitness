import { act, renderHook } from '@testing-library/react-native';
import type { PresetSessionResponse } from '@workspace/shared';
import { useWatchPlanSync } from '../../src/hooks/useWatchPlanSync';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(() => true),
    updateWorkoutPlan: jest.fn(),
  },
}));

const mockSave = jest.fn(() => Promise.resolve('saved'));
jest.mock('../../src/hooks/useActiveWorkoutAutosave', () => ({
  saveActiveWorkoutSession: () => mockSave(),
}));

const mockUpdateWorkoutPlan = (
  jest.requireMock('../../modules/watch-connectivity') as {
    default: { updateWorkoutPlan: jest.Mock };
  }
).default.updateWorkoutPlan;

function makeSet(id: number) {
  return {
    id,
    set_number: 1,
    set_type: 'normal',
    reps: null,
    weight: null,
    duration: null,
    distance: null,
    rest_time: 90,
    notes: null,
    rpe: null,
  };
}

function makeExercise(entryId: string, name: string, setIds: number[]) {
  return {
    id: entryId,
    exercise_id: `ex-${entryId}`,
    exercise_snapshot: { id: `ex-${entryId}`, name },
    superset_group: null,
    sets: setIds.map(makeSet),
  };
}

function makeSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    name: 'Legs',
    exercises: [
      makeExercise('entry-1', 'Squat', [101, 102]),
      makeExercise('entry-2', 'Leg Press', [201, 202]),
      makeExercise('entry-3', 'Calf Raise', [301, 302]),
    ],
  } as unknown as PresetSessionResponse;
}

const ARMED_AT = 1_790_000_000_000;

function startArmed() {
  act(() => {
    useActiveWorkoutStore.getState().startWorkout(makeSession());
    useActiveWorkoutStore.setState({ watchArmedAt: ARMED_AT });
  });
}

describe('useWatchPlanSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetActiveWorkoutStoreForTests();
  });

  it('sends nothing for the plan the watch was armed with', () => {
    startArmed();
    renderHook(() => useWatchPlanSync(true));
    expect(mockUpdateWorkoutPlan).not.toHaveBeenCalled();
  });

  it('sends the new plan when a superset is made on the phone', () => {
    startArmed();
    renderHook(() => useWatchPlanSync(true));

    act(() => {
      useActiveWorkoutStore.getState().supersetWith('entry-1', 'entry-3');
    });

    expect(mockUpdateWorkoutPlan).toHaveBeenCalledTimes(1);
    const plan = mockUpdateWorkoutPlan.mock.calls[0][0];
    expect(plan).toMatchObject({
      sessionId: 'session-1',
      armedAt: new Date(ARMED_AT).toISOString(),
    });
    expect(plan.revision).toEqual(expect.any(Number));
    expect(
      plan.exercises.map((e: { exerciseEntryId: string }) => e.exerciseEntryId)
    ).toEqual(['entry-1', 'entry-3', 'entry-2']);
    const run = plan.exercises[0].supersetRun;
    expect(run).not.toBeNull();
    expect(plan.exercises[1].supersetRun).toBe(run);
    // Rounds interleave the superset's sets.
    expect(plan.setOrder.slice(0, 4)).toEqual(['101', '301', '102', '302']);
  });

  it('marks a bodyweight exercise so the watch allows a negative weight', () => {
    act(() => {
      const session = makeSession();
      session.exercises[2] = {
        ...session.exercises[2],
        exercise_snapshot: {
          ...session.exercises[2].exercise_snapshot,
          modality: 'bodyweight_reps',
        },
      } as never;
      useActiveWorkoutStore.getState().startWorkout(session);
      useActiveWorkoutStore.setState({ watchArmedAt: ARMED_AT });
    });
    renderHook(() => useWatchPlanSync(true));

    act(() => {
      useActiveWorkoutStore.getState().supersetWith('entry-1', 'entry-3');
    });

    const plan = mockUpdateWorkoutPlan.mock.calls[0][0];
    const flags = Object.fromEntries(
      plan.exercises.map(
        (e: { exerciseEntryId: string; bodyweight?: boolean }) => [
          e.exerciseEntryId,
          e.bodyweight,
        ]
      )
    );
    expect(flags).toEqual({
      'entry-1': false,
      'entry-2': false,
      'entry-3': true,
    });
  });

  it('asks for the save at once when a set has a temporary id, once per change', () => {
    startArmed();
    renderHook(() => useWatchPlanSync(true));
    expect(mockSave).not.toHaveBeenCalled();

    const session = useActiveWorkoutStore.getState().session!;
    const withTemp = {
      ...session,
      exercises: session.exercises.map((exercise, index) =>
        index === 0
          ? { ...exercise, sets: [...exercise.sets, makeSet(-1)] }
          : exercise
      ),
    } as PresetSessionResponse;
    act(() => {
      useActiveWorkoutStore.setState({ session: withTemp });
    });
    expect(mockSave).toHaveBeenCalledTimes(1);

    // An unrelated update while the same temporary id is pending.
    act(() => {
      useActiveWorkoutStore.setState({ session: { ...withTemp } });
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('waits for new sets to get server ids before sending', () => {
    startArmed();
    renderHook(() => useWatchPlanSync(true));

    const withTempSet = () => {
      const session = useActiveWorkoutStore.getState().session!;
      return {
        ...session,
        exercises: session.exercises.map((exercise, index) =>
          index === 0
            ? { ...exercise, sets: [...exercise.sets, makeSet(-1)] }
            : exercise
        ),
      } as PresetSessionResponse;
    };
    act(() => {
      useActiveWorkoutStore.setState({ session: withTempSet() });
    });
    expect(mockUpdateWorkoutPlan).not.toHaveBeenCalled();

    // The autosave response swaps the temporary id for the server's.
    act(() => {
      const session = useActiveWorkoutStore.getState().session!;
      useActiveWorkoutStore.setState({
        session: {
          ...session,
          exercises: session.exercises.map((exercise, index) =>
            index === 0
              ? {
                  ...exercise,
                  sets: exercise.sets.map((set) =>
                    set.id === -1 ? { ...set, id: 103 } : set
                  ),
                }
              : exercise
          ),
        } as PresetSessionResponse,
      });
    });
    expect(mockUpdateWorkoutPlan).toHaveBeenCalledTimes(1);
    const sets = mockUpdateWorkoutPlan.mock.calls[0][0].exercises[0].sets;
    expect(sets.map((s: { setId: string }) => s.setId)).toEqual([
      '101',
      '102',
      '103',
    ]);
  });

  it('sends the plan once a set that was armed with a temporary id gets its server id', () => {
    const armed = makeSession();
    armed.exercises[0]!.sets.push(makeSet(-1) as never);
    act(() => {
      useActiveWorkoutStore.getState().startWorkout(armed);
      useActiveWorkoutStore.setState({ watchArmedAt: ARMED_AT });
    });
    renderHook(() => useWatchPlanSync(true));
    expect(mockUpdateWorkoutPlan).not.toHaveBeenCalled();

    act(() => {
      const session = useActiveWorkoutStore.getState().session!;
      useActiveWorkoutStore.setState({
        session: {
          ...session,
          exercises: session.exercises.map((exercise, index) =>
            index === 0
              ? {
                  ...exercise,
                  sets: exercise.sets.map((set) =>
                    set.id === -1 ? { ...set, id: 103 } : set
                  ),
                }
              : exercise
          ),
        } as PresetSessionResponse,
      });
    });
    expect(mockUpdateWorkoutPlan).toHaveBeenCalledTimes(1);
    const sets = mockUpdateWorkoutPlan.mock.calls[0][0].exercises[0].sets;
    expect(sets.map((s: { setId: string }) => s.setId)).toEqual([
      '101',
      '102',
      '103',
    ]);
  });

  it('sends an empty plan when the last exercise is deleted while armed', () => {
    startArmed();
    renderHook(() => useWatchPlanSync(true));

    act(() => {
      const { removeExercise } = useActiveWorkoutStore.getState();
      removeExercise('entry-1');
      removeExercise('entry-2');
      removeExercise('entry-3');
    });

    expect(mockUpdateWorkoutPlan).toHaveBeenCalled();
    const plan =
      mockUpdateWorkoutPlan.mock.calls[
        mockUpdateWorkoutPlan.mock.calls.length - 1
      ][0];
    expect(plan.sessionId).toBe('session-1');
    expect(plan.exercises).toEqual([]);
  });

  it('sends nothing while the watch is not armed', () => {
    act(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });
    renderHook(() => useWatchPlanSync(true));
    act(() => {
      useActiveWorkoutStore.getState().supersetWith('entry-1', 'entry-3');
    });
    expect(mockUpdateWorkoutPlan).not.toHaveBeenCalled();
  });
});
