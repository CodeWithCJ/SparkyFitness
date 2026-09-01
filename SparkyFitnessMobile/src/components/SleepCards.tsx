import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import type { RootStackParamList, TabParamList } from '../types/navigation';
import type { SleepEntry } from '../types/sleep';
import { usePreferences } from '../hooks/usePreferences';
import {
  formatClockTime,
  formatSleepDuration,
  resolveSleepZone,
} from '../utils/sleepDay';
import Icon, { type IconName } from './Icon';

export type SleepCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Diary'>,
  NativeStackNavigationProp<RootStackParamList>
>;

/**
 * Formats one of a session's instants the way every card here wants it: in the account's
 * 12/24-hour preference, and in the zone the session was *recorded* in rather than
 * wherever the device happens to be now — so a night slept in another timezone still
 * reads back as the clock the sleeper saw.
 */
const useEntryClockTime = () => {
  const { preferences } = usePreferences();

  return React.useCallback(
    (iso: string | null | undefined, entry: SleepEntry) =>
      formatClockTime(
        iso,
        preferences?.time_format,
        resolveSleepZone(entry, preferences?.timezone)
      ),
    [preferences?.time_format, preferences?.timezone]
  );
};

const SleepCardIconTitle: React.FC<{ icon: IconName; title: string }> = ({
  icon,
  title,
}) => {
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];
  return (
    <>
      <Icon
        name={icon}
        size={16}
        color={accentPrimary}
        style={{ marginRight: 6 }}
      />
      <Text className="font-bold text-text-secondary">{title}</Text>
    </>
  );
};

interface SleepCardShellProps {
  testID: string;
  icon: IconName;
  title: string;
  accessibilityLabel: string;
  onPress: () => void;
  children: React.ReactNode;
}

const SleepCardShell: React.FC<SleepCardShellProps> = ({
  testID,
  icon,
  title,
  accessibilityLabel,
  onPress,
  children,
}) => {
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];

  return (
    <Pressable
      testID={testID}
      className="bg-surface rounded-xl p-4 mb-2 shadow-sm"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <SleepCardIconTitle icon={icon} title={title} />
        </View>
        <Icon name="chevron-forward" size={14} color={accentPrimary} />
      </View>
      {children}
    </Pressable>
  );
};

interface SleepSummaryProps {
  entry: SleepEntry;
  /** The clock time this card leads with — wake time for Wake Up, bedtime for Bedtime. */
  clockValue: string;
}

