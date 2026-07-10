import { apiCall, HttpApiError } from '@/api/api';
import { toast } from '@/hooks/use-toast';
import * as logging from '@/utils/logging';

jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

jest.mock('@/utils/logging', () => ({
  debug: jest.fn(),
  error: jest.fn(),
}));

jest.mock('@/utils/userPreferences', () => ({
  getUserLoggingLevel: () => 'error',
}));

const mockedToast = toast as jest.MockedFunction<typeof toast>;

describe('apiCall structured errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves a stable server error code without rendering an object string', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: { code: 'HUAWEI_NOT_CONNECTED' } }),
    } as unknown as Response);

    const request = apiCall('/integrations/huaweihealth/sync', {
      method: 'POST',
      body: {},
      suppressErrorToast: true,
    });

    await expect(request).rejects.toMatchObject({
      name: 'HttpApiError',
      code: 'HUAWEI_NOT_CONNECTED',
      status: 409,
    } satisfies Partial<HttpApiError>);
    expect(mockedToast).not.toHaveBeenCalled();
  });

  it('suppresses the low-level network toast when a caller provides a friendly mutation error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('socket reset'));

    await expect(
      apiCall('/integrations/huaweihealth/status', {
        method: 'GET',
        suppressErrorToast: true,
      })
    ).rejects.toThrow('socket reset');

    expect(mockedToast).not.toHaveBeenCalled();
  });

  it('does not log sensitive OAuth request or response payloads', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ connected: true }),
    } as unknown as Response);

    await apiCall('/integrations/huaweihealth/callback', {
      method: 'POST',
      body: { code: 'secret-code', state: 'secret-state' },
      sensitive: true,
    });

    expect(JSON.stringify(jest.mocked(logging.debug).mock.calls)).not.toContain(
      'secret-code'
    );
    expect(JSON.stringify(jest.mocked(logging.debug).mock.calls)).not.toContain(
      'connected'
    );
  });
});
