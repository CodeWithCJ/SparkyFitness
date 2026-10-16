import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { CallbackStatus } from './CallbackStatus';
import { useLinkWithingsMutation } from '@/hooks/Integrations/useIntegrations';

import { useTranslation } from 'react-i18next';
const WithingsCallback = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Processing Withings data...');
  const { toast } = useToast();
  const { mutateAsync: linkWithingsAccount } = useLinkWithingsMutation();
  useEffect(() => {
    const processCallback = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (!code || !state) {
        setMessage('Error: Missing OAuth code or state.');
        toast({
          title: t(
            'integrations.withingsCallback.withingsOAuthError',
            'Withings OAuth Error'
          ),
          description: t(
            'integrations.withingsCallback.missingOAuthCodeOrState',
            'Missing OAuth code or state in callback.'
          ),
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      try {
        await linkWithingsAccount({ code, state });
        setMessage('Withings data successfully linked!');
      } catch (error) {
        console.error('Error processing Withings callback:', error);
        setMessage('Error linking Withings account.');
      } finally {
        setLoading(false);
        setTimeout(() => {
          navigate('/settings');
        }, 1000); // Redirect after short delay
      }
    };

    processCallback();
  }, [location, navigate, linkWithingsAccount, setMessage, toast, t]);

  return <CallbackStatus loading={loading} message={message} />;
};

export default WithingsCallback;
