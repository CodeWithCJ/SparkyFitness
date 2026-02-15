import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { CallbackStatus } from './CallbackStatus';
import { useLinkFitbitMutation } from '@/hooks/Integrations/useIntegrations';

const FitbitCallback = () => {
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
          title: 'Fitbit OAuth Error',
          description: 'Missing authorization code in callback.',
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
      } catch (error: any) {
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
  }, [location, navigate, toast]);

  return <CallbackStatus loading={loading} message={message} />;
};

export default FitbitCallback;
