import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { REDIRECT_TRACKING_KEY, SW_UNREGISTERED_KEY, cancelScheduledRedirect } from '@/services/api';

interface User {
  id: string;
  email: string;
  role: string; // Add role property
  // Add other user properties as needed
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signIn: (userId: string, userEmail: string, userRole: string, authType: 'oidc' | 'password' | 'magic_link', navigateOnSuccess?: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        let userAuthenticated = false;

        // Attempt to check OIDC session first
        try {
          const oidcResponse = await fetch('/openid/api/me', { credentials: 'include' });
          if (oidcResponse.ok) {
            const userData = await oidcResponse.json();
            if (userData && userData.userId && userData.email) {
              const role = userData.role || 'user';
              setUser({ id: userData.userId, email: userData.email, role: role });
              userAuthenticated = true;

              // Clear redirect tracking timestamp when successfully authenticated
              // This ensures the next session expiration can trigger a redirect
              localStorage.removeItem(REDIRECT_TRACKING_KEY);
              localStorage.removeItem(SW_UNREGISTERED_KEY);
              // Mark that user has been authenticated - allows Service Worker registration
              localStorage.setItem('sparky_user_was_authenticated', 'true');

              // Register Service Worker now that user is authenticated
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch((err) => {
                  console.warn('SW registration after auth failed:', err);
                });
              }

              cancelScheduledRedirect(); // Cancel any pending redirect
              console.debug('Cleared redirect tracking - OIDC session is valid');
            }
          } else if (oidcResponse.status === 401 || oidcResponse.status === 403) {
            // Session expired or unauthorized - this is expected when behind Authentik proxy
            // Don't log as warning, just note it for debugging
            console.debug('OIDC session not found (401/403) - will check password session or trigger Authentik redirect');
          }
        } catch (oidcError) {
          console.warn('OIDC session check failed:', oidcError);
        }

        // If not authenticated via OIDC, attempt to check password session
        if (!userAuthenticated) {
          try {
            const passwordResponse = await fetch('/api/auth/user', { credentials: 'include' });
            if (passwordResponse.ok) {
              const userData = await passwordResponse.json();
              if (userData && userData.userId && userData.email) {
                const role = userData.role || 'user';
                setUser({ id: userData.userId, email: userData.email, role: role });
                userAuthenticated = true;

                // Clear redirect tracking timestamp when successfully authenticated
                // This ensures the next session expiration can trigger a redirect
                localStorage.removeItem(REDIRECT_TRACKING_KEY);
                localStorage.removeItem(SW_UNREGISTERED_KEY);
                // Mark that user has been authenticated - allows Service Worker registration
                localStorage.setItem('sparky_user_was_authenticated', 'true');

                // Register Service Worker now that user is authenticated
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.register('/sw.js').catch((err) => {
                    console.warn('SW registration after auth failed:', err);
                  });
                }

                cancelScheduledRedirect(); // Cancel any pending redirect
                console.debug('Cleared redirect tracking - password session is valid');
              }
            } else if (passwordResponse.status === 401 || passwordResponse.status === 403) {
              // No valid session found - this triggers when Authentik session expires
              console.debug('No valid session found (401/403) - user will need to re-authenticate');
            }
          } catch (passwordError) {
            console.warn('Password session check failed:', passwordError);
          }
        }

        if (!userAuthenticated) {
          setUser(null);
          // Don't redirect here - let Authentik proxy handle initial authentication
          // The redirect will happen when API calls fail (handled in api.ts)
        }
      } catch (error) {
        console.error('Error during session check:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

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

  const signIn = (userId: string, userEmail: string, userRole: string, authType: 'oidc' | 'password', navigateOnSuccess = true) => {
    // authType is no longer stored in localStorage; session is managed by httpOnly cookies.
    setUser({ id: userId, email: userEmail, role: userRole });
    if (navigateOnSuccess) {
      navigate('/');
    }

    // Clear redirect tracking timestamp when user signs in
    // This ensures the next session expiration can trigger a redirect
    localStorage.removeItem(REDIRECT_TRACKING_KEY);
    localStorage.removeItem(SW_UNREGISTERED_KEY);
    // Mark that user has been authenticated - allows Service Worker registration
    localStorage.setItem('sparky_user_was_authenticated', 'true');

    // Register Service Worker now that user is authenticated
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('SW registration after auth failed:', err);
      });
    }

    cancelScheduledRedirect(); // Cancel any pending redirect
    console.debug('Cleared redirect tracking - user signed in via', authType);

    // Navigate to home after successful sign in (from upstream)
    if (navigateOnSuccess) {
      navigate('/');
    }
  };

  const navigate = useNavigate();

  const value = {
    user,
    loading,
    signOut,
    signIn,
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
