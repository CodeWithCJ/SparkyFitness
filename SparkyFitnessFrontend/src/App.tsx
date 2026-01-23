
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { ChatbotVisibilityProvider } from "@/contexts/ChatbotVisibilityContext";
import LanguageHandler from "@/components/LanguageHandler";
import { WaterContainerProvider } from "@/contexts/WaterContainerContext"; // Import WaterContainerProvider
import { ActiveUserProvider } from "@/contexts/ActiveUserContext"; // Import ActiveUserProvider
// FastingProvider moved to mount only where needed (CheckIn / Fasting page)
import { ThemeProvider } from "@/contexts/ThemeContext"; // Import ThemeProvider
import AppContent from "@/components/AppContent";
import DraggableChatbotButton from "@/components/DraggableChatbotButton";
import AboutDialog from "@/components/AboutDialog";
import NewReleaseDialog from "@/components/NewReleaseDialog";
import AppSetup from '@/components/AppSetup';
import axios from 'axios';
import { Toaster } from "@/components/ui/toaster"; // Import the Toaster component
import { Routes, Route } from 'react-router-dom';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import WithingsCallback from '@/pages/WithingsCallback';
import FitbitCallback from '@/pages/FitbitCallback';
import ExternalProviderSettings from '@/components/ExternalProviderSettings'; // Import ExternalProviderSettings
import Auth from '@/components/Auth'; // Import the Auth component
import { useAuth } from '@/hooks/useAuth';
import FastingPage from "@/pages/FastingPage";
import { FastingProvider } from '@/contexts/FastingContext';
import Index from "@/pages/Index"; // Ensure Index is imported

const queryClient = new QueryClient();

const App = () => {
  const { t } = useTranslation();
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [latestRelease, setLatestRelease] = useState(null);
  const [showNewReleaseDialog, setShowNewReleaseDialog] = useState(false);
  const [appVersion, setAppVersion] = useState('unknown');

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await axios.get('/api/version/current');
        setAppVersion(response.data.version);
      } catch (error) {
        console.error('Error fetching app version:', error);
      }
    };

    fetchVersion();
  }, []);


  const handleDismissRelease = (version: string) => {
    localStorage.setItem('dismissedReleaseVersion', version);
    setShowNewReleaseDialog(false);
  };

  // Read auth state so the root route can show login when not authenticated
  const { user, loading: authLoading } = useAuth();

  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <LanguageHandler />
        <ThemeProvider>
          <ChatbotVisibilityProvider>
            <ActiveUserProvider> {/* Wrap with ActiveUserProvider */}
              <WaterContainerProvider> {/* Wrap with WaterContainerProvider */}
                <AppSetup
                  setLatestRelease={setLatestRelease}
                  setShowNewReleaseDialog={setShowNewReleaseDialog}
                />
                <Routes>
                  <Route
                    path="/"
                    element={
                      authLoading ? (
                        <div className="min-h-screen flex items-center justify-center">Loading...</div>
                      ) : user ? (
                        <Index onShowAboutDialog={() => setShowAboutDialog(true)} />
                      ) : (
                        <Auth />
                      )
                    }
                  />
                  <Route path="/fasting" element={<FastingProvider><FastingPage /></FastingProvider>} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/login/magic-link" element={<Auth />} /> {/* New route for Magic Link Login */}
                  <Route path="/withings/callback" element={<WithingsCallback />} /> {/* New route for Withings callback */}
                  <Route path="/fitbit/callback" element={<FitbitCallback />} /> {/* New route for Fitbit callback */}
                  <Route path="*" element={<AppContent onShowAboutDialog={() => setShowAboutDialog(true)} />} />
                </Routes>
                <DraggableChatbotButton />
                <AboutDialog isOpen={showAboutDialog} onClose={() => setShowAboutDialog(false)} version={appVersion} />
                <NewReleaseDialog
                  isOpen={showNewReleaseDialog}
                  onClose={() => setShowNewReleaseDialog(false)}
                  releaseInfo={latestRelease}
                  onDismissForVersion={handleDismissRelease}
                />
                <Toaster /> {/* Render the Toaster component */}
              </WaterContainerProvider>
            </ActiveUserProvider>
          </ChatbotVisibilityProvider>
        </ThemeProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
};

export default App;
