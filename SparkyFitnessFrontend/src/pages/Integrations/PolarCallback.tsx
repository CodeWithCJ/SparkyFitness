import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { CallbackStatus } from './CallbackStatus';
import { usePolarFlowMutation } from '@/hooks/Integrations/useIntegrations';

const PolarCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Processing Polar authorization...');
  const { mutateAsync: linkPolarAccount } = usePolarFlowMutation();

  useEffect(() => {
    const processCallback = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const state = params.get('state'); // Polar returns the state we sent (userId)

      if (!code) {
        setMessage('Error: Missing Polar authorization code.');
        toast({
          title: 'Polar OAuth Error',
          description: 'Missing authorization code in callback.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      try {
        await linkPolarAccount({ code, state });
        setMessage('Polar account successfully linked!');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        console.error('Error processing Polar callback:', error);
        setMessage('Error linking Polar account.');
      } finally {
        setLoading(false);
        // Redirect to settings tab after a short delay
        setTimeout(() => {
          navigate('/settings');
        }, 1500);
      }
    };

    processCallback();
  }, [location, navigate, toast, linkPolarAccount]);

  return <CallbackStatus loading={loading} message={message} />;
};

export default PolarCallback;
