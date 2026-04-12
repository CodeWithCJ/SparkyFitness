import { beforeEach, describe, expect, it, vi } from 'vitest';
import externalProviderService from '../services/externalProviderService.js';
import {
  getOpenFoodFactsSessionCookie,
  invalidateOpenFoodFactsSession,
  __resetForTests,
} from '../integrations/openfoodfacts/openFoodFactsAuth.js';

vi.mock('../services/externalProviderService.js');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

global.fetch = vi.fn();

const USER_ID = 'user-A';
const PROVIDER_ID = 'prov-1';
const OTHER_PROVIDER_ID = 'prov-2';

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

beforeEach(() => {
  vi.clearAllMocks();
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
});
