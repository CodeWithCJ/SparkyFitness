import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  signIn: (userId: string, userEmail: string, userRole: string, authType: 'oidc' | 'password') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const authType = localStorage.getItem('authType');

        let response;
        if (authType === 'password') {
          response = await fetch('/api/auth/user');
        } else {
          response = await fetch('/openid/api/me', { credentials: 'include' });
        }

        if (response.ok) {
          const userData = await response.json();
          if (userData && userData.userId && userData.email) {
            const role = userData.role || 'user';
            setUser({ id: userData.userId, email: userData.email, role: role });
          } else {
            setUser(null);
            if (authType === 'password') {
              localStorage.removeItem('authType');
            }
          }
        } else {
          setUser(null);
          if (authType === 'password') {
            localStorage.removeItem('authType');
          }
        }
      } catch (error) {
        console.error('Error checking session:', error);
        setUser(null);
        const authType = localStorage.getItem('authType');
        if (authType === 'password') {
          localStorage.removeItem('authType');
        }
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
        // Clear all local storage items related to authentication
        localStorage.removeItem('authType'); // Clear authType on sign out
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
        localStorage.removeItem('authType');
        setUser(null);
        window.location.href = '/'; // Redirect even on server-side error to ensure clean state
      }
    } catch (error) {
      console.error('Network error during logout:', error);
      // On network error, still attempt to clear local state and redirect
      localStorage.removeItem('authType');
      setUser(null);
      window.location.href = '/';
    }
  };

  const signIn = (userId: string, userEmail: string, userRole: string, authType: 'oidc' | 'password') => {
    localStorage.setItem('authType', authType); // Store authType on sign in
    setUser({ id: userId, email: userEmail, role: userRole });
  };

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
