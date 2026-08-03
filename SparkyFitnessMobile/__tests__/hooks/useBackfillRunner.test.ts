import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useBackfillRunner } from '../../src/hooks/useBackfillRunner';
import { runBackfill } from '../../src/services/backfillService';
import {
  loadBackfillCheckpoint,
  clearBackfillCheckpoint,
  type BackfillCheckpoint,
} from '../../src/services/backfillCheckpoint';
import { getActiveServerConfig } from '../../src/services/storage';
import { loadHealthPreference } from '../../src/services/healthConnectService';

jest.mock('../../src/services/backfillService', () => ({
  runBackfill: jest.fn(),
}));

jest.mock('../../src/services/backfillCheckpoint', () => ({
  loadBackfillCheckpoint: jest.fn(),
  clearBackfillCheckpoint: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));

jest.mock('../../src/services/healthConnectService', () => ({
  loadHealthPreference: jest.fn(),
}));

jest.mock('../../src/HealthMetrics', () => ({
  HEALTH_METRICS: [
    { id: 'steps', recordType: 'Steps', preferenceKey: 'syncStepsEnabled', label: 'Steps' },
    { id: 'weight', recordType: 'Weight', preferenceKey: 'syncWeightEnabled', label: 'Weight' },
  ],
}));

const mockRunBackfill = runBackfill as jest.Mock;
const mockLoadCheckpoint = loadBackfillCheckpoint as jest.Mock;
const mockClearCheckpoint = clearBackfillCheckpoint as jest.Mock;
const mockGetActiveServerConfig = getActiveServerConfig as jest.Mock;
const mockLoadHealthPreference = loadHealthPreference as jest.Mock;

const checkpoint = (overrides: Partial<BackfillCheckpoint> = {}): BackfillCheckpoint => ({
  version: 1,
  status: 'in-progress',
  endEdge: '2026-08-03T04:00:00.000Z',
  cursor: '2026-07-04T04:00:00.000Z',
  floor: '2026-06-20T04:00:00.000Z',
  earliestByRecordType: { Steps: '2026-06-20T10:00:00.000Z' },
  enabledRecordTypes: ['Steps'],
  recordsUploaded: 5,
  startedAt: '2026-08-03T15:00:00.000Z',
  updatedAt: '2026-08-03T15:05:00.000Z',
  ...overrides,
});

describe('useBackfillRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveServerConfig.mockResolvedValue({ id: 'server-1' });
    mockLoadCheckpoint.mockResolvedValue(null);
    mockLoadHealthPreference.mockImplementation((key: string) =>
      Promise.resolve(key === 'syncStepsEnabled'),
    );
    mockRunBackfill.mockResolvedValue({ outcome: 'completed', recordsUploaded: 3 });
  });

  test('mounts to idle when no checkpoint exists', async () => {
    const { result } = renderHook(() => useBackfillRunner());

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(result.current.checkpoint).toBeNull();
  });

  test('mounts to interrupted for an in-progress checkpoint and to done for a finished one', async () => {
    mockLoadCheckpoint.mockResolvedValue(checkpoint());
    const interrupted = renderHook(() => useBackfillRunner());
    await waitFor(() => expect(interrupted.result.current.status).toBe('interrupted'));
    interrupted.unmount();

    mockLoadCheckpoint.mockResolvedValue(checkpoint({ status: 'done' }));
    const done = renderHook(() => useBackfillRunner());
    await waitFor(() => expect(done.result.current.status).toBe('done'));
  });

  test('flags a frozen metric set that differs from current toggles', async () => {
    mockLoadCheckpoint.mockResolvedValue(checkpoint({ enabledRecordTypes: ['Steps', 'Weight'] }));

    const { result } = renderHook(() => useBackfillRunner());

    await waitFor(() => expect(result.current.frozenSelectionDiffers).toBe(true));
  });

  test('does not flag a matching frozen set', async () => {
    mockLoadCheckpoint.mockResolvedValue(checkpoint({ enabledRecordTypes: ['Steps'] }));

    const { result } = renderHook(() => useBackfillRunner());

    await waitFor(() => expect(result.current.status).toBe('interrupted'));
    expect(result.current.frozenSelectionDiffers).toBe(false);
  });

  test('start runs the backfill and settles on the checkpoint-derived state', async () => {
    const { result } = renderHook(() => useBackfillRunner());
    await waitFor(() => expect(result.current.status).toBe('idle'));

    mockLoadCheckpoint.mockResolvedValue(checkpoint({ status: 'done', recordsUploaded: 3 }));
    act(() => result.current.start());

    expect(result.current.status).toBe('running');
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.lastOutcome).toBe('completed');
    expect(mockRunBackfill).toHaveBeenCalledTimes(1);
  });

  test('an interrupting outcome with a surviving checkpoint lands on interrupted', async () => {
    const { result } = renderHook(() => useBackfillRunner());
    await waitFor(() => expect(result.current.status).toBe('idle'));

    mockRunBackfill.mockResolvedValue({ outcome: 'quota', error: 'quota exceeded', recordsUploaded: 2 });
    mockLoadCheckpoint.mockResolvedValue(checkpoint());
    act(() => result.current.start());

    await waitFor(() => expect(result.current.status).toBe('interrupted'));
    expect(result.current.lastOutcome).toBe('quota');
    expect(result.current.lastError).toBe('quota exceeded');
  });

  test('cancel flips the shouldCancel signal the running backfill polls', async () => {
    let observedShouldCancel: (() => boolean) | null = null;
    let finishRun: (value: { outcome: string; recordsUploaded: number }) => void = () => {};
    mockRunBackfill.mockImplementation(
      (opts: { shouldCancel: () => boolean }) => {
        observedShouldCancel = opts.shouldCancel;
        return new Promise(resolve => {
          finishRun = resolve;
        });
      },
    );

    const { result } = renderHook(() => useBackfillRunner());
    await waitFor(() => expect(result.current.status).toBe('idle'));

    act(() => result.current.start());
    await waitFor(() => expect(observedShouldCancel).not.toBeNull());
    expect(observedShouldCancel!()).toBe(false);

    act(() => result.current.cancel());
    expect(observedShouldCancel!()).toBe(true);

    await act(async () => {
      finishRun({ outcome: 'cancelled', recordsUploaded: 1 });
    });
  });

  test('unmount signals cancel so the run stops at its next window boundary', async () => {
    let observedShouldCancel: (() => boolean) | null = null;
    mockRunBackfill.mockImplementation(
      (opts: { shouldCancel: () => boolean }) => {
        observedShouldCancel = opts.shouldCancel;
        return new Promise(() => {});
      },
    );

    const { result, unmount } = renderHook(() => useBackfillRunner());
    await waitFor(() => expect(result.current.status).toBe('idle'));

    act(() => result.current.start());
    await waitFor(() => expect(observedShouldCancel).not.toBeNull());
    expect(observedShouldCancel!()).toBe(false);

    unmount();

    expect(observedShouldCancel!()).toBe(true);
  });

  test('startOver clears the checkpoint and returns to idle WITHOUT auto-starting', async () => {
    mockLoadCheckpoint.mockResolvedValue(checkpoint());
    const { result } = renderHook(() => useBackfillRunner());
    await waitFor(() => expect(result.current.status).toBe('interrupted'));

    mockLoadCheckpoint.mockResolvedValue(null);
    await act(async () => {
      result.current.startOver();
    });

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(mockClearCheckpoint).toHaveBeenCalledWith('server-1');
    expect(result.current.checkpoint).toBeNull();
    expect(result.current.lastOutcome).toBeNull();
    expect(mockRunBackfill).not.toHaveBeenCalled();

    // The user then starts explicitly.
    act(() => result.current.start());
    expect(mockRunBackfill).toHaveBeenCalledTimes(1);
  });
});
