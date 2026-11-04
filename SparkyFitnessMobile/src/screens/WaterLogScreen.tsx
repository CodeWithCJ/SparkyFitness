import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import {
  instantHourMinute,
  isValidTimeZone,
  type WaterIntakeLogEntry,
} from '@workspace/shared';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import { invalidateFoodCache } from '../hooks/invalidateFoodCache';
import { waterIntakeLogQueryKey } from '../hooks/queryKeys';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { getAppLocale } from '../localization';
import {
  deleteWaterIntakeLogEntry,
  fetchWaterIntakeLog,
} from '../services/api/measurementsApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import { isManualSource } from '../utils/customMeasurementsForm';
import { formatDateLabel, getDeviceTimezone } from '../utils/dateUtils';
import { formatTimeLabel } from '../utils/entryTimeDisplay';
import {
  WATER_UNIT_LABELS,
  formatVolumeForUnit,
  volumeFromMl,
} from '../utils/unitConversions';
import { getSourceLabel } from '../utils/workoutSession';

type WaterLogScreenProps = RootStackScreenProps<'WaterLog'>;

/**
 * The drinks logged on one day, newest first as the server returns them: the
 * mobile counterpart of the web water card's "Today's drinks" list. Manual
 * drinks can be deleted; synced ones can't, since the provider would add them
 * back on its next sync.
 */
