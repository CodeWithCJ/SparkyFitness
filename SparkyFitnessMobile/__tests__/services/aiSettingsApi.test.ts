import {
  fetchActiveAiServiceSetting,
  isFoodPhotoAvailable,
} from '../../src/services/api/aiSettingsApi';
import { notifySessionExpired } from '../../src/services/api/authService';
import { getActiveServerConfig, ServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord:
    jest.requireActual('../../src/services/storage').proxyHeadersToRecord,
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/services/api/authService', () => {
  const actual = jest.requireActual('../../src/services/api/authService');
  return {
    ...actual,
    notifySessionExpired: jest.fn(),
  };
});

const mockGetActiveServerConfig =
  getActiveServerConfig as jest.MockedFunction<typeof getActiveServerConfig>;
const mockNotifySessionExpired =
  notifySessionExpired as jest.MockedFunction<typeof notifySessionExpired>;

const testConfig: ServerConfig = {
  id: 'cfg-1',
  url: 'https://example.com',
  apiKey: 'k',
};

const sessionConfig: ServerConfig = {
  id: 'cfg-session',
  url: 'https://example.com',
  apiKey: '',
  authType: 'session',
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

  test('200 with OpenAI setting parses; isFoodPhotoAvailable=true', async () => {
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
    expect(isFoodPhotoAvailable(result)).toBe(true);
  });

  test('200 with any provider parses; isFoodPhotoAvailable=true (attempt-all)', async () => {
    mockGetActiveServerConfig.mockResolvedValue(testConfig);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () =>
        Promise.resolve({
          id: 's1',
          service_name: 'mistral-large',
          service_type: 'mistral',
          is_active: true,
        }),
    });
    const result = await fetchActiveAiServiceSetting();
    expect(result?.service_type).toBe('mistral');
    expect(isFoodPhotoAvailable(result)).toBe(true);
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

  test('401 with session auth triggers notifySessionExpired and returns null', async () => {
    mockGetActiveServerConfig.mockResolvedValue(sessionConfig);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
    });
    await expect(fetchActiveAiServiceSetting()).resolves.toBeNull();
    expect(mockNotifySessionExpired).toHaveBeenCalledWith(sessionConfig.id);
  });

  test('401 with api-key auth does not trigger reauth', async () => {
    mockGetActiveServerConfig.mockResolvedValue(testConfig);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
    });
    await expect(fetchActiveAiServiceSetting()).resolves.toBeNull();
    expect(mockNotifySessionExpired).not.toHaveBeenCalled();
  });

  test('network error returns null defensively', async () => {
    mockGetActiveServerConfig.mockResolvedValue(testConfig);
    mockFetch.mockRejectedValue(new Error('boom'));
    await expect(fetchActiveAiServiceSetting()).resolves.toBeNull();
  });
});

describe('isFoodPhotoAvailable', () => {
  test('null / undefined / empty service_type → false', () => {
    expect(isFoodPhotoAvailable(null)).toBe(false);
    expect(isFoodPhotoAvailable(undefined)).toBe(false);
    expect(
      isFoodPhotoAvailable({
        id: 'x',
        service_name: 'svc',
        service_type: '',
        is_active: true,
      }),
    ).toBe(false);
    expect(
      isFoodPhotoAvailable({
        id: 'x',
        service_name: 'svc',
        service_type: '   ',
        is_active: true,
      }),
    ).toBe(false);
  });
  test('any non-empty service_type → true (attempt-all; server is the gate)', () => {
    for (const provider of [
      'google',
      'openai',
      'anthropic',
      'mistral',
      'ollama',
      'openrouter',
      'custom',
      'openai_compatible',
      'groq',
    ]) {
      expect(
        isFoodPhotoAvailable({
          id: 'x',
          service_name: 'svc',
          service_type: provider,
          is_active: true,
        }),
      ).toBe(true);
    }
  });
});
