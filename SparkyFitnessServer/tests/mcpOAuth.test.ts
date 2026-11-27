import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
// @ts-expect-error TS7016: no types for supertest
import request from 'supertest';
import { makeSignature } from 'better-auth/crypto';
import {
  mcpOAuthAllowedRedirectUriSchema,
  parseMcpOAuthPathPrefixPattern,
} from '@workspace/shared';
import { createMcpOAuthAuthGate } from '../middleware/mcpOAuthAuthInterceptor.js';
import {
  classifyMcpOAuthMetadataPath,
  DEFAULT_MCP_OAUTH_ALLOWED_REDIRECT_URIS,
  createMcpOAuthAuthorizationRedirectValidator,
  getMcpOAuthAvailability,
  getMcpLoopbackJwksUrl,
  getMcpResourceMetadataUrl,
  getMcpResourceUrl,
  getOAuthIssuerUrl,
  getPublicOrigin,
  isMcpOAuthRedirectUriAllowed,
  shouldReturnMcpOAuthMetadataNotFound,
  verifyMcpOAuthQuery,
} from '../utils/mcpOAuth.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const disabledOAuthAuthApp = express();
disabledOAuthAuthApp.use(
  createMcpOAuthAuthGate({
    isAuthHandlerMounted: () => true,
    isOAuthEnabled: async () => false,
    isOAuthAvailable: () => true,
  })
);
disabledOAuthAuthApp.use((_req, res) =>
  res.status(418).json({ delegated: true })
);

