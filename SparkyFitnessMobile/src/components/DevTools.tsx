import React, { useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import Button from './ui/Button';
import { seedHealthData, seedHistoricalSteps } from '../services/seedHealthData';
import { triggerManualSync } from '../services/backgroundSyncService';
import { notifySessionExpired } from '../services/api/authService';
import { getActiveServerConfig } from '../services/storage';
import { resetWhatsNewBanner } from '../services/whatsNewBanner';
import { resetAnnouncementModal } from './AnnouncementModal';
import { FOOD_SEARCH_POPOVERS } from '../services/foodSearchPreferences';
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

const CYCLE_GALLERY_STATES: { label: string; info: CycleRingContentInfo }[] = [
  { label: 'Menstrual — day 2', info: { ...CYCLE_GALLERY_BASE, day: 2, phase: 'menstrual' } },
  { label: 'Follicular — day 8', info: { ...CYCLE_GALLERY_BASE, day: 8, phase: 'follicular' } },
  { label: 'Fertile window — day 12', info: { ...CYCLE_GALLERY_BASE, day: 12, phase: 'fertile' } },
  { label: 'Ovulation — day 14', info: { ...CYCLE_GALLERY_BASE, day: 14, phase: 'ovulation' } },
  { label: 'Luteal — day 21', info: { ...CYCLE_GALLERY_BASE, day: 21, phase: 'luteal' } },
  {
    label: 'Period late — day 31',
    info: { ...CYCLE_GALLERY_BASE, day: 31, phase: 'luteal', daysLate: 3 },
  },
];

const DevTools: React.FC = () => {
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      await triggerManualSync();
      Toast.show({ type: 'success', text1: 'Success', text2: 'Background sync completed. Check Logs for details.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: 'Error', text2: `Sync failed: ${message}` });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSeedHistoricalSteps = async () => {
    setIsSeeding(true);
    try {
      const result = await seedHistoricalSteps();
      if (result.success) {
        Toast.show({ type: 'success', text1: 'Success', text2: `Seeded ${result.recordsInserted} historical step records across the past year.` });
      } else {
        Toast.show({ type: 'error', text1: 'Error', text2: result.error || 'Failed to seed historical step data.' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: 'Error', text2: `Failed to seed historical step data: ${message}` });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSeedData = async (days: number) => {
    setIsSeeding(true);
    try {
      const result = await seedHealthData(days);
      if (result.success) {
        Toast.show({ type: 'success', text1: 'Success', text2: `Seeded ${result.recordsInserted} health records for the past ${days} days.` });
      } else {
        Toast.show({ type: 'error', text1: 'Error', text2: result.error || 'Failed to seed health data.' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: 'Error', text2: `Failed to seed health data: ${message}` });
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
      text1: 'Background Access Permission',
      text2: hasBackgroundAccess
        ? 'Background access permission is granted.'
        : 'Background access permission is NOT granted.',
    });
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">Dev Tools</Text>
      <Text className="text-text-muted mb-3 text-[13px]">
        These tools are only visible in development builds.
      </Text>

      <Text className="text-sm text-text-primary">Seed Health Data</Text>
      <Text className="text-text-muted mb-3 text-[13px]">
        Insert sample health data for testing.
      </Text>

      <View className="flex-row gap-2 flex-wrap justify-between">
        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={() => handleSeedData(7)}
          disabled={isSeeding}
        >
          {isSeeding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white text-base font-bold">7 Days</Text>
          )}
        </Button>

        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={() => handleSeedData(14)}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold">14 Days</Text>
        </Button>

        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={() => handleSeedData(30)}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold">30 Days</Text>
        </Button>

        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={handleSeedHistoricalSteps}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold text-center">1 Year{'\n'}(Steps)</Text>
        </Button>
      </View>
      {Platform.OS === 'android' && (
        <View className="flex-row gap-2 flex-wrap justify-between mt-4">
          <Pressable
            className="bg-accent-primary py-2 px-4 rounded-lg my-1 items-center self-center min-w-20"
            onPress={() => openHealthConnectSettings()}
          >
            <Text className="text-white text-base font-bold">Health Connect</Text>
          </Pressable>
          <Pressable
            className="bg-accent-primary py-2 px-4 rounded-lg my-1 items-center self-center min-w-20"
            onPress={() => openHealthConnectDataManagement()}
          >
            <Text className="text-white text-base font-bold">Health Connect Data</Text>
          </Pressable>
        </View>
      )}
      <View className="mt-5">
        <Text className="text-sm text-text-primary">Background Sync</Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          Manually trigger the background sync process.
        </Text>
        <View className="flex-row gap-2 flex-wrap justify-between">
          <Button
            variant="primary"
            className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
            onPress={handleTriggerSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white text-base font-bold">Trigger Sync</Text>
            )}
          </Button>
          {Platform.OS === 'android' && (
            <Button
              variant="primary"
              className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
              onPress={handleCheckBackgroundPermissions}
            >
              <Text className="text-white text-base font-bold">Check BG Permission</Text>
            </Button>
          )}
        </View>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">Auth</Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          Trigger auth modals for testing.
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
            <Text className="text-white text-base font-bold">Show ReauthModal</Text>
          </Button>
        </View>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">What&apos;s New Banner</Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          Clear the last-seen version so the banner re-appears above the tab bar.
        </Text>
        <View className="flex-row gap-2 flex-wrap">
          <Button
            variant="primary"
            className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
            onPress={async () => {
              await resetWhatsNewBanner();
              Toast.show({
                type: 'success',
                text1: 'Reset',
                text2: "What's New banner will re-appear.",
              });
            }}
          >
            <Text className="text-white text-base font-bold">Reset Banner</Text>
          </Button>
        </View>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">System Announcement</Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          Clear the dismissed announcement flag so active system announcements re-appear.
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
                  text1: 'Reset',
                  text2: 'System announcement modal will re-appear.',
                });
              } catch {
                Toast.show({
                  type: 'error',
                  text1: 'Error',
                  text2: 'Could not reset announcement.',
                });
              }
            }}
          >
            <Text className="text-white text-base font-bold">Reset Announcement</Text>
          </Button>
        </View>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">Food Search Popovers</Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          Clear a seen flag so its coaching popover re-appears on the next food
          search.
        </Text>
        <View className="flex-row gap-2 flex-wrap">
          {FOOD_SEARCH_POPOVERS.map((popover) => (
            <Button
              key={popover.id}
              variant="primary"
              className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
              onPress={async () => {
                try {
                  await popover.reset();
                  Toast.show({
                    type: 'success',
                    text1: 'Reset',
                    text2: `${popover.resetLabel} popover will re-appear.`,
                  });
                } catch {
                  Toast.show({
                    type: 'error',
                    text1: 'Error',
                    text2: 'Could not reset popover.',
                  });
                }
              }}
            >
              <Text className="text-white text-base font-bold">
                {popover.resetLabel}
              </Text>
            </Button>
          ))}
        </View>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">Cycle Card Gallery</Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          Fake-data preview of the dashboard cycle card in every phase. The
          pregnancy and discreet layouts follow real data: switch mode in Hub
          settings.
        </Text>
        {CYCLE_GALLERY_STATES.map(({ label, info }) => (
          <View key={label} className="mb-3">
            <Text className="text-xs text-text-muted mb-1">{label}</Text>
            <View className="border border-border-subtle rounded-xl p-4">
              <CycleCardRingContent title="Cycle Tracking" info={info} />
            </View>
          </View>
        ))}
      </View>

    </View>
  );
};

export default DevTools;