const WaterLogScreen: React.FC<WaterLogScreenProps> = ({ route }) => {
  const { date } = route.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const queryClient = useQueryClient();
  const [accentColor, hydrationColor, dangerColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-hydration',
    '--color-icon-danger',
  ]) as [string, string, string];
  const [refreshing, setRefreshing] = useState(false);
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const { preferences } = usePreferences();
  const timezone =
    preferences?.timezone && isValidTimeZone(preferences.timezone)
      ? preferences.timezone
      : getDeviceTimezone();
  const unit = preferences?.water_display_unit ?? 'ml';
  const unitLabel = WATER_UNIT_LABELS[unit] ?? unit;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: waterIntakeLogQueryKey(date),
    queryFn: () => fetchWaterIntakeLog(date),
    // Drinks logged from native code (shortcut, Quick Settings tile, widgets)
    // never touch this cache, and staleTime is Infinity: re-read when the
    // screen opens and when the app returns to the front.
    refetchOnMount: 'always',
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => subscription.remove();
  }, [refetch]);
  const entries = data ?? [];

  const header = useScreenHeader({
    title: t('waterLog.title', { defaultValue: 'Drinks' }),
    left: { kind: 'back' },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const formatTime = (entry: WaterIntakeLogEntry) => {
    const { hour, minute } = instantHourMinute(
      entry.logged_at || entry.created_at,
      timezone
    );
    const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return formatTimeLabel(hhmm, preferences?.time_format) ?? hhmm;
  };

  const deleteEntry = async (entry: WaterIntakeLogEntry) => {
    setDeletingIds((prev) => new Set(prev).add(entry.id));
    try {
      await deleteWaterIntakeLogEntry(entry.id);
    } catch {
      Toast.show({
        type: 'error',
        text1: t('waterLog.deleteFailed', {
          defaultValue: 'Could not delete that drink',
        }),
      });
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
      // A linked drink takes its food entry with it, so the food caches
      // refresh too, not only the water ones.
      invalidateFoodCache(queryClient, date);
    }
  };

  const confirmDelete = (entry: WaterIntakeLogEntry) => {
    Alert.alert(
      t('waterLog.deleteTitle', { defaultValue: 'Delete drink' }),
      entry.food_entry_id
        ? t('waterLog.deleteLinkedMessage', {
            defaultValue:
              'Delete this drink? Its food diary entry is deleted too.',
          })
        : t('waterLog.deleteMessage', { defaultValue: 'Delete this drink?' }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => void deleteEntry(entry),
        },
      ]
    );
  };

  const renderEntry = ({ item }: { item: WaterIntakeLogEntry }) => {
    const ml = Number(item.water_ml);
    const name =
      item.container_name || t('waterLog.drink', { defaultValue: 'Drink' });
    const manual = isManualSource(item.source);
    return (
      <View
        testID="water-log-row"
        className="flex-row items-center bg-surface rounded-xl px-4 py-3 mb-2 shadow-sm"
      >
        <Text
          className="text-sm text-text-muted mr-3"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatTime(item)}
        </Text>
        <View className="flex-1 flex-row items-center mr-2">
          <Text
            numberOfLines={1}
            className="text-base text-text-primary flex-shrink"
          >
            {name}
          </Text>
          {item.food_entry_id ? (
            <View
              className="ml-1.5"
              accessible
              accessibilityLabel={t('waterLog.linkedDrink', {
                defaultValue: 'Linked to a food entry',
              })}
            >
              <Icon name="food" size={14} color={accentColor} />
            </View>
          ) : null}
          {/* Synced drinks are labelled so it is clear why they have no
              delete; manual ones stay unlabelled. */}
          {!manual ? (
            <View className="ml-2 rounded px-1.5 py-0.5 bg-raised">
              <Text className="text-xs text-text-secondary">
                {getSourceLabel(item.source)}
              </Text>
            </View>
          ) : null}
        </View>
        {/* A drink with a hydration factor of 0 (an espresso, a spirit)
            credits no water on purpose; "0 ml" would read as an error. */}
        {ml === 0 ? (
          <Text className="text-sm text-text-muted">
            {t('waterLog.noWaterCredit', { defaultValue: 'No water' })}
          </Text>
        ) : (
          <Text
            className="text-sm font-semibold"
            style={{ color: hydrationColor }}
          >
            {formatVolumeForUnit(volumeFromMl(ml, unit), unit)} {unitLabel}
          </Text>
        )}
        {manual ? (
          <Pressable
            onPress={() => confirmDelete(item)}
            disabled={deletingIds.has(item.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="ml-3 p-1"
            style={deletingIds.has(item.id) ? { opacity: 0.4 } : undefined}
            accessibilityRole="button"
            accessibilityLabel={t('waterLog.deleteDrink', {
              defaultValue: 'Delete {{name}} at {{time}}',
              name,
              time: formatTime(item),
            })}
          >
            <Icon name="trash" size={18} color={dangerColor} />
          </Pressable>
        ) : (
          <View className="ml-3 w-[26px]" />
        )}
      </View>
    );
  };

  const content = () => {
    if (isLoading) {
      return (
        <StatusView
          loading
          title={t('waterLog.loading', { defaultValue: 'Loading drinks...' })}
        />
      );
    }
    // A failed refetch keeps the cached drinks on screen; only a load with
    // nothing cached falls back to the error view.
    if (isError && data === undefined) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={t('waterLog.loadFailed', {
            defaultValue: 'Could not load drinks',
          })}
          subtitle={t('waterLog.loadFailedSubtitle', {
            defaultValue: 'Check your connection and try again.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
            variant: 'primary',
          }}
        />
      );
    }
    return (
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={renderEntry}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 16 + activeWorkoutBarPadding,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accentColor}
          />
        }
        ListHeaderComponent={
          <Text className="text-sm font-semibold text-text-secondary mb-2">
            {formatDateLabel(date, t, getAppLocale())}
          </Text>
        }
        ListEmptyComponent={
          <StatusView
            inline
            icon="water"
            iconTone="muted"
            title={t('waterLog.emptyTitle', {
              defaultValue: 'No drinks logged',
            })}
            subtitle={t('waterLog.emptySubtitle', {
              defaultValue:
                'Drinks you log with the water buttons, a drink preset, the watch or a synced app show up here.',
            })}
          />
        }
      />
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {content()}
    </View>
  );
};

export default WaterLogScreen;
