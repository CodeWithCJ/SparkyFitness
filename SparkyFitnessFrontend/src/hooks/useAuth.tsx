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
import { apiCall } from '@/api/api';

export interface User {
  id: string;
  activeUserId: string;
  email: string;
  fullName: string | null;
  role: string;
  twoFactorEnabled: boolean;
  mfaEmailEnabled: boolean;
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
      };

      //console.log('[Auth Hook] Setting user state from session:', sessionUser.id);
      setUser(sessionUser);

      // Fetch Authoritative Data (Active Context)
      // This runs on every session update to ensure we are strictly in sync with the backend.
      fetchIdentityUser()
        .then((realUserData) => {
          setUser((prev) => {
            if (!prev) return prev;
            if (
              prev.activeUserId === realUserData.activeUserId &&
              prev.fullName === realUserData.fullName
            ) {
              return prev; // No change
            }
            return {
              ...prev,
              activeUserId: realUserData.activeUserId,
              fullName:
                realUserData.activeUserFullName ||
                realUserData.activeUserEmail ||
                null,
              email: realUserData.activeUserEmail,
            };
          });
        })
        .catch((err) =>
          console.error(
            '[Auth Hook] Failed to fetch authoritative user data:',
            err
          )
        );

      setIsSyncing(false);
    } else if (session?.user && user && user.id === session.user.id) {
      // Same user - just update 2FA status if changed
      setIsSyncing(false);
    }
  }, [session, user]);

  // 2. Cleanup Effect: Handles Logout / Session expiry
  useEffect(() => {
    if (!session && !sessionLoading) {
      const now = Date.now();
      const isSticky = now - lastManualSignIn < 2000;

      if (user !== null && !isSticky) {
        // Better Auth's own session fetch bypasses apiCall, so an upstream
        // auth gateway (e.g. Cloudflare Access) intercepting that request can
        // resolve session to null without SparkyFitness ever seeing it. Before
        // treating this as a real logout, confirm with a same-origin probe
        // through apiCall, which knows how to recognize gateway interception
        // (see isGatewayInterceptedResponse in src/api/api.ts) and will
        // trigger a re-auth reload itself rather than resolving here.
        apiCall('/ping')
          .then(() => {
            console.log('[Auth Hook] No session found, clearing user state.');
            setUser(null);
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
