import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { CallbackStatus } from './CallbackStatus';
import { useLinkStravaMutation } from '@/hooks/Integrations/useIntegrations';

const StravaCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Processing Strava authorization...');
  const { mutateAsync: linkStravaAccount } = useLinkStravaMutation();

  useEffect(() => {
    const processCallback = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (!code) {
        setMessage('Error: Missing Strava authorization code.');
        toast({
          title: 'Strava OAuth Error',
          description: 'Missing authorization code in callback.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      try {
        await linkStravaAccount({ code, state });
        setMessage('Strava account successfully linked!');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        console.error('Error processing Strava callback:', error);
        setMessage('Error linking Strava account.');
      } finally {
        setLoading(false);
        setTimeout(() => {
          navigate('/settings');
        }, 1500);
      }
    };

    processCallback();
  }, [location, navigate, toast, linkStravaAccount]);

  return <CallbackStatus loading={loading} message={message} />;
};

export default StravaCallback;
