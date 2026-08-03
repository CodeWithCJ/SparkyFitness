import {
  ensureTimezoneBootstrapped,
  fetchPreferences,
} from '../../../src/services/api/preferencesApi';
import { getActiveServerConfig, ServerConfig } from '../../../src/services/storage';
import { addLog } from '../../../src/services/LogService';

// Mock the underlying apiFetch so we control fetch/update responses directly
const mockApiFetch = jest.fn();
jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

jest.mock('../../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.requireActual('../../../src/services/storage').proxyHeadersToRecord,
}));

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('@workspace/shared', () => ({
  isValidTimeZone: (tz: string) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
}));

// The fetchPreferences suite exercises the whole request path, so it routes
// mockApiFetch back through the unmocked implementation.
const { apiFetch: actualApiFetch } = jest.requireActual<
  typeof import('../../../src/services/api/apiClient')
>('../../../src/services/api/apiClient');

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe('ensureTimezoneBootstrapped', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('posts device timezone to the bootstrap endpoint', async () => {
    mockApiFetch.mockResolvedValueOnce({ timezone: deviceTz });

    const result = await ensureTimezoneBootstrapped();

    expect(result).toBe(deviceTz);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/user-preferences/bootstrap-timezone',
        method: 'POST',
        body: { timezone: deviceTz },
      }),
    );
  });

  test('returns the existing server timezone without a second request', async () => {
    mockApiFetch.mockResolvedValueOnce({ timezone: 'America/Los_Angeles' });

    const result = await ensureTimezoneBootstrapped();

    expect(result).toBe('America/Los_Angeles');
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  test('coalesces concurrent bootstrap requests', async () => {
    let resolveRequest: ((value: { timezone: string }) => void) | undefined;
    mockApiFetch.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveRequest = resolve;
        }),
    );

    const first = ensureTimezoneBootstrapped();
    const second = ensureTimezoneBootstrapped();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    resolveRequest?.({ timezone: deviceTz });

    await expect(first).resolves.toBe(deviceTz);
    await expect(second).resolves.toBe(deviceTz);
  });

  test('handles invalid device timezone gracefully', async () => {
    const resolvedOptionsSpy = jest
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({
        locale: 'en-US',
        calendar: 'gregory',
        numberingSystem: 'latn',
        timeZone: 'not-a-real-timezone',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      } as Intl.ResolvedDateTimeFormatOptions);

    const result = await ensureTimezoneBootstrapped();

    expect(result).toBeUndefined();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(addLog).toHaveBeenCalledWith(
      expect.stringContaining('Device timezone invalid or unavailable'),
      'WARNING',
    );

    resolvedOptionsSpy.mockRestore();
  });

  test('handles bootstrap request failure gracefully', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Server error'));

    const result = await ensureTimezoneBootstrapped();

    expect(result).toBeUndefined();
    expect(addLog).toHaveBeenCalledWith(
      expect.stringContaining('Timezone bootstrap failed'),
      'WARNING',
    );
  });
});

describe('preferencesApi', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    mockApiFetch.mockImplementation(actualApiFetch);
    global.fetch = mockFetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchPreferences', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(fetchPreferences()).rejects.toThrow(
        'Server configuration not found.'
      );
    });

    test('sends GET request to /api/user-preferences', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ weight_unit: 'kg' }),
      });

      await fetchPreferences();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/user-preferences',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-api-key-12345',

            'X-Meal-Model-Version': '2',
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
        json: () => Promise.resolve({ weight_unit: 'kg' }),
      });

      await fetchPreferences();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/user-preferences',
        expect.anything()
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = {
        bmr_algorithm: 'mifflin_st_jeor',
        weight_unit: 'kg',
        distance_unit: 'km',
        energy_unit: 'kcal',
        include_bmr_in_net_calories: true,
      };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchPreferences();

      expect(result).toEqual(responseData);
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(fetchPreferences()).rejects.toThrow(
        'Server error: 401 - Unauthorized'
      );
    });

    test('rethrows on network failure', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockRejectedValue(new Error('Network request failed'));

      await expect(fetchPreferences()).rejects.toThrow(
        'Network request failed'
      );
    });
  });
});
