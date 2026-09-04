import { uploadPhoto } from '../../../src/services/api/checkInPhotosApi';
import {
  getActiveServerConfig,
  ServerConfig,
} from '../../../src/services/storage';
import { fetchWithTimeout } from '../../../src/utils/concurrency';

jest.mock('../../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.requireActual('../../../src/services/storage')
    .proxyHeadersToRecord,
}));

jest.mock('../../../src/utils/concurrency', () => ({
  ...jest.requireActual('../../../src/utils/concurrency'),
  fetchWithTimeout: jest.fn(),
}));

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

// expo-file-system's File touches the native module; the guard under test runs
// before any part is appended, so a stub is enough.
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;
const mockFetchWithTimeout = fetchWithTimeout as jest.MockedFunction<
  typeof fetchWithTimeout
>;

const config = (url: string) =>
  ({
    id: 'cfg-1',
    url,
    authType: 'session',
    proxyHeaders: [],
  }) as unknown as ServerConfig;

const upload = () =>
  uploadPhoto({ date: '2026-03-20', type: 'front', uri: 'file:///a.jpg' });

/**
 * The upload cannot go through apiFetch - that JSON-encodes its body - so it runs its own
 * multipart transport and has to repeat apiFetch's transport guard. Without it a plaintext
 * server URL would put the session token and the user's photo on the wire.
 */
describe('uploadPhoto HTTPS enforcement', () => {
  const devGlobal = globalThis as typeof globalThis & { __DEV__: boolean };
  const originalDev = devGlobal.__DEV__;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    devGlobal.__DEV__ = originalDev;
  });

  it('rejects HTTP URLs in production', async () => {
    devGlobal.__DEV__ = false;
    mockGetActiveServerConfig.mockResolvedValue(config('http://example.com'));

    await expect(upload()).rejects.toThrow('HTTPS is required');
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it('rejects HTTP URLs regardless of casing in production', async () => {
    devGlobal.__DEV__ = false;
    mockGetActiveServerConfig.mockResolvedValue(config('HTTP://example.com'));

    await expect(upload()).rejects.toThrow('HTTPS is required');
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it('allows HTTPS URLs in production', async () => {
    devGlobal.__DEV__ = false;
    mockGetActiveServerConfig.mockResolvedValue(config('https://example.com'));
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'p1' }),
    } as unknown as Response);

    await expect(upload()).resolves.toEqual({ id: 'p1' });
    expect(mockFetchWithTimeout).toHaveBeenCalled();
  });

  it('allows HTTP URLs in development', async () => {
    devGlobal.__DEV__ = true;
    mockGetActiveServerConfig.mockResolvedValue(
      config('http://localhost:3010')
    );
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'p1' }),
    } as unknown as Response);

    await expect(upload()).resolves.toEqual({ id: 'p1' });
    expect(mockFetchWithTimeout).toHaveBeenCalled();
  });
});
