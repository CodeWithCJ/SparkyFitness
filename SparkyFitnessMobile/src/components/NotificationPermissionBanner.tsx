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
  requestNotificationPermissionWithGuidance,
  type AppNotificationPermission,
} from '../services/notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { addLog } from '../services/LogService';

export interface NotificationPermissionBannerHandle {
  refresh: () => void;
}

const NotificationPermissionBanner = forwardRef<
  NotificationPermissionBannerHandle
>((_, ref) => {
  const notificationsEnabled = useAppPreferencesStore((s) => s.notificationsEnabled);

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

  const handleOpenSettings = useCallback(async () => {
    await requestNotificationPermissionWithGuidance();
    refreshStatus();
  }, [refreshStatus]);

  const visible =
    notificationsEnabled && osStatus === 'denied';

  if (!visible) return null;

  return (
    <OSDeniedWarningCard
      onPress={() => {
        void handleOpenSettings();
      }}
    />
  );
});

NotificationPermissionBanner.displayName = 'NotificationPermissionBanner';

export default NotificationPermissionBanner;