describe('MCP OAuth URLs', () => {
  it('derives public resource and issuer URLs from the configured frontend', () => {
    vi.stubEnv('BETTER_AUTH_URL', '');
    vi.stubEnv('SPARKY_FITNESS_FRONTEND_URL', 'https://fitness.example/');

    expect(getPublicOrigin()).toBe('https://fitness.example');
    expect(getMcpResourceUrl()).toBe('https://fitness.example/mcp');
    expect(getOAuthIssuerUrl()).toBe('https://fitness.example/api/auth');
    expect(getMcpResourceMetadataUrl()).toBe(
      'https://fitness.example/.well-known/oauth-protected-resource/mcp'
    );
  });

  it('does not advertise a localhost fallback when no public URL is configured', () => {
    vi.stubEnv('BETTER_AUTH_URL', '');
    vi.stubEnv('SPARKY_FITNESS_FRONTEND_URL', '');

    expect(getMcpOAuthAvailability().available).toBe(false);
    expect(() => getPublicOrigin()).toThrow('Set BETTER_AUTH_URL');
  });

  it('rejects plain HTTP public addresses but permits loopback development', () => {
    vi.stubEnv('BETTER_AUTH_URL', 'http://192.168.1.50:3004');
    expect(getMcpOAuthAvailability().available).toBe(false);

    vi.stubEnv('BETTER_AUTH_URL', 'http://127.0.0.1:8080');
    expect(getMcpOAuthAvailability()).toEqual({
      available: true,
      reason: null,
    });
  });

  it('builds JWKS verification against the local server port', () => {
    vi.stubEnv('SPARKY_FITNESS_SERVER_PORT', '4310');
    expect(getMcpLoopbackJwksUrl()).toBe('http://127.0.0.1:4310/api/auth/jwks');
  });

  it('matches exact hosted callbacks and loopback callbacks on any port', () => {
    const allowed = [
      'https://claude.ai/api/mcp/auth_callback',
      'http://localhost:*',
    ];
    expect(
      isMcpOAuthRedirectUriAllowed(
        'https://claude.ai/api/mcp/auth_callback',
        allowed
      )
    ).toBe(true);
    expect(
      isMcpOAuthRedirectUriAllowed(
        'http://localhost:6274/oauth/callback',
        allowed
      )
    ).toBe(true);
    expect(
      isMcpOAuthRedirectUriAllowed('https://attacker.example/callback', allowed)
    ).toBe(false);
  });

  it('matches Gemini callbacks through HTTPS path-prefix patterns only', () => {
    const allowed = ['https://oauth-redirect.googleusercontent.com/r/*'];
    expect(
      isMcpOAuthRedirectUriAllowed(
        'https://oauth-redirect.googleusercontent.com/r/my-project',
        allowed
      )
    ).toBe(true);
    for (const uri of [
      'https://oauth-redirect.googleusercontent.com/r/',
      'https://oauth-redirect.googleusercontent.com/a/my-project',
      'https://oauth-redirect.googleusercontent.com/r/x#frag',
      'https://evil.example/r/my-project',
      'https://oauth-redirect.googleusercontent.com.evil.example/r/x',
      'http://oauth-redirect.googleusercontent.com/r/my-project',
      'https://user@oauth-redirect.googleusercontent.com/r/my-project',
      'https://oauth-redirect.googleusercontent.com:8443/r/my-project',
    ]) {
      expect(isMcpOAuthRedirectUriAllowed(uri, allowed)).toBe(false);
    }
  });

  it('ships every Google Gemini callback host in the default allowlist', () => {
    for (const host of [
      'oauth-redirect',
      'oauth-redirect-sandbox',
      'oauth-redirect-test',
    ]) {
      for (const path of ['r', 'a']) {
        expect(
          isMcpOAuthRedirectUriAllowed(
            `https://${host}.googleusercontent.com/${path}/my-project`,
            DEFAULT_MCP_OAUTH_ALLOWED_REDIRECT_URIS
          )
        ).toBe(true);
      }
    }
    expect(
      isMcpOAuthRedirectUriAllowed(
        'https://oauth-redirect-evil.googleusercontent.com/r/my-project',
        DEFAULT_MCP_OAUTH_ALLOWED_REDIRECT_URIS
      )
    ).toBe(false);
  });

  it('accepts only well-formed path-prefix patterns in the allowlist', () => {
    expect(
      parseMcpOAuthPathPrefixPattern(
        'https://oauth-redirect.googleusercontent.com/r/*'
      )
    ).toEqual({
      origin: 'https://oauth-redirect.googleusercontent.com',
      pathPrefix: '/r/',
    });
    for (const pattern of [
      'https://example.com/*',
      'https://example.com/r*',
      'https://*.example.com/r/*',
      'https://example.com/*/x/*',
      'http://example.com/r/*',
      'https://localhost/r/*',
      'https://127.0.0.2/r/*',
      'https://127.255.0.1/r/*',
      'https://Example.com/r/*',
      'https://example.com/a/../r/*',
      'https://example.com/r/?q=1/*',
    ]) {
      expect(parseMcpOAuthPathPrefixPattern(pattern)).toBeNull();
      expect(mcpOAuthAllowedRedirectUriSchema.safeParse(pattern).success).toBe(
        false
      );
    }
    expect(
      mcpOAuthAllowedRedirectUriSchema.safeParse(
        'https://oauth-redirect.googleusercontent.com/a/*'
      ).success
    ).toBe(true);
  });

  it('rechecks authorization redirects against the current administrator allowlist', async () => {
    const getAllowedRedirectUris = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValue([
        'https://claude.ai/api/mcp/auth_callback',
        'http://localhost:*',
      ]);
    const validateRedirectUri = createMcpOAuthAuthorizationRedirectValidator(
      getAllowedRedirectUris
    );

    await expect(
      validateRedirectUri(
        'https://claude.ai/api/mcp/auth_callback',
        ['https://claude.ai/api/mcp/auth_callback'],
        true
      )
    ).resolves.toBe(true);
    await expect(
      validateRedirectUri(
        'http://localhost:6274/oauth/callback',
        ['http://localhost:49152/oauth/callback'],
        true
      )
    ).resolves.toBe(true);
    await expect(
      validateRedirectUri(
        'https://removed.example/callback',
        ['https://removed.example/callback'],
        true
      )
    ).resolves.toBe(false);
    await expect(
      validateRedirectUri(
        'https://claude.ai/api/mcp/auth_callback',
        ['https://different.example/callback'],
        false
      )
    ).resolves.toBe(false);
    expect(getAllowedRedirectUris).toHaveBeenCalledTimes(3);
  });

  it.each([
    '/.well-known/oauth-authorization-server',
    '/mcp/.well-known/oauth-authorization-server',
  ])(
    'keeps disabled authorization discovery probe %s on the 404 path',
    (path) => {
      expect(classifyMcpOAuthMetadataPath(path)).toBe('authorization');
      expect(shouldReturnMcpOAuthMetadataNotFound(path, false, true)).toBe(
        true
      );
    }
  );

  it.each([
    '/.well-known/openid-configuration',
    '/mcp/.well-known/openid-configuration',
  ])('keeps unsupported OIDC discovery probe %s on the 404 path', (path) => {
    expect(classifyMcpOAuthMetadataPath(path)).toBe('unsupported-oidc');
    expect(shouldReturnMcpOAuthMetadataNotFound(path, false, true)).toBe(true);
  });

  it.each([
    '/api/auth/oauth2/register',
    '/api/auth/%6Fauth2/register',
    '/api/auth//oauth2/register',
    '/api/auth/admin/oauth2/create-client',
  ])('returns HTTP 404 for disabled OAuth auth path %s', async (path) => {
    const response = await request(disabledOAuthAuthApp).post(path).send({});

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });
});

