import type React from 'react';
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authClient } from '../lib/auth-client';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '@/utils/api';

import { useTranslation } from 'react-i18next';
interface ExtendedAuthUser {
  id: string;
  email: string;
  name: string;
  role?: string;
}

const OidcCallback: React.FC = () => {
  const { t } = useTranslation();
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
        const { data: session, error: sessionError } =
          await authClient.getSession();

        if (sessionError) {
          setError(
            sessionError.message ||
              'Failed to verify session after OIDC redirect.'
          );
          return;
        }

        if (session?.user) {
          const user = session.user as unknown as ExtendedAuthUser;
          // Synchronize local AuthContext with Better Auth session
          signIn(
            user.id,
            user.id,
            user.email,
            user.role || 'user',
            false,
            user.name
          );
          navigate('/');
        } else {
          setError('No active session found after OIDC redirect.');
        }
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        setError(
          message || 'An unexpected error occurred during OIDC verification.'
        );
      }
    };

    checkSession();
  }, [navigate, signIn]);

  return (
    <div className="min-h-screen flex items-center justify-center flex-col gap-4">
      <h1 className="text-xl font-semibold">
        {t('oidcCallback.completingSecureLogin', 'Completing Secure Login...')}
      </h1>
      {error && (
        <p className="text-red-500 font-medium">
          {t('oidcCallback.error', 'Error: {{error}}', { error })}
        </p>
      )}
      <p className="text-muted-foreground italic">
        {t(
          'oidcCallback.pleaseWaitWhileWeFinalize',
          'Please wait while we finalize your session.'
        )}
      </p>
    </div>
  );
};

export default OidcCallback;
