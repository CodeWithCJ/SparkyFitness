import { act, renderHook } from '@testing-library/react-native';
import type { PresetSessionResponse } from '@workspace/shared';
import { useFocusHold } from '../../src/hooks/useFocusHold';
import { useActiveWorkoutStore } from '../../src/stores/activeWorkoutStore';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import { playIntervalCue } from '../../src/services/sounds';

jest.mock('../../src/services/sounds', () => ({
  playIntervalCue: jest.fn(),
  setRestKeepAlive: jest.fn(),
}));
jest.mock('../../src/services/haptics', () => ({
  fireSuccessHaptic: jest.fn(),
  fireSelectionHaptic: jest.fn(),
  fireImpactHaptic: jest.fn(),
}));

function makeSession(duration: number | null): PresetSessionResponse {
  return {
    id: 's',
    exercises: [
      {
        id: 'e1',
        exercise_id: 'x1',
        exercise_snapshot: { name: 'Plank', modality: 'duration' },
        sets: [{ id: 11, set_number: 1, duration }],
      },
    ],
  } as unknown as PresetSessionResponse;
}

describe('useFocusHold', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1_700_000_000_000);
    useActiveWorkoutStore.setState({
      setTimerStartedAt: {},
      plannedSetValues: {},
      setRenderKeys: {},
    });
    useAppPreferencesStore.setState({ watchHoldCountdown: true });
    (playIntervalCue as jest.Mock).mockClear();
  });
  afterEach(() => jest.useRealTimers());

  function setup(duration: number | null, onFinish = jest.fn()) {
    const hook = renderHook(() =>
      useFocusHold({
        session: makeSession(duration),
        activeSetId: '11',
        enabled: true,
        onFinish,
      })
    );
    return { ...hook, onFinish };
  }

  it('is idle for a timed set until started and exposes the planned length', () => {
    const { result } = setup(45);
    expect(result.current.phase).toBe('idle');
    expect(result.current.setId).toBe('11');
    expect(result.current.targetSec).toBe(45);
  });

  it('runs a 3 second Get ready, then the hold, then cues at zero without logging', () => {
    const { result, onFinish } = setup(10);
    act(() => result.current.start());
    expect(result.current.phase).toBe('getReady');
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.phase).toBe('running');
    expect(playIntervalCue).toHaveBeenCalledWith('work');
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(playIntervalCue).toHaveBeenCalledWith('finish');
    // Past zero the hold keeps running until a tap, so it can go longer.
    expect(onFinish).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('running');
    act(() => {
      jest.advanceTimersByTime(7000);
    });
    expect(onFinish).not.toHaveBeenCalled();
    act(() => result.current.tap());
    expect(onFinish).toHaveBeenCalledWith('11');
    expect(result.current.phase).toBe('idle');
  });

  it('cancels Get ready without starting the hold', () => {
    const { result, onFinish } = setup(10);
    act(() => result.current.start());
    expect(result.current.phase).toBe('getReady');
    act(() => result.current.cancel());
    expect(result.current.phase).toBe('idle');
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.phase).toBe('idle');
    expect(playIntervalCue).not.toHaveBeenCalledWith('work');
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('holds another timed set than the cursor on request, without moving it', () => {
    const session = {
      id: 's',
      exercises: [
        {
          id: 'e0',
          exercise_id: 'x0',
          exercise_snapshot: { name: 'Bench', modality: 'reps_weight' },
          sets: [{ id: 1, set_number: 1 }],
        },
        {
          id: 'e1',
          exercise_id: 'x1',
          exercise_snapshot: { name: 'Plank', modality: 'duration' },
          sets: [{ id: 11, set_number: 1, duration: 30 }],
        },
      ],
    } as unknown as PresetSessionResponse;
    const onFinish = jest.fn();
    const { result } = renderHook(() =>
      useFocusHold({ session, activeSetId: '1', enabled: true, onFinish })
    );
    expect(result.current.setId).toBeNull();
    act(() => result.current.start('11'));
    expect(result.current.phase).toBe('getReady');
    expect(result.current.setId).toBe('11');
    expect(result.current.entryId).toBe('e1');
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.phase).toBe('running');
    act(() => result.current.tap());
    expect(onFinish).toHaveBeenCalledWith('11');
    expect(result.current.phase).toBe('idle');
    expect(result.current.setId).toBeNull();
  });

  it('keeps Get ready when autosave swaps the set id under it', () => {
    // Temporary id -1 is replaced by 11; the store keeps -1 as the render key.
    useActiveWorkoutStore.setState({ setRenderKeys: { '11': '-1' } });
    const session = makeSession(10);
    let activeSetId = '-1';
    const { result, rerender } = renderHook(() =>
      useFocusHold({
        session,
        activeSetId,
        enabled: true,
        onFinish: jest.fn(),
      })
    );
    // The cursor is on the same set under its old id until the swap lands.
    session.exercises[0].sets[0].id = -1;
    rerender({});
    act(() => result.current.start());
    expect(result.current.phase).toBe('getReady');
    session.exercises[0].sets[0].id = 11;
    activeSetId = '11';
    rerender({});
    expect(result.current.phase).toBe('getReady');
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.phase).toBe('running');
  });

  it('starts at once when the watch Get ready setting is off', () => {
    useAppPreferencesStore.setState({ watchHoldCountdown: false });
    const { result } = setup(10);
    act(() => result.current.start());
    expect(result.current.phase).toBe('running');
  });

  it('a tap skips Get ready, and a tap on a running hold ends it early and logs', () => {
    const { result, onFinish } = setup(30);
    act(() => result.current.start());
    act(() => result.current.tap());
    expect(result.current.phase).toBe('running');
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    act(() => result.current.tap());
    expect(onFinish).toHaveBeenCalledWith('11');
    expect(result.current.phase).toBe('idle');
  });

  it('runs a stopwatch with no planned length and never logs on its own', () => {
    const { result, onFinish } = setup(null);
    expect(result.current.targetSec).toBeNull();
    useAppPreferencesStore.setState({ watchHoldCountdown: false });
    act(() => result.current.start());
    act(() => {
      jest.advanceTimersByTime(120_000);
    });
    expect(onFinish).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('running');
  });

  it('counts down the planned length when the set has none of its own', () => {
    useAppPreferencesStore.setState({ watchHoldCountdown: false });
    useActiveWorkoutStore.setState({
      plannedSetValues: { '11': { weight: null, reps: null, duration: 30 } },
    });
    const { result, onFinish } = setup(null);
    expect(result.current.targetSec).toBe(30);
    act(() => result.current.start());
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(playIntervalCue).toHaveBeenCalledWith('finish');
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('does not log a hold the watch started', () => {
    const { result, onFinish } = setup(10);
    act(() => useActiveWorkoutStore.getState().startSetTimer('11'));
    expect(result.current.phase).toBe('running');
    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('does not log a timer restarted elsewhere on a set it had started', () => {
    useAppPreferencesStore.setState({ watchHoldCountdown: false });
    const onFinish = jest.fn();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useFocusHold({
          session: makeSession(10),
          activeSetId: '11',
          enabled,
          onFinish,
        }),
      { initialProps: { enabled: true } }
    );
    act(() => result.current.start());
    expect(result.current.phase).toBe('running');

    // The list view takes over, and its stopwatch is stopped and restarted.
    rerender({ enabled: false });
    act(() => {
      useActiveWorkoutStore.getState().clearSetTimer('11');
      jest.advanceTimersByTime(1_000);
      useActiveWorkoutStore.getState().startSetTimer('11');
    });
    rerender({ enabled: true });
    expect(result.current.phase).toBe('running');
    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    expect(onFinish).not.toHaveBeenCalled();
  });
});
