import { renderHook, act } from '@testing-library/react-native';
import { usePregnancyPhotoSource } from '../../src/hooks/usePregnancyPhotoSource';
import {
  getActiveServerConfig,
  proxyHeadersToRecord,
} from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.fn(),
}));

jest.mock('../../src/services/api/apiClient', () => ({
  normalizeUrl: (url: string) => url.replace(/\/$/, ''),
}));

jest.mock('../../src/services/api/authService', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer secret-token' }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      cb();
    }, [cb]);
  },
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;
const mockProxyHeadersToRecord = proxyHeadersToRecord as jest.MockedFunction<
  typeof proxyHeadersToRecord
>;

const renderWithUrl = async (url: string) => {
  mockGetActiveServerConfig.mockResolvedValue({
    id: 'test',
    url,
    apiKey: 'key',
  } as never);

  const { result } = renderHook(() => usePregnancyPhotoSource());
  await act(async () => {});
  return result;
};

/**
 * Bump photos are owner-only reproductive-health data: they are excluded from the
 * public /uploads static mount and served only by an authenticated, owner-checked
 * route, so every source carries the session token. A plaintext base URL would put
 * that token on the wire, which apiFetch refuses to do for every other request in
 * the app. This guard lives in the shared useAuthedImageSource hook; these cases
 * prove the pregnancy wrapper inherits it.
 */
describe('usePregnancyPhotoSource', () => {
  const devGlobal = globalThis as typeof globalThis & { __DEV__: boolean };
  const originalDev = devGlobal.__DEV__;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProxyHeadersToRecord.mockReturnValue({});
  });

  afterEach(() => {
    devGlobal.__DEV__ = originalDev;
  });

  it('builds a source with the auth headers over HTTPS', async () => {
    devGlobal.__DEV__ = false;
    const result = await renderWithUrl('https://example.com');

    const source = result.current.getPhotoSource('photo-1');

    expect(source?.uri).toBe(
      'https://example.com/api/v2/pregnancy/photos/file/photo-1'
    );
    expect(source?.headers).toMatchObject({
      Authorization: 'Bearer secret-token',
    });
  });

  it('returns null rather than sending the token over HTTP in production', async () => {
    devGlobal.__DEV__ = false;
    const result = await renderWithUrl('http://example.com');

    expect(result.current.getPhotoSource('photo-1')).toBeNull();
  });

  it('refuses HTTP regardless of casing', async () => {
    devGlobal.__DEV__ = false;
    const result = await renderWithUrl('HTTP://example.com');

    expect(result.current.getPhotoSource('photo-1')).toBeNull();
  });

  it('allows HTTP in development, where self-hosted servers are reached by IP', async () => {
    devGlobal.__DEV__ = true;
    const result = await renderWithUrl('http://192.168.1.10:3010');

    expect(result.current.getPhotoSource('photo-1')?.uri).toBe(
      'http://192.168.1.10:3010/api/v2/pregnancy/photos/file/photo-1'
    );
  });

  it('returns null before the config resolves', () => {
    devGlobal.__DEV__ = false;
    mockGetActiveServerConfig.mockReturnValue(new Promise(() => {}) as never);

    const { result } = renderHook(() => usePregnancyPhotoSource());

    expect(result.current.getPhotoSource('photo-1')).toBeNull();
    expect(result.current.isReady).toBe(false);
  });
});
