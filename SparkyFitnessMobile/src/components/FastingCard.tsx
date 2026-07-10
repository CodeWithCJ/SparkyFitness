import React, { useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import Icon from './Icon';
import FastingProtocolSheet, {
  type FastingProtocolSheetRef,
} from './FastingProtocolSheet';
import { useCurrentFast, useFastingHistory } from '../hooks/useFasting';
import { useFastingTimer } from '../hooks/useFastingTimer';
import { formatLastFast } from '../utils/fasting';
import {
  FASTING_PRESETS,
  DEFAULT_PRESET_ID,
  METABOLIC_STAGES,
  getMetabolicStageIndex,
  protocolBadgeLabel,
} from '../constants/fasting';
import type { RootStackParamList, TabParamList } from '../types/navigation';
import {
  formatMobileDuration,
  formatMobileNumber,
  isMobileRtl,
  mobileT,
} from '../localization';

type FastingCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface FastingCardProps {
  navigation: FastingCardNavigation;
}

function presetIdForType(type: string | null | undefined): string {
  if (!type) return DEFAULT_PRESET_ID;
  const match = FASTING_PRESETS.find(p => p.name === type);
  return match?.id ?? DEFAULT_PRESET_ID;
}

const FastingCard: React.FC<FastingCardProps> = ({ navigation }) => {
  const protocolSheetRef = useRef<FastingProtocolSheetRef>(null);

  // Read-only here — goal-notification reconciliation is owned by the
  // always-mounted `FastingGoalReconciler` so it keeps running when this card is
  // hidden via the dashboard visibility setting.
  const { data: currentFast, isLoading } = useCurrentFast();
  const { data: history } = useFastingHistory(1);

  const isActive = !!currentFast && currentFast.status === 'ACTIVE';
  const timer = useFastingTimer(
    currentFast?.start_time,
    currentFast?.target_end_time,
    isActive,
  );

  const [accentPrimary, trackColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-progress-track',
  ]) as [string, string];
  const stageColors = useCSSVariable(
    METABOLIC_STAGES.map(s => s.colorVar),
  ) as string[];
  const stageColor =
    stageColors[getMetabolicStageIndex(timer.stage)] ?? accentPrimary;
  const progressPercentage = formatMobileNumber(
    Math.round(timer.progress * 100),
    {
      maximumFractionDigits: 0,
    },
  );

  const openProtocolSheet = () => {
    protocolSheetRef.current?.present(
      presetIdForType(history?.[0]?.fasting_type),
    );
  };

  // Loading placeholder (current-fast query still resolving).
  if (isLoading && !currentFast) {
    return (
      <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
        <View className="flex-row items-center justify-between">
          <Text className="text-md font-bold text-text-secondary">
            {mobileT('fasting.title')}
          </Text>
          <ActivityIndicator size="small" color={accentPrimary} />
        </View>
      </View>
    );
  }

  // ----- Active state -----
  if (isActive && currentFast) {
    const badge = protocolBadgeLabel(currentFast.fasting_type);
    return (
      <>
        <Pressable
          className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
          onPress={() => navigation.navigate('FastingDetail')}
          accessibilityRole="button"
          accessibilityLabel={mobileT('fasting.openDetails')}
        >
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-md font-bold text-text-secondary">
              {mobileT('fasting.title')}
            </Text>
            <View className="flex-row items-center">
              <Text className="text-md text-accent-primary font-medium">
                {mobileT('fasting.viewDetails')}
              </Text>
              <Icon
                name={isMobileRtl ? 'chevron-back' : 'chevron-forward'}
                size={14}
                color={accentPrimary}
                style={{ marginStart: 2 }}
              />
            </View>
          </View>

          <View className="flex-row items-end justify-between">
            <Text
              className="text-4xl font-bold text-text-primary"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {timer.hhmmss}
            </Text>
            <Text
              className="text-base font-semibold mb-1"
              style={{ color: stageColor }}
            >
              {timer.stage.name}
            </Text>
          </View>

          {timer.hasGoal && timer.goalHours != null ? (
            <>
              <View className="flex-row items-center justify-between mt-1">
                <Text className="text-sm text-text-secondary">
                  {timer.remainingMs != null && timer.remainingMs > 0
                    ? mobileT('fasting.goalRemaining', {
                        remaining: timer.remainingLabel ?? '',
                        hours: formatMobileDuration(
                          Math.round(timer.goalHours * 60),
                        ),
                      })
                    : mobileT('fasting.goalReached', {
                        hours: formatMobileDuration(
                          Math.round(timer.goalHours * 60),
                        ),
                      })}
                </Text>
                <Text className="text-sm font-semibold text-text-secondary">
                  {badge}
                </Text>
              </View>

              {/* Linear progress bar */}
              <View
                className="h-2 rounded-full mt-3 overflow-hidden"
                style={{ backgroundColor: trackColor }}
              >
                <View
                  className="h-2 rounded-full"
                  style={{
                    alignSelf: isMobileRtl ? 'flex-end' : 'flex-start',
                    width: `${timer.progress * 100}%`,
                    backgroundColor: accentPrimary,
                  }}
                />
              </View>
              <View className="flex-row justify-between mt-1">
                <Text className="text-xs text-text-muted">
                  {formatMobileNumber(0)} س
                </Text>
                <Text className="text-xs text-text-muted">
                  {progressPercentage}٪
                </Text>
                <Text className="text-xs text-text-muted">
                  {formatMobileNumber(Math.round(timer.goalHours))} س
                </Text>
              </View>
            </>
          ) : (
            <View className="flex-row items-center justify-between mt-1">
              <Text className="text-sm text-text-secondary">
                {mobileT('fasting.elapsed', { elapsed: timer.elapsedLabel })}
              </Text>
              <Text className="text-sm font-semibold text-text-secondary">
                {badge}
              </Text>
            </View>
          )}
        </Pressable>

        <FastingProtocolSheet ref={protocolSheetRef} />
      </>
    );
  }

  // ----- Idle state -----
  const lastFastLine = formatLastFast(history?.[0]);

  return (
    <>
      <Pressable
        className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
        onPress={openProtocolSheet}
        accessibilityRole="button"
        accessibilityLabel={mobileT('fasting.startAccessibility')}
      >
        <View className="mb-2">
          <Text className="text-md font-bold text-text-secondary">
            {mobileT('fasting.title')}
          </Text>
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-1" style={{ paddingEnd: 12 }}>
            <Text className="text-base font-semibold text-text-primary">
              {mobileT('fasting.ready')}
            </Text>
            {lastFastLine && (
              <Text className="text-sm text-text-muted mt-0.5">
                {lastFastLine}
              </Text>
            )}
          </View>
          <View className="flex-row items-center">
            <Text className="text-base text-accent-primary font-semibold">
              {mobileT('fasting.startFast')}
            </Text>
            <Icon
              name={isMobileRtl ? 'chevron-back' : 'chevron-forward'}
              size={16}
              color={accentPrimary}
              style={{ marginStart: 2 }}
            />
          </View>
        </View>
      </Pressable>

      <FastingProtocolSheet ref={protocolSheetRef} />
    </>
  );
};

export default FastingCard;
