import { renderHook, waitFor } from '@testing-library/react-native';
import { useWatchFastingBridge } from '../../src/hooks/useWatchFastingBridge';
import {
  endFast,
  fetchCurrentFast,
  startFast,
} from '../../src/services/api/fastingApi';

type Listener = (payload: unknown) => void;
const mockListeners = new Map<string, Listener>();
const mockSendAck = jest.fn();

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isSupported: () => true,
    sendAck: (...args: unknown[]) => mockSendAck(...args),
    addListener: (name: string, fn: Listener) => {
      mockListeners.set(name, fn);
      return { remove: () => mockListeners.delete(name) };
    },
  },
}));
jest.mock('../../src/services/api/fastingApi', () => ({
  fetchCurrentFast: jest.fn(),
  startFast: jest.fn(),
  endFast: jest.fn(),
}));
jest.mock('../../src/hooks/useFasting', () => ({
  cancelFastGoalNotification: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

describe('useWatchFastingBridge', () => {
  beforeEach(() => {
    mockListeners.clear();
    jest.clearAllMocks();
  });

  it('starts a preset fast and acks', async () => {
    (fetchCurrentFast as jest.Mock).mockResolvedValue(null);
    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastStartRequested')?.({
      presetId: '18-6',
      clientId: 'c1',
    });
    await waitFor(() => expect(mockSendAck).toHaveBeenCalledWith('c1', true));
    const call = (startFast as jest.Mock).mock.calls[0][0];
    expect(call.fastingType).toBe('18:6 Warrior');
    expect(
      new Date(call.targetEndTime).getTime() -
        new Date(call.startTime).getTime()
    ).toBe(18 * 3_600_000);
  });

  it('does not start when a fast is already running', async () => {
    (fetchCurrentFast as jest.Mock).mockResolvedValue({ id: 'f' });
    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'c2',
    });
    await waitFor(() => expect(mockSendAck).toHaveBeenCalledWith('c2', true));
    expect(startFast).not.toHaveBeenCalled();
  });

  it('starts a manual fast even though a calculated one is always current', async () => {
    (fetchCurrentFast as jest.Mock).mockResolvedValue({
      id: 'auto-2026-10-03T20:00:00.000Z',
      is_auto_calculated: true,
    });
    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'c5',
    });
    await waitFor(() => expect(mockSendAck).toHaveBeenCalledWith('c5', true));
    expect(startFast).toHaveBeenCalledTimes(1);
  });

  it('has nothing to end for a calculated fast', async () => {
    (fetchCurrentFast as jest.Mock).mockResolvedValue({
      id: 'auto-2026-10-03T20:00:00.000Z',
      start_time: '2026-10-03T20:00:00Z',
      is_auto_calculated: true,
    });
    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastEndRequested')?.({ clientId: 'c6' });
    await waitFor(() => expect(mockSendAck).toHaveBeenCalledWith('c6', true));
    expect(endFast).not.toHaveBeenCalled();
  });

  it('ends the running fast once per clientId', async () => {
    (fetchCurrentFast as jest.Mock).mockResolvedValue({
      id: 'f',
      start_time: '2026-01-01T00:00:00Z',
    });
    renderHook(() => useWatchFastingBridge(true));
    const fire = mockListeners.get('onFastEndRequested');
    fire?.({ clientId: 'c3' });
    fire?.({ clientId: 'c3' });
    await waitFor(() => expect(mockSendAck).toHaveBeenCalledWith('c3', true));
    expect(endFast).toHaveBeenCalledTimes(1);
  });

  it('nacks when the server call fails', async () => {
    (fetchCurrentFast as jest.Mock).mockRejectedValue(new Error('offline'));
    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastEndRequested')?.({ clientId: 'c4' });
    await waitFor(() => expect(mockSendAck).toHaveBeenCalledWith('c4', false));
  });
});
