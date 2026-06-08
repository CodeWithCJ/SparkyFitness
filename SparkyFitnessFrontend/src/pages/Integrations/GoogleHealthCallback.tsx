import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { CallbackStatus } from './CallbackStatus';
import { useLinkGoogleHealthMutation } from '@/hooks/Integrations/useIntegrations';

const GoogleHealthCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(
    'Processing Google Health authorization...'
  );
  const { mutateAsync: linkGoogleHealthAccount } =
    useLinkGoogleHealthMutation();

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const processCallback = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (!code) {
        setMessage('Error: Missing Google Health authorization code.');
        toast({
          title: 'Google Health OAuth Error',
          description: 'Missing authorization code in callback.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      try {
        await linkGoogleHealthAccount({ code, state });
        setMessage('Google Health account successfully linked!');
      } catch (error: unknown) {
        console.error('Error processing Google Health callback:', error);
        setMessage('Error linking Google Health account.');
      } finally {
        setLoading(false);
        timeoutId = setTimeout(() => {
          navigate('/settings');
        }, 1500);
      }
    };

    processCallback();
    return () => clearTimeout(timeoutId);
  }, [location, navigate, toast, linkGoogleHealthAccount]);

  return <CallbackStatus loading={loading} message={message} />;
};

export default GoogleHealthCallback;
