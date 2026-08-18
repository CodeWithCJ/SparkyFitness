import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import Button from './ui/Button';
import { seedHealthData, seedHistoricalSteps, seedOldHealthData, seedRichWorkout, seedRichStrengthWorkout } from '../services/seedHealthData';
import { seedRichWorkoutIOS, seedRichStrengthWorkoutIOS } from '../services/seedHealthDataIOS';
import { triggerManualSync } from '../services/backgroundSyncService';
import { notifySessionExpired } from '../services/api/authService';
import { getActiveServerConfig } from '../services/storage';
import { resetWhatsNewBanner } from '../services/whatsNewBanner';
import { resetAnnouncementModal } from './AnnouncementModal';
import { CycleCardRingContent, type CycleRingContentInfo } from './CycleCard';
import { openHealthConnectSettings, openHealthConnectDataManagement, getGrantedPermissions } from 'react-native-health-connect';

const CYCLE_GALLERY_BASE: Omit<CycleRingContentInfo, 'day' | 'phase'> = {
  avgCycleLength: 28,
  avgPeriodLength: 5,
  fertileStartDay: 10,
  fertileEndDay: 15,
  ovulationDay: 14,
  nextPeriodStart: '2026-08-28',
  daysLate: 0,
};

type CycleGalleryPhase = 'menstrual' | 'follicular' | 'fertile' | 'ovulation' | 'luteal' | 'late';

const CYCLE_GALLERY_STATES: { phaseKey: CycleGalleryPhase; info: CycleRingContentInfo }[] = [
  { phaseKey: 'menstrual', info: { ...CYCLE_GALLERY_BASE, day: 2, phase: 'menstrual' } },
  { phaseKey: 'follicular', info: { ...CYCLE_GALLERY_BASE, day: 8, phase: 'follicular' } },
  { phaseKey: 'fertile', info: { ...CYCLE_GALLERY_BASE, day: 12, phase: 'fertile' } },
  { phaseKey: 'ovulation', info: { ...CYCLE_GALLERY_BASE, day: 14, phase: 'ovulation' } },
  { phaseKey: 'luteal', info: { ...CYCLE_GALLERY_BASE, day: 21, phase: 'luteal' } },
  {
    phaseKey: 'late',
    info: { ...CYCLE_GALLERY_BASE, day: 31, phase: 'luteal', daysLate: 3 },
  },
];

const cycleGalleryLabel = (t: ReturnType<typeof useTranslation>['t'], phaseKey: CycleGalleryPhase): string => {
  switch (phaseKey) {
    case 'menstrual': return t('devTools.gallery.state.menstrual', { defaultValue: 'Menstrual — day 2' });
    case 'follicular': return t('devTools.gallery.state.follicular', { defaultValue: 'Follicular — day 8' });
    case 'fertile': return t('devTools.gallery.state.fertile', { defaultValue: 'Fertile window — day 12' });
    case 'ovulation': return t('devTools.gallery.state.ovulation', { defaultValue: 'Ovulation — day 14' });
    case 'luteal': return t('devTools.gallery.state.luteal', { defaultValue: 'Luteal — day 21' });
    case 'late': return t('devTools.gallery.state.late', { defaultValue: 'Period late — day 31' });
    default: return t('devTools.gallery.state.unknown', { defaultValue: 'Cycle phase' });
  }
};

