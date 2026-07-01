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
  onShowNewReleaseDialog: () => void;
}

const Index: React.FC<IndexProps> = ({
  onShowAboutDialog,
  onShowNewReleaseDialog,
}) => {
  const { user, loading: authLoading } = useAuth();
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, 'Index: Component rendered (onboarding check).');

  // only fetch when auth is loaded and user exists
  const { data, isLoading: queryLoading } = useOnboardingStatus(
    !authLoading && !!user
  );
  // Allows the user to manually re-open the wizard from the main layout
  const [showOnboardingManually, setShowOnboardingManually] = useState(false);

  const isLoading = authLoading || (!!user && queryLoading);

  // Show wizard automatically when onboarding is not complete and the user hasn't skipped it
  const autoShowWizard =
    !!user && data?.onboardingComplete === false && !data?.onboardingSkipped;

  // Also show if the user explicitly re-opened it via "Complete Setup"
  const showWizard = autoShowWizard || showOnboardingManually;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-xl text-white">Loading...</p>
      </div>
    );
  }

  if (showWizard) {
    return (
      <OnBoarding
        onOnboardingComplete={() => setShowOnboardingManually(false)}
      />
    );
  }

  // Render MainLayout; pass a callback to re-open onboarding when not yet complete
  const onboardingIncomplete = !!user && data?.onboardingComplete === false;

  return (
    <MainLayout
      onShowAboutDialog={onShowAboutDialog}
      onShowNewReleaseDialog={onShowNewReleaseDialog}
      onStartOnboarding={
        onboardingIncomplete ? () => setShowOnboardingManually(true) : undefined
      }
    />
  );
};

export default Index;
