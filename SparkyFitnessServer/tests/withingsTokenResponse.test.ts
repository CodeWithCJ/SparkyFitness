import { vi, beforeEach, describe, expect, it } from 'vitest';
import axios from 'axios';
import { getClient, getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { encrypt } from '../security/encryption.js';
import {
  exchangeCodeForTokens,
  refreshAccessToken,
} from '../integrations/withings/withingsService.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/diagnosticLogger.js', () => ({ logRawResponse: vi.fn() }));
vi.mock('../integrations/withings/withingsDataProcessor.js', () => ({
  default: {},
}));
vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../security/encryption.js', () => ({
  ENCRYPTION_KEY: 'test-key',
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

const USER_ID = 'user-1';

// A well-formed, unexpired state. The claim is mocked at the pg layer, so this
// only has to satisfy the grammar and TTL check in utils/oauthState.ts.
const validState = () => `${'a'.repeat(64)}.${Date.now()}`;

// The provider row both flows read before talking to Withings. Values are
// irrelevant because decrypt is stubbed; only the row's presence matters.
const PROVIDER_ROW = {
  id: 'provider-row-1',
  user_id: USER_ID,
  encrypted_app_id: 'a',
  app_id_iv: 'b',
  app_id_tag: 'c',
  encrypted_app_key: 'd',
  app_key_iv: 'e',
  app_key_tag: 'f',
  encrypted_refresh_token: 'g',
  refresh_token_iv: 'h',
  refresh_token_tag: 'i',
};

function mockClient() {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [PROVIDER_ROW], rowCount: 1 }),
    release: vi.fn(),
  };
  vi.mocked(getClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof getClient>>
  );
  vi.mocked(getSystemClient).mockResolvedValue(
    client as unknown as Awaited<ReturnType<typeof getSystemClient>>
  );
  return client;
}

beforeEach(async () => {
  vi.clearAllMocks();
  const { decrypt } = await import('../security/encryption.js');
  vi.mocked(decrypt).mockResolvedValue('decrypted-value');
  vi.mocked(encrypt).mockResolvedValue({
    encryptedText: 'enc',
    iv: 'iv',
    tag: 'tag',
  });
});

describe('Withings token response validation', () => {
  it('rejects a non-zero status even when a body is present', async () => {
    const client = mockClient();
    vi.mocked(axios.post).mockResolvedValue({
      data: { status: 342, error: 'Invalid params', body: {} },
    });

    await expect(refreshAccessToken(USER_ID)).rejects.toThrow(/342/);

    expect(encrypt).not.toHaveBeenCalled();
    // Only the initial SELECT ran; no UPDATE was issued.
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalled();
  });

  it('surfaces the Withings error text instead of a generic message', async () => {
    mockClient();
    vi.mocked(axios.post).mockResolvedValue({
      data: { status: 503, error: 'Invalid Params', body: {} },
    });

    await expect(refreshAccessToken(USER_ID)).rejects.toThrow(/Invalid Params/);
  });

  it('does not persist null tokens when the refresh body omits them', async () => {
    const client = mockClient();
    vi.mocked(axios.post).mockResolvedValue({
      data: { status: 0, body: { expires_in: 10800 } },
    });

    await expect(refreshAccessToken(USER_ID)).rejects.toThrow(
      /Missing access_token or refresh_token/
    );

    expect(encrypt).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('does not persist null tokens when the refresh body has only an access token', async () => {
    const client = mockClient();
    vi.mocked(axios.post).mockResolvedValue({
      data: { status: 0, body: { access_token: 'at', expires_in: 10800 } },
    });

    await expect(refreshAccessToken(USER_ID)).rejects.toThrow(
      /Missing access_token or refresh_token/
    );

    expect(encrypt).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('persists refreshed tokens on a successful response', async () => {
    const client = mockClient();
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        status: 0,
        body: {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 10800,
          scope: 'user.metrics',
        },
      },
    });

    await expect(refreshAccessToken(USER_ID)).resolves.toBe('new-access');

    expect(encrypt).toHaveBeenCalledTimes(2);
    // SELECT plus the UPDATE.
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query.mock.calls[1][0]).toMatch(/UPDATE/);
  });

  it('rejects a non-zero status during the authorization-code exchange', async () => {
    const client = mockClient();
    vi.mocked(axios.post).mockResolvedValue({
      data: { status: 304, error: 'Invalid code', body: {} },
    });

    await expect(
      exchangeCodeForTokens(
        validState(),
        'code',
        'https://app.test/withings/callback',
        USER_ID
      )
    ).rejects.toThrow(/304/);

    expect(encrypt).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('never writes token values to the log when rejecting a response', async () => {
    mockClient();
    // A refresh that returns an access_token but no refresh_token: the rejection
    // path must not echo the live token into the logging sink (CWE-532).
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        status: 0,
        body: { access_token: 'super-secret-access-token', expires_in: 10800 },
      },
    });

    await expect(refreshAccessToken(USER_ID)).rejects.toThrow(
      /Missing access_token or refresh_token/
    );

    const logged = vi
      .mocked(log)
      .mock.calls.map((call) => JSON.stringify(call))
      .join(' ');
    expect(logged).not.toContain('super-secret-access-token');
  });

  it('sends the token request as a form-encoded body', async () => {
    mockClient();
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        status: 0,
        body: {
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 10800,
          userid: 42,
        },
      },
    });

    await exchangeCodeForTokens(
      validState(),
      'auth-code',
      'https://app.test/withings/callback',
      USER_ID
    );

    const [url, body, config] = vi.mocked(axios.post).mock.calls[0];
    expect(url).toBe('https://wbsapi.withings.net/v2/oauth2');
    expect(body).toBeInstanceOf(URLSearchParams);
    expect((body as URLSearchParams).get('action')).toBe('requesttoken');
    expect((body as URLSearchParams).get('grant_type')).toBe(
      'authorization_code'
    );
    expect((body as URLSearchParams).get('code')).toBe('auth-code');
    expect((body as URLSearchParams).get('redirect_uri')).toBe(
      'https://app.test/withings/callback'
    );
    expect(config?.headers?.['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );
  });
});

