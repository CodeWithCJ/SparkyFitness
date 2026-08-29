/**
 * Stub for every `better-auth` entry point, wired in through `moduleNameMapper`.
 *
 * The package is ESM-only and jest transforms nothing under `node_modules`, so
 * any suite that transitively reaches `src/lib/auth-client.ts` — which now
 * includes anything importing the chat thread, since the food-photo tool card
 * pulls in PreferencesContext — dies with "Cannot use import statement outside
 * a module" before a single test runs.
 *
 * No unit test exercises the real auth client; suites that need session state
 * mock `useAuth` directly. So the whole family maps here.
 */
const noop = () => ({});

/** Any property access returns a callable, so `authClient.<anything>()` works. */
export const createAuthClient = () =>
  new Proxy({}, { get: () => noop }) as Record<string, unknown>;

export const magicLinkClient = noop;
export const twoFactorClient = noop;
export const adminClient = noop;
export const emailOTPClient = noop;
export const apiKeyClient = noop;
export const ssoClient = noop;
export const passkeyClient = noop;

export default {};
