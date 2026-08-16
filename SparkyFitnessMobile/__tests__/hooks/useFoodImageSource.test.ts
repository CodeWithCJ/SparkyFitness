import { renderHook, act } from '@testing-library/react-native';
import { useFoodImageSource } from '../../src/hooks/useFoodImageSource';
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

// The hook deliberately avoids navigation context, so there is nothing from
// @react-navigation to mock here — that is the point of the design.
import { AppState } from 'react-native';

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;
const mockProxyHeadersToRecord = proxyHeadersToRecord as jest.MockedFunction<
  typeof proxyHeadersToRecord
>;

const CONFIG = {
  id: 'test',
  url: 'https://example.com',
  apiKey: 'key',
};

async function renderResolver() {
  const { result, rerender } = renderHook(() => useFoodImageSource());
  await act(async () => {});
  return { result, rerender };
}

/** Fires the AppState listeners the hook registered, as a foreground return. */
async function returnToForeground() {
  const addEventListener = AppState.addEventListener as jest.MockedFunction<
    typeof AppState.addEventListener
  >;
  const handlers = addEventListener.mock.calls
    .filter(([event]) => event === 'change')
    .map(([, handler]) => handler);

  await act(async () => {
    handlers.forEach((handler) => handler('active'));
  });
}

describe('useFoodImageSource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({
      remove: jest.fn(),
    } as unknown as ReturnType<typeof AppState.addEventListener>);
    mockProxyHeadersToRecord.mockReturnValue({});
    mockGetActiveServerConfig.mockResolvedValue(CONFIG);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null for an empty path', async () => {
    const { result } = await renderResolver();
    expect(result.current.getImageSource('')).toBeNull();
  });

  it('prefixes server-relative upload paths with the API origin', async () => {
    // Food images are stored already server-relative, unlike exercise images
    // which are bare filenames — the hook must not double the directory.
    const { result } = await renderResolver();

    expect(result.current.getImageSource('/uploads/foods/abc/1.jpg')?.uri).toBe(
      'https://example.com/api/uploads/foods/abc/1.jpg',
    );
  });

  it('treats a bare filename as a legacy upload', async () => {
    const { result } = await renderResolver();

    expect(result.current.getImageSource('1.jpg')?.uri).toBe(
      'https://example.com/api/uploads/foods/1.jpg',
    );
  });

  it('uses an absolute provider URL directly, with no headers', async () => {
    // A provider image that failed to localize stays hotlinked; sending the
    // server's proxy headers to a third-party CDN would leak them.
    const { result } = await renderResolver();

    const source = result.current.getImageSource('https://cdn.example/x.jpg');
    expect(source).toEqual({ uri: 'https://cdn.example/x.jpg', headers: {} });
  });

  it('attaches proxy headers to server-hosted images', async () => {
    mockProxyHeadersToRecord.mockReturnValue({ 'X-Auth': 'token' });
    const { result } = await renderResolver();

    expect(
      result.current.getImageSource('/uploads/foods/abc/1.jpg')?.headers,
    ).toEqual({ 'X-Auth': 'token' });
  });

  it('returns a referentially stable source for the same path', async () => {
    // Regression guard: without the cache, every render builds a fresh
    // { uri, headers } literal, which <SafeImage> reads as a new source — so
    // every thumbnail in a list reloads and visibly flashes on re-render.
    const { result } = await renderResolver();

    const first = result.current.getImageSource('/uploads/foods/abc/1.jpg');
    const second = result.current.getImageSource('/uploads/foods/abc/1.jpg');

    expect(first).toBe(second);
  });

  it('does not resolve server-relative paths before config loads', async () => {
    let resolveConfig: (c: typeof CONFIG) => void = () => {};
    mockGetActiveServerConfig.mockReturnValue(
      new Promise((resolve) => {
        resolveConfig = resolve;
      }) as ReturnType<typeof getActiveServerConfig>,
    );

    const { result } = renderHook(() => useFoodImageSource());

    // Nothing to build a URL from yet — and crucially this must not be cached,
    // or the path would stay unresolved after the config arrives.
    expect(result.current.getImageSource('/uploads/foods/abc/1.jpg')).toBeNull();

    await act(async () => {
      resolveConfig(CONFIG);
    });

    expect(result.current.getImageSource('/uploads/foods/abc/1.jpg')?.uri).toBe(
      'https://example.com/api/uploads/foods/abc/1.jpg',
    );
  });

  it('rebuilds sources after the active server changes', async () => {
    // Switching servers must not leave thumbnails pointing at the old origin.
    const { result } = await renderResolver();

    expect(result.current.getImageSource('/uploads/foods/abc/1.jpg')?.uri).toBe(
      'https://example.com/api/uploads/foods/abc/1.jpg',
    );

    mockGetActiveServerConfig.mockResolvedValue({
      ...CONFIG,
      id: 'other',
      url: 'https://other.example',
    });

    await returnToForeground();

    expect(result.current.getImageSource('/uploads/foods/abc/1.jpg')?.uri).toBe(
      'https://other.example/api/uploads/foods/abc/1.jpg',
    );
  });
});
