import { renderHook, waitFor, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { useSyncHealthData } from '../../src/hooks/useSyncHealthData';
import { syncHealthData as healthConnectSyncData } from '../../src/services/healthConnectService';
import { saveLastSyncedTime } from '../../src/services/storage';
import { addLog } from '../../src/services/LogService';
import { serverConnectionQueryKey } from '../../src/hooks/queryKeys';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/healthConnectService', () => ({
  syncHealthData: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  saveLastSyncedTime: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockToastShow = Toast.show as jest.MockedFunction<typeof Toast.show>;

const mockHealthConnectSyncData = healthConnectSyncData as jest.MockedFunction<
  typeof healthConnectSyncData
>;
const mockSaveLastSyncedTime = saveLastSyncedTime as jest.MockedFunction<
  typeof saveLastSyncedTime
>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

describe('useSyncHealthData', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const testParams = {
    timeRange: '3d' as const,
    healthMetricStates: { steps: true, calories: false },
  };

  describe('mutation success', () => {
    test('calls healthConnectSyncData with correct parameters', async () => {
      mockHealthConnectSyncData.mockResolvedValue({ success: true, syncErrors: [] });
      mockSaveLastSyncedTime.mockResolvedValue('2024-01-15T10:00:00Z');

      const { result } = renderHook(() => useSyncHealthData(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(mockHealthConnectSyncData).toHaveBeenCalledWith(
          testParams.timeRange,
          testParams.healthMetricStates
        );
      });
    });

    test('saves last synced time on success', async () => {
      mockHealthConnectSyncData.mockResolvedValue({ success: true, syncErrors: [] });
      mockSaveLastSyncedTime.mockResolvedValue('2024-01-15T10:00:00Z');

      const { result } = renderHook(() => useSyncHealthData(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(mockSaveLastSyncedTime).toHaveBeenCalled();
      });
    });

    test('shows info toast on mutate and success toast on completion', async () => {
      mockHealthConnectSyncData.mockResolvedValue({ success: true, syncErrors: [] });
      mockSaveLastSyncedTime.mockResolvedValue('2024-01-15T10:00:00Z');

      const { result } = renderHook(() => useSyncHealthData(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockToastShow).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'info', text1: 'Syncing health data…' })
      );
      expect(mockToastShow).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', text1: 'Sync complete' })
      );
    });

    test('does not show toast when showToasts is false', async () => {
      mockHealthConnectSyncData.mockResolvedValue({ success: true, syncErrors: [] });
      mockSaveLastSyncedTime.mockResolvedValue('2024-01-15T10:00:00Z');

      const { result } = renderHook(() => useSyncHealthData({ showToasts: false }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockToastShow).not.toHaveBeenCalled();
    });

    test('calls onSuccess callback with last synced time', async () => {
      const onSuccess = jest.fn();
      mockHealthConnectSyncData.mockResolvedValue({ success: true, syncErrors: [] });
      mockSaveLastSyncedTime.mockResolvedValue('2024-01-15T10:00:00Z');

      const { result } = renderHook(() => useSyncHealthData({ onSuccess }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith('2024-01-15T10:00:00Z');
      });
    });

    test('invalidates server connection on success', async () => {
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
      mockHealthConnectSyncData.mockResolvedValue({ success: true, syncErrors: [] });
      mockSaveLastSyncedTime.mockResolvedValue('2024-01-15T10:00:00Z');

      const { result } = renderHook(() => useSyncHealthData(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: serverConnectionQueryKey,
      });
    });
  });

  describe('mutation error', () => {
    test('throws error when sync result is not successful', async () => {
      mockHealthConnectSyncData.mockResolvedValue({
        success: false,
        error: 'Sync failed',
        syncErrors: [],
      });

      const { result } = renderHook(() => useSyncHealthData(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    test('shows error toast by default', async () => {
      mockHealthConnectSyncData.mockResolvedValue({
        success: false,
        error: 'Server unavailable',
        syncErrors: [],
      });

      const { result } = renderHook(() => useSyncHealthData(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(mockToastShow).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            text1: 'Sync Error',
            text2: 'Server unavailable',
          })
        );
      });
    });

    test('does not show error toast when showToasts is false', async () => {
      mockHealthConnectSyncData.mockResolvedValue({
        success: false,
        error: 'Server unavailable',
        syncErrors: [],
      });

      const { result } = renderHook(() => useSyncHealthData({ showToasts: false }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(mockToastShow).not.toHaveBeenCalled();
    });

    test('logs error on failure', async () => {
      mockHealthConnectSyncData.mockResolvedValue({
        success: false,
        error: 'Connection timeout',
        syncErrors: [],
      });

      const { result } = renderHook(() => useSyncHealthData(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(mockAddLog).toHaveBeenCalledWith(
          'Sync Error: Connection timeout',
          'ERROR'
        );
      });
    });

    test('calls onError callback with error', async () => {
      const onError = jest.fn();
      mockHealthConnectSyncData.mockResolvedValue({
        success: false,
        error: 'Network error',
        syncErrors: [],
      });

      const { result } = renderHook(() => useSyncHealthData({ onError }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
      });
    });

    test('handles unknown error gracefully', async () => {
      mockHealthConnectSyncData.mockResolvedValue({
        success: false,
        error: undefined,
        syncErrors: [],
      });

      const { result } = renderHook(() => useSyncHealthData(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(mockToastShow).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            text1: 'Sync Error',
            text2: 'Unknown sync error',
          })
        );
      });
    });

  });

  describe('mutation state', () => {
    test('isPending transitions correctly during mutation', async () => {
      let resolvePromise: (value: { success: boolean; syncErrors: [] }) => void;
      mockHealthConnectSyncData.mockImplementation(
        () => new Promise((resolve) => { resolvePromise = resolve; })
      );
      mockSaveLastSyncedTime.mockResolvedValue('2024-01-15T10:00:00Z');

      const { result } = renderHook(() => useSyncHealthData(), {
        wrapper: createQueryWrapper(queryClient),
      });

      // Initially not pending
      expect(result.current.isPending).toBe(false);

      // Start mutation
      act(() => {
        result.current.mutate(testParams);
      });

      // Should be pending while waiting
      await waitFor(() => {
        expect(result.current.isPending).toBe(true);
      });

      // Resolve the promise
      await act(async () => {
        resolvePromise!({ success: true, syncErrors: [] });
      });

      // Should no longer be pending
      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
      });
    });

    test('isSuccess is true after successful mutation', async () => {
      mockHealthConnectSyncData.mockResolvedValue({ success: true, syncErrors: [] });
      mockSaveLastSyncedTime.mockResolvedValue('2024-01-15T10:00:00Z');

      const { result } = renderHook(() => useSyncHealthData(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });
  });
});
