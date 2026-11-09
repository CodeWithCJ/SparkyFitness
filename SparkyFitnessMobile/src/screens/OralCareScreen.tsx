import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import {
  isSparkyOralCareProvider,
  ORAL_CARE_DEFAULT_SETTINGS,
  utcToLocalDateTimeInput,
  type OralCareSessionResponse,
} from '@workspace/shared';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import BottomSheetPicker from '../components/BottomSheetPicker';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import { BrushingTimerModal } from '../components/oralCare/BrushingTimerModal';
import {
  useOralCareDay,
  useOralCareHistory,
  useOralCareMutations,
} from '../hooks/useOralCare';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import type { RootStackScreenProps } from '../types/navigation';
import { formatLocalizedTimeOfDay } from '../utils/medicationScheduleLocalization';
import { getDeviceTimezone } from '../utils/dateUtils';
import { formatOralCareClock, oralCareSessionLabel } from '../utils/oralCare';

type Props = RootStackScreenProps<'OralCare'>;

const DAILY_TARGET_OPTIONS = [1, 2, 3, 4, 5, 6];
const TARGET_SECONDS_OPTIONS = [60, 90, 120, 150, 180, 240, 300];
const WEEK_DAYS = 7;

/** A day of oral care: the goal, the streak, the last week and the day's sessions. */
const OralCareScreen: React.FC<Props> = ({ route, navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { preferences } = usePreferences();
  const timezone = getDeviceTimezone();
  const [accentPrimary, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  const [date] = useState(
    () => route.params?.date ?? useDiaryDateStore.getState().selectedDate
  );
  const dayQuery = useOralCareDay(date);
  const historyQuery = useOralCareHistory(date);
  const { createSession, deleteSession, saveGoal } = useOralCareMutations();
  const [timerVisible, setTimerVisible] = useState(false);

  const header = useScreenHeader({ left: { kind: 'back' } });

  const day = dayQuery.data;
  const history = historyQuery.data;
  const settings = day?.settings ?? ORAL_CARE_DEFAULT_SETTINGS;
  const week = useMemo(
    () => (history?.days ?? []).slice(-WEEK_DAYS),
    [history?.days]
  );

  const timeOf = (session: OralCareSessionResponse) =>
    session.start_time
      ? formatLocalizedTimeOfDay(
          utcToLocalDateTimeInput(session.start_time, timezone).slice(11, 16),
          undefined,
          preferences?.time_format
        )
      : null;

  const saveGoalChange = async (patch: Partial<typeof settings>) => {
    try {
      await saveGoal({ ...settings, ...patch });
    } catch {
      Toast.show({
        type: 'error',
        text1: t('oralCare.errors.goal', {
          defaultValue: 'Could not save the goal.',
        }),
      });
    }
  };

  const confirmDelete = (session: OralCareSessionResponse) => {
    Alert.alert(
      t('oralCare.delete.title', { defaultValue: 'Delete this session?' }),
      isSparkyOralCareProvider(session.provider)
        ? undefined
        : t('oralCare.delete.synced', {
            defaultValue:
              'It comes back on the next sync unless you delete it in the Health app too.',
          }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => {
            deleteSession(session.id).catch(() =>
              Toast.show({
                type: 'error',
                text1: t('oralCare.errors.delete', {
                  defaultValue: 'Could not delete the session.',
                }),
              })
            );
          },
        },
      ]
    );
  };

  const handleTimerSave = async (startedAt: Date, duration: number) => {
    const durationSeconds = Math.min(duration, 3600);
    try {
      await createSession({
        entry_date: date,
        start_time: startedAt.toISOString(),
        end_time: new Date(
          startedAt.getTime() + durationSeconds * 1000
        ).toISOString(),
        duration_seconds: durationSeconds,
        care_type: 'brushing',
        provider: 'timer',
      });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: t('oralCare.errors.save', {
          defaultValue: 'Could not save the session.',
        }),
      });
      throw error;
    }
  };

  const renderContent = () => {
    if (dayQuery.isLoading) {
      return (
        <StatusView
          loading
          title={t('oralCare.loading', {
            defaultValue: 'Loading oral care...',
          })}
        />
      );
    }
    if (dayQuery.isError || !day) {
      return (
        <StatusView
          icon="oral-care"
          iconTone="danger"
          iconSize={64}
          title={t('oralCare.loadFailed', {
            defaultValue: 'Could not load oral care',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void dayQuery.refetch(),
            variant: 'primary',
          }}
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
        <Text className="text-2xl font-bold text-text-primary mb-3">
          {t('oralCare.title', { defaultValue: 'Oral care' })}
        </Text>

        <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
          <View className="flex-row justify-between">
            <View>
              <Text className="text-xs text-text-muted">
                {t('oralCare.stats.brushed', { defaultValue: 'Brushed' })}
              </Text>
              <Text className="text-2xl font-bold text-text-primary">
                {t('oralCare.stats.ofTarget', {
                  defaultValue: '{{brushed}} of {{target}}',
                  brushed: day.brushing_count,
                  target: settings.daily_target,
                })}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-xs text-text-muted">
                {t('oralCare.stats.time', { defaultValue: 'Time brushing' })}
              </Text>
              <Text className="text-2xl font-bold text-text-primary">
                {formatOralCareClock(day.brushing_seconds)}
              </Text>
            </View>
          </View>
          <Text className="text-sm text-text-secondary mt-2">
            {t('oralCare.stats.streak', {
              defaultValue: 'Streak: {{count}} days',
              count: day.streak,
            })}
            {history
              ? ` · ${t('oralCare.stats.best', {
                  defaultValue: 'Best: {{count}} days',
                  count: history.best_streak,
                })}`
              : ''}
          </Text>
          {week.length > 0 && (
            <View
              className="flex-row justify-between mt-3"
              accessibilityLabel={t('oralCare.stats.weekA11y', {
                defaultValue: 'Goal met on {{count}} of the last 7 days',
                count: week.filter((d) => d.goal_met).length,
              })}
            >
              {week.map((d) => (
                <View
                  key={d.date}
                  className={`h-3 flex-1 mx-0.5 rounded-full ${
                    d.goal_met
                      ? 'bg-sky-500'
                      : d.brushing_count > 0
                        ? 'bg-sky-500/40'
                        : 'bg-border-subtle'
                  }`}
                />
              ))}
            </View>
          )}
        </View>

        <View className="flex-row gap-3 mb-4">
          <View className="flex-1">
            <Button variant="primary" onPress={() => setTimerVisible(true)}>
              {t('oralCare.actions.startTimer', {
                defaultValue: 'Start timer',
              })}
            </Button>
          </View>
          <View className="flex-1">
            <Button
              variant="secondary"
              onPress={() => navigation.navigate('OralCareLog', { date })}
            >
              {t('oralCare.actions.log', { defaultValue: 'Log' })}
            </Button>
          </View>
        </View>

        <Text className="text-xs font-semibold uppercase text-text-secondary mb-2">
          {t('oralCare.sessions', { defaultValue: 'Sessions' })}
        </Text>
        <View className="bg-surface rounded-xl mb-4 overflow-hidden">
          {day.sessions.length === 0 ? (
            <Text className="text-sm text-text-muted p-4">
              {t('oralCare.empty', {
                defaultValue: 'Nothing logged for this day',
              })}
            </Text>
          ) : (
            day.sessions.map((session, index) => {
              const fromSparky = isSparkyOralCareProvider(session.provider);
              const time = timeOf(session);
              return (
                <Pressable
                  key={session.id}
                  disabled={!fromSparky}
                  onPress={() =>
                    navigation.navigate('OralCareLog', { session })
                  }
                  accessibilityRole={fromSparky ? 'button' : undefined}
                  className={`flex-row items-center px-4 py-3 ${
                    index > 0 ? 'border-t border-border-subtle' : ''
                  }`}
                >
                  <View className="flex-1">
                    <Text className="text-base text-text-primary font-medium">
                      {oralCareSessionLabel(session, t)}
                    </Text>
                    <Text className="text-xs text-text-muted mt-0.5">
                      {[
                        time,
                        session.duration_seconds != null
                          ? formatOralCareClock(session.duration_seconds)
                          : null,
                        session.provider === 'timer'
                          ? t('oralCare.source.timer', {
                              defaultValue: 'Timer',
                            })
                          : !fromSparky
                            ? t('oralCare.source.health', {
                                defaultValue: 'Apple Health',
                              })
                            : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    {session.covered_by_sync && (
                      <Text className="text-xs text-text-secondary mt-0.5">
                        {t('oralCare.coveredBySync', {
                          defaultValue:
                            'Also recorded by Apple Health · counted once',
                        })}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => confirmDelete(session)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.delete', {
                      defaultValue: 'Delete',
                    })}
                    className="p-2"
                  >
                    <Icon name="trash" size={18} color={textMuted} />
                  </Pressable>
                  {fromSparky && (
                    <Icon
                      name="chevron-forward"
                      size={14}
                      color={accentPrimary}
                    />
                  )}
                </Pressable>
              );
            })
          )}
        </View>

        <Text className="text-xs font-semibold uppercase text-text-secondary mb-2">
          {t('oralCare.goal.title', { defaultValue: 'Brushing goal' })}
        </Text>
        <View className="gap-2">
          <BottomSheetPicker
            value={settings.daily_target}
            title={t('oralCare.goal.dailyTarget', {
              defaultValue: 'Brushes per day',
            })}
            options={DAILY_TARGET_OPTIONS.map((n) => ({
              value: n,
              label: t('oralCare.goal.perDay', {
                defaultValue: '{{count}} times a day',
                count: n,
              }),
            }))}
            onSelect={(value) => void saveGoalChange({ daily_target: value })}
          />
          <BottomSheetPicker
            value={settings.target_seconds}
            title={t('oralCare.goal.targetTime', {
              defaultValue: 'Time per brush',
            })}
            options={TARGET_SECONDS_OPTIONS.map((s) => ({
              value: s,
              label: formatOralCareClock(s),
            }))}
            onSelect={(value) => void saveGoalChange({ target_seconds: value })}
          />
          <Text className="text-xs text-text-muted">
            {t('oralCare.goal.hint', {
              defaultValue:
                'Dentists usually recommend brushing twice a day for 2 minutes.',
            })}
          </Text>
        </View>
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
      <BrushingTimerModal
        visible={timerVisible}
        targetSeconds={settings.target_seconds}
        onClose={() => setTimerVisible(false)}
        onSave={handleTimerSave}
      />
    </View>
  );
};

export default OralCareScreen;
