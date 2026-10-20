import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSignature } from 'better-auth/crypto';
import {
  getMcpResourceMetadataUrl,
  getMcpResourceUrl,
  getOAuthIssuerUrl,
  getPublicOrigin,
  verifyMcpOAuthQuery,
} from '../utils/mcpOAuth.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

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
