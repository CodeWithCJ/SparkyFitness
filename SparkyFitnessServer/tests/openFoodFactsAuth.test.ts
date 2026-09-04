import { beforeEach, describe, expect, it, vi } from 'vitest';
import externalProviderService from '../services/externalProviderService.js';
import { log } from '../config/logging.js';
import {
  getOpenFoodFactsSessionCookie,
  resolveOpenFoodFactsProvider,
  invalidateOpenFoodFactsSession,
  DEFAULT_OFF_BASE_URL,
  normalizeBaseUrl,
  assertSecureOpenFoodFactsWriteBaseUrl,
  __resetForTests,
  loginToOpenFoodFacts,
} from '../integrations/openfoodfacts/openFoodFactsAuth.js';

vi.mock('../services/externalProviderService.js');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

global.fetch = vi.fn();

const USER_ID = 'user-A';
const PROVIDER_ID = 'prov-1';
const OTHER_PROVIDER_ID = 'prov-2';
type ProviderDetails = NonNullable<
  Awaited<
    ReturnType<typeof externalProviderService.getExternalDataProviderDetails>
  >
>;

function makeProviderDetails(appId: string, appKey: string): ProviderDetails {
  return {
    id: PROVIDER_ID,
    provider_name: 'Open Food Facts',
    provider_type: 'openfoodfacts',
    user_id: USER_ID,
    is_public: false,
    is_active: true,
    base_url: null,
    sync_frequency: 'manual',
    app_id: appId,
    app_key: appKey,
    token_expires_at: null,
    external_user_id: null,
    garth_dump: null,
    is_strictly_private: true,
    categories: [],
    required_fields: [],
    field_labels: {},
    supports_barcode: true,
  };
}

// 1. UPDATE: Mocks robuster gemacht (ok, status und headers.get hinzugefügt)
function makeOffLoginResponse({ session = 'abc123', body = '' } = {}) {
  return {
    ok: true,
    status: 200,
    headers: {
      getSetCookie: () => [
        `session=${session}; Path=/; HttpOnly`,
        'other=foo; Path=/',
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get: (name: any) => {
        if (name.toLowerCase() === 'set-cookie') {
          return `session=${session}; Path=/; HttpOnly`;
        }
        return null;
      },
    },
    text: vi.fn().mockResolvedValue(body),
  };
}

function makeOffLoginRejectedResponse() {
  return {
    ok: true,
    status: 200,
    headers: {
      getSetCookie: () => [],
      get: () => null,
    },
    text: vi.fn().mockResolvedValue(''),
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetch).mockReset();
  vi.mocked(externalProviderService.getExternalDataProviderDetails).mockReset();
  __resetForTests();
});

describe('getOpenFoodFactsSessionCookie', () => {
  it('caches the session after a successful login', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'me',
      app_key: 'pw',
    });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    fetch.mockResolvedValue(makeOffLoginResponse({ session: 'XYZ' }));

    const first = await getOpenFoodFactsSessionCookie(USER_ID, PROVIDER_ID);
    const second = await getOpenFoodFactsSessionCookie(USER_ID, PROVIDER_ID);

    expect(first).toBe('XYZ');
    expect(second).toBe('XYZ');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      externalProviderService.getExternalDataProviderDetails
    ).toHaveBeenCalledWith(USER_ID, PROVIDER_ID);
  });

  it('negative-caches when login returns no session cookie', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'me',
      app_key: 'pw',
    });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    fetch.mockResolvedValue(makeOffLoginRejectedResponse());

    const result = await getOpenFoodFactsSessionCookie(USER_ID, PROVIDER_ID);

    expect(result).toBe(null);
  });

  it('returns null without throwing when ownership check rejects', async () => {
    // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderService.getExternalDataProviderDetails.mockRejectedValue(
      new Error('Forbidden: not owner')
    );

    const result = await getOpenFoodFactsSessionCookie(
      USER_ID,
      OTHER_PROVIDER_ID
    );

    expect(result).toBe(null);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('coalesces concurrent logins for the same key into one fetch', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'me',
      app_key: 'pw',
    });
    let resolveFetch;
    // @ts-expect-error TS(2339): Property 'mockReturnValue' does not exist on type ... Remove this comment to see the full error message
    fetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const p1 = getOpenFoodFactsSessionCookie(USER_ID, PROVIDER_ID);
    const p2 = getOpenFoodFactsSessionCookie(USER_ID, PROVIDER_ID);

    // @ts-expect-error TS(2722): Cannot invoke an object which is possibly 'undefin... Remove this comment to see the full error message
    resolveFetch(makeOffLoginResponse({ session: 'COALESCED' }));

    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe('COALESCED');
    expect(b).toBe('COALESCED');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('skips login when provider has no credentials', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: null,
      app_key: null,
    });

    const result = await getOpenFoodFactsSessionCookie(USER_ID, PROVIDER_ID);

    expect(result).toBe(null);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('treats a login HTML page with the error marker as failure', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'me',
      app_key: 'wrong',
    });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    fetch.mockResolvedValue(
      makeOffLoginResponse({
        session: 'leftover',
        body: '<p>Incorrect user name or password</p>',
      })
    );

    const result = await getOpenFoodFactsSessionCookie(USER_ID, PROVIDER_ID);
    expect(result).toBe(null);
  });
});

