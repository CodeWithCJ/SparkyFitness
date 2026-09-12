import React, {
  createContext,
  useContext,
  type ReactNode,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '../lib/auth-client';
import { fetchIdentityUser, switchUserContext } from '@/api/Auth/auth';
import { apiCall, clearDemoRestrictions } from '@/api/api';

export interface User {
  id: string;
  activeUserId: string;
  email: string;
  fullName: string | null;
  role: string;
  twoFactorEnabled: boolean;
  mfaEmailEnabled: boolean;
  /**
   * True when the authenticated account is the demo sandbox. Features the demo
   * guard blocks server-side should check this and skip the request entirely
   * rather than firing it and handling the 403.
   */
  isDemo?: boolean;
}

interface ExtendedSessionUser {
  id: string;
  email: string;
  name: string | null;
  activeUserId?: string;
  role?: string;
  twoFactorEnabled?: boolean;
  mfaEmailEnabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signIn: (
    userId: string,
    activeUserId: string,
    userEmail: string,
    userRole: string,
    navigateOnSuccess?: boolean,
    userFullName?: string
  ) => void;
  refreshUser: () => Promise<void>;
  switchContext: (targetUserId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(true); // Track initial hydration
  const navigate = useNavigate();
  const prevSessionRef = React.useRef<typeof session>(null);
  // Account id the authoritative identity lookup has already been fired for,
  // so the backstop effect below cannot duplicate the request the sync effect
  // is already making.
  const identityLookupRef = React.useRef<string | null>(null);
  // The live user and manual-sign-in timestamp, readable from an async callback
  // that would otherwise close over whatever they were when it started.
  const currentUserRef = React.useRef<User | null>(null);
  const lastManualSignInRef = React.useRef(0);

  // Only show global loading during initial hydration (isSyncing).
  // Ignoring sessionLoading avoids unmounting components (like Auth/MFA) during background re-fetches.
  const isLoading = isSyncing;

  const [lastManualSignIn, setLastManualSignIn] = useState<number>(0);

  // 1. Sync Effect: Updates User state when Session changes or invalidates
  useEffect(() => {
    // Log when session changes to identify refresh triggers
    if (session !== prevSessionRef.current) {
      prevSessionRef.current = session;
    }

    const extUser = session?.user as unknown as ExtendedSessionUser | undefined;
    if (
      extUser &&
      (!user ||
        user.id !== extUser.id ||
        user.twoFactorEnabled !== !!extUser.twoFactorEnabled ||
        user.mfaEmailEnabled !== !!extUser.mfaEmailEnabled)
    ) {
      const sessionUser: User = {
        id: extUser.id,
        activeUserId: extUser.activeUserId || extUser.id,
        email: extUser.email,
        fullName: extUser.name || null,
        role: extUser.role || 'user',
        twoFactorEnabled: !!extUser.twoFactorEnabled,
        mfaEmailEnabled: !!extUser.mfaEmailEnabled,
        // Carried over rather than reset: this rebuild is about session fields,
        // and dropping a resolved isDemo would re-disable the features gated on
        // it for as long as the lookup below takes.
        isDemo: user?.id === extUser.id ? user.isDemo : undefined,
      };

      //console.log('[Auth Hook] Setting user state from session:', sessionUser.id);
      // Endpoint refusals are per-account, and not every sign-in route goes
      // through this hook's signIn (passkey and OIDC just let the session
      // appear). Drop them whenever the effective account actually changes, so
      // a regular user can never inherit the demo sandbox's cached "no".
      if (user?.id !== extUser.id) {
        clearDemoRestrictions();
      }
      setUser(sessionUser);

      // Fetch Authoritative Data (Active Context)
      // This runs on every session update to ensure we are strictly in sync with the backend.
      // Pinned to the account it was issued for: a lookup can settle after the
      // session has moved on, and answering for the wrong account is worse than
      // not answering at all.
      const identityUserId = extUser.id;
      identityLookupRef.current = identityUserId;
      fetchIdentityUser()
        .then((realUserData) => {
          setUser((prev) => {
            if (!prev || prev.id !== identityUserId) return prev;
            if (
              prev.activeUserId === realUserData.activeUserId &&
              prev.fullName === realUserData.fullName &&
              prev.isDemo === !!realUserData.isDemo
            ) {
              return prev; // No change
            }
            return {
              ...prev,
              isDemo: !!realUserData.isDemo,
              activeUserId: realUserData.activeUserId,
              fullName:
                realUserData.activeUserFullName ||
                realUserData.activeUserEmail ||
                null,
              email: realUserData.activeUserEmail,
            };
          });
        })
        .catch((err) => {
          console.error(
            '[Auth Hook] Failed to fetch authoritative user data:',
            err
          );
          // Fail open on isDemo. Features gate on `isDemo === false`, so
          // leaving it undefined after a failed lookup would silently disable
          // them for a perfectly ordinary user. The server-side demo guard is
          // the real enforcement; this flag only saves a doomed request.
          setUser((prev) =>
            prev && prev.id === identityUserId && prev.isDemo === undefined
              ? { ...prev, isDemo: false }
              : prev
          );
        });

      setIsSyncing(false);
    } else if (session?.user && user && user.id === session.user.id) {
      // Same user - just update 2FA status if changed
      setIsSyncing(false);
    }
  }, [session, user]);

  // 1b. Identity Backstop: the sync effect above only fetches the authoritative
  // identity when the session's user id or MFA flags actually change. A manual
  // signIn has already written the same id with both MFA flags false, so for an
  // account without 2FA the session arrives matching and that fetch never runs,
  // leaving isDemo unresolved for the whole page life. Features gate on
  // `isDemo === false`, so they would stay silently disabled for an ordinary
  // user until the next reload. Resolve it here for any user still missing it.
  useEffect(() => {
    if (!user || user.isDemo !== undefined) return;
    if (identityLookupRef.current === user.id) return;
    identityLookupRef.current = user.id;

    const userId = user.id;
    const settle = (isDemo: boolean) =>
      setUser((prev) =>
        prev && prev.id === userId && prev.isDemo === undefined
          ? { ...prev, isDemo }
          : prev
      );

    fetchIdentityUser()
      .then((realUserData) => settle(!!realUserData.isDemo))
      .catch((err) => {
        console.error(
          '[Auth Hook] Failed to resolve demo status; assuming a regular account:',
          err
        );
        // Fail open, for the same reason the sync effect does: the server-side
        // demo guard is the real enforcement, this flag only saves a request.
        settle(false);
      });
  }, [user]);

  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

  // 2. Cleanup Effect: Handles Logout / Session expiry
  useEffect(() => {
    if (!session && !sessionLoading) {
      const now = Date.now();
      const isSticky = now - lastManualSignIn < 2000;

      if (user !== null && !isSticky) {
        // The account this probe is asking about. A sign-in can complete while
        // it is still in flight, and logging out the account that just arrived
        // because the previous one turned out to be gone is worse than leaving
        // a stale user on screen for one more session tick.
        const probedUserId = user.id;
        // Better Auth's own session fetch bypasses apiCall, so an upstream
        // auth gateway (e.g. Cloudflare Access) intercepting that request can
        // resolve session to null without SparkyFitness ever seeing it. Before
        // treating this as a real logout, confirm with a same-origin probe
        // through apiCall, which knows how to recognize gateway interception
        // (see isGatewayInterceptedResponse in src/api/api.ts) and will
        // trigger a re-auth reload itself rather than resolving here.
        apiCall('/ping')
          .then(() => {
            if (
              currentUserRef.current?.id !== probedUserId ||
              Date.now() - lastManualSignInRef.current < 2000
            ) {
              console.log(
                '[Auth Hook] Session probe finished after the account changed; leaving the current user alone.'
              );
              return;
            }
            console.log('[Auth Hook] No session found, clearing user state.');
            setUser(null);
            identityLookupRef.current = null;
            clearDemoRestrictions();
            queryClient.clear();
          })
          .catch((err) => {
            console.error(
              '[Auth Hook] Session probe failed; not clearing user state to avoid a false logout.',
              err
            );
          });
      }
      setIsSyncing(false);
    }
  }, [session, sessionLoading, user, lastManualSignIn, queryClient]);

  const refreshUser = useCallback(async () => {
    setIsSyncing(true); // Re-trigger syncing state during manual refresh
    try {
      // Force invalidate the session to ensure fresh data
      await authClient.getSession();
    } catch (error) {
      console.error('[Auth Hook] Error refreshing session:', error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await authClient.signOut();
      if (error) {
        console.error('[Auth Hook] SignOut API error:', error);
      }
    } catch (err) {
      console.error('[Auth Hook] SignOut unexpected error:', err);
    }
    setUser(null);
    identityLookupRef.current = null;
    clearDemoRestrictions();
    queryClient.clear();
    window.location.href = '/';
  }, [queryClient]);

  const signIn = useCallback(
    (
      userId: string,
      activeUserId: string,
      userEmail: string,
      userRole: string,
      navigateOnSuccess = true,
      userFullName?: string
    ) => {
      console.log('[Auth Hook] Manual signIn triggered.');
      // Endpoint restrictions are per-account; the next session may well be
      // allowed everything this one was refused.
      clearDemoRestrictions();
      // Force a fresh identity lookup: this may be a different account than the
      // one the previous lookup answered for.
      identityLookupRef.current = null;
      lastManualSignInRef.current = Date.now();
      setLastManualSignIn(Date.now());
      setUser({
        id: userId,
        activeUserId: activeUserId || userId,
        email: userEmail,
        role: userRole,
        fullName: userFullName || null,
        twoFactorEnabled: false, // Default for manual sign-in, will be refreshed by session
        mfaEmailEnabled: false,
      });
      if (navigateOnSuccess) {
        navigate('/');
      }
    },
    [navigate]
  );

  const switchContext = useCallback(
    async (targetUserId: string) => {
      try {
        await switchUserContext(targetUserId);
        queryClient.clear();

        // Pull the authoritative active-user identity for the new context.
        // The session sync effect only refreshes name/email when the logged-in
        // id changes, so switching back to self (same id) would otherwise leave
        // the previously-active profile's name/email on screen.
        const realUserData = await fetchIdentityUser();
        setUser((prev) =>
          prev
            ? {
                ...prev,
                activeUserId: realUserData.activeUserId || targetUserId,
                fullName:
                  realUserData.activeUserFullName ||
                  realUserData.activeUserEmail ||
                  null,
                email: realUserData.activeUserEmail ?? prev.email,
              }
            : prev
        );

        await refreshUser();
      } catch (error) {
        console.error(error);
        throw error;
      }
    },
    [refreshUser, queryClient]
  );

  const value = useMemo(
    () => ({
      user,
      loading: isLoading,
      signOut,
      signIn,
      refreshUser,
      switchContext,
    }),
    [user, isLoading, signOut, signIn, refreshUser, switchContext]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
