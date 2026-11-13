import { useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  draftFromEntry,
  moodByName,
  moodTagForValue,
  summarizeCheckins,
  todayInZone,
} from '@workspace/shared';
import type { RootStackParamList } from '../types/navigation';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import Button from '../components/ui/Button';
import MoodCheckinListItem from '../components/mood/MoodCheckinListItem';
import MoodSupportCheckFailed from '../components/mood/MoodSupportCheckFailed';
import { getBuiltInMoodLabels } from '../components/mood/moodLabels';
import {
  useCustomMoods,
  useDeleteMoodCheckin,
  useMoodCheckinsForDate,
} from '../hooks/useMood';
import { useMoodCheckinsSupport } from '../hooks/useMoodCheckinsSupport';
import { usePreferences } from '../hooks/usePreferences';
import { getApiErrorMessage } from '../services/api/errors';
import { getDeviceTimezone } from '../utils/dateUtils';
import { moodDayInZone } from '../utils/moodDay';
import { formatDayLabel } from '../utils/dayLabel';
import { formatTimeLabel } from '../utils/entryTimeDisplay';

type Props = NativeStackScreenProps<RootStackParamList, 'MoodDay'>;
type Navigation = Props['navigation'];

/**
 * A day's mood check-ins, by time, with the day's averages. A server that
 * keeps one entry a day has no list to show, so it goes straight to the
 * one-entry form; a failed server check offers a retry instead of guessing.
 * No params means today.
 */
export default function MoodDayScreen({ navigation, route }: Props) {
  const { preferences } = usePreferences();
  const tz = preferences?.timezone || getDeviceTimezone();
  const requested = route.params?.date ?? todayInZone(tz);
  // The device's today lists the zone's today, the day MoodLog saves a new
  // check-in for it on. The one-entry form keeps the day it was asked for.
  const date = moodDayInZone(requested, tz);
  const { supported, isLoading, retry, retrying } = useMoodCheckinsSupport();
  const legacy = supported === false;

  useEffect(() => {
    if (legacy) navigation.replace('MoodLog', { date: requested });
  }, [legacy, navigation, requested]);

  if (isLoading || legacy) return <MoodDayFrame navigation={navigation} />;
  if (supported === null) {
    return (
      <MoodDayFrame navigation={navigation}>
        <MoodSupportCheckFailed onRetry={retry} retrying={retrying} />
      </MoodDayFrame>
    );
  }
  return (
    <MoodDayContent
      navigation={navigation}
      date={date}
      tz={tz}
      timeFormat={preferences?.time_format}
    />
  );
}

function MoodDayFrame({
  navigation,
  date,
  children,
}: {
  navigation: Navigation;
  date?: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const title = t('mood.dayTitle', { defaultValue: 'Mood' });

  const header = useScreenHeader({
    title,
    nativeTitle: title,
    left: {
      kind: 'dismiss',
      onPress: () => navigation.goBack(),
      accessibilityLabel: t('common.close', { defaultValue: 'Close' }),
    },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        className="flex-1 px-4 py-3"
        contentContainerClassName="gap-4 pb-6"
      >
        {date && (
          <Text className="text-xs text-text-muted">
            {formatDayLabel(date)}
          </Text>
        )}
        {children ?? (
          <ActivityIndicator
            className="py-8"
            accessibilityLabel={t('common.loading', {
              defaultValue: 'Loading...',
            })}
          />
        )}
      </ScrollView>
    </View>
  );
}

function MoodDayContent({
  navigation,
  date,
  tz,
  timeFormat,
}: {
  navigation: Navigation;
  date: string;
  tz: string;
  timeFormat: Parameters<typeof formatTimeLabel>[1];
}) {
  const { t } = useTranslation();
  const { checkins, isLoading, isError } = useMoodCheckinsForDate(date);
  const customMoods = useCustomMoods();
  const deleteCheckin = useDeleteMoodCheckin();
  const labels = getBuiltInMoodLabels(t);

  const rows = checkins ?? [];
  const average = summarizeCheckins(rows);
  const averageTag = moodTagForValue(average.mood);
  const averageMood = averageTag ? moodByName(averageTag) : null;

  // Set at once, so a second confirm sent before the next render is dropped.
  const deleteInFlight = useRef(false);

  const handleDelete = async (id: string) => {
    if (deleteInFlight.current) return;
    deleteInFlight.current = true;
    try {
      await deleteCheckin.mutateAsync(id);
    } catch (error) {
      Toast.show({
        type: 'error',
        text1:
          getApiErrorMessage(error) ??
          t('mood.deleteFailed', { defaultValue: 'Could not delete check-in' }),
      });
    } finally {
      deleteInFlight.current = false;
    }
  };

  const addButton = (
    <Button
      variant="primary"
      onPress={() => navigation.navigate('MoodLog', { date })}
      accessibilityRole="button"
    >
      {t('mood.addCheckin', { defaultValue: 'Add check-in' })}
    </Button>
  );

  if (isLoading) return <MoodDayFrame navigation={navigation} date={date} />;

  return (
    <MoodDayFrame navigation={navigation} date={date}>
      {isError && (
        <Text className="text-xs text-text-muted">
          {t('mood.loadFailed', {
            defaultValue: "Could not load this day's mood",
          })}
        </Text>
      )}
      {rows.length === 0 ? (
        !isError && (
          <Text className="py-6 text-center text-sm text-text-secondary">
            {t('mood.noCheckins', {
              defaultValue: 'No check-ins yet for this day.',
            })}
          </Text>
        )
      ) : (
        <>
          <View className="bg-surface rounded-xl p-3 gap-1.5">
            <View className="flex-row justify-between">
              <Text className="text-xs font-medium uppercase text-text-muted">
                {t('mood.dayAverage', { defaultValue: 'Day average' })}
              </Text>
              <Text className="text-xs text-text-muted">
                {t('mood.checkinCount', {
                  defaultValue: '{{count}} check-ins',
                  defaultValue_one: '{{count}} check-in',
                  defaultValue_other: '{{count}} check-ins',
                  count: average.count,
                })}
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-x-4 gap-y-1">
              <Text className="text-sm font-medium text-text-primary">
                {averageMood
                  ? `${averageMood.emoji} ${labels[averageMood.name] ?? averageMood.displayName}`
                  : '—'}
              </Text>
              {average.energy !== null && (
                <Text className="text-sm text-text-primary">
                  {t('mood.energyOutOfFive', {
                    defaultValue: 'Energy {{value}}/5',
                    value: average.energy,
                  })}
                </Text>
              )}
              {average.focus !== null && (
                <Text className="text-sm text-text-primary">
                  {t('mood.focusOutOfFive', {
                    defaultValue: 'Focus {{value}}/5',
                    value: average.focus,
                  })}
                </Text>
              )}
            </View>
          </View>
          <View className="gap-2">
            {rows.map((entry) => (
              <MoodCheckinListItem
                key={entry.id}
                entry={entry}
                time={
                  formatTimeLabel(draftFromEntry(entry, tz).time, timeFormat) ??
                  ''
                }
                customMoods={customMoods}
                onPress={() =>
                  navigation.navigate('MoodLog', { date, checkinId: entry.id })
                }
                onDelete={() => void handleDelete(entry.id)}
              />
            ))}
          </View>
        </>
      )}
      {addButton}
    </MoodDayFrame>
  );
}
