import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { CallbackStatus } from './CallbackStatus';
import { useLinkFitbitMutation } from '@/hooks/Integrations/useIntegrations';

import { useTranslation } from 'react-i18next';
const FitbitCallback = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Processing Fitbit authorization...');
  const { mutateAsync: linkFitbitAccount } = useLinkFitbitMutation();

  useEffect(() => {
    const processCallback = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (!code) {
        setMessage('Error: Missing Fitbit authorization code.');
        toast({
          title: t(
            'integrations.fitbitCallback.fitbitOAuthError',
            'Fitbit OAuth Error'
          ),
          description: t(
            'integrations.fitbitCallback.missingAuthorizationCodeInCallback',
            'Missing authorization code in callback.'
          ),
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // State is optional but recommended. Fitbit sends it back if we sent it.
      // In our fitbitService, we don't strictly require it for the callback endpoint
      // but it's good practice. Our current fitbitRoutes.js expects code and state.

      try {
        await linkFitbitAccount({ code, state });
        setMessage('Fitbit account successfully linked!');
      } catch (error: unknown) {
        console.error('Error processing Fitbit callback:', error);
        setMessage('Error linking Fitbit account.');
      } finally {
        setLoading(false);
        setTimeout(() => {
          navigate('/settings');
        }, 1500);
      }
    };

    processCallback();
  }, [location, navigate, toast, linkFitbitAccount, t]);

  return <CallbackStatus loading={loading} message={message} />;
};

export default FitbitCallback;
