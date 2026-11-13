import { readFileSync } from 'node:fs';
import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { magicLinkLoginGuard } from '../middleware/magicLinkLoginGuard.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import { log } from '../config/logging.js';

vi.mock('../auth.js', () => {
  const auth = { api: { getSession: vi.fn() }, options: {} };
  return {
    default: { auth },
    auth,
    cleanupSessions: vi.fn(),
    syncTrustedProviders: vi.fn(),
  };
});
vi.mock('../utils/bearerAuthBridge.js', () => ({
  bridgeBearerAuthHeader: vi.fn().mockResolvedValue({ apiKeyToken: null }),
}));
vi.mock('../models/globalSettingsRepository.js', () => ({
  default: { getGlobalSettings: vi.fn() },
}));
vi.mock('../models/oidcProviderRepository.js', () => ({
  default: { getOidcProviders: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const getGlobalSettings = vi.mocked(globalSettingsRepository.getGlobalSettings);
const magicLinkLogin = (enabled: boolean) =>
  getGlobalSettings.mockResolvedValue({
    enable_email_password_login: true,
    is_oidc_active: false,
    enable_passkey_login: true,
    enable_magic_link_login: enabled,
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('magic link login guard', () => {
  const app = express();
  app.use(magicLinkLoginGuard);
  app.use((_req, res) => {
    res.sendStatus(204);
  });

  it.each([
    ['post', '/api/auth/sign-in/magic-link'],
    ['get', '/api/auth/magic-link/verify'],
    ['get', '/api/auth/magic-link/verify/'],
  ] as const)(
    'blocks %s %s when magic link login is disabled',
    async (method, path) => {
      magicLinkLogin(false);
      const response = await request(app)[method](path);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Magic link login is not enabled',
        code: 'MAGIC_LINK_LOGIN_DISABLED',
      });
    }
  );

  it.each([
    ['post', '/api/auth/sign-in/email'],
    ['post', '/api/auth/passkey/verify-authentication'],
  ] as const)(
    'leaves %s %s alone while magic link login is disabled',
    async (method, path) => {
      magicLinkLogin(false);
      expect((await request(app)[method](path)).status).toBe(204);
      expect(getGlobalSettings).not.toHaveBeenCalled();
    }
  );

  it('allows magic link sign-in when it is enabled', async () => {
    magicLinkLogin(true);
    expect(
      (await request(app).post('/api/auth/sign-in/magic-link')).status
    ).toBe(204);
  });

  it.each([
    [undefined, 'true', 400],
    [undefined, undefined, 204],
    ['true', 'true', 204],
  ])(
    'falls back to the environment (FORCE=%s DISABLE=%s) when settings cannot be read',
    async (force, disable, status) => {
      vi.stubEnv('SPARKY_FITNESS_FORCE_MAGIC_LINK_LOGIN', force);
      vi.stubEnv('SPARKY_FITNESS_DISABLE_MAGIC_LINK_LOGIN', disable);
      getGlobalSettings.mockRejectedValue(new Error('database away'));
      expect(
        (await request(app).post('/api/auth/sign-in/magic-link')).status
      ).toBe(status);
      expect(log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Could not read login settings'),
        expect.any(Error)
      );
    }
  );
});

describe('login settings', () => {
  const app = express();
  beforeAll(async () => {
    const { default: router } =
      await import('../routes/auth/authCoreRoutes.js');
    app.use('/api/auth', router);
  });

  it.each([true, false])(
    'reports magic_link.enabled=%s from the effective setting',
    async (enabled) => {
      magicLinkLogin(enabled);
      const response = await request(app).get('/api/auth/settings');
      expect(response.status).toBe(200);
      expect(response.body.magic_link).toEqual({ enabled });
    }
  );

  it('falls back to the environment when the saved settings cannot be read', async () => {
    vi.stubEnv('SPARKY_FITNESS_DISABLE_MAGIC_LINK_LOGIN', 'true');
    getGlobalSettings.mockRejectedValue(new Error('database away'));
    const response = await request(app).get('/api/auth/settings');
    expect(response.body.magic_link).toEqual({ enabled: false });
  });
});

// The server boots on import, so check its middleware order without starting it.
it('mounts the magic link guard before forwarding requests to Better Auth', () => {
  const source = readFileSync(
    new URL('../SparkyFitnessServer.ts', import.meta.url),
    'utf8'
  );
  const guardAt = source.indexOf('app.use(magicLinkLoginGuard)');
  const forwardingAt = source.indexOf(
    'return betterAuthHandlerInstance(req, res)'
  );
  expect(guardAt).toBeGreaterThan(-1);
  expect(guardAt).toBeLessThan(forwardingAt);
});
