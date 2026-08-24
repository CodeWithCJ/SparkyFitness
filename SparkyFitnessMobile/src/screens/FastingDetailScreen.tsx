import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import ProgressRing from '../components/ProgressRing';
import StatusView from '../components/StatusView';
import FastingProtocolSheet, {
  type FastingProtocolSheetRef,
} from '../components/FastingProtocolSheet';
import EndFastSheet, { type EndFastSheetRef } from '../components/EndFastSheet';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useCurrentFast, useFastingStats } from '../hooks/useFasting';
import { useFastingTimer } from '../hooks/useFastingTimer';
import { useHeaderActionColors } from '../hooks/useHeaderActionColors';
import { formatFastingStats, formatTime } from '../utils/fasting';
import { formatDateLabel, toLocalDateString } from '../utils/dateUtils';
import {
  METABOLIC_STAGES,
  getMetabolicStageIndex,
} from '../constants/fasting';
import { FastingStatCard, FastingProtocolBadge } from '../components/FastingSharedComponents';
import type { RootStackScreenProps } from '../types/navigation';
import { localizeFastingStage, localizeProtocolBadge } from '../utils/fastingLocalization';

type Props = RootStackScreenProps<'FastingDetail'>;

const RING_SIZE = 240;

const DetailRow: React.FC<{ label: string; value: string; isLast?: boolean }> = ({
  label,
  value,
  isLast,
}) => (
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
  const { t , i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const protocolSheetRef = useRef<FastingProtocolSheetRef>(null);
  const endFastSheetRef = useRef<EndFastSheetRef>(null);

  // Read-only here — the dashboard `FastingGoalReconciler` is the single owner
  // of goal-notification reconciliation.
  const { data: currentFast, isLoading } = useCurrentFast();
  const { data: stats } = useFastingStats();

  const isActive = !!currentFast && currentFast.status === 'ACTIVE';
  const timer = useFastingTimer(
    currentFast?.start_time,
    currentFast?.target_end_time,
    isActive,
  );

  const [accentPrimary, trackColor, textPrimary, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-progress-track',
    '--color-text-primary',
    '--color-border-subtle',
  ]) as [string, string, string, string];
  const { backColor } = useHeaderActionColors();
  const stageColors = useCSSVariable(METABOLIC_STAGES.map((s) => s.colorVar)) as string[];
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
      <Text className="flex-1 text-center text-lg font-semibold text-text-primary">{t('fastingDetail.title', { defaultValue: 'Fasting' })}</Text>
      {/* Spacer to balance the back button so the title stays centered. */}
      <View style={{ width: 22 }} />
    </View>
  );

  const renderStagesList = () => (
    <View className="mt-2">
      <Text className="text-xs font-semibold uppercase text-text-muted tracking-wide mb-3">
        {t('fastingDetail.metabolicStages', { defaultValue: 'Metabolic Stages' })}
      </Text>
      {METABOLIC_STAGES.map((stage, index) => {
        const color = stageColors[index] ?? accentPrimary;
        const isLast = index === METABOLIC_STAGES.length - 1;
        const completed =
          isActive && stage.maxHours != null && timer.elapsedHours >= stage.maxHours;
        const current = isActive && index === currentStageIndex;

        return (
          <View key={stage.key} className="flex-row">
            {/* Indicator column with timeline connector */}
            <View className="items-center mr-3" style={{ width: 24 }}>
              {completed ? (
                <View
                  className="items-center justify-center rounded-full"
                  style={{ width: 20, height: 20, backgroundColor: color }}
                >
                  <Icon name="checkmark" size={12} color="#FFFFFF" weight="bold" />
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
              {!isLast && <View className="flex-1 w-px mt-1" style={{ backgroundColor: borderSubtle }} />}
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
                  {current ? ` · ${t('fastingDetail.now', { defaultValue: 'now' })}` : ''}
                </Text>
              </View>
              <Text className="text-sm text-text-secondary mt-0.5">{localizeFastingStage(t, stage).description}</Text>
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

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 32 + activeWorkoutBarPadding,
        }}
        showsVerticalScrollIndicator={false}
      >
        {isActive && currentFast ? (
          <>
            {/* Protocol pill */}
            <View className="items-center mt-2 mb-4">
              <FastingProtocolBadge protocol={currentFast.fasting_type} />
            </View>

            {/* Ring + centered timer */}
            <View className="items-center justify-center mb-6">
              <ProgressRing
                progress={timer.progress}
                size={RING_SIZE}
                strokeWidth={16}
                color={accentPrimary}
                backgroundColor={trackColor}
              />
              <View className="absolute items-center justify-center">
                <Text
                  className="text-sm font-bold uppercase tracking-wide"
                  style={{ color: stageColor }}
                >
                  {localizeFastingStage(t, timer.stage).name}
                </Text>
                <Text
                  className="text-4xl font-bold text-text-primary mt-1"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {timer.hhmmss}
                </Text>
                {timer.hasGoal ? (
                  <Text className="text-sm text-text-muted mt-1">
                    {timer.remainingMs != null && timer.remainingMs > 0
                      ? t('fastingDetail.remaining', { defaultValue: '{{percent}}% · {{time}} left', percent: Math.round(timer.progress * 100), time: timer.remainingLabel })
                      : t('fastingDetail.goalReached', { defaultValue: 'Goal reached' })}
                  </Text>
                ) : (
                  <Text className="text-sm text-text-muted mt-1">{t('fastingDetail.elapsed', { defaultValue: '{{time}} elapsed', time: timer.elapsedLabel })}</Text>
                )}
              </View>
            </View>

            {/* Stats row */}
            <View className="flex-row gap-3 mb-6">
              <FastingStatCard label={t('fastingDetail.avgFast', { defaultValue: 'Avg Fast' })} value={statsDisplay.avgFastValue} unit={statsDisplay.avgFastUnit} />
              <FastingStatCard label={t('fastingDetail.fasts', { defaultValue: '# Fasts' })} value={statsDisplay.fastsCount} />
              <FastingStatCard label={t('fastingDetail.total', { defaultValue: 'Total' })} value={statsDisplay.totalValue} unit={statsDisplay.totalUnit} />
            </View>

            {/* Detail rows + End Fast action */}
            <View className="bg-surface rounded-xl mb-6 overflow-hidden">
              <DetailRow
                label={t('fastingDetail.protocol', { defaultValue: 'Protocol' })}
                value={
                  timer.goalHours != null
                    ? t('fastingDetail.protocolWithGoal', { defaultValue: '{{protocol}} · {{hours}}h fast', protocol: localizeProtocolBadge(t, currentFast.fasting_type), hours: Math.round(timer.goalHours) })
                    : localizeProtocolBadge(t, currentFast.fasting_type)
                }
              />
              <DetailRow
                label={t('fastingDetail.started', { defaultValue: 'Started' })}
                value={`${formatDateLabel(toLocalDateString(currentFast.start_time), t, dateLocale)}, ${formatTime(
                  currentFast.start_time,
                )}`}
              />
              {currentFast.target_end_time && (
                <DetailRow
                  label={t('fastingDetail.goalReached', { defaultValue: 'Goal reached' })}
                  value={formatTime(currentFast.target_end_time)}
                />
              )}

              {/* End Fast — taller + centered danger text so it reads as an action, not a row */}
              <Pressable
                onPress={() => endFastSheetRef.current?.present(currentFast)}
                className="items-center justify-center py-5"
                style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
                accessibilityRole="button"
                accessibilityLabel={t('fastingDetail.endFast', { defaultValue: "End Fast" })}
              >
                <Text className="text-base font-semibold text-icon-danger">{t('fastingDetail.endFast', { defaultValue: 'End Fast' })}</Text>
              </Pressable>
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
              <Text className="text-lg font-semibold text-text-primary">{t('fastingDetail.noActiveFast', { defaultValue: 'No active fast' })}</Text>
              <Text className="text-sm text-text-muted mt-1 mb-5 text-center px-8">
                {t('fastingDetail.startDescription', { defaultValue: 'Start a fast to track your fasting window and metabolic stages.' })}
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
              <FastingStatCard label={t('fastingDetail.avgFast', { defaultValue: 'Avg Fast' })} value={statsDisplay.avgFastValue} unit={statsDisplay.avgFastUnit} />
              <FastingStatCard label={t('fastingDetail.fasts', { defaultValue: '# Fasts' })} value={statsDisplay.fastsCount} />
              <FastingStatCard label={t('fastingDetail.total', { defaultValue: 'Total' })} value={statsDisplay.totalValue} unit={statsDisplay.totalUnit} />
            </View>

            {renderStagesList()}
          </>
        )}
      </ScrollView>

      <FastingProtocolSheet ref={protocolSheetRef} />
      <EndFastSheet ref={endFastSheetRef} />
    </View>
  );
};

export default FastingDetailScreen;
