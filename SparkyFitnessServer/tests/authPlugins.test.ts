import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

// Other auth tests replace Better Auth with a reduced config, so this one loads
// the real plugin list.
describe('auth plugins', () => {
  it('serves magic link sign-in but no email OTP routes', async () => {
    vi.stubEnv('SPARKY_FITNESS_FRONTEND_URL', 'http://localhost:3000');
    const { auth } = await import('../auth.js');
    expect(auth.api).toHaveProperty('signInMagicLink');
    // The email OTP routes had no admin switch, so the plugin must not come back unnoticed.
    expect(
      Object.keys(auth.api).filter((name) =>
        /EmailOTP|VerificationOTP/.test(name)
      )
    ).toEqual([]);
    vi.unstubAllEnvs();
  });
});
