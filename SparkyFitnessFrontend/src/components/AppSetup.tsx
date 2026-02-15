import { useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { info } from '@/utils/logging';

interface AppSetupProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setLatestRelease: (release: any) => void;
  setShowNewReleaseDialog: (show: boolean) => void;
}

const AppSetup = ({
  setLatestRelease,
  setShowNewReleaseDialog,
}: AppSetupProps) => {
  const { user, loading } = useAuth();
  const { loggingLevel } = usePreferences();

  useEffect(() => {
    info(loggingLevel, 'AppSetup useEffect: user', { user, loading });
    if (!loading && user) {
      info(loggingLevel, 'User is authenticated, checking for new release.');
      const checkNewRelease = async () => {
        try {
          const response = await axios.get('/api/version/latest-github');
          const releaseData = response.data;
          setLatestRelease(releaseData);
          info(loggingLevel, 'Latest GitHub release data:', releaseData);

          const dismissedVersion = localStorage.getItem(
            'dismissedReleaseVersion'
          );
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
        } catch (error) {
          console.error('Error checking for new release:', error);
        }
      };

      checkNewRelease();
    } else {
      info(
        loggingLevel,
        'User not authenticated or still loading, skipping new release check.'
      );
    }
  }, [user, loading, loggingLevel, setLatestRelease, setShowNewReleaseDialog]);

  return null;
};

export default AppSetup;
