import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiCall } from '../services/api';
import { useAuth } from '../hooks/useAuth';

const OidcCallback: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn } = useAuth();

  useEffect(() => {
    const processOidcCallback = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (!code) {
        setError('Authorization code not found in callback URL.');
        return;
      }

      try {
        const response = await apiCall('/openid/callback', {
          method: 'POST',
          body: { code, state },
        });

        if (response.success && response.redirectUrl) {
          // The backend has successfully processed the OIDC callback
          // Now, redirect the frontend to the specified URL
          // The actual user session data will be fetched by the frontend from /openid/api/me
          // after this redirect, or on subsequent protected route access.
          // After successful OIDC callback and backend processing,
          // the user session should be established on the backend.
          // Now, we need to trigger a re-authentication on the frontend
          // to fetch the user details and update the AuthContext.
          // The `signIn` function in `useAuth` is designed for traditional login,
          // so we'll call a simplified version or directly update the context
          // after fetching user info from the backend.

          // Fetch user info from the backend after successful OIDC login
          const userInfo = await apiCall('/openid/api/me');
          if (userInfo && userInfo.userId && userInfo.email) {
            // Assuming the backend's /openid/api/me returns user details including userId, email, and role
signIn(userInfo.userId, userInfo.email, userInfo.role || 'user', 'oidc');
            navigate(response.redirectUrl); // Navigate to the intended redirect URL (e.g., '/')
          } else {
            setError('Failed to retrieve user information after OIDC login.');
          }
        } else {
          setError(response.error || 'OIDC callback processing failed on the server.');
        }
      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred.');
      }
    };

    processOidcCallback();
  }, [location, navigate, signIn]);

  return (
    <div>
      <h1>Processing OIDC Login...</h1>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      <p>Please wait while we securely log you in.</p>
    </div>
  );
};

export default OidcCallback;