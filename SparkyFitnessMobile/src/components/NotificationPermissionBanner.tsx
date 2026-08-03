import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import OSDeniedWarningCard from './OSDeniedWarningCard';
import {
  getNotificationPermissionStatus,
  openSystemNotificationSettings,
  requestNotificationPermission,
  type AppNotificationPermission,
} from '../services/notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { addLog } from '../services/LogService';
import { useTranslation } from 'react-i18next';

export interface NotificationPermissionBannerHandle {
  refresh: () => void;
}

const NotificationPermissionBanner = forwardRef<
  NotificationPermissionBannerHandle
>((_, ref) => {
  const notificationsEnabled = useAppPreferencesStore((s) => s.notificationsEnabled);
  const { t } = useTranslation();

  const [osStatus, setOsStatus] = useState<AppNotificationPermission | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getNotificationPermissionStatus();
      setOsStatus(status);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addLog(
        `[NotificationPermissionBanner] refresh failed: ${message}`,
        'WARNING',
      );
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      refresh: () => {
        refreshStatus();
      },
    }),
    [refreshStatus],
  );

  useFocusEffect(
    useCallback(() => {
      refreshStatus();
    }, [refreshStatus]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshStatus();
      }
    });
    return () => sub.remove();
  }, [refreshStatus]);

  // Undetermined can still trigger the OS prompt directly (tapping the card is
  // the user action); after a denial only system settings can change it.
  const handlePress = useCallback(async () => {
    if (osStatus === 'undetermined') {
      await requestNotificationPermission();
    } else {
      await openSystemNotificationSettings();
    }
    refreshStatus();
  }, [osStatus, refreshStatus]);

  const visible =
    notificationsEnabled && (osStatus === 'denied' || osStatus === 'undetermined');

  if (!visible) return null;

  return (
    <OSDeniedWarningCard
       actionLabel={osStatus === 'undetermined' ? t('notificationPermission.enable') : t('notificationPermission.openSettings')}
      onPress={() => {
        void handlePress();
      }}
    />
  );
});

NotificationPermissionBanner.displayName = 'NotificationPermissionBanner';

export default NotificationPermissionBanner;
