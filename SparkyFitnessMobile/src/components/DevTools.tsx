import React, { useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import Toast from 'react-native-toast-message';
import Button from './ui/Button';
import {
  seedHealthData,
  seedHistoricalSteps,
  seedOldHealthData,
} from '../services/seedHealthData';
import { triggerManualSync } from '../services/backgroundSyncService';
import { notifySessionExpired } from '../services/api/authService';
import { getActiveServerConfig } from '../services/storage';
import { resetWhatsNewBanner } from '../services/whatsNewBanner';
import { resetAnnouncementModal } from './AnnouncementModal';
import {
  FOOD_SEARCH_POPOVERS,
  type FoodSearchPopover,
} from '../services/foodSearchPreferences';
import {
  openHealthConnectSettings,
  openHealthConnectDataManagement,
  getGrantedPermissions,
} from 'react-native-health-connect';
import { CycleCardRingContent, type CycleRingContentInfo } from './CycleCard';

function getPopoverResetLabel(
  t: TFunction,
  popover: FoodSearchPopover,
): string {
  switch (popover.id) {
    case 'sources':
      return t('devTools.popovers.sources');
    case 'provider':
      return t('devTools.popovers.provider');
    default:
      return popover.resetLabel;
  }
}

const CYCLE_GALLERY_BASE: Omit<CycleRingContentInfo, 'day' | 'phase'> = {
  avgCycleLength: 28,
  avgPeriodLength: 5,
  fertileStartDay: 10,
  fertileEndDay: 15,
  ovulationDay: 14,
  nextPeriodStart: '2026-08-28',
  daysLate: 0,
};

const CYCLE_GALLERY_STATES: { info: CycleRingContentInfo }[] = [
  { info: { ...CYCLE_GALLERY_BASE, day: 2, phase: 'menstrual' } },
  { info: { ...CYCLE_GALLERY_BASE, day: 8, phase: 'follicular' } },
  { info: { ...CYCLE_GALLERY_BASE, day: 12, phase: 'fertile' } },
  { info: { ...CYCLE_GALLERY_BASE, day: 14, phase: 'ovulation' } },
  { info: { ...CYCLE_GALLERY_BASE, day: 21, phase: 'luteal' } },
  {
    info: { ...CYCLE_GALLERY_BASE, day: 31, phase: 'luteal', daysLate: 3 },
  },
];

function cycleGalleryLabel(info: CycleRingContentInfo, t: (key: string) => string): string {
  if (info.daysLate > 0) return t('devTools.gallery.state.late');
  switch (info.phase) {
    case 'menstrual': return t('devTools.gallery.state.menstrual');
    case 'follicular': return t('devTools.gallery.state.follicular');
    case 'fertile': return t('devTools.gallery.state.fertile');
    case 'ovulation': return t('devTools.gallery.state.ovulation');
    case 'luteal': return t('devTools.gallery.state.luteal');
    default: return t('devTools.gallery.state.late');
  }
}

const DevTools: React.FC = () => {
  const { t } = useTranslation();
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      await triggerManualSync();
      Toast.show({
        type: 'success',
        text1: t('common.success'),
        text2: t('devTools.toast.syncCompleted'),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({
        type: 'error',
        text1: t('common.error'),
        text2: t('devTools.toast.syncFailed', { message }),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSeedHistoricalSteps = async () => {
    setIsSeeding(true);
    try {
      const result = await seedHistoricalSteps();
      if (result.success) {
        Toast.show({
          type: 'success',
          text1: t('common.success'),
          text2: t('devTools.toast.historicalSeeded', {
            count: result.recordsInserted,
          }),
        });
      } else {
        Toast.show({
          type: 'error',
          text1: t('common.error'),
          text2: result.error ?? t('devTools.toast.historicalSeedFailed'),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({
        type: 'error',
        text1: t('common.error'),
        text2: t('devTools.toast.historicalSeedFailedWithMessage', { message }),
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSeedOldData = async () => {
    setIsSeeding(true);
    try {
      const result = await seedOldHealthData();
      if (result.success) {
        Toast.show({
          type: 'success',
          text1: t('common.success'),
          text2: t('devTools.toast.seedOldSeeded', {
            count: result.recordsInserted,
          }),
        });
      } else {
        Toast.show({
          type: 'error',
          text1: t('common.error'),
          text2: result.error ?? t('devTools.toast.seedOldFailed'),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({
        type: 'error',
        text1: t('common.error'),
        text2: t('devTools.toast.seedOldFailedWithMessage', { message }),
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSeedData = async (days: number) => {
    setIsSeeding(true);
    try {
      const result = await seedHealthData(days);
      if (result.success) {
        Toast.show({
          type: 'success',
          text1: t('common.success'),
          text2: t('devTools.toast.healthSeeded', {
            count: result.recordsInserted,
            days,
          }),
        });
      } else {
        Toast.show({
          type: 'error',
          text1: t('common.error'),
          text2: result.error ?? t('devTools.toast.healthSeedFailed'),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({
        type: 'error',
        text1: t('common.error'),
        text2: t('devTools.toast.healthSeedFailedWithMessage', { message }),
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleCheckBackgroundPermissions = async () => {
    const permissions = await getGrantedPermissions();
    const hasBackgroundAccess = permissions.some(
      permission =>
        permission.accessType === 'read' &&
        permission.recordType === 'BackgroundAccessPermission',
    );

    Toast.show({
      type: hasBackgroundAccess ? 'success' : 'error',
      text1: t('devTools.healthConnect.backgroundPermission.title'),
      text2: hasBackgroundAccess
        ? t('devTools.healthConnect.backgroundPermission.granted')
        : t('devTools.healthConnect.backgroundPermission.notGranted'),
    });
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-3 text-text-primary">
        {t('devTools.title')}
      </Text>
      <Text className="text-text-muted mb-3 text-[13px]">
        {t('devTools.description')}
      </Text>

      <Text className="text-sm text-text-primary">
        {t('devTools.seed.title')}
      </Text>
      <Text className="text-text-muted mb-3 text-[13px]">
        {t('devTools.seed.description')}
      </Text>

      <View className="flex-row gap-2 flex-wrap justify-between">
        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={() => handleSeedData(7)}
          loading={isSeeding}
          textClassName="font-bold"
        >
          {isSeeding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white text-base font-bold">
              {t('devTools.seed.sevenDays')}
            </Text>
          )}
        </Button>

        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={() => handleSeedData(14)}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold">
            {t('devTools.seed.fourteenDays')}
          </Text>
        </Button>

        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={() => handleSeedData(30)}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold">
            {t('devTools.seed.thirtyDays')}
          </Text>
        </Button>

        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={handleSeedHistoricalSteps}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold text-center">
            {t('devTools.seed.oneYear')}
            {'\n'}
            {t('devTools.seed.steps')}
          </Text>
        </Button>

        <Button
          variant="primary"
          className="py-2 px-4 rounded-lg my-1 self-center min-w-20"
          onPress={handleSeedOldData}
          disabled={isSeeding}
        >
          <Text className="text-white text-base font-bold text-center">{t('devTools.seed.oldData')}{'\n'}{t('devTools.seed.oldRange')}</Text>
        </Button>
      </View>

      {Platform.OS === 'android' && (
        <View className="flex-row gap-2 flex-wrap justify-between mt-4">
          <Pressable
            className="bg-accent-primary py-2 px-4 rounded-lg my-1 items-center self-center min-w-20"
            onPress={() => openHealthConnectSettings()}
          >
            <Text className="text-white text-base font-bold">
              {t('devTools.healthConnect.title')}
            </Text>
          </Pressable>
          <Pressable
            className="bg-accent-primary py-2 px-4 rounded-lg my-1 items-center self-center min-w-20"
            onPress={() => openHealthConnectDataManagement()}
          >
            <Text className="text-white text-base font-bold">
              {t('devTools.healthConnect.data')}
            </Text>
          </Pressable>
        </View>
      )}

      <View className="mt-5">
        <Text className="text-sm text-text-primary">
          {t('devTools.sync.title')}
        </Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          {t('devTools.sync.description')}
        </Text>
        <View className="flex-row gap-2 flex-wrap justify-between">
          <Button
            variant="primary"
            className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
            onPress={handleTriggerSync}
            loading={isSyncing}
            textClassName="font-bold"
          >
            {isSyncing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white text-base font-bold">
                {t('devTools.sync.trigger')}
              </Text>
            )}
          </Button>
          {Platform.OS === 'android' && (
            <Button
              variant="primary"
              className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
              onPress={handleCheckBackgroundPermissions}
            >
              <Text className="text-white text-base font-bold">
                {t('devTools.sync.checkPermission')}
              </Text>
            </Button>
          )}
        </View>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">
          {t('devTools.auth.title')}
        </Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          {t('devTools.auth.description')}
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
            <Text className="text-white text-base font-bold">
              {t('devTools.auth.reauth')}
            </Text>
          </Button>
        </View>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">
          {t('devTools.whatsNew.title')}
        </Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          {t('devTools.whatsNew.description')}
        </Text>
        <View className="flex-row gap-2 flex-wrap">
          <Button
            variant="primary"
            className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
            onPress={async () => {
              await resetWhatsNewBanner();
              Toast.show({
                type: 'success',
                text1: t('devTools.toast.reset'),
                text2: t('devTools.toast.whatsNewReset'),
              });
            }}
          >
            <Text className="text-white text-base font-bold">
              {t('devTools.whatsNew.reset')}
            </Text>
          </Button>
        </View>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">
          {t('devTools.announcement.title')}
        </Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          {t('devTools.announcement.description')}
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
                  text1: t('devTools.toast.reset'),
                  text2: t('devTools.toast.announcementReset'),
                });
              } catch {
                Toast.show({
                  type: 'error',
                  text1: t('common.error'),
                  text2: t('devTools.toast.announcementResetFailed'),
                });
              }
            }}
          >
            <Text className="text-white text-base font-bold">
              {t('devTools.announcement.reset')}
            </Text>
          </Button>
        </View>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">
          {t('devTools.popovers.title')}
        </Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          {t('devTools.popovers.description')}
        </Text>
        <View className="flex-row gap-2 flex-wrap">
          {FOOD_SEARCH_POPOVERS.map(popover => {
            const label = getPopoverResetLabel(t, popover);
            return (
              <Button
                key={popover.id}
                variant="primary"
                className="py-2 px-4 rounded-lg my-1 self-center min-w-30"
                onPress={async () => {
                  try {
                    await popover.reset();
                    Toast.show({
                      type: 'success',
                      text1: t('devTools.toast.reset'),
                      text2: t('devTools.toast.popoverReset', { label }),
                    });
                  } catch {
                    Toast.show({
                      type: 'error',
                      text1: t('common.error'),
                      text2: t('devTools.toast.popoverResetFailed'),
                    });
                  }
                }}
              >
                <Text className="text-white text-base font-bold">{label}</Text>
              </Button>
            );
          })}
        </View>
      </View>

      <View className="mt-5">
        <Text className="text-sm text-text-primary">
          {t('devTools.gallery.title')}
        </Text>
        <Text className="text-text-muted mb-3 text-[13px]">
          {t('devTools.gallery.description')}
        </Text>
        {CYCLE_GALLERY_STATES.map(({ info }) => (
          <View key={`${info.phase}-${info.day}`} className="mb-3">
            <Text className="text-xs text-text-muted mb-1">{cycleGalleryLabel(info, t)}</Text>
            <View className="border border-border-subtle rounded-xl p-4">
              <CycleCardRingContent title={t('devTools.gallery.cycleTracking')} info={info} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

export default DevTools;
