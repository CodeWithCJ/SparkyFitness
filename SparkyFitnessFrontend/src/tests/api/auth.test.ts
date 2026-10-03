// Regression coverage for the SPARKY_BASE_PATH sub-path deployment fixes in
// src/api/Auth/auth.ts. Under a sub-path deployment (e.g. served at
// `/sparky/`), redirect/callback URLs built from a bare `window.location.origin`
// or a hardcoded root-relative path point at the domain root instead of the
// app's own base path.

const mockMagicLink = jest.fn();
const mockRequestPasswordReset = jest.fn();
const mockSso = jest.fn();

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: {
      magicLink: (...args: unknown[]) => mockMagicLink(...args),
      sso: (...args: unknown[]) => mockSso(...args),
    },
    requestPasswordReset: (...args: unknown[]) =>
      mockRequestPasswordReset(...args),
  },
}));

const mockGetRouterBasename = jest.fn();
const mockWithBasePath = jest.fn();
const mockGetBasePath = jest.fn(() => '');

jest.mock('@/utils/basePath', () => ({
  getBasePath: () => mockGetBasePath(),
  getRouterBasename: (...args: unknown[]) => mockGetRouterBasename(...args),
  withBasePath: (...args: unknown[]) => mockWithBasePath(...args),
}));

import {
  requestMagicLink,
  requestPasswordReset,
  initiateOidcLogin,
} from '@/api/Auth/auth';

describe('Auth API sub-path awareness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRouterBasename.mockReturnValue('/sparky');
    mockWithBasePath.mockImplementation((path: string) => `/sparky${path}`);
    mockMagicLink.mockResolvedValue({ error: null });
    mockRequestPasswordReset.mockResolvedValue({ error: null });
    mockSso.mockResolvedValue({ error: null });
  });

  describe('requestMagicLink', () => {
    it('builds a base-path-aware callback URL', async () => {
      await requestMagicLink('user@example.com');

      expect(mockMagicLink).toHaveBeenCalledWith({
        email: 'user@example.com',
        callbackURL: `${window.location.origin}/sparky`,
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('builds a base-path-prefixed redirect URL', async () => {
      await requestPasswordReset('user@example.com');

      expect(mockWithBasePath).toHaveBeenCalledWith('/reset-password');
      expect(mockRequestPasswordReset).toHaveBeenCalledWith({
        email: 'user@example.com',
        redirectTo: `${window.location.origin}/sparky/reset-password`,
      });
    });
  });

  describe('initiateOidcLogin', () => {
    it('builds base-path-aware callback and error callback URLs', async () => {
      await initiateOidcLogin({ providerId: 'google' });

      expect(mockSso).toHaveBeenCalledWith({
        providerId: 'google',
        callbackURL: `${window.location.origin}/sparky`,
        errorCallbackURL: `${window.location.origin}/sparky`,
        requestSignUp: false,
      });
    });
  });
});
