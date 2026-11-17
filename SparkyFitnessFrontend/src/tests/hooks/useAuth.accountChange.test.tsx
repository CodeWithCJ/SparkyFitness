import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { fetchIdentityUser } from '@/api/Auth/auth';
import { apiCall } from '@/api/api';

let sessionState: { data: unknown; isPending: boolean } = {
  data: null,
  isPending: false,
};

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => sessionState,
    signOut: jest.fn(),
    getSession: jest.fn(),
  },
}));
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
jest.mock('@/api/Auth/auth', () => ({
  fetchIdentityUser: jest.fn(),
  switchUserContext: jest.fn(),
}));
jest.mock('@/api/api', () => ({
  apiCall: jest.fn().mockResolvedValue({}),
  clearDemoRestrictions: jest.fn(),
}));

const mockFetchIdentityUser = jest.mocked(fetchIdentityUser);
const mockApiCall = jest.mocked(apiCall);

// A query whose key, like most in the app, doesn't name the account.
const CACHED_KEY = ['dashboardLayouts', 'web-tabs'];

const sessionFor = (id: string, twoFactorEnabled = false) => ({
  data: {
    user: {
      id,
      email: `${id}@example.com`,
      name: id,
      role: 'user',
      activeUserId: id,
      twoFactorEnabled,
      mfaEmailEnabled: false,
    },
  },
  isPending: false,
});

const renderProvider = () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(CACHED_KEY, ['labs']);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  const rendered = renderHook(() => useAuth(), { wrapper });
  return { ...rendered, queryClient };
};

describe('AuthProvider query cache across accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiCall.mockResolvedValue({});
    sessionState = { data: null, isPending: false };
    mockFetchIdentityUser.mockImplementation(() => new Promise(() => {}));
  });

  it("drops the previous account's cached data when another account's session arrives", async () => {
    sessionState = sessionFor('a');
    const { result, rerender, queryClient } = renderProvider();
    await waitFor(() => expect(result.current.user?.id).toBe('a'));
    expect(queryClient.getQueryData(CACHED_KEY)).toEqual(['labs']);

    // Signed in as someone else in another browser tab: the session moves
    // straight to the new account, with no sign-out on this page.
    sessionState = sessionFor('b');
    rerender();

    await waitFor(() => expect(result.current.user?.id).toBe('b'));
    expect(queryClient.getQueryData(CACHED_KEY)).toBeUndefined();
  });

  it("keeps the cache when the same account's session is refreshed", async () => {
    sessionState = sessionFor('a');
    const { result, rerender, queryClient } = renderProvider();
    await waitFor(() => expect(result.current.user?.id).toBe('a'));

    sessionState = sessionFor('a', true);
    rerender();

    await waitFor(() =>
      expect(result.current.user?.twoFactorEnabled).toBe(true)
    );
    expect(queryClient.getQueryData(CACHED_KEY)).toEqual(['labs']);
  });

  it("keeps the cache for the page's first account", async () => {
    const { result, rerender, queryClient } = renderProvider();

    sessionState = sessionFor('a');
    rerender();

    await waitFor(() => expect(result.current.user?.id).toBe('a'));
    expect(queryClient.getQueryData(CACHED_KEY)).toEqual(['labs']);
  });

  it('drops the cached data when a sign-in lands over a different account', () => {
    const { result, queryClient } = renderProvider();

    act(() => {
      result.current.signIn('a', 'a', 'a@example.com', 'user', false);
    });
    expect(queryClient.getQueryData(CACHED_KEY)).toEqual(['labs']);

    act(() => {
      result.current.signIn('a', 'a', 'a@example.com', 'user', false);
    });
    expect(queryClient.getQueryData(CACHED_KEY)).toEqual(['labs']);

    act(() => {
      result.current.signIn('b', 'b', 'b@example.com', 'user', false);
    });
    expect(result.current.user?.id).toBe('b');
    expect(queryClient.getQueryData(CACHED_KEY)).toBeUndefined();
  });
});
