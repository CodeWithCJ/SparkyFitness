import { renderHook, waitFor, act } from '@testing-library/react-native';
import {
  useCustomCategories,
  useCustomMeasurementsByDate,
  useSaveCustomMeasurement,
  useDeleteCustomMeasurement,
} from '../../src/hooks/useCustomMeasurements';
import { customMeasurementsByDateQueryKey } from '../../src/hooks/queryKeys';
import {
  fetchCustomCategories,
  fetchCustomMeasurementsByDate,
  saveCustomMeasurement,
  deleteCustomMeasurement,
} from '../../src/services/api/measurementsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchCustomCategories: jest.fn(),
  fetchCustomMeasurementsByDate: jest.fn(),
  saveCustomMeasurement: jest.fn(),
  deleteCustomMeasurement: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.requireActual('../../src/services/storage').proxyHeadersToRecord,
}));

const mockFetchCustomCategories = fetchCustomCategories as jest.MockedFunction<
  typeof fetchCustomCategories
>;
const mockFetchCustomMeasurementsByDate = fetchCustomMeasurementsByDate as jest.MockedFunction<
  typeof fetchCustomMeasurementsByDate
>;
const mockSaveCustomMeasurement = saveCustomMeasurement as jest.MockedFunction<
  typeof saveCustomMeasurement
>;
const mockDeleteCustomMeasurement = deleteCustomMeasurement as jest.MockedFunction<
  typeof deleteCustomMeasurement
>;

describe('useCustomMeasurements', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('useCustomCategories', () => {
    test('fetches custom categories on mount', async () => {
      const categories = [
        { id: 'cat-1', name: 'Blood Pressure', measurement_type: 'mmHg', frequency: 'Daily', data_type: 'numeric' },
      ];
      mockFetchCustomCategories.mockResolvedValue(categories);

      renderHook(() => useCustomCategories(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(mockFetchCustomCategories).toHaveBeenCalledTimes(1);
      });
    });

    test('returns custom categories data', async () => {
      const categories = [
        { id: 'cat-1', name: 'Blood Pressure', measurement_type: 'mmHg', frequency: 'Daily', data_type: 'numeric' },
        { id: 'cat-2', name: 'Blood Sugar', measurement_type: 'mg/dL', frequency: 'Daily', data_type: 'numeric' },
      ];
      mockFetchCustomCategories.mockResolvedValue(categories);

      const { result } = renderHook(() => useCustomCategories(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(categories);
      });
    });
  });

  describe('useCustomMeasurementsByDate', () => {
    const testDate = '2024-06-15';

    test('fetches custom measurements for the given date', async () => {
      const entries = [
        { id: 'entry-1', category_id: 'cat-1', value: '120', entry_date: testDate },
      ];
      mockFetchCustomMeasurementsByDate.mockResolvedValue(entries);

      renderHook(() => useCustomMeasurementsByDate(testDate), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(mockFetchCustomMeasurementsByDate).toHaveBeenCalledWith(testDate);
      });
    });

    test('returns custom measurement entries', async () => {
      const entries = [
        { id: 'entry-1', category_id: 'cat-1', value: '120', entry_date: testDate, custom_categories: { name: 'BP' } },
      ];
      mockFetchCustomMeasurementsByDate.mockResolvedValue(entries);

      const { result } = renderHook(() => useCustomMeasurementsByDate(testDate), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(entries);
      });
    });

    test('is disabled when date is empty', async () => {
      renderHook(() => useCustomMeasurementsByDate(''), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(mockFetchCustomMeasurementsByDate).not.toHaveBeenCalled();
      });
    });
  });

  describe('useSaveCustomMeasurement', () => {
    test('saves custom measurement and invalidates query', async () => {
      const savedEntry = { id: 'entry-1', category_id: 'cat-1', value: '75', entry_date: '2024-06-15' };
      mockSaveCustomMeasurement.mockResolvedValue(savedEntry);

      // seed the query cache so we can verify invalidation
      queryClient.setQueryData(customMeasurementsByDateQueryKey('2024-06-15'), []);
      const spy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useSaveCustomMeasurement(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({
          category_id: 'cat-1',
          value: 75,
          entry_date: '2024-06-15',
        });
      });

      expect(mockSaveCustomMeasurement).toHaveBeenCalledWith({
        category_id: 'cat-1',
        value: 75,
        entry_date: '2024-06-15',
      });
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: customMeasurementsByDateQueryKey('2024-06-15') }),
      );
    });
  });

  describe('useDeleteCustomMeasurement', () => {
    test('deletes custom measurement and invalidates query', async () => {
      mockDeleteCustomMeasurement.mockResolvedValue(undefined);

      queryClient.setQueryData(customMeasurementsByDateQueryKey('2024-06-15'), []);
      const spy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteCustomMeasurement(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync({ id: 'entry-1', entryDate: '2024-06-15' });
      });

      expect(mockDeleteCustomMeasurement).toHaveBeenCalledWith('entry-1');
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: customMeasurementsByDateQueryKey('2024-06-15') }),
      );
    });
  });
});
