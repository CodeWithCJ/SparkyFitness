import { act, renderHook } from '@testing-library/react-native';
import { useWatchRunBridge } from '../../src/hooks/useWatchRunBridge';
import WatchConnectivity from '../../modules/watch-connectivity';
import { speakWatchCue } from '../../src/services/watchRunCueRelay';
import { usePreferences } from '../../src/hooks/usePreferences';
import {
  hasQueuedWatchRuns,
  processWatchRunQueue,
} from '../../src/services/watchRunQueue';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    sendRunCueAck: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../../src/services/watchRunCueRelay', () => ({
  speakWatchCue: jest.fn(),
  resetWatchCueRelay: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));
jest.mock('../../src/services/watchRunQueue', () => ({
  enqueueWatchRun: jest.fn(() => Promise.resolve(true)),
  processWatchRunQueue: jest.fn(() => Promise.resolve([])),
  hasQueuedWatchRuns: jest.fn(() => Promise.resolve(false)),
  acceptPendingWatchRuns: jest.fn(() => Promise.resolve()),
  onWatchRunRetry: jest.fn(),
}));
jest.mock('../../src/services/watchRunToast', () => ({
  announceWatchRun: jest.fn(),
}));
jest.mock('../../src/hooks/invalidateExerciseCache', () => ({
  invalidateExerciseCache: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const prefs = jest.mocked(usePreferences);
const process = jest.mocked(processWatchRunQueue);
const queued = jest.mocked(hasQueuedWatchRuns);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  queued.mockResolvedValue(false);
});

test('waits for the preferences, so a miles user is not filed in km', async () => {
  prefs.mockReturnValue({ preferences: undefined } as never);
  const { rerender } = renderHook(() => useWatchRunBridge(true, true));
  await flush();
  expect(process).not.toHaveBeenCalled();

  prefs.mockReturnValue({
    preferences: { default_distance_unit: 'miles' },
  } as never);
  rerender({});
  await flush();
  expect(process).toHaveBeenCalledWith('miles', expect.any(Function));
});

test('confirms a cue from the watch and says it on the phone', () => {
  prefs.mockReturnValue({ preferences: {} } as never);
  renderHook(() => useWatchRunBridge(true, true));
  const call = jest
    .mocked(WatchConnectivity!.addListener)
    .mock.calls.find(([name]) => name === 'onRunCue');
  expect(call).toBeDefined();
  const handler = call![1] as (p: {
    id: string;
    text: string;
    interrupt: boolean;
    language?: string;
  }) => void;
  handler({ id: 'c1', text: 'Paused.', interrupt: true });
  expect(WatchConnectivity!.sendRunCueAck).toHaveBeenCalledWith('c1');
  expect(speakWatchCue).toHaveBeenCalledWith('Paused.', true, undefined);
});

test('passes the language the watch wrote a cue in to the relay', () => {
  prefs.mockReturnValue({ preferences: {} } as never);
  renderHook(() => useWatchRunBridge(true, true));
  const call = jest
    .mocked(WatchConnectivity!.addListener)
    .mock.calls.find(([name]) => name === 'onRunCue');
  const handler = call![1] as (p: {
    id: string;
    text: string;
    interrupt: boolean;
    language?: string;
  }) => void;
  handler({ id: 'c2', text: 'Pausiert.', interrupt: true, language: 'de-DE' });
  expect(speakWatchCue).toHaveBeenCalledWith('Pausiert.', true, 'de-DE');
});
