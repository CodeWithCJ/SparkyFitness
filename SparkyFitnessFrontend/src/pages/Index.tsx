import type React from 'react';
import { debug } from '@/utils/logging';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useActiveUser } from '@/contexts/ActiveUserContext';

import OnBoarding from '@/components/Onboarding/OnBoarding';
import MainLayout from '@/layouts/MainLayout';
import { useOnboardingStatus } from '@/hooks/Onboarding/useOnboarding';
import { useState } from 'react';

import { useTranslation } from 'react-i18next';
interface IndexProps {
  onShowAboutDialog: () => void;
  onShowNewReleaseDialog: () => void;
}

const Index: React.FC<IndexProps> = ({
  onShowAboutDialog,
  onShowNewReleaseDialog,
}) => {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { loggingLevel } = usePreferences();
  const { isActingOnBehalf } = useActiveUser();
  debug(loggingLevel, 'Index: Component rendered (onboarding check).');

  // Onboarding is the signed-in person's own: only they can answer, skip or
  // reset it, and the server refuses it to anyone acting for them. The wizard
  // replaces the whole layout, profile switcher included, so opening someone
  // else's would leave no way back. While acting on behalf it never opens and
  // Complete Setup isn't offered.
  const { data, isLoading: queryLoading } = useOnboardingStatus(
    !authLoading && !!user && !isActingOnBehalf
  );
  // Allows the user to manually re-open the wizard from the main layout
  const [showOnboardingManually, setShowOnboardingManually] = useState(false);

  const isLoading = authLoading || (!!user && queryLoading);

  // Show wizard automatically when onboarding is not complete and the user hasn't skipped it
  const autoShowWizard =
    !!user && data?.onboardingComplete === false && !data?.onboardingSkipped;

  // Also show if the user explicitly re-opened it via "Complete Setup"
  const showWizard =
    !isActingOnBehalf && (autoShowWizard || showOnboardingManually);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-xl text-white">
          {t('common.loading', 'Loading...')}
        </p>
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
  const onboardingIncomplete =
    !isActingOnBehalf && !!user && data?.onboardingComplete === false;

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