const DevTools: React.FC = () => {
  const { t } = useTranslation();
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      await triggerManualSync();
      Toast.show({ type: 'success', text1: t('common.success', { defaultValue: 'Success' }), text2: t('devTools.toast.syncCompleted', { defaultValue: 'Background sync completed. Check Logs for details.' }) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.syncFailed', { defaultValue: 'Sync failed: {{message}}', message }) });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSeedHistoricalSteps = async () => {
    setIsSeeding(true);
    try {
      const result = await seedHistoricalSteps();
      if (result.success) {
        Toast.show({ type: 'success', text1: t('common.success', { defaultValue: 'Success' }), text2: t('devTools.toast.historicalSeeded', { defaultValue: 'Seeded {{count}} historical step records across the past year.', defaultValue_one: 'Seeded {{count}} historical step record across the past year.', defaultValue_other: 'Seeded {{count}} historical step records across the past year.', count: result.recordsInserted }) });
      } else {
        Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.historicalSeedFailed', { defaultValue: 'Failed to seed historical step data.' }) });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.historicalSeedFailedWithMessage', { defaultValue: 'Failed to seed historical step data: {{message}}', message }) });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSeedOldData = async () => {
    setIsSeeding(true);
    try {
      const result = await seedOldHealthData();
      if (result.success) {
        Toast.show({ type: 'success', text1: t('common.success', { defaultValue: 'Success' }), text2: t('devTools.toast.seedOldSeeded', { defaultValue: 'Seeded {{count}} records in clusters 1-3 years back.', defaultValue_one: 'Seeded {{count}} record in clusters 1-3 years back.', defaultValue_other: 'Seeded {{count}} records in clusters 1-3 years back.', count: result.recordsInserted }) });
      } else {
        Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.seedOldFailed', { defaultValue: 'Failed to seed old health data.' }) });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.seedOldFailedWithMessage', { defaultValue: 'Failed to seed old health data: {{message}}', message }) });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSeedData = async (days: number) => {
    setIsSeeding(true);
    try {
      const result = await seedHealthData(days);
      if (result.success) {
        Toast.show({ type: 'success', text1: t('common.success', { defaultValue: 'Success' }), text2: t('devTools.toast.healthSeeded', { defaultValue: 'Seeded {{count}} health records for the past {{days}} days.', defaultValue_one: 'Seeded {{count}} health record for the past {{days}} days.', defaultValue_other: 'Seeded {{count}} health records for the past {{days}} days.', count: result.recordsInserted, days }) });
      } else {
        Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.healthSeedFailed', { defaultValue: 'Failed to seed health data.' }) });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.healthSeedFailedWithMessage', { defaultValue: 'Failed to seed health data: {{message}}', message }) });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSeedRichWorkout = async () => {
    setIsSeeding(true);
    try {
      const result = await seedRichWorkout();
      if (result.success) {
        Toast.show({ type: 'success', text1: t('common.success', { defaultValue: 'Success' }), text2: t('devTools.toast.richWorkoutSeeded', { defaultValue: 'Seeded a 12-minute walk with route, HR, speed and laps. Run a foreground sync to pull it in.' }) });
      } else {
        Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.richWorkoutFailed', { defaultValue: 'Failed to seed rich workout.' }) });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.richWorkoutFailedWithMessage', { defaultValue: 'Failed to seed rich workout: {{message}}', message }) });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSeedRichStrengthWorkout = async () => {
    setIsSeeding(true);
    try {
      const result = await seedRichStrengthWorkout();
      if (result.success) {
        Toast.show({ type: 'success', text1: t('common.success', { defaultValue: 'Success' }), text2: t('devTools.toast.richStrengthSeeded', { defaultValue: 'Seeded a 35-minute strength session with spiky HR (no route/reps — devices never report those). Run a foreground sync to pull it in.' }) });
      } else {
        Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.richStrengthFailed', { defaultValue: 'Failed to seed rich strength workout.' }) });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.richStrengthFailedWithMessage', { defaultValue: 'Failed to seed rich strength workout: {{message}}', message }) });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSeedRichWorkoutIOS = async () => {
    setIsSeeding(true);
    try {
      const result = await seedRichWorkoutIOS();
      if (result.success) {
        Toast.show({ type: 'success', text1: t('common.success', { defaultValue: 'Success' }), text2: t('devTools.toast.richWorkoutIosSeeded', { defaultValue: 'Seeded a 12-minute walk with route and HR. Run a foreground sync to pull it in.' }) });
      } else {
        Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.richWorkoutFailed', { defaultValue: 'Failed to seed rich workout.' }) });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.richWorkoutFailedWithMessage', { defaultValue: 'Failed to seed rich workout: {{message}}', message }) });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSeedRichStrengthWorkoutIOS = async () => {
    setIsSeeding(true);
    try {
      const result = await seedRichStrengthWorkoutIOS();
      if (result.success) {
        Toast.show({ type: 'success', text1: t('common.success', { defaultValue: 'Success' }), text2: t('devTools.toast.richStrengthIosSeeded', { defaultValue: 'Seeded a 35-minute strength session with spiky HR (no route/laps/reps — devices never report those). Run a foreground sync to pull it in.' }) });
      } else {
        Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.richStrengthFailed', { defaultValue: 'Failed to seed rich strength workout.' }) });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('devTools.toast.richStrengthFailedWithMessage', { defaultValue: 'Failed to seed rich strength workout: {{message}}', message }) });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleCheckBackgroundPermissions = async () => {
    const permissions = await getGrantedPermissions();
    const hasBackgroundAccess = permissions.some(
      (permission) =>
        permission.accessType === 'read' &&
        permission.recordType === 'BackgroundAccessPermission'
    );

    Toast.show({
      type: hasBackgroundAccess ? 'success' : 'error',
      text1: t('devTools.healthConnect.backgroundPermission.title', { defaultValue: 'Background Access Permission' }),
      text2: hasBackgroundAccess
        ? t('devTools.healthConnect.backgroundPermission.granted', { defaultValue: 'Background access permission is granted.' })
        : t('devTools.healthConnect.backgroundPermission.notGranted', { defaultValue: 'Background access permission is NOT granted.' }),
    });
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">{t('devTools.title', { defaultValue: 'Dev Tools' })}</Text>
      <Text className="text-text-muted mb-3 text-[13px]">
        {t('devTools.description', { defaultValue: 'These tools are only visible in development builds.' })}
      </Text>

      <Text className="text-sm text-text-primary">{t('devTools.seed.title', { defaultValue: 'Seed Health Data' })}</Text>
      <Text className="text-text-muted mb-3 text-[13px]">
        {t('devTools.seed.description', { defaultValue: 'Insert sample health data for testing.' })}
      </Text>

      <View className="flex-row gap-2 flex-wrap justify-between">
        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={() => handleSeedData(7)}
          loading={isSeeding}
          textClassName="font-bold"
        >
          {t('devTools.seed.sevenDays', { defaultValue: '7 Days' })}
        </Button>

        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={() => handleSeedData(14)}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold">{t('devTools.seed.fourteenDays', { defaultValue: '14 Days' })}</Text>
        </Button>

        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={() => handleSeedData(30)}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold">{t('devTools.seed.thirtyDays', { defaultValue: '30 Days' })}</Text>
        </Button>

        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={handleSeedHistoricalSteps}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold text-center">{t('devTools.seed.oneYear', { defaultValue: '1 Year' })}{'\n'}{t('devTools.seed.steps', { defaultValue: '(Steps)' })}</Text>
        </Button>

        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={handleSeedOldData}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold text-center">{t('devTools.seed.oldData', { defaultValue: 'Old Data' })}{'\n'}{t('devTools.seed.oldRange', { defaultValue: '(1-3 Years)' })}</Text>
        </Button>

        {Platform.OS === 'android' && (
          <Button
            variant="primary"
            className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
            onPress={handleSeedRichWorkout}
            disabled={isSeeding}
          >
            <Text className="text-white text-base font-bold text-center">{t('devTools.seed.richWorkout', { defaultValue: 'Rich Workout' })}{'\n'}{t('devTools.seed.richWorkoutDetail', { defaultValue: '(Route+HR+Laps)' })}</Text>
          </Button>
        )}

        {Platform.OS === 'android' && (
          <Button
            variant="primary"
            className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
            onPress={handleSeedRichStrengthWorkout}
            disabled={isSeeding}
          >
            <Text className="text-white text-base font-bold text-center">{t('devTools.seed.richStrength', { defaultValue: 'Rich Strength' })}{'\n'}{t('devTools.seed.richStrengthDetail', { defaultValue: '(Spiky HR)' })}</Text>
          </Button>
        )}

        {Platform.OS === 'ios' && (
          <Button
            variant="primary"
            className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
            onPress={handleSeedRichWorkoutIOS}
            disabled={isSeeding}
          >
            <Text className="text-white text-base font-bold text-center">{t('devTools.seed.richWorkout', { defaultValue: 'Rich Workout' })}{'\n'}{t('devTools.seed.richWorkoutIosDetail', { defaultValue: '(Route+HR)' })}</Text>
          </Button>
        )}

        {Platform.OS === 'ios' && (
          <Button
            variant="primary"
            className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
            onPress={handleSeedRichStrengthWorkoutIOS}
            disabled={isSeeding}
          >
            <Text className="text-white text-base font-bold text-center">{t('devTools.seed.richStrength', { defaultValue: 'Rich Strength' })}{'\n'}{t('devTools.seed.richStrengthDetail', { defaultValue: '(Spiky HR)' })}</Text>
          </Button>
        )}
      </View>
      {Platform.OS === 'android' && (
        <View className="flex-row gap-2 flex-wrap justify-between mt-4">
          <Pressable
            className="bg-accent-primary py-2 px-4 rounded-lg my-1 items-center self-center min-w-20"
            onPress={() => openHealthConnectSettings()}
          >
            <Text className="text-white text-base font-bold">{t('devTools.healthConnect.title', { defaultValue: 'Health Connect' })}</Text>
          </Pressable>
          <Pressable
            className="bg-accent-primary py-2 px-4 rounded-lg my-1 items-center self-center min-w-20"
            onPress={() => openHealthConnectDataManagement()}
          >
            <Text className="text-white text-base font-bold">{t('devTools.healthConnect.data', { defaultValue: 'Health Connect Data' })}</Text>
          </Pressable>
        </View>
      )}
      <View className="mt-5">
        <Text className="text-sm text-text-primary">{t('devTools.sync.title', { defaultValue: 'Background Sync' })}</Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          {t('devTools.sync.description', { defaultValue: 'Manually trigger the background sync process.' })}
        </Text>
        <View className="flex-row gap-2 flex-wrap justify-between">
          <Button
            variant="primary"
            className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
            onPress={handleTriggerSync}
            loading={isSyncing}
            textClassName="font-bold"
          >
            {t('devTools.sync.trigger', { defaultValue: 'Trigger Sync' })}
          </Button>
          {Platform.OS === 'android' && (
            <Button
              variant="primary"
              className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
              onPress={handleCheckBackgroundPermissions}
            >
              <Text className="text-white text-base font-bold">{t('devTools.sync.checkPermission', { defaultValue: 'Check BG Permission' })}</Text>
            </Button>
          )}
        </View>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">{t('devTools.auth.title', { defaultValue: 'Auth' })}</Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          {t('devTools.auth.description', { defaultValue: 'Trigger auth modals for testing.' })}
        </Text>
        <View className="flex-row gap-2 flex-wrap">
          <Button
            variant="primary"
            className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
            onPress={async () => {
              const config = await getActiveServerConfig();
              notifySessionExpired(config?.id ?? 'dev-test');
            }}
          >
            <Text className="text-white text-base font-bold">{t('devTools.auth.reauth', { defaultValue: 'Show ReauthModal' })}</Text>
          </Button>
        </View>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">{t('devTools.whatsNew.title', { defaultValue: "What's New Banner" })}</Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          {t('devTools.whatsNew.description', { defaultValue: 'Clear the last-seen version so the banner re-appears above the tab bar.' })}
        </Text>
        <View className="flex-row gap-2 flex-wrap">
          <Button
            variant="primary"
            className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
            onPress={async () => {
              await resetWhatsNewBanner();
              Toast.show({
                type: 'success',
                text1: t('devTools.toast.reset', { defaultValue: 'Reset' }),
                text2: t('devTools.toast.whatsNewReset', { defaultValue: "What's New banner will re-appear." }),
              });
            }}
          >
            <Text className="text-white text-base font-bold">{t('devTools.whatsNew.reset', { defaultValue: 'Reset Banner' })}</Text>
          </Button>
        </View>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">{t('devTools.announcement.title', { defaultValue: 'System Announcement' })}</Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          {t('devTools.announcement.description', { defaultValue: 'Clear the dismissed announcement flag so active system announcements re-appear.' })}
        </Text>
        <View className="flex-row gap-2 flex-wrap">
          <Button
            variant="primary"
            className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
            onPress={async () => {
              try {
                await resetAnnouncementModal();
                Toast.show({
                  type: 'success',
                  text1: t('devTools.toast.reset', { defaultValue: 'Reset' }),
                  text2: t('devTools.toast.announcementReset', { defaultValue: 'System announcement modal will re-appear.' }),
                });
              } catch {
                Toast.show({
                  type: 'error',
                  text1: t('common.error', { defaultValue: 'Error' }),
                  text2: t('devTools.toast.announcementResetFailed', { defaultValue: 'Could not reset announcement.' }),
                });
              }
            }}
          >
            <Text className="text-white text-base font-bold">{t('devTools.announcement.reset', { defaultValue: 'Reset Announcement' })}</Text>
          </Button>
        </View>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">{t('devTools.gallery.title', { defaultValue: 'Cycle Card Gallery' })}</Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          {t('devTools.gallery.description', { defaultValue: 'Fake-data preview of the dashboard cycle card in every phase. The pregnancy and discreet layouts follow real data: switch mode in Hub settings.' })}
        </Text>
        {CYCLE_GALLERY_STATES.map(({ phaseKey, info }) => (
          <View key={phaseKey} className="mb-3">
            <Text className="text-xs text-text-muted mb-1">
              {cycleGalleryLabel(t, phaseKey)}
            </Text>
            <View className="border border-border-subtle rounded-xl p-4">
              <CycleCardRingContent title={t('devTools.gallery.cycleTracking', { defaultValue: 'Cycle Tracking' })} info={info} />
            </View>
          </View>
        ))}
      </View>

    </View>
  );
};

export default DevTools;
