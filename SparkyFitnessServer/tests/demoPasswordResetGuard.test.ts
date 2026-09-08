import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDemoPasswordResetToken } from '../middleware/demoGuardMiddleware.js';
import * as poolManager from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getSystemClient: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

/**
 * `/api/auth/reset-password` is the one recovery endpoint that never names the
 * account: Better Auth sends `{ newPassword, token }` and identifies the user
 * from a `verification` row keyed `reset-password:<token>`. The address-based
 * guard on the sibling endpoints is blind to it, so a reset token issued for
 * the demo account could change the shared demo credential.
 */
describe('demo password reset token guard', () => {
  const originalEnv = process.env;

  const mockClient = (rows: Array<{ email: string }>) => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows }),
      release: vi.fn(),
    };
    vi.mocked(poolManager.getSystemClient).mockResolvedValue(
      client as unknown as Awaited<
        ReturnType<typeof poolManager.getSystemClient>
      >
    );
    return client;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.SPARKY_FITNESS_DEMO_MODE = 'true';
    delete process.env.SPARKY_FITNESS_DEMO_EMAIL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('recognises a reset token that belongs to the demo account', async () => {
    const client = mockClient([{ email: 'demo@sparkyfitness.com' }]);

    await expect(isDemoPasswordResetToken('tok_abc')).resolves.toBe(true);

    expect(client.query).toHaveBeenCalledWith(expect.any(String), [
      'reset-password:tok_abc',
    ]);
    expect(client.release).toHaveBeenCalled();
  });

  it('leaves a real user on the demo instance able to reset their password', async () => {
    mockClient([{ email: 'someone@example.com' }]);

    await expect(isDemoPasswordResetToken('tok_abc')).resolves.toBe(false);
  });

  it('does not block a token no verification row matches', async () => {
    mockClient([]);

    await expect(isDemoPasswordResetToken('tok_unknown')).resolves.toBe(false);
  });

  it('blocks a lapsed demo token rather than judging expiry in SQL', async () => {
    const client = mockClient([{ email: 'demo@sparkyfitness.com' }]);

    await expect(isDemoPasswordResetToken('tok_abc')).resolves.toBe(true);

    // Expiry is Better Auth's call, made in JS. Repeating it as an SQL `now()`
    // comparison against a `timestamp without time zone` column resolves in the
    // database session timezone, which need not be the one the row was written
    // in; a live token reading as expired here would be a bypass.
    const [sql] = client.query.mock.calls[0] as [string];
    expect(sql).not.toContain('expires_at');
  });

  it('looks the token up under the reset-password identifier', async () => {
    const client = mockClient([]);

    await isDemoPasswordResetToken('tok_abc');

    const [sql, params] = client.query.mock.calls[0] as [string, string[]];
    // The identifier is parameterised, so the prefix lives in the bound value.
    expect(params).toEqual(['reset-password:tok_abc']);
    expect(sql).toContain('verification');
  });

  it('fails closed when the lookup throws', async () => {
    const client = {
      query: vi.fn().mockRejectedValue(new Error('connection refused')),
      release: vi.fn(),
    };
    vi.mocked(poolManager.getSystemClient).mockResolvedValue(
      client as unknown as Awaited<
        ReturnType<typeof poolManager.getSystemClient>
      >
    );

    // An unreadable row must never be read as "not the demo account".
    await expect(isDemoPasswordResetToken('tok_abc')).resolves.toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  it('fails closed when the pool cannot hand out a client', async () => {
    vi.mocked(poolManager.getSystemClient).mockRejectedValue(
      new Error('pool exhausted')
    );

    // Acquisition failure must be caught here, not thrown out of the guard.
    await expect(isDemoPasswordResetToken('tok_abc')).resolves.toBe(true);
  });

  it('honours a configured demo address', async () => {
    process.env.SPARKY_FITNESS_DEMO_EMAIL = 'sandbox@example.com';
    mockClient([{ email: 'Sandbox@Example.com' }]);

    await expect(isDemoPasswordResetToken('tok_abc')).resolves.toBe(true);
  });

  it('never touches the pool outside demo mode', async () => {
    process.env.SPARKY_FITNESS_DEMO_MODE = 'false';

    await expect(isDemoPasswordResetToken('tok_abc')).resolves.toBe(false);
    expect(poolManager.getSystemClient).not.toHaveBeenCalled();
  });

  it('ignores a missing or non-string token without querying', async () => {
    for (const token of [undefined, null, '', '   ', 123, ['a']]) {
      await expect(isDemoPasswordResetToken(token)).resolves.toBe(false);
    }
    expect(poolManager.getSystemClient).not.toHaveBeenCalled();
  });
});
