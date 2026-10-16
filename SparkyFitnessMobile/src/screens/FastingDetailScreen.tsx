import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';

import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import SegmentedControl from '../components/SegmentedControl';
import { FastingTimerRing } from '../components/FastingTimerRing';
import { FastingZoneBar } from '../components/FastingZoneBar';
import { EatingWindowZoneBar } from '../components/EatingWindowZoneBar';
import StatusView from '../components/StatusView';
import FastingReport from '../components/FastingReport';
import FastingProtocolSheet, {
  type FastingProtocolSheetRef,
} from '../components/FastingProtocolSheet';
import EndFastSheet, { type EndFastSheetRef } from '../components/EndFastSheet';
import FastingEditSheet, {
  type FastingEditSheetRef,
} from '../components/FastingEditSheet';
import { FastingHistoryRow } from '../components/FastingHistorySheet';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import {
  useCurrentFast,
  useFastingStats,
  useFastingHistory,
  useDeleteFast,
} from '../hooks/useFasting';
import { usePreferences } from '../hooks/usePreferences';
import { useFastingTimer } from '../hooks/useFastingTimer';
import { useHeaderActionColors } from '../hooks/useHeaderActionColors';
import {
  formatFastingStats,
  formatTime,
  formatHoursMinutes,
} from '../utils/fasting';
import { formatDateLabel, toLocalDateString } from '../utils/dateUtils';
import { METABOLIC_STAGES, getMetabolicStageIndex } from '../constants/fasting';
import {
  FastingStatCard,
  FastingProtocolBadge,
} from '../components/FastingSharedComponents';
import { addLog } from '../services/LogService';
import type { FastingLog } from '../types/fasting';
import type { RootStackScreenProps } from '../types/navigation';
import {
  localizeFastingStage,
  localizeProtocolBadge,
} from '../utils/fastingLocalization';

type Props = RootStackScreenProps<'FastingDetail'>;

const RING_SIZE = 240;

const DetailRow: React.FC<{
  label: string;
  value: string;
  isLast?: boolean;
}> = ({ label, value, isLast }) => (
  <View
    className={`flex-row items-center justify-between px-4 py-3 ${
      isLast ? '' : 'border-b border-border-subtle'
    }`}
  >
    <Text className="text-sm text-text-secondary">{label}</Text>
    <Text className="text-sm font-semibold text-text-primary">{value}</Text>
  </View>
);

