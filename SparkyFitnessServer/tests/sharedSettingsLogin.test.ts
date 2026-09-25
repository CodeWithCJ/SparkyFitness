import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emailLoginGuard } from '../middleware/emailLoginGuard.js';
import { setAgreedSharedSettings } from '../utils/agreedSharedSettings.js';

// Keep every Sparky plugin and option; only swap the database for memory, so
// plugin option merging runs exactly as it does in production.
vi.mock('better-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('better-auth')>();
  const { memoryAdapter } = await import('better-auth/adapters/memory');
  return {
    ...actual,
    betterAuth: (options: Parameters<typeof actual.betterAuth>[0]) =>
      actual.betterAuth({
        ...options,
        database: memoryAdapter({
          user: [],
          session: [],
          account: [],
          verification: [],
        }),
        logger: { disabled: true },
      }),
  };
});

const disabled = { enable_email_password_login: false, is_oidc_active: null };
const enabled = { enable_email_password_login: null, is_oidc_active: null };

/** Loads a fresh auth module and the agreed-settings copy it reads. */
async function loadAuth() {
  vi.resetModules();
  const { setAgreedSharedSettings: setForAuth } =
    await import('../utils/agreedSharedSettings.js');
  const { auth } = await import('../auth.js');
  return { auth, setForAuth };
}

/** Attempts a password sign-in for an account that does not exist. */
function signIn(auth: Awaited<ReturnType<typeof loadAuth>>['auth']) {
  return auth.api.signInEmail({
    body: { email: 'nobody@example.test', password: 'wrong-password-1' },
  });
}

describe('password login follows the agreed settings', () => {
  beforeEach(() => {
    vi.stubEnv('SPARKY_FITNESS_DEMO_MODE', 'false');
    vi.stubEnv('SPARKY_FITNESS_FRONTEND_URL', 'http://localhost:3000');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reaches Better Auth with every plugin loaded, without a restart', async () => {
    const { auth, setForAuth } = await loadAuth();
    const context = await auth.$context;

    setForAuth({ identity: disabled });
    expect(context.options.emailAndPassword?.enabled).toBe(false);

    setForAuth({ identity: enabled });
    expect(context.options.emailAndPassword?.enabled).toBe(true);
  });

  it('is refused by Better Auth itself even without the front guard', async () => {
    const { auth, setForAuth } = await loadAuth();

    setForAuth({ identity: disabled });
    await expect(signIn(auth)).rejects.toMatchObject({
      body: { code: 'EMAIL_PASSWORD_DISABLED' },
    });

    setForAuth({ identity: enabled });
    await expect(signIn(auth)).rejects.toMatchObject({
      body: { code: 'INVALID_EMAIL_OR_PASSWORD' },
    });
  });

  it('is refused by the front guard even without Better Auth', async () => {
    const app = express();
    app.use(emailLoginGuard);
    app.use((_req, res) => {
      res.sendStatus(204);
    });

    setAgreedSharedSettings({ identity: disabled });
    expect((await request(app).post('/api/auth/sign-in/email')).status).toBe(
      400
    );

    setAgreedSharedSettings({ identity: enabled });
    expect((await request(app).post('/api/auth/sign-in/email')).status).toBe(
      204
    );
  });

  it('keeps the demo login working on a demo server', async () => {
    vi.stubEnv('SPARKY_FITNESS_DEMO_MODE', 'true');
    const { auth, setForAuth } = await loadAuth();
    const context = await auth.$context;

    setForAuth({ identity: disabled });
    expect(context.options.emailAndPassword?.enabled).toBe(true);
  });
});
