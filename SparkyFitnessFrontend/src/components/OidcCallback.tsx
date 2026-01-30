import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authClient } from '../lib/auth-client';
import { useAuth } from '../hooks/useAuth';

const OidcCallback: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const processingRef = useRef(false);

  useEffect(() => {
    const checkSession = async () => {
      if (processingRef.current) return;
      processingRef.current = true;

      try {
        // Better Auth handles the actual code/state exchange via server-side handler.
        // Once the user is redirected here, the session should already be established.
        const { data: session, error: sessionError } = await authClient.getSession();

        if (sessionError) {
          setError(sessionError.message || 'Failed to verify session after OIDC redirect.');
          return;
        }

        if (session?.user) {
          // Synchronize local AuthContext with Better Auth session
          signIn(
            session.user.id,
            session.user.id, // Better Auth user is always the active user initially
            session.user.email,
            (session.user as any).role || 'user',
            'oidc',
            false, // Don't navigate automatically, we do it below
            session.user.name
          );
          navigate('/');
        } else {
          setError('No active session found after OIDC redirect.');
        }
      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred during OIDC verification.');
      }
    };

    checkSession();
  }, [navigate, signIn]);

  return (
    <div className="min-h-screen flex items-center justify-center flex-col gap-4">
      <h1 className="text-xl font-semibold">Completing Secure Login...</h1>
      {error && <p className="text-red-500 font-medium">Error: {error}</p>}
      <p className="text-muted-foreground italic">Please wait while we finalize your session.</p>
    </div>
  );
};

export default OidcCallback;