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
import { getAppLocale } from '../localization';
import { formatFastingStats } from '../utils/fasting';
import { formatDateLabel, toLocalDateString } from '../utils/dateUtils';
import {
  METABOLIC_STAGES,
  getMetabolicStageIndex,
  protocolBadgeLabel,
} from '../constants/fasting';
import { FastingStatCard, FastingProtocolBadge } from '../components/FastingSharedComponents';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'FastingDetail'>;

const RING_SIZE = 240;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(getAppLocale(), { hour: 'numeric', minute: '2-digit' });
}

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
  const { t } = useTranslation();
  const copy = (key: string, options?: Record<string, string | number>) => {
    switch (key) {
      case 'title': return t('screenCopy.fastingDetail.title', { ...options, defaultValue: 'Fasting' });
      case 'stages': return t('screenCopy.fastingDetail.stages', { ...options, defaultValue: 'Metabolic Stages' });
      case 'now': return t('screenCopy.fastingDetail.now', { ...options, defaultValue: 'now' });
      case 'goalReached': return t('screenCopy.fastingDetail.goalReached', { ...options, defaultValue: 'Goal reached' });
      case 'elapsed': return t('screenCopy.fastingDetail.elapsed', { ...options, defaultValue: 'elapsed' });
      case 'avg': return t('screenCopy.fastingDetail.avg', { ...options, defaultValue: 'Avg Fast' });
      case 'fasts': return t('screenCopy.fastingDetail.fasts', { ...options, defaultValue: '# Fasts' });
      case 'total': return t('screenCopy.fastingDetail.total', { ...options, defaultValue: 'Total' });
      case 'protocol': return t('screenCopy.fastingDetail.protocol', { ...options, defaultValue: 'Protocol' });
      case 'started': return t('screenCopy.fastingDetail.started', { ...options, defaultValue: 'Started' });
      case 'goal': return t('screenCopy.fastingDetail.goal', { ...options, defaultValue: 'Goal reached' });
      case 'end': return t('screenCopy.fastingDetail.end', { ...options, defaultValue: 'End Fast' });
      case 'endAccessibility': return t('screenCopy.fastingDetail.endAccessibility', { ...options, defaultValue: 'End fast' });
      case 'none': return t('screenCopy.fastingDetail.none', { ...options, defaultValue: 'No active fast' });
      case 'noneDescription': return t('screenCopy.fastingDetail.noneDescription', { ...options, defaultValue: 'Start a fast to track your fasting window and metabolic stages.' });
      case 'start': return t('screenCopy.fastingDetail.start', { ...options, defaultValue: 'Start Fast' });
      case 'hoursFast': return t('screenCopy.fastingDetail.hoursFast', { ...options, defaultValue: '{{hours}}h fast' });
      case 'remaining': return t('screenCopy.fastingDetail.remaining', { ...options, defaultValue: '{{percent}}% · {{label}} left' });
      default: return key;
    }
  };
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

  const statsDisplay = formatFastingStats(stats);

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
      <Text className="flex-1 text-center text-lg font-semibold text-text-primary">{copy('title')}</Text>
      {/* Spacer to balance the back button so the title stays centered. */}
      <View style={{ width: 22 }} />
    </View>
  );

  const renderStagesList = () => (
    <View className="mt-2">
      <Text className="text-xs font-semibold uppercase text-text-muted tracking-wide mb-3">
         {copy('stages')}
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
                  {stage.name}
                </Text>
                <Text className="text-xs text-text-secondary">
                  {stage.rangeLabel}
                   {current ? ` · ${copy('now')}` : ''}
                </Text>
              </View>
              <Text className="text-sm text-text-secondary mt-0.5">{stage.description}</Text>
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
                  {timer.stage.name}
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
                       ? copy('remaining', { percent: Math.round(timer.progress * 100), label: timer.remainingLabel ?? '' })
                       : copy('goalReached')}
                  </Text>
                ) : (
                   <Text className="text-sm text-text-muted mt-1">{timer.elapsedLabel} {copy('elapsed')}</Text>
                )}
              </View>
            </View>

            {/* Stats row */}
            <View className="flex-row gap-3 mb-6">
               <FastingStatCard label={copy('avg')} value={statsDisplay.avgFastValue} unit={statsDisplay.avgFastUnit} />
               <FastingStatCard label={copy('fasts')} value={statsDisplay.fastsCount} />
               <FastingStatCard label={copy('total')} value={statsDisplay.totalValue} unit={statsDisplay.totalUnit} />
            </View>

            {/* Detail rows + End Fast action */}
            <View className="bg-surface rounded-xl mb-6 overflow-hidden">
              <DetailRow
                 label={copy('protocol')}
                value={
                  timer.goalHours != null
                     ? `${protocolBadgeLabel(currentFast.fasting_type)} · ${copy('hoursFast', { hours: Math.round(timer.goalHours) })}`
                    : protocolBadgeLabel(currentFast.fasting_type)
                }
              />
              <DetailRow
                 label={copy('started')}
                value={`${formatDateLabel(toLocalDateString(currentFast.start_time))}, ${formatTime(
                  currentFast.start_time,
                )}`}
              />
              {currentFast.target_end_time && (
                <DetailRow
                   label={copy('goal')}
                  value={formatTime(currentFast.target_end_time)}
                />
              )}

              {/* End Fast — taller + centered danger text so it reads as an action, not a row */}
              <Pressable
                onPress={() => endFastSheetRef.current?.present(currentFast)}
                className="items-center justify-center py-5"
                style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
                accessibilityRole="button"
                 accessibilityLabel={copy('endAccessibility')}
              >
                <Text className="text-base font-semibold text-icon-danger">{copy('end')}</Text>
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
               <Text className="text-lg font-semibold text-text-primary">{copy('none')}</Text>
              <Text className="text-sm text-text-muted mt-1 mb-5 text-center px-8">
                 {copy('noneDescription')}
              </Text>
              <Button
                variant="primary"
                onPress={() => protocolSheetRef.current?.present()}
                className="px-8"
              >
                 {copy('start')}
              </Button>
            </View>

            {/* Stats row (history is independent of an active fast) */}
            <View className="flex-row gap-3 mb-6">
               <FastingStatCard label={copy('avg')} value={statsDisplay.avgFastValue} unit={statsDisplay.avgFastUnit} />
               <FastingStatCard label={copy('fasts')} value={statsDisplay.fastsCount} />
               <FastingStatCard label={copy('total')} value={statsDisplay.totalValue} unit={statsDisplay.totalUnit} />
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
