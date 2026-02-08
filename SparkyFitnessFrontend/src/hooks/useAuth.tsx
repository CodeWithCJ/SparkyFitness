import React, { createContext, useContext, ReactNode, useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { authClient } from '../lib/auth-client';

interface User {
  id: string;
  activeUserId: string;
  email: string;
  fullName: string | null;
  role: string;
  twoFactorEnabled: boolean;
  mfaEmailEnabled: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signIn: (userId: string, activeUserId: string, userEmail: string, userRole: string, authType: 'oidc' | 'password' | 'magic_link', navigateOnSuccess?: boolean, userFullName?: string) => void;
  refreshUser: () => Promise<void>;
  switchContext: (targetUserId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const [user, setUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(true); // Track initial hydration
  const navigate = useNavigate();
  const prevSessionRef = React.useRef<any>(null);

  // Only show global loading during initial hydration (isSyncing).
  // Ignoring sessionLoading avoids unmounting components (like Auth/MFA) during background re-fetches.
  const isLoading = isSyncing;

  const [lastManualSignIn, setLastManualSignIn] = useState<number>(0);

  // 1. Sync Effect: Updates User state when Session changes or invalidates
  useEffect(() => {
    // Log when session changes to identify refresh triggers
    if (session !== prevSessionRef.current) {
      const prevUser = prevSessionRef.current?.user?.id;
      const newUser = session?.user?.id;
      const isSameUser = prevUser === newUser;

      // console.log('[Auth Hook] Session update detected:', {
      //   timestamp: new Date().toLocaleTimeString(),
      //   isSameUser,
      //   prevUserId: prevUser,
      //   newUserId: newUser,
      //   trigger: isSameUser ? 'POTENTIAL UNWANTED REFRESH' : 'USER CHANGED',
      // });

      prevSessionRef.current = session;
    }

    // Only process if session has actual user data AND it's different from what we have
    if (session?.user && (!user || user.id !== session.user.id)) {
      const sessionUser = {
        id: session.user.id,
        activeUserId: (session.user as any).activeUserId || session.user.id,
        email: session.user.email,
        fullName: session.user.name || null,
        role: (session.user as any).role || 'user',
        twoFactorEnabled: !!session.user.twoFactorEnabled,
        mfaEmailEnabled: !!(session.user as any).mfaEmailEnabled,
      };

      //console.log('[Auth Hook] Setting user state from session:', sessionUser.id);
      setUser(sessionUser);

      // Fetch Authoritative Data (Active Context)
      // This runs on every session update to ensure we are strictly in sync with the backend.
      import('../services/api').then(({ apiCall }) => {
        apiCall('/identity/user').then((realUserData: any) => {
          setUser(prev => {
            if (!prev) return prev;
            if (prev.activeUserId === realUserData.activeUserId &&
              prev.fullName === realUserData.fullName) {
              return prev; // No change
            }
            return {
              ...prev,
              activeUserId: realUserData.activeUserId,
              fullName: realUserData.activeUserFullName || realUserData.activeUserEmail || null,
              email: realUserData.activeUserEmail
            };
          });
        }).catch(err => console.error("[Auth Hook] Failed to fetch authoritative user data:", err));
      });

      setIsSyncing(false);
    } else if (session?.user && user && user.id === session.user.id) {
      // Same user - just update 2FA status if changed
      // console.log('[Auth Hook] Session re-poll detected, skipping unnecessary update for same user');
      setIsSyncing(false);
    }
  }, [session, user]);

  // 2. Cleanup Effect: Handles Logout / Session expiry
  useEffect(() => {
    if (!session && !sessionLoading) {
      const now = Date.now();
      const isSticky = now - lastManualSignIn < 2000;

      if (user !== null && !isSticky) {
        console.log("[Auth Hook] No session found, clearing user state.");
        setUser(null);
      }
      setIsSyncing(false);
    }
  }, [session, sessionLoading, user, lastManualSignIn]);

  const refreshUser = useCallback(async () => {
    setIsSyncing(true); // Re-trigger syncing state during manual refresh
    try {
      // Force invalidate the session to ensure fresh data
      await authClient.getSession();
    } catch (error) {
      console.error("[Auth Hook] Error refreshing session:", error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await authClient.signOut();
      if (error) {
        console.error("[Auth Hook] SignOut API error:", error);
      }
    } catch (err) {
      console.error("[Auth Hook] SignOut unexpected error:", err);
    }
    setUser(null);
    window.location.href = '/';
  }, []);

  const signIn = useCallback((userId: string, activeUserId: string, userEmail: string, userRole: string, authType: 'oidc' | 'password' | 'magic_link', navigateOnSuccess = true, userFullName?: string) => {
    console.log("[Auth Hook] Manual signIn triggered.");
    setLastManualSignIn(Date.now());
    setUser({
      id: userId,
      activeUserId: activeUserId || userId,
      email: userEmail,
      role: userRole,
      fullName: userFullName || null,
      twoFactorEnabled: false, // Default for manual sign-in, will be refreshed by session
      mfaEmailEnabled: false
    });
    if (navigateOnSuccess) {
      navigate('/');
    }
  }, [navigate]);

  const switchContext = useCallback(async (targetUserId: string) => {
    try {
      console.info("[Auth Hook] Switching context to:", targetUserId);
      const response = await fetch('/api/identity/switch-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      });

      if (response.ok) {
        const data = await response.json();
        console.info("[Auth Hook] Context switched successfully, new activeUserId:", data.activeUserId);

        // Immediately update local state before refreshing session
        setUser(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            activeUserId: data.activeUserId || targetUserId,
          };
        });

        // Then refresh to get authoritative data from backend
        await refreshUser();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to switch context');
      }
    } catch (error) {
      console.error('[Auth Hook] Error switching context:', error);
      throw error;
    }
  }, [refreshUser]);

  const value = useMemo(() => ({
    user,
    loading: isLoading,
    signOut,
    signIn,
    refreshUser,
    switchContext,
  }), [user, isLoading, signOut, signIn, refreshUser, switchContext]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
