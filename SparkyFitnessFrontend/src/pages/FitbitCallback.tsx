import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiCall } from '@/services/api';
import { useToast } from "@/hooks/use-toast";

const FitbitCallback = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('Processing Fitbit authorization...');

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
                await apiCall('/integrations/fitbit/callback', {
                    method: 'POST',
                    body: JSON.stringify({ code, state }),
                });

                setMessage('Fitbit account successfully linked!');
                toast({
                    title: 'Fitbit Success',
                    description: 'Your Fitbit account has been successfully linked.',
                });
                setLoading(false);

                // Redirect to settings tab after a short delay
                setTimeout(() => {
                    navigate('/?tab=settings&section=integrations');
                }, 1500);
            } catch (error: any) {
                console.error('Error processing Fitbit callback:', error);
                setMessage('Error linking Fitbit account.');
                toast({
                    title: 'Fitbit Error',
                    description: error.message || 'Failed to link Fitbit account. Please try again.',
                    variant: 'destructive',
                });
                setLoading(false);
            }
        };

        processCallback();
    }, [location, navigate, toast]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-transparent">
            <div className="p-8 bg-card rounded-xl shadow-lg border text-center max-w-md w-full">
                {loading ? (
                    <>
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-6"></div>
                        <p className="text-xl font-medium text-foreground">{message}</p>
                        <p className="text-muted-foreground mt-2 text-sm">This will only take a moment.</p>
                    </>
                ) : (
                    <div className="text-center">
                        <div className="h-12 w-12 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <p className="text-xl font-medium text-foreground mb-2">{message}</p>
                        <p className="text-muted-foreground text-sm">Redirecting you back to settings...</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FitbitCallback;