const FastingDetailScreen: React.FC<Props> = ({ navigation }) => {
  const { t, i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl')
    ? 'pl-PL'
    : 'en-US';
  const { preferences } = usePreferences();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');

  type TabKey = 'fasting' | 'history' | 'report';
  const [activeTab, setActiveTab] = useState<TabKey>('fasting');
  const [historyLimit, setHistoryLimit] = useState(25);

  const protocolSheetRef = useRef<FastingProtocolSheetRef>(null);
  const endFastSheetRef = useRef<EndFastSheetRef>(null);
  const editSheetRef = useRef<FastingEditSheetRef>(null);

  // Read-only here — the dashboard `FastingGoalReconciler` is the single owner
  // of goal-notification reconciliation.
  const { data: currentFast, isLoading } = useCurrentFast();
  const { data: stats } = useFastingStats();
  const { data: history, isLoading: isHistoryLoading } = useFastingHistory(
    historyLimit,
    0
  );
  const { mutate: deleteFast } = useDeleteFast();

  const pastFasts = (history ?? []).filter((fast) => fast.status !== 'ACTIVE');
  const canLoadMoreHistory = (history?.length ?? 0) >= historyLimit;

  const handleEditPastFast = (fast: FastingLog) => {
    editSheetRef.current?.present(fast);
  };

  const handleDeletePastFast = (fast: FastingLog) => {
    Alert.alert(
      t('fastingHistory.deleteTitle', { defaultValue: 'Delete fast?' }),
      t('fastingHistory.deleteMessage', {
        defaultValue: 'This cannot be undone.',
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
            deleteFast(fast.id, {
              onSuccess: () =>
                Toast.show({
                  type: 'success',
                  text1: t('fastingHistory.deleted', {
                    defaultValue: 'Fast deleted',
                  }),
                }),
              onError: (error) => {
                addLog(`Failed to delete fast: ${error}`, 'ERROR');
                Toast.show({
                  type: 'error',
                  text1: t('fastingHistory.failedDelete', {
                    defaultValue: 'Failed to delete fast',
                  }),
                  text2: t('common.tryAgain', {
                    defaultValue: 'Please try again.',
                  }),
                });
              },
            });
          },
        },
      ]
    );
  };

  const isEatingWindow =
    !!currentFast &&
    currentFast.status === 'ACTIVE' &&
    !!currentFast.is_eating_window;
  const isFasting =
    !!currentFast && currentFast.status === 'ACTIVE' && !isEatingWindow;
  const timer = useFastingTimer(
    currentFast?.start_time,
    currentFast?.target_end_time,
    isFasting || isEatingWindow
  );

  const [accentPrimary, trackColor, textPrimary, textMuted, borderSubtle] =
    useCSSVariable([
      '--color-accent-primary',
      '--color-progress-track',
      '--color-text-primary',
      '--color-text-muted',
      '--color-border-subtle',
    ]) as [string, string, string, string, string];
  const { backColor } = useHeaderActionColors();
  const stageColors = useCSSVariable(
    METABOLIC_STAGES.map((s) => s.colorVar)
  ) as string[];
  const currentStageIndex = getMetabolicStageIndex(timer.stage);
  const stageColor = stageColors[currentStageIndex] ?? accentPrimary;

  const statsDisplay = formatFastingStats(stats, t);

  const header = (
    <View className="flex-row items-center px-4 py-3">
      <Button
        variant="ghost"
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        className="py-0 px-0"
      >
        <Icon name="chevron-back" size={22} color={backColor} />
      </Button>
      <Text className="flex-1 text-center text-lg font-semibold text-text-primary">
        {t('fastingDetail.title', { defaultValue: 'Fasting' })}
      </Text>
      <Button
        variant="ghost"
        onPress={() => navigation.navigate('FastingSettings')}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        className="py-0 px-0"
        accessibilityLabel={t('fastingDetail.settings', {
          defaultValue: 'Fasting settings',
        })}
      >
        <Icon name="settings" size={22} color={backColor} />
      </Button>
    </View>
  );

  const renderStagesList = () => (
    <View className="mt-2">
      <Text className="text-xs font-semibold uppercase text-text-muted tracking-wide mb-3">
        {t('fastingDetail.metabolicStages', {
          defaultValue: 'Metabolic Stages',
        })}
      </Text>
      {METABOLIC_STAGES.map((stage, index) => {
        const color = stageColors[index] ?? accentPrimary;
        const isLast = index === METABOLIC_STAGES.length - 1;
        const completed =
          isFasting &&
          stage.maxHours != null &&
          timer.elapsedHours >= stage.maxHours;
        const current = isFasting && index === currentStageIndex;

        return (
          <View key={stage.key} className="flex-row">
            {/* Indicator column with timeline connector */}
            <View className="items-center mr-3" style={{ width: 24 }}>
              {completed ? (
                <View
                  className="items-center justify-center rounded-full"
                  style={{ width: 20, height: 20, backgroundColor: color }}
                >
                  <Icon
                    name="checkmark"
                    size={12}
                    color="#FFFFFF"
                    weight="bold"
                  />
                </View>
              ) : (
                <View
                  className="rounded-full"
                  style={{
                    width: current ? 16 : 12,
                    height: current ? 16 : 12,
                    backgroundColor: color,
                    marginTop: current ? 12 : 6,
                  }}
                />
              )}
              {!isLast && (
                <View
                  className="flex-1 w-px mt-1"
                  style={{ backgroundColor: borderSubtle }}
                />
              )}
            </View>

            {/* Content */}
            <View
              className={`flex-1 pb-4 ${current ? 'bg-raised rounded-lg px-3 py-2 mb-2' : ''}`}
            >
              <View className="flex-row items-center justify-between">
                <Text
                  className="text-base font-semibold"
                  style={{ color: current ? color : textPrimary }}
                >
                  {localizeFastingStage(t, stage).name}
                </Text>
                <Text className="text-xs text-text-secondary">
                  {localizeFastingStage(t, stage).rangeLabel}
                  {current
                    ? ` · ${t('fastingDetail.now', { defaultValue: 'now' })}`
                    : ''}
                </Text>
              </View>
              <Text className="text-sm text-text-secondary mt-0.5">
                {localizeFastingStage(t, stage).description}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );

  if (isLoading && !currentFast) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        {header}
        <StatusView loading />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {header}

      {/* Segmented Tabs: Fasting & History */}
      <View className="px-4 mb-3">
        <SegmentedControl
          segments={[
            {
              key: 'fasting',
              label: t('fastingDetail.tabs.fasting', {
                defaultValue: 'Fasting',
              }),
            },
            {
              key: 'history',
              label: t('fastingDetail.tabs.history', {
                defaultValue: 'History',
              }),
            },
            {
              key: 'report',
              label: t('fastingDetail.tabs.report', {
                defaultValue: 'Report',
              }),
            },
          ]}
          activeKey={activeTab}
          onSelect={setActiveTab}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 32 + activeWorkoutBarPadding,
        }}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'report' ? (
          <FastingReport />
        ) : activeTab === 'history' ? (
          <View className="pt-2">
            <Text className="text-center text-text-muted text-xs mb-4">
              {t('fastingHistory.hint', {
                defaultValue: 'Tap to edit · swipe left to delete',
              })}
            </Text>

            {isHistoryLoading && pastFasts.length === 0 ? (
              <View className="items-center py-12">
                <ActivityIndicator size="small" color={accentPrimary} />
              </View>
            ) : pastFasts.length === 0 ? (
              <View className="items-center py-12 bg-surface rounded-2xl border border-border-subtle">
                <Icon name="history" size={32} color={textMuted} />
                <Text className="text-sm text-text-muted mt-2">
                  {t('fastingHistory.empty', {
                    defaultValue: 'No past fasts yet.',
                  })}
                </Text>
              </View>
            ) : (
              <View className="bg-surface rounded-2xl border border-border-subtle px-4 overflow-hidden shadow-xs">
                {pastFasts.map((fast, index) => (
                  <FastingHistoryRow
                    key={fast.id}
                    fast={fast}
                    isLast={index === pastFasts.length - 1}
                    onEdit={handleEditPastFast}
                    onDelete={handleDeletePastFast}
                    textMuted={textMuted}
                    t={t}
                  />
                ))}
              </View>
            )}

            {canLoadMoreHistory && (
              <Pressable
                onPress={() => setHistoryLimit((n) => n + 25)}
                className="items-center py-4 mt-2"
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: accentPrimary }}
                >
                  {t('common.loadMore', { defaultValue: 'Load more' })}
                </Text>
              </Pressable>
            )}
          </View>
        ) : isEatingWindow && currentFast ? (
          <>
            {/* Eating Window badge */}
            <View className="items-center mt-2 mb-4">
              <View className="flex-row items-center px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <Text className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  🍽️{' '}
                  {t('fastingDetail.eatingWindowOpen', {
                    defaultValue: 'Eating Window Open',
                  })}
                </Text>
              </View>
            </View>

            {/* Eating Window Hero Card */}
            <View className="items-center justify-center py-6 px-4 bg-surface rounded-2xl border border-border-subtle shadow-sm mb-6">
              <View className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 items-center justify-center mb-4">
                <Text style={{ fontSize: 36 }}>🍽️</Text>
              </View>
              <Text
                className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {timer.remainingLabel ??
                  formatHoursMinutes(
                    (currentFast.eating_window_remaining_minutes ?? 0) * 60000,
                    t
                  )}
              </Text>
              <Text className="text-sm font-medium text-text-secondary mt-1 text-center">
                {t('fastingDetail.remainingInEatingWindow', {
                  defaultValue: 'Remaining in your eating window',
                })}
              </Text>
              <Text className="text-xs text-text-muted mt-2 text-center max-w-xs px-2">
                {t('fastingDetail.eatingWindowHint', {
                  defaultValue:
                    'Fasting will automatically resume after your eating window closes.',
                })}
              </Text>

              {/* Eating Window Color Bands Bar */}
              <View className="w-full mt-5">
                <EatingWindowZoneBar
                  startTime={currentFast.start_time}
                  targetEndTime={
                    currentFast.target_end_time ?? new Date().toISOString()
                  }
                  remainingMinutes={currentFast.eating_window_remaining_minutes}
                />
              </View>

              {/* Start fasting early action */}
              <TouchableOpacity
                onPress={() => protocolSheetRef.current?.present()}
                className="mt-5 flex-row items-center px-4 py-2 rounded-xl bg-raised border border-border-subtle"
                accessibilityRole="button"
                accessibilityLabel={t('fastingDetail.startFastEarly', {
                  defaultValue: 'Start Fasting Now',
                })}
              >
                <Icon
                  name="timer"
                  size={16}
                  color={accentPrimary}
                  style={{ marginRight: 6 }}
                />
                <Text className="text-sm font-semibold text-accent-primary">
                  {t('fastingDetail.startFastEarly', {
                    defaultValue: 'Start Fasting Now',
                  })}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Stats row */}
            <View className="flex-row gap-3 mb-6">
              <FastingStatCard
                label={t('fastingDetail.avgFast', { defaultValue: 'Avg Fast' })}
                value={statsDisplay.avgFastValue}
                unit={statsDisplay.avgFastUnit}
              />
              <FastingStatCard
                label={t('fastingDetail.fasts', { defaultValue: '# Fasts' })}
                value={statsDisplay.fastsCount}
              />
              <FastingStatCard
                label={t('fastingDetail.total', { defaultValue: 'Total' })}
                value={statsDisplay.totalValue}
                unit={statsDisplay.totalUnit}
              />
            </View>

            {/* Detail rows */}
            <View className="bg-surface rounded-xl mb-6 overflow-hidden border border-border-subtle">
              <DetailRow
                label={t('fastingDetail.protocol', {
                  defaultValue: 'Protocol',
                })}
                value={localizeProtocolBadge(t, currentFast.fasting_type)}
              />
              <DetailRow
                label={t('fastingDetail.eatingWindowOpened', {
                  defaultValue: 'Window opened',
                })}
                value={`${formatDateLabel(toLocalDateString(currentFast.start_time), t, dateLocale)}, ${formatTime(
                  currentFast.start_time,
                  preferences?.time_format
                )}`}
              />
              {currentFast.target_end_time && (
                <DetailRow
                  label={t('fastingDetail.eatingWindowCloses', {
                    defaultValue: 'Window closes',
                  })}
                  value={formatTime(
                    currentFast.target_end_time,
                    preferences?.time_format
                  )}
                  isLast
                />
              )}
            </View>

            {renderStagesList()}
          </>
        ) : isFasting && currentFast ? (
          <>
            {/* Protocol pill */}
            <View className="items-center mt-2 mb-4">
              <FastingProtocolBadge protocol={currentFast.fasting_type} />
            </View>

            {/* Ring + centered timer with metabolic stages and ticks */}
            <View className="items-center justify-center mb-6">
              <FastingTimerRing
                progress={timer.progress}
                hhmmss={timer.hhmmss}
                stageName={localizeFastingStage(t, timer.stage).name}
                stageColor={stageColor}
                subtitle={
                  timer.hasGoal
                    ? timer.remainingMs != null && timer.remainingMs > 0
                      ? t('fastingDetail.remaining', {
                          defaultValue: '{{percent}}% · {{time}} left',
                          percent: Math.round(timer.progress * 100),
                          time: timer.remainingLabel,
                        })
                      : t('fastingDetail.goalReached', {
                          defaultValue: 'Goal reached',
                        })
                    : t('fastingDetail.elapsed', {
                        defaultValue: '{{time}} elapsed',
                        time: timer.elapsedLabel,
                      })
                }
                trackColor={trackColor}
                size={RING_SIZE}
              />
            </View>

            {/* Metabolic State Bar */}
            <View className="bg-surface rounded-xl p-4 mb-6 shadow-sm border border-border-subtle">
              <FastingZoneBar
                hoursFasted={timer.elapsedHours}
                startTime={currentFast.start_time}
                targetEndTime={currentFast.target_end_time ?? undefined}
              />
            </View>

            {/* End Fast action button — prominent, styled solid red button */}
            <TouchableOpacity
              onPress={() => endFastSheetRef.current?.present(currentFast)}
              className="w-full flex-row items-center justify-center py-3.5 px-4 bg-red-500 active:bg-red-600 rounded-xl shadow-sm mb-6"
              accessibilityRole="button"
              accessibilityLabel={t('fastingDetail.endFast', {
                defaultValue: 'End Fast',
              })}
            >
              <Icon
                name="stop"
                size={16}
                color="#FFFFFF"
                style={{ marginRight: 8 }}
              />
              <Text className="text-base font-bold text-white">
                {t('fastingDetail.endFast', { defaultValue: 'End Fast' })}
              </Text>
            </TouchableOpacity>

            {/* Stats row */}
            <View className="flex-row gap-3 mb-6">
              <FastingStatCard
                label={t('fastingDetail.avgFast', { defaultValue: 'Avg Fast' })}
                value={statsDisplay.avgFastValue}
                unit={statsDisplay.avgFastUnit}
              />
              <FastingStatCard
                label={t('fastingDetail.fasts', { defaultValue: '# Fasts' })}
                value={statsDisplay.fastsCount}
              />
              <FastingStatCard
                label={t('fastingDetail.total', { defaultValue: 'Total' })}
                value={statsDisplay.totalValue}
                unit={statsDisplay.totalUnit}
              />
            </View>

            {/* Detail rows */}
            <View className="bg-surface rounded-xl mb-6 overflow-hidden border border-border-subtle">
              <DetailRow
                label={t('fastingDetail.protocol', {
                  defaultValue: 'Protocol',
                })}
                value={
                  timer.goalHours != null
                    ? t('fastingDetail.protocolWithGoal', {
                        defaultValue: '{{protocol}} · {{hours}}h fast',
                        protocol: localizeProtocolBadge(
                          t,
                          currentFast.fasting_type
                        ),
                        hours: Math.round(timer.goalHours),
                      })
                    : localizeProtocolBadge(t, currentFast.fasting_type)
                }
              />
              <DetailRow
                label={t('fastingDetail.started', { defaultValue: 'Started' })}
                value={`${formatDateLabel(toLocalDateString(currentFast.start_time), t, dateLocale)}, ${formatTime(
                  currentFast.start_time,
                  preferences?.time_format
                )}`}
              />
              {currentFast.target_end_time && (
                <DetailRow
                  label={t('fastingDetail.goalReached', {
                    defaultValue: 'Goal reached',
                  })}
                  value={formatTime(
                    currentFast.target_end_time,
                    preferences?.time_format
                  )}
                  isLast
                />
              )}
            </View>

            {renderStagesList()}
          </>
        ) : (
          <>
            {/* Idle fallback */}
            <View className="items-center justify-center py-10">
              <View className="h-20 w-20 rounded-full bg-accent-primary/10 items-center justify-center mb-4">
                <Icon name="timer" size={36} color={accentPrimary} />
              </View>
              <Text className="text-lg font-semibold text-text-primary">
                {t('fastingDetail.noActiveFast', {
                  defaultValue: 'No active fast',
                })}
              </Text>
              <Text className="text-sm text-text-muted mt-1 mb-5 text-center px-8">
                {t('fastingDetail.startDescription', {
                  defaultValue:
                    'Start a fast to track your fasting window and metabolic stages.',
                })}
              </Text>
              <Button
                variant="primary"
                onPress={() => protocolSheetRef.current?.present()}
                className="px-8"
              >
                {t('fastingDetail.startFast', { defaultValue: 'Start Fast' })}
              </Button>
            </View>

            {/* Stats row (history is independent of an active fast) */}
            <View className="flex-row gap-3 mb-6">
              <FastingStatCard
                label={t('fastingDetail.avgFast', { defaultValue: 'Avg Fast' })}
                value={statsDisplay.avgFastValue}
                unit={statsDisplay.avgFastUnit}
              />
              <FastingStatCard
                label={t('fastingDetail.fasts', { defaultValue: '# Fasts' })}
                value={statsDisplay.fastsCount}
              />
              <FastingStatCard
                label={t('fastingDetail.total', { defaultValue: 'Total' })}
                value={statsDisplay.totalValue}
                unit={statsDisplay.totalUnit}
              />
            </View>

            {renderStagesList()}
          </>
        )}
      </ScrollView>

      <FastingProtocolSheet ref={protocolSheetRef} />
      <EndFastSheet ref={endFastSheetRef} />
      <FastingEditSheet ref={editSheetRef} />
    </View>
  );
};

export default FastingDetailScreen;