describe('loginToOpenFoodFacts', () => {
  it('does not write the username, password, or session cookie to logs', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOffLoginResponse({
        session: 'secret-session-cookie',
      }) as unknown as Response
    );

    await loginToOpenFoodFacts('private-off-user', 'private-off-password');

    const loggedValues = JSON.stringify(vi.mocked(log).mock.calls);
    expect(loggedValues).not.toContain('private-off-user');
    expect(loggedValues).not.toContain('private-off-password');
    expect(loggedValues).not.toContain('secret-session-cookie');
  });

  it('uses the documented HTTP basic gate for the OFF staging host', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeOffLoginResponse({ session: 'STAGING' }) as unknown as Response
    );

    await expect(
      loginToOpenFoodFacts(
        'staging-user',
        'staging-password',
        'https://world.openfoodfacts.net'
      )
    ).resolves.toBe('STAGING');

    expect(fetch).toHaveBeenCalledWith(
      'https://world.openfoodfacts.net/cgi/session.pl',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Basic b2ZmOm9mZg==',
        }),
      })
    );
  });

  it('aborts a login request that exceeds the bounded network deadline', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason);
          });
        })
    );

    const login = loginToOpenFoodFacts('slow-user', 'password');
    const rejection = expect(login).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(30_001);

    await rejection;
    vi.useRealTimers();
  });
});

