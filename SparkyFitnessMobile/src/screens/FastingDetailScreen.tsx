import React, { useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import ProgressRing from '../components/ProgressRing';
import FastingProtocolSheet, {
  type FastingProtocolSheetRef,
} from '../components/FastingProtocolSheet';
import EndFastSheet, { type EndFastSheetRef } from '../components/EndFastSheet';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useCurrentFast, useFastingStats } from '../hooks/useFasting';
import { useFastingTimer } from '../hooks/useFastingTimer';
import { formatFastingStats } from '../utils/fasting';
import { formatDateLabel, toLocalDateString } from '../utils/dateUtils';
import {
  METABOLIC_STAGES,
  getMetabolicStageIndex,
  protocolBadgeLabel,
} from '../constants/fasting';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'FastingDetail'>;

const RING_SIZE = 240;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const StatCard: React.FC<{ label: string; value: string; unit?: string }> = ({
  label,
  value,
  unit,
}) => (
  <View className="flex-1 bg-surface rounded-xl p-3 items-center">
    <Text className="text-xs font-semibold uppercase text-text-muted tracking-wide">{label}</Text>
    <View className="flex-row items-baseline mt-1">
      <Text className="text-xl font-bold text-text-primary">{value}</Text>
      {unit ? <Text className="text-sm text-text-muted ml-0.5">{unit}</Text> : null}
    </View>
  </View>
);

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
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const protocolSheetRef = useRef<FastingProtocolSheetRef>(null);
  const endFastSheetRef = useRef<EndFastSheetRef>(null);

  // Read-only here — the dashboard `FastingCard` is the single owner of
  // goal-notification reconciliation.
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
        <Icon name="chevron-back" size={22} color={accentPrimary} />
      </Button>
      <Text className="flex-1 text-center text-lg font-semibold text-text-primary">Fasting</Text>
      {/* Spacer to balance the back button so the title stays centered. */}
      <View style={{ width: 22 }} />
    </View>
  );

  const renderStagesList = () => (
    <View className="mt-2">
      <Text className="text-xs font-semibold uppercase text-text-muted tracking-wide mb-3">
        Metabolic Stages
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
                  {current ? ' · now' : ''}
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
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={accentPrimary} />
        </View>
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
              <View className="bg-accent-primary/10 rounded-full px-4 py-1.5">
                <Text className="text-sm font-semibold text-accent-primary">
                  {protocolBadgeLabel(currentFast.fasting_type)} protocol
                </Text>
              </View>
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
                      ? `${Math.round(timer.progress * 100)}% · ${timer.remainingLabel} left`
                      : 'Goal reached'}
                  </Text>
                ) : (
                  <Text className="text-sm text-text-muted mt-1">{timer.elapsedLabel} elapsed</Text>
                )}
              </View>
            </View>

            {/* Stats row */}
            <View className="flex-row gap-3 mb-6">
              <StatCard label="Avg Fast" value={statsDisplay.avgFastValue} unit={statsDisplay.avgFastUnit} />
              <StatCard label="# Fasts" value={statsDisplay.fastsCount} />
              <StatCard label="Total" value={statsDisplay.totalValue} unit={statsDisplay.totalUnit} />
            </View>

            {/* Detail rows + End Fast action */}
            <View className="bg-surface rounded-xl mb-6 overflow-hidden">
              <DetailRow
                label="Protocol"
                value={
                  timer.goalHours != null
                    ? `${protocolBadgeLabel(currentFast.fasting_type)} · ${Math.round(timer.goalHours)}h fast`
                    : protocolBadgeLabel(currentFast.fasting_type)
                }
              />
              <DetailRow
                label="Started"
                value={`${formatDateLabel(toLocalDateString(currentFast.start_time))}, ${formatTime(
                  currentFast.start_time,
                )}`}
              />
              {currentFast.target_end_time && (
                <DetailRow
                  label="Goal reached"
                  value={formatTime(currentFast.target_end_time)}
                />
              )}

              {/* End Fast — taller + centered danger text so it reads as an action, not a row */}
              <Pressable
                onPress={() => endFastSheetRef.current?.present(currentFast)}
                className="items-center justify-center py-5"
                style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
                accessibilityRole="button"
                accessibilityLabel="End fast"
              >
                <Text className="text-base font-semibold text-bg-danger">End Fast</Text>
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
              <Text className="text-lg font-semibold text-text-primary">No active fast</Text>
              <Text className="text-sm text-text-muted mt-1 mb-5 text-center px-8">
                Start a fast to track your fasting window and metabolic stages.
              </Text>
              <Button
                variant="primary"
                onPress={() => protocolSheetRef.current?.present()}
                className="px-8"
              >
                Start Fast
              </Button>
            </View>

            {/* Stats row (history is independent of an active fast) */}
            <View className="flex-row gap-3 mb-6">
              <StatCard label="Avg Fast" value={statsDisplay.avgFastValue} unit={statsDisplay.avgFastUnit} />
              <StatCard label="# Fasts" value={statsDisplay.fastsCount} />
              <StatCard label="Total" value={statsDisplay.totalValue} unit={statsDisplay.totalUnit} />
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
