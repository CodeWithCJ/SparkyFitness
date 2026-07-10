import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHuaweiHealthOAuthService,
  type HuaweiHealthOAuthRepository,
} from '../integrations/huaweihealth/huaweiHealthOAuthService.js';

const NOW = new Date('2026-07-10T12:00:00.000Z');
const STATE = 'a'.repeat(64);
const NONCE = 'b'.repeat(64);

function createRepository(): HuaweiHealthOAuthRepository {
  return {
    storeOAuthState: vi.fn(async () => undefined),
    consumeOAuthState: vi.fn(async () => null),
    saveTokens: vi.fn(async () => undefined),
    saveRefreshedTokens: vi.fn(async () => undefined),
    getConnection: vi.fn(async () => null),
    clearConnection: vi.fn(async () => undefined),
  };
}

function createDependencies(
  repository: HuaweiHealthOAuthRepository = createRepository()
) {
  return {
    repository,
    httpClient: {
      post: vi.fn(
        async (
          _url: string,
          _body: URLSearchParams,
          _config: { headers: Record<string, string> }
        ) => ({ data: {} as unknown })
      ),
      delete: vi.fn(
        async (
          _url: string,
          _config: {
            params: { deleteData: boolean };
            headers: Record<string, string>;
          }
        ) => ({ data: {} as unknown })
      ),
    },
    encryptValue: vi.fn(async (value: string) => ({
      encryptedText: `encrypted:${value}`,
      iv: `iv:${value}`,
      tag: `tag:${value}`,
    })),
    decryptValue: vi.fn(async (encryptedText: string) =>
      encryptedText === 'encrypted-refresh' ? 'refresh-token' : 'access-token'
    ),
    verifyIdToken: vi.fn(async () => ({ sub: 'huawei-user-123' })),
    randomHex: vi.fn().mockReturnValueOnce(STATE).mockReturnValueOnce(NONCE),
    now: vi.fn(() => NOW),
  };
}

