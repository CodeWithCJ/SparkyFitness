
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
import { Routes, Route, useNavigate } from 'react-router-dom';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Longer stale time - data doesn't go stale quickly
      staleTime: 1000 * 60 * 30, // 30 minutes (very long)
      // Keep data cached even longer
      gcTime: 1000 * 60 * 60, // 60 minutes
      // CRITICAL: Disable ALL automatic refetching that causes tab switch refreshes
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      // Increase retry attempts and backoff
      retry: 1,
      retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30000),
    },
    mutations: {
      // Don't retry mutations by default
      retry: 0,
    },
  },
});

const App = () => {
  const { t } = useTranslation();
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [latestRelease, setLatestRelease] = useState(null);
  const [showNewReleaseDialog, setShowNewReleaseDialog] = useState(false);
  const [appVersion, setAppVersion] = useState('unknown');

  // Intercept all fetch calls to log what's being requested
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = function (...args) {
      const [resource] = args;
      const url = typeof resource === 'string' ? resource : resource.url;

      // Only log API calls when tab becomes visible for debugging
      // if ((url?.includes('/api/auth') || url?.includes('/auth/session')) && !document.hidden) {
      //   console.log('[Network] Auth API call:', url);
      // }

      return originalFetch.apply(this, args);
    };
  }, []);

  // Detect actual page reloads vs React component updates
  useEffect(() => {
    // Use Navigation Timing API to detect if page was actually reloaded
    const detectPageReload = () => {
      if (performance.getEntriesByType('navigation').length > 0) {
        const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navEntry.type === 'reload') {
          // console.warn('[App] ACTUAL PAGE RELOAD DETECTED at:', new Date().toLocaleTimeString());
        }
      }
    };

    // Check on mount
    detectPageReload();

    // Setup visibility change to detect visibility-triggered reloads
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // console.log('[App] ⚠️ TAB BECAME VISIBLE at:', new Date().toLocaleTimeString());
        // console.log('[App] Checking for page reload...');
        // Check if a reload happened while tab was hidden
        setTimeout(() => {
          detectPageReload();
        }, 100);
      } else {
        // console.log('[App] Tab is now hidden at:', new Date().toLocaleTimeString());
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

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

  const navigate = useNavigate();

  // Normalize URLs with double slashes (e.g., //error -> /error)
  useEffect(() => {
    if (window.location.pathname.includes('//')) {
      const normalizedPath = window.location.pathname.replace(/\/+/g, '/');
      console.log(`[App] Normalizing URL: ${window.location.pathname} -> ${normalizedPath}`);
      navigate(normalizedPath + window.location.search, { replace: true });
    }
  }, [navigate]);

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
                      authLoading && !user ? (
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
                  <Route path="/error" element={<Auth />} /> {/* Support OIDC error redirects */}
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
