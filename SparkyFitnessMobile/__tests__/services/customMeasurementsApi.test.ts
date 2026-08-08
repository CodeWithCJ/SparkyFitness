import {
  fetchCustomCategories,
  fetchCustomMeasurementsByDate,
  saveCustomMeasurement,
  deleteCustomMeasurement,
} from '../../src/services/api/measurementsApi';
import { getActiveServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.requireActual('../../src/services/storage').proxyHeadersToRecord,
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

const testConfig = {
  id: 'test-id',
  url: 'https://example.com',
  apiKey: 'test-api-key',
};

describe('customMeasurementsApi', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetActiveServerConfig.mockResolvedValue(testConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchCustomCategories', () => {
    test('returns list of custom categories with id, name, measurement_type', async () => {
      const categories = [
        { id: 'cat-1', name: 'Blood Pressure', measurement_type: 'mmHg', frequency: 'Daily', data_type: 'numeric', display_name: null },
        { id: 'cat-2', name: 'Blood Sugar', measurement_type: 'mg/dL', frequency: 'Daily', data_type: 'numeric', display_name: null },
      ];
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(categories) });

      const result = await fetchCustomCategories();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'cat-1', name: 'Blood Pressure', measurement_type: 'mmHg' });
    });

    test('sends GET to custom-categories endpoint', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

      await fetchCustomCategories();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/measurements/custom-categories',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('fetchCustomMeasurementsByDate', () => {
    test('returns entries for the given date', async () => {
      const entries = [
        {
          id: 'entry-1', category_id: 'cat-1', value: '120', entry_date: '2024-06-15',
          source: 'manual', custom_categories: { name: 'Blood Pressure', measurement_type: 'mmHg' },
        },
      ];
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(entries) });

      const result = await fetchCustomMeasurementsByDate('2024-06-15');

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('120');
      expect(result[0].custom_categories?.measurement_type).toBe('mmHg');
    });

    test('sends GET with date in URL path', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

      await fetchCustomMeasurementsByDate('2024-06-15');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/measurements/custom-entries/2024-06-15',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('saveCustomMeasurement', () => {
    test('sends POST with the complete body (category_id, value, entry_date, source)', async () => {
      const savedEntry = {
        id: 'entry-1', category_id: 'cat-1', value: '75', entry_date: '2024-06-15',
      };
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(savedEntry) });

      const result = await saveCustomMeasurement({
        category_id: 'cat-1',
        value: 75,
        entry_date: '2024-06-15',
        source: 'manual',
      });

      expect(result.value).toBe('75');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/measurements/custom-entries',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            category_id: 'cat-1',
            value: 75,
            entry_date: '2024-06-15',
            source: 'manual',
          }),
        }),
      );
    });
  });

  describe('deleteCustomMeasurement', () => {
    test('sends DELETE with entry id in URL', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      await deleteCustomMeasurement('entry-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/measurements/custom-entries/entry-123',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('category fields', () => {
    test('preserves id, name, measurement_type, display_name, data_type, frequency', async () => {
      const categories = [
        {
          id: 'cat-1',
          name: 'Blood Pressure',
          measurement_type: 'mmHg',
          display_name: 'Blood Pressure (Systolic)',
          data_type: 'numeric',
          frequency: 'Daily',
        },
      ];
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(categories) });

      const [cat] = await fetchCustomCategories();

      expect(cat.id).toBe('cat-1');
      expect(cat.name).toBe('Blood Pressure');
      expect(cat.measurement_type).toBe('mmHg');
      expect(cat.display_name).toBe('Blood Pressure (Systolic)');
      expect(cat.data_type).toBe('numeric');
      expect(cat.frequency).toBe('Daily');
    });
  });
});