describe('Huawei Health OAuth service', () => {
  beforeEach(() => {
    process.env.SPARKY_FITNESS_HUAWEI_HEALTH_CLIENT_ID = 'client-id';
    process.env.SPARKY_FITNESS_HUAWEI_HEALTH_CLIENT_SECRET = 'client-secret';
    process.env.SPARKY_FITNESS_FRONTEND_URL = 'https://fitness.example.com';
  });

  afterEach(() => {
    delete process.env.SPARKY_FITNESS_HUAWEI_HEALTH_CLIENT_ID;
    delete process.env.SPARKY_FITNESS_HUAWEI_HEALTH_CLIENT_SECRET;
    delete process.env.SPARKY_FITNESS_HUAWEI_HEALTH_APP_ID;
    delete process.env.SPARKY_FITNESS_HUAWEI_HEALTH_REDIRECT_URI;
    delete process.env.SPARKY_FITNESS_FRONTEND_URL;
    vi.restoreAllMocks();
  });

  it('builds an opaque authorization request with nonce and the MVP read scopes', async () => {
    const repository = createRepository();
    const service = createHuaweiHealthOAuthService(
      createDependencies(repository)
    );

    const result = await service.createAuthorizationRequest('user-1', 'user-1');

    const url = new URL(result.authUrl);
    expect(url.origin + url.pathname).toBe(
      'https://oauth-login.cloud.huawei.com/oauth2/v3/authorize'
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      access_type: 'offline',
      display: 'touch',
      client_id: 'client-id',
      redirect_uri: 'https://fitness.example.com/huaweihealth/callback',
      state: STATE,
      nonce: NONCE,
    });
    expect(url.searchParams.get('scope')?.split(' ')).toEqual([
      'openid',
      'https://www.huawei.com/healthkit/historydata.open.week',
      'https://www.huawei.com/healthkit/step.read',
      'https://www.huawei.com/healthkit/calories.read',
      'https://www.huawei.com/healthkit/distance.read',
      'https://www.huawei.com/healthkit/heartrate.read',
      'https://www.huawei.com/healthkit/oxygensaturation.read',
      'https://www.huawei.com/healthkit/heightweight.read',
      'https://www.huawei.com/healthkit/sleep.read',
      'https://www.huawei.com/healthkit/activityrecord.read',
    ]);
    expect(repository.storeOAuthState).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      `${STATE}.${NONCE}.${NOW.getTime()}`
    );
  });

  it('supports an explicitly registered redirect URI', async () => {
    process.env.SPARKY_FITNESS_HUAWEI_HEALTH_REDIRECT_URI =
      'https://auth.example.com/huawei/callback';
    const service = createHuaweiHealthOAuthService(createDependencies());

    const { authUrl } = await service.createAuthorizationRequest(
      'user-1',
      'user-1'
    );

    expect(new URL(authUrl).searchParams.get('redirect_uri')).toBe(
      'https://auth.example.com/huawei/callback'
    );
  });

  it('fails closed without instance credentials and for delegated profiles', async () => {
    const service = createHuaweiHealthOAuthService(createDependencies());
    await expect(
      service.createAuthorizationRequest('family-user', 'signed-in-user')
    ).rejects.toMatchObject({
      code: 'HUAWEI_OWNER_ONLY',
      statusCode: 403,
    });

    delete process.env.SPARKY_FITNESS_HUAWEI_HEALTH_CLIENT_SECRET;
    await expect(
      service.createAuthorizationRequest('user-1', 'user-1')
    ).rejects.toMatchObject({
      code: 'HUAWEI_NOT_CONFIGURED',
      statusCode: 503,
    });
  });

  it('rejects absent, consumed, and expired one-time state before token exchange', async () => {
    const repository = createRepository();
    const dependencies = createDependencies(repository);
    const service = createHuaweiHealthOAuthService(dependencies);

    await expect(
      service.exchangeCodeForTokens('user-1', 'user-1', 'code', STATE)
    ).rejects.toMatchObject({ code: 'HUAWEI_OAUTH_STATE_INVALID' });

    vi.mocked(repository.consumeOAuthState).mockResolvedValue(
      `${STATE}.${NONCE}.${NOW.getTime() - 10 * 60 * 1000 - 1}`
    );
    await expect(
      service.exchangeCodeForTokens('user-1', 'user-1', 'code', STATE)
    ).rejects.toMatchObject({ code: 'HUAWEI_OAUTH_STATE_EXPIRED' });
    expect(dependencies.httpClient.post).not.toHaveBeenCalled();
  });

  it('validates the ID-token nonce and encrypts both OAuth tokens', async () => {
    const repository = createRepository();
    vi.mocked(repository.consumeOAuthState).mockResolvedValue(
      `${STATE}.${NONCE}.${NOW.getTime()}`
    );
    const dependencies = createDependencies(repository);
    vi.mocked(dependencies.httpClient.post).mockResolvedValue({
      data: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        scope:
          'openid https://www.huawei.com/healthkit/step.read https://www.huawei.com/healthkit/sleep.read',
        id_token: 'signed-id-token',
        token_type: 'Bearer',
      },
    });
    const service = createHuaweiHealthOAuthService(dependencies);

    await expect(
      service.exchangeCodeForTokens(
        'user-1',
        'user-1',
        'authorization-code',
        STATE
      )
    ).resolves.toEqual({ connected: true });

    const [tokenUrl, body] = vi.mocked(dependencies.httpClient.post).mock
      .calls[0];
    expect(tokenUrl).toBe(
      'https://oauth-login.cloud.huawei.com/oauth2/v3/token'
    );
    expect(body).toBeInstanceOf(URLSearchParams);
    expect((body as URLSearchParams).get('client_secret')).toBe(
      'client-secret'
    );
    expect(dependencies.verifyIdToken).toHaveBeenCalledWith(
      'signed-id-token',
      expect.objectContaining({ clientId: 'client-id' }),
      NONCE
    );
    expect(repository.saveTokens).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({
        accessToken: expect.objectContaining({
          encryptedText: 'encrypted:access-token',
        }),
        refreshToken: expect.objectContaining({
          encryptedText: 'encrypted:refresh-token',
        }),
        externalUserId: 'huawei-user-123',
        tokenExpiresAt: new Date('2026-07-10T13:00:00.000Z'),
      })
    );
  });

  it('rejects malformed token responses before persisting credentials', async () => {
    const repository = createRepository();
    vi.mocked(repository.consumeOAuthState).mockResolvedValue(
      `${STATE}.${NONCE}.${NOW.getTime()}`
    );
    const dependencies = createDependencies(repository);
    vi.mocked(dependencies.httpClient.post).mockResolvedValue({
      data: { access_token: 'access-token' },
    });
    const service = createHuaweiHealthOAuthService(dependencies);

    await expect(
      service.exchangeCodeForTokens('user-1', 'user-1', 'code', STATE)
    ).rejects.toMatchObject({
      code: 'HUAWEI_TOKEN_RESPONSE_INVALID',
      statusCode: 502,
    });
    expect(repository.saveTokens).not.toHaveBeenCalled();
  });

  it('reports status and cancels Huawei consent before clearing local tokens', async () => {
    process.env.SPARKY_FITNESS_HUAWEI_HEALTH_APP_ID = 'health-app-id';
    const repository = createRepository();
    vi.mocked(repository.getConnection).mockResolvedValue({
      isActive: true,
      externalUserId: 'huawei-user-123',
      lastSyncAt: new Date('2026-07-10T11:00:00.000Z'),
      tokenExpiresAt: new Date('2026-07-10T13:00:00.000Z'),
      scope: 'openid https://www.huawei.com/healthkit/step.read',
      encryptedAccessToken: 'encrypted',
      accessTokenIv: 'iv',
      accessTokenTag: 'tag',
    });
    const dependencies = createDependencies(repository);
    const service = createHuaweiHealthOAuthService(dependencies);

    await expect(service.getStatus('user-1', 'user-1')).resolves.toEqual({
      available: true,
      connected: true,
      isActive: true,
      lastSyncAt: new Date('2026-07-10T11:00:00.000Z'),
      tokenExpiresAt: new Date('2026-07-10T13:00:00.000Z'),
      grantedScopes: ['openid', 'https://www.huawei.com/healthkit/step.read'],
    });

    await service.disconnect('user-1', 'user-1');
    expect(dependencies.httpClient.delete).toHaveBeenCalledWith(
      'https://health-api.cloud.huawei.com/healthkit/v2/consents/health-app-id',
      {
        params: { deleteData: false },
        headers: { Authorization: 'Bearer access-token' },
      }
    );
    expect(repository.clearConnection).toHaveBeenCalledWith('user-1', 'user-1');
  });

  it('returns a decrypted access token while it has more than five minutes left', async () => {
    const repository = createRepository();
    vi.mocked(repository.getConnection).mockResolvedValue({
      isActive: true,
      externalUserId: 'huawei-user-123',
      lastSyncAt: null,
      tokenExpiresAt: new Date('2026-07-10T13:00:00.000Z'),
      scope: 'openid',
      encryptedAccessToken: 'encrypted-access',
      accessTokenIv: 'aiv',
      accessTokenTag: 'atag',
      encryptedRefreshToken: 'encrypted-refresh',
      refreshTokenIv: 'riv',
      refreshTokenTag: 'rtag',
    });
    const dependencies = createDependencies(repository);
    const service = createHuaweiHealthOAuthService(dependencies);

    await expect(service.getValidAccessToken('user-1', 'user-1')).resolves.toBe(
      'access-token'
    );
    expect(dependencies.httpClient.post).not.toHaveBeenCalled();
  });

  it('refreshes an expiring access token and persists rotated encrypted material', async () => {
    const repository = createRepository();
    vi.mocked(repository.getConnection).mockResolvedValue({
      isActive: true,
      externalUserId: 'huawei-user-123',
      lastSyncAt: null,
      tokenExpiresAt: new Date('2026-07-10T12:04:00.000Z'),
      scope: 'openid',
      encryptedAccessToken: 'encrypted-access',
      accessTokenIv: 'aiv',
      accessTokenTag: 'atag',
      encryptedRefreshToken: 'encrypted-refresh',
      refreshTokenIv: 'riv',
      refreshTokenTag: 'rtag',
    });
    const dependencies = createDependencies(repository);
    vi.mocked(dependencies.httpClient.post).mockResolvedValue({
      data: {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        scope: 'openid https://www.huawei.com/healthkit/step.read',
        token_type: 'Bearer',
      },
    });
    const service = createHuaweiHealthOAuthService(dependencies);

    await expect(service.getValidAccessToken('user-1', 'user-1')).resolves.toBe(
      'new-access-token'
    );

    const [, body] = vi.mocked(dependencies.httpClient.post).mock.calls[0];
    expect((body as URLSearchParams).get('grant_type')).toBe('refresh_token');
    expect((body as URLSearchParams).get('refresh_token')).toBe(
      'refresh-token'
    );
    expect(repository.saveRefreshedTokens).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      expect.objectContaining({
        accessToken: expect.objectContaining({
          encryptedText: 'encrypted:new-access-token',
        }),
        refreshToken: expect.objectContaining({
          encryptedText: 'encrypted:new-refresh-token',
        }),
        tokenExpiresAt: new Date('2026-07-10T13:00:00.000Z'),
      })
    );
  });
});
