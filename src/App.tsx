
import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { ChatbotVisibilityProvider } from "@/contexts/ChatbotVisibilityContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import AppContent from "@/components/AppContent";
import DraggableChatbotButton from "@/components/DraggableChatbotButton";
import AboutDialog from "@/components/AboutDialog";
import NewReleaseDialog from "@/components/NewReleaseDialog";
import AppSetup from '@/components/AppSetup';
import axios from 'axios';
import '@/i18n/config';

const queryClient = new QueryClient();

const App = () => {
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

  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <LanguageProvider>
          <ChatbotVisibilityProvider>
            <AppSetup
              setLatestRelease={setLatestRelease}
              setShowNewReleaseDialog={setShowNewReleaseDialog}
            />
            <AppContent onShowAboutDialog={() => setShowAboutDialog(true)} />
            <DraggableChatbotButton />
            <AboutDialog isOpen={showAboutDialog} onClose={() => setShowAboutDialog(false)} version={appVersion} />
            <NewReleaseDialog
              isOpen={showNewReleaseDialog}
              onClose={() => setShowNewReleaseDialog(false)}
              releaseInfo={latestRelease}
              onDismissForVersion={handleDismissRelease}
            />
          </ChatbotVisibilityProvider>
        </LanguageProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
};

export default App;
