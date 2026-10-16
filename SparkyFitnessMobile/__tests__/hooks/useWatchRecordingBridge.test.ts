import { act, renderHook } from '@testing-library/react-native';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isReachable: jest.fn(() => true),
    updateRecordingState: jest.fn(() => Promise.resolve()),
    addListener: jest.fn(),
  },
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/gpsRecordingService', () => ({
  useGpsRecording: jest.fn(),
  hydrate: jest.fn(() => Promise.resolve()),
  pauseRecording: jest.fn(() => Promise.resolve()),
  resumeRecording: jest.fn(() => Promise.resolve()),
  finishRecording: jest.fn(() => Promise.resolve()),
  markLap: jest.fn(() => Promise.resolve(1)),
  addHeartRateSamples: jest.fn(() => Promise.resolve()),
  noteLiveHeartRate: jest.fn(() => Promise.resolve()),
  elapsedSeconds: jest.fn(() => 0),
}));

import { useWatchRecordingBridge } from '../../src/hooks/useWatchRecordingBridge';
import * as service from '../../src/services/gpsRecordingService';
import { useLiveHeartRateStore } from '../../src/stores/liveHeartRateStore';

const watch = (
  jest.requireMock('../../modules/watch-connectivity') as {
    default: {
      isReachable: jest.Mock;
      updateRecordingState: jest.Mock;
      addListener: jest.Mock;
    };
  }
).default;
const mockedService = service as jest.Mocked<typeof service>;

const baseSession = {
  id: 'rec-1',
  activity: 'run' as const,
  status: 'recording' as const,
  startedAt: 1_000,
  finishedAt: null,
  pausedAt: null,
  pausedMs: 0,
  seg: 0,
  savedEntryId: null as string | null,
};

const point = (t: number, lat: number) => ({
  t,
  lat,
  lon: 0,
  alt: null,
  hacc: 5,
  seg: 0,
});

type Handlers = Record<string, (payload: unknown) => void>;
let handlers: Handlers;

