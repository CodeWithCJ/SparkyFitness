import { vi, beforeEach, describe, expect, it } from 'vitest';
import oidcProviderRepository from '../models/oidcProviderRepository.js';
import { getSystemClient } from '../db/poolManager.js';
// Mock dependencies
vi.mock('../db/poolManager', () => ({
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));
// Prevent Better Auth from initialising a real DB connection when
// createOidcProvider/updateOidcProvider call `import('../auth.js')`
vi.mock('../auth.js', () => ({
  syncTrustedProviders: vi.fn().mockResolvedValue(undefined),
  default: {
    auth: {},
    syncTrustedProviders: vi.fn().mockResolvedValue(undefined),
  },
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
    it.each([
      ['authentik', 'oidc-authentik'],
      ['oidc-authentik', 'authentik'],
      ['00000000-0000-4000-8000-000000000001', 'oidc-authentik'],
    ])(
      'updates the resolved provider for lookup %s',
      async (lookupId, providerId) => {
        const rowId = '00000000-0000-4000-8000-000000000001';
        mockClient.query.mockResolvedValueOnce({
          rows: [
            { id: rowId, provider_id: providerId, client_secret: 'old-secret' },
          ],
        });
        mockClient.query.mockResolvedValueOnce({ rows: [{ id: rowId }] });
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: async () => ({}),
        } as Response);

        await oidcProviderRepository.updateOidcProvider(lookupId, {
          issuer_url: 'https://identity.example.com',
          client_id: 'sparky',
        });

        const parameters = mockClient.query.mock.calls[1][1];
        expect(parameters[13]).toBe(rowId);
        expect(parameters[12]).toBe(providerId);
        expect(
          parameters[11].redirectURI.endsWith(`/sso/callback/${providerId}`)
        ).toBe(true);
        expect(parameters[3]).toBe('old-secret');
      }
    );

    it('retains an explicitly supplied replacement provider ID', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'row-id',
            provider_id: 'old-provider',
            client_secret: 'old-secret',
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'row-id' }] });
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      await oidcProviderRepository.updateOidcProvider('old-provider', {
        issuer_url: 'https://identity.example.com',
        client_id: 'sparky',
        provider_id: 'replacement-provider',
      });

      const parameters = mockClient.query.mock.calls[1][1];
      expect(parameters[13]).toBe('row-id');
      expect(parameters[12]).toBe('replacement-provider');
      expect(parameters[11].redirectURI).toContain(
        '/sso/callback/replacement-provider'
      );
    });

    it('rejects a missing provider without issuing an update', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        oidcProviderRepository.updateOidcProvider('missing', {
          issuer_url: 'https://identity.example.com',
          client_id: 'sparky',
          client_secret: 'new-secret',
        })
      ).rejects.toThrow('OIDC provider not found');

      expect(mockClient.query).toHaveBeenCalledTimes(1);
      expect(mockClient.release).toHaveBeenCalledTimes(2);
    });

    it('should update is_env_configured in additional_config', async () => {
      const providerId = 'test-id';
      const providerData = {
        issuer_url: 'http://issuer.com',
        client_id: 'client-id',
        display_name: 'Updated Provider',
        is_env_configured: true,
      };
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'test-row-id',
            provider_id: providerId,
            client_secret: 'old-secret',
          },
        ],
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
