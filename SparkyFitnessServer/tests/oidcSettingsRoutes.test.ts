import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
// @ts-expect-error TS(7016): supertest does not provide type declarations here.
import request from 'supertest';
import oidcSettingsRoutes from '../routes/oidcSettingsRoutes.js';
import oidcProviderRepository from '../models/oidcProviderRepository.js';

vi.mock('../models/oidcProviderRepository.js', () => ({
  default: { updateOidcProvider: vi.fn() },
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  isAdmin: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));
vi.mock('../middleware/oidcLogoUpload.js', () => ({
  default: { single: () => vi.fn() },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/admin/oidc-settings', oidcSettingsRoutes);

const provider = {
  issuer_url: 'https://identity.example.test',
  client_id: 'sparky',
};

describe('PUT /admin/oidc-settings/:id', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ['missing issuer URL', { client_id: 'sparky' }],
    ['null issuer URL', { ...provider, issuer_url: null }],
    ['numeric issuer URL', { ...provider, issuer_url: 123 }],
    ['empty issuer URL', { ...provider, issuer_url: '' }],
    ['missing client ID', { issuer_url: provider.issuer_url }],
    ['numeric client ID', { ...provider, client_id: 123 }],
    ['empty client ID', { ...provider, client_id: '' }],
    ['invalid scope', { ...provider, scope: {} }],
    ['invalid client_secret', { ...provider, client_secret: 123 }],
    ['invalid provider_id', { ...provider, provider_id: 123 }],
    ['invalid domain', { ...provider, domain: 123 }],
    ['invalid display_name', { ...provider, display_name: 123 }],
    ['invalid logo_url', { ...provider, logo_url: 123 }],
    ['invalid auto_register', { ...provider, auto_register: 'false' }],
    ['invalid is_active', { ...provider, is_active: 'false' }],
    ['invalid redirect_uris', { ...provider, redirect_uris: [123] }],
    ['invalid response_types', { ...provider, response_types: [123] }],
    [
      'invalid token_endpoint_auth_method',
      { ...provider, token_endpoint_auth_method: 123 },
    ],
    ['invalid signing_algorithm', { ...provider, signing_algorithm: 123 }],
    [
      'invalid profile_signing_algorithm',
      { ...provider, profile_signing_algorithm: 123 },
    ],
    ['invalid timeout', { ...provider, timeout: '30000' }],
    ['invalid is_env_configured', { ...provider, is_env_configured: 'false' }],
    ['invalid admin_group', { ...provider, admin_group: 123 }],
  ])(
    'returns 400 for %s without updating the provider',
    async (_name, body) => {
      const response = await request(app)
        .put('/admin/oidc-settings/authentik')
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Invalid OIDC provider settings.',
      });
      expect(oidcProviderRepository.updateOidcProvider).not.toHaveBeenCalled();
    }
  );

  it('accepts a null scope returned by provider details', async () => {
    const settings = { ...provider, scope: null };
    const response = await request(app)
      .put('/admin/oidc-settings/authentik')
      .send(settings);

    expect(response.status).toBe(200);
    expect(oidcProviderRepository.updateOidcProvider).toHaveBeenCalledWith(
      'authentik',
      settings
    );
  });

  it('returns 404 when the provider does not exist', async () => {
    vi.mocked(oidcProviderRepository.updateOidcProvider).mockRejectedValue(
      new Error('OIDC provider not found')
    );

    const response = await request(app)
      .put('/admin/oidc-settings/missing')
      .send(provider);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'OIDC provider not found' });
  });

  it('retains 500 for unexpected failures', async () => {
    vi.mocked(oidcProviderRepository.updateOidcProvider).mockRejectedValue(
      new Error('Database unavailable')
    );

    const response = await request(app)
      .put('/admin/oidc-settings/authentik')
      .send(provider);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: 'Error updating OIDC provider: Database unavailable',
    });
  });

  it.each(['new-secret', null, ''])(
    'retains optional settings with client_secret %j',
    async (clientSecret) => {
      const settings = {
        ...provider,
        provider_id: 'authentik',
        domain: 'example.test',
        display_name: null,
        logo_url: null,
        auto_register: false,
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_post',
        signing_algorithm: 'RS256',
        profile_signing_algorithm: 'none',
        timeout: 30000,
        is_env_configured: false,
        scope: 'openid email profile',
        client_secret: clientSecret,
        admin_group: null,
        is_active: false,
        redirect_uris: ['https://sparky.example.test/callback'],
      };
      vi.mocked(oidcProviderRepository.updateOidcProvider).mockResolvedValue({
        id: 'provider-id',
      });

      const response = await request(app)
        .put('/admin/oidc-settings/authentik')
        .send({
          ...settings,
          id: 'provider-id',
          discoveryEndpoint:
            'https://identity.example.test/.well-known/openid-configuration',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'OIDC provider updated successfully',
      });
      expect(oidcProviderRepository.updateOidcProvider).toHaveBeenCalledWith(
        'authentik',
        settings
      );
    }
  );
});
