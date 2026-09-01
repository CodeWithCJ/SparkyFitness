import type { RecordZone } from '@workspace/shared';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Hypnogram from '../components/Hypnogram';
import SleepBiometrics from '../components/SleepBiometrics';
import SleepStagesBreakdown from '../components/SleepStagesBreakdown';
import StatusView from '../components/StatusView';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useSleepDetail } from '../hooks/useSleepDetail';
import { getAppLocale } from '../localization';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import type { SleepEntry } from '../types/sleep';
import { formatDateLabel } from '../utils/dateUtils';
import {
  formatClockTime,
  formatSleepDuration,
  resolveSleepZone,
} from '../utils/sleepDay';

type Props = RootStackScreenProps<'SleepDetail'>;

interface SleepDetailHeaderProps {
  entry: SleepEntry;
  /** The wall clock this session's times are read against; see `resolveSleepZone`. */
  zone: RecordZone | null;
}

const SleepDetailTitle: React.FC<{ entryDate: string }> = ({ entryDate }) => {
  const { t } = useTranslation();

  return (
    <View className="mb-4">
      <Text className="text-text-primary text-3xl font-bold">
        {t('sleep.detailTitle', { defaultValue: 'Sleep' })}
      </Text>
      <Text
        testID="sleep-detail-date"
        className="text-text-secondary text-base mt-1"
      >
        {formatDateLabel(entryDate, t, getAppLocale())}
      </Text>
    </View>
  );
};

const SleepDetailHeader: React.FC<SleepDetailHeaderProps> = ({
  entry,
  zone,
}) => {
  const { t } = useTranslation();
  const { preferences } = usePreferences();

  const hasTimeAsleep = entry.time_asleep_in_seconds != null;
  const durationSeconds = hasTimeAsleep
    ? entry.time_asleep_in_seconds
    : entry.duration_in_seconds;
  const durationLabel = hasTimeAsleep
    ? t('sleep.timeAsleep', { defaultValue: 'Time asleep' })
    : t('sleep.timeInBed', { defaultValue: 'Time in bed' });

  return (
    <View
      testID="sleep-detail-header"
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
    >
      <Text className="text-base font-semibold text-text-primary mb-2">
        {t('sleep.quality', { defaultValue: 'Sleep Quality' })}
      </Text>
      <View className="flex-row items-end justify-between">
        <View>
          <Text className="text-sm text-text-muted">{durationLabel}</Text>
          <Text className="text-3xl font-bold text-text-primary">
            {formatSleepDuration(durationSeconds, t)}
          </Text>
        </View>
        {entry.sleep_score != null ? (
          <View testID="sleep-score" className="items-end">
            <Text className="text-sm text-text-muted">
              {t('sleep.score', { defaultValue: 'Score' })}
            </Text>
            <Text className="text-3xl font-bold text-text-primary">
              {Math.round(entry.sleep_score)}
            </Text>
          </View>
        ) : null}
      </View>

      <Text className="text-sm text-text-secondary mt-2">
        {t('sleep.bedtimeToWake', {
          defaultValue: '{{bedtime}} – {{wakeTime}}',
          bedtime: formatClockTime(
            entry.bedtime,
            preferences?.time_format,
            zone
          ),
          wakeTime: formatClockTime(
            entry.wake_time,
            preferences?.time_format,
            zone
          ),
        })}
      </Text>
    </View>
  );
};

/**
 * The full picture for one sleep session: how long, how good, the stage timeline, the
 * stage totals, and overnight biometrics.
 *
 * Accumulated sleep debt is deliberately absent — that analysis lives in the desktop
 * report, which has the room to show its 14-day breakdown and trend.
 *
 * Every block below the header is independently optional: a source that records no stages
 * still gets a breakdown from the aggregate columns, and a phone with no pulse oximeter
 * simply has no biometrics section.
 */
const SleepDetailScreen: React.FC<Props> = ({ route }) => {
  const { entryId, day } = route.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const { entry, stages, isLoading, isError, refetch } = useSleepDetail(
    entryId,
    day
  );
  const { preferences } = usePreferences();

  // Resolved once for the whole screen so the header's bedtime-to-wake range and the
  // hypnogram's axis labels can never disagree about which clock they are on.
  const zone = entry ? resolveSleepZone(entry, preferences?.timezone) : null;

  const header = useScreenHeader({ left: { kind: 'back' } });

  const renderContent = () => {
    if (isLoading) {
      return (
        <StatusView
          loading
          title={t('sleep.loading', { defaultValue: 'Loading sleep...' })}
        />
      );
    }

    if (isError) {
      return (
        <StatusView
          icon="sleep-bedtime"
          iconTone="danger"
          iconSize={64}
          title={t('sleep.loadFailed', {
            defaultValue: 'Could not load this sleep session',
          })}
          subtitle={t('sleep.loadFailedSubtitle', {
            defaultValue: 'Please check your connection and try again.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
            variant: 'primary',
          }}
        />
      );
    }

    if (!entry) {
      return (
        <StatusView
          icon="sleep-bedtime"
          iconTone="muted"
          iconSize={64}
          title={t('sleep.notFound', { defaultValue: 'Sleep entry not found' })}
          subtitle={t('sleep.notFoundSubtitle', {
            defaultValue:
              'This sleep session may have been removed or is no longer synced.',
          })}
        />
      );
    }

    return (
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <SleepDetailTitle entryDate={entry.entry_date} />
        <SleepDetailHeader entry={entry} zone={zone} />
        <Hypnogram stages={stages} zone={zone} />
        <SleepStagesBreakdown entry={entry} />
        <SleepBiometrics entry={entry} />
      </ScrollView>
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {renderContent()}
    </View>
  );
};

export default SleepDetailScreen;
