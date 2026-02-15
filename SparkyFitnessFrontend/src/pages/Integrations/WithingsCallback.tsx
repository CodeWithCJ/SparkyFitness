import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { CallbackStatus } from './CallbackStatus';
import { useLinkWithingsMutation } from '@/hooks/Integrations/useIntegrations';

const WithingsCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Processing Withings data...');
  const { mutateAsync: linkWithingsAccount } = useLinkWithingsMutation();
  useEffect(() => {
    const processCallback = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (!code || !state) {
        setMessage('Error: Missing OAuth code or state.');
        toast({
          title: 'Withings OAuth Error',
          description: 'Missing OAuth code or state in callback.',
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
  }, [location, navigate]);

  return <CallbackStatus loading={loading} message={message} />;
};

export default WithingsCallback;
