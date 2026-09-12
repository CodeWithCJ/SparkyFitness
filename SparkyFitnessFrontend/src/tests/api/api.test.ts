import {
  apiCall,
  clearDemoRestrictions,
  gatewayReloadRuntime,
} from '@/api/api';
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

describe('apiCall demo restriction handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    clearDemoRestrictions();
    global.fetch = jest.fn();
  });

  const demoResponse = (code = 'DEMO_ACTION_RESTRICTED') =>
    makeResponse({
      status: 403,
      body: JSON.stringify({ error: 'Disabled on the demo account.', code }),
    });

  it('answers a repeated blocked GET from the memo instead of the network', async () => {
    jest.mocked(global.fetch).mockResolvedValue(demoResponse());

    await expect(apiCall('/external-providers')).rejects.toThrow(
      'Disabled on the demo account.'
    );
    await expect(apiCall('/external-providers')).rejects.toThrow(
      'Disabled on the demo account.'
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not let a blocked write answer the read on the same path', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(demoResponse())
      .mockResolvedValueOnce(makeResponse({ body: '{"id":"profile-1"}' }));

    await expect(
      apiCall('/identity/profiles', { method: 'PUT', body: '{}' })
    ).rejects.toThrow('Disabled on the demo account.');
    await expect(apiCall('/identity/profiles')).resolves.toEqual({
      id: 'profile-1',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('never memoizes an upload rejection, which depends on the content type', async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValue(demoResponse('DEMO_UPLOAD_RESTRICTED'));

    await expect(
      apiCall('/identity/profiles/avatar', { method: 'POST', body: '{}' })
    ).rejects.toThrow('Disabled on the demo account.');
    await expect(
      apiCall('/identity/profiles/avatar', { method: 'POST', body: '{}' })
    ).rejects.toThrow('Disabled on the demo account.');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not let a request in flight across a sign-out seed the next session', async () => {
    let releaseDemoResponse: (() => void) | undefined;
    jest.mocked(global.fetch).mockImplementation(() =>
      releaseDemoResponse
        ? Promise.resolve(makeResponse({ body: '{"ok":true}' }))
        : new Promise<Response>((resolve) => {
            releaseDemoResponse = () => resolve(demoResponse());
          })
    );

    const blocked = apiCall('/external-providers');
    // The session ends while that request is still outstanding.
    clearDemoRestrictions();
    releaseDemoResponse!();
    await expect(blocked).rejects.toThrow('Disabled on the demo account.');

    await expect(apiCall('/external-providers')).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('silences the toast for a polled read but not for a write the user clicked', async () => {
    jest.mocked(global.fetch).mockResolvedValue(demoResponse());

    await expect(apiCall('/chat/ai-service-settings')).rejects.toThrow();
    expect(mockToast).not.toHaveBeenCalled();

    await expect(
      apiCall('/identity/mfa/email-toggle', { method: 'POST', body: '{}' })
    ).rejects.toThrow();
    expect(mockToast).toHaveBeenCalledTimes(1);
  });
});
