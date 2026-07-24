import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { info } from '@/utils/logging';
import {
  useLatestReleaseQuery,
  useAnnouncementQuery,
} from '@/hooks/useGeneralQueries';
import { ReleaseInfo } from './NewReleaseDialog';
import { AnnouncementInfo } from './AnnouncementDialog';

export interface LatestReleaseResponse {
  version: string;
  isNewVersionAvailable: boolean;
}

interface AppSetupProps {
  setLatestRelease: React.Dispatch<React.SetStateAction<ReleaseInfo | null>>;
  setShowNewReleaseDialog: (show: boolean) => void;
  setAnnouncement: React.Dispatch<
    React.SetStateAction<AnnouncementInfo | null>
  >;
  setShowAnnouncementDialog: (show: boolean) => void;
}

const AppSetup = ({
  setLatestRelease,
  setShowNewReleaseDialog,
  setAnnouncement,
  setShowAnnouncementDialog,
}: AppSetupProps): null => {
  const { user, loading } = useAuth();
  const { loggingLevel } = usePreferences();

  const { data: releaseData, isSuccess } = useLatestReleaseQuery({
    enabled: !loading && !!user,
  });

  const { data: announcementData, isSuccess: isAnnouncementSuccess } =
    useAnnouncementQuery({
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

      if (
        releaseData.isNewVersionAvailable &&
        dismissedVersion !== releaseData.version
      ) {
        info(loggingLevel, 'Showing new release dialog.');
        setShowNewReleaseDialog(true);
      }
    }

    if (!loading && user && isAnnouncementSuccess && announcementData) {
      info(loggingLevel, '[ANNOUNCEMENT CHECK]', {
        active: announcementData.active,
        id: announcementData.id,
        title: announcementData.title,
        dismissedId: localStorage.getItem('dismissedAnnouncementId'),
      });

      if (announcementData.active) {
        setAnnouncement(announcementData);
        const dismissedId = localStorage.getItem('dismissedAnnouncementId');
        if (dismissedId !== announcementData.id) {
          info(
            loggingLevel,
            '[ANNOUNCEMENT SHOWING] Opening dialog for id:',
            announcementData.id
          );
          setShowAnnouncementDialog(true);
        } else {
          info(
            loggingLevel,
            '[ANNOUNCEMENT SKIPPED] Already dismissed id:',
            dismissedId
          );
        }
      } else {
        info(loggingLevel, '[ANNOUNCEMENT SKIPPED] active is false');
      }
    }
  }, [
    user,
    loading,
    isSuccess,
    releaseData,
    isAnnouncementSuccess,
    announcementData,
    loggingLevel,
    setLatestRelease,
    setShowNewReleaseDialog,
    setAnnouncement,
    setShowAnnouncementDialog,
  ]);

  return null;
};

export default AppSetup;