describe('verifyMcpOAuthQuery', () => {
  it('accepts an unexpired canonical Better Auth signature', async () => {
    const secret = 'test-oauth-secret';
    const unsigned = new URLSearchParams([
      ['client_id', 'claude'],
      ['scope', 'sparky:mcp offline_access'],
      ['exp', String(Math.floor(Date.now() / 1000) + 60)],
    ]);
    unsigned.sort();
    const signature = await makeSignature(unsigned.toString(), secret);
    unsigned.append('sig', signature);

    await expect(
      verifyMcpOAuthQuery(unsigned.toString(), secret)
    ).resolves.toBe(true);
  });

  it('matches Better Auth ordering for repeated and non-ASCII values', async () => {
    const secret = 'test-oauth-secret';
    const entries = [
      ['scope', 'ä'],
      ['client_id', 'claude'],
      ['scope', 'z'],
      ['exp', String(Math.floor(Date.now() / 1000) + 60)],
    ] as Array<[string, string]>;
    entries.sort(([keyA, valueA], [keyB, valueB]) => {
      if (keyA < keyB) return -1;
      if (keyA > keyB) return 1;
      if (valueA < valueB) return -1;
      if (valueA > valueB) return 1;
      return 0;
    });
    const signed = new URLSearchParams(entries);
    signed.append('sig', await makeSignature(signed.toString(), secret));

    await expect(verifyMcpOAuthQuery(signed.toString(), secret)).resolves.toBe(
      true
    );
  });

  it('rejects tampered, expired, and duplicate signatures', async () => {
    const secret = 'test-oauth-secret';
    const expired = new URLSearchParams([
      ['client_id', 'claude'],
      ['exp', String(Math.floor(Date.now() / 1000) - 1)],
    ]);
    expired.sort();
    expired.append('sig', await makeSignature(expired.toString(), secret));
    await expect(verifyMcpOAuthQuery(expired.toString(), secret)).resolves.toBe(
      false
    );

    const valid = new URLSearchParams([
      ['client_id', 'claude'],
      ['exp', String(Math.floor(Date.now() / 1000) + 60)],
    ]);
    valid.sort();
    valid.append('sig', await makeSignature(valid.toString(), secret));
    valid.set('client_id', 'tampered');
    await expect(verifyMcpOAuthQuery(valid.toString(), secret)).resolves.toBe(
      false
    );

    valid.append('sig', 'duplicate');
    await expect(verifyMcpOAuthQuery(valid.toString(), secret)).resolves.toBe(
      false
    );
  });
});
