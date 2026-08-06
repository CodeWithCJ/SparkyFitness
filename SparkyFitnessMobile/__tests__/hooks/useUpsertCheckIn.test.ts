import { renderHook, waitFor, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { useUpsertCheckIn } from '../../src/hooks/useUpsertCheckIn';
import { upsertCheckIn } from '../../src/services/api/measurementsApi';
import { refreshHealthSyncCache } from '../../src/hooks/refreshHealthSyncCache';
import { addLog } from '../../src/services/LogService';
import { measurementsQueryKey } from '../../src/hooks/queryKeys';
import type { CheckInMeasurement } from '../../src/types/measurements';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  upsertCheckIn: jest.fn(),
}));

jest.mock('../../src/hooks/refreshHealthSyncCache', () => ({
  refreshHealthSyncCache: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockUpsertCheckIn = upsertCheckIn as jest.MockedFunction<typeof upsertCheckIn>;
const mockRefreshHealthSyncCache = refreshHealthSyncCache as jest.MockedFunction<
  typeof refreshHealthSyncCache
>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

describe('useUpsertCheckIn', () => {
  let queryClient: QueryClient;
  const entryDate = '2024-06-15';

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('passes vars through unchanged, preserving null-vs-omitted per field', async () => {
    mockUpsertCheckIn.mockResolvedValue({} as CheckInMeasurement);

    const { result } = renderHook(() => useUpsertCheckIn(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({ entryDate, weight: 80.5, neck: null });
    });

    await waitFor(() => {
      expect(mockUpsertCheckIn).toHaveBeenCalledWith({ entryDate, weight: 80.5, neck: null });
    });
    const vars = mockUpsertCheckIn.mock.calls[0][0];
    expect('waist' in vars).toBe(false);
    expect('steps' in vars).toBe(false);
  });

  test('success writes the server response into the date cache and refreshes health sync caches', async () => {
    const serverResponse = { entry_date: entryDate, weight: 80.5 } as unknown as CheckInMeasurement;
    mockUpsertCheckIn.mockResolvedValue(serverResponse);

    const { result } = renderHook(() => useUpsertCheckIn(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({ entryDate, weight: 80.5 });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(measurementsQueryKey(entryDate))).toBe(serverResponse);
    });
    expect(mockRefreshHealthSyncCache).toHaveBeenCalledWith(queryClient);
  });

  test('failure logs an error and shows a toast without touching the cache', async () => {
    mockUpsertCheckIn.mockRejectedValue(new Error('server unavailable'));

    const { result } = renderHook(() => useUpsertCheckIn(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({ entryDate, weight: 80.5 });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(mockAddLog).toHaveBeenCalledWith(expect.stringContaining('server unavailable'), 'ERROR');
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(queryClient.getQueryData(measurementsQueryKey(entryDate))).toBeUndefined();
    expect(mockRefreshHealthSyncCache).not.toHaveBeenCalled();
  });
});
