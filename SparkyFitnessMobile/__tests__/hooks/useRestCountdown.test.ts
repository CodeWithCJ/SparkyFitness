import { act, renderHook } from '@testing-library/react-native';
import { useRestCountdown } from '../../src/hooks/useRestCountdown';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
  type Rest,
} from '../../src/stores/activeWorkoutStore';

jest.mock('../../src/services/notifications', () => ({
  scheduleRestNotification: jest.fn(async () => 'notif-abc'),
  cancelScheduledNotification: jest.fn(async () => undefined),
  fireRestCompleteHaptic: jest.fn(),
}));

jest.mock('../../src/services/haptics', () => ({
  fireSuccessHaptic: jest.fn(),
  fireSelectionHaptic: jest.fn(),
}));

const FIXED_NOW = 1_700_000_000_000;

function setRest(rest: Partial<Rest>) {
  useActiveWorkoutStore.setState({
    rest: {
      state: 'ready',
      durationSec: 0,
      endsAt: null,
      pausedRemainingMs: null,
      scheduledNotificationId: null,
      instanceToken: 1,
      ...rest,
    },
  });
}

describe('useRestCountdown', () => {
  beforeEach(() => {
    __resetActiveWorkoutStoreForTests();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(FIXED_NOW));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns zeros while ready', () => {
    const { result } = renderHook(() => useRestCountdown());
    expect(result.current).toEqual({ state: 'ready', remainingMs: 0, progress: 0 });
  });

  it('derives remainingMs and progress from the deadline while resting', () => {
    setRest({ state: 'resting', durationSec: 90, endsAt: FIXED_NOW + 45_000 });
    const { result } = renderHook(() => useRestCountdown());
    expect(result.current.state).toBe('resting');
    expect(result.current.remainingMs).toBe(45_000);
    expect(result.current.progress).toBe(0.5);
  });

  it('clamps progress to 0..1 and treats zero duration as 0', () => {
    setRest({ state: 'resting', durationSec: 90, endsAt: FIXED_NOW + 120_000 });
    const over = renderHook(() => useRestCountdown());
    expect(over.result.current.progress).toBe(1);

    setRest({ state: 'resting', durationSec: 0, endsAt: FIXED_NOW + 30_000 });
    const zero = renderHook(() => useRestCountdown());
    expect(zero.result.current.progress).toBe(0);
  });

  it('freezes remainingMs at pausedRemainingMs while paused', () => {
    setRest({ state: 'paused', durationSec: 90, pausedRemainingMs: 30_000 });
    const { result } = renderHook(() => useRestCountdown());
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(result.current.state).toBe('paused');
    expect(result.current.remainingMs).toBe(30_000);
  });

  it('self-ticks the countdown down each second while resting', () => {
    setRest({ state: 'resting', durationSec: 90, endsAt: FIXED_NOW + 45_000 });
    const { result } = renderHook(() => useRestCountdown());
    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(result.current.remainingMs).toBe(43_000);
  });

  it('does not tick with selfTick: false; the caller re-render refreshes it', () => {
    setRest({ state: 'resting', durationSec: 90, endsAt: FIXED_NOW + 45_000 });
    const { result, rerender } = renderHook(() =>
      useRestCountdown({ selfTick: false }),
    );
    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(result.current.remainingMs).toBe(45_000);

    rerender({});
    expect(result.current.remainingMs).toBe(43_000);
  });
});
