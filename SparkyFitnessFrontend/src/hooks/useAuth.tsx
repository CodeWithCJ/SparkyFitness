import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface User {
  id: string;
  activeUserId: string;
  email: string;
  fullName: string | null;
  role: string;
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const checkSession = async () => {
      // Skip session check if we're on the OIDC callback route
      // The OidcCallback component will handle authentication
      if (location.pathname === '/oidc-callback') {
        setLoading(false);
        return;
      }

      const authType = localStorage.getItem('authType');
      let userAuthenticated = false;

      try {
        // Optimization: Check the last used auth method first to avoid 401 noise

        // 1. If we know it's OIDC (or we don't know), try OIDC
        if (!authType || authType === 'oidc') {
          try {
            const oidcResponse = await fetch('/openid/api/me', { credentials: 'include' });
            if (oidcResponse.ok) {
              const userData = await oidcResponse.json();
              if (userData && userData.userId && userData.email) {
                const role = userData.role || 'user';
                setUser({
                  id: userData.userId,
                  activeUserId: userData.activeUserId || userData.userId,
                  email: userData.email,
                  fullName: userData.fullName || userData.full_name || null,
                  role: role
                });
                userAuthenticated = true;
                // Ensure persistence if it was missing
                if (!authType) localStorage.setItem('authType', 'oidc');
                console.log('Session restored via OIDC');
              }
            } else if (oidcResponse.status >= 500) {
              console.error('OIDC session check server error:', oidcResponse.status, oidcResponse.statusText);
            }
          } catch (oidcError) {
            console.error('OIDC session check network error:', oidcError);
          }
        }

        // 2. If we know it's Password (or OIDC failed and we didn't have a preference OR we have a preference for password), try Password
        // Note: If authType is 'oidc' and OIDC failed, we strictly might NOT want to check Password to avoid noise,
        // BUT if the session expired, we might want to? The user requested stricter logic.
        // "if we logged in using user name password, then oidc shouldnt be checked"
        // So:
        // if authType == 'password': Check Password. Skip OIDC.
        // if authType == 'oidc': Check OIDC. Skip Password (unless we want fallback? User implies no fallback for noise).
        // if !authType: Check Both (Default behavior).

        if (!userAuthenticated && (!authType || authType === 'password')) {
          // If we previously tried OIDC (because !authType) and failed, we fall through here.
          // If authType === 'password', we jumped straight here.
          try {
            const passwordResponse = await fetch('/api/auth/user', { credentials: 'include' });
            if (passwordResponse.ok) {
              const userData = await passwordResponse.json();
              if (userData && userData.userId && userData.email) {
                const role = userData.role || 'user';
                setUser({
                  id: userData.userId,
                  activeUserId: userData.activeUserId || userData.userId,
                  email: userData.email,
                  fullName: userData.fullName || userData.full_name || null,
                  role: role
                });
                userAuthenticated = true;
                if (!authType) localStorage.setItem('authType', 'password');
                console.log('Session restored via Password');
              }
            } else if (passwordResponse.status >= 500) {
              console.error('Password session check server error:', passwordResponse.status, passwordResponse.statusText);
            }
          } catch (passwordError) {
            console.error('Password session check network error:', passwordError);
          }
        }

        if (!userAuthenticated) {
          setUser(null);
          // If we had an authType but failed to auth, should we clear it?
          // Maybe not, maybe session just timed out but they still want to use that method next.
        }
      } catch (error) {
        console.error('Error during session check:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, [location]);

  const refreshUser = async () => {
    setLoading(true);
    // Refresh logic should ideally follow the same pattern or just try the known one.
    // Simplifying to just check the valid one based on state or localStorage.
    const authType = localStorage.getItem('authType');

    try {
      let userAuthenticated = false;

      if (!authType || authType === 'oidc') {
        try {
          const oidcResponse = await fetch('/openid/api/me', { credentials: 'include' });
          if (oidcResponse.ok) {
            const userData = await oidcResponse.json();
            // ... update user ...
            if (userData && userData.userId) {
              const role = userData.role || 'user';
              setUser({
                id: userData.userId,
                activeUserId: userData.activeUserId || userData.userId,
                email: userData.email,
                fullName: userData.fullName || userData.full_name || null,
                role: role
              });
              userAuthenticated = true;
            }
          }
        } catch (e) {
          console.error('OIDC refresh error', e);
        }
      }

      if (!userAuthenticated && (!authType || authType === 'password')) {
        try {
          const passwordResponse = await fetch('/api/auth/user', { credentials: 'include' });
          if (passwordResponse.ok) {
            const userData = await passwordResponse.json();
            if (userData && userData.userId) {
              const role = userData.role || 'user';
              setUser({
                id: userData.userId,
                activeUserId: userData.activeUserId || userData.userId,
                email: userData.email,
                fullName: userData.fullName || userData.full_name || null,
                role: role
              });
              userAuthenticated = true;
            }
          }
        } catch (e) {
          console.error('Password refresh error', e);
        }
      }

      if (!userAuthenticated) setUser(null);

    } catch (error) {
      console.error('Error during session refresh:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const responseData = await response.json();
        // Clear client-side user state & preference
        setUser(null);
        localStorage.removeItem('authType');

        if (responseData.redirectUrl) {
          window.location.href = responseData.redirectUrl;
        } else {
          window.location.href = '/';
        }
      } else {
        const errorData = await response.json();
        console.error('Logout failed on server:', errorData);
        setUser(null);
        localStorage.removeItem('authType');
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Network error during logout:', error);
      setUser(null);
      localStorage.removeItem('authType');
      window.location.href = '/';
    }
  };

  const signIn = (userId: string, activeUserId: string, userEmail: string, userRole: string, authType: 'oidc' | 'password' | 'magic_link', navigateOnSuccess = true, userFullName?: string) => {
    // Save the auth preference
    localStorage.setItem('authType', authType === 'magic_link' ? 'password' : authType); // magic_link behaves like password session usually

    setUser({ id: userId, activeUserId: activeUserId || userId, email: userEmail, role: userRole, fullName: userFullName || null });
    if (navigateOnSuccess) {
      navigate('/');
    }
  };

  const switchContext = async (targetUserId: string) => {
    try {
      const response = await fetch('/api/auth/switch-context', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetUserId }),
      });

      if (response.ok) {
        // After successful context switch, refresh the user to get the new token's data
        await refreshUser();
      } else {
        const errorData = await response.json();
        console.error('Failed to switch context:', errorData);
        throw new Error(errorData.error || 'Failed to switch context');
      }
    } catch (error) {
      console.error('Error switching context:', error);
      throw error;
    }
  };

  const navigate = useNavigate();

  const value = {
    user,
    loading,
    signOut,
    signIn,
    refreshUser,
    switchContext,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
