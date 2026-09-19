import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getOidcProviders, getActiveOidcProviderIds } = vi.hoisted(() => ({
  getOidcProviders: vi.fn(),
  getActiveOidcProviderIds: vi.fn(),
}));

vi.mock('../models/oidcProviderRepository.js', () => ({
  default: { getOidcProviders, getActiveOidcProviderIds },
}));

vi.mock('better-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('better-auth')>();
  return {
    ...actual,
    betterAuth: (options: Parameters<typeof actual.betterAuth>[0]) =>
      actual.betterAuth({
        baseURL: options.baseURL,
        secret: process.env.BETTER_AUTH_SECRET,
        trustedOrigins: options.trustedOrigins,
        account: options.account,
        logger: { disabled: true },
        // Better Auth disables origin checks by default in test mode.
        advanced: { disableOriginCheck: false, disableCSRFCheck: false },
        plugins: (options.plugins ?? []).filter(
          (plugin) => plugin.id === 'sso'
        ),
      }),
  };
});

type Provider = {
  provider_id: string;
  issuer_url: string;
  is_active: boolean;
  tokenEndpoint?: string;
  jwksEndpoint?: string;
};

/** Load independent module state while retaining the shared repository fixture. */
async function createReplica() {
  vi.resetModules();
  const replica = await import('../auth.js');
  await replica.auth.$context;
  await replica.syncTrustedProviders();
  return replica;
}

async function readOrigins(
  replica: Awaited<ReturnType<typeof createReplica>>,
  request?: Request
) {
  const origins = replica.auth.options.trustedOrigins;
  if (typeof origins !== 'function')
    throw new Error('Expected dynamic origins');
  return origins(request);
}

