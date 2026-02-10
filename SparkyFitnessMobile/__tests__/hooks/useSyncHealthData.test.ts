import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSyncHealthData } from '../../src/hooks/useSyncHealthData';
import { syncHealthData as healthConnectSyncData } from '../../src/services/healthConnectService';
import { saveLastSyncedTime } from '../../src/services/storage';
import { addLog } from '../../src/services/LogService';

jest.mock('../../src/services/healthConnectService', () => ({
  syncHealthData: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  saveLastSyncedTime: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const mockHealthConnectSyncData = healthConnectSyncData as jest.MockedFunction<
  typeof healthConnectSyncData
>;
const mockSaveLastSyncedTime = saveLastSyncedTime as jest.MockedFunction<
  typeof saveLastSyncedTime
>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

describe('useSyncHealthData', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
    });
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
        wrapper: createWrapper(),
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
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(mockSaveLastSyncedTime).toHaveBeenCalled();
      });
    });

    test('shows success alert by default', async () => {
      mockHealthConnectSyncData.mockResolvedValue({ success: true, syncErrors: [] });
      mockSaveLastSyncedTime.mockResolvedValue('2024-01-15T10:00:00Z');

      const { result } = renderHook(() => useSyncHealthData(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Success',
          'Health data synced successfully.'
        );
      });
    });

    test('does not show alert when showAlerts is false', async () => {
      mockHealthConnectSyncData.mockResolvedValue({ success: true, syncErrors: [] });
      mockSaveLastSyncedTime.mockResolvedValue('2024-01-15T10:00:00Z');

      const { result } = renderHook(() => useSyncHealthData({ showAlerts: false }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(Alert.alert).not.toHaveBeenCalled();
    });

    test('calls onSuccess callback with last synced time', async () => {
      const onSuccess = jest.fn();
      mockHealthConnectSyncData.mockResolvedValue({ success: true, syncErrors: [] });
      mockSaveLastSyncedTime.mockResolvedValue('2024-01-15T10:00:00Z');

      const { result } = renderHook(() => useSyncHealthData({ onSuccess }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith('2024-01-15T10:00:00Z');
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
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    test('shows error alert by default', async () => {
      mockHealthConnectSyncData.mockResolvedValue({
        success: false,
        error: 'Server unavailable',
        syncErrors: [],
      });

      const { result } = renderHook(() => useSyncHealthData(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Sync Error',
          'Server unavailable'
        );
      });
    });

    test('does not show error alert when showAlerts is false', async () => {
      mockHealthConnectSyncData.mockResolvedValue({
        success: false,
        error: 'Server unavailable',
        syncErrors: [],
      });

      const { result } = renderHook(() => useSyncHealthData({ showAlerts: false }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(Alert.alert).not.toHaveBeenCalled();
    });

    test('logs error on failure', async () => {
      mockHealthConnectSyncData.mockResolvedValue({
        success: false,
        error: 'Connection timeout',
        syncErrors: [],
      });

      const { result } = renderHook(() => useSyncHealthData(), {
        wrapper: createWrapper(),
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
        wrapper: createWrapper(),
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
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate(testParams);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Sync Error',
          'Unknown sync error'
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
        wrapper: createWrapper(),
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
        wrapper: createWrapper(),
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
