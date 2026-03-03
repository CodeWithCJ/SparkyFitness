import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useServerConnection } from '../../src/hooks/useServerConnection';
import { serverConnectionQueryKey } from '../../src/hooks/queryKeys';
import { checkServerConnection } from '../../src/services/api/healthDataApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/healthDataApi', () => ({
  checkServerConnection: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback) => {
    // Execute callback immediately for testing
    callback();
  }),
}));

const mockCheckServerConnection = checkServerConnection as jest.MockedFunction<
  typeof checkServerConnection
>;

describe('useServerConnection', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('query behavior', () => {
    test('returns false when server is not connected', async () => {
      mockCheckServerConnection.mockResolvedValue(false);

      const { result } = renderHook(() => useServerConnection(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isConnected).toBe(false);
    });

    test('returns true when server is connected', async () => {
      mockCheckServerConnection.mockResolvedValue(true);

      const { result } = renderHook(() => useServerConnection(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isConnected).toBe(true);
    });

    test('calls checkServerConnection on mount', async () => {
      mockCheckServerConnection.mockResolvedValue(true);

      renderHook(() => useServerConnection(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(mockCheckServerConnection).toHaveBeenCalled();
      });
    });

    test('isLoading becomes false after fetch completes', async () => {
      mockCheckServerConnection.mockResolvedValue(true);

      const { result } = renderHook(() => useServerConnection(), {
        wrapper: createQueryWrapper(queryClient),
      });

      // Wait for loading to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isConnected).toBe(true);
    });
  });

  describe('options', () => {
    test('accepts enablePolling option without error', async () => {
      mockCheckServerConnection.mockResolvedValue(true);

      const { result } = renderHook(() => useServerConnection({ enablePolling: true }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });
    });

    test('works without options', async () => {
      mockCheckServerConnection.mockResolvedValue(true);

      const { result } = renderHook(() => useServerConnection(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });
    });
  });

  describe('refetch', () => {
    test('provides refetch function', async () => {
      mockCheckServerConnection.mockResolvedValue(true);

      const { result } = renderHook(() => useServerConnection(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refetch).toBe('function');
    });

    test('refetch updates data', async () => {
      mockCheckServerConnection.mockResolvedValue(false);

      const { result } = renderHook(() => useServerConnection(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(false);
      });

      mockCheckServerConnection.mockResolvedValue(true);

      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });
    });
  });

  describe('query key', () => {
    test('exports correct query key', () => {
      expect(serverConnectionQueryKey).toEqual(['serverConnection']);
    });
  });
});