describe('OIDC origins across server instances', () => {
  let providers: Provider[];

  beforeEach(() => {
    vi.stubEnv('SPARKY_FITNESS_FRONTEND_URL', 'https://sparky.example.test');
    vi.stubEnv('BETTER_AUTH_URL', 'https://sparky.example.test');
    vi.stubEnv(
      'SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS',
      'https://extra.example.test'
    );
    providers = [
      {
        provider_id: 'internal',
        issuer_url: 'http://127.0.0.1:38198',
        is_active: true,
      },
    ];
    getOidcProviders
      .mockReset()
      .mockImplementation(async () =>
        providers.map((provider) => ({ ...provider }))
      );
    getActiveOidcProviderIds.mockReset().mockResolvedValue(['internal']);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('starts SSO on another instance after a provider address changes', async () => {
    const first = await createReplica();
    const second = await createReplica();
    const issuer = 'http://127.0.0.1:38199';
    providers[0].issuer_url = issuer;
    // Both adapters see the updated row; only the first process is notified of the edit.
    for (const replica of [first, second]) {
      const ctx = await replica.auth.$context;
      await ctx.adapter.create({
        model: 'ssoProvider',
        data: {
          providerId: 'internal',
          issuer,
          domain: 'example.test',
          userId: 'fixture-user',
          oidcConfig: JSON.stringify({
            issuer,
            clientId: 'fixture-client',
            authorizationEndpoint: issuer + '/authorize',
            tokenEndpoint: issuer + '/token',
            jwksEndpoint: issuer + '/jwks',
            userInfoEndpoint: issuer + '/userinfo',
            tokenEndpointAuthentication: 'none',
            scopes: ['openid'],
            pkce: true,
          }),
        },
      });
    }
    await first.syncTrustedProviders();

    for (const replica of [first, second]) {
      getOidcProviders.mockClear();
      const response = await replica.auth.handler(
        new Request('https://sparky.example.test/api/auth/sign-in/sso', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'https://sparky.example.test',
            cookie: 'probe=1',
          },
          body: JSON.stringify({
            providerId: 'internal',
            callbackURL: 'https://sparky.example.test/',
          }),
        })
      );
      expect(response.status).toBe(200);
      expect((await response.json()).url).toContain(issuer + '/authorize');
      expect(getOidcProviders).toHaveBeenCalledTimes(1);
    }
  });

  it('shares one snapshot within a request and refreshes it for the next request', async () => {
    const replica = await createReplica();
    getOidcProviders.mockClear();
    const request = new Request('https://sparky.example.test/api/auth/ok');
    const original = await readOrigins(replica, request);
    expect(original).toContain('http://127.0.0.1:38198');
    providers[0].issuer_url = 'http://127.0.0.1:38199';
    expect(await readOrigins(replica, request)).toEqual(original);
    expect(getOidcProviders).toHaveBeenCalledTimes(1);

    const updated = await readOrigins(replica, new Request(request));
    expect(updated).toContain('http://127.0.0.1:38199');
    expect(updated).not.toContain('http://127.0.0.1:38198');
    expect(getOidcProviders).toHaveBeenCalledTimes(2);
  });

  it('preserves application and mobile origins while ignoring invalid provider URLs', async () => {
    const replica = await createReplica();
    providers[0].issuer_url = 'invalid-url';
    const origins = await readOrigins(
      replica,
      new Request('https://sparky.example.test/api/auth/ok')
    );
    expect(origins).toEqual(
      expect.arrayContaining([
        'https://sparky.example.test',
        'https://extra.example.test',
        'sparkyfitnessmobile://',
      ])
    );
    expect(origins).not.toContain('invalid-url');
    expect(origins).not.toContain('http://127.0.0.1:38198');
  });

  it('does not read provider tables during auth construction', async () => {
    vi.resetModules();
    const replica = await import('../auth.js');
    await replica.auth.$context;
    expect(getOidcProviders).not.toHaveBeenCalled();
    await replica.syncTrustedProviders();
    expect(await readOrigins(replica)).toContain('http://127.0.0.1:38198');
  });

  it('includes endpoint hosts that differ from the provider issuer', async () => {
    const replica = await createReplica();
    providers[0].tokenEndpoint = 'https://tokens.example.test/oauth/token';
    providers[0].jwksEndpoint = 'https://keys.example.test/jwks';
    const origins = await readOrigins(
      replica,
      new Request('https://sparky.example.test/api/auth/ok')
    );
    expect(origins).toEqual(
      expect.arrayContaining([
        'http://127.0.0.1:38198',
        'https://tokens.example.test',
        'https://keys.example.test',
      ])
    );
  });

  it('does not allow an untrusted origin during or after a failed provider read', async () => {
    const replica = await createReplica();
    const request = new Request(
      'https://sparky.example.test/api/auth/sign-in/sso',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://untrusted.example.test',
          cookie: 'probe=1',
        },
        body: JSON.stringify({
          providerId: 'internal',
          callbackURL: 'https://sparky.example.test/',
        }),
      }
    );
    getOidcProviders.mockRejectedValueOnce(
      new Error('Provider database unavailable')
    );
    const [result] = await Promise.allSettled([
      replica.auth.handler(request.clone()),
    ]);
    if (result.status === 'fulfilled') {
      expect(result.value.status).toBeGreaterThanOrEqual(500);
      expect(result.value.status).toBeLessThan(600);
    }
    const response = await replica.auth.handler(request);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('INVALID_ORIGIN');
  });

  it('refuses a request when the provider read fails and recovers on a later request', async () => {
    const replica = await createReplica();
    getOidcProviders.mockRejectedValueOnce(
      new Error('Provider database unavailable')
    );
    const [result] = await Promise.allSettled([
      replica.auth.handler(
        new Request('https://sparky.example.test/api/auth/ok')
      ),
    ]);
    if (result.status === 'fulfilled') {
      expect(result.value.status).toBeGreaterThanOrEqual(500);
      expect(result.value.status).toBeLessThan(600);
    }
    const recovered = await replica.auth.handler(
      new Request('https://sparky.example.test/api/auth/ok')
    );
    expect(recovered.status).toBe(200);
  });
});
