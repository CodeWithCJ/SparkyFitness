import { act, renderHook, waitFor } from '@testing-library/react';
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
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ clear: jest.fn() }),
}));
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

const renderProvider = () =>
  renderHook(() => useAuth(), { wrapper: AuthProvider });

describe('AuthProvider demo status resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiCall.mockResolvedValue({});
    sessionState = { data: null, isPending: false };
    mockFetchIdentityUser.mockResolvedValue({
      activeUserId: 'u1',
      activeUserEmail: 'real@example.com',
      activeUserFullName: 'Real User',
      fullName: 'Real User',
      isDemo: false,
    });
  });

  // The manual signIn writes the same id with both MFA flags false, so for an
  // account without 2FA the session that follows matches what is already in
  // state and the sync effect skips its identity fetch. isDemo has to be
  // resolved anyway, or every feature gated on it stays dark until a reload.
  it('resolves isDemo after a manual sign-in the session sync does not re-fetch', async () => {
    const { result, rerender } = renderProvider();

    act(() => {
      result.current.signIn(
        'u1',
        'u1',
        'real@example.com',
        'user',
        false,
        'Real User'
      );
    });

    sessionState = {
      data: {
        user: {
          id: 'u1',
          email: 'real@example.com',
          name: 'Real User',
          role: 'user',
          activeUserId: 'u1',
          twoFactorEnabled: false,
          mfaEmailEnabled: false,
        },
      },
      isPending: false,
    };
    rerender();

    await waitFor(() => expect(result.current.user?.isDemo).toBe(false));
    expect(mockFetchIdentityUser).toHaveBeenCalled();
  });

  it('treats a failed identity lookup as a regular account', async () => {
    mockFetchIdentityUser.mockRejectedValue(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderProvider();
    act(() => {
      result.current.signIn('u1', 'u1', 'real@example.com', 'user', false);
    });

    await waitFor(() => expect(result.current.user?.isDemo).toBe(false));
  });

  it('marks the demo sandbox so gated features can skip their requests', async () => {
    mockFetchIdentityUser.mockResolvedValue({
      activeUserId: 'demo',
      activeUserEmail: 'demo@sparkyfitness.com',
      activeUserFullName: 'Demo',
      fullName: 'Demo',
      isDemo: true,
    });

    const { result } = renderProvider();
    act(() => {
      result.current.signIn(
        'demo',
        'demo',
        'demo@sparkyfitness.com',
        'user',
        false
      );
    });

    await waitFor(() => expect(result.current.user?.isDemo).toBe(true));
  });
});

describe('AuthProvider session cleanup probe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    sessionState = { data: null, isPending: false };
    mockFetchIdentityUser.mockResolvedValue({
      activeUserId: 'u1',
      activeUserEmail: 'a@example.com',
      activeUserFullName: 'A',
      fullName: 'A',
      isDemo: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // The probe confirms a vanished session is a real logout rather than a
  // gateway swallowing the session fetch. It can outlive the account it was
  // asking about, and logging out whoever signed in meanwhile is worse than
  // leaving a stale user on screen for one more tick.
  it('does not log out an account that signed in while the probe was in flight', async () => {
    let finishProbe: (() => void) | undefined;
    mockApiCall.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishProbe = () => resolve({});
        })
    );

    const { result } = renderProvider();

    act(() => {
      result.current.signIn('a', 'a', 'a@example.com', 'user', false);
    });
    expect(result.current.user?.id).toBe('a');

    // Past the manual sign-in grace window, so the cleanup effect runs.
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    await act(async () => {
      result.current.signIn('a', 'a', 'a@example.com', 'user', false);
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => expect(finishProbe).toBeDefined());

    // A different account arrives before the probe answers.
    act(() => {
      result.current.signIn('b', 'b', 'b@example.com', 'user', false);
    });

    await act(async () => {
      finishProbe!();
    });

    expect(result.current.user?.id).toBe('b');
  });
});
