import { apiFetch } from '../../../src/services/api/apiClient';
import { ApiError } from '../../../src/services/api/errors';

jest.mock('../../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.fn(() => ({})),
}));

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../../src/services/api/authService', () => ({
  getAuthHeaders: jest.fn(() => ({})),
  notifySessionExpired: jest.fn(),
}));

import { getActiveServerConfig } from '../../../src/services/storage';

const mockedGetConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

describe('apiFetch error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetConfig.mockResolvedValue({
      id: 'cfg-1',
      url: 'https://example.invalid',
      authType: 'apikey',
      proxyHeaders: [],
    } as never);
  });

  test('throws ApiError with statusCode on 4xx', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded.',
      headers: new Headers(),
    }) as never;

    await expect(
      apiFetch({ endpoint: '/api/x', serviceName: 's', operation: 'get' })
    ).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 429,
      body: 'Rate limit exceeded.',
    });
  });

  test('throws ApiError with statusCode on 5xx', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
      headers: new Headers(),
    }) as never;

    const promise = apiFetch({
      endpoint: '/api/x',
      serviceName: 's',
      operation: 'get',
    });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ statusCode: 503 });
  });

  // Regression (#1353): the native HTTP cache (iOS CFNetwork / Android OkHttp)
  // silently replays If-None-Match/If-Modified-Since and the server answers 304
  // with an empty body, which the app reports as "Failed to Load". Passing
  // `cache: 'no-store'` makes RN's whatwg-fetch rewrite the GET URL with a
  // cache-buster so the request misses the native cache. We assert only that
  // the fetch option is passed — whatwg-fetch owns the actual URL rewrite.
  test('passes cache: no-store on GET so whatwg-fetch busts the native cache', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
      headers: new Headers(),
    });
    global.fetch = mockFetch as never;

    await apiFetch({ endpoint: '/api/x', serviceName: 's', operation: 'get' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.invalid/api/x',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  // whatwg-fetch appends the `_=<timestamp>` cache-buster for *any* method when
  // `cache: 'no-store'` is set, so we scope it to GET — mutating requests are
  // not cacheable and should not carry the buster onto their URLs (#1353).
  test('omits cache: no-store on non-GET requests', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
      headers: new Headers(),
    });
    global.fetch = mockFetch as never;

    await apiFetch({
      endpoint: '/api/y',
      serviceName: 's',
      operation: 'post',
      method: 'POST',
      body: {},
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.invalid/api/y',
      expect.not.objectContaining({ cache: 'no-store' })
    );
  });
});
