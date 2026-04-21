import { vi, beforeEach, describe, expect, it } from 'vitest';
import oidcProviderRepository from '../models/oidcProviderRepository.js';
import { getSystemClient } from '../db/poolManager.js';
// Mock dependencies
vi.mock('../auth.js', () => ({
  syncTrustedProviders: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../db/poolManager', () => ({
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));
global.fetch = vi.fn();
describe('oidcProviderRepository', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    getSystemClient.mockResolvedValue(mockClient);
    vi.clearAllMocks();
  });
  describe('createOidcProvider', () => {
    it('should persist is_env_configured in additional_config', async () => {
      const providerData = {
        issuer_url: 'http://issuer.com',
        client_id: 'client-id',
        client_secret: 'client-secret',
        display_name: 'Test Provider',
        is_env_configured: true,
        auto_register: true,
      };
      mockClient.query.mockResolvedValue({ rows: [{ id: 'new-id' }] });
      // Mock fetch for discovery document
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          authorization_endpoint: 'http://auth.com',
          token_endpoint: 'http://token.com',
          userinfo_endpoint: 'http://user.com',
          jwks_uri: 'http://jwks.com',
          issuer: 'http://issuer.com',
        }),
      });
      await oidcProviderRepository.createOidcProvider(providerData);
      // Check the second call to query (the INSERT into sso_provider)
      const insertCall = mockClient.query.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any) =>
          typeof call[0] === 'string' &&
          call[0].includes('INSERT INTO "sso_provider"')
      );
      expect(insertCall).toBeDefined();
      const configJson = JSON.parse(insertCall[1][11]);
      expect(configJson.is_env_configured).toBe(true);
    });
  });
  describe('updateOidcProvider', () => {
    it('should update is_env_configured in additional_config', async () => {
      const providerId = 'test-id';
      const providerData = {
        issuer_url: 'http://issuer.com',
        client_id: 'client-id',
        display_name: 'Updated Provider',
        is_env_configured: true,
      };
      mockClient.query.mockResolvedValueOnce({
        rows: [{ client_secret: 'old-secret' }],
      }); // for getOidcProviderById inside update
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // for update
      // Mock fetch for discovery document
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          authorization_endpoint: 'http://auth.com',
          token_endpoint: 'http://token.com',
          userinfo_endpoint: 'http://user.com',
          jwks_uri: 'http://jwks.com',
          issuer: 'http://issuer.com',
        }),
      });
      await oidcProviderRepository.updateOidcProvider(providerId, providerData);
      const updateCall = mockClient.query.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any) =>
          typeof call[0] === 'string' &&
          call[0].includes('UPDATE "sso_provider"')
      );
      expect(updateCall).toBeDefined();
      const configJson = JSON.parse(updateCall[1][10]);
      expect(configJson.is_env_configured).toBe(true);
    });
  });
});
