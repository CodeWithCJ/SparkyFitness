import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { info } from '@/utils/logging';
import { useLatestReleaseQuery } from '@/hooks/useGeneralQueries';

export interface LatestReleaseResponse {
  version: string;
  isNewVersionAvailable: boolean;
}

interface AppSetupProps {
  setLatestRelease: (release: LatestReleaseResponse) => void;
  setShowNewReleaseDialog: (show: boolean) => void;
}

const AppSetup = ({
  setLatestRelease,
  setShowNewReleaseDialog,
}: AppSetupProps) => {
  const { user, loading } = useAuth();
  const { loggingLevel } = usePreferences();

  const { data: releaseData, isSuccess } = useLatestReleaseQuery({
    enabled: !loading && !!user,
  });

  useEffect(() => {
    info(loggingLevel, 'AppSetup useEffect: auth state', {
      user: !!user,
      loading,
    });

    if (!loading && user && isSuccess && releaseData) {
      info(loggingLevel, 'Latest GitHub release data fetched:', releaseData);

      setLatestRelease(releaseData);

      const dismissedVersion = localStorage.getItem('dismissedReleaseVersion');

      info(
        loggingLevel,
        'Dismissed release version from localStorage:',
        dismissedVersion
      );

      if (
        releaseData.isNewVersionAvailable &&
        dismissedVersion !== releaseData.version
      ) {
        info(loggingLevel, 'Showing new release dialog.');
        setShowNewReleaseDialog(true);
      } else {
        info(loggingLevel, 'New release dialog not shown.', {
          isNewVersionAvailable: releaseData.isNewVersionAvailable,
          dismissedVersion,
          releaseDataVersion: releaseData.version,
        });
      }
    } else if (!user && !loading) {
      info(loggingLevel, 'User not authenticated, skipping new release check.');
    }
  }, [
    user,
    loading,
    isSuccess,
    releaseData,
    loggingLevel,
    setLatestRelease,
    setShowNewReleaseDialog,
  ]);

  return null;
};

export default AppSetup;
