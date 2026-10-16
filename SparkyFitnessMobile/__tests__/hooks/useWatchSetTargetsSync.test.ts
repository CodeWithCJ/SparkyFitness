import { act, renderHook } from '@testing-library/react-native';
import type { PresetSessionResponse } from '@workspace/shared';
import { useWatchSetTargetsSync } from '../../src/hooks/useWatchSetTargetsSync';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(() => true),
    updateSetTargets: jest.fn(),
  },
}));

const mockUpdateSetTargets = (
  jest.requireMock('../../modules/watch-connectivity') as {
    default: { updateSetTargets: jest.Mock };
  }
).default.updateSetTargets;

function makeSet(id: number) {
  return {
    id,
    set_number: id,
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

function makeSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    exercises: [
      {
        id: 'entry-1',
        exercise_id: 'ex-1',
        exercise_snapshot: { id: 'ex-1', name: 'Bench Press' },
        sets: [makeSet(101), makeSet(102)],
      },
    ],
  } as unknown as PresetSessionResponse;
}

const ARMED_AT = 1_790_000_000_000;

const previousSets = [
  { setNumber: 1, setType: 'normal', weight: 100, reps: 8 },
  { setNumber: 2, setType: 'normal', weight: 100, reps: 8 },
];

describe('useWatchSetTargetsSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetActiveWorkoutStoreForTests();
  });

  it('sends the planned targets, then the progressed weight once history loads', () => {
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
        watchArmedAt: ARMED_AT,
        weightUnit: 'lbs',
        plannedSetValues: {
          '101': { weight: 100, reps: 8, duration: null, distance: null },
          '102': { weight: 100, reps: 8, duration: null, distance: null },
        },
        exerciseConfigs: {
          'entry-1': {
            progression_mode: 'rep_goal',
            rep_goal: 16,
            increment_type: 'weight',
            increment_value: 2.5,
          },
        },
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));

    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(1);
    expect(mockUpdateSetTargets.mock.calls[0][0]).toMatchObject({
      sessionId: 'session-1',
      armedAt: ARMED_AT,
      targets: [
        { setId: '101', targetWeightKg: 100, targetReps: 8 },
        { setId: '102', targetWeightKg: 100, targetReps: 8 },
      ],
    });

    act(() => {
      useActiveWorkoutStore.setState({
        previousSessionSets: { 'ex-1': previousSets },
      });
    });

    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(2);
    const update = mockUpdateSetTargets.mock.calls[1][0];
    expect(update.targets).toEqual([
      { setId: '101', targetWeightKg: 102.5, targetReps: 8 },
      { setId: '102', targetWeightKg: 102.5, targetReps: 8 },
    ]);
    expect(update.revision).toBeGreaterThan(
      mockUpdateSetTargets.mock.calls[0][0].revision
    );
  });

  it('sends only the newest running set timer, and falls back as its set is logged', () => {
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
        watchArmedAt: ARMED_AT,
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets.mock.calls[0][0].setTimers).toEqual({});

    act(() => {
      useActiveWorkoutStore.setState({
        setTimerStartedAt: {
          '101': 1_700_000_000_000,
          '102': 1_700_000_005_000,
        },
      });
    });
    // The watch holds one timer, so the older one is not sent.
    expect(mockUpdateSetTargets.mock.calls.at(-1)?.[0].setTimers).toEqual({
      '102': 1_700_000_005_000,
    });

    act(() => {
      useActiveWorkoutStore.setState({ completedSetIds: { '102': 1000 } });
    });
    expect(mockUpdateSetTargets.mock.calls.at(-1)?.[0].setTimers).toEqual({
      '101': 1_700_000_000_000,
    });
  });

  it('sends the logged sets that are personal records', () => {
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
        watchArmedAt: ARMED_AT,
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets.mock.calls[0][0].prSetIds).toEqual([]);

    act(() => {
      useActiveWorkoutStore.setState({
        completedSetIds: { '101': 1000 },
        prSetIds: { '101': true, '102': true },
      });
    });

    // '102' carries a stale flag but is not logged.
    expect(mockUpdateSetTargets.mock.calls.at(-1)?.[0].prSetIds).toEqual([
      '101',
    ]);
  });

  it('sends the sets logged on the phone, and again when one is logged', () => {
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
        watchArmedAt: ARMED_AT,
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets.mock.calls[0][0].completedSetIds).toEqual([]);

    act(() => {
      useActiveWorkoutStore.setState({ completedSetIds: { '101': 1000 } });
    });

    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(2);
    expect(mockUpdateSetTargets.mock.calls[1][0].completedSetIds).toEqual([
      '101',
    ]);
  });

  it("sends the phone's running rest, and omits it when none is running", () => {
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
        watchArmedAt: ARMED_AT,
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets.mock.calls[0][0]).not.toHaveProperty(
      'restEndsAt'
    );
    expect(mockUpdateSetTargets.mock.calls[0][0].restState).toBe('ready');

    act(() => {
      useActiveWorkoutStore.setState({
        completedSetIds: { '101': 1000 },
        rest: {
          state: 'resting',
          durationSec: 90,
          endsAt: 1_790_000_090_000,
          pausedRemainingMs: null,
          scheduledNotificationId: null,
          instanceToken: 1,
        },
      });
    });

    expect(mockUpdateSetTargets.mock.calls[1][0]).toMatchObject({
      completedSetIds: ['101'],
      restState: 'resting',
      restEndsAt: 1_790_000_090_000,
      restDurationSeconds: 90,
    });
  });

  it('sends a rest changed on the phone: +15s, pause and skip', () => {
    const resting = {
      state: 'resting' as const,
      durationSec: 90,
      endsAt: 1_790_000_090_000,
      pausedRemainingMs: null,
      scheduledNotificationId: null,
      instanceToken: 1,
    };
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
        watchArmedAt: ARMED_AT,
        completedSetIds: { '101': 1000 },
        rest: resting,
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(1);

    act(() => {
      useActiveWorkoutStore.setState({
        rest: {
          ...resting,
          durationSec: 105,
          endsAt: 1_790_000_105_000,
          instanceToken: 2,
        },
      });
    });
    expect(mockUpdateSetTargets.mock.calls[1][0]).toMatchObject({
      restState: 'resting',
      restEndsAt: 1_790_000_105_000,
      restDurationSeconds: 105,
    });

    act(() => {
      useActiveWorkoutStore.setState({
        rest: {
          ...resting,
          state: 'paused',
          endsAt: null,
          pausedRemainingMs: 40_000,
        },
      });
    });
    const paused = mockUpdateSetTargets.mock.calls[2][0];
    expect(paused.restState).toBe('paused');
    expect(paused).not.toHaveProperty('restEndsAt');

    act(() => {
      useActiveWorkoutStore.getState().dismissRest();
    });
    const skipped = mockUpdateSetTargets.mock.calls[3][0];
    expect(skipped.restState).toBe('ready');
    expect(skipped).not.toHaveProperty('restEndsAt');
  });

  it('does not resend when the resolved targets are unchanged', () => {
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
        watchArmedAt: ARMED_AT,
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(1);

    act(() => {
      useActiveWorkoutStore.setState({ declinedAdaptive: {} });
    });
    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(1);
  });

  it('prefers a value already entered on the phone and omits empty fields', () => {
    const session = makeSession();
    session.exercises[0].sets[0].weight = 110;
    act(() => {
      useActiveWorkoutStore.setState({
        session,
        sessionId: 'session-1',
        watchArmedAt: ARMED_AT,
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));

    expect(mockUpdateSetTargets.mock.calls[0][0].targets).toEqual([
      { setId: '101', targetWeightKg: 110 },
      { setId: '102', targetWeightKg: 110 },
    ]);
  });

  it('sends nothing while disabled or without a live preset session', () => {
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets).not.toHaveBeenCalled();

    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
        watchArmedAt: ARMED_AT,
      });
    });
    renderHook(() => useWatchSetTargetsSync(false));
    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(1);
  });

  it('waits for the watch to be armed, and resends everything on a re-arm', () => {
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
        completedSetIds: { '101': 1000 },
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets).not.toHaveBeenCalled();

    act(() => {
      useActiveWorkoutStore.setState({ watchArmedAt: ARMED_AT });
    });
    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(1);
    expect(mockUpdateSetTargets.mock.calls[0][0]).toMatchObject({
      armedAt: ARMED_AT,
      completedSetIds: ['101'],
    });

    // Same targets and completions, but a fresh plan on the watch.
    act(() => {
      useActiveWorkoutStore.setState({ watchArmedAt: ARMED_AT + 5_000 });
    });
    expect(mockUpdateSetTargets).toHaveBeenCalledTimes(2);
    expect(mockUpdateSetTargets.mock.calls[1][0]).toMatchObject({
      armedAt: ARMED_AT + 5_000,
      completedSetIds: ['101'],
    });
  });

  it('sends a hold length for a duration exercise, not its reps', () => {
    const session = makeSession();
    session.exercises[0].exercise_snapshot = {
      id: 'ex-1',
      name: 'Plank',
      modality: 'duration',
    } as (typeof session.exercises)[0]['exercise_snapshot'];
    session.exercises[0].sets[0].duration = 45;
    session.exercises[0].sets[1].reps = 30;
    act(() => {
      useActiveWorkoutStore.setState({
        session,
        sessionId: 'session-1',
        watchArmedAt: ARMED_AT,
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets.mock.calls[0][0].targets).toEqual([
      { setId: '101', targetDurationSec: 45 },
      { setId: '102', targetDurationSec: 30 },
    ]);
  });

  it('sends a loaded hold with its weight and hold length, no reps', () => {
    const session = makeSession();
    session.exercises[0].exercise_snapshot = {
      id: 'ex-1',
      name: 'Weighted Plank',
      modality: 'weight_duration',
    } as (typeof session.exercises)[0]['exercise_snapshot'];
    session.exercises[0].sets[0].weight = 20;
    session.exercises[0].sets[0].duration = 45;
    session.exercises[0].sets[0].reps = 10;
    act(() => {
      useActiveWorkoutStore.setState({
        session,
        sessionId: 'session-1',
        watchArmedAt: ARMED_AT,
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets.mock.calls[0][0].targets[0]).toEqual({
      setId: '101',
      targetWeightKg: 20,
      targetDurationSec: 45,
    });
  });

  it('sends a carry with its weight and distance in km, no reps', () => {
    const session = makeSession();
    session.exercises[0].exercise_snapshot = {
      id: 'ex-1',
      name: "Farmer's Carry",
      modality: 'weight_distance',
    } as (typeof session.exercises)[0]['exercise_snapshot'];
    session.exercises[0].sets[0].weight = 40;
    session.exercises[0].sets[0].distance = 0.03;
    act(() => {
      useActiveWorkoutStore.setState({
        session,
        sessionId: 'session-1',
        watchArmedAt: ARMED_AT,
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    expect(mockUpdateSetTargets.mock.calls[0][0].targets[0]).toEqual({
      setId: '101',
      targetWeightKg: 40,
      targetDistanceKm: 0.03,
    });
  });

  it("does not turn a cardio set's seeded reps into a countdown", () => {
    const session = makeSession();
    session.exercises[0].exercise_snapshot = {
      id: 'ex-1',
      name: 'Run',
      modality: 'duration_distance',
    } as (typeof session.exercises)[0]['exercise_snapshot'];
    session.exercises[0].sets = [
      { ...makeSet(101), reps: 10, duration: 600 },
      { ...makeSet(102), reps: 10, duration: null },
    ];
    act(() => {
      useActiveWorkoutStore.setState({
        session,
        sessionId: 'session-1',
        watchArmedAt: ARMED_AT,
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    const targets = mockUpdateSetTargets.mock.calls[0][0].targets;
    expect(targets[0]).toEqual({ setId: '101', targetDurationSec: 600 });
    expect(targets[1].targetDurationSec).not.toBe(10);
    expect(targets[1]).not.toHaveProperty('targetReps');
  });

  it("does not turn last time's hold into a countdown", () => {
    const session = makeSession();
    session.exercises[0].exercise_snapshot = {
      id: 'ex-1',
      name: 'Plank',
      modality: 'duration',
    } as (typeof session.exercises)[0]['exercise_snapshot'];
    act(() => {
      useActiveWorkoutStore.setState({
        session,
        sessionId: 'session-1',
        watchArmedAt: ARMED_AT,
        previousSessionSets: {
          'ex-1': [
            {
              setNumber: 1,
              setType: 'normal',
              weight: null,
              reps: null,
              duration: 13,
            },
            {
              setNumber: 2,
              setType: 'normal',
              weight: null,
              reps: null,
              duration: 13,
            },
          ],
        } as never,
      });
    });
    renderHook(() => useWatchSetTargetsSync(true));
    const targets = mockUpdateSetTargets.mock.calls[0][0].targets;
    for (const target of targets) {
      expect(target).not.toHaveProperty('targetDurationSec');
    }
    // It rides along as a gray hint for the idle stopwatch instead.
    for (const target of targets) {
      expect(target).toHaveProperty('previousDurationSec', 13);
    }
  });
});
