import { readFileSync } from 'node:fs';
import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import { emailLoginGuard } from '../middleware/emailLoginGuard.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isEmailLoginDisabled } from '../utils/emailLogin.js';
import { log } from '../config/logging.js';

const getGlobalSettings = vi.hoisted(() => vi.fn());
vi.mock('../models/globalSettingsRepository.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../models/globalSettingsRepository.js')
    >();
  return { ...actual, default: { ...actual.default, getGlobalSettings } };
});
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

vi.mock('better-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('better-auth')>();
  const { memoryAdapter } = await import('better-auth/adapters/memory');
  return {
    ...actual,
    betterAuth: (options: Parameters<typeof actual.betterAuth>[0]) =>
      actual.betterAuth({
        baseURL: 'http://localhost:3000',
        secret: process.env.BETTER_AUTH_SECRET,
        database: memoryAdapter({
          user: [],
          session: [],
          account: [],
          verification: [],
        }),
        emailAndPassword: options.emailAndPassword,
        databaseHooks: options.databaseHooks,
        logger: { disabled: true },
      }),
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function setLoginEnv(force: string | undefined, disable: string | undefined) {
  vi.stubEnv('SPARKY_FITNESS_FORCE_EMAIL_LOGIN', force);
  vi.stubEnv('SPARKY_FITNESS_DISABLE_EMAIL_LOGIN', disable);
  vi.stubEnv('SPARKY_FITNESS_DEMO_MODE', 'false');
  vi.stubEnv('SPARKY_FITNESS_FRONTEND_URL', 'http://localhost:3000');
}
async function loadAuth() {
  vi.resetModules();
  return (await import('../auth.js')).auth;
}

describe('email login environment precedence', () => {
  it.each([
    [undefined, undefined, false],
    ['false', 'false', false],
    ['false', 'true', true],
    ['true', 'false', false],
    ['true', 'true', false],
    ['TRUE', 'true', true],
  ])('FORCE=%s DISABLE=%s: disabled=%s', (force, disable, disabled) => {
    setLoginEnv(force, disable);
    expect(isEmailLoginDisabled()).toBe(disabled);
  });
  it.each([
    ['false', 'true', false],
    ['true', 'true', true],
    [undefined, undefined, true],
  ])(
    'configures the backend for FORCE=%s DISABLE=%s',
    async (force, disable, enabled) => {
      setLoginEnv(force, disable);
      const auth = await loadAuth();
      expect(auth.options.emailAndPassword?.enabled).toBe(enabled);
    }
  );
  it('keeps demo credentials enabled while public email login is disabled', async () => {
    setLoginEnv('false', 'true');
    vi.stubEnv('SPARKY_FITNESS_DEMO_MODE', 'true');
    const auth = await loadAuth();
    expect(auth.options.emailAndPassword?.enabled).toBe(true);
    expect(isEmailLoginDisabled()).toBe(true);
  });
  it('does not let FORCE bypass the separate signup restriction', async () => {
    setLoginEnv('true', 'true');
    vi.stubEnv('SPARKY_FITNESS_DISABLE_SIGNUP', 'true');
    const auth = await loadAuth();
    await expect(
      auth.api.signUpEmail({
        body: {
          email: 'new@example.test',
          password: 'test-password-123',
          name: 'New user',
        },
      })
    ).rejects.toMatchObject({
      body: { message: 'Signups are currently disabled by the administrator.' },
    });
  });
  // The server boots on import, so check its middleware order without starting it.
  it('mounts the public guard before forwarding requests to Better Auth', () => {
    const source = readFileSync(
      new URL('../SparkyFitnessServer.ts', import.meta.url),
      'utf8'
    );
    const guardAt = source.indexOf('app.use(emailLoginGuard)');
    const forwardingAt = source.indexOf(
      'return betterAuthHandlerInstance(req, res)'
    );
    expect(guardAt).toBeGreaterThan(-1);
    expect(forwardingAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(forwardingAt);
  });

  describe('public password routes', () => {
    const app = express();
    app.use(emailLoginGuard);
    app.use((_req, res) => {
      res.sendStatus(204);
    });
    const passwordLogin = (enabled: boolean) =>
      getGlobalSettings.mockResolvedValue({
        enable_email_password_login: enabled,
      });

    it.each([
      '/api/auth/sign-in/email',
      '/api/auth/sign-up/email',
      '/api/auth/sign-in/email/',
      '/api/auth/sign-up/email/',
      '/api/auth/sign-in/email?redirectTo=/diary',
      '/api/auth/sign-in/email/extra',
    ])('blocks %s when password login is disabled', async (path) => {
      setLoginEnv(undefined, undefined);
      passwordLogin(false);
      const response = await request(app).post(path);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Email and password is not enabled',
        code: 'EMAIL_PASSWORD_DISABLED',
      });
    });

    it('allows password login when it is enabled', async () => {
      setLoginEnv(undefined, undefined);
      passwordLogin(true);
      expect((await request(app).post('/api/auth/sign-in/email')).status).toBe(
        204
      );
    });

    it.each([
      ['false', 'true', 400],
      ['true', 'true', 204],
      [undefined, undefined, 204],
    ])(
      'falls back to the environment (FORCE=%s DISABLE=%s) when settings cannot be read',
      async (force, disable, status) => {
        setLoginEnv(force, disable);
        getGlobalSettings.mockRejectedValue(new Error('database away'));
        expect(
          (await request(app).post('/api/auth/sign-in/email')).status
        ).toBe(status);
        expect(log).toHaveBeenCalledWith(
          'error',
          expect.stringContaining('Could not read login settings'),
          expect.any(Error)
        );
      }
    );

    it.each([
      '/api/auth/demo-login',
      '/api/auth/settings',
      '/api/auth/sign-in/sso',
      '/api/auth/sign-in/email-otp',
      '/api/foods',
    ])('leaves %s to its own handler', async (path) => {
      setLoginEnv('false', 'true');
      vi.stubEnv('SPARKY_FITNESS_DEMO_MODE', 'true');
      passwordLogin(false);
      expect((await request(app).post(path)).status).toBe(204);
      expect(getGlobalSettings).not.toHaveBeenCalled();
    });

    it('does not let demo mode open public password login', async () => {
      vi.stubEnv('SPARKY_FITNESS_DEMO_MODE', 'true');
      passwordLogin(false);
      expect((await request(app).post('/api/auth/sign-in/email')).status).toBe(
        400
      );
    });
  });
});
