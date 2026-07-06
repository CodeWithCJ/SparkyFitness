jest.mock('better-auth/react', () => ({
  createAuthClient: () => ({}),
}));

jest.mock('better-auth/client/plugins', () => ({
  magicLinkClient: () => ({}),
  twoFactorClient: () => ({}),
  adminClient: () => ({}),
  emailOTPClient: () => ({}),
}));

jest.mock('@better-auth/api-key/client', () => ({
  apiKeyClient: () => ({}),
}));

jest.mock('@better-auth/sso/client', () => ({
  ssoClient: () => ({}),
}));

jest.mock('@better-auth/passkey/client', () => ({
  passkeyClient: () => ({}),
}));

import { getAuthBaseUrl } from '@/lib/auth-client';

describe('getAuthBaseUrl', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('points at /api/auth on the current origin at root', () => {
    document.head.innerHTML = '<base href="/">';
    expect(getAuthBaseUrl()).toBe('http://localhost/api/auth');
  });

  it('is prefixed with the sub-path when deployed at /sparky/', () => {
    document.head.innerHTML = '<base href="/sparky/">';
    expect(getAuthBaseUrl()).toBe('http://localhost/sparky/api/auth');
  });
});
