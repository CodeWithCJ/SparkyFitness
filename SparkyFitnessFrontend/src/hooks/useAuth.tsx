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

      try {
        let userAuthenticated = false;

        // Attempt to check OIDC session first
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
            }
          } else if (oidcResponse.status >= 500) {
            // Log server errors - these are real problems
            console.error('OIDC session check server error:', oidcResponse.status, oidcResponse.statusText);
          }
          // Silently ignore 401/403 - they're expected when no session exists
        } catch (oidcError) {
          // Network errors (DNS, timeout, CORS) - these are real problems
          console.error('OIDC session check network error:', oidcError);
        }

        // If not authenticated via OIDC, attempt to check password session
        if (!userAuthenticated) {
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
              }
            } else if (passwordResponse.status >= 500) {
              // Log server errors - these are real problems
              console.error('Password session check server error:', passwordResponse.status, passwordResponse.statusText);
            }
            // Silently ignore 401/403 - they're expected when no session exists
          } catch (passwordError) {
            // Network errors (DNS, timeout, CORS) - these are real problems
            console.error('Password session check network error:', passwordError);
          }
        }

        if (!userAuthenticated) {
          setUser(null);
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
    // Re-check session to update activeUserId from latest JWT/Session
    try {
      let userAuthenticated = false;

      // Attempt to check OIDC session first
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
          }
        } else if (oidcResponse.status >= 500) {
          // Log server errors - these are real problems
          console.error('OIDC session refresh server error:', oidcResponse.status, oidcResponse.statusText);
        }
        // Silently ignore 401/403 - they're expected when no session exists
      } catch (oidcError) {
        // Network errors (DNS, timeout, CORS) - these are real problems
        console.error('OIDC session refresh network error:', oidcError);
      }

      // If not authenticated via OIDC, attempt to check password session
      if (!userAuthenticated) {
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
            }
          } else if (passwordResponse.status >= 500) {
            // Log server errors - these are real problems
            console.error('Password session refresh server error:', passwordResponse.status, passwordResponse.statusText);
          }
          // Silently ignore 401/403 - they're expected when no session exists
        } catch (passwordError) {
          // Network errors (DNS, timeout, CORS) - these are real problems
          console.error('Password session refresh network error:', passwordError);
        }
      }

      if (!userAuthenticated) {
        setUser(null);
      }
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
        // Clear client-side user state. Server-side logout handles cookie invalidation.
        setUser(null);

        if (responseData.redirectUrl) {
          // If a redirectUrl is provided, it means an OIDC logout is required
          window.location.href = responseData.redirectUrl;
        } else {
          // For local logins or if OIDC redirect is not needed, redirect to home or login
          window.location.href = '/'; // Or your desired post-logout landing page
        }
      } else {
        const errorData = await response.json();
        console.error('Logout failed on server:', errorData);
        // Even if server logout fails, clear client-side state to avoid inconsistent state
        setUser(null);
        window.location.href = '/'; // Redirect even on server-side error to ensure clean state
      }
    } catch (error) {
      console.error('Network error during logout:', error);
      // On network error, still attempt to clear local state and redirect
      setUser(null);
      window.location.href = '/';
    }
  };

  const signIn = (userId: string, activeUserId: string, userEmail: string, userRole: string, authType: 'oidc' | 'password' | 'magic_link', navigateOnSuccess = true, userFullName?: string) => {
    // authType is no longer stored in localStorage; session is managed by httpOnly cookies.
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
