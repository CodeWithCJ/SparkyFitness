import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

// Regression: under a sub-path deployment (SPARKY_BASE_PATH), redirecting to a
// hardcoded '/' on logout sends the user to the domain root instead of the
// app's own base path, which on a shared/multi-app host is a different app.
//
// Note on `window.location.href`: jsdom's `Location.href` is a spec
// `[Unforgeable]` accessor (non-configurable, cannot be mocked/replaced) and
// jsdom does not implement navigation, so the assigned value can't be read
// back in this test environment. Instead this verifies `getRouterBasename`
// (mocked) is what's used, which fails against the pre-fix hardcoded `'/'`
// and passes once the fix wires it through.

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockSignOut = jest.fn();
jest.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
    signOut: () => mockSignOut(),
  },
}));

jest.mock('@/api/Auth/auth', () => ({
  fetchIdentityUser: jest.fn(),
  switchUserContext: jest.fn(),
}));

jest.mock('@/api/api', () => ({
  apiCall: jest.fn(),
  clearDemoRestrictions: jest.fn(),
}));

const mockGetRouterBasename = jest.fn();
jest.mock('@/utils/basePath', () => ({
  getRouterBasename: (...args: unknown[]) => mockGetRouterBasename(...args),
}));

describe('useAuth signOut', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
    mockGetRouterBasename.mockReturnValue('/sparky');
    // jsdom logs a "Not implemented: navigation" console error whenever
    // window.location.href is assigned; expected noise here, not a failure.
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };

  it('redirects via the base-path-aware router basename', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockGetRouterBasename).toHaveBeenCalled();
  });
});
