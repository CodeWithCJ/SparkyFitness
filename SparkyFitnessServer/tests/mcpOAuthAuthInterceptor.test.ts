import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS7016: no types for supertest
import request from 'supertest';
import {
  getCanonicalRequestPath,
  hasCanonicalRequestPath,
  interceptMcpOAuthAuthRequest,
} from '../middleware/mcpOAuthAuthInterceptor.js';

const getSessionUserId = vi.fn<() => Promise<string | null>>();
const revokeAuthorization =
  vi.fn<(userId: string, consentId: string) => Promise<boolean>>();
const getAllowedRedirectUris = vi.fn<() => Promise<string[]>>();

const app = express();
app.use(express.json());
app.use(async (req, res, next) => {
  const handled = await interceptMcpOAuthAuthRequest(req, res, {
    getSessionUserId,
    revokeAuthorization,
    getAllowedRedirectUris,
  });
  if (!handled) next();
});
app.use((_req, res) => res.status(418).json({ delegated: true }));

beforeEach(() => {
  getSessionUserId.mockReset().mockResolvedValue(null);
  revokeAuthorization.mockReset().mockResolvedValue(false);
  getAllowedRedirectUris
    .mockReset()
    .mockResolvedValue([
      'https://claude.ai/api/mcp/auth_callback',
      'https://claude.com/api/mcp/auth_callback',
      'http://localhost:*',
    ]);
});

describe('MCP OAuth Better Auth interceptor', () => {
  it('canonicalizes encoded dot segments the same way as Better Auth', () => {
    const originalUrl = '/api/auth/%2e/oauth2/register?source=untrusted-client';

    expect(getCanonicalRequestPath({ originalUrl })).toBe(
      '/api/auth/oauth2/register'
    );
    expect(
      hasCanonicalRequestPath({
        originalUrl,
        path: '/api/auth/%2e/oauth2/register',
      })
    ).toBe(false);
    expect(
      hasCanonicalRequestPath({
        originalUrl: '/api/auth/oauth2/register?source=trusted-client',
        path: '/api/auth/oauth2/register',
      })
    ).toBe(true);
    expect(
      getCanonicalRequestPath({
        originalUrl: '/api/auth//oauth2/register',
      })
    ).toBe('/api/auth/oauth2/register');
    expect(
      getCanonicalRequestPath({
        originalUrl: '/api/auth/%6Fauth2/register',
      })
    ).toBe('/api/auth/oauth2/register');
  });

  it('rejects back-channel logout metadata through an encoded dot-segment path', async () => {
    const response = await request(app)
      .post('/api/auth/%2e/oauth2/register')
      .send({
        backchannel_logout_uri: 'https://rebind.example/logout',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_client_metadata');
  });

  it('rejects back-channel logout metadata in unauthenticated registration', async () => {
    const response = await request(app)
      .post('/api/auth/oauth2/register')
      .send({
        client_name: 'Untrusted client',
        redirect_uris: ['https://client.example/callback'],
        backchannel_logout_uri: 'https://rebind.example/logout',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'invalid_client_metadata',
      error_description:
        'backchannel_logout_uri is not supported for dynamic client registration',
    });
    expect(revokeAuthorization).not.toHaveBeenCalled();
  });

  it('rejects back-channel logout metadata in authenticated registration too', async () => {
    getSessionUserId.mockResolvedValue('user-1');

    const response = await request(app)
      .post('/api/auth/oauth2/register')
      .send({ backchannel_logout_uri: 'https://client.example/logout' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_client_metadata');
    expect(getSessionUserId).not.toHaveBeenCalled();
  });

  it('accepts allowlisted registration redirects and loopback ports', async () => {
    const claudeResponse = await request(app)
      .post('/api/auth/oauth2/register')
      .send({
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      });
    const loopbackResponse = await request(app)
      .post('/api/auth/oauth2/register')
      .send({ redirect_uris: ['http://localhost:49152/callback'] });

    expect(claudeResponse.status).toBe(418);
    expect(loopbackResponse.status).toBe(418);
  });

  it('rejects registration redirects outside the administrator allowlist', async () => {
    const response = await request(app)
      .post('/api/auth/oauth2/register')
      .send({ redirect_uris: ['https://attacker.example/callback'] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_redirect_uri');
  });

  it('fails closed when registration uses an unparsed JSON media type', async () => {
    const response = await request(app)
      .post('/api/auth/oauth2/register')
      .set('Content-Type', 'application/vnd.api+json')
      .send(
        JSON.stringify({
          redirect_uris: ['https://attacker.example/callback'],
        })
      );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_client_metadata');
    expect(getAllowedRedirectUris).not.toHaveBeenCalled();
  });

  it('delegates authorization requests to the provider redirect validator', async () => {
    const getResponse = await request(app).get(
      '/api/auth/oauth2/authorize?client_id=client-1&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback'
    );
    const postResponse = await request(app)
      .post('/api/auth/oauth2/authorize')
      .type('form')
      .send({
        client_id: 'client-1',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      });

    expect(getResponse.status).toBe(418);
    expect(postResponse.status).toBe(418);
    expect(getAllowedRedirectUris).not.toHaveBeenCalled();
  });

  it('revokes consent through the repository and preserves the empty 200 response', async () => {
    getSessionUserId.mockResolvedValue('user-1');
    revokeAuthorization.mockResolvedValue(true);
    const consentId = '11111111-1111-4111-8111-111111111111';

    const response = await request(app)
      .post('/api/auth/oauth2/delete-consent')
      .send({ id: consentId });

    expect(response.status).toBe(200);
    expect(response.text).toBe('');
    expect(response.headers['content-type']).toContain('application/json');
    expect(revokeAuthorization).toHaveBeenCalledWith('user-1', consentId);
  });

  it('leaves unauthenticated and invalid consent deletion to Better Auth', async () => {
    const unauthenticated = await request(app)
      .post('/api/auth/oauth2/delete-consent')
      .send({ id: '11111111-1111-4111-8111-111111111111' });
    const invalid = await request(app)
      .post('/api/auth/oauth2/delete-consent')
      .send({ id: 'not-a-uuid' });

    expect(unauthenticated.status).toBe(418);
    expect(invalid.status).toBe(418);
    expect(revokeAuthorization).not.toHaveBeenCalled();
  });

  it('leaves unknown or non-owned consent deletion to Better Auth', async () => {
    getSessionUserId.mockResolvedValue('user-1');

    const response = await request(app)
      .post('/api/auth/oauth2/delete-consent')
      .send({ id: '11111111-1111-4111-8111-111111111111' });

    expect(response.status).toBe(418);
    expect(revokeAuthorization).toHaveBeenCalledOnce();
  });
});
