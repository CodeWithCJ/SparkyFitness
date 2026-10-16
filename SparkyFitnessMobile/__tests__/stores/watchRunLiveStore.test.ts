import { act, renderHook } from '@testing-library/react-native';
import type { WatchRunLivePayload } from '../../modules/watch-connectivity';
import {
  useWatchRunLive,
  useWatchRunLiveStore,
  useWatchRunPending,
  WATCH_RUN_LIVE_MAX_AGE_MS,
  WATCH_RUN_PENDING_MAX_AGE_MS,
} from '../../src/stores/watchRunLiveStore';

const live = (
  overrides: Partial<WatchRunLivePayload> = {}
): WatchRunLivePayload => ({
  runId: 'r1',
  kind: 'run',
  place: 'indoor',
  status: 'running',
  autoPaused: false,
  elapsed: 120,
  distanceMeters: 400,
  energyKcal: 20,
  lapCount: 0,
  sentAt: 1000,
  ...overrides,
});

const receive = (payload: WatchRunLivePayload, at = 5000) =>
  useWatchRunLiveStore.getState().receive(payload, at);
const current = () => useWatchRunLiveStore.getState().run;

beforeEach(() => useWatchRunLiveStore.getState().clear());

// Fake timers only inside the test body: the testing library's own cleanup
// hangs if it runs under them.
const withFakeTimers = (body: () => void) => () => {
  jest.useFakeTimers();
  try {
    body();
  } finally {
    jest.useRealTimers();
  }
};

describe('receive', () => {
  test('keeps the run’s switches, or null from a watch that does not send them', () => {
    receive(live({ autoPause: false, voiceCues: true }));
    expect(current()).toMatchObject({ autoPause: false, voiceCues: true });
    receive(live({ sentAt: 2000 }));
    expect(current()).toMatchObject({ autoPause: null, voiceCues: null });
    receive(live({ paceAlert: true, heartRateAlert: false, sentAt: 3000 }));
    expect(current()).toMatchObject({ paceAlert: true, heartRateAlert: false });
    receive(live({ sentAt: 4000 }));
    expect(current()).toMatchObject({ paceAlert: null, heartRateAlert: null });
  });

  test('keeps a run the watch is recording, with its optional parts', () => {
    receive(
      live({
        heartRate: 150,
        stepLabel: 'Run',
        stepRemaining: 45,
        nextLabel: 'Walk',
      })
    );
    expect(current()).toMatchObject({
      runId: 'r1',
      kind: 'run',
      place: 'indoor',
      heartRate: 150,
      stepLabel: 'Run',
      stepRemaining: 45,
      nextLabel: 'Walk',
      receivedAt: 5000,
    });
  });

  test('a message older than the one held for the same run is ignored', () => {
    receive(live({ sentAt: 2000, distanceMeters: 500 }));
    receive(live({ sentAt: 1000, distanceMeters: 100 }));
    expect(current()?.distanceMeters).toBe(500);
  });

  test('a new run replaces the old one even if its clock reads earlier', () => {
    receive(live({ sentAt: 9000 }));
    receive(live({ runId: 'r2', sentAt: 1000 }));
    expect(current()?.runId).toBe('r2');
  });

  test('ended clears that run only', () => {
    receive(live());
    receive(live({ runId: 'other', status: 'ended' }));
    expect(current()).not.toBeNull();
    receive(live({ status: 'ended' }));
    expect(current()).toBeNull();
  });

  test('rejects unreadable messages', () => {
    receive(live({ runId: '' }));
    receive(live({ status: 'wat' }));
    receive(live({ kind: 'ride' }));
    receive(live({ place: 'pool' }));
    receive(live({ elapsed: Number.NaN }));
    expect(current()).toBeNull();
  });

  test('a zero heart rate is no reading', () => {
    receive(live({ heartRate: 0 }));
    expect(current()?.heartRate).toBeNull();
  });
});

describe('useWatchRunLive', () => {
  test(
    'moves the clock and the step countdown on while the run is going',
    withFakeTimers(() => {
      jest.setSystemTime(5000);
      receive(live({ elapsed: 120, stepRemaining: 45 }));
      const { result } = renderHook(() => useWatchRunLive());
      act(() => {
        jest.setSystemTime(7000);
        jest.advanceTimersByTime(1000);
      });
      expect(result.current?.elapsedNow).toBeCloseTo(123, 0);
      expect(result.current?.stepRemainingNow).toBeCloseTo(42, 0);
    })
  );

  test(
    'holds the clock still while paused',
    withFakeTimers(() => {
      jest.setSystemTime(5000);
      receive(live({ status: 'paused', elapsed: 120 }));
      const { result } = renderHook(() => useWatchRunLive());
      act(() => {
        jest.setSystemTime(9000);
        jest.advanceTimersByTime(1000);
      });
      expect(result.current?.elapsedNow).toBe(120);
    })
  );

  test(
    'gives up when the watch goes quiet',
    withFakeTimers(() => {
      jest.setSystemTime(5000);
      receive(live());
      const { result } = renderHook(() => useWatchRunLive());
      expect(result.current).not.toBeNull();
      act(() => {
        jest.setSystemTime(5000 + WATCH_RUN_LIVE_MAX_AGE_MS + 1000);
        jest.advanceTimersByTime(1000);
      });
      expect(result.current).toBeNull();
    })
  );
});

describe('pending start request', () => {
  const pending = {
    requestId: 'q1',
    kind: 'run',
    place: 'indoor',
    at: 1,
  } as const;

  it('is settled by the live run that carries its request id', () => {
    useWatchRunLiveStore.getState().setPending(pending);
    receive(live({ requestId: 'other' }));
    expect(useWatchRunLiveStore.getState().pending).not.toBeNull();
    receive(live({ requestId: 'q1', sentAt: 2000 }));
    expect(useWatchRunLiveStore.getState().pending).toBeNull();
    expect(current()?.runId).toBe('r1');
  });

  it('survives the live run being swept', () => {
    useWatchRunLiveStore.getState().setPending(pending);
    useWatchRunLiveStore.setState({ run: null });
    expect(useWatchRunLiveStore.getState().pending).toEqual(pending);
  });

  it('stops showing after waiting too long', () => {
    useWatchRunLiveStore.getState().setPending({ ...pending, at: Date.now() });
    jest.useFakeTimers();
    try {
      const { result } = renderHook(() => useWatchRunPending());
      expect(result.current).not.toBeNull();
      act(() => {
        jest.setSystemTime(Date.now() + WATCH_RUN_PENDING_MAX_AGE_MS + 2000);
        jest.advanceTimersByTime(2000);
      });
      expect(result.current).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