describe('Withings OAuth state claim', () => {
  const okTokenResponse = {
    data: {
      status: 0,
      body: {
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
        scope: 'user.metrics',
        userid: 'other-withings-user',
      },
    },
  };

  it('derives the write target from the claimed row, not from any argument', async () => {
    const client = mockClient();
    vi.mocked(axios.post).mockResolvedValue(okTokenResponse);

    await exchangeCodeForTokens(
      validState(),
      'auth-code',
      'https://app.test/withings/callback',
      USER_ID
    );

    const claimSql = client.query.mock.calls[0][0] as string;
    expect(claimSql).toContain('SET oauth_state = NULL');
    expect(client.query.mock.calls[0][1][1]).toBe('withings');

    const [updateSql, updateValues] = client.query.mock.calls[1];
    // Keyed on the claimed row's primary key, never on a user id.
    expect(updateSql).toContain('WHERE id = $10');
    expect(updateSql).not.toContain('user_id = $10');
    expect(updateValues[9]).toBe('provider-row-1');
  });

  it('aborts a replayed state before contacting Withings', async () => {
    const client = mockClient();
    vi.mocked(axios.post).mockResolvedValue(okTokenResponse);
    const state = validState();

    await exchangeCodeForTokens(
      state,
      'auth-code',
      'https://app.test/withings/callback',
      USER_ID
    );
    expect(axios.post).toHaveBeenCalledTimes(1);

    // The second claim finds nothing: the first one already cleared the nonce.
    client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(
      exchangeCodeForTokens(
        state,
        'auth-code',
        'https://app.test/withings/callback',
        USER_ID
      )
    ).rejects.toMatchObject({ reason: 'unknown' });

    // No second token request was made for the replayed code.
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('never writes token material to the logs', async () => {
    mockClient();
    vi.mocked(encrypt).mockResolvedValue({
      encryptedText: 'ENC-ACCESS-SECRET',
      iv: 'IV-SECRET',
      tag: 'TAG-SECRET',
    });
    vi.mocked(axios.post).mockResolvedValue(okTokenResponse);

    await exchangeCodeForTokens(
      validState(),
      'auth-code',
      'https://app.test/withings/callback',
      USER_ID
    );

    const logged = vi
      .mocked(log)
      .mock.calls.flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join(' ');

    expect(logged).not.toContain('ENC-ACCESS-SECRET');
    expect(logged).not.toContain('IV-SECRET');
    expect(logged).not.toContain('TAG-SECRET');
  });
});