describe('invalidateOpenFoodFactsSession', () => {
  it('drops a cached entry so the next call re-logs in', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'me',
      app_key: 'pw',
    });
    fetch
      // @ts-expect-error TS(2339): Property 'mockResolvedValueOnce' does not exist on... Remove this comment to see the full error message
      .mockResolvedValueOnce(makeOffLoginResponse({ session: 'one' }))
      .mockResolvedValueOnce(makeOffLoginResponse({ session: 'two' }));

    const a = await getOpenFoodFactsSessionCookie(USER_ID, PROVIDER_ID);
    invalidateOpenFoodFactsSession(USER_ID, PROVIDER_ID);
    const b = await getOpenFoodFactsSessionCookie(USER_ID, PROVIDER_ID);

    expect(a).toBe('one');
    expect(b).toBe('two');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('invalidates only the requested personal cache key when a write session expires', async () => {
    // @ts-expect-error TS(2339): mocked service method
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'me',
      app_key: 'pw',
      is_public: true,
      is_active: true,
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        makeOffLoginResponse({ session: 'PERSONAL-ONE' }) as unknown as Response
      )
      .mockResolvedValueOnce(
        makeOffLoginResponse({ session: 'GLOBAL-ONE' }) as unknown as Response
      )
      .mockResolvedValueOnce(
        makeOffLoginResponse({ session: 'PERSONAL-TWO' }) as unknown as Response
      )
      .mockResolvedValueOnce(
        makeOffLoginResponse({ session: 'GLOBAL-TWO' }) as unknown as Response
      );

    await resolveOpenFoodFactsProvider(USER_ID, PROVIDER_ID, 'personal');
    await resolveOpenFoodFactsProvider(USER_ID, PROVIDER_ID, 'global');
    invalidateOpenFoodFactsSession(USER_ID, PROVIDER_ID, 'personal');

    const personal = await resolveOpenFoodFactsProvider(
      USER_ID,
      PROVIDER_ID,
      'personal'
    );
    const global = await resolveOpenFoodFactsProvider(
      'user-B',
      PROVIDER_ID,
      'global'
    );

    expect(personal.session).toBe('PERSONAL-TWO');
    expect(global.session).toBe('GLOBAL-ONE');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('invalidates only the requested global cache key when a shared write session expires', async () => {
    // @ts-expect-error TS(2339): mocked service method
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'me',
      app_key: 'pw',
      is_public: true,
      is_active: true,
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        makeOffLoginResponse({ session: 'PERSONAL-ONE' }) as unknown as Response
      )
      .mockResolvedValueOnce(
        makeOffLoginResponse({ session: 'GLOBAL-ONE' }) as unknown as Response
      )
      .mockResolvedValueOnce(
        makeOffLoginResponse({ session: 'GLOBAL-TWO' }) as unknown as Response
      )
      .mockResolvedValueOnce(
        makeOffLoginResponse({ session: 'PERSONAL-TWO' }) as unknown as Response
      );

    await resolveOpenFoodFactsProvider(USER_ID, PROVIDER_ID, 'personal');
    await resolveOpenFoodFactsProvider(USER_ID, PROVIDER_ID, 'global');
    invalidateOpenFoodFactsSession(USER_ID, PROVIDER_ID, 'global');

    const global = await resolveOpenFoodFactsProvider(
      'user-B',
      PROVIDER_ID,
      'global'
    );
    const personal = await resolveOpenFoodFactsProvider(
      USER_ID,
      PROVIDER_ID,
      'personal'
    );

    expect(global.session).toBe('GLOBAL-TWO');
    expect(personal.session).toBe('PERSONAL-ONE');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('prevents a credential-invalidated in-flight login from repopulating or displacing the new session', async () => {
    const oldLogin = deferred<Response>();
    const newLogin = deferred<Response>();
    const getProviderDetails = vi.mocked(
      externalProviderService.getExternalDataProviderDetails
    );
    getProviderDetails
      .mockResolvedValueOnce(makeProviderDetails('old-user', 'old-password'))
      .mockResolvedValueOnce(makeProviderDetails('new-user', 'new-password'));
    vi.mocked(fetch)
      .mockImplementationOnce(() => oldLogin.promise)
      .mockImplementationOnce(() => newLogin.promise);

    const staleResolve = resolveOpenFoodFactsProvider(
      USER_ID,
      PROVIDER_ID,
      'personal'
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    invalidateOpenFoodFactsSession(USER_ID, PROVIDER_ID, 'personal');
    const freshResolve = resolveOpenFoodFactsProvider(
      USER_ID,
      PROVIDER_ID,
      'personal'
    );

    try {
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2), {
        timeout: 250,
      });

      oldLogin.resolve(
        makeOffLoginResponse({ session: 'STALE' }) as unknown as Response
      );
      await expect(staleResolve).resolves.toMatchObject({ session: 'STALE' });

      const coalescedFreshResolve = resolveOpenFoodFactsProvider(
        USER_ID,
        PROVIDER_ID,
        'personal'
      );
      await Promise.resolve();
      expect(fetch).toHaveBeenCalledTimes(2);

      newLogin.resolve(
        makeOffLoginResponse({ session: 'FRESH' }) as unknown as Response
      );
      await expect(freshResolve).resolves.toMatchObject({ session: 'FRESH' });
      await expect(coalescedFreshResolve).resolves.toMatchObject({
        session: 'FRESH',
      });

      const cached = await resolveOpenFoodFactsProvider(
        USER_ID,
        PROVIDER_ID,
        'personal'
      );
      expect(cached.session).toBe('FRESH');
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).toContain(
        'user_id=old-user'
      );
      expect(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).toContain(
        'password=old-password'
      );
      expect(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)).toContain(
        'user_id=new-user'
      );
      expect(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)).toContain(
        'password=new-password'
      );
    } finally {
      oldLogin.resolve(
        makeOffLoginResponse({ session: 'STALE' }) as unknown as Response
      );
      newLogin.resolve(
        makeOffLoginResponse({ session: 'FRESH' }) as unknown as Response
      );
      await Promise.allSettled([staleResolve, freshResolve]);
    }
  });
});

