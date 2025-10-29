import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { post } from '@/utils/api';
import { toast } from '@/components/ui/use-toast';

const WithingsCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Processing Withings data...');

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
        await post('/api/withings/callback', { code, state });
        setMessage('Withings data successfully linked!');
        toast({
          title: 'Withings Success',
          description: 'Your Withings account has been successfully linked.',
        });
        setLoading(false);
        setTimeout(() => {
          navigate('/');
        }, 1000); // Redirect after 3 seconds
      } catch (error) {
        console.error('Error processing Withings callback:', error);
        setMessage('Error linking Withings account.');
        toast({
          title: 'Withings Error',
          description: 'Failed to link Withings account. Please try again.',
          variant: 'destructive',
        });
        setLoading(false);
      }
    };

    processCallback();
  }, [location, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-6 bg-white rounded-lg shadow-md text-center">
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
            <p className="text-lg font-semibold text-gray-700">{message}</p>
          </>
        ) : (
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-700 mb-4">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WithingsCallback;