function setSnapshot(
  session: (typeof baseSession & { indoor?: boolean }) | null,
  points: ReturnType<typeof point>[] = []
) {
  (mockedService.useGpsRecording as jest.Mock).mockReturnValue({
    session,
    points,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  handlers = {};
  watch.addListener.mockImplementation(
    (name: string, handler: (payload: unknown) => void) => {
      handlers[name] = handler;
      return { remove: jest.fn() };
    }
  );
  setSnapshot(null);
  useLiveHeartRateStore.setState({ reading: null });
});

describe('useWatchRecordingBridge', () => {
  it('does nothing when the watch is not supported', () => {
    setSnapshot(baseSession);
    renderHook(() => useWatchRecordingBridge(false));
    expect(watch.updateRecordingState).not.toHaveBeenCalled();
    expect(watch.addListener).not.toHaveBeenCalled();
  });

  it('sends the status durably when a recording starts', () => {
    setSnapshot(baseSession);
    renderHook(() => useWatchRecordingBridge(true));

    expect(watch.updateRecordingState).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'rec-1',
        activity: 'run',
        status: 'recording',
        startedAt: 1_000,
        distanceUnit: 'km',
        indoor: false,
      }),
      true
    );
  });

  it('tells the watch an indoor recording is indoor', () => {
    setSnapshot({ ...baseSession, indoor: true });
    renderHook(() => useWatchRecordingBridge(true));

    expect(watch.updateRecordingState).toHaveBeenCalledWith(
      expect.objectContaining({ indoor: true, status: 'recording' }),
      true
    );
  });

  it('freezes the clock on the watch when paused or finished', () => {
    setSnapshot({ ...baseSession, status: 'paused', pausedAt: 9_000 });
    const { rerender } = renderHook(() => useWatchRecordingBridge(true));
    expect(watch.updateRecordingState).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'paused', pausedAt: 9_000 }),
      true
    );

    setSnapshot({ ...baseSession, status: 'finished', finishedAt: 20_000 });
    rerender({});
    expect(watch.updateRecordingState).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'finished', pausedAt: 20_000 }),
      true
    );
  });

  it('refreshes distance and pace every few seconds while recording and reachable', () => {
    // Fake timers only here: Testing Library's own cleanup hangs under them.
    jest.useFakeTimers();
    setSnapshot(baseSession, [point(1_000, 0), point(31_000, 0.0009)]);
    renderHook(() => useWatchRecordingBridge(true));
    watch.updateRecordingState.mockClear();

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(watch.updateRecordingState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'recording',
        distanceMeters: expect.any(Number),
      }),
      false
    );
    const sent = watch.updateRecordingState.mock.calls[0][0];
    expect(sent.distanceMeters).toBeGreaterThan(90);

    watch.updateRecordingState.mockClear();
    watch.isReachable.mockReturnValue(false);
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(watch.updateRecordingState).not.toHaveBeenCalled();
    watch.isReachable.mockReturnValue(true);
    jest.useRealTimers();
  });

  it('tells the watch the recording ended once the session is gone', () => {
    setSnapshot(baseSession);
    const { rerender } = renderHook(() => useWatchRecordingBridge(true));
    watch.updateRecordingState.mockClear();

    setSnapshot(null);
    rerender({});

    expect(watch.updateRecordingState).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'rec-1', status: 'ended' }),
      true
    );
  });

  it('says a recording that left the store without a diary entry was discarded', () => {
    setSnapshot({ ...baseSession, status: 'finished' });
    const { rerender } = renderHook(() => useWatchRecordingBridge(true));
    watch.updateRecordingState.mockClear();

    setSnapshot(null);
    rerender({});

    expect(watch.updateRecordingState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ended', discarded: true }),
      true
    );
  });

  it('says a recording that was saved to the diary was not discarded', () => {
    setSnapshot({ ...baseSession, status: 'finished' });
    const { rerender } = renderHook(() => useWatchRecordingBridge(true));
    // The save records the entry id on the session before it clears it.
    setSnapshot({
      ...baseSession,
      status: 'finished',
      savedEntryId: 'entry-1',
    });
    rerender({});
    watch.updateRecordingState.mockClear();

    setSnapshot(null);
    rerender({});

    expect(watch.updateRecordingState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ended', discarded: false }),
      true
    );
  });

  it('applies pause, resume and finish from the watch to the live recording only', () => {
    setSnapshot(baseSession);
    renderHook(() => useWatchRecordingBridge(true));

    handlers.onRecordingControl({ sessionId: 'rec-1', action: 'pause' });
    handlers.onRecordingControl({ sessionId: 'rec-1', action: 'resume' });
    handlers.onRecordingControl({ sessionId: 'rec-1', action: 'finish' });
    handlers.onRecordingControl({ sessionId: 'rec-old', action: 'finish' });

    expect(mockedService.pauseRecording).toHaveBeenCalledTimes(1);
    expect(mockedService.resumeRecording).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.any(String) })
    );
    expect(mockedService.finishRecording).toHaveBeenCalledTimes(1);
  });

  it('marks a lap at the moment it was pressed on the watch', () => {
    setSnapshot(baseSession);
    renderHook(() => useWatchRecordingBridge(true));

    handlers.onRecordingControl({
      sessionId: 'rec-1',
      action: 'lap',
      at: 1_700_000_000_000,
    });
    handlers.onRecordingControl({ sessionId: 'rec-old', action: 'lap' });

    expect(mockedService.markLap).toHaveBeenCalledTimes(1);
    expect(mockedService.markLap).toHaveBeenCalledWith(1_700_000_000_000);
  });

  it('tells the watch how many laps are marked', () => {
    setSnapshot({ ...baseSession, laps: [1, 2, 3] } as typeof baseSession);
    renderHook(() => useWatchRecordingBridge(true));

    expect(watch.updateRecordingState).toHaveBeenCalledWith(
      expect.objectContaining({ lapCount: 3 }),
      expect.any(Boolean)
    );
  });

  it('tells the watch which interval step is running and what comes next', () => {
    (mockedService.elapsedSeconds as jest.Mock).mockReturnValue(70);
    const plan = {
      style: 'runWalk' as const,
      steps: [
        { kind: 'warmup' as const, seconds: 60 },
        { kind: 'work' as const, seconds: 90 },
        { kind: 'recovery' as const, seconds: 60 },
      ],
    };
    setSnapshot({
      ...baseSession,
      intervals: { plan, cued: 1 },
    } as unknown as typeof baseSession);
    renderHook(() => useWatchRecordingBridge(true));

    expect(watch.updateRecordingState).toHaveBeenCalledWith(
      expect.objectContaining({
        intervalIndex: 1,
        intervalLabel: expect.any(String),
        intervalRemaining: 80,
        intervalNext: expect.any(String),
      }),
      true
    );
    (mockedService.elapsedSeconds as jest.Mock).mockReturnValue(0);
  });

  it('sends a new interval step at once but not durably', () => {
    const plan = {
      style: 'runWalk' as const,
      steps: [
        { kind: 'work' as const, seconds: 60 },
        { kind: 'recovery' as const, seconds: 60 },
      ],
    };
    const withStep = (cued: number) =>
      ({
        ...baseSession,
        intervals: { plan, cued },
      }) as unknown as typeof baseSession;
    setSnapshot(withStep(0));
    const { rerender } = renderHook(() => useWatchRecordingBridge(true));
    watch.updateRecordingState.mockClear();

    (mockedService.elapsedSeconds as jest.Mock).mockReturnValue(61);
    setSnapshot(withStep(1));
    rerender({});

    expect(watch.updateRecordingState).toHaveBeenCalledTimes(1);
    expect(watch.updateRecordingState).toHaveBeenCalledWith(
      expect.objectContaining({ intervalIndex: 1 }),
      false
    );
    (mockedService.elapsedSeconds as jest.Mock).mockReturnValue(0);
  });

  it('sends no interval fields when the recording has no plan', () => {
    setSnapshot(baseSession);
    renderHook(() => useWatchRecordingBridge(true));
    const sent = watch.updateRecordingState.mock.calls[0][0];
    expect(sent.intervalIndex).toBeUndefined();
  });

  it('shows the live reading for the recording in progress', () => {
    setSnapshot(baseSession);
    renderHook(() => useWatchRecordingBridge(true));

    handlers.onLiveHeartRate({
      sessionId: 'rec-1',
      exerciseEntryId: '',
      bpm: 143.6,
      at: 5_000,
    });

    expect(useLiveHeartRateStore.getState().reading).toEqual({
      sessionId: 'rec-1',
      exerciseEntryId: '',
      bpm: 144,
      at: 5_000,
    });
    // The same reading is judged against the heart-rate range, if one is set.
    expect(mockedService.noteLiveHeartRate).toHaveBeenCalledWith(
      'rec-1',
      143.6
    );
  });

  it('ignores live readings for another session or with no usable value', () => {
    setSnapshot(baseSession);
    renderHook(() => useWatchRecordingBridge(true));

    handlers.onLiveHeartRate({
      sessionId: 'rec-old',
      exerciseEntryId: '',
      bpm: 150,
      at: 5_000,
    });
    handlers.onLiveHeartRate({
      sessionId: 'rec-1',
      exerciseEntryId: '',
      bpm: 0,
      at: 5_000,
    });
    handlers.onLiveHeartRate({
      sessionId: 'rec-1',
      exerciseEntryId: '',
      bpm: 150,
      at: Number.NaN,
    });

    expect(useLiveHeartRateStore.getState().reading).toBeNull();
  });

  it('stores heart-rate batches with their ids and times in epoch ms', () => {
    setSnapshot(baseSession);
    renderHook(() => useWatchRecordingBridge(true));

    handlers.onRecordingHeartRate({
      sessionId: 'rec-1',
      clientId: 'batch-1',
      samples: [{ t: '2026-10-06T10:00:00.000Z', bpm: 141 }],
    });

    expect(mockedService.addHeartRateSamples).toHaveBeenCalledWith(
      'rec-1',
      'batch-1',
      [{ t: Date.UTC(2026, 9, 6, 10, 0, 0), bpm: 141 }]
    );
  });
});