describe('normalizeBaseUrl', () => {
  it('returns the default public URL when no url is given', () => {
    expect(normalizeBaseUrl(undefined)).toBe(DEFAULT_OFF_BASE_URL);
    expect(normalizeBaseUrl(null)).toBe(DEFAULT_OFF_BASE_URL);
    expect(normalizeBaseUrl('')).toBe(DEFAULT_OFF_BASE_URL);
    expect(normalizeBaseUrl('   ')).toBe(DEFAULT_OFF_BASE_URL);
  });

  it('strips trailing slashes from a custom url', () => {
    expect(normalizeBaseUrl('http://sparkyfitness-foodfacts:8080/')).toBe(
      'http://sparkyfitness-foodfacts:8080'
    );
    expect(normalizeBaseUrl('http://sparkyfitness-foodfacts:8080///')).toBe(
      'http://sparkyfitness-foodfacts:8080'
    );
  });

  it('passes through a custom url with no trailing slash unchanged', () => {
    expect(normalizeBaseUrl('http://sparkyfitness-foodfacts:8080')).toBe(
      'http://sparkyfitness-foodfacts:8080'
    );
  });
});

describe('assertSecureOpenFoodFactsWriteBaseUrl', () => {
  it('accepts HTTPS contribution targets and rejects insecure targets', () => {
    expect(assertSecureOpenFoodFactsWriteBaseUrl(undefined)).toBe(
      DEFAULT_OFF_BASE_URL
    );
    expect(
      assertSecureOpenFoodFactsWriteBaseUrl('https://off.example.test///')
    ).toBe('https://off.example.test');
    expect(() =>
      assertSecureOpenFoodFactsWriteBaseUrl('http://off.example.test')
    ).toThrow(/HTTPS/);
    expect(() =>
      assertSecureOpenFoodFactsWriteBaseUrl(
        'https://user:pass@off.example.test'
      )
    ).toThrow(/embedded credentials/);
  });
});

