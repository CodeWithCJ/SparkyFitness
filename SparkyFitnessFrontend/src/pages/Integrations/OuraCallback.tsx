import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { CallbackStatus } from './CallbackStatus';
import { useLinkOuraMutation } from '@/hooks/Integrations/useIntegrations';

const OuraCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Processing Oura authorization...');
  const { mutateAsync: linkOuraAccount } = useLinkOuraMutation();

  useEffect(() => {
    const processCallback = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (!code) {
        setMessage('Error: Missing Oura authorization code.');
        toast({
          title: 'Oura OAuth Error',
          description: 'Missing authorization code in callback.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      try {
        await linkOuraAccount({ code, state });
        setMessage('Oura account successfully linked!');
      } catch (error: unknown) {
        console.error('Error processing Oura callback:', error);
        setMessage('Error linking Oura account.');
      } finally {
        setLoading(false);
        setTimeout(() => {
          navigate('/settings');
        }, 1500);
      }
    };

    processCallback();
  }, [location, navigate, toast, linkOuraAccount]);

  return <CallbackStatus loading={loading} message={message} />;
};

export default OuraCallback;
