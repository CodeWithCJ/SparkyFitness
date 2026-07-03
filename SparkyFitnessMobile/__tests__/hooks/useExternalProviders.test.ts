import { renderHook, waitFor } from '@testing-library/react-native';
import { useExternalProviders } from '../../src/hooks/useExternalProviders';
import { fetchExternalProviders } from '../../src/services/api/externalProvidersApi';
import { ExternalProvider } from '../../src/types/externalProviders';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/externalProvidersApi', () => ({
  fetchExternalProviders: jest.fn(),
}));

const mockFetchExternalProviders = fetchExternalProviders as jest.MockedFunction<typeof fetchExternalProviders>;

const makeProvider = (overrides: Partial<ExternalProvider> & { id: string }): ExternalProvider => ({
  provider_name: 'Test Provider',
  provider_type: 'openfoodfacts',
  is_active: true,
  categories: ['food'],
  supports_barcode: false,
  ...overrides,
});

describe('useExternalProviders', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('filtering', () => {
    test('filters out non-food provider types', async () => {
      mockFetchExternalProviders.mockResolvedValue([
        makeProvider({ id: '1', provider_name: 'OpenFoodFacts', provider_type: 'openfoodfacts', categories: ['food'] }),
        makeProvider({ id: '2', provider_name: 'Free Exercise DB', provider_type: 'free-exercise-db', categories: ['exercise'] }),
        makeProvider({ id: '3', provider_name: 'USDA', provider_type: 'usda', categories: ['food'] }),
      ]);

      const { result } = renderHook(() => useExternalProviders(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(2);
      expect(result.current.providers.map((p) => p.provider_type)).toEqual([
        'openfoodfacts',
        'usda',
      ]);
    });

    test('filters out inactive providers', async () => {
      mockFetchExternalProviders.mockResolvedValue([
        makeProvider({ id: '1', provider_name: 'Active', provider_type: 'openfoodfacts', is_active: true }),
        makeProvider({ id: '2', provider_name: 'Inactive', provider_type: 'fatsecret', is_active: false }),
      ]);

      const { result } = renderHook(() => useExternalProviders(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(1);
      expect(result.current.providers[0].provider_name).toBe('Active');
    });

    test('returns empty array when no providers match', async () => {
      mockFetchExternalProviders.mockResolvedValue([
        makeProvider({ id: '1', provider_type: 'free-exercise-db', is_active: true, categories: ['exercise'] }),
        makeProvider({ id: '2', provider_type: 'openfoodfacts', is_active: false }),
      ]);

      const { result } = renderHook(() => useExternalProviders(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toEqual([]);
    });

    test('includes all food provider types', async () => {
      const foodTypes = ['openfoodfacts', 'fatsecret', 'usda', 'mealie', 'tandoor', 'norish', 'yazio', 'swissfood'];
      mockFetchExternalProviders.mockResolvedValue(
        foodTypes.map((type, i) =>
          makeProvider({ id: String(i), provider_name: type, provider_type: type, categories: ['food'] }),
        ),
      );

      const { result } = renderHook(() => useExternalProviders(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.providers).toHaveLength(foodTypes.length);
    });

    test('dynamically filters by category field returned from server', async () => {
      mockFetchExternalProviders.mockResolvedValue([
        makeProvider({ id: '1', provider_name: 'Custom Food Provider', provider_type: 'custom-food', categories: ['food'] }),
        makeProvider({ id: '2', provider_name: 'Custom Exercise Provider', provider_type: 'custom-ex', categories: ['exercise'] }),
      ]);

      const { result: foodResult } = renderHook(() => useExternalProviders({ category: 'food' }), {
        wrapper: createQueryWrapper(queryClient),
      });
      await waitFor(() => expect(foodResult.current.isLoading).toBe(false));
      expect(foodResult.current.providers).toHaveLength(1);
      expect(foodResult.current.providers[0].provider_name).toBe('Custom Food Provider');

      const { result: exResult } = renderHook(() => useExternalProviders({ category: 'exercise' }), {
        wrapper: createQueryWrapper(queryClient),
      });
      await waitFor(() => expect(exResult.current.isLoading).toBe(false));
      expect(exResult.current.providers).toHaveLength(1);
      expect(exResult.current.providers[0].provider_name).toBe('Custom Exercise Provider');
    });

    test('dynamically filters by supports_barcode field returned from server', async () => {
      mockFetchExternalProviders.mockResolvedValue([
        makeProvider({ id: '1', provider_name: 'USDA', provider_type: 'usda', supports_barcode: true }),
        makeProvider({ id: '2', provider_name: 'Mealie', provider_type: 'mealie', supports_barcode: false }),
      ]);

      const { result } = renderHook(() => useExternalProviders({ supportsBarcode: true }), {
        wrapper: createQueryWrapper(queryClient),
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.providers).toHaveLength(1);
      expect(result.current.providers[0].provider_name).toBe('USDA');
    });
  });

  describe('query behavior', () => {
    test('does not fetch when disabled', async () => {
      const { result } = renderHook(() => useExternalProviders({ enabled: false }), {
        wrapper: createQueryWrapper(queryClient),
      });

      expect(mockFetchExternalProviders).not.toHaveBeenCalled();
      expect(result.current.providers).toEqual([]);
    });

    test('isError is true on fetch failure', async () => {
      mockFetchExternalProviders.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useExternalProviders(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

});
