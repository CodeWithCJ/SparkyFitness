import type React from "react";
import { useState, useEffect } from "react";
import { debug, error } from "@/utils/logging";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/contexts/PreferencesContext";

import OnBoarding from "@/components/Onboarding/OnBoarding";
import MainLayout from "@/layouts/MainLayout";
import { getOnboardingStatus } from "@/services/onboardingService";

interface IndexProps {
  onShowAboutDialog: () => void;
}

const Index: React.FC<IndexProps> = ({ onShowAboutDialog }) => {
  const { user, loading: authLoading } = useAuth();
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, "Index: Component rendered (onboarding check).");

  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (authLoading || !user) {
        if (!authLoading && !user) {
          setIsCheckingStatus(false);
        }
        return;
      }

      setIsCheckingStatus(true);
      try {
        const { onboardingComplete } = await getOnboardingStatus();
        setNeedsOnboarding(!onboardingComplete);
      } catch (err) {
        error(loggingLevel, "Index: Error fetching onboarding status:", err);
        setNeedsOnboarding(false);
      } finally {
        setIsCheckingStatus(false);
      }
    };

    checkOnboardingStatus();
  }, [user, authLoading, loggingLevel]);

  if (isCheckingStatus) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-xl text-white">Loading...</p>
      </div>
    );
  }

  if (needsOnboarding) {
    return (
      <OnBoarding onOnboardingComplete={() => setNeedsOnboarding(false)} />
    );
  }

  // Render MainLayout if onboarding is complete
  return <MainLayout onShowAboutDialog={onShowAboutDialog} />;
};

export default Index;
