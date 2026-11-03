import { vi, beforeEach, describe, expect, it } from 'vitest';
import oidcProviderRepository, {
  OidcDiscoveryError,
} from '../models/oidcProviderRepository.js';
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
  describe('upsertEnvOidcProvider', () => {
    it.each([false, true])(
      'preserves the original error and releases the client (rollback fails: %s)',
      async (rollbackFails) => {
        const originalError = new Error('provider save failed');
        mockClient.query.mockImplementation(async (sql: string) => {
          if (sql.includes('INSERT INTO')) throw originalError;
          if (sql === 'ROLLBACK' && rollbackFails) {
            throw new Error('rollback failed');
          }
          return { rows: [] };
        });
        vi.mocked(fetch).mockResolvedValue({
          ok: true,
          json: async () => ({ issuer: 'https://identity.example.test/' }),
        } as Response);

        await expect(
          oidcProviderRepository.upsertEnvOidcProvider({
            provider_id: 'test-provider',
            issuer_url: 'https://identity.example.test',
            client_id: 'client',
            client_secret: 'secret',
            domain: 'example.test',
            is_env_configured: true,
          })
        ).rejects.toBe(originalError);

        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalledExactlyOnceWith(
          rollbackFails
        );
      }
    );

    // Each case uses its own issuer so the discovery cache cannot answer it.
    it.each([
      [
        'a non-200 response',
        'https://unavailable.example.test/',
        () => ({ ok: false, status: 503 }) as Response,
      ],
      [
        'a network error',
        'https://unreachable.example.test/',
        () => {
          throw new TypeError('fetch failed');
        },
      ],
    ])(
      'does not save the provider when discovery fails with %s',
      async (_label, issuerUrl, respond) => {
        vi.mocked(fetch).mockImplementation(async () => respond());

        await expect(
          oidcProviderRepository.upsertEnvOidcProvider({
            provider_id: 'test-provider',
            issuer_url: issuerUrl,
            client_id: 'client',
            client_secret: 'secret',
            domain: 'example.test',
            is_env_configured: true,
          })
        ).rejects.toBeInstanceOf(OidcDiscoveryError);

        expect(getSystemClient).not.toHaveBeenCalled();
        expect(mockClient.query).not.toHaveBeenCalled();
      }
    );

    it('stores the issuer from the discovery document', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          issuer: 'https://auth.example.test/application/o/sparky/',
          jwks_uri: 'https://auth.example.test/jwks',
          token_endpoint: 'https://auth.example.test/token',
          authorization_endpoint: 'https://auth.example.test/authorize',
          userinfo_endpoint: 'https://auth.example.test/userinfo',
        }),
      } as Response);

      await oidcProviderRepository.upsertEnvOidcProvider({
        provider_id: 'test-provider',
        issuer_url: 'https://auth.example.test/application/o/sparky',
        client_id: 'client',
        client_secret: 'secret',
        domain: 'example.test',
        is_env_configured: true,
      });

      const insert = mockClient.query.mock.calls.find(([sql]: [string]) =>
        sql.includes('INSERT INTO')
      );
      expect(insert[1][1]).toBe(
        'https://auth.example.test/application/o/sparky/'
      );
      expect(insert[1][12]).toEqual(
        expect.objectContaining({
          issuer: 'https://auth.example.test/application/o/sparky/',
          tokenEndpoint: 'https://auth.example.test/token',
        })
      );
    });
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

    it.each([
      [undefined, 'existing-admins'],
      [null, null],
      ['', ''],
      ['new-admins', 'new-admins'],
    ])(
      'preserves update defaults for admin group %s',
      async (adminGroup, expected) => {
        mockClient.query.mockResolvedValueOnce({
          rows: [
            {
              id: 'row-id',
              provider_id: 'authentik',
              client_secret: 'old-secret',
              additional_config: JSON.stringify({
                admin_group: 'existing-admins',
              }),
            },
          ],
        });
        mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'row-id' }] });
        vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);

        await oidcProviderRepository.updateOidcProvider('authentik', {
          issuer_url: 'https://defaults.example.test',
          client_id: 'sparky',
          admin_group: adminGroup,
        });

        const parameters = mockClient.query.mock.calls[1][1];
        expect(JSON.parse(parameters[10]).admin_group).toBe(expected);
        expect(parameters[3]).toBe('old-secret');
        expect(parameters[11].clientSecret).toBe('old-secret');
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
