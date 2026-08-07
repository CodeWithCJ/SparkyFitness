import { apiCall, gatewayReloadRuntime } from '@/api/api';
import { toast } from '@/hooks/use-toast';

jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));
jest.mock('@/utils/logging');

const mockToast = jest.mocked(toast);
const mockReload = jest.fn();

interface FakeResponseOptions {
  status?: number;
  contentType?: string | null;
  body?: string;
  redirected?: boolean;
  url?: string;
}

const makeResponse = ({
  status = 200,
  contentType = 'application/json',
  body = '{}',
  redirected = false,
  url = 'http://localhost/api/test',
}: FakeResponseOptions = {}): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    type: 'basic',
    redirected,
    url,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? contentType : null,
    },
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  }) as unknown as Response;

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('apiCall gateway interception handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    jest
      .spyOn(gatewayReloadRuntime, 'reloadWindowLocation')
      .mockImplementation(mockReload);
    global.fetch = jest.fn();
  });

  it('returns parsed JSON on a normal success response without reloading', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValue(makeResponse({ body: '{"value":1}' }));

    await expect(apiCall('/test')).resolves.toEqual({ value: 1 });
    expect(mockReload).not.toHaveBeenCalled();
  });

  // Regression for issue #2051: proxy error pages (nginx 502/504, Express's
  // default HTML 404) must surface as normal API errors, not page reloads.
  it('rejects without reloading when an error status carries an HTML body', async () => {
    jest.mocked(global.fetch).mockResolvedValue(
      makeResponse({
        status: 502,
        contentType: 'text/html',
        body: '<html><body>502 Bad Gateway</body></html>',
      })
    );

    await expect(apiCall('/v2/foods/search/openfoodfacts')).rejects.toThrow();
    expect(mockReload).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' })
    );
  });

  it('reloads when a success response carries an HTML body', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValue(
        makeResponse({ contentType: 'text/html', body: '<html></html>' })
      );

    // The gateway path intentionally returns a never-settling promise, so the
    // call is not awaited.
    void apiCall('/test');
    await flushMicrotasks();

    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('reloads at most once within the guard window', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValue(
        makeResponse({ contentType: 'text/html', body: '<html></html>' })
      );

    void apiCall('/test');
    void apiCall('/test');
    await flushMicrotasks();

    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('reloads on a cross-origin redirect even with an error status', async () => {
    jest.mocked(global.fetch).mockResolvedValue(
      makeResponse({
        status: 403,
        contentType: 'text/html',
        body: '<html></html>',
        redirected: true,
        url: 'https://team.cloudflareaccess.com/login',
      })
    );

    void apiCall('/test');
    await flushMicrotasks();

    expect(mockReload).toHaveBeenCalledTimes(1);
  });
});
