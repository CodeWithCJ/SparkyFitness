import { renderHook, waitFor, act } from '@testing-library/react-native';
import { usePreferences } from '../../src/hooks/usePreferences';
import { preferencesQueryKey } from '../../src/hooks/queryKeys';
import { fetchPreferences, updatePreferences } from '../../src/services/api/preferencesApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/preferencesApi', () => ({
  fetchPreferences: jest.fn(),
  updatePreferences: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockFetchPreferences = fetchPreferences as jest.MockedFunction<typeof fetchPreferences>;
const mockUpdatePreferences = updatePreferences as jest.MockedFunction<typeof updatePreferences>;

function getMismatchedTimezone(): string {
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return deviceTz === 'UTC' ? 'America/Chicago' : 'UTC';
}

describe('usePreferences', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
    jest.useRealTimers();
  });

  describe('query behavior', () => {
    test('fetches preferences on mount', async () => {
      mockFetchPreferences.mockResolvedValue({
        default_weight_unit: 'kg',
      });

      renderHook(() => usePreferences(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(mockFetchPreferences).toHaveBeenCalled();
      });
    });

    test('returns preferences data', async () => {
      const preferencesData = {
        bmr_algorithm: 'mifflin_st_jeor',
        default_weight_unit: 'kg' as const,
        default_distance_unit: 'km' as const,
        energy_unit: 'kcal' as const,
        include_bmr_in_net_calories: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      mockFetchPreferences.mockResolvedValue(preferencesData);

      const { result } = renderHook(() => usePreferences(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.preferences).toEqual(preferencesData);
    });

    test('isError is true on fetch failure', async () => {
      mockFetchPreferences.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => usePreferences(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('refetch', () => {
    test('provides refetch function', async () => {
      mockFetchPreferences.mockResolvedValue({
        default_weight_unit: 'kg',
      });

      const { result } = renderHook(() => usePreferences(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refetch).toBe('function');
    });

    test('refetch updates data', async () => {
      mockFetchPreferences.mockResolvedValue({
        default_weight_unit: 'kg',
      });

      const { result } = renderHook(() => usePreferences(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.preferences?.default_weight_unit).toBe('kg');
      });

      mockFetchPreferences.mockResolvedValue({
        default_weight_unit: 'lbs',
      });

      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.preferences?.default_weight_unit).toBe('lbs');
      });
    });
  });

  describe('timezone sync', () => {
    test('does not sync timezone when disabled', async () => {
      queryClient.setQueryData(preferencesQueryKey, {
        timezone: getMismatchedTimezone(),
      });

      renderHook(() => usePreferences({ enabled: false }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(mockFetchPreferences).not.toHaveBeenCalled();
      expect(mockUpdatePreferences).not.toHaveBeenCalled();
    });

    test('retries timezone sync after a failed update', async () => {
      jest.useFakeTimers();

      const mismatchedTimezone = getMismatchedTimezone();
      queryClient.setQueryData(preferencesQueryKey, {
        timezone: mismatchedTimezone,
      });
      mockFetchPreferences.mockResolvedValue({
        timezone: mismatchedTimezone,
      });
      mockUpdatePreferences
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });

      renderHook(() => usePreferences(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(mockUpdatePreferences).toHaveBeenCalledTimes(2);
    });
  });

  describe('query key', () => {
    test('exports correct query key', () => {
      expect(preferencesQueryKey).toEqual(['userPreferences']);
    });
  });
});
