import WatchConnectivity from '../../modules/watch-connectivity';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useWatchFastingBridge } from '../../src/hooks/useWatchFastingBridge';
import {
  endFast,
  fetchCurrentFast,
  startFast,
} from '../../src/services/api/fastingApi';
import { ApiError } from '../../src/services/api/errors';
import { cancelFastGoalNotification } from '../../src/hooks/useFasting';
import { addLog } from '../../src/services/LogService';
import {
  getActiveServerConfig,
  getActiveServerConfigId,
  type ServerConfig,
} from '../../src/services/storage';

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
const mockServerConfig: ServerConfig = {
  id: 'srv-1',
  name: 'Primary',
  url: 'https://srv-1.example.com',
  authType: 'apiKey',
  apiKey: 'test-key',
};

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 'srv-1'),
  getActiveServerConfig: jest.fn(async () => mockServerConfig),
}));

describe('useWatchFastingBridge', () => {
  beforeEach(() => {
    mockListeners.clear();
    jest.clearAllMocks();
    (fetchCurrentFast as jest.Mock).mockReset();
    (startFast as jest.Mock).mockReset();
    (endFast as jest.Mock).mockReset();
    (getActiveServerConfigId as jest.Mock).mockReset();
    (getActiveServerConfigId as jest.Mock).mockResolvedValue('srv-1');
    (getActiveServerConfig as jest.Mock).mockReset();
    (getActiveServerConfig as jest.Mock).mockResolvedValue(mockServerConfig);
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

  it('ends the running fast once per clientId and replays saved ack on later duplicate delivery', async () => {
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
    expect(mockSendAck).toHaveBeenCalledTimes(1);

    fire?.({ clientId: 'c3' });
    await waitFor(() => expect(mockSendAck).toHaveBeenCalledTimes(2));
    expect(mockSendAck).toHaveBeenLastCalledWith('c3', true);
    expect(endFast).toHaveBeenCalledTimes(1);

    (fetchCurrentFast as jest.Mock).mockResolvedValue(null);
    const fireStart = mockListeners.get('onFastStartRequested');
    fireStart?.({ presetId: '16-8', clientId: 'c3-start' });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('c3-start', true)
    );
    expect(startFast).toHaveBeenCalledTimes(1);

    fireStart?.({ presetId: '16-8', clientId: 'c3-start' });
    await waitFor(() => expect(mockSendAck).toHaveBeenCalledTimes(4));
    expect(mockSendAck).toHaveBeenLastCalledWith('c3-start', true);
    expect(startFast).toHaveBeenCalledTimes(1);
  });

  it('nacks when the server rejects with a permanent 4xx error', async () => {
    (fetchCurrentFast as jest.Mock).mockRejectedValue(
      new ApiError('Validation failed', 400)
    );
    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastEndRequested')?.({ clientId: 'c4' });
    await waitFor(() => expect(mockSendAck).toHaveBeenCalledWith('c4', false));
  });

  it('leaves transient offline failures un-nacked so the watch can retry', async () => {
    (fetchCurrentFast as jest.Mock)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        id: 'f',
        start_time: '2026-01-01T00:00:00Z',
      });
    renderHook(() => useWatchFastingBridge(true));
    const fire = mockListeners.get('onFastEndRequested');
    fire?.({ clientId: 'c4-retry', ownerId: 'srv-1' });
    await waitFor(() => expect(addLog).toHaveBeenCalled());
    expect(mockSendAck).not.toHaveBeenCalled();

    fire?.({ clientId: 'c4-retry', ownerId: 'srv-1' });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('c4-retry', true)
    );
    expect(endFast).toHaveBeenCalledTimes(1);
  });

  it('ignores fast requests whose ownerId does not match the active server', async () => {
    (getActiveServerConfigId as jest.Mock).mockResolvedValueOnce('srv-active');
    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastStartRequested')?.({
      presetId: '18-6',
      clientId: 'c7',
      ownerId: 'srv-other',
    });
    await waitFor(() =>
      expect(getActiveServerConfigId).toHaveBeenCalledTimes(1)
    );
    expect(fetchCurrentFast).not.toHaveBeenCalled();
    expect(startFast).not.toHaveBeenCalled();
    expect(mockSendAck).not.toHaveBeenCalled();
  });

  it('aborts startFast if the active server changes while fetchCurrentFast is pending', async () => {
    (getActiveServerConfigId as jest.Mock)
      .mockResolvedValueOnce('srv-1')
      .mockResolvedValueOnce('srv-1')
      .mockResolvedValueOnce('srv-2');
    (fetchCurrentFast as jest.Mock).mockResolvedValue(null);
    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastStartRequested')?.({
      presetId: '18-6',
      clientId: 'c8',
      ownerId: 'srv-1',
    });
    await waitFor(() =>
      expect(getActiveServerConfigId).toHaveBeenCalledTimes(3)
    );
    expect(fetchCurrentFast).toHaveBeenCalledTimes(1);
    expect(startFast).not.toHaveBeenCalled();
    expect(mockSendAck).not.toHaveBeenCalled();
  });

  it('preserves original watch startedAt when replaying a queued fastStart', async () => {
    (fetchCurrentFast as jest.Mock).mockResolvedValue(null);
    const queuedStartMs = Date.parse('2026-11-25T06:30:00.000Z');
    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'c-queued-start',
      startedAt: queuedStartMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('c-queued-start', true)
    );
    expect(startFast).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: '2026-11-25T06:30:00.000Z',
        targetEndTime: '2026-11-25T22:30:00.000Z',
        fastingType: '16:8 Leangains',
      })
    );
  });

  it('does not end a different running fast when fastId mismatches, and ends a long-running fast when fastId matches', async () => {
    (fetchCurrentFast as jest.Mock).mockResolvedValue({
      id: 'f-new',
      start_time: '2026-11-25T02:00:00.000Z',
      target_end_time: '2026-11-25T18:00:00.000Z',
    });
    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'c9-mismatch',
      fastId: 'f-old',
      endedAt: Date.parse('2026-11-25T18:00:00.000Z'),
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('c9-mismatch', true)
    );
    expect(endFast).not.toHaveBeenCalled();

    mockListeners.get('onFastEndRequested')?.({
      clientId: 'c9-match',
      fastId: 'f-new',
      endedAt: Date.parse('2026-11-25T19:00:00.000Z'),
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('c9-match', true)
    );
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-new',
        startTime: '2026-11-25T02:00:00.000Z',
        endTime: '2026-11-25T19:00:00.000Z',
      })
    );
  });

  it('skips ending a fast started after endedAt when fastId was not yet synced', async () => {
    (fetchCurrentFast as jest.Mock).mockResolvedValue({
      id: 'f-after-end',
      start_time: '2026-11-25T18:00:00.000Z',
    });
    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'c10',
      endedAt: Date.parse('2026-11-25T12:00:00.000Z'),
    });
    await waitFor(() => expect(mockSendAck).toHaveBeenCalledWith('c10', true));
    expect(endFast).not.toHaveBeenCalled();
  });

  it('skips ending a replacement fast started 1s after endedAt when startedAt mismatches, and ends when startedAt matches within 1s', async () => {
    (fetchCurrentFast as jest.Mock).mockResolvedValue({
      id: 'f-replacement',
      start_time: '2026-11-25T12:00:01.000Z',
    });
    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'c11-stale',
      startedAt: Date.parse('2026-11-25T04:00:00.000Z'),
      endedAt: Date.parse('2026-11-25T12:00:00.000Z'),
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('c11-stale', true)
    );
    expect(endFast).not.toHaveBeenCalled();

    mockListeners.get('onFastEndRequested')?.({
      clientId: 'c11-after-endedAt-within-1s',
      startedAt: Date.parse('2026-11-25T12:00:00.200Z'),
      endedAt: Date.parse('2026-11-25T12:00:00.400Z'),
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith(
        'c11-after-endedAt-within-1s',
        true
      )
    );
    expect(endFast).not.toHaveBeenCalled();

    mockListeners.get('onFastEndRequested')?.({
      clientId: 'c11-match',
      startedAt: Date.parse('2026-11-25T12:00:00.500Z'),
      endedAt: Date.parse('2026-11-25T20:00:00.000Z'),
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('c11-match', true)
    );
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-replacement',
        startTime: '2026-11-25T12:00:01.000Z',
        endTime: '2026-11-25T20:00:00.000Z',
      })
    );
  });

  it('replays saved ack on duplicate fastStart and fastEnd delivery without repeating server writes', async () => {
    (fetchCurrentFast as jest.Mock).mockResolvedValueOnce(null);
    renderHook(() => useWatchFastingBridge(true));
    const fireStart = mockListeners.get('onFastStartRequested');
    fireStart?.({ presetId: '16-8', clientId: 'c-dup-start' });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('c-dup-start', true)
    );
    expect(startFast).toHaveBeenCalledTimes(1);

    fireStart?.({ presetId: '16-8', clientId: 'c-dup-start' });
    await waitFor(() => expect(mockSendAck).toHaveBeenCalledTimes(2));
    expect(mockSendAck).toHaveBeenLastCalledWith('c-dup-start', true);
    expect(startFast).toHaveBeenCalledTimes(1);

    (fetchCurrentFast as jest.Mock).mockResolvedValueOnce({
      id: 'f-dup',
      start_time: '2026-11-25T08:00:00.000Z',
    });
    const fireEnd = mockListeners.get('onFastEndRequested');
    fireEnd?.({ clientId: 'c-dup-end', fastId: 'f-dup' });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('c-dup-end', true)
    );
    expect(endFast).toHaveBeenCalledTimes(1);

    fireEnd?.({ clientId: 'c-dup-end', fastId: 'f-dup' });
    await waitFor(() => expect(mockSendAck).toHaveBeenCalledTimes(4));
    expect(mockSendAck).toHaveBeenLastCalledWith('c-dup-end', true);
    expect(endFast).toHaveBeenCalledTimes(1);
  });

  it('uses sendFastAck when present for start, stale end, normal end, and fresh settled replay', async () => {
    const mockSendFastAck = jest.fn();
    const watchMock = WatchConnectivity as unknown as {
      sendFastAck?: jest.Mock;
    };
    watchMock.sendFastAck = mockSendFastAck;
    try {
      const startMs = Date.parse('2026-11-25T08:00:00.000Z');
      const targetMs = Date.parse('2026-11-26T00:00:00.000Z');
      (fetchCurrentFast as jest.Mock).mockResolvedValueOnce(null);
      (startFast as jest.Mock).mockResolvedValueOnce({
        id: 'f-created',
        start_time: '2026-11-25T08:00:00.000Z',
        target_end_time: '2026-11-26T00:00:00.000Z',
        fasting_type: '16:8 Leangains',
      });
      renderHook(() => useWatchFastingBridge(true));
      mockListeners.get('onFastStartRequested')?.({
        presetId: '16-8',
        clientId: 'fa-start',
        ownerId: 'srv-1',
        startedAt: startMs,
      });
      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith('fa-start', true, true, {
          id: 'f-created',
          startedAt: startMs,
          targetEndAt: targetMs,
          label: '16:8 Leangains',
        })
      );

      // Stale End A skipped while Fast B is running -> replies with Fast B.
      (fetchCurrentFast as jest.Mock).mockResolvedValueOnce({
        id: 'f-b',
        start_time: '2026-11-25T10:00:00.000Z',
        target_end_time: '2026-11-26T02:00:00.000Z',
        fasting_type: '16:8 Leangains',
      });
      mockListeners.get('onFastEndRequested')?.({
        clientId: 'fa-end-stale',
        ownerId: 'srv-1',
        fastId: 'f-a',
      });
      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          'fa-end-stale',
          true,
          true,
          {
            id: 'f-b',
            startedAt: Date.parse('2026-11-25T10:00:00.000Z'),
            targetEndAt: Date.parse('2026-11-26T02:00:00.000Z'),
            label: '16:8 Leangains',
          }
        )
      );
      expect(endFast).not.toHaveBeenCalled();

      // Successful End B -> replies with fastKnown=true, fast=null.
      (fetchCurrentFast as jest.Mock).mockResolvedValueOnce({
        id: 'f-b',
        start_time: '2026-11-25T10:00:00.000Z',
      });
      mockListeners.get('onFastEndRequested')?.({
        clientId: 'fa-end-ok',
        ownerId: 'srv-1',
        fastId: 'f-b',
        endedAt: Date.parse('2026-11-25T12:00:00.000Z'),
      });
      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          'fa-end-ok',
          true,
          true,
          null
        )
      );
      expect(endFast).toHaveBeenCalledTimes(1);

      // Settled duplicate of fa-end-ok while newer Fast C is active -> replies with Fast C, does NOT endFast again.
      (fetchCurrentFast as jest.Mock).mockResolvedValueOnce({
        id: 'f-c',
        start_time: '2026-11-25T13:00:00.000Z',
        target_end_time: null,
        fasting_type: '18:6 Warrior',
      });
      mockListeners.get('onFastEndRequested')?.({
        clientId: 'fa-end-ok',
        ownerId: 'srv-1',
        fastId: 'f-b',
      });
      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith('fa-end-ok', true, true, {
          id: 'f-c',
          startedAt: Date.parse('2026-11-25T13:00:00.000Z'),
          targetEndAt: null,
          label: '18:6 Warrior',
        })
      );
      expect(endFast).toHaveBeenCalledTimes(1);

      // Settled duplicate when fetchCurrentFast fails -> defers ACK (does not send fastKnown=false),
      // then succeeds cleanly on the next retry once the server responds.
      const prevCalls = mockSendFastAck.mock.calls.length;
      (fetchCurrentFast as jest.Mock).mockRejectedValueOnce(
        new Error('offline')
      );
      mockListeners.get('onFastEndRequested')?.({
        clientId: 'fa-end-ok',
        ownerId: 'srv-1',
        fastId: 'f-b',
      });
      await waitFor(() =>
        expect(addLog).toHaveBeenCalledWith(
          expect.stringContaining('Settled fast ack refresh failed'),
          'WARNING'
        )
      );
      expect(mockSendFastAck).toHaveBeenCalledTimes(prevCalls);

      (fetchCurrentFast as jest.Mock).mockResolvedValueOnce({
        id: 'f-c',
        start_time: '2026-11-25T13:00:00.000Z',
        target_end_time: null,
        fasting_type: '18:6 Warrior',
      });
      mockListeners.get('onFastEndRequested')?.({
        clientId: 'fa-end-ok',
        ownerId: 'srv-1',
        fastId: 'f-b',
      });
      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledTimes(prevCalls + 1)
      );
      expect(mockSendFastAck).toHaveBeenLastCalledWith(
        'fa-end-ok',
        true,
        true,
        {
          id: 'f-c',
          startedAt: Date.parse('2026-11-25T13:00:00.000Z'),
          targetEndAt: null,
          label: '18:6 Warrior',
        }
      );
    } finally {
      delete watchMock.sendFastAck;
    }
  });

  it('serializes concurrent Start and End per owner so End sees the committed Start', async () => {
    let resolveStart!: (value: unknown) => void;
    const startPromise = new Promise((resolve) => {
      resolveStart = resolve;
    });
    const startMs = Date.parse('2026-11-25T08:00:00.000Z');
    const endMs = Date.parse('2026-11-25T12:00:00.000Z');
    (fetchCurrentFast as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'f-seq',
        start_time: '2026-11-25T08:00:00.000Z',
      });
    (startFast as jest.Mock).mockReturnValueOnce(startPromise);

    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'seq-start',
      ownerId: 'srv-1',
      startedAt: startMs,
    });
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'seq-end',
      ownerId: 'srv-1',
      startedAt: startMs,
      endedAt: endMs,
    });

    await waitFor(() => expect(startFast).toHaveBeenCalledTimes(1));
    expect(fetchCurrentFast).toHaveBeenCalledTimes(1);
    expect(endFast).not.toHaveBeenCalled();

    resolveStart({
      id: 'f-seq',
      start_time: '2026-11-25T08:00:00.000Z',
      target_end_time: '2026-11-26T00:00:00.000Z',
      fasting_type: '16:8 Leangains',
    });

    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('seq-end', true)
    );
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-seq',
        startTime: '2026-11-25T08:00:00.000Z',
        endTime: '2026-11-25T12:00:00.000Z',
      })
    );
  });

  it('defers End behind a transiently failing Start until the retrying Start settles', async () => {
    const startMs = Date.parse('2026-11-25T08:00:00.000Z');
    const endMs = Date.parse('2026-11-25T11:00:00.000Z');
    (fetchCurrentFast as jest.Mock)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'f-retried',
        start_time: '2026-11-25T08:00:00.000Z',
      });
    (startFast as jest.Mock).mockResolvedValueOnce({
      id: 'f-retried',
      start_time: '2026-11-25T08:00:00.000Z',
      target_end_time: '2026-11-26T00:00:00.000Z',
      fasting_type: '16:8 Leangains',
    });

    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'retry-start',
      ownerId: 'srv-1',
      startedAt: startMs,
    });
    await waitFor(() => expect(addLog).toHaveBeenCalledTimes(1));
    expect(mockSendAck).not.toHaveBeenCalled();

    // End arrives while Start is still retrying -> deferred without calling server or ACKing.
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'deferred-end',
      ownerId: 'srv-1',
      startedAt: startMs,
      endedAt: endMs,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchCurrentFast).toHaveBeenCalledTimes(1);
    expect(endFast).not.toHaveBeenCalled();
    expect(mockSendAck).not.toHaveBeenCalled();

    // Watch retries Start -> succeeds, then deferred End drains and ends the newly created fast.
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'retry-start',
      ownerId: 'srv-1',
      startedAt: startMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('deferred-end', true)
    );
    expect(mockSendAck).toHaveBeenCalledWith('retry-start', true);
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-retried',
        startTime: '2026-11-25T08:00:00.000Z',
        endTime: '2026-11-25T11:00:00.000Z',
      })
    );
  });

  it('unblocks deferred End and settles Start when direct watch sync reports matching clientId', async () => {
    const startMs = Date.parse('2026-11-25T08:00:00.000Z');
    const endMs = Date.parse('2026-11-25T11:00:00.000Z');
    (fetchCurrentFast as jest.Mock)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        id: 'f-direct',
        start_time: '2026-11-25T08:00:00.000Z',
      });

    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'direct-start-1',
      ownerId: 'srv-1',
      startedAt: startMs,
    });
    await waitFor(() => expect(addLog).toHaveBeenCalledTimes(1));

    mockListeners.get('onFastEndRequested')?.({
      clientId: 'deferred-end-direct',
      ownerId: 'srv-1',
      startedAt: startMs,
      endedAt: endMs,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(endFast).not.toHaveBeenCalled();

    // Direct watch sync reports direct-start-1 settled -> unblocks deferred End immediately.
    mockListeners.get('onWatchServerSynced')?.({
      domain: 'fasting',
      ownerId: 'srv-1',
      clientId: 'direct-start-1',
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('deferred-end-direct', true)
    );
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-direct',
        startTime: '2026-11-25T08:00:00.000Z',
        endTime: '2026-11-25T11:00:00.000Z',
      })
    );

    // Late duplicate replay of direct-start-1 is already settled and must not call startFast.
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'direct-start-1',
      ownerId: 'srv-1',
      startedAt: startMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('direct-start-1', true)
    );
    expect(startFast).not.toHaveBeenCalled();
  });

  it('isolates unmatched clientId, matches ID-less fasting sync by startedAt, and settles Start before draining End', async () => {
    const startMs = Date.parse('2026-11-25T08:00:00.000Z');
    const endMs = Date.parse('2026-11-25T11:00:00.000Z');
    (fetchCurrentFast as jest.Mock)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        id: 'f-direct-no-id',
        start_time: '2026-11-25T08:00:00.500Z',
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'f-unrelated',
        start_time: '2026-11-25T02:00:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 'f-direct-no-id',
        start_time: '2026-11-25T08:00:00.500Z',
      })
      .mockResolvedValueOnce({
        id: 'f-direct-no-id',
        start_time: '2026-11-25T08:00:00.500Z',
      });

    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'legacy-start',
      ownerId: 'srv-1',
      startedAt: startMs,
    });
    await waitFor(() => expect(addLog).toHaveBeenCalledTimes(1));

    mockListeners.get('onFastEndRequested')?.({
      clientId: 'legacy-deferred-end',
      ownerId: 'srv-1',
      startedAt: startMs,
      endedAt: endMs,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(endFast).not.toHaveBeenCalled();

    // (a) Explicit unrelated clientId must NOT settle legacy-start or release deferred End even if server fast matches legacy-start's timestamp.
    mockListeners.get('onWatchServerSynced')?.({
      domain: 'fasting',
      ownerId: 'srv-1',
      clientId: 'some-other-fast-op',
    });
    await waitFor(() => expect(fetchCurrentFast).toHaveBeenCalledTimes(2));
    expect(endFast).not.toHaveBeenCalled();
    expect(mockSendAck).not.toHaveBeenCalled();

    // ID-less fasting sync while server still has no manual fast -> keeps End deferred.
    mockListeners.get('onWatchServerSynced')?.({
      domain: 'fasting',
      ownerId: 'srv-1',
    });
    await waitFor(() => expect(fetchCurrentFast).toHaveBeenCalledTimes(3));
    expect(endFast).not.toHaveBeenCalled();
    expect(mockSendAck).not.toHaveBeenCalled();

    // (b) ID-less fasting sync with an older server fast (startedAt mismatch > 1s) -> keeps End deferred.
    mockListeners.get('onWatchServerSynced')?.({
      domain: 'fasting',
      ownerId: 'srv-1',
    });
    await waitFor(() => expect(fetchCurrentFast).toHaveBeenCalledTimes(4));
    expect(endFast).not.toHaveBeenCalled();
    expect(mockSendAck).not.toHaveBeenCalled();

    // ID-less fasting sync once server confirms the matching manual fast (within <= 1s) -> settles Start and drains End.
    mockListeners.get('onWatchServerSynced')?.({
      domain: 'fasting',
      ownerId: 'srv-1',
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('legacy-deferred-end', true)
    );
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-direct-no-id',
        startTime: '2026-11-25T08:00:00.500Z',
        endTime: '2026-11-25T11:00:00.000Z',
      })
    );

    // (c) Late replay of legacy-start after ID-less sync + drained End (when server now returns null) must NOT call startFast again.
    (fetchCurrentFast as jest.Mock).mockResolvedValueOnce(null);
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'legacy-start',
      ownerId: 'srv-1',
      startedAt: startMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('legacy-start', true)
    );
    expect(startFast).not.toHaveBeenCalled();
  });

  it('scopes deferred End blocking to the targeted fast and drains only unblocked deferred Ends', async () => {
    const startAMs = Date.parse('2026-11-25T06:00:00.000Z');
    const startBMs = Date.parse('2026-11-25T10:00:00.000Z');
    const otherFastMs = Date.parse('2026-11-25T14:00:00.000Z');
    const endAMs = Date.parse('2026-11-25T09:00:00.000Z');
    const endBMs = Date.parse('2026-11-25T12:00:00.000Z');
    const otherEndMs = Date.parse('2026-11-25T16:00:00.000Z');

    (fetchCurrentFast as jest.Mock)
      // Start A and Start B both fail transiently (offline).
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      // End with explicit server fastId runs immediately.
      .mockResolvedValueOnce({
        id: 'f-server-existing',
        start_time: '2026-11-25T05:00:00.000Z',
      })
      // End with non-matching startedAt runs immediately.
      .mockResolvedValueOnce({
        id: 'f-other-started',
        start_time: '2026-11-25T14:00:00.000Z',
      })
      // When Start A settles, End A drains and ends Fast A while End B and bare End stay deferred.
      .mockResolvedValueOnce({
        id: 'f-a',
        start_time: '2026-11-25T06:00:00.000Z',
      })
      // When Start B settles, End B and bare End drain.
      .mockResolvedValueOnce({
        id: 'f-b',
        start_time: '2026-11-25T10:00:00.000Z',
      })
      .mockResolvedValueOnce(null);

    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'retrying-start-a',
      ownerId: 'srv-1',
      startedAt: startAMs,
    });
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'retrying-start-b',
      ownerId: 'srv-1',
      startedAt: startBMs,
    });
    await waitFor(() => expect(addLog).toHaveBeenCalledTimes(2));

    // End with explicit server fastId is NOT blocked by retrying Start A/B.
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-with-fast-id',
      ownerId: 'srv-1',
      fastId: 'f-server-existing',
      endedAt: endAMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('end-with-fast-id', true)
    );
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-server-existing',
        startTime: '2026-11-25T05:00:00.000Z',
        endTime: '2026-11-25T09:00:00.000Z',
      })
    );

    // End with unrelated startedAt (no fastId) is NOT blocked by retrying Start A/B.
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-unrelated-started-at',
      ownerId: 'srv-1',
      startedAt: otherFastMs,
      endedAt: otherEndMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('end-unrelated-started-at', true)
    );
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-other-started',
        startTime: '2026-11-25T14:00:00.000Z',
        endTime: '2026-11-25T16:00:00.000Z',
      })
    );

    // Matching End A, matching End B, and bare End (no fastId/startedAt) ARE deferred.
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-matching-a',
      ownerId: 'srv-1',
      startedAt: startAMs,
      endedAt: endAMs,
    });
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-matching-b',
      ownerId: 'srv-1',
      startedAt: startBMs,
      endedAt: endBMs,
    });
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-bare',
      ownerId: 'srv-1',
    });

    // Settle Start A only -> End A drains immediately while End B and bare End stay deferred behind Start B.
    mockListeners.get('onWatchServerSynced')?.({
      domain: 'fasting',
      ownerId: 'srv-1',
      clientId: 'retrying-start-a',
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('end-matching-a', true)
    );
    const ackedIdsBeforeStartB = mockSendAck.mock.calls.map(
      ([clientId]) => clientId
    );
    expect(ackedIdsBeforeStartB).not.toContain('end-matching-b');
    expect(ackedIdsBeforeStartB).not.toContain('end-bare');
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-a',
        startTime: '2026-11-25T06:00:00.000Z',
        endTime: '2026-11-25T09:00:00.000Z',
      })
    );

    // Settle Start B -> End B and bare End both drain.
    mockListeners.get('onWatchServerSynced')?.({
      domain: 'fasting',
      ownerId: 'srv-1',
      clientId: 'retrying-start-b',
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('end-bare', true)
    );
    expect(mockSendAck).toHaveBeenCalledWith('end-matching-b', true);
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-b',
        startTime: '2026-11-25T10:00:00.000Z',
        endTime: '2026-11-25T12:00:00.000Z',
      })
    );
  });

  it('prunes abandoned older retrying Start markers when a newer fast starts or syncs', async () => {
    const oldStartMs = Date.parse('2026-11-25T04:00:00.000Z');
    const newerStartMs = Date.parse('2026-11-25T12:00:00.000Z');
    const newerEndMs = Date.parse('2026-11-25T15:00:00.000Z');

    (fetchCurrentFast as jest.Mock)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'f-newer',
        start_time: '2026-11-25T12:00:00.000Z',
      });
    (startFast as jest.Mock).mockResolvedValueOnce({
      id: 'f-newer',
      start_time: '2026-11-25T12:00:00.000Z',
      target_end_time: '2026-11-26T04:00:00.000Z',
      fasting_type: '16:8 Leangains',
    });

    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'abandoned-start-old',
      ownerId: 'srv-1',
      startedAt: oldStartMs,
    });
    await waitFor(() => expect(addLog).toHaveBeenCalledTimes(1));

    // Newer fast starts and commits -> prunes abandoned-start-old.
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'newer-start',
      ownerId: 'srv-1',
      startedAt: newerStartMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('newer-start', true)
    );

    // Subsequent bare End (no fastId/startedAt) is NOT blocked by the pruned older marker.
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'bare-end-after-prune',
      ownerId: 'srv-1',
      endedAt: newerEndMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('bare-end-after-prune', true)
    );
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-newer',
        startTime: '2026-11-25T12:00:00.000Z',
        endTime: '2026-11-25T15:00:00.000Z',
      })
    );

    // Also prunes an abandoned retrying Start when onWatchServerSynced confirms a newer direct fast.
    const syncedStartMs = Date.parse('2026-11-25T18:00:00.000Z');
    const syncedEndMs = Date.parse('2026-11-25T20:00:00.000Z');
    (fetchCurrentFast as jest.Mock)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        id: 'f-direct-newer',
        start_time: new Date(syncedStartMs).toISOString(),
      })
      .mockResolvedValueOnce({
        id: 'f-direct-newer',
        start_time: new Date(syncedStartMs).toISOString(),
      });

    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'abandoned-start-2',
      ownerId: 'srv-1',
      startedAt: Date.parse('2026-11-25T16:00:00.000Z'),
    });
    await waitFor(() => expect(addLog).toHaveBeenCalledTimes(2));

    mockListeners.get('onWatchServerSynced')?.({
      domain: 'fasting',
      ownerId: 'srv-1',
      clientId: 'direct-watch-newer-start',
    });
    await waitFor(() => expect(fetchCurrentFast).toHaveBeenCalledTimes(5));

    mockListeners.get('onFastEndRequested')?.({
      clientId: 'bare-end-after-sync-prune',
      ownerId: 'srv-1',
      endedAt: syncedEndMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith(
        'bare-end-after-sync-prune',
        true
      )
    );
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-direct-newer',
        startTime: new Date(syncedStartMs).toISOString(),
        endTime: new Date(syncedEndMs).toISOString(),
      })
    );
  });

  it('records pruned superseded retrying starts as settled so late redelivery after a newer fast ends replays state instead of creating a backdated fast', async () => {
    const mockSendFastAck = jest.fn(() => Promise.resolve());
    const watchModule = WatchConnectivity as unknown as {
      sendFastAck?: typeof mockSendFastAck;
    };
    watchModule.sendFastAck = mockSendFastAck;

    try {
      const oldStartMs = Date.parse('2026-11-25T04:00:00.000Z');
      const newerStartMs = Date.parse('2026-11-25T12:00:00.000Z');
      const newerEndMs = Date.parse('2026-11-25T15:00:00.000Z');
      const syncedOldStartMs = Date.parse('2026-11-25T16:00:00.000Z');
      const syncedNewerStartMs = Date.parse('2026-11-25T18:00:00.000Z');
      const brandNewStartMs = Date.parse('2026-11-25T21:00:00.000Z');

      (fetchCurrentFast as jest.Mock)
        // 1. abandoned-start-exec fails transiently (offline)
        .mockRejectedValueOnce(new Error('offline'))
        // 2. newer-start sees no active fast -> creates f-newer & prunes abandoned-start-exec
        .mockResolvedValueOnce(null)
        // 3. end-newer ends f-newer
        .mockResolvedValueOnce({
          id: 'f-newer',
          start_time: new Date(newerStartMs).toISOString(),
        })
        // 4. late replay of abandoned-start-exec -> replaySettledAck fetches current state (null)
        .mockResolvedValueOnce(null)
        // 5. abandoned-start-sync fails transiently (offline)
        .mockRejectedValueOnce(new Error('offline'))
        // 6. onWatchServerSynced fetches newer direct fast -> prunes abandoned-start-sync
        .mockResolvedValueOnce({
          id: 'f-direct-2',
          start_time: new Date(syncedNewerStartMs).toISOString(),
        })
        // 7. late replay of abandoned-start-sync after f-direct-2 ended -> replaySettledAck fetches current state (null)
        .mockResolvedValueOnce(null)
        // 8. brand-new-start with a new clientId sees no active fast -> succeeds
        .mockResolvedValueOnce(null);

      (startFast as jest.Mock)
        .mockResolvedValueOnce({
          id: 'f-newer',
          start_time: new Date(newerStartMs).toISOString(),
          target_end_time: new Date(
            newerStartMs + 16 * 3_600_000
          ).toISOString(),
          fasting_type: '16:8 Leangains',
        })
        .mockResolvedValueOnce({
          id: 'f-brand-new',
          start_time: new Date(brandNewStartMs).toISOString(),
          target_end_time: new Date(
            brandNewStartMs + 16 * 3_600_000
          ).toISOString(),
          fasting_type: '16:8 Leangains',
        });

      renderHook(() => useWatchFastingBridge(true));

      // Path A: executeStart prunes abandoned-start-exec and marks it settled.
      mockListeners.get('onFastStartRequested')?.({
        presetId: '16-8',
        clientId: 'abandoned-start-exec',
        ownerId: 'srv-1',
        startedAt: oldStartMs,
      });
      await waitFor(() => expect(addLog).toHaveBeenCalledTimes(1));

      mockListeners.get('onFastStartRequested')?.({
        presetId: '16-8',
        clientId: 'newer-start',
        ownerId: 'srv-1',
        startedAt: newerStartMs,
      });
      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          'newer-start',
          true,
          true,
          expect.objectContaining({ startedAt: newerStartMs })
        )
      );

      mockListeners.get('onFastEndRequested')?.({
        clientId: 'end-newer',
        ownerId: 'srv-1',
        fastId: 'f-newer',
        endedAt: newerEndMs,
      });
      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          'end-newer',
          true,
          true,
          null
        )
      );

      // Late redelivery of pruned abandoned-start-exec after newer fast ended must NOT create a backdated fast.
      mockListeners.get('onFastStartRequested')?.({
        presetId: '16-8',
        clientId: 'abandoned-start-exec',
        ownerId: 'srv-1',
        startedAt: oldStartMs,
      });
      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          'abandoned-start-exec',
          true,
          true,
          null
        )
      );
      expect(startFast).toHaveBeenCalledTimes(1);

      // Path B: onServerSynced prunes abandoned-start-sync and marks it settled.
      mockListeners.get('onFastStartRequested')?.({
        presetId: '16-8',
        clientId: 'abandoned-start-sync',
        ownerId: 'srv-1',
        startedAt: syncedOldStartMs,
      });
      await waitFor(() => expect(addLog).toHaveBeenCalledTimes(2));

      mockListeners.get('onWatchServerSynced')?.({
        domain: 'fasting',
        ownerId: 'srv-1',
        clientId: 'direct-start-2',
      });
      await waitFor(() => expect(fetchCurrentFast).toHaveBeenCalledTimes(6));

      // Late redelivery of pruned abandoned-start-sync after the newer fast ends replays current state (null).
      mockListeners.get('onFastStartRequested')?.({
        presetId: '16-8',
        clientId: 'abandoned-start-sync',
        ownerId: 'srv-1',
        startedAt: syncedOldStartMs,
      });
      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          'abandoned-start-sync',
          true,
          true,
          null
        )
      );
      expect(startFast).toHaveBeenCalledTimes(1);

      // A genuinely new start with a new clientId still succeeds.
      mockListeners.get('onFastStartRequested')?.({
        presetId: '16-8',
        clientId: 'brand-new-start',
        ownerId: 'srv-1',
        startedAt: brandNewStartMs,
      });
      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          'brand-new-start',
          true,
          true,
          expect.objectContaining({ startedAt: brandNewStartMs })
        )
      );
      expect(startFast).toHaveBeenCalledTimes(2);
    } finally {
      delete watchModule.sendFastAck;
    }
  });

  it('ignores later retrying starts when an End lacks startedAt but carries an earlier endedAt', async () => {
    const earlierStartMs = Date.parse('2026-11-25T06:00:00.000Z');
    const earlierEndMs = Date.parse('2026-11-25T09:00:00.000Z');
    const laterStartMs = Date.parse('2026-11-25T12:00:00.000Z');
    const laterEndMs = Date.parse('2026-11-25T14:00:00.000Z');

    (fetchCurrentFast as jest.Mock)
      // 1. laterStart fails transiently (offline)
      .mockRejectedValueOnce(new Error('offline'))
      // 2. earlier End (endedAt 09:00 < retrying start 12:00) runs immediately
      .mockResolvedValueOnce({
        id: 'f-earlier',
        start_time: new Date(earlierStartMs).toISOString(),
      })
      // 3. after laterStart settles, deferred later End (endedAt 14:00 >= 12:00) runs
      .mockResolvedValueOnce({
        id: 'f-later',
        start_time: new Date(laterStartMs).toISOString(),
      })
      // 4. deferred bare End (no endedAt) drains
      .mockResolvedValueOnce(null);

    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'retrying-later-start',
      ownerId: 'srv-1',
      startedAt: laterStartMs,
    });
    await waitFor(() => expect(addLog).toHaveBeenCalledTimes(1));

    // End without startedAt whose endedAt (09:00) precedes the retrying start (12:00) is NOT blocked.
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-earlier-ended-at',
      ownerId: 'srv-1',
      endedAt: earlierEndMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('end-earlier-ended-at', true)
    );
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-earlier',
        startTime: new Date(earlierStartMs).toISOString(),
        endTime: new Date(earlierEndMs).toISOString(),
      })
    );

    // End without startedAt whose endedAt (14:00) >= retrying start (12:00), and bare End without endedAt, ARE deferred.
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-after-later-start',
      ownerId: 'srv-1',
      endedAt: laterEndMs,
    });
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-no-timestamps',
      ownerId: 'srv-1',
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const ackedBeforeSettle = mockSendAck.mock.calls.map(
      ([clientId]) => clientId
    );
    expect(ackedBeforeSettle).not.toContain('end-after-later-start');
    expect(ackedBeforeSettle).not.toContain('end-no-timestamps');

    // Settling the retrying start drains both deferred Ends.
    mockListeners.get('onWatchServerSynced')?.({
      domain: 'fasting',
      ownerId: 'srv-1',
      clientId: 'retrying-later-start',
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('end-no-timestamps', true)
    );
    expect(mockSendAck).toHaveBeenCalledWith('end-after-later-start', true);
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-later',
        startTime: new Date(laterStartMs).toISOString(),
        endTime: new Date(laterEndMs).toISOString(),
      })
    );
  });

  it('resolves explicit and omitted ownerId to the same active owner queue and retrying state', async () => {
    const startMs = Date.parse('2026-11-25T08:00:00.000Z');
    const endMs = Date.parse('2026-11-25T11:00:00.000Z');

    (fetchCurrentFast as jest.Mock)
      // 1. Explicit-owner Start fails transiently (offline)
      .mockRejectedValueOnce(new Error('offline'))
      // 2. Retried Start succeeds
      .mockResolvedValueOnce(null)
      // 3. Deferred omitted-owner End drains and ends the created fast
      .mockResolvedValueOnce({
        id: 'f-shared-owner',
        start_time: new Date(startMs).toISOString(),
      });
    (startFast as jest.Mock).mockResolvedValueOnce({
      id: 'f-shared-owner',
      start_time: new Date(startMs).toISOString(),
      target_end_time: new Date(startMs + 16 * 3_600_000).toISOString(),
      fasting_type: '16:8 Leangains',
    });

    renderHook(() => useWatchFastingBridge(true));

    // Start arrives with explicit ownerId 'srv-1'.
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'shared-owner-start',
      ownerId: 'srv-1',
      startedAt: startMs,
    });
    await waitFor(() => expect(addLog).toHaveBeenCalledTimes(1));

    // End with matching ownerId 'srv-1' defers behind the retrying Start on the same 'srv-1' queue.
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'omitted-owner-end',
      ownerId: 'srv-1',
      startedAt: startMs,
      endedAt: endMs,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(endFast).not.toHaveBeenCalled();
    expect(mockSendAck).not.toHaveBeenCalled();

    // Retry Start -> commits and drains the deferred omitted-owner End on the same 'srv-1' queue.
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'shared-owner-start',
      ownerId: 'srv-1',
      startedAt: startMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('omitted-owner-end', true)
    );
    expect(mockSendAck).toHaveBeenCalledWith('shared-owner-start', true);
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-shared-owner',
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
      })
    );
  });

  it('settles a deferred legacy End without ending a replacement fast when its blocking Start is pruned by a newer Start', async () => {
    const mockSendFastAck = jest.fn(() => Promise.resolve());
    const watchModule = WatchConnectivity as unknown as {
      sendFastAck?: typeof mockSendFastAck;
    };
    watchModule.sendFastAck = mockSendFastAck;

    try {
      const startAMs = Date.parse('2026-11-25T04:00:00.000Z');
      const startBMs = Date.parse('2026-11-25T12:00:00.000Z');
      const startCMs = Date.parse('2026-11-25T18:00:00.000Z');

      (fetchCurrentFast as jest.Mock)
        // 1. Start A fails transiently (offline)
        .mockRejectedValueOnce(new Error('offline'))
        // 2. Newer Start B sees no active fast -> creates f-b & prunes Start A
        .mockResolvedValueOnce(null)
        // 3. replaySettledAck for superseded legacy-end-a fetches current fast (f-b)
        .mockResolvedValueOnce({
          id: 'f-b',
          start_time: new Date(startBMs).toISOString(),
          target_end_time: new Date(startBMs + 16 * 3_600_000).toISOString(),
          fasting_type: '16:8 Leangains',
        })
        // 4. Start C fails transiently (offline)
        .mockRejectedValueOnce(new Error('offline'))
        // 5. Retry Start C succeeds (original start succeeds, not pruned)
        .mockResolvedValueOnce(null)
        // 6. Deferred legacy-end-c drains and ends f-c
        .mockResolvedValueOnce({
          id: 'f-c',
          start_time: new Date(startCMs).toISOString(),
        });

      (startFast as jest.Mock)
        .mockResolvedValueOnce({
          id: 'f-b',
          start_time: new Date(startBMs).toISOString(),
          target_end_time: new Date(startBMs + 16 * 3_600_000).toISOString(),
          fasting_type: '16:8 Leangains',
        })
        .mockResolvedValueOnce({
          id: 'f-c',
          start_time: new Date(startCMs).toISOString(),
          target_end_time: new Date(startCMs + 16 * 3_600_000).toISOString(),
          fasting_type: '16:8 Leangains',
        });

      renderHook(() => useWatchFastingBridge(true));

      // Part 1: Start A fails offline, legacy End A defers behind Start A.
      mockListeners.get('onFastStartRequested')?.({
        presetId: '16-8',
        clientId: 'start-a-pruned',
        ownerId: 'srv-1',
        startedAt: startAMs,
      });
      await waitFor(() => expect(addLog).toHaveBeenCalledTimes(1));

      mockListeners.get('onFastEndRequested')?.({
        clientId: 'legacy-end-a',
        ownerId: 'srv-1',
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(endFast).not.toHaveBeenCalled();

      // Newer Start B commits and prunes Start A -> legacy-end-a must settle with f-b WITHOUT calling endFast on f-b.
      mockListeners.get('onFastStartRequested')?.({
        presetId: '16-8',
        clientId: 'start-b-replacement',
        ownerId: 'srv-1',
        startedAt: startBMs,
      });
      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          'legacy-end-a',
          true,
          true,
          expect.objectContaining({ id: 'f-b', startedAt: startBMs })
        )
      );
      expect(endFast).not.toHaveBeenCalled();

      // Part 2: When the original Start C succeeds instead of being pruned, its deferred legacy End C still ends f-c.
      mockListeners.get('onFastStartRequested')?.({
        presetId: '16-8',
        clientId: 'start-c-original',
        ownerId: 'srv-1',
        startedAt: startCMs,
      });
      await waitFor(() => expect(addLog).toHaveBeenCalledTimes(2));

      mockListeners.get('onFastEndRequested')?.({
        clientId: 'legacy-end-c',
        ownerId: 'srv-1',
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(endFast).not.toHaveBeenCalled();

      mockListeners.get('onFastStartRequested')?.({
        presetId: '16-8',
        clientId: 'start-c-original',
        ownerId: 'srv-1',
        startedAt: startCMs,
      });
      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          'legacy-end-c',
          true,
          true,
          null
        )
      );
      expect(endFast).toHaveBeenCalledTimes(1);
      expect(endFast).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'f-c',
          startTime: new Date(startCMs).toISOString(),
        })
      );
    } finally {
      delete watchModule.sendFastAck;
    }
  });

  it('keeps a committed Start settled and drains deferred Ends even when sendAckWithFast rejects', async () => {
    const mockSendFastAck = jest.fn(() => Promise.resolve());
    const watchModule = WatchConnectivity as unknown as {
      sendFastAck?: typeof mockSendFastAck;
    };
    watchModule.sendFastAck = mockSendFastAck;

    try {
      const startMs = Date.parse('2026-11-25T08:00:00.000Z');
      const endMs = Date.parse('2026-11-25T11:00:00.000Z');

      (fetchCurrentFast as jest.Mock)
        // 1. Initial Start fails transiently (offline)
        .mockRejectedValueOnce(new Error('offline'))
        // 2. Retried Start succeeds on server
        .mockResolvedValueOnce(null)
        // 3. Deferred End drains immediately even though Start's ack rejected
        .mockResolvedValueOnce({
          id: 'f-committed-ack-err',
          start_time: new Date(startMs).toISOString(),
        })
        // 4. Late redelivery of Start replays settled ack with fresh server state (null)
        .mockResolvedValueOnce(null);

      (startFast as jest.Mock).mockResolvedValueOnce({
        id: 'f-committed-ack-err',
        start_time: new Date(startMs).toISOString(),
        target_end_time: new Date(startMs + 16 * 3_600_000).toISOString(),
        fasting_type: '16:8 Leangains',
      });

      mockSendFastAck
        .mockRejectedValueOnce(new Error('watch disconnected'))
        .mockResolvedValue(undefined);

      renderHook(() => useWatchFastingBridge(true));

      mockListeners.get('onFastStartRequested')?.({
        presetId: '16-8',
        clientId: 'start-ack-throws',
        ownerId: 'srv-1',
        startedAt: startMs,
      });
      await waitFor(() => expect(addLog).toHaveBeenCalledTimes(1));

      mockListeners.get('onFastEndRequested')?.({
        clientId: 'end-after-ack-throw',
        ownerId: 'srv-1',
        startedAt: startMs,
        endedAt: endMs,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(endFast).not.toHaveBeenCalled();

      // Retried Start commits, sendFastAck rejects -> must NOT re-mark retrying, MUST drain deferred End.
      mockListeners.get('onFastStartRequested')?.({
        presetId: '16-8',
        clientId: 'start-ack-throws',
        ownerId: 'srv-1',
        startedAt: startMs,
      });
      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          'end-after-ack-throw',
          true,
          true,
          null
        )
      );
      expect(startFast).toHaveBeenCalledTimes(1);
      expect(endFast).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'f-committed-ack-err',
          startTime: new Date(startMs).toISOString(),
          endTime: new Date(endMs).toISOString(),
        })
      );

      // Redelivery of start-ack-throws replays settled ack without calling startFast again.
      mockListeners.get('onFastStartRequested')?.({
        presetId: '16-8',
        clientId: 'start-ack-throws',
        ownerId: 'srv-1',
        startedAt: startMs,
      });
      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          'start-ack-throws',
          true,
          true,
          null
        )
      );
      expect(startFast).toHaveBeenCalledTimes(1);
    } finally {
      delete watchModule.sendFastAck;
    }
  });

  it('settles a deferred endedAt-only End without ending replacement Start B when blocking Start A is pruned', async () => {
    const startAMs = Date.parse('2026-11-25T08:00:00.000Z');
    const startBMs = Date.parse('2026-11-25T11:00:00.000Z');
    const endMs = Date.parse('2026-11-25T12:00:00.000Z');

    (fetchCurrentFast as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        id: 'f-b-13',
        start_time: new Date(startBMs).toISOString(),
        target_end_time: new Date(startBMs + 16 * 3_600_000).toISOString(),
        fasting_type: '16:8 Leangains',
      });
    (startFast as jest.Mock)
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValueOnce({
        id: 'f-b-13',
        start_time: new Date(startBMs).toISOString(),
        target_end_time: new Date(startBMs + 16 * 3_600_000).toISOString(),
        fasting_type: '16:8 Leangains',
      });

    renderHook(() => useWatchFastingBridge(true));

    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'start-a-0800',
      ownerId: 'srv-1',
      startedAt: startAMs,
    });
    await waitFor(() => expect(addLog).toHaveBeenCalledTimes(1));

    // End with only endedAt (no fastId, no startedAt) waits behind Start A.
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-only-endedat',
      ownerId: 'srv-1',
      endedAt: endMs,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(endFast).not.toHaveBeenCalled();

    // Replacement Start B succeeds and prunes Start A; End must settle without calling endFast on B.
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'start-b-1100',
      ownerId: 'srv-1',
      startedAt: startBMs,
    });

    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('end-only-endedat', true)
    );
    expect(endFast).not.toHaveBeenCalled();
  });

  it('removes resolved Start B from blockedByStartIds while Start A still retries so later Start C pruning A supersedes the deferred End', async () => {
    const startBMs = Date.parse('2026-11-25T07:00:00.000Z');
    const startAMs = Date.parse('2026-11-25T08:00:00.000Z');
    const startCMs = Date.parse('2026-11-25T11:00:00.000Z');
    const endMs = Date.parse('2026-11-25T12:00:00.000Z');

    (fetchCurrentFast as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        id: 'f-c-14',
        start_time: new Date(startCMs).toISOString(),
        target_end_time: new Date(startCMs + 16 * 3_600_000).toISOString(),
        fasting_type: '16:8 Leangains',
      });
    (startFast as jest.Mock)
      .mockRejectedValueOnce(new Error('Network timeout B'))
      .mockRejectedValueOnce(new Error('Network timeout A'))
      .mockResolvedValueOnce({
        id: 'f-b-14',
        start_time: new Date(startBMs).toISOString(),
        target_end_time: new Date(startBMs + 16 * 3_600_000).toISOString(),
        fasting_type: '16:8 Leangains',
      })
      .mockResolvedValueOnce({
        id: 'f-c-14',
        start_time: new Date(startCMs).toISOString(),
        target_end_time: new Date(startCMs + 16 * 3_600_000).toISOString(),
        fasting_type: '16:8 Leangains',
      });

    renderHook(() => useWatchFastingBridge(true));

    // Start B (07:00) and Start A (08:00) both fail and stay retrying.
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'start-b-0700',
      ownerId: 'srv-1',
      startedAt: startBMs,
    });
    await waitFor(() => expect(addLog).toHaveBeenCalledTimes(1));

    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'start-a-0800',
      ownerId: 'srv-1',
      startedAt: startAMs,
    });
    await waitFor(() => expect(addLog).toHaveBeenCalledTimes(2));

    // Startless End waits behind both Start B and Start A.
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-blocked-two',
      ownerId: 'srv-1',
      endedAt: endMs,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(endFast).not.toHaveBeenCalled();

    // Start B (07:00) retries and succeeds; Start A (08:00) is newer so it is NOT pruned.
    // drainDeferredEnds must strip resolved Start B from blockedByStartIds while keeping End deferred.
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'start-b-0700',
      ownerId: 'srv-1',
      startedAt: startBMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('start-b-0700', true)
    );
    expect(endFast).not.toHaveBeenCalled();

    // Later Start C (11:00) succeeds and prunes Start A (08:00).
    // Because resolved Start B was already removed from blockedByStartIds, End is now superseded.
    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'start-c-1100',
      ownerId: 'srv-1',
      startedAt: startCMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('end-blocked-two', true)
    );
    expect(endFast).not.toHaveBeenCalled();
  });

  it('binds fasting API reads and writes to the resolved owner ServerConfig and aborts when unavailable', async () => {
    const startMs = Date.parse('2026-11-25T09:00:00.000Z');
    const endMs = Date.parse('2026-11-25T13:00:00.000Z');
    (fetchCurrentFast as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'f-bound',
        start_time: new Date(startMs).toISOString(),
      });
    (startFast as jest.Mock).mockResolvedValueOnce({
      id: 'f-bound',
      start_time: new Date(startMs).toISOString(),
      target_end_time: new Date(startMs + 16 * 3_600_000).toISOString(),
      fasting_type: '16:8 Leangains',
    });

    renderHook(() => useWatchFastingBridge(true));

    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'start-bound',
      ownerId: 'srv-1',
      startedAt: startMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('start-bound', true)
    );
    expect(fetchCurrentFast).toHaveBeenCalledWith(mockServerConfig);
    expect(startFast).toHaveBeenCalledWith(
      expect.objectContaining({ serverConfig: mockServerConfig })
    );

    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-bound',
      ownerId: 'srv-1',
      fastId: 'f-bound',
      endedAt: endMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('end-bound', true)
    );
    expect(endFast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'f-bound',
        serverConfig: mockServerConfig,
      })
    );

    // When owner's ServerConfig cannot be resolved, abort without sending requests or acks.
    (fetchCurrentFast as jest.Mock).mockClear();
    (startFast as jest.Mock).mockClear();
    (endFast as jest.Mock).mockClear();
    mockSendAck.mockClear();
    (getActiveServerConfig as jest.Mock).mockResolvedValue(null);

    mockListeners.get('onFastStartRequested')?.({
      presetId: '16-8',
      clientId: 'start-missing-cfg',
      ownerId: 'srv-1',
      startedAt: startMs,
    });
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-missing-cfg',
      ownerId: 'srv-1',
      fastId: 'f-bound',
      endedAt: endMs,
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(fetchCurrentFast).not.toHaveBeenCalled();
    expect(startFast).not.toHaveBeenCalled();
    expect(endFast).not.toHaveBeenCalled();
    expect(mockSendAck).not.toHaveBeenCalled();
  });

  it('scopes cancelFastGoalNotification to the ended fast id and skips it when the active owner changes mid-endFast', async () => {
    const startMs = Date.parse('2026-11-25T09:00:00.000Z');
    const endMs = Date.parse('2026-11-25T13:00:00.000Z');

    // 1. Active owner matches -> cancelFastGoalNotification is invoked with the ended fast id.
    (fetchCurrentFast as jest.Mock).mockResolvedValueOnce({
      id: 'f-cancel-scoped',
      start_time: new Date(startMs).toISOString(),
    });
    (endFast as jest.Mock).mockResolvedValueOnce({});

    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-cancel-scoped',
      ownerId: 'srv-1',
      fastId: 'f-cancel-scoped',
      endedAt: endMs,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('end-cancel-scoped', true)
    );
    expect(cancelFastGoalNotification).toHaveBeenCalledWith('f-cancel-scoped');

    // 2. Active owner switches while endFast is in flight -> cancelFastGoalNotification MUST NOT run.
    (cancelFastGoalNotification as jest.Mock).mockClear();
    mockSendAck.mockClear();
    let resolveEnd!: () => void;
    (fetchCurrentFast as jest.Mock).mockResolvedValueOnce({
      id: 'f-switch-mid-end',
      start_time: new Date(startMs).toISOString(),
    });
    (endFast as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveEnd = resolve;
        })
    );

    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-switch-mid-end',
      ownerId: 'srv-1',
      fastId: 'f-switch-mid-end',
      endedAt: endMs,
    });
    await waitFor(() => expect(endFast).toHaveBeenCalledTimes(2));

    // Switch active server to srv-2 before endFast resolves.
    (getActiveServerConfigId as jest.Mock).mockResolvedValue('srv-2');
    resolveEnd();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(cancelFastGoalNotification).not.toHaveBeenCalled();
    expect(mockSendAck).not.toHaveBeenCalled();
  });

  it('settles a deferred startless End without calling endFast when its blocking Start is permanently rejected', async () => {
    const startMs = Date.parse('2026-11-25T10:00:00.000Z');
    const endMs = Date.parse('2026-11-25T10:05:00.000Z');
    (getActiveServerConfigId as jest.Mock).mockResolvedValue('srv-1');
    let rejectStart!: (err: unknown) => void;
    (startFast as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectStart = reject;
        })
    );
    (fetchCurrentFast as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        id: 'other-device-fast-b',
        start_time: new Date(startMs - 60_000).toISOString(),
        target_duration_hours: 16,
        protocol: '16:8',
      });

    renderHook(() => useWatchFastingBridge(true));
    mockListeners.get('onFastStartRequested')?.({
      clientId: 'start-perm-reject',
      ownerId: 'srv-1',
      presetId: '16-8',
      startedAt: startMs,
    });
    await waitFor(() => expect(startFast).toHaveBeenCalledTimes(1));

    // Transient failure puts start-perm-reject into retryingStarts.
    rejectStart(new TypeError('Network request failed'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Startless End is deferred behind start-perm-reject.
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-startless-after-reject',
      ownerId: 'srv-1',
      endedAt: endMs,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(endFast).not.toHaveBeenCalled();

    // Replay of start-perm-reject now fails with permanent 400 rejection.
    (startFast as jest.Mock).mockRejectedValueOnce(
      new ApiError('Invalid', 400)
    );
    mockListeners.get('onFastStartRequested')?.({
      clientId: 'start-perm-reject',
      ownerId: 'srv-1',
      presetId: '16-8',
      startedAt: startMs,
    });

    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith(
        'end-startless-after-reject',
        true
      )
    );
    expect(endFast).not.toHaveBeenCalled();
  });

  it('replaces blockedByStartIds with currentBlockers when an End stays deferred so later pruning settles it', async () => {
    const s1Ms = Date.parse('2026-11-25T08:00:00.000Z');
    const s2Ms = Date.parse('2026-11-25T08:10:00.000Z');
    const s3Ms = Date.parse('2026-11-25T08:20:00.000Z');
    const endMs = Date.parse('2026-11-25T08:30:00.000Z');
    (getActiveServerConfigId as jest.Mock).mockResolvedValue('srv-1');

    (startFast as jest.Mock)
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce({
        id: 'fast-s1',
        start_time: new Date(s1Ms).toISOString(),
        target_duration_hours: 16,
        protocol: '16:8',
      })
      .mockResolvedValueOnce({
        id: 'fast-s3',
        start_time: new Date(s3Ms).toISOString(),
        target_duration_hours: 16,
        protocol: '16:8',
      });
    (fetchCurrentFast as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        id: 'fast-s3',
        start_time: new Date(s3Ms).toISOString(),
        target_duration_hours: 16,
        protocol: '16:8',
      });

    renderHook(() => useWatchFastingBridge(true));
    // s1 fails transiently -> retryingStarts = {s1}.
    mockListeners.get('onFastStartRequested')?.({
      clientId: 's1',
      ownerId: 'srv-1',
      presetId: '16-8',
      startedAt: s1Ms,
    });
    await waitFor(() => expect(startFast).toHaveBeenCalledTimes(1));

    // Startless End arrives -> deferred with blockedByStartIds = {s1}.
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'end-reblock',
      ownerId: 'srv-1',
      endedAt: endMs,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // s2 fails transiently -> retryingStarts = {s1, s2}.
    mockListeners.get('onFastStartRequested')?.({
      clientId: 's2',
      ownerId: 'srv-1',
      presetId: '16-8',
      startedAt: s2Ms,
    });
    await waitFor(() => expect(startFast).toHaveBeenCalledTimes(2));

    // s1 succeeds -> drainDeferredEnds runs, sees s2 still blocking, MUST replace blockedByStartIds with {s2}.
    mockListeners.get('onFastStartRequested')?.({
      clientId: 's1',
      ownerId: 'srv-1',
      presetId: '16-8',
      startedAt: s1Ms,
    });
    await waitFor(() => expect(startFast).toHaveBeenCalledTimes(3));
    expect(endFast).not.toHaveBeenCalled();

    // s3 succeeds with newer timestamp -> prunes s2; because blockedByStartIds has {s2}, end-reblock is superseded!
    mockListeners.get('onFastStartRequested')?.({
      clientId: 's3',
      ownerId: 'srv-1',
      presetId: '16-8',
      startedAt: s3Ms,
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('end-reblock', true)
    );
    expect(endFast).not.toHaveBeenCalled();
  });

  it('acks false immediately on transient Apple Watch (no ownerId) fastStart/fastEnd errors without blocking subsequent startless fastEnd', async () => {
    const startMs = Date.parse('2026-11-25T10:00:00.000Z');
    (getActiveServerConfigId as jest.Mock).mockResolvedValue('srv-1');
    (fetchCurrentFast as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'existing-active-fast',
        start_time: new Date(startMs - 60_000).toISOString(),
      })
      .mockResolvedValueOnce({
        id: 'existing-active-fast',
        start_time: new Date(startMs - 60_000).toISOString(),
      });
    (startFast as jest.Mock).mockRejectedValueOnce(
      new ApiError('Service Unavailable', 503)
    );
    (endFast as jest.Mock)
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ApiError('Service Unavailable', 503));

    renderHook(() => useWatchFastingBridge(true));

    // 1. Apple Watch fastStart (no ownerId) fails with 503 -> immediate sendAck(false), NOT held in retryingStarts.
    mockListeners.get('onFastStartRequested')?.({
      clientId: 'ios-start-503',
      presetId: '16-8',
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('ios-start-503', false)
    );

    // 2. Subsequent startless Apple Watch fastEnd (no ownerId) runs endFast immediately!
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'ios-end-after-503',
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('ios-end-after-503', true)
    );
    expect(endFast).toHaveBeenCalledTimes(1);

    // 3. Transient 503 on Apple Watch fastEnd (no ownerId) also sends immediate sendAck(false).
    mockListeners.get('onFastEndRequested')?.({
      clientId: 'ios-end-503',
    });
    await waitFor(() =>
      expect(mockSendAck).toHaveBeenCalledWith('ios-end-503', false)
    );
  });

  it('forwards UUID clientId to startFast and re-fetches current fast without reviving an already-ended replay', async () => {
    const mockSendFastAck = jest.fn();
    const watchMock = WatchConnectivity as unknown as {
      sendFastAck?: jest.Mock;
    };
    watchMock.sendFastAck = mockSendFastAck;
    try {
      const uuidClientId = '22222222-2222-4222-8222-222222222222';
      (fetchCurrentFast as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (startFast as jest.Mock).mockResolvedValueOnce({
        id: 'fast-ended',
        client_id: uuidClientId,
        start_time: '2026-11-25T08:00:00.000Z',
        end_time: '2026-11-25T16:00:00.000Z',
        target_end_time: '2026-11-26T00:00:00.000Z',
        fasting_type: '16:8 Leangains',
        status: 'COMPLETED',
      });

      renderHook(() => useWatchFastingBridge(true));
      mockListeners.get('onFastStartRequested')?.({
        clientId: uuidClientId,
        presetId: '16-8',
        startedAt: Date.parse('2026-11-25T08:00:00.000Z'),
      });

      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          uuidClientId,
          true,
          true,
          null
        )
      );
      expect(startFast).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: uuidClientId,
        })
      );
      expect(fetchCurrentFast).toHaveBeenCalledTimes(2);
    } finally {
      delete watchMock.sendFastAck;
    }
  });

  it('aborts without ack or settlement when re-fetch after completed replay rejects and active server changed', async () => {
    const mockSendFastAck = jest.fn();
    const watchMock = WatchConnectivity as unknown as {
      sendFastAck?: jest.Mock;
    };
    watchMock.sendFastAck = mockSendFastAck;
    try {
      const uuidClientId = '33333333-3333-4333-8333-333333333333';
      (getActiveServerConfigId as jest.Mock).mockResolvedValue('srv-1');
      (fetchCurrentFast as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockImplementationOnce(async () => {
          (getActiveServerConfigId as jest.Mock).mockResolvedValue('srv-2');
          throw new Error('network timeout');
        });
      (startFast as jest.Mock).mockResolvedValueOnce({
        id: 'fast-ended',
        client_id: uuidClientId,
        start_time: '2026-11-25T08:00:00.000Z',
        end_time: '2026-11-25T16:00:00.000Z',
        target_end_time: '2026-11-26T00:00:00.000Z',
        fasting_type: '16:8 Leangains',
        status: 'COMPLETED',
      });

      renderHook(() => useWatchFastingBridge(true));
      mockListeners.get('onFastStartRequested')?.({
        clientId: uuidClientId,
        presetId: '16-8',
        ownerId: 'srv-1',
        startedAt: Date.parse('2026-11-25T08:00:00.000Z'),
      });

      await waitFor(() => expect(fetchCurrentFast).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(getActiveServerConfigId).toHaveReturnedWith(
          Promise.resolve('srv-2')
        )
      );
      expect(mockSendFastAck).not.toHaveBeenCalled();
      expect(mockSendAck).not.toHaveBeenCalled();
    } finally {
      delete watchMock.sendFastAck;
    }
  });

  it('settles and defers ack when re-fetch after completed replay rejects on same server, then replays fresh state on retry', async () => {
    const mockSendFastAck = jest.fn();
    const watchMock = WatchConnectivity as unknown as {
      sendFastAck?: jest.Mock;
    };
    watchMock.sendFastAck = mockSendFastAck;
    try {
      const uuidClientId = '44444444-4444-4444-8444-444444444444';
      (getActiveServerConfigId as jest.Mock).mockResolvedValue('srv-1');
      (fetchCurrentFast as jest.Mock)
        .mockResolvedValueOnce({
          id: 'auto-1',
          start_time: '2026-11-25T06:00:00.000Z',
          is_auto_calculated: true,
        })
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockResolvedValueOnce(null);
      (startFast as jest.Mock).mockResolvedValueOnce({
        id: 'fast-ended',
        client_id: uuidClientId,
        start_time: '2026-11-25T08:00:00.000Z',
        end_time: '2026-11-25T16:00:00.000Z',
        target_end_time: '2026-11-26T00:00:00.000Z',
        fasting_type: '16:8 Leangains',
        status: 'COMPLETED',
      });

      renderHook(() => useWatchFastingBridge(true));
      mockListeners.get('onFastStartRequested')?.({
        clientId: uuidClientId,
        presetId: '16-8',
        ownerId: 'srv-1',
        startedAt: Date.parse('2026-11-25T08:00:00.000Z'),
      });

      await waitFor(() =>
        expect(addLog).toHaveBeenCalledWith(
          expect.stringContaining('Replayed fast start refresh failed'),
          'WARNING'
        )
      );
      expect(mockSendFastAck).not.toHaveBeenCalled();

      // Retry hits the settled path (no second startFast) and acks with authoritative fastKnown=true.
      mockListeners.get('onFastStartRequested')?.({
        clientId: uuidClientId,
        presetId: '16-8',
        ownerId: 'srv-1',
        startedAt: Date.parse('2026-11-25T08:00:00.000Z'),
      });

      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          uuidClientId,
          true,
          true,
          null
        )
      );
      expect(startFast).toHaveBeenCalledTimes(1);
    } finally {
      delete watchMock.sendFastAck;
    }
  });

  it('refreshes current fast when a replayed start returns CANCELLED without end_time', async () => {
    const mockSendFastAck = jest.fn();
    const watchMock = WatchConnectivity as unknown as {
      sendFastAck?: jest.Mock;
    };
    watchMock.sendFastAck = mockSendFastAck;
    try {
      const uuidClientId = '55555555-5555-4555-8555-555555555555';
      (getActiveServerConfigId as jest.Mock).mockResolvedValue('srv-1');
      (fetchCurrentFast as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (startFast as jest.Mock).mockResolvedValueOnce({
        id: 'fast-cancelled',
        client_id: uuidClientId,
        start_time: '2026-11-25T08:00:00.000Z',
        end_time: null,
        target_end_time: '2026-11-26T00:00:00.000Z',
        fasting_type: '16:8 Leangains',
        status: 'CANCELLED',
      });

      renderHook(() => useWatchFastingBridge(true));
      mockListeners.get('onFastStartRequested')?.({
        clientId: uuidClientId,
        presetId: '16-8',
        ownerId: 'srv-1',
        startedAt: Date.parse('2026-11-25T08:00:00.000Z'),
      });

      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          uuidClientId,
          true,
          true,
          null
        )
      );
      expect(fetchCurrentFast).toHaveBeenCalledTimes(2);
    } finally {
      delete watchMock.sendFastAck;
    }
  });

  it('retires deferred startless end when replayed start is terminal so a newer active fast B is not ended', async () => {
    const mockSendFastAck = jest.fn();
    const watchMock = WatchConnectivity as unknown as {
      sendFastAck?: jest.Mock;
    };
    watchMock.sendFastAck = mockSendFastAck;
    try {
      const startClientId = '66666666-6666-4666-8666-666666666666';
      const endClientId = '77777777-7777-4777-8777-777777777777';
      const fastB = {
        id: 'fast-b',
        start_time: '2026-11-25T18:00:00.000Z',
        end_time: null,
        target_end_time: '2026-11-26T10:00:00.000Z',
        fasting_type: '16:8 Leangains',
        status: 'ACTIVE',
      };
      (getActiveServerConfigId as jest.Mock).mockResolvedValue('srv-1');
      // 1. Initial Start A fails transiently -> marked retrying.
      // 2. Startless End arrives -> deferred behind retrying Start A.
      // 3. Start A retries: initial /current is null, startFast returns COMPLETED A,
      //    post-replay /current returns newer active Fast B, and superseded End replay
      //    fetches Fast B without calling endFast.
      (fetchCurrentFast as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(fastB)
        .mockResolvedValueOnce(fastB);
      (startFast as jest.Mock)
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({
          id: 'fast-a',
          client_id: startClientId,
          start_time: '2026-11-25T08:00:00.000Z',
          end_time: '2026-11-25T16:00:00.000Z',
          target_end_time: '2026-11-26T00:00:00.000Z',
          fasting_type: '16:8 Leangains',
          status: 'COMPLETED',
        });

      renderHook(() => useWatchFastingBridge(true));
      mockListeners.get('onFastStartRequested')?.({
        clientId: startClientId,
        presetId: '16-8',
        ownerId: 'srv-1',
        startedAt: Date.parse('2026-11-25T08:00:00.000Z'),
      });
      await waitFor(() => expect(startFast).toHaveBeenCalledTimes(1));

      mockListeners.get('onFastEndRequested')?.({
        clientId: endClientId,
        ownerId: 'srv-1',
      });

      mockListeners.get('onFastStartRequested')?.({
        clientId: startClientId,
        presetId: '16-8',
        ownerId: 'srv-1',
        startedAt: Date.parse('2026-11-25T08:00:00.000Z'),
      });

      await waitFor(() =>
        expect(mockSendFastAck).toHaveBeenCalledWith(
          endClientId,
          true,
          true,
          expect.objectContaining({ id: 'fast-b' })
        )
      );
      expect(endFast).not.toHaveBeenCalled();
    } finally {
      delete watchMock.sendFastAck;
    }
  });
});