describe('resolveOpenFoodFactsProvider', () => {
  it('discards provider details invalidated while a secure preload is in flight', async () => {
    const staleProviderLookup = deferred<ProviderDetails>();
    const getProviderDetails = vi.mocked(
      externalProviderService.getExternalDataProviderDetails
    );
    getProviderDetails
      .mockImplementationOnce(() => staleProviderLookup.promise)
      .mockResolvedValueOnce(makeProviderDetails('new-user', 'new-password'));
    vi.mocked(fetch).mockResolvedValue(
      makeOffLoginResponse({ session: 'NEW-SESSION' }) as unknown as Response
    );

    const resolution = resolveOpenFoodFactsProvider(
      USER_ID,
      PROVIDER_ID,
      'personal',
      true
    );
    await vi.waitFor(() => expect(getProviderDetails).toHaveBeenCalledOnce());

    invalidateOpenFoodFactsSession(USER_ID, PROVIDER_ID, 'personal');
    staleProviderLookup.resolve(
      makeProviderDetails('old-user', 'old-password')
    );

    await expect(resolution).resolves.toMatchObject({ session: 'NEW-SESSION' });
    expect(getProviderDetails).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).toContain('user_id=new-user');
    expect(String(init.body)).toContain('password=new-password');
    expect(String(init.body)).not.toContain('old-user');
    expect(String(init.body)).not.toContain('old-password');
  });

  it('does not reuse a cached write session for a changed provider configuration', async () => {
    const getProviderDetails = vi.mocked(
      externalProviderService.getExternalDataProviderDetails
    );
    getProviderDetails
      .mockResolvedValueOnce(makeProviderDetails('old-user', 'old-password'))
      .mockResolvedValueOnce(makeProviderDetails('new-user', 'new-password'));
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        makeOffLoginResponse({ session: 'OLD-SESSION' }) as unknown as Response
      )
      .mockResolvedValueOnce(
        makeOffLoginResponse({ session: 'NEW-SESSION' }) as unknown as Response
      );

    const oldConfiguration = await resolveOpenFoodFactsProvider(
      USER_ID,
      PROVIDER_ID,
      'personal',
      true
    );
    const newConfiguration = await resolveOpenFoodFactsProvider(
      USER_ID,
      PROVIDER_ID,
      'personal',
      true
    );

    expect(oldConfiguration.session).toBe('OLD-SESSION');
    expect(newConfiguration.session).toBe('NEW-SESSION');
    expect(newConfiguration.configurationIdentity).not.toBe(
      oldConfiguration.configurationIdentity
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects an insecure credential target before login for a contribution', async () => {
    // @ts-expect-error TS(2339): mocked service method
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'me',
      app_key: 'pw',
      base_url: 'http://off.example.test',
    });

    await expect(
      resolveOpenFoodFactsProvider(USER_ID, PROVIDER_ID, 'personal', true)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shares one cached session for a global account across users', async () => {
    // @ts-expect-error TS(2339): mocked repository method
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'global-user',
      app_key: 'global-password',
      is_public: true,
      is_active: true,
    });
    // @ts-expect-error TS(2339): mocked global fetch
    fetch.mockResolvedValue(makeOffLoginResponse({ session: 'GLOBAL' }));

    const first = await resolveOpenFoodFactsProvider(
      USER_ID,
      PROVIDER_ID,
      'global'
    );
    const second = await resolveOpenFoodFactsProvider(
      'user-B',
      PROVIDER_ID,
      'global'
    );

    expect(first.session).toBe('GLOBAL');
    expect(second.session).toBe('GLOBAL');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps personal provider sessions isolated between users', async () => {
    // @ts-expect-error TS(2339): mocked repository method
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'personal-user',
      app_key: 'personal-password',
      is_public: false,
      is_active: true,
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        makeOffLoginResponse({ session: 'USER-A' }) as unknown as Response
      )
      .mockResolvedValueOnce(
        makeOffLoginResponse({ session: 'USER-B' }) as unknown as Response
      );

    const first = await resolveOpenFoodFactsProvider(
      USER_ID,
      PROVIDER_ID,
      'personal'
    );
    const second = await resolveOpenFoodFactsProvider(
      'user-B',
      PROVIDER_ID,
      'personal'
    );

    expect(first.session).toBe('USER-A');
    expect(second.session).toBe('USER-B');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rechecks access before returning a session shared across users', async () => {
    type ProviderDetails = NonNullable<
      Awaited<
        ReturnType<
          typeof externalProviderService.getExternalDataProviderDetails
        >
      >
    >;
    const getProviderDetails = vi.mocked(
      externalProviderService.getExternalDataProviderDetails
    );
    getProviderDetails
      .mockResolvedValueOnce({
        provider_type: 'openfoodfacts',
        app_id: 'global-user',
        app_key: 'global-password',
        is_public: true,
        is_active: true,
      } as ProviderDetails)
      .mockRejectedValueOnce(new Error('Forbidden: not public'));
    // @ts-expect-error TS(2339): mocked global fetch
    fetch.mockResolvedValue(makeOffLoginResponse({ session: 'GLOBAL' }));

    const first = await resolveOpenFoodFactsProvider(
      USER_ID,
      PROVIDER_ID,
      'global'
    );
    const second = await resolveOpenFoodFactsProvider(
      'user-B',
      PROVIDER_ID,
      'global'
    );

    expect(first.session).toBe('GLOBAL');
    expect(second.session).toBeNull();
    expect(
      externalProviderService.getExternalDataProviderDetails
    ).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not send credentials to an insecure read-only provider', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'me',
      app_key: 'pw',
      base_url: 'http://sparkyfitness-foodfacts:8080/',
    });
    const result = await resolveOpenFoodFactsProvider(USER_ID, PROVIDER_ID);

    expect(result).toMatchObject({
      session: null,
      baseUrl: 'http://sparkyfitness-foodfacts:8080',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('resolves base_url even when the provider has no login credentials', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: null,
      app_key: null,
      base_url: 'http://sparkyfitness-foodfacts:8080',
    });

    const result = await resolveOpenFoodFactsProvider(USER_ID, PROVIDER_ID);

    expect(result).toMatchObject({
      session: null,
      baseUrl: 'http://sparkyfitness-foodfacts:8080',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to the default base_url when the provider has none set', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: null,
      app_key: null,
      base_url: null,
    });

    const result = await resolveOpenFoodFactsProvider(USER_ID, PROVIDER_ID);

    expect(result).toMatchObject({
      session: null,
      baseUrl: DEFAULT_OFF_BASE_URL,
    });
  });

  it('falls back to the default base_url when provider lookup fails', async () => {
    // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
    externalProviderService.getExternalDataProviderDetails.mockRejectedValue(
      new Error('Forbidden: not owner')
    );

    const result = await resolveOpenFoodFactsProvider(
      USER_ID,
      OTHER_PROVIDER_ID
    );

    expect(result).toMatchObject({
      session: null,
      baseUrl: DEFAULT_OFF_BASE_URL,
    });
  });
});
