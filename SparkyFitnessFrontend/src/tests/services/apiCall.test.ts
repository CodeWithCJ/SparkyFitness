import { apiCall, HttpApiError } from '@/api/api';
import { toast } from '@/hooks/use-toast';

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
});
