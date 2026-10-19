import { act, cleanup, renderHook } from '@testing-library/react-native/pure';
import { AppState, type AppStateStatus } from 'react-native';
import { useChatBackgroundRecovery } from '../../src/hooks/useChatBackgroundRecovery';
import {
  loadChatHistory,
  type ChatHistoryEntry,
} from '../../src/services/api/chatApi';

jest.mock('../../src/services/api/chatApi', () => ({
  loadChatHistory: jest.fn(),
}));

const mockLoadHistory = jest.mocked(loadChatHistory);
let changeState: (state: AppStateStatus) => void;
const removeListener = jest.fn();

const historyEntry = (id: string): ChatHistoryEntry => ({
  id: `saved-${id}`,
  message_type: 'assistant',
  content: 'Saved reply',
  metadata: { client_message_id: id },
  created_at: '2026-10-14T12:00:00Z',
});

function setup() {
  const onRecovered = jest.fn();
  const onRecoveryFailed = jest.fn();
  return {
    ...renderHook(() =>
      useChatBackgroundRecovery({ onRecovered, onRecoveryFailed })
    ),
    onRecovered,
    onRecoveryFailed,
  };
}

async function transition(state: AppStateStatus) {
  await act(async () => {
    AppState.currentState = state;
    changeState(state);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
  mockLoadHistory.mockReset().mockResolvedValue([]);
  removeListener.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb) => {
    changeState = cb;
    return { remove: removeListener };
  });
});

afterEach(() => {
  jest.useRealTimers();
  cleanup();
  jest.restoreAllMocks();
});

it.each(['Software caused connection abort', ''])(
  'restores only the matching generation after screen lock and error "%s", without resending',
  async (message) => {
    const { result, onRecovered } = setup();
    act(() => result.current.startTurn('new-turn'));
    await transition('background');
    act(() => {
      expect(result.current.recoverError(new Error(message))).toBe(true);
    });
    expect(mockLoadHistory).not.toHaveBeenCalled();
    mockLoadHistory.mockResolvedValue([historyEntry('old-turn')]);
    await transition('active');
    expect(result.current.recovering).toBe(true);
    expect(onRecovered).not.toHaveBeenCalled();

    const savedHistory = [historyEntry('old-turn'), historyEntry('new-turn')];
    mockLoadHistory.mockResolvedValue(savedHistory);
    await act(async () => jest.advanceTimersByTime(3000));
    expect(onRecovered).toHaveBeenCalledWith(savedHistory);
    expect(onRecovered).toHaveBeenCalledTimes(1);
    expect(result.current.recovering).toBe(false);
  }
);

it('checks history on foreground return even when the old stream is silently stalled', async () => {
  const { result, onRecovered } = setup();
  act(() => result.current.startTurn('turn'));
  await transition('inactive');
  mockLoadHistory.mockResolvedValue([historyEntry('turn')]);
  await transition('active');
  expect(onRecovered).toHaveBeenCalledTimes(1);
});

it('recovers a background stream that ends without a protocol finish event or an error', async () => {
  const { result, onRecovered } = setup();
  act(() => result.current.startTurn('silent-eof'));
  await transition('background');
  act(() => result.current.finishTurn(false));
  expect(mockLoadHistory).not.toHaveBeenCalled();
  expect(result.current.recovering).toBe(true);
  await transition('active');
  expect(onRecovered).not.toHaveBeenCalled();
  mockLoadHistory.mockResolvedValue([historyEntry('silent-eof')]);
  await act(async () => jest.advanceTimersByTime(3000));
  expect(onRecovered).toHaveBeenCalledWith([historyEntry('silent-eof')]);
  expect(result.current.recovering).toBe(false);
});

it('releases a background turn when a protocol finish event confirms completion', async () => {
  const { result } = setup();
  act(() => result.current.startTurn('completed'));
  await transition('background');
  act(() => result.current.finishTurn(true));
  await transition('active');
  expect(mockLoadHistory).not.toHaveBeenCalled();
  expect(result.current.recovering).toBe(false);
});

it.each(['Network error', ''])(
  'leaves foreground error "%s" and provider errors visible',
  async (message) => {
    const { result } = setup();
    act(() => {
      result.current.startTurn('turn');
      expect(result.current.recoverError(new Error(message))).toBe(false);
    });
    act(() => result.current.startTurn('another-turn'));
    await transition('background');
    act(() => {
      expect(result.current.recoverError(new Error('Invalid API key'))).toBe(
        false
      );
    });
    await transition('active');
    expect(mockLoadHistory).not.toHaveBeenCalled();
    expect(result.current.recovering).toBe(false);
  }
);

it('retries history reads after unlock and pauses polling in the background', async () => {
  const { result, onRecovered } = setup();
  act(() => result.current.startTurn('turn'));
  await transition('background');
  mockLoadHistory.mockRejectedValueOnce(new Error('Offline'));
  await transition('active');
  expect(mockLoadHistory).toHaveBeenCalledTimes(1);
  await transition('background');
  await act(async () => jest.advanceTimersByTime(9000));
  expect(mockLoadHistory).toHaveBeenCalledTimes(1);
  mockLoadHistory.mockResolvedValue([historyEntry('turn')]);
  await transition('active');
  expect(onRecovered).toHaveBeenCalledTimes(1);
});

it('does not adopt a late history read after the live stream finishes or is stopped', async () => {
  let resolveHistory: (history: ChatHistoryEntry[]) => void = () => {};
  mockLoadHistory.mockReturnValue(
    new Promise((resolve) => {
      resolveHistory = resolve;
    })
  );
  const { result, onRecovered } = setup();
  act(() => result.current.startTurn('turn'));
  await transition('background');
  await transition('active');
  act(() => result.current.finishTurn());
  await act(async () => resolveHistory([historyEntry('turn')]));
  expect(onRecovered).not.toHaveBeenCalled();
  expect(result.current.recovering).toBe(false);
});

it('bounds recovery time and retains the transcript when no saved reply arrives', async () => {
  const { result, onRecoveryFailed, onRecovered } = setup();
  act(() => result.current.startTurn('turn'));
  await transition('background');
  await act(async () => jest.advanceTimersByTime(5 * 60 * 1000 + 15_000));
  await transition('active');
  expect(onRecoveryFailed).toHaveBeenCalledTimes(1);
  expect(onRecovered).not.toHaveBeenCalled();
  expect(result.current.recovering).toBe(false);
});

it('ignores in-flight recovery after unmount and removes the app-state listener', async () => {
  let resolveHistory: (history: ChatHistoryEntry[]) => void = () => {};
  mockLoadHistory.mockReturnValue(
    new Promise((resolve) => {
      resolveHistory = resolve;
    })
  );
  const { result, unmount, onRecovered } = setup();
  act(() => result.current.startTurn('turn'));
  await transition('background');
  await transition('active');
  unmount();
  await act(async () => resolveHistory([historyEntry('turn')]));
  expect(onRecovered).not.toHaveBeenCalled();
  expect(removeListener).toHaveBeenCalledTimes(1);
});

it('releases the composer at the server deadline even if the history read hangs', async () => {
  mockLoadHistory.mockReturnValue(new Promise(() => {}));
  const { result, onRecoveryFailed } = setup();
  act(() => result.current.startTurn('hung-history'));
  await transition('background');
  await transition('active');
  await act(async () => jest.advanceTimersByTime(5 * 60 * 1000));
  expect(result.current.recovering).toBe(true);
  await act(async () => jest.advanceTimersByTime(15_000));
  expect(result.current.recovering).toBe(false);
  expect(onRecoveryFailed).toHaveBeenCalledTimes(1);
});