const SleepSummary: React.FC<SleepSummaryProps> = ({ entry, clockValue }) => {
  const { t } = useTranslation();

  // `time_asleep_in_seconds` is null for sources that never separate awake-in-bed time.
  // Falling back to the bedtime-to-waketime span keeps the card populated, but the label
  // changes to "Time in bed" so the number is not read as time actually asleep.
  const hasTimeAsleep = entry.time_asleep_in_seconds != null;
  const durationSeconds = hasTimeAsleep
    ? entry.time_asleep_in_seconds
    : entry.duration_in_seconds;
  const durationLabel = hasTimeAsleep
    ? t('sleep.timeAsleep', { defaultValue: 'Time asleep' })
    : t('sleep.timeInBed', { defaultValue: 'Time in bed' });

  return (
    <View className="flex-row items-end justify-between">
      <View>
        <Text className="text-2xl font-bold text-text-primary">
          {clockValue}
        </Text>
      </View>

      <View className="items-end">
        <Text className="text-xs text-text-muted">{durationLabel}</Text>
        <Text className="text-base font-semibold text-text-primary">
          {formatSleepDuration(durationSeconds, t)}
        </Text>
      </View>

      {entry.sleep_score != null ? (
        <View testID="sleep-score" className="items-end">
          <Text className="text-xs text-text-muted">
            {t('sleep.score', { defaultValue: 'Score' })}
          </Text>
          <Text className="text-base font-semibold text-text-primary">
            {Math.round(entry.sleep_score)}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

interface WakeUpCardProps {
  entry: SleepEntry | null;
  day: string;
  navigation: SleepCardNavigation;
}

/**
 * The day's main sleep, framed as the morning it ended.
 */
export const WakeUpCard: React.FC<WakeUpCardProps> = ({
  entry,
  day,
  navigation,
}) => {
  const { t } = useTranslation();
  const entryClockTime = useEntryClockTime();
  const title = t('sleep.wakeUp', { defaultValue: 'Wake Up' });

  if (!entry) return null;

  return (
    <SleepCardShell
      testID="wake-up-card"
      icon="sleep-wake-up"
      title={title}
      accessibilityLabel={t('sleep.wakeUpA11y', {
        defaultValue: 'Open wake up sleep details',
      })}
      onPress={() =>
        navigation.navigate('SleepDetail', { entryId: entry.id, day })
      }
    >
      <SleepSummary
        entry={entry}
        clockValue={entryClockTime(entry.wake_time, entry)}
      />
    </SleepCardShell>
  );
};

interface NapsCardProps {
  naps: SleepEntry[];
  day: string;
  navigation: SleepCardNavigation;
}

export const NapsCard: React.FC<NapsCardProps> = ({
  naps,
  day,
  navigation,
}) => {
  const { t } = useTranslation();
  const entryClockTime = useEntryClockTime();

  if (naps.length === 0) return null;

  const title = t('sleep.napCount', {
    defaultValue: '{{count}} naps',
    defaultValue_one: '{{count}} nap',
    defaultValue_other: '{{count}} naps',
    count: naps.length,
  });

  return (
    <View
      testID="naps-card"
      className="bg-surface rounded-xl p-4 mb-2 shadow-sm"
    >
      <View className="flex-row items-center mb-2">
        <SleepCardIconTitle icon="sleep-nap" title={title} />
      </View>

      {naps.map((nap) => {
        const napTime = entryClockTime(nap.bedtime, nap);
        const napDuration = formatSleepDuration(
          nap.time_asleep_in_seconds ?? nap.duration_in_seconds,
          t
        );

        return (
          <Pressable
            key={nap.id}
            testID={`nap-row-${nap.id}`}
            className="flex-row items-center justify-between py-2"
            onPress={() =>
              navigation.navigate('SleepDetail', { entryId: nap.id, day })
            }
            accessibilityRole="button"
            // Every row would otherwise announce the same "Open nap details", leaving a
            // screen reader user no way to tell one afternoon's nap from another.
            accessibilityLabel={t('sleep.napA11y', {
              defaultValue: 'Open nap details, {{time}}, {{duration}}',
              time: napTime,
              duration: napDuration,
            })}
          >
            <Text className="text-base text-text-primary">{napTime}</Text>
            <Text className="text-base font-semibold text-text-primary">
              {napDuration}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

interface BedTimeCardProps {
  entry: SleepEntry | null;
  day: string;
  navigation: SleepCardNavigation;
}

/**
 * The sleep begun on this day, which lives in the *next* day's record because synced
 * sessions are filed under the day the user woke up.
 */
export const BedTimeCard: React.FC<BedTimeCardProps> = ({
  entry,
  day,
  navigation,
}) => {
  const { t } = useTranslation();
  const entryClockTime = useEntryClockTime();
  const title = t('sleep.bedTime', { defaultValue: 'Bedtime' });

  if (!entry) return null;

  return (
    <SleepCardShell
      testID="bed-time-card"
      icon="sleep-bedtime"
      title={title}
      accessibilityLabel={t('sleep.bedTimeA11y', {
        defaultValue: 'Open bedtime sleep details',
      })}
      onPress={() =>
        navigation.navigate('SleepDetail', { entryId: entry.id, day })
      }
    >
      <SleepSummary
        entry={entry}
        clockValue={entryClockTime(entry.bedtime, entry)}
      />
    </SleepCardShell>
  );
};
