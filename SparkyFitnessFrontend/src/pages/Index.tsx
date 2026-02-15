import type React from 'react';
import { debug } from '@/utils/logging';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';

import OnBoarding from '@/components/Onboarding/OnBoarding';
import MainLayout from '@/layouts/MainLayout';
import { useOnboardingStatus } from '@/hooks/Onboarding/useOnboarding';
import { useState } from 'react';

interface IndexProps {
  onShowAboutDialog: () => void;
}

const Index: React.FC<IndexProps> = ({ onShowAboutDialog }) => {
  const { user, loading: authLoading } = useAuth();
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, 'Index: Component rendered (onboarding check).');

  // only fetch when auth is loaded and user exists
  const { data, isLoading: queryLoading } = useOnboardingStatus(
    !authLoading && !!user
  );
  const [hasSkipped, setHasSkipped] = useState(false);

  const isLoading = authLoading || (!!user && queryLoading);
  const needsOnboarding =
    !hasSkipped && user && data?.onboardingComplete === false;
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-xl text-white">Loading...</p>
      </div>
    );
  }

  if (needsOnboarding) {
    return <OnBoarding onOnboardingComplete={() => setHasSkipped(true)} />;
  }

  // Render MainLayout if onboarding is complete
  return <MainLayout onShowAboutDialog={onShowAboutDialog} />;
};

export default Index;
