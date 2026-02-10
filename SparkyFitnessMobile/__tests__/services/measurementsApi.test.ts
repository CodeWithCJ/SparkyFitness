import { fetchMeasurements, fetchWaterIntake, fetchWaterContainers, changeWaterIntake } from '../../src/services/api/measurementsApi';
import { getActiveServerConfig, ServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

describe('measurementsApi', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchMeasurements', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    const testDate = '2024-06-15';

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(fetchMeasurements(testDate)).rejects.toThrow(
        'Server configuration not found.'
      );
    });

    test('sends GET request to /api/measurements/check-in/:date', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ entry_date: testDate, weight: 75 }),
      });

      await fetchMeasurements(testDate);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/measurements/check-in/2024-06-15',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
          },
        })
      );
    });

    test('removes trailing slash from URL before making request', async () => {
      mockGetActiveServerConfig.mockResolvedValue({
        ...testConfig,
        url: 'https://example.com/',
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ entry_date: testDate }),
      });

      await fetchMeasurements(testDate);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/measurements/check-in/2024-06-15',
        expect.anything()
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = {
        entry_date: testDate,
        weight: 75,
        neck: 38,
        waist: 85,
        hips: 95,
        steps: 10000,
      };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchMeasurements(testDate);

      expect(result).toEqual(responseData);
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });

      await expect(fetchMeasurements(testDate)).rejects.toThrow(
        'Server error: 404 - Not Found'
      );
    });

    test('rethrows on network failure', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockRejectedValue(new Error('Network request failed'));

      await expect(fetchMeasurements(testDate)).rejects.toThrow(
        'Network request failed'
      );
    });
  });

  describe('fetchWaterIntake', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    const testDate = '2024-06-15';

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(fetchWaterIntake(testDate)).rejects.toThrow(
        'Server configuration not found.'
      );
    });

    test('sends GET request to /api/measurements/water-intake/:date', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ water_ml: 750 }),
      });

      await fetchWaterIntake(testDate);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/measurements/water-intake/2024-06-15',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
          },
        })
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = { water_ml: 1500 };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchWaterIntake(testDate);

      expect(result).toEqual(responseData);
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });

      await expect(fetchWaterIntake(testDate)).rejects.toThrow(
        'Server error: 404 - Not Found'
      );
    });
  });

  describe('fetchWaterContainers', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(fetchWaterContainers()).rejects.toThrow(
        'Server configuration not found.'
      );
    });

    test('sends GET request to /api/water-containers', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchWaterContainers();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/water-containers',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
          },
        })
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = [
        { id: 1, name: 'Glass', volume: 250, unit: 'ml', is_primary: true, servings_per_container: 1 },
        { id: 2, name: 'Bottle', volume: 500, unit: 'ml', is_primary: false, servings_per_container: 1 },
      ];
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchWaterContainers();

      expect(result).toEqual(responseData);
    });
  });

  describe('changeWaterIntake', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(
        changeWaterIntake({ entryDate: '2024-06-15', changeDrinks: 1, containerId: 1 })
      ).rejects.toThrow('Server configuration not found.');
    });

    test('sends POST request to /api/measurements/water-intake with correct body', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '123', water_ml: 500, entry_date: '2024-06-15' }),
      });

      await changeWaterIntake({ entryDate: '2024-06-15', changeDrinks: 1, containerId: 5 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/measurements/water-intake',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key-12345',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            entry_date: '2024-06-15',
            change_drinks: 1,
            container_id: 5,
          }),
        })
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = { id: '123', water_ml: 750, entry_date: '2024-06-15' };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await changeWaterIntake({ entryDate: '2024-06-15', changeDrinks: -1, containerId: 1 });

      expect(result).toEqual(responseData);
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(
        changeWaterIntake({ entryDate: '2024-06-15', changeDrinks: 1, containerId: 1 })
      ).rejects.toThrow('Server error: 500 - Internal Server Error');
    });
  });
});
