import * as apiModule from '@/api/api';
import {
  beginHuaweiHealthAuthorization,
  completeHuaweiHealthAuthorization,
  disconnectHuaweiHealth,
  getHuaweiHealthStatus,
  isTrustedHuaweiAuthorizationUrl,
  syncHuaweiHealth,
} from '@/api/Integrations/huaweiHealth';

jest.mock('@/api/api');

const mockedApiCall = apiModule.apiCall as jest.MockedFunction<
  typeof apiModule.apiCall
>;

describe('HUAWEI Health API', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads the owner-only connection status', async () => {
    mockedApiCall.mockResolvedValue({ available: true, connected: false });

    await getHuaweiHealthStatus();

    expect(mockedApiCall).toHaveBeenCalledWith(
      '/integrations/huaweihealth/status',
      { method: 'GET', suppressErrorToast: true }
    );
  });

  it('starts authorization and validates the trusted Huawei redirect', async () => {
    const authUrl =
      'https://oauth-login.cloud.huawei.com/oauth2/v3/authorize?state=abc';
    mockedApiCall.mockResolvedValue({ authUrl });

    await expect(beginHuaweiHealthAuthorization()).resolves.toEqual({
      authUrl,
    });
    expect(mockedApiCall).toHaveBeenCalledWith(
      '/integrations/huaweihealth/authorize',
      { method: 'GET', suppressErrorToast: true }
    );
    expect(isTrustedHuaweiAuthorizationUrl(authUrl)).toBe(true);
    expect(
      isTrustedHuaweiAuthorizationUrl(
        'https://oauth-login.cloud.huawei.com.evil.example/oauth2/v3/authorize'
      )
    ).toBe(false);
    expect(
      isTrustedHuaweiAuthorizationUrl(
        'https://oauth-login.cloud.huawei.com/oauth2/v2/authorize'
      )
    ).toBe(false);
  });

  it('completes the callback with both the code and state', async () => {
    mockedApiCall.mockResolvedValue({ connected: true });

    await completeHuaweiHealthAuthorization({
      code: 'authorization-code',
      state: 'a'.repeat(64),
    });

    expect(mockedApiCall).toHaveBeenCalledWith(
      '/integrations/huaweihealth/callback',
      {
        method: 'POST',
        body: {
          code: 'authorization-code',
          state: 'a'.repeat(64),
        },
        suppressErrorToast: true,
      }
    );
  });

  it('starts a bounded manual sync and disconnects through server routes', async () => {
    mockedApiCall.mockResolvedValueOnce({ status: 'completed' });
    mockedApiCall.mockResolvedValueOnce({ connected: false });

    await syncHuaweiHealth({
      startDate: '2026-07-01',
      endDate: '2026-07-10',
    });
    await disconnectHuaweiHealth();

    expect(mockedApiCall).toHaveBeenNthCalledWith(
      1,
      '/integrations/huaweihealth/sync',
      {
        method: 'POST',
        body: {
          startDate: '2026-07-01',
          endDate: '2026-07-10',
        },
        suppressErrorToast: true,
      }
    );
    expect(mockedApiCall).toHaveBeenNthCalledWith(
      2,
      '/integrations/huaweihealth/disconnect',
      { method: 'POST', suppressErrorToast: true }
    );
  });
});
