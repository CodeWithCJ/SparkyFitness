import { vi, afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getEnvOidcConfig,
  upsertEnvOidcProvider,
} from '../utils/oidcEnvConfig.js';
import { setAgreedSharedSettings } from '../utils/agreedSharedSettings.js';

const { repository, client } = vi.hoisted(() => ({
  repository: {
    getOidcProviderById: vi.fn(),
    updateOidcProvider: vi.fn(),
    createOidcProvider: vi.fn(),
    upsertEnvOidcProvider: vi.fn(),
    deleteOidcProvider: vi.fn(),
  },
  client: { query: vi.fn(), release: vi.fn() },
}));
vi.mock('../models/oidcProviderRepository.js', () => ({ default: repository }));
vi.mock('../db/poolManager.js', () => ({
  getSystemClient: async () => client,
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

describe('oidcEnvConfig', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear OIDC env vars to start fresh
    delete process.env.SPARKY_FITNESS_OIDC_ISSUER_URL;
    delete process.env.SPARKY_FITNESS_OIDC_CLIENT_ID;
    delete process.env.SPARKY_FITNESS_OIDC_CLIENT_SECRET;
    delete process.env.SPARKY_FITNESS_OIDC_PROVIDER_SLUG;
    delete process.env.SPARKY_FITNESS_OIDC_PROVIDER_NAME;
    delete process.env.SPARKY_FITNESS_OIDC_SCOPE;
    delete process.env.SPARKY_FITNESS_OIDC_AUTO_REGISTER;
    delete process.env.SPARKY_FITNESS_OIDC_LOGO_URL;
    delete process.env.SPARKY_FITNESS_OIDC_DOMAIN;
    delete process.env.SPARKY_FITNESS_OIDC_TOKEN_AUTH_METHOD;
    delete process.env.SPARKY_FITNESS_OIDC_ID_TOKEN_SIGNED_ALG;
    delete process.env.SPARKY_FITNESS_OIDC_USERINFO_SIGNED_ALG;
    delete process.env.SPARKY_FITNESS_OIDC_TIMEOUT;
  });
  afterAll(() => {
    process.env = originalEnv;
  });
  describe('upsertEnvOidcProvider', () => {
    beforeEach(() => {
      vi.resetAllMocks();
      repository.upsertEnvOidcProvider.mockResolvedValue([]);
      process.env.SPARKY_FITNESS_OIDC_AUTH_ENABLED = 'true';
      process.env.SPARKY_FITNESS_OIDC_ISSUER_URL =
        'https://identity.example.com';
      process.env.SPARKY_FITNESS_OIDC_CLIENT_ID = 'sparky';
      process.env.SPARKY_FITNESS_OIDC_CLIENT_SECRET = 'test-secret';
      process.env.SPARKY_FITNESS_OIDC_PROVIDER_SLUG = 'authentik';
      client.query.mockResolvedValue({ rows: [{ provider_id: 'obsolete' }] });
    });

    it.each([
      ['authentik', 'oidc-authentik'],
      ['oidc-authentik', 'authentik'],
    ])(
      'rejects alias-only match for %s before cleanup',
      async (slug, existingId) => {
        process.env.SPARKY_FITNESS_OIDC_PROVIDER_SLUG = slug;
        repository.getOidcProviderById.mockResolvedValue({
          provider_id: existingId,
        });

        await expect(upsertEnvOidcProvider()).rejects.toThrow(
          `Use the existing provider ID "${existingId}"`
        );

        expect(client.query).not.toHaveBeenCalled();
        expect(repository.deleteOidcProvider).not.toHaveBeenCalled();
        expect(repository.updateOidcProvider).not.toHaveBeenCalled();
        expect(repository.createOidcProvider).not.toHaveBeenCalled();
        expect(repository.upsertEnvOidcProvider).not.toHaveBeenCalled();
      }
    );

    it('reconciles an exact match through the environment upsert', async () => {
      repository.getOidcProviderById.mockResolvedValue({
        provider_id: 'authentik',
      });

      await upsertEnvOidcProvider();

      expect(repository.deleteOidcProvider).not.toHaveBeenCalled();
      expect(repository.upsertEnvOidcProvider).toHaveBeenCalledWith(
        expect.objectContaining({ provider_id: 'authentik' })
      );
      expect(repository.createOidcProvider).not.toHaveBeenCalled();
    });

    it('creates the configured provider when no match exists', async () => {
      repository.getOidcProviderById.mockResolvedValue(null);

      await upsertEnvOidcProvider();

      expect(repository.upsertEnvOidcProvider).toHaveBeenCalledWith(
        expect.objectContaining({ provider_id: 'authentik' })
      );
      expect(repository.updateOidcProvider).not.toHaveBeenCalled();
    });

    describe('with agreed shared settings', () => {
      afterAll(() => {
        setAgreedSharedSettings(null);
      });

      it('keeps the provider when everyone agreed OIDC is on', async () => {
        process.env.SPARKY_FITNESS_OIDC_AUTH_ENABLED = 'false';
        setAgreedSharedSettings({
          identity: { enable_email_password_login: null, is_oidc_active: true },
        });
        repository.getOidcProviderById.mockResolvedValue(null);

        await upsertEnvOidcProvider();

        expect(client.query).not.toHaveBeenCalled();
        expect(repository.upsertEnvOidcProvider).toHaveBeenCalled();
      });

      it('removes the provider when the agreed flag is unset', async () => {
        setAgreedSharedSettings({
          identity: { enable_email_password_login: null, is_oidc_active: null },
        });

        await upsertEnvOidcProvider();

        expect(client.query).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM "sso_provider"')
        );
        expect(repository.upsertEnvOidcProvider).not.toHaveBeenCalled();
      });
    });
  });

  describe('getEnvOidcConfig', () => {
    it('should return null if required env vars are missing', () => {
      process.env.SPARKY_FITNESS_OIDC_ISSUER_URL = 'http://issuer.com';
      // Missing others
      expect(getEnvOidcConfig()).toBeNull();
    });
    it('should return config with default scope if not provided', () => {
      process.env.SPARKY_FITNESS_OIDC_ISSUER_URL = 'http://issuer.com/';
      process.env.SPARKY_FITNESS_OIDC_CLIENT_ID = 'test-client';
      process.env.SPARKY_FITNESS_OIDC_CLIENT_SECRET = 'test-secret';
      process.env.SPARKY_FITNESS_OIDC_PROVIDER_SLUG = 'test-slug';
      const config = getEnvOidcConfig();
      expect(config).toEqual(
        expect.objectContaining({
          issuer_url: 'http://issuer.com',
          client_id: 'test-client',
          client_secret: 'test-secret',
          provider_id: 'test-slug',
          scope: 'openid email profile',
          is_env_configured: true,
        })
      );
    });
    it('should use SPARKY_FITNESS_OIDC_SCOPE if provided', () => {
      process.env.SPARKY_FITNESS_OIDC_ISSUER_URL = 'http://issuer.com';
      process.env.SPARKY_FITNESS_OIDC_CLIENT_ID = 'test-client';
      process.env.SPARKY_FITNESS_OIDC_CLIENT_SECRET = 'test-secret';
      process.env.SPARKY_FITNESS_OIDC_PROVIDER_SLUG = 'test-slug';
      process.env.SPARKY_FITNESS_OIDC_SCOPE = 'openid custom-scope';
      const config = getEnvOidcConfig();
      // @ts-expect-error TS(2531): Object is possibly 'null'.
      expect(config.scope).toBe('openid custom-scope');
    });
    it('should return config with all new fields if provided', () => {
      process.env.SPARKY_FITNESS_OIDC_ISSUER_URL = 'http://issuer.com';
      process.env.SPARKY_FITNESS_OIDC_CLIENT_ID = 'test-client';
      process.env.SPARKY_FITNESS_OIDC_CLIENT_SECRET = 'test-secret';
      process.env.SPARKY_FITNESS_OIDC_PROVIDER_SLUG = 'test-slug';
      process.env.SPARKY_FITNESS_OIDC_AUTO_REGISTER = 'false';
      process.env.SPARKY_FITNESS_OIDC_LOGO_URL = 'http://logo.com/img.png';
      process.env.SPARKY_FITNESS_OIDC_DOMAIN = 'custom.domain';
      process.env.SPARKY_FITNESS_OIDC_TOKEN_AUTH_METHOD = 'client_secret_basic';
      process.env.SPARKY_FITNESS_OIDC_ID_TOKEN_SIGNED_ALG = 'ES256';
      process.env.SPARKY_FITNESS_OIDC_USERINFO_SIGNED_ALG = 'RS256';
      process.env.SPARKY_FITNESS_OIDC_TIMEOUT = '45000';
      const config = getEnvOidcConfig();
      expect(config).toEqual(
        expect.objectContaining({
          auto_register: false,
          logo_url: 'http://logo.com/img.png',
          domain: 'custom.domain',
          token_endpoint_auth_method: 'client_secret_basic',
          signing_algorithm: 'ES256',
          profile_signing_algorithm: 'RS256',
          timeout: 45000,
        })
      );
    });
    it('should fallback to 30000 if SPARKY_FITNESS_OIDC_TIMEOUT is invalid (NaN)', () => {
      process.env.SPARKY_FITNESS_OIDC_ISSUER_URL = 'http://issuer.com';
      process.env.SPARKY_FITNESS_OIDC_CLIENT_ID = 'test-client';
      process.env.SPARKY_FITNESS_OIDC_CLIENT_SECRET = 'test-secret';
      process.env.SPARKY_FITNESS_OIDC_PROVIDER_SLUG = 'test-slug';
      process.env.SPARKY_FITNESS_OIDC_TIMEOUT = 'invalid-number';
      const config = getEnvOidcConfig();
      // @ts-expect-error TS(2531): Object is possibly 'null'.
      expect(config.timeout).toBe(30000);
    });
  });
});
