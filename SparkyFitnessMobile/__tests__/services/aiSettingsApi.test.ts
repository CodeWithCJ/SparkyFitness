import {
  fetchActiveAiServiceSetting,
  isFoodPhotoAvailable,
} from '../../src/services/api/aiSettingsApi';
import { getActiveServerConfig, ServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord:
    jest.requireActual('../../src/services/storage').proxyHeadersToRecord,
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockGetActiveServerConfig =
  getActiveServerConfig as jest.MockedFunction<typeof getActiveServerConfig>;

const testConfig: ServerConfig = {
  id: 'cfg-1',
  url: 'https://example.com',
  apiKey: 'k',
};

describe('aiSettingsApi.fetchActiveAiServiceSetting', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch;
  });

  test('returns null when no server config', async () => {
    mockGetActiveServerConfig.mockResolvedValue(null);
    await expect(fetchActiveAiServiceSetting()).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('returns parsed setting for a Google provider', async () => {
    mockGetActiveServerConfig.mockResolvedValue(testConfig);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () =>
        Promise.resolve({
          id: 's1',
          service_name: 'gemini-pro',
          service_type: 'google',
          is_active: true,
        }),
    });
    const result = await fetchActiveAiServiceSetting();
    expect(result?.service_type).toBe('google');
    expect(isFoodPhotoAvailable(result)).toBe(true);
  });

  test('200 with non-google setting still parses; isFoodPhotoAvailable=false', async () => {
    mockGetActiveServerConfig.mockResolvedValue(testConfig);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () =>
        Promise.resolve({
          id: 's1',
          service_name: 'gpt-4o',
          service_type: 'openai',
          is_active: true,
        }),
    });
    const result = await fetchActiveAiServiceSetting();
    expect(result?.service_type).toBe('openai');
    expect(isFoodPhotoAvailable(result)).toBe(false);
  });

  test('200 with null body returns null (server "not configured" path)', async () => {
    mockGetActiveServerConfig.mockResolvedValue(testConfig);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => Promise.resolve(null),
    });
    await expect(fetchActiveAiServiceSetting()).resolves.toBeNull();
  });

  test('404 returns null defensively', async () => {
    mockGetActiveServerConfig.mockResolvedValue(testConfig);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
      text: () => Promise.resolve('not found'),
    });
    await expect(fetchActiveAiServiceSetting()).resolves.toBeNull();
  });

  test('network error returns null defensively', async () => {
    mockGetActiveServerConfig.mockResolvedValue(testConfig);
    mockFetch.mockRejectedValue(new Error('boom'));
    await expect(fetchActiveAiServiceSetting()).resolves.toBeNull();
  });
});

describe('isFoodPhotoAvailable', () => {
  test('null setting → false', () => {
    expect(isFoodPhotoAvailable(null)).toBe(false);
    expect(isFoodPhotoAvailable(undefined)).toBe(false);
  });
  test('google → true; everything else → false', () => {
    expect(
      isFoodPhotoAvailable({
        id: 'x',
        service_name: 'g',
        service_type: 'google',
        is_active: true,
      }),
    ).toBe(true);
    expect(
      isFoodPhotoAvailable({
        id: 'x',
        service_name: 'o',
        service_type: 'openai',
        is_active: true,
      }),
    ).toBe(false);
  });
});
