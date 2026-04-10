jest.mock('../services/externalProviderService');
jest.mock('../config/logging', () => ({ log: jest.fn() }));

const externalProviderService = require('../services/externalProviderService');
const {
  getOpenFoodFactsSessionCookie,
  invalidateOpenFoodFactsSession,
  __resetForTests,
} = require('../integrations/openfoodfacts/openFoodFactsAuth');

global.fetch = jest.fn();

const USER_ID = 'user-A';
const PROVIDER_ID = 'prov-1';
const OTHER_PROVIDER_ID = 'prov-2';

function makeOffLoginResponse({ session = 'abc123', body = '' } = {}) {
  return {
    headers: {
      getSetCookie: () => [
        `session=${session}; Path=/; HttpOnly`,
        'other=foo; Path=/',
      ],
    },
    text: jest.fn().mockResolvedValue(body),
  };
}

function makeOffLoginRejectedResponse() {
  return {
    headers: { getSetCookie: () => [] },
    text: jest.fn().mockResolvedValue(''),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetForTests();
});

describe('getOpenFoodFactsSessionCookie', () => {
  it('caches the session after a successful login', async () => {
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'me',
      app_key: 'pw',
    });
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
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'me',
      app_key: 'pw',
    });
    fetch.mockResolvedValue(makeOffLoginRejectedResponse());

    const result = await getOpenFoodFactsSessionCookie(USER_ID, PROVIDER_ID);

    expect(result).toBe(null);
  });

  it('returns null without throwing when ownership check rejects', async () => {
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
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'me',
      app_key: 'pw',
    });
    let resolveFetch;
    fetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const p1 = getOpenFoodFactsSessionCookie(USER_ID, PROVIDER_ID);
    const p2 = getOpenFoodFactsSessionCookie(USER_ID, PROVIDER_ID);

    resolveFetch(makeOffLoginResponse({ session: 'COALESCED' }));

    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe('COALESCED');
    expect(b).toBe('COALESCED');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('skips login when provider has no credentials', async () => {
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
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'me',
      app_key: 'wrong',
    });
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

describe('invalidateOpenFoodFactsSession', () => {
  it('drops a cached entry so the next call re-logs in', async () => {
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue({
      provider_type: 'openfoodfacts',
      app_id: 'me',
      app_key: 'pw',
    });
    fetch
      .mockResolvedValueOnce(makeOffLoginResponse({ session: 'one' }))
      .mockResolvedValueOnce(makeOffLoginResponse({ session: 'two' }));

    const a = await getOpenFoodFactsSessionCookie(USER_ID, PROVIDER_ID);
    invalidateOpenFoodFactsSession(USER_ID, PROVIDER_ID);
    const b = await getOpenFoodFactsSessionCookie(USER_ID, PROVIDER_ID);

    expect(a).toBe('one');
    expect(b).toBe('two');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